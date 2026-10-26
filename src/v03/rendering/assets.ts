export type AssetAnchor = readonly [x: number, y: number];
export type AssetCategory =
  'material' | 'terrain-prop' | 'unit' | 'transport' | 'map-background' | 'city';

export interface V03AssetDefinition {
  id: string;
  category: AssetCategory;
  path: string;
  width: number;
  height: number;
  alpha: boolean;
  anchor: AssetAnchor | null;
  renderWidth: number;
  renderHeight: number;
  status: 'draft' | 'reviewed' | 'approved' | 'integrated';
  promptId: string;
  sha256: string;
}

/** Runtime art shipped with the v0.3 rendering track. */
export const V03_ASSETS = {
  groundInk01: {
    id: 'ground-material-ink-01',
    category: 'material',
    path: 'assets/v03/terrain/material-ground-ink-01.webp',
    width: 512,
    height: 512,
    alpha: false,
    anchor: null,
    renderWidth: 512,
    renderHeight: 512,
    status: 'draft',
    promptId: 'v03-ground-ink-01',
    sha256: '9e25dbd26f49e40f65fa82490bd2d5373652f13d662762d3904315564828614b',
  },
  ridgePineInk01: {
    id: 'ridge-pine-ink-01',
    category: 'terrain-prop',
    path: 'assets/v03/terrain/prop-ridge-pine-ink-01.webp',
    width: 512,
    height: 512,
    alpha: true,
    anchor: [0.5, 0.84],
    renderWidth: 224,
    renderHeight: 224,
    status: 'draft',
    promptId: 'v03-ridge-pine-ink-01',
    sha256: '2e75a3c0d49654081f503b9faf228b1c99a5c03301e54e272eec31a929b2b266',
  },
  infantrySquadInk02: {
    id: 'infantry-small-ink-02',
    category: 'unit',
    path: 'assets/v03/units/infantry-small-ink-02.webp',
    width: 256,
    height: 256,
    alpha: true,
    anchor: [0.5, 0.5],
    renderWidth: 56,
    renderHeight: 56,
    status: 'integrated',
    promptId: 'units-formations-ink-02',
    sha256: '70ef42168c79ff8a4211f65a8f43ae954707685392da6ab7ff6ee95e4716e2c0',
  },
  cavalrySquadInk02: {
    id: 'cavalry-small-ink-02',
    category: 'unit',
    path: 'assets/v03/units/cavalry-small-ink-02.webp',
    width: 256,
    height: 256,
    alpha: true,
    anchor: [0.5, 0.5],
    renderWidth: 56,
    renderHeight: 56,
    status: 'integrated',
    promptId: 'units-formations-ink-02',
    sha256: '2a20379cb0ad11e48586f96900039fb6f03aeb90efb3c8e9e1c0540ed56c7c93',
  },
  archerSquadInk02: {
    id: 'archer-small-ink-02',
    category: 'unit',
    path: 'assets/v03/units/archer-small-ink-02.webp',
    width: 256,
    height: 256,
    alpha: true,
    anchor: [0.5, 0.5],
    renderWidth: 56,
    renderHeight: 56,
    status: 'integrated',
    promptId: 'units-formations-ink-02',
    sha256: 'ffafce86ee3c4c5ccd57513fc498463bfff0e131e6ef6f8337016b2651eddcf4',
  },
  transportSquadInk02: {
    id: 'boat-transport-ink-02',
    category: 'transport',
    path: 'assets/v03/units/boat-transport-ink-02.webp',
    width: 256,
    height: 256,
    alpha: true,
    anchor: [0.5, 0.5],
    renderWidth: 56,
    renderHeight: 56,
    status: 'integrated',
    promptId: 'units-formations-ink-02',
    sha256: 'f0086c561b0d616497800e681b93c95d7ff9ed22305e41fd5f3d9491277322cc',
  },
  campaignMapChinaInk01: {
    id: 'campaign-china-full-ink-01',
    category: 'map-background',
    path: 'assets/v03/maps/campaign-china-full-ink-01.webp',
    width: 3260,
    height: 2340,
    alpha: false,
    anchor: null,
    renderWidth: 3260,
    renderHeight: 2340,
    status: 'integrated',
    promptId: 'campaign-china-full-ink-01',
    sha256: 'bbb11a347763df002c2b35db8c20d77b724bdf593d555e317ceaa41e64203a74',
  },
  campaignMapRegional: {
    id: 'campaign-map-regional',
    category: 'map-background',
    path: 'assets/v03/maps/campaign-regional-map.svg',
    width: 1600,
    height: 1000,
    alpha: false,
    anchor: null,
    renderWidth: 1600,
    renderHeight: 1000,
    status: 'integrated',
    promptId: 'natural-earth-regional-reference',
    sha256: '4e69f3da32f36518fe1b3634989f018de91738ec666e84b74202b08942aefe28',
  },
  campaignMapInk01: {
    id: 'campaign-map-ink-01',
    category: 'map-background',
    path: 'assets/v03/maps/campaign-ink-map-01.webp',
    width: 1000,
    height: 1000,
    alpha: false,
    anchor: null,
    renderWidth: 1000,
    renderHeight: 1000,
    status: 'draft',
    promptId: 'v03-campaign-ink-atlas-02',
    sha256: 'cf8312f8ed9c210b72b424b08e699c4f0d3631504748f3fcca131c11aacf6207',
  },
} as const satisfies Record<string, V03AssetDefinition>;

