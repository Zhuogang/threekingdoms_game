export { positionAt as pickMapPosition } from './boardGeometry';

import { sameCell } from '../content/chencang';
import { usableEngine } from '../rules/combat';
import { gateAt } from '../rules/map';
import type { SiegePosition, SiegeUnit } from '../rules/types';
import type { MapClickContext } from '../ui/mapClick';
import { actorTargets } from '../ui/commands';
import { contains, positionAt } from './boardGeometry';
import { compareDepth, type ScreenRect } from './scene';
import type { EngineSprite, unitVisual } from './stateArt';
import type { targetIconRects } from './TargetIcons';

export interface ArtPick {
  pickedUnitId?: string;
  pickedEngineId?: string;
}

/** The same ordered hit used for mouse clicks, hover outlines, text and cursors. */
export function pickMapHit(
  context: MapClickContext,
  point: { x: number; y: number },
  units: readonly { unit: SiegeUnit; visual: ReturnType<typeof unitVisual> }[],
  engines: readonly EngineSprite[],
  plates: ReadonlyMap<string, ScreenRect>,
  icons: ReturnType<typeof targetIconRects> = [],
): ArtPick & {
  cell: SiegePosition | null;
  actorTarget?: ReturnType<typeof targetIconRects>[number]['target'];
} {
  const icon = icons.find(({ rect }) => contains(rect, point.x, point.y));
  if (icon) return { cell: icon.position, actorTarget: icon.target };
  const cell = positionAt(context.state, point.x, point.y);
  const pickedUnitId = [...units].reverse().find(({ unit }) => {
    const rect = plates.get(unit.id);
    return rect && contains(rect, point.x, point.y);
  })?.unit.id;
  return {
    cell,
    ...(pickedUnitId ? { pickedUnitId } : pickFigureArt(context, point, cell, units, engines)),
  };
}

/** Called after target icons and plates, before ordinary cell resolution. Pure. */
export function pickFigureArt(
  { state, selected, playerSide = 'shu', mode, deploy, reachable = [] }: MapClickContext,
  point: { x: number; y: number },
  cell: SiegePosition | null,
  units: readonly { unit: SiegeUnit; visual: ReturnType<typeof unitVisual> }[],
  engines: readonly EngineSprite[],
): ArtPick {
  if (mode != null || deploy) return {};
  const at = (p: SiegePosition) => cell && sameCell(p, cell) && p.level === cell.level;
  if (reachable.some(at)) return {};
  const figures = [...units]
    .filter(({ unit }) => unit.troops > 0)
    .sort((a, b) => compareDepth(a.visual.depth, b.visual.depth))
    .reverse();
  const inside = ({ visual }: (typeof figures)[number]) =>
    visual.figureRects.some((rect) => contains(rect, point.x, point.y));
  // (a) The underlying occupant owns its own figure before displaced art.
  if (figures.some((figure) => at(figure.unit) && inside(figure))) return {};
  // (b) Displaced figures beat an occupied cell outside its occupant's boxes.
  const displaced = figures.find((figure) => figure.visual.displaced && inside(figure));
  if (displaced) return { pickedUnitId: displaced.unit.id };
  // (c) A living occupant still owns the rest of its cell before ordinary art.
  if (state.units.some((u) => u.troops > 0 && at(u))) return {};
  // (d) Ordinary figures own their boxes, frontmost first (paint order on ties).
  const ordinary = figures.find(inside);
  if (ordinary) return { pickedUnitId: ordinary.unit.id };
  // A legal gate action stays clickable through an engine's body.
  const gate = cell?.level === 'ground' ? gateAt(cell.x, cell.y) : undefined;
  if (gate && selected && actorTargets(state, selected, playerSide).some((t) => t.id === gate))
    return {};
  // (e) Any usable engine owns its body, frontmost first (paint order on ties).
  const engine = [...engines]
    .sort((a, b) =>
      compareDepth({ row: a.cells[3], height: a.height }, { row: b.cells[3], height: b.height }),
    )
    .reverse()
    .find((sprite) => usableEngine(sprite.engine) && contains(sprite.rect, point.x, point.y));
  if (engine) return { pickedEngineId: engine.id };
  // (f) Leave the cell under the cursor to the existing resolver.
  return {};
}
