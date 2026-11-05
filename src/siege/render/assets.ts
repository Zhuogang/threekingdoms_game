import { CHENCANG_ART_LAYOUT } from '../content/chencang';
import { campSprites, type SheetFootprints } from './mapPieces';
import type { SceneObject, SiegeFrame } from './scene';
const ART = '/docs/siege/chencang/art';
const MAP_DIR = `${ART}/s2-01-full-map`;
type Json<T> = Record<string, T>;
const urls = (files: Record<string, unknown>) => files as Record<string, string>;
const only = <T>(files: Json<T>) => Object.values(files)[0]!;

const MAP = only(
  import.meta.glob<{
    size: [number, number];
    cell: [number, number];
    level: number;
    origin: [number, number];
    objects: Array<SceneObject & { mask: string }>;
  }>('/docs/siege/chencang/art/s2-01-full-map/footprints.json', { eager: true, import: 'default' }),
);
const MAP_FILES = urls(
  import.meta.glob(
    '/docs/siege/chencang/art/s2-01-full-map/{composite.webp,grid.png,masks/*.png}',
    {
      query: '?url',
      import: 'default',
      eager: true,
    },
  ),
);
const LAYOUT = CHENCANG_ART_LAYOUT;
const SHEETS = import.meta.glob<SheetFootprints>(
  '/docs/siege/chencang/art/s[248]-*/footprints.json',
  {
    eager: true,
    import: 'default',
  },
);
const SHEET_IMAGES = urls(
  import.meta.glob('/docs/siege/chencang/art/s[248]-*/selected-transparent.png', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);
const sheet = (id: string) => SHEETS[`${ART}/${id}/footprints.json`]!;
const sheetImage = (id: string) => SHEET_IMAGES[`${ART}/${id}/selected-transparent.png`]!;

interface PatchInfo {
  at: [number, number];
  size: [number, number];
}
const PATCH_INFO = import.meta.glob<PatchInfo>('/docs/siege/chencang/art/s3-*/patches/*.json', {
  eager: true,
  import: 'default',
});
const PATCH_IMAGES = urls(
  import.meta.glob('/docs/siege/chencang/art/s3-*/patches/*.png', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);
const patchOf = (state: string) => {
  const key = Object.keys(PATCH_INFO).find((path) => path.endsWith(`/patches/${state}.json`))!;
  return { ...PATCH_INFO[key]!, href: PATCH_IMAGES[key.replace(/\.json$/, '.png')]! };
};
const INNER_WALL_JOB = only(
  import.meta.glob<{
    crop: [number, number];
    states: Array<{ id: string; mask?: string; object?: SceneObject }>;
  }>('/docs/siege/chencang/art/s3-07-inner-wall/job.json', { eager: true, import: 'default' }),
);
const INNER_WALL_MASKS = urls(
  import.meta.glob('/docs/siege/chencang/art/s3-07-inner-wall/steps/*-mask.png', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);

interface PoseFile {
  poses: Array<{
    name: string;
    cell: [number, number, number, number];
    path: string;
    anchor: [number, number];
    bodyHeight?: number;
    game?: { path: string; size: [number, number]; anchor: [number, number] };
  }>;
  targetBodyHeight?: number;
}
const POSE_FILES = import.meta.glob<PoseFile>(
  ['/docs/siege/chencang/art/s[15]-0*/poses.json', '/docs/siege/chencang/art/s8-05-*/poses.json'],
  {
    eager: true,
    import: 'default',
  },
);
const POSE_IMAGES = urls(
  import.meta.glob(
    [
      '/docs/siege/chencang/art/s[15]-0*/{poses,poses-game}/*.png',
      '/docs/siege/chencang/art/s8-05-*/poses-game/*.png',
    ],
    {
      query: '?url',
      import: 'default',
      eager: true,
    },
  ),
);
const EFFECT_IMAGES = urls(
  import.meta.glob('/docs/siege/chencang/art/s6-0{1,2}-*/poses-game/*.png', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);
const effect = (name: string) =>
  Object.entries(EFFECT_IMAGES).find(([path]) => path.endsWith(`/${name}.png`))?.[1];

const [W, H] = MAP.size;
const FRAME: SiegeFrame = {
  ox: MAP.origin[0],
  oy: MAP.origin[1],
  cw: MAP.cell[0],
  cd: MAP.cell[1],
  lh: MAP.level,
};
const WALL_HEIGHT = 3;
const WALL_FOOT = 0.85;
const BODY = 36;
const ZOOMS = [0.35, 0.5, 0.75, 1, 1.5];
const PAPER = '#ece4d2';

const CAMP = campSprites(
  LAYOUT,
  {
    tents: sheet('s2-08-camp-tents'),
    palisade: sheet('s2-09-palisade-kit'),
    workshop: sheet('s2-10-workshop'),
    scenery: sheet('s2-11-field-scenery'),
  },
  FRAME,
);
type Side = 'shu' | 'wei';
interface Pose {
  href: string;
  size: [number, number];
  anchor: [number, number];
}
const POSE_SETS: Record<string, { side: Side; poses: Map<string, Pose> }> = {};
for (const [path, file] of Object.entries(POSE_FILES)) {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const id = dir.split('/').pop()!.slice(0, 5);
  const side: Side = ['s1-06', 's5-03', 's5-06', 's8-05'].includes(id) ? 'wei' : 'shu';
  const poses = new Map<string, Pose>();
  for (const pose of file.poses) {
    if (pose.game)
      poses.set(pose.name, {
        href: POSE_IMAGES[`${dir}/${pose.game.path}`]!,
        size: pose.game.size,
        anchor: pose.game.anchor,
      });
    else {
      const scale = BODY / (pose.bodyHeight ?? file.targetBodyHeight ?? 300);
      poses.set(pose.name, {
        href: POSE_IMAGES[`${dir}/${pose.path}`]!,
        size: [pose.cell[2] * scale, pose.cell[3] * scale],
        anchor: [pose.anchor[0] * scale, pose.anchor[1] * scale],
      });
    }
  }
  if (poses.size && !['s5-04'].includes(id)) POSE_SETS[id] = { side, poses };
}

export {
  ART,
  MAP_DIR,
  MAP,
  MAP_FILES,
  FRAME,
  W,
  H,
  WALL_HEIGHT,
  WALL_FOOT,
  ZOOMS,
  PAPER,
  CAMP,
  INNER_WALL_JOB,
  INNER_WALL_MASKS,
  POSE_SETS,
  sheet,
  sheetImage,
  patchOf,
  effect,
};
