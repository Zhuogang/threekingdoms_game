export interface MapBounds {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
}

/** Approved regional framing, reduced to two thirds of the wider preview on each axis. */
export const CAMPAIGN_MAP_BOUNDS: MapBounds = {
  minLatitude: 26.5,
  maxLatitude: 40.5,
  minLongitude: 114 - 32 / 3,
  maxLongitude: 114 + 32 / 3,
};

/** Initial camera framing; the projection and all existing city anchors stay unchanged. */
export const CAMPAIGN_REGIONAL_BOUNDS = { left: 0, top: 0, width: 1600, height: 1000 } as const;

/** China-wide ink canvas, registered at the original regional pixel density. */
export const CAMPAIGN_WORLD_BOUNDS = {
  left: -1300,
  top: -790,
  width: 3260,
  height: 2340,
} as const;

/**
 * North-up geographic presentation with uniform scale and room around the city network.
 * The generated physical basemap uses this same projection. Travel uses road kilometres,
 * never the distance between these display coordinates.
 */
export function projectCampaignPoint(
  latitude: number,
  longitude: number,
  bounds: MapBounds = CAMPAIGN_MAP_BOUNDS,
): { x: number; y: number } {
  const centerLatitude = (bounds.minLatitude + bounds.maxLatitude) / 2;
  const centerLongitude = (bounds.minLongitude + bounds.maxLongitude) / 2;
  const longitudeScale = Math.cos((centerLatitude * Math.PI) / 180);
  const scale = Math.min(
    1400 / ((bounds.maxLongitude - bounds.minLongitude) * longitudeScale),
    840 / (bounds.maxLatitude - bounds.minLatitude),
  );
  return {
    x: 800 + (longitude - centerLongitude) * longitudeScale * scale,
    y: 500 - (latitude - centerLatitude) * scale,
  };
}

export const CAMPAIGN_REGION_LABELS = [
  { en: 'Hexi', zh: '河 西', latitude: 39.5, longitude: 100 },
  { en: 'Saibei', zh: '塞 北', latitude: 42.5, longitude: 111 },
  { en: 'Liaodong', zh: '辽 东', latitude: 41.5, longitude: 123.3 },
  { en: 'Bashu', zh: '巴 蜀', latitude: 29.2, longitude: 100.8 },
  { en: 'Jiangnan', zh: '江 南', latitude: 27.7, longitude: 118.2 },
  { en: 'Lingnan', zh: '岭 南', latitude: 23.5, longitude: 110.5 },
  { en: 'East China Sea', zh: '东 海', latitude: 29, longitude: 126.5 },
]
  .map((region) => ({
    ...region,
    position: projectCampaignPoint(region.latitude, region.longitude),
  }))
  .filter(({ position: { x, y } }) => x > 60 && x < 1540 && y > 60 && y < 940);
