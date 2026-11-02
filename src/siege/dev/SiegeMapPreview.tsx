import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  campSprites,
  placePiece,
  spriteObject,
  type SheetFootprints,
  type Sprite,
} from '../render/mapPieces';
import {
  STANDING_EPSILON,
  compareDepth,
  pickCell,
  project,
  rectsOverlap,
  sliceObject,
  type SceneObject,
  type SceneSlice,
  type ScreenRect,
  type SiegeFrame,
} from '../render/scene';

/**
 * Dev-only full-map preview (`npm run dev`, then `?siege-map`): the approved
 * S2-01 painting cut into layers by its masks, the S3 state patches switched
 * in, the S2-08–S2-11 camp pieces placed from the layout, S4 engines, S5
 * troops and S6 fire. Everything sorts by the painter's order of scene.ts.
 * The S1 crop preview stays at `?siege-preview`.
 */
const ART = '/docs/siege/chencang/art';
const MAP_DIR = `${ART}/s2-01-full-map`;
type Json<T> = Record<string, T>;
const urls = (files: Record<string, unknown>) => files as Record<string, string>;
const only = <T,>(files: Json<T>) => Object.values(files)[0]!;

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
const LAYOUT = only(
  import.meta.glob<string>('/docs/siege/chencang/art/layout.txt', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
)
  .trimEnd()
  .split('\n');
const SHEETS = import.meta.glob<SheetFootprints>(
  '/docs/siege/chencang/art/s[24]-*/footprints.json',
  {
    eager: true,
    import: 'default',
  },
);
const SHEET_IMAGES = urls(
  import.meta.glob('/docs/siege/chencang/art/s[24]-*/selected-transparent.png', {
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
const POSE_FILES = import.meta.glob<PoseFile>('/docs/siege/chencang/art/s[15]-0*/poses.json', {
  eager: true,
  import: 'default',
});
const POSE_IMAGES = urls(
  import.meta.glob('/docs/siege/chencang/art/s[15]-0*/{poses,poses-game}/*.png', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);
const EFFECT_IMAGES = urls(
  import.meta.glob('/docs/siege/chencang/art/s6-01-fire-smoke/poses-game/*.png', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);
const effect = (name: string) => EFFECT_IMAGES[`${ART}/s6-01-fire-smoke/poses-game/${name}.png`]!;

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

// ---------------------------------------------------------------------------
// Pieces: the camp from the layout, and a sample of S4 engines mid-siege.

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
interface Engine {
  id: string;
  sheet: string;
  piece: number;
  at: [number, number];
  /** Levels the piece stands above the ground (the crane stands on the wall walk). */
  lift?: number;
  burning?: boolean;
}
/** North-west cell of each engine; ladders lean on the south wall's front edge (row 17). */
const ENGINES: Engine[] = [
  { id: 'ladder-west', sheet: 's4-02-ladder-on-wall', piece: 0, at: [19, 17] },
  { id: 'ladder-east', sheet: 's4-02-ladder-on-wall', piece: 1, at: [28, 17], burning: true },
  { id: 'ram', sheet: 's4-03-ram', piece: 0, at: [23, 18] },
  { id: 'tower', sheet: 's4-04-siege-tower', piece: 0, at: [20, 20] },
  { id: 'tower-burning', sheet: 's4-05-siege-tower-wrecks', piece: 0, at: [30, 20], burning: true },
  { id: 'tower-wreck', sheet: 's4-05-siege-tower-wrecks', piece: 1, at: [36, 21] },
  { id: 'cart-1', sheet: 's4-06-earth-cart', piece: 0, at: [15, 19] },
  { id: 'cart-2', sheet: 's4-06-earth-cart', piece: 2, at: [16, 19] },
  { id: 'cart-3', sheet: 's4-06-earth-cart', piece: 1, at: [33, 19] },
  { id: 'ladder-cart', sheet: 's4-01-ladder-cart', piece: 0, at: [13, 20] },
  { id: 'ladder-cart-east', sheet: 's4-01-ladder-cart', piece: 1, at: [35, 23] },
  { id: 'ladder-cart-burnt', sheet: 's4-01-ladder-cart', piece: 2, at: [11, 23] },
  { id: 'ram-wreck', sheet: 's4-03-ram', piece: 2, at: [39, 21] },
  { id: 'crane', sheet: 's4-07-millstone-crane', piece: 0, at: [21, 16], lift: WALL_HEIGHT },
];
const ENGINE_SPRITES: Array<Sprite & { burning: boolean }> = ENGINES.map((engine) => {
  const s = sheet(engine.sheet);
  const sprite = placePiece(s, engine.piece, engine.at, FRAME, {
    id: engine.id,
    kind: 'engine',
    raise: (engine.lift ?? 0) * s.level,
  });
  // Lifted pieces sort on top of what they stand on.
  return {
    ...sprite,
    height: sprite.height + (engine.lift ?? 0),
    burning: Boolean(engine.burning),
  };
});

// ---------------------------------------------------------------------------
// Troops: S1-05/S1-06 poses (scaled by body height) and S5 game-size poses.

type Side = 'shu' | 'wei';
interface Pose {
  href: string;
  size: [number, number];
  anchor: [number, number];
}
const POSE_SETS: Record<string, { label: string; side: Side; poses: Map<string, Pose> }> = {};
for (const [path, file] of Object.entries(POSE_FILES)) {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const id = dir.split('/').pop()!.slice(0, 5);
  const label =
    {
      's1-05': '蜀戟兵',
      's1-06': '魏弓兵',
      's5-01': '蜀兵攻城',
      's5-02': '蜀弩兵',
      's5-03': '魏步兵',
      's5-05': '诸葛亮',
      's5-06': '郝昭',
    }[id] ?? id;
  const side: Side = ['s1-06', 's5-03', 's5-06'].includes(id) ? 'wei' : 'shu';
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
  if (poses.size && !['s5-04'].includes(id)) POSE_SETS[id] = { label, side, poses };
}

type Facing = 'north' | 'east' | 'south' | 'west';
const FACINGS: Facing[] = ['north', 'east', 'south', 'west'];
const FACING_NAME: Record<Facing, string> = { north: '北', east: '东', south: '南', west: '西' };
interface Unit {
  id: string;
  set: string;
  x: number;
  y: number;
  h: number;
  facing: Facing;
  action: string;
  /** Climbers are drawn on the ladder, in front of it. */
  onLadder?: boolean;
}
const actionsOf = (set: string) => [
  ...new Set(
    [...(POSE_SETS[set]?.poses.keys() ?? [])].map((name) => name.split('-').slice(1).join('-')),
  ),
];
function poseFor(unit: Unit) {
  const set = POSE_SETS[unit.set];
  if (!set) return null;
  const facing = unit.facing === 'west' ? 'east' : unit.facing;
  const names = [
    `${facing}-${unit.action}`,
    `${facing}-idle`,
    `north-${unit.action}`,
    `south-${unit.action}`,
  ];
  const name = names.find((key) => set.poses.has(key)) ?? set.poses.keys().next().value!;
  return { ...set.poses.get(name)!, flip: unit.facing === 'west' };
}

const row = (
  set: string,
  xs: number[],
  y: number,
  h: number,
  facing: Facing,
  actions: string[],
): Unit[] =>
  xs.map((x, i) => ({
    id: `${set}-${x}-${y}`,
    set,
    x,
    y,
    h,
    facing,
    action: actions[i % actions.length]!,
  }));
const INITIAL_UNITS: Unit[] = [
  // Wei on the south wall walk and behind it.
  ...row('s1-06', [16, 17, 18, 30, 31], 16, WALL_HEIGHT, 'south', ['draw', 'fire', 'idle']),
  ...row('s5-03', [20, 27, 28], 16, WALL_HEIGHT, 'south', ['block', 'attack', 'idle']),
  {
    id: 'hao-zhao',
    set: 's5-06',
    x: 26,
    y: 16,
    h: WALL_HEIGHT,
    facing: 'south',
    action: 'command',
  },
  ...row('s5-03', [21, 28], 15, 0, 'south', ['idle']),
  // Shu climbing, filling the trench, and waiting in squads.
  {
    id: 'climber-1',
    set: 's5-01',
    x: 19,
    y: 18,
    h: 1.5,
    facing: 'north',
    action: 'climb-a',
    onLadder: true,
  },
  {
    id: 'climber-2',
    set: 's5-01',
    x: 19,
    y: 17,
    h: 2.6,
    facing: 'north',
    action: 'climb-top',
    onLadder: true,
  },
  ...row('s5-01', [14, 17, 32], 19, 0, 'north', ['dump', 'carry']),
  // Squads stand in the open: the workshops (rows 23–24) would hide anyone just north of them.
  ...row('s1-05', [8, 9, 10, 11, 12], 22, 0, 'north', ['march', 'idle']),
  ...row('s5-02', [34, 35, 36, 37, 38], 22, 0, 'north', ['shoot', 'idle']),
  { id: 'zhuge-liang', set: 's5-05', x: 24, y: 24, h: 0, facing: 'north', action: 'command' },
];

const WALL_CELLS = new Set(
  MAP.objects
    .filter((object) => object.kind === 'wall')
    .flatMap((object) => {
      const [x0, y0, x1, y1] = object.cells;
      const cells: string[] = [];
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push(`${x},${y}`);
      return cells;
    }),
);
const standsAt = (x: number, y: number, h: number) =>
  x >= 0 && x < 48 && y >= 0 && y < 32 && (h === WALL_HEIGHT) === WALL_CELLS.has(`${x},${y}`);
function unitFoot(unit: Unit): [number, number] {
  return project(FRAME, unit.x + 0.5, unit.y + (unit.h === WALL_HEIGHT ? WALL_FOOT : 0.5), unit.h);
}
function unitRect(unit: Unit): ScreenRect {
  const [fx, fy] = unitFoot(unit);
  return [fx - 18, fy - 40, fx + 18, fy + 2];
}
const unitDepth = (unit: Unit) => ({
  row: unit.y,
  height: (unit.onLadder ? WALL_HEIGHT : unit.h) + STANDING_EPSILON,
});

// ---------------------------------------------------------------------------
// State variants (S3): each choice is a patch on the painting.

const STATE_GROUPS = [
  {
    key: 'trench',
    label: '南城堑',
    options: [
      ['', '完好'],
      ['trench-half', '半填'],
      ['trench-filled', '填平'],
    ],
  },
  {
    key: 'south',
    label: '南门',
    options: [
      ['', '完好'],
      ['gate-south-damaged', '受损'],
      ['gate-south-broken', '门破'],
    ],
  },
  {
    key: 'north',
    label: '北门',
    options: [
      ['', '完好'],
      ['gate-north-broken', '门破'],
    ],
  },
  {
    key: 'west',
    label: '西门',
    options: [
      ['', '完好'],
      ['gate-west-broken', '门破'],
    ],
  },
  {
    key: 'east',
    label: '东门',
    options: [
      ['', '完好'],
      ['gate-east-broken', '门破'],
    ],
  },
  {
    key: 'wall',
    label: '重墙',
    options: [
      ['', '无'],
      ['inner-wall-works', '施工中'],
      ['inner-wall-built', '建成'],
    ],
  },
] as const;
type States = Record<(typeof STATE_GROUPS)[number]['key'], string>;
const NO_STATES: States = { trench: '', south: '', north: '', west: '', east: '', wall: '' };
const LATE_SIEGE: States = {
  trench: 'trench-filled',
  south: 'gate-south-broken',
  north: '',
  west: '',
  east: '',
  wall: 'inner-wall-built',
};

async function composePainting(states: States): Promise<string> {
  const load = async (href: string) => {
    const image = new Image();
    image.src = href;
    await image.decode();
    return image;
  };
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const context = canvas.getContext('2d')!;
  context.drawImage(await load(MAP_FILES[`${MAP_DIR}/composite.webp`]!), 0, 0);
  for (const state of Object.values(states).filter(Boolean)) {
    const patch = patchOf(state);
    context.drawImage(await load(patch.href), patch.at[0], patch.at[1]);
  }
  const blob = await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b!), 'image/webp', 0.95),
  );
  return URL.createObjectURL(blob);
}

type Layer =
  | {
      type: 'painted';
      slice: SceneSlice;
      mask: { href: string; x: number; y: number; w: number; h: number };
    }
  | { type: 'sprite'; slice: SceneSlice; sprite: Sprite };
const sliceKey = (slice: SceneSlice) => `${slice.objectId}-${slice.row}`;

export default function SiegeMapPreview() {
  const [states, setStates] = useState<States>(NO_STATES);
  const [painting, setPainting] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.5);
  const [showGrid, setShowGrid] = useState(false);
  const [showCamp, setShowCamp] = useState(true);
  const [showEngines, setShowEngines] = useState(true);
  const [showUnits, setShowUnits] = useState(true);
  const [showFire, setShowFire] = useState(true);
  const [silhouettes, setSilhouettes] = useState(true);
  const [xray, setXray] = useState(false);
  const [fade, setFade] = useState(true);
  const [units, setUnits] = useState(INITIAL_UNITS);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; h: number } | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(
    null,
  );

  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    composePainting(states).then((url) => {
      made = url;
      if (alive) setPainting(url);
      else URL.revokeObjectURL(url);
    });
    return () => {
      alive = false;
      if (made) setTimeout(() => URL.revokeObjectURL(made!), 1000);
    };
  }, [states]);

  // Painted layers (with the inner wall when it stands) and sprite layers.
  const layers = useMemo(() => {
    const list: Layer[] = MAP.objects.flatMap((object) =>
      sliceObject(FRAME, object).map((slice): Layer => ({
        type: 'painted',
        slice,
        mask: { href: MAP_FILES[`${MAP_DIR}/${object.mask}`]!, x: 0, y: 0, w: W, h: H },
      })),
    );
    const wall = INNER_WALL_JOB.states.find((state) => state.id === states.wall);
    if (wall?.object && wall.mask) {
      const href = INNER_WALL_MASKS[`${ART}/s3-07-inner-wall/${wall.mask}`]!;
      for (const slice of sliceObject(FRAME, wall.object))
        list.push({
          type: 'painted',
          slice,
          mask: { href, x: INNER_WALL_JOB.crop[0], y: INNER_WALL_JOB.crop[1], w: 1536, h: 1024 },
        });
    }
    const sprites = [...(showCamp ? CAMP : []), ...(showEngines ? ENGINE_SPRITES : [])];
    for (const sprite of sprites)
      for (const slice of sliceObject(FRAME, spriteObject(sprite)))
        list.push({ type: 'sprite', slice, sprite });
    return list;
  }, [states.wall, showCamp, showEngines]);

  const shown = showUnits ? units : [];
  const items = useMemo(() => {
    const list: Array<{ layer: Layer } | { unit: Unit }> = [
      ...layers.map((layer) => ({ layer })),
      ...shown.map((unit) => ({ unit })),
    ];
    const depth = (item: (typeof list)[number]) =>
      'layer' in item ? item.layer.slice : unitDepth(item.unit);
    return list.sort((a, b) => compareDepth(depth(a), depth(b)));
  }, [layers, shown]);
  const occluders = (unit: Unit) => {
    const rect = unitRect(unit);
    const depth = unitDepth(unit);
    return layers.filter(
      (layer) =>
        layer.slice.kind !== 'parapet' &&
        layer.slice.kind !== 'tree' &&
        compareDepth(layer.slice, depth) > 0 &&
        rectsOverlap(layer.slice.rect, rect),
    );
  };

  // Zoom toward the pointer.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = zoomRef.current;
      const index = ZOOMS.indexOf(current);
      const next =
        ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, index + (event.deltaY < 0 ? 1 : -1)))]!;
      if (next === current) return;
      const rect = element.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const cx = (element.scrollLeft + px) / current;
      const cy = (element.scrollTop + py) / current;
      setZoom(next);
      requestAnimationFrame(() => {
        element.scrollLeft = cx * next - px;
        element.scrollTop = cy * next - py;
      });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);
  // Open on the south gate.
  useEffect(() => {
    const element = frame.current;
    if (element) {
      element.scrollLeft = 1536 * zoom - element.clientWidth / 2;
      element.scrollTop = 840 * zoom - element.clientHeight / 2;
    }
  }, []);

  const toScene = (clientX: number, clientY: number): [number, number] | null => {
    const rect = svg.current?.getBoundingClientRect();
    return rect
      ? [((clientX - rect.left) / rect.width) * W, ((clientY - rect.top) / rect.height) * H]
      : null;
  };
  const pickAt = (clientX: number, clientY: number) => {
    const point = toScene(clientX, clientY);
    return point ? pickCell(FRAME, point[0], point[1], [0, WALL_HEIGHT], standsAt) : null;
  };
  const unitAt = (clientX: number, clientY: number) => {
    const point = toScene(clientX, clientY);
    if (!point) return null;
    return [...shown]
      .sort((a, b) => compareDepth(unitDepth(b), unitDepth(a)))
      .find((unit) => {
        const [x0, y0, x1, y1] = unitRect(unit);
        return point[0] >= x0 && point[0] <= x1 && point[1] >= y0 && point[1] <= y1;
      });
  };
  const picked = units.find((unit) => unit.id === selected);
  const updatePicked = (change: Partial<Unit>) =>
    setUnits((list) => list.map((unit) => (unit.id === selected ? { ...unit, ...change } : unit)));

  const label: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' };
  const check = (text: string, value: boolean, set: (v: boolean) => void) => (
    <label style={label}>
      <input type="checkbox" checked={value} onChange={(event) => set(event.target.checked)} />
      {text}
    </label>
  );
  const layerOpacity = xray ? 0.45 : 1;
  const drawLayer = (layer: Layer, key: string): ReactNode => {
    if (layer.type === 'painted')
      return painting ? (
        <g
          key={key}
          clipPath={`url(#clip-${key})`}
          mask={`url(#mask-${key})`}
          opacity={layerOpacity}
        >
          <image href={painting} width={W} height={H} />
        </g>
      ) : null;
    return (
      <g
        key={key}
        clipPath={`url(#clip-${key})`}
        opacity={layer.sprite.kind === 'engine' ? 1 : layerOpacity}
      >
        <SpriteImage sprite={layer.sprite} />
      </g>
    );
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 320px',
        height: '100vh',
        background: PAPER,
        color: '#2e2923',
        font: '14px system-ui, sans-serif',
      }}
    >
      <div
        ref={frame}
        style={{ overflow: 'auto', minHeight: 0 }}
        onPointerDown={(event) => {
          const element = frame.current!;
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            left: element.scrollLeft,
            top: element.scrollTop,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const state = drag.current;
          if (state && event.buttons === 1) {
            const dx = event.clientX - state.x;
            const dy = event.clientY - state.y;
            if (Math.abs(dx) + Math.abs(dy) > 4) state.moved = true;
            if (state.moved) {
              frame.current!.scrollLeft = state.left - dx;
              frame.current!.scrollTop = state.top - dy;
            }
            return;
          }
          setHover(pickAt(event.clientX, event.clientY));
        }}
        onPointerUp={(event) => {
          const state = drag.current;
          drag.current = null;
          if (state?.moved) return;
          const unit = unitAt(event.clientX, event.clientY);
          if (unit) return setSelected(unit.id === selected ? null : unit.id);
          const cell = pickAt(event.clientX, event.clientY);
          if (selected && cell) updatePicked({ ...cell, onLadder: false });
        }}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          ref={svg}
          width={W * zoom}
          height={H * zoom}
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block' }}
        >
          <defs>
            {layers.map((layer) => {
              const key = sliceKey(layer.slice);
              const [x0, y0, x1, y1] = layer.slice.rect;
              return (
                <clipPath key={key} id={`clip-${key}`}>
                  <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
                </clipPath>
              );
            })}
            {layers.flatMap((layer) =>
              layer.type === 'painted'
                ? [
                    <mask
                      key={sliceKey(layer.slice)}
                      id={`mask-${sliceKey(layer.slice)}`}
                      maskUnits="userSpaceOnUse"
                      x={0}
                      y={0}
                      width={W}
                      height={H}
                    >
                      <image
                        href={layer.mask.href}
                        x={layer.mask.x}
                        y={layer.mask.y}
                        width={layer.mask.w}
                        height={layer.mask.h}
                      />
                    </mask>,
                  ]
                : [],
            )}
            {shown.map((unit) => (
              <mask
                key={unit.id}
                id={`cover-${unit.id}`}
                maskUnits="userSpaceOnUse"
                x={0}
                y={0}
                width={W}
                height={H}
              >
                {occluders(unit).map((layer) => {
                  const key = sliceKey(layer.slice);
                  return (
                    <g key={key} clipPath={`url(#clip-${key})`}>
                      {layer.type === 'painted' ? (
                        <image
                          href={layer.mask.href}
                          x={layer.mask.x}
                          y={layer.mask.y}
                          width={layer.mask.w}
                          height={layer.mask.h}
                        />
                      ) : (
                        <g filter="url(#to-white)">
                          <SpriteImage sprite={layer.sprite} />
                        </g>
                      )}
                    </g>
                  );
                })}
              </mask>
            ))}
            <filter id="to-white">
              <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
            </filter>
            <filter id="ink-silhouette">
              <feColorMatrix
                in="SourceAlpha"
                type="matrix"
                values="0 0 0 0 0.16  0 0 0 0 0.15  0 0 0 0 0.13  0 0 0 1 0"
                result="ink"
              />
              <feMorphology in="ink" operator="dilate" radius={1.4} result="thick" />
              <feComposite in="thick" in2="ink" operator="out" result="outline" />
              <feFlood floodColor="#2a2622" floodOpacity={0.3} />
              <feComposite in2="ink" operator="in" result="wash" />
              <feMerge>
                <feMergeNode in="wash" />
                <feMergeNode in="outline" />
              </feMerge>
            </filter>
            {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
              <linearGradient
                key={side}
                id={`fade-${side}`}
                x1={side === 'right' ? 1 : 0}
                y1={side === 'bottom' ? 1 : 0}
                x2={side === 'left' ? 1 : 0}
                y2={side === 'top' ? 1 : 0}
              >
                <stop offset="0" stopColor={PAPER} stopOpacity={1} />
                <stop offset="1" stopColor={PAPER} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          {painting ? (
            <image href={painting} width={W} height={H} />
          ) : (
            <rect width={W} height={H} fill="#d8d0bd" />
          )}
          {items.map((item) =>
            'layer' in item ? (
              drawLayer(item.layer, sliceKey(item.layer.slice))
            ) : (
              <UnitSprite
                key={item.unit.id}
                unit={item.unit}
                selected={item.unit.id === selected}
              />
            ),
          )}
          {showFire && showEngines
            ? ENGINE_SPRITES.filter((sprite) => sprite.burning).map((sprite) => (
                <Fire key={sprite.id} sprite={sprite} />
              ))
            : null}
          {silhouettes
            ? shown.map((unit) =>
                occluders(unit).length ? (
                  <g key={unit.id} mask={`url(#cover-${unit.id})`} opacity={0.9}>
                    <UnitSprite unit={unit} silhouette />
                  </g>
                ) : null,
              )
            : null}
          {showGrid ? <image href={MAP_FILES[`${MAP_DIR}/grid.png`]} width={W} height={H} /> : null}
          {fade ? (
            <g pointerEvents="none">
              <rect width={160} height={H} fill="url(#fade-left)" />
              <rect x={W - 160} width={160} height={H} fill="url(#fade-right)" />
              <rect width={W} height={110} fill="url(#fade-top)" />
              <rect y={H - 110} width={W} height={110} fill="url(#fade-bottom)" />
            </g>
          ) : null}
          {hover ? <CellOutline cell={hover} active={Boolean(selected)} /> : null}
        </svg>
      </div>
      <aside
        style={{
          padding: 14,
          overflow: 'auto',
          display: 'grid',
          gap: 10,
          alignContent: 'start',
          borderLeft: '1px solid #b8ab8c',
        }}
      >
        <strong>陈仓全图预览（开发用）</strong>
        <div style={label}>
          缩放
          {ZOOMS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={zoom === value}
              style={{ fontWeight: zoom === value ? 700 : 400 }}
              onClick={() => setZoom(value)}
            >
              {Math.round(value * 100)}%
            </button>
          ))}
        </div>
        <strong>城防状态（S3 补丁）</strong>
        {STATE_GROUPS.map((group) => (
          <label key={group.key} style={label}>
            {group.label}
            <select
              value={states[group.key]}
              onChange={(event) => setStates((s) => ({ ...s, [group.key]: event.target.value }))}
            >
              {group.options.map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div style={label}>
          <button type="button" onClick={() => setStates(NO_STATES)}>
            全部完好
          </button>
          <button type="button" onClick={() => setStates(LATE_SIEGE)}>
            攻城后期
          </button>
        </div>
        <strong>图层</strong>
        {check('营地分件（S2-08～S2-11，按布局摆）', showCamp, setShowCamp)}
        {check('器械（S4）', showEngines, setShowEngines)}
        {check('燃烧特效（S6）', showFire, setShowFire)}
        {check('部队（S1、S5）', showUnits, setShowUnits)}
        {check('被挡住的部队画剪影', silhouettes, setSilhouettes)}
        {check('透视墙体', xray, setXray)}
        {check('地图四边淡出成纸色', fade, setFade)}
        {check('叠格子线', showGrid, setShowGrid)}
        {picked ? (
          <div style={{ display: 'grid', gap: 6, padding: 8, border: '1px solid #b8ab8c' }}>
            <strong>
              {POSE_SETS[picked.set]?.label} · ({picked.x}, {picked.y})
              {picked.h === WALL_HEIGHT ? ' 墙头' : ''}
              {occluders(picked).length ? ' · 被挡' : ''}
            </strong>
            <div style={label}>
              朝向
              {FACINGS.map((facing) => (
                <button
                  key={facing}
                  type="button"
                  aria-pressed={picked.facing === facing}
                  style={{ fontWeight: picked.facing === facing ? 700 : 400 }}
                  onClick={() => updatePicked({ facing })}
                >
                  {FACING_NAME[facing]}
                </button>
              ))}
            </div>
            <div style={label}>
              动作
              {actionsOf(picked.set).map((action) => (
                <button
                  key={action}
                  type="button"
                  aria-pressed={picked.action === action}
                  style={{ fontWeight: picked.action === action ? 700 : 400 }}
                  onClick={() => updatePicked({ action })}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <button type="button" onClick={() => setUnits(INITIAL_UNITS)}>
          部队复位
        </button>
        <small>
          点部队选中，再点格子把它挪过去（点墙顶就站上墙头）。拖动平移，滚轮缩放。南门、北门等状态由
          S3 补丁拼进整画；重墙建成时它也切成一层，会挡住墙后的部队。营地分件按 layout.txt
          的符号摆放，器械是几件示例。
        </small>
        {hover ? (
          <small>
            指针下：({hover.x}, {hover.y}){hover.h ? ' 墙顶' : ' 地面'}
          </small>
        ) : null}
      </aside>
    </div>
  );
}

/** Draws a sheet crop into its map rectangle. */
function SpriteImage({ sprite }: { sprite: Sprite }) {
  const [x0, y0, x1, y1] = sprite.rect;
  const [c0, c1, c2, c3] = sprite.crop;
  const size = SHEETS[`${ART}/${sprite.sheet}/footprints.json`]!.size;
  return (
    <svg
      x={x0}
      y={y0}
      width={x1 - x0}
      height={y1 - y0}
      viewBox={`${c0} ${c1} ${c2 - c0} ${c3 - c1}`}
      preserveAspectRatio="none"
      overflow="hidden"
    >
      <image href={sheetImage(sprite.sheet)} width={size[0]} height={size[1]} />
    </svg>
  );
}

/** S6 flames and smoke over a burning engine; flicker and drift are animated here. */
function Fire({ sprite }: { sprite: Sprite }) {
  const [x0, y0, x1, y1] = sprite.rect;
  const cx = (x0 + x1) / 2;
  const base = y1 - (y1 - y0) * 0.25;
  return (
    <g pointerEvents="none">
      <image
        href={effect('smoke-column')}
        x={cx - 20}
        y={y0 - 120}
        width={110}
        height={130}
        opacity={0.7}
      >
        <animate
          attributeName="y"
          values={`${y0 - 110};${y0 - 130};${y0 - 110}`}
          dur="6s"
          repeatCount="indefinite"
        />
      </image>
      <image href={effect('flame-large')} x={cx - 47} y={base - 72} width={94} height={80}>
        <animate
          attributeName="opacity"
          values="1;0.75;0.95;0.8;1"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </image>
      <image href={effect('flame-medium')} x={cx - 24} y={y0 + 10} width={48} height={52}>
        <animate
          attributeName="opacity"
          values="0.85;1;0.7;1;0.85"
          dur="1.1s"
          repeatCount="indefinite"
        />
      </image>
    </g>
  );
}

function UnitSprite({
  unit,
  selected = false,
  silhouette = false,
}: {
  unit: Unit;
  selected?: boolean;
  silhouette?: boolean;
}) {
  const [fx, fy] = unitFoot(unit);
  const pose = poseFor(unit);
  if (!pose) return null;
  const side = POSE_SETS[unit.set]!.side;
  return (
    <g transform={`translate(${fx} ${fy})`}>
      {silhouette ? null : (
        <ellipse
          rx={13}
          ry={5}
          fill={side === 'shu' ? '#5f9a5a' : '#2f4a6e'}
          opacity={0.55}
          stroke={selected ? '#f2c14e' : 'none'}
          strokeWidth={3}
        />
      )}
      <image
        href={pose.href}
        x={-pose.anchor[0]}
        y={-pose.anchor[1]}
        width={pose.size[0]}
        height={pose.size[1]}
        transform={pose.flip ? 'scale(-1 1)' : undefined}
        filter={silhouette ? 'url(#ink-silhouette)' : undefined}
      />
    </g>
  );
}

function CellOutline({
  cell,
  active,
}: {
  cell: { x: number; y: number; h: number };
  active: boolean;
}) {
  const [x, y] = project(FRAME, cell.x, cell.y, cell.h);
  return (
    <rect
      x={x}
      y={y}
      width={FRAME.cw}
      height={FRAME.cd}
      fill={active ? 'rgba(242, 193, 78, 0.25)' : 'none'}
      stroke={cell.h ? '#f2c14e' : '#2e2923'}
      strokeWidth={2}
      pointerEvents="none"
    />
  );
}
