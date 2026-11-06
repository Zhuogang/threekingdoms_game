import { DEPLOY_SHU, DEPLOY_WEI, sameCell } from '../content/chencang';
import { swapTargets } from '../rules/movement';
import { gateAt } from '../rules/map';
import type { SiegePosition, SiegeSide, SiegeState } from '../rules/types';
import { engineFootprint, engineSprite } from '../render/stateArt';
import { compareDepth } from '../render/scene';
import { actorTargets } from './commands';

export interface MapClickContext {
  state: SiegeState;
  selected?: string | null;
  playerSide?: SiegeSide;
  mode?: 'move' | 'fillTrench' | 'attack' | null;
  reachable?: readonly SiegePosition[];
  blocked?: boolean;
  deploy?: boolean;
  /** Nameplate under the cursor, supplied by the view. Figures never intercept cells. */
  plateUnitId?: string | null;
}
export type MapClickResult =
  | { type: 'select' | 'target' | 'swap'; id: string }
  | { type: 'move' | 'fillTrench' | 'deploy' | 'cell'; cell: SiegePosition }
  | { type: 'none' };

/** Plates select directly; armed actions resolve against the plate owner's cell. */
export function resolveMapClick(
  {
    state,
    selected,
    playerSide = 'shu',
    mode,
    reachable = [],
    blocked,
    deploy,
    plateUnitId,
  }: MapClickContext,
  cell: SiegePosition | null,
): MapClickResult {
  const none: MapClickResult = { type: 'none' };
  if (blocked) return none;
  const plate = state.units.find((u) => u.id === plateUnitId && u.troops > 0);
  if (plate) {
    if (!mode && (plate.side === playerSide || !selected)) return { type: 'select', id: plate.id };
    cell = { x: plate.x, y: plate.y, level: plate.level };
  }
  if (!cell) return none;
  const at = (p: SiegePosition) => sameCell(p, cell) && p.level === cell.level;
  const standing = state.units.filter((u) => u.troops > 0 && at(u));
  if (deploy) {
    // As before: own units swap when another actor is selected; otherwise select.
    const unit = standing[0];
    if (unit) {
      if (unit.side === playerSide && selected && unit.id !== selected)
        return { type: 'deploy', cell: unit };
      return { type: 'select', id: unit.id };
    }
    if ((playerSide === 'shu' ? DEPLOY_SHU : DEPLOY_WEI).some(at)) return { type: 'deploy', cell };
  }
  const engines = state.engines
    .filter(
      (e) =>
        engineFootprint(e).some(at) &&
        (!e.wrecked ||
          (!standing.length &&
            !state.engines.some(
              (other) => other.id !== e.id && !other.wrecked && sameCell(other, e),
            ))),
    )
    .sort((a, b) => {
      const depth = (e: typeof a) => {
        const sprite = engineSprite(e);
        return { row: sprite.cells[3], height: sprite.height };
      };
      // Later state entries paint last at equal depth.
      return (
        compareDepth(depth(b), depth(a)) || state.engines.indexOf(b) - state.engines.indexOf(a)
      );
    });
  if (deploy) return engines[0] ? { type: 'select', id: engines[0].id } : { type: 'cell', cell };
  const units = standing;
  const ownActor =
    state.units.some((u) => u.id === selected && u.side === playerSide && u.troops > 0) ||
    (playerSide === 'shu' && state.engines.some((e) => e.id === selected));
  const enemy = units.find((u) => u.side !== playerSide);
  const gate = gateAt(cell.x, cell.y);
  if (mode === 'attack' && ownActor && (enemy || (gate && playerSide === 'shu')))
    return { type: 'target', id: enemy?.id ?? gate! };
  const swap = mode === 'move' && selected ? swapTargets(state, selected).find(at) : undefined;
  if (ownActor && swap) return { type: 'swap', id: swap.id };
  const green = ownActor && reachable.some(at);
  if (green && (mode === 'move' || mode === 'fillTrench')) return { type: mode, cell };
  if (ownActor && !mode) {
    const target = actorTargets(state, selected!, playerSide).find(
      (t) =>
        (t.id === gate && cell.level === 'ground') ||
        units.some((u) => u.id === t.id) ||
        engines.some((e) => e.id === t.id),
    );
    if (target) return { type: 'target', id: target.id };
  }
  if (enemy) return { type: ownActor ? 'target' : 'select', id: enemy.id };
  const cycle = (occupants: string[]) =>
    occupants.length > 1
      ? {
          type: 'select' as const,
          id: occupants[(occupants.indexOf(selected!) + 1) % occupants.length]!,
        }
      : none;
  const unitIds = units.map((u) => u.id);
  const own = units.find((u) => u.side === playerSide);
  // A selected unit only cycles to what shares its own cell: a cart's rear drawn
  // over a neighbour is not a stack, and a double-click must not select the cart.
  if (units.some((u) => u.side === playerSide && u.id === selected))
    return cycle([
      ...unitIds,
      ...state.engines
        .filter((e) => !e.wrecked && units.some((u) => u.level === 'ground' && sameCell(e, u)))
        .map((e) => e.id),
    ]);
  if (own) return { type: 'select', id: own.id };
  if (green) {
    const ladder = engines.find((e) => e.kind === 'ladder' && !e.raisedAt && sameCell(e, cell));
    if (ladder) return { type: 'select', id: ladder.id };
    return { type: 'move', cell };
  }
  if (engines.length) {
    if (engines.some((e) => e.id === selected))
      return cycle([...unitIds, ...engines.map((e) => e.id)]);
    return { type: 'select', id: engines[0]!.id };
  }
  return { type: 'cell', cell };
}

/** Terrain-card fallback is deliberately neutral: it has no action outline. */
export function mapClickColor(result: MapClickResult): string | null {
  switch (result.type) {
    case 'move':
    case 'fillTrench':
    case 'deploy':
      return '#609d80';
    case 'target':
      return '#b74e3c';
    case 'swap':
      return '#518bc4';
    case 'select':
      return '#e7b84e';
    default:
      return null;
  }
}
