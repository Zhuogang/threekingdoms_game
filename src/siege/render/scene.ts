/**
 * 2.5D siege scene geometry: the oblique projection (art plan §4.2), per-row
 * slicing of painted objects and the painter's depth order (§9.1).
 */

/** Screen position of grid point (0, 0) at ground level, and the pixel size of one cell and one level. */
export interface SiegeFrame {
  ox: number;
  oy: number;
  cw: number;
  cd: number;
  lh: number;
}

export type ScreenRect = [x0: number, y0: number, x1: number, y1: number];

/** One cut-out object, as written to `footprints.json` by tools/build-siege-blockout.mjs. */
export interface SceneObject {
  id: string;
  kind: string;
  /** Inclusive cell range [x0, y0, x1, y1]. */
  cells: [number, number, number, number];
  /** Highest point in levels (walls 3, parapets 3.5, tower ridges 5–7). */
  height: number;
  bbox: ScreenRect;
}

/** A horizontal band of one object, sorted as if it stood in a single row. */
export interface SceneSlice {
  objectId: string;
  kind: string;
  row: number;
  height: number;
  rect: ScreenRect;
}

export interface DepthKey {
  row: number;
  height: number;
}

/** A unit sorts just after the surface it stands on, so the surface never covers it. */
export const STANDING_EPSILON = 0.01;

export function project(frame: SiegeFrame, x: number, y: number, h = 0): [number, number] {
  return [frame.ox + x * frame.cw, frame.oy + y * frame.cd - h * frame.lh];
}

/**
 * Cuts an object into one band per row it covers. Without this a long
 * north-south wall would sort by its southern end and cover a unit standing
 * on its northern part. Bands split where one row's top face meets the next
 * (at the object's height); the first band runs to the top of the box and the
 * last to the bottom, so roofs and the south front face stay whole.
 */
export function sliceObject(frame: SiegeFrame, object: SceneObject): SceneSlice[] {
  const [, y0, , y1] = object.cells;
  const [bx0, by0, bx1, by1] = object.bbox;
  const edge = (row: number) => project(frame, 0, row, object.height)[1];
  const slices: SceneSlice[] = [];
  for (let row = y0; row <= y1; row++) {
    const top = row === y0 ? by0 : Math.max(by0, edge(row));
    const bottom = row === y1 ? by1 : Math.min(by1, edge(row + 1));
    if (bottom > top)
      slices.push({
        objectId: object.id,
        kind: object.kind,
        row,
        height: object.height,
        rect: [bx0, top, bx1, bottom],
      });
  }
  return slices;
}

/** Painter's order: north rows first; within a row, lower before higher. */
export function compareDepth(a: DepthKey, b: DepthKey): number {
  return a.row - b.row || a.height - b.height;
}

export function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
}

/** Every standing cell under a screen point, highest plane first. */
export function pickCandidates(
  frame: SiegeFrame,
  sx: number,
  sy: number,
  standingHeights: readonly number[],
  standsAt: (x: number, y: number, h: number) => boolean,
): Array<{ x: number; y: number; h: number }> {
  const x = Math.floor((sx - frame.ox) / frame.cw);
  return [...new Set(standingHeights)]
    .sort((a, b) => b - a)
    .map((h) => ({ x, y: Math.floor((sy - frame.oy + h * frame.lh) / frame.cd), h }))
    .filter(({ x, y, h }) => standsAt(x, y, h));
}

/** The highest standing cell under a screen point. */
export function pickCell(
  frame: SiegeFrame,
  sx: number,
  sy: number,
  standingHeights: readonly number[],
  standsAt: (x: number, y: number, h: number) => boolean,
): { x: number; y: number; h: number } | null {
  return pickCandidates(frame, sx, sy, standingHeights, standsAt)[0] ?? null;
}
