/**
 * Top-down battlefield presentation geometry. Logical rules remain in the battle
 * engine; these helpers only project, hit-test, and fit the supplied board.
 */
export const V03_BATTLEFIELD_WIDTH = 24;
export const V03_BATTLEFIELD_HEIGHT = 20;
/** One logical cell is a 64×64 world square, matching the painted canvases. */
export const V03_BATTLE_CELL = 64;
export const V03_BATTLE_HALF_CELL = V03_BATTLE_CELL / 2;
/** World margin around the board used by the camera fit and pan limits. */
export const V03_BATTLEFIELD_PADDING = 24;

export interface Point {
  x: number;
  y: number;
}

export interface GridPoint {
  x: number;
  y: number;
}

export interface BoardBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const BATTLE_VIEW_INSETS: Insets = { left: 18, right: 18, top: 18, bottom: 24 };

/** Grid coordinates identify cell centers; cell (0, 0) is centered on the origin. */
export function gridToWorld(
  point: GridPoint,
  origin: Point = { x: 0, y: 0 },
  cell = V03_BATTLE_CELL,
): Point {
  return { x: point.x * cell + origin.x, y: point.y * cell + origin.y };
}

/** Returns continuous grid coordinates; it does not round to a cell. */
export function worldToGrid(
  point: Point,
  origin: Point = { x: 0, y: 0 },
  cell = V03_BATTLE_CELL,
): Point {
  return { x: (point.x - origin.x) / cell, y: (point.y - origin.y) / cell };
}

export function gridToScreen(point: Point, cameraOrigin: Point, scale: number): Point {
  return { x: point.x * scale + cameraOrigin.x, y: point.y * scale + cameraOrigin.y };
}

export function screenToWorld(point: Point, cameraOrigin: Point, scale: number): Point {
  const safeScale = Math.max(Number.EPSILON, Math.abs(scale));
  return { x: (point.x - cameraOrigin.x) / safeScale, y: (point.y - cameraOrigin.y) / safeScale };
}

export function screenToGrid(
  point: Point,
  cameraOrigin: Point,
  scale: number,
  gridOrigin: Point = { x: 0, y: 0 },
): Point {
  return worldToGrid(screenToWorld(point, cameraOrigin, scale), gridOrigin);
}

/** The square footprint around a cell center, clockwise from the top-left corner. */
export function cellVertices(center: Point, cell = V03_BATTLE_CELL): Point[] {
  const half = cell / 2;
  return [
    { x: center.x - half, y: center.y - half },
    { x: center.x + half, y: center.y - half },
    { x: center.x + half, y: center.y + half },
    { x: center.x - half, y: center.y + half },
  ];
}

export function battlefieldBounds(
  width: number,
  height: number,
  padding = 0,
  cell = V03_BATTLE_CELL,
): BoardBounds {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new RangeError('Battlefield dimensions must be positive integers.');
  }
  const left = -cell / 2 - padding;
  const top = -cell / 2 - padding;
  const right = width * cell - cell / 2 + padding;
  const bottom = height * cell - cell / 2 + padding;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/**
 * Fit the board inside a viewport after UI insets. The returned scale is a
 * uniform world-to-screen scale, so cells stay square.
 */
export function fitScale(
  viewportWidth: number,
  viewportHeight: number,
  bounds: BoardBounds,
  insets: Insets,
): number {
  const availableWidth = Math.max(1, viewportWidth - insets.left - insets.right);
  const availableHeight = Math.max(1, viewportHeight - insets.top - insets.bottom);
  return Math.max(0.001, Math.min(availableWidth / bounds.width, availableHeight / bounds.height));
}

export function cameraOrigin(
  viewportWidth: number,
  viewportHeight: number,
  bounds: BoardBounds,
  insets: Insets,
  scale: number,
  pan: Point = { x: 0, y: 0 },
): Point {
  return {
    x:
      insets.left +
      (viewportWidth - insets.left - insets.right) / 2 -
      (bounds.left + bounds.width / 2) * scale +
      pan.x,
    y:
      insets.top +
      (viewportHeight - insets.top - insets.bottom) / 2 -
      (bounds.top + bounds.height / 2) * scale +
      pan.y,
  };
}

/**
 * Selects the cell whose square contains the point. Exact shared edges use a
 * stable row-first tie break; outside-board points return null.
 */
export function hitTestWorld(
  point: Point,
  width: number,
  height: number,
  gridOrigin: Point = { x: 0, y: 0 },
): GridPoint | null {
  const grid = worldToGrid(point, gridOrigin);
  const candidates: GridPoint[] = [];
  const minX = Math.floor(grid.x);
  const maxX = Math.ceil(grid.x);
  const minY = Math.floor(grid.y);
  const maxY = Math.ceil(grid.y);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (Math.abs(grid.x - x) <= 0.5 + 1e-9 && Math.abs(grid.y - y) <= 0.5 + 1e-9) {
        candidates.push({ x, y });
      }
    }
  }
  candidates.sort((a, b) => a.y - b.y || a.x - b.x);
  return candidates[0] ?? null;
}

