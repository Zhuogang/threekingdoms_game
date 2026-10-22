import { worldToGrid, type GridPoint, type Point } from './geometry';

/** A diamond has a half-cell radius. Allow a further half-cell miss at its edge. */
export function nearestLegalBattleCell(
  world: Point,
  legal: readonly GridPoint[],
): GridPoint | null {
  const point = worldToGrid(world);
  return (
    legal
      .map((cell) => ({ cell, distance: Math.abs(cell.x - point.x) + Math.abs(cell.y - point.y) }))
      .filter((entry) => entry.distance <= 1.000001)
      .sort((a, b) => a.distance - b.distance || a.cell.y - b.cell.y || a.cell.x - b.cell.x)[0]
      ?.cell ?? null
  );
}

/** Follow the same monotonically increasing movement-cost field shown in green. */
export function battleMovementPreview(
  start: GridPoint | undefined,
  target: GridPoint | null,
  legal: readonly (GridPoint & { cost?: number })[],
): GridPoint[] {
  if (!start || !target) return [];
  const tiles = [{ ...start, cost: 0 }, ...legal];
  const destination = tiles.find((tile) => tile.x === target.x && tile.y === target.y);
  if (destination?.cost === undefined) return [];
  const path: GridPoint[] = [destination];
  let current = destination;
  for (let steps = 0; steps < 480; steps++) {
    if (current.x === start.x && current.y === start.y) return path.reverse();
    const prior = tiles
      .filter(
        (tile) =>
          tile.cost !== undefined &&
          tile.cost < current.cost! &&
          Math.abs(tile.x - current.x) + Math.abs(tile.y - current.y) === 1,
      )
      .sort((a, b) => b.cost! - a.cost! || a.y - b.y || a.x - b.x)[0];
    if (!prior) return [];
    path.push(prior);
    current = prior;
  }
  return [];
}
