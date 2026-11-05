import type { Cell } from '../rules/types';

/** Inclusive fine-cell spans. Index = board coordinate; art keeps its original grid. */
export const COL_SPANS = [
  [0, 3],
  [4, 7],
  [8, 11],
  [12, 13],
  [14, 14],
  [15, 16],
  [17, 19],
  [20, 22],
  [23, 24],
  [25, 27],
  [28, 30],
  [31, 32],
  [33, 33],
  [34, 35],
  [36, 39],
  [40, 43],
  [44, 47],
] as const;
export const ROW_SPANS = [
  [0, 2],
  [3, 3],
  [4, 4],
  [5, 6],
  [7, 8],
  [9, 11],
  [12, 15],
  [16, 16],
  [17, 17],
  [18, 18],
  [19, 21],
  [22, 25],
  [26, 28],
  [29, 31],
] as const;

export const WEST_WALL_COL = 4;
export const EAST_WALL_COL = 12;
export const NORTH_WALL_ROW = 2;
export const SOUTH_WALL_ROW = 7;
export const TRENCH_INNER_ROW = 8;
export const TRENCH_OUTER_ROW = 9;
export const APPROACH_ROW = 10;
export const ROAD_COL = 8;
export const MIDDLE_ROAD_ROW = 5;

export function fineSpanOf({ x, y }: Cell) {
  const col = COL_SPANS[x];
  const row = ROW_SPANS[y];
  if (!col || !row) throw new RangeError(`Off-board cell: ${x},${y}`);
  return { west: col[0], east: col[1], north: row[0], south: row[1] };
}

export function fineCellsOf(cell: Cell): Cell[] {
  const span = fineSpanOf(cell);
  const cells: Cell[] = [];
  for (let y = span.north; y <= span.south; y++)
    for (let x = span.west; x <= span.east; x++) cells.push({ x, y });
  return cells;
}