export function hitTestScreen(
  point: Point,
  camera: { origin: Point; scale: number },
  width: number,
  height: number,
  gridOrigin: Point = { x: 0, y: 0 },
): GridPoint | null {
  return hitTestWorld(screenToWorld(point, camera.origin, camera.scale), width, height, gridOrigin);
}

/** Converts a pointer position to SVG viewBox coordinates with meet letterboxing. */
export function clientToViewBoxPoint(
  clientPoint: Point,
  rect: { left: number; top: number; width: number; height: number },
  viewBox: { left: number; top: number; width: number; height: number },
): Point {
  const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height);
  if (!Number.isFinite(scale) || scale <= 0) return { x: viewBox.left, y: viewBox.top };
  const offsetX = (rect.width - viewBox.width * scale) / 2;
  const offsetY = (rect.height - viewBox.height * scale) / 2;
  return {
    x: viewBox.left + (clientPoint.x - rect.left - offsetX) / scale,
    y: viewBox.top + (clientPoint.y - rect.top - offsetY) / scale,
  };
}

export function routePolyline(
  points: readonly GridPoint[],
  gridOrigin: Point = { x: 0, y: 0 },
): Point[] {
  return points.map((point) => gridToWorld(point, gridOrigin));
}

/**
 * Bounds a world-space route with a stable half-tile margin for SVG viewBoxes.
 */
export function routeBounds(
  points: readonly Point[],
  padding = V03_BATTLE_HALF_CELL,
): BoardBounds | null {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs) - padding;
  const right = Math.max(...xs) + padding;
  const top = Math.min(...ys) - padding;
  const bottom = Math.max(...ys) + padding;
  return { left, right, top, bottom, width: right - left, height: bottom - top };
}

export function minimapPoint(
  point: GridPoint,
  width: number,
  height: number,
  viewport: BoardBounds,
): Point {
  return {
    x: viewport.left + ((point.x + 0.5) / width) * viewport.width,
    y: viewport.top + ((point.y + 0.5) / height) * viewport.height,
  };
}

export function minimapCellAt(
  point: Point,
  width: number,
  height: number,
  viewport: BoardBounds,
): GridPoint | null {
  if (
    point.x < viewport.left ||
    point.y < viewport.top ||
    point.x >= viewport.right ||
    point.y >= viewport.bottom
  ) {
    return null;
  }
  const x = Math.floor(((point.x - viewport.left) / viewport.width) * width);
  const y = Math.floor(((point.y - viewport.top) / viewport.height) * height);
  return x >= 0 && y >= 0 && x < width && y < height ? { x, y } : null;
}

export function clipPolygonToGrid(
  points: readonly Point[],
  width: number,
  height: number,
): Point[] {
  let polygon = [...points];
  const boundaries: Array<{
    inside: (point: Point) => boolean;
    intersect: (a: Point, b: Point) => Point;
  }> = [
    { inside: (p) => p.x >= -0.5, intersect: (a, b) => interpolateAtX(a, b, -0.5) },
    { inside: (p) => p.x <= width - 0.5, intersect: (a, b) => interpolateAtX(a, b, width - 0.5) },
    { inside: (p) => p.y >= -0.5, intersect: (a, b) => interpolateAtY(a, b, -0.5) },
    { inside: (p) => p.y <= height - 0.5, intersect: (a, b) => interpolateAtY(a, b, height - 0.5) },
  ];
  for (const boundary of boundaries) {
    const clipped: Point[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const current = polygon[i];
      const previous = polygon[(i + polygon.length - 1) % polygon.length];
      if (!current || !previous) continue;
      const currentInside = boundary.inside(current);
      const previousInside = boundary.inside(previous);
      if (currentInside !== previousInside) clipped.push(boundary.intersect(previous, current));
      if (currentInside) clipped.push(current);
    }
    polygon = clipped;
    if (polygon.length === 0) return [];
  }
  return polygon;
}

function interpolateAtX(a: Point, b: Point, x: number): Point {
  const delta = b.x - a.x;
  const t = Math.abs(delta) < Number.EPSILON ? 0 : (x - a.x) / delta;
  return { x, y: a.y + (b.y - a.y) * t };
}

function interpolateAtY(a: Point, b: Point, y: number): Point {
  const delta = b.y - a.y;
  const t = Math.abs(delta) < Number.EPSILON ? 0 : (y - a.y) / delta;
  return { x: a.x + (b.x - a.x) * t, y };
}
