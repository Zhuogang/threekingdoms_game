import { worldToGrid, type BoardBounds, type Point } from './geometry';

export interface BattlefieldViewBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;

/** Fit the whole tactical board while preserving the map frame's aspect ratio. */
export function fitBattlefieldViewport(
  bounds: BoardBounds,
  aspectRatio: number,
  padding = 0.035,
): BattlefieldViewBox {
  validateBounds(bounds);
  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const paddedWidth = bounds.width * (1 + Math.max(0, padding) * 2);
  const paddedHeight = bounds.height * (1 + Math.max(0, padding) * 2);
  let width = paddedWidth;
  let height = paddedHeight;
  if (width / height > safeAspect) height = width / safeAspect;
  else width = height * safeAspect;
  return centered(bounds, width, height);
}

/** Preserve camera center and relative zoom as the battlefield frame resizes. */
export function resizeBattlefieldViewport(
  bounds: BoardBounds,
  viewport: BattlefieldViewBox,
  aspectRatio: number,
): BattlefieldViewBox {
  validateBounds(bounds);
  validateViewport(viewport);
  const previousFit = fitBattlefieldViewport(bounds, viewport.width / viewport.height);
  const zoom = clamp(
    Math.max(previousFit.width / viewport.width, previousFit.height / viewport.height),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  const nextFit = fitBattlefieldViewport(bounds, aspectRatio);
  const width = nextFit.width / zoom;
  const height = nextFit.height / zoom;
  return clampBattlefieldViewport(
    {
      left: viewport.left + viewport.width / 2 - width / 2,
      top: viewport.top + viewport.height / 2 - height / 2,
      width,
      height,
    },
    bounds,
  );
}

/** Center the current camera on a world point without changing its zoom. */
export function recenterBattlefieldViewport(
  viewport: BattlefieldViewBox,
  bounds: BoardBounds,
  center: Point,
): BattlefieldViewBox {
  validateBounds(bounds);
  validateViewport(viewport);
  return clampBattlefieldViewport(
    {
      left: center.x - viewport.width / 2,
      top: center.y - viewport.height / 2,
      width: viewport.width,
      height: viewport.height,
    },
    bounds,
  );
}

/** Center the camera on a target at the requested zoom relative to a full fit. */
export function focusBattlefieldViewport(
  bounds: BoardBounds,
  current: BattlefieldViewBox,
  point: Point,
  zoom = 2.2,
): BattlefieldViewBox {
  validateBounds(bounds);
  validateViewport(current);
  const safeZoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  const fit = fitBattlefieldViewport(bounds, current.width / current.height);
  const width = fit.width / safeZoom;
  const height = fit.height / safeZoom;
  return clampBattlefieldViewport(
    { left: point.x - width / 2, top: point.y - height / 2, width, height },
    bounds,
  );
}

/** Frame a collection of world points while keeping every point in view. */
export function focusBattlefieldPointsViewport(
  bounds: BoardBounds,
  current: BattlefieldViewBox,
  points: readonly Point[],
  padding = 160,
): BattlefieldViewBox {
  validateBounds(bounds);
  validateViewport(current);
  if (!points.length) return current;
  const fit = fitBattlefieldViewport(bounds, current.width / current.height);
  const safePoints = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!safePoints.length) return current;
  const minX = Math.min(...safePoints.map((point) => point.x));
  const maxX = Math.max(...safePoints.map((point) => point.x));
  const minY = Math.min(...safePoints.map((point) => point.y));
  const maxY = Math.max(...safePoints.map((point) => point.y));
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const aspect = current.width / current.height;
  const targetWidth = Math.max(maxX - minX + padding * 2, (maxY - minY + padding * 2) * aspect);
  const targetHeight = targetWidth / aspect;
  const width = Math.min(fit.width, targetWidth);
  const height = Math.min(fit.height, targetHeight);
  return clampBattlefieldViewport(
    { left: center.x - width / 2, top: center.y - height / 2, width, height },
    bounds,
  );
}

/** Pan in world units, with screen-space drag direction preserved. */
export function panBattlefieldViewport(
  viewport: BattlefieldViewBox,
  delta: Point,
  bounds: BoardBounds,
): BattlefieldViewBox {
  validateBounds(bounds);
  validateViewport(viewport);
  return clampBattlefieldViewport(
    { ...viewport, left: viewport.left - delta.x, top: viewport.top - delta.y },
    bounds,
  );
}

/** Zoom around a world point so that the point remains under the pointer. */
export function zoomBattlefieldViewport(
  viewport: BattlefieldViewBox,
  bounds: BoardBounds,
  focus: Point,
  factor: number,
): BattlefieldViewBox {
  validateBounds(bounds);
  validateViewport(viewport);
  const zoomFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const fit = fitBattlefieldViewport(bounds, viewport.width / viewport.height);
  const currentZoom = Math.max(fit.width / viewport.width, fit.height / viewport.height);
  const nextZoom = clamp(currentZoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
  const ratioX = clamp((focus.x - viewport.left) / viewport.width, 0, 1);
  const ratioY = clamp((focus.y - viewport.top) / viewport.height, 0, 1);
  const width = fit.width / nextZoom;
  const height = fit.height / nextZoom;
  return clampBattlefieldViewport(
    { left: focus.x - ratioX * width, top: focus.y - ratioY * height, width, height },
    bounds,
  );
}

/** Clamp a zoomed camera to the board; oversized fits remain centered. */
export function clampBattlefieldViewport(
  viewport: BattlefieldViewBox,
  bounds: BoardBounds,
): BattlefieldViewBox {
  validateBounds(bounds);
  validateViewport(viewport);
  const left =
    viewport.width >= bounds.width
      ? bounds.left + (bounds.width - viewport.width) / 2
      : clamp(viewport.left, bounds.left, bounds.right - viewport.width);
  const top =
    viewport.height >= bounds.height
      ? bounds.top + (bounds.height - viewport.height) / 2
      : clamp(viewport.top, bounds.top, bounds.bottom - viewport.height);
  return { ...viewport, left, top };
}

/** Inverse-project a camera rectangle for the top-down battlefield minimap. */
export function battlefieldViewportGridPolygon(viewport: BattlefieldViewBox): Point[] {
  validateViewport(viewport);
  return [
    { x: viewport.left, y: viewport.top },
    { x: viewport.left + viewport.width, y: viewport.top },
    { x: viewport.left + viewport.width, y: viewport.top + viewport.height },
    { x: viewport.left, y: viewport.top + viewport.height },
  ].map((point) => worldToGrid(point));
}

function centered(bounds: BoardBounds, width: number, height: number): BattlefieldViewBox {
  return {
    left: bounds.left + (bounds.width - width) / 2,
    top: bounds.top + (bounds.height - height) / 2,
    width,
    height,
  };
}

function validateBounds(bounds: BoardBounds): void {
  validateViewport(bounds);
  if (
    !Number.isFinite(bounds.right) ||
    !Number.isFinite(bounds.bottom) ||
    bounds.right <= bounds.left ||
    bounds.bottom <= bounds.top
  ) {
    throw new RangeError('Battlefield bounds must have finite positive dimensions.');
  }
}

function validateViewport(viewport: BattlefieldViewBox): void {
  if (
    !Number.isFinite(viewport.left) ||
    !Number.isFinite(viewport.top) ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    throw new RangeError('Battlefield viewport must have finite positive dimensions.');
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
