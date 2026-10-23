import type { Point } from './geometry';

export interface CampaignViewBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CampaignWorldBounds extends CampaignViewBox {}

const MIN_CAMPAIGN_ZOOM = 1;
const MAX_CAMPAIGN_ZOOM = 8;

/** Fit the whole campaign atlas into an SVG viewport while preserving its aspect ratio. */
export function fitCampaignViewport(
  bounds: CampaignWorldBounds,
  aspectRatio: number,
  padding = 0,
): CampaignViewBox {
  validateCampaignBounds(bounds);
  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const paddedWidth = bounds.width * (1 + Math.max(0, padding) * 2);
  const paddedHeight = bounds.height * (1 + Math.max(0, padding) * 2);
  let width = paddedWidth;
  let height = paddedHeight;
  if (width / height > safeAspect) height = width / safeAspect;
  else width = height * safeAspect;
  return centeredViewBox(bounds, width, height);
}

/** Place a view of the requested relative zoom around a world coordinate. */
export function focusCampaignViewport(
  bounds: CampaignWorldBounds,
  current: CampaignViewBox,
  point: Point,
  zoom = 2,
): CampaignViewBox {
  validateCampaignBounds(bounds);
  validateCampaignViewBox(current);
  const safeZoom = clamp(zoom, MIN_CAMPAIGN_ZOOM, MAX_CAMPAIGN_ZOOM);
  const fit = fitCampaignViewport(bounds, current.width / current.height);
  const width = fit.width / safeZoom;
  const height = fit.height / safeZoom;
  return clampCampaignViewport(
    { left: point.x - width / 2, top: point.y - height / 2, width, height },
    bounds,
  );
}

/** Preserve center and relative zoom when the map container changes aspect ratio. */
export function resizeCampaignViewport(
  bounds: CampaignWorldBounds,
  viewport: CampaignViewBox,
  aspectRatio: number,
): CampaignViewBox {
  validateCampaignBounds(bounds);
  validateCampaignViewBox(viewport);
  const previousFit = fitCampaignViewport(bounds, viewport.width / viewport.height);
  const zoom = clamp(
    Math.max(previousFit.width / viewport.width, previousFit.height / viewport.height),
    MIN_CAMPAIGN_ZOOM,
    MAX_CAMPAIGN_ZOOM,
  );
  const nextFit = fitCampaignViewport(bounds, aspectRatio);
  const width = nextFit.width / zoom;
  const height = nextFit.height / zoom;
  const center = {
    x: viewport.left + viewport.width / 2,
    y: viewport.top + viewport.height / 2,
  };
  return clampCampaignViewport(
    { left: center.x - width / 2, top: center.y - height / 2, width, height },
    bounds,
  );
}

/** Recenter the current camera without changing its zoom or aspect ratio. */
export function recenterCampaignViewport(
  viewport: CampaignViewBox,
  bounds: CampaignWorldBounds,
  center: Point,
): CampaignViewBox {
  validateCampaignBounds(bounds);
  validateCampaignViewBox(viewport);
  return clampCampaignViewport(
    {
      left: center.x - viewport.width / 2,
      top: center.y - viewport.height / 2,
      width: viewport.width,
      height: viewport.height,
    },
    bounds,
  );
}

/** Pan by world-space units and keep the view inside the campaign atlas. */
export function panCampaignViewport(
  viewport: CampaignViewBox,
  delta: Point,
  bounds: CampaignWorldBounds,
): CampaignViewBox {
  validateCampaignBounds(bounds);
  validateCampaignViewBox(viewport);
  return clampCampaignViewport(
    { ...viewport, left: viewport.left - delta.x, top: viewport.top - delta.y },
    bounds,
  );
}

/** Zoom toward a world-space focus point while keeping that point under the cursor. */
export function zoomCampaignViewport(
  viewport: CampaignViewBox,
  bounds: CampaignWorldBounds,
  focus: Point,
  factor: number,
): CampaignViewBox {
  validateCampaignBounds(bounds);
  validateCampaignViewBox(viewport);
  const zoomFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const fit = fitCampaignViewport(bounds, viewport.width / viewport.height);
  const currentZoom = Math.max(fit.width / viewport.width, fit.height / viewport.height);
  const nextZoom = clamp(currentZoom * zoomFactor, MIN_CAMPAIGN_ZOOM, MAX_CAMPAIGN_ZOOM);
  const ratioX = clamp((focus.x - viewport.left) / viewport.width, 0, 1);
  const ratioY = clamp((focus.y - viewport.top) / viewport.height, 0, 1);
  const width = fit.width / nextZoom;
  const height = fit.height / nextZoom;
  return clampCampaignViewport(
    { left: focus.x - ratioX * width, top: focus.y - ratioY * height, width, height },
    bounds,
  );
}

/** Convert a click in the overview map to a world coordinate for camera focus. */
export function campaignMinimapToWorld(
  point: Point,
  minimap: CampaignViewBox,
  bounds: CampaignWorldBounds,
): Point {
  return {
    x: bounds.left + ((point.x - minimap.left) / minimap.width) * bounds.width,
    y: bounds.top + ((point.y - minimap.top) / minimap.height) * bounds.height,
  };
}

/** Convert a world coordinate to the overview map's coordinate space. */
export function campaignWorldToMinimap(
  point: Point,
  bounds: CampaignWorldBounds,
  minimap: CampaignViewBox,
): Point {
  return {
    x: minimap.left + ((point.x - bounds.left) / bounds.width) * minimap.width,
    y: minimap.top + ((point.y - bounds.top) / bounds.height) * minimap.height,
  };
}

/** Keep the view inside the atlas; oversized views remain centered on the atlas. */
export function clampCampaignViewport(
  viewport: CampaignViewBox,
  bounds: CampaignWorldBounds,
): CampaignViewBox {
  validateCampaignBounds(bounds);
  validateCampaignViewBox(viewport);
  const width = viewport.width;
  const height = viewport.height;
  const left =
    width >= bounds.width
      ? bounds.left + (bounds.width - width) / 2
      : clamp(viewport.left, bounds.left, bounds.left + bounds.width - width);
  const top =
    height >= bounds.height
      ? bounds.top + (bounds.height - height) / 2
      : clamp(viewport.top, bounds.top, bounds.top + bounds.height - height);
  return { left, top, width, height };
}

function centeredViewBox(
  bounds: CampaignWorldBounds,
  width: number,
  height: number,
): CampaignViewBox {
  return {
    left: bounds.left + (bounds.width - width) / 2,
    top: bounds.top + (bounds.height - height) / 2,
    width,
    height,
  };
}

function validateCampaignBounds(bounds: CampaignWorldBounds): void {
  validateCampaignViewBox(bounds);
}

function validateCampaignViewBox(viewbox: CampaignViewBox): void {
  if (
    !Number.isFinite(viewbox.left) ||
    !Number.isFinite(viewbox.top) ||
    !Number.isFinite(viewbox.width) ||
    !Number.isFinite(viewbox.height) ||
    viewbox.width <= 0 ||
    viewbox.height <= 0
  ) {
    throw new RangeError(
      'Campaign map bounds must have finite coordinates and positive dimensions.',
    );
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
