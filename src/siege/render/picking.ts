import { sameCell } from '../content/chencang';
import { cellHeight, cellTerrain, isMapCell } from '../rules/map';
import type { SiegePosition, SiegeSide, SiegeState } from '../rules/types';
import { FRAME } from './assets';
import { pickCandidates, project } from './scene';

/** Shared by pointer clicks and hover; the resolver still decides the action. */
export function pickMapPosition(
  state: SiegeState,
  sx: number,
  sy: number,
  selected?: string | null,
  reachable: readonly SiegePosition[] = [],
  playerSide: SiegeSide = 'shu',
  preferGreen = false,
): SiegePosition | null {
  const levelAt = (x: number, y: number) =>
    ['wall', 'gate'].includes(cellTerrain(state, x, y)) ? 'wall' : 'ground';
  const candidates = pickCandidates(
    FRAME,
    sx,
    sy,
    [0, 1, 2, 3],
    (x, y, h) => isMapCell(x, y) && h === cellHeight(state, x, y, levelAt(x, y)),
  ).map(({ x, y }): SiegePosition => ({ x, y, level: levelAt(x, y) }));
  const at = (a: SiegePosition, b: SiegePosition) => sameCell(a, b) && a.level === b.level;
  const ownActor =
    state.units.some((u) => u.id === selected && u.troops > 0 && u.side === playerSide) ||
    (playerSide === 'shu' && state.engines.some((e) => e.id === selected));
  // Two green planes can overlap (notably the ramp at 20,15 and the wall
  // at 20,16). Prefer the green cell whose projected centre is nearest, so
  // the exact centre of either highlighted rect always chooses that rect.
  const green = ownActor ? candidates.filter((c) => reachable.some((r) => at(c, r))) : [];
  const distance = (c: SiegePosition) =>
    Math.abs(sy - project(FRAME, c.x + 0.5, c.y + 0.5, cellHeight(state, c.x, c.y, c.level))[1]);
  green.sort((a, b) => distance(a) - distance(b));
  const occupied = candidates.find((c) => state.units.some((u) => u.troops > 0 && at(c, u)));
  // A unit on the wall overlaps the green ground behind it on screen. Only an explicit
  // Move or Fill may walk there; otherwise a click on a visible unit must select it.
  return (preferGreen ? (green[0] ?? occupied) : (occupied ?? green[0])) ?? candidates[0] ?? null;
}