/** Small frontal city art; detailed city illustrations remain separate candidates. */
export const V03_CITY_ICONS = {
  imperial: {
    id: 'city-front-imperial-01',
    category: 'city',
    path: 'assets/v03/cities/city-front-imperial-01.webp',
    width: 256,
    height: 192,
    alpha: true,
    anchor: [0.5, 0.90625],
    renderWidth: 80,
    renderHeight: 60,
    status: 'integrated',
    promptId: 'cities-front-ink-01',
    sha256: '6a4215c748b689d84768f7666049a2270865275a6a136fb649b7b4889fd02043',
  },
  plains: {
    id: 'city-front-plains-01',
    category: 'city',
    path: 'assets/v03/cities/city-front-plains-01.webp',
    width: 256,
    height: 192,
    alpha: true,
    anchor: [0.5, 0.90625],
    renderWidth: 64,
    renderHeight: 48,
    status: 'integrated',
    promptId: 'cities-front-ink-01',
    sha256: '254b8a5b79e8eff2e95228fde51af860dcf132402f9852add2fc52b1fb35983c',
  },
  frontier: {
    id: 'city-front-frontier-01',
    category: 'city',
    path: 'assets/v03/cities/city-front-frontier-01.webp',
    width: 256,
    height: 192,
    alpha: true,
    anchor: [0.5, 0.90625],
    renderWidth: 64,
    renderHeight: 48,
    status: 'integrated',
    promptId: 'cities-front-ink-01',
    sha256: '87ee16e03f588d3be7a3f7eb3b70bb3985c86a1e1cef8e7f4e3626b33f77ebb5',
  },
  loess: {
    id: 'city-front-loess-01',
    category: 'city',
    path: 'assets/v03/cities/city-front-loess-01.webp',
    width: 256,
    height: 192,
    alpha: true,
    anchor: [0.5, 0.90625],
    renderWidth: 64,
    renderHeight: 48,
    status: 'integrated',
    promptId: 'cities-front-ink-01',
    sha256: 'e77dcaff34af8430420ab7bfb6877986c8ee16097c854758a8133eee8e6f968d',
  },
  basin: {
    id: 'city-front-basin-01',
    category: 'city',
    path: 'assets/v03/cities/city-front-basin-01.webp',
    width: 256,
    height: 192,
    alpha: true,
    anchor: [0.5, 0.90625],
    renderWidth: 64,
    renderHeight: 48,
    status: 'integrated',
    promptId: 'cities-front-ink-01',
    sha256: 'b8c4eb9b541aa7347f400cd874d60f396ab3282da81d1cfa846795faf9466b87',
  },
  mountain: {
    id: 'city-front-mountain-01',
    category: 'city',
    path: 'assets/v03/cities/city-front-mountain-01.webp',
    width: 256,
    height: 192,
    alpha: true,
    anchor: [0.5, 0.90625],
    renderWidth: 64,
    renderHeight: 48,
    status: 'integrated',
    promptId: 'cities-front-ink-01',
    sha256: '2f46d01d206948050ece6a7e9e5a4ce0ba3ce792da3b657c2e0e3147120320dd',
  },
  river: {
    id: 'city-front-river-01',
    category: 'city',
    path: 'assets/v03/cities/city-front-river-01.webp',
    width: 256,
    height: 192,
    alpha: true,
    anchor: [0.5, 0.90625],
    renderWidth: 64,
    renderHeight: 48,
    status: 'integrated',
    promptId: 'cities-front-ink-01',
    sha256: '1238ea2c71b05ce8bb25f7595964fa5553a5356e16529c23b547da76861ec3aa',
  },
  jiangnan: {
    id: 'city-front-jiangnan-01',
    category: 'city',
    path: 'assets/v03/cities/city-front-jiangnan-01.webp',
    width: 256,
    height: 192,
    alpha: true,
    anchor: [0.5, 0.90625],
    renderWidth: 64,
    renderHeight: 48,
    status: 'integrated',
    promptId: 'cities-front-ink-01',
    sha256: '4a2727a176b0b1dee02e7619f248e5f69f56cc4c5700b7b572e1a02d7a67aae0',
  },
} as const satisfies Record<string, V03AssetDefinition>;

export function resolvePublicAsset(path: string, baseUrl = '/'): string {
  const normalizedPath = path.replace(/^\/+/, '');
  if (!normalizedPath || normalizedPath.split('/').some((part) => part === '..' || part === '.')) {
    throw new RangeError('Asset path must be a non-empty public-relative path.');
  }
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${normalizedPath}`;
}

export interface AssetLoadResult<T> {
  value: T;
  usedFallback: boolean;
  error?: unknown;
}

/** A small injectable loader wrapper so callers can release failed textures cleanly. */
export async function loadAssetOrFallback<T>(
  path: string,
  load: (path: string) => Promise<T>,
  fallback: (error: unknown) => T | Promise<T>,
): Promise<AssetLoadResult<T>> {
  try {
    return { value: await load(path), usedFallback: false };
  } catch (error) {
    return { value: await fallback(error), usedFallback: true, error };
  }
}

export function spriteOffsetFromAnchor(
  renderWidth: number,
  renderHeight: number,
  anchor: AssetAnchor,
): { x: number; y: number } {
  return { x: -renderWidth * anchor[0], y: -renderHeight * anchor[1] };
}
