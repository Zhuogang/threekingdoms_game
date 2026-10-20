export interface Point {
  x: number;
  y: number;
}
export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}
export interface Insets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export const BATTLE_INSETS: Insets = { left: 32, right: 24, top: 36, bottom: 72 };
export const CAMPAIGN_INSETS: Insets = { left: 18, right: 18, top: 26, bottom: 26 };
export function battleBoard(width: number, height: number): Bounds & { tile: number } {
  const tile = 64;
  return {
    tile,
    left: (1000 - tile * width) / 2,
    top: (720 - tile * height) / 2,
    width: tile * width,
    height: tile * height,
  };
}
export function cameraFit(width: number, height: number, bounds: Bounds, insets: Insets): number {
  return Math.max(
    0.001,
    Math.min(
      Math.max(1, width - insets.left - insets.right) / bounds.width,
      Math.max(1, height - insets.top - insets.bottom) / bounds.height,
    ),
  );
}
export function cameraOrigin(
  width: number,
  height: number,
  bounds: Bounds,
  insets: Insets,
  scale: number,
  pan: Point,
): Point {
  return {
    x:
      insets.left +
      (width - insets.left - insets.right) / 2 -
      (bounds.left + bounds.width / 2) * scale +
      pan.x,
    y:
      insets.top +
      (height - insets.top - insets.bottom) / 2 -
      (bounds.top + bounds.height / 2) * scale +
      pan.y,
  };
}
export function worldToScreen(point: Point, origin: Point, scale: number): Point {
  return { x: point.x * scale + origin.x, y: point.y * scale + origin.y };
}
export function screenToWorld(point: Point, origin: Point, scale: number): Point {
  return { x: (point.x - origin.x) / scale, y: (point.y - origin.y) / scale };
}
