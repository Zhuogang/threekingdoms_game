export type AssetAnchor = readonly [x: number, y: number];
export type AssetCategory = 'material' | 'terrain-prop' | 'unit' | 'transport' | 'map-background';

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
  infantryInk01: {
    id: 'infantry-ink-01',
    category: 'unit',
    path: 'assets/v03/units/infantry-ink-01.webp',
    width: 256,
    height: 256,
    alpha: true,
    anchor: [0.5, 0.86],
    renderWidth: 84,
    renderHeight: 84,
    status: 'draft',
    promptId: 'v03-infantry-ink-01',
    sha256: '0d01c949b9dba13be34c16fda5b2067ca3c837fc6858e59e5099ffe8a42d3925',
  },
  archerInk01: {
    id: 'archer-ink-01',
    category: 'unit',
    path: 'assets/v03/units/archer-ink-01.webp',
    width: 256,
    height: 256,
    alpha: true,
    anchor: [0.5, 0.86],
    renderWidth: 84,
    renderHeight: 84,
    status: 'draft',
    promptId: 'v03-archer-ink-01',
    sha256: '3269b57d39582f483cbe74e62db4211ceb2d542f71be39f2bae917ebd2970c2a',
  },
  cavalryInk01: {
    id: 'cavalry-ink-01',
    category: 'unit',
    path: 'assets/v03/units/cavalry-ink-01.webp',
    width: 256,
    height: 256,
    alpha: true,
    anchor: [0.5, 0.86],
    renderWidth: 104,
    renderHeight: 104,
    status: 'draft',
    promptId: 'v03-cavalry-ink-01',
    sha256: '3509d7571cd879ce9301ea8b6d9f1f8c4ef5af8ab2ff0a84e12f07283c13f7a1',
  },
  transportCraftInk01: {
    id: 'transport-craft-ink-01',
    category: 'transport',
    path: 'assets/v03/units/transport-craft-ink-01.webp',
    width: 256,
    height: 128,
    alpha: true,
    anchor: [0.5, 0.6],
    renderWidth: 132,
    renderHeight: 66,
    status: 'draft',
    promptId: 'v03-transport-craft-ink-01',
    sha256: 'feab4ef19cdc01933962858f2fb11fdf871728abd7e653b0eef6c78223f96a5f',
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
