// Art-only S1 crop fixture: x/y are original fine art coordinates, never board positions.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { resolvePublicAsset } from '../../v03/rendering/assets';
import { betaDraws, type KitObject, type KitPiece } from '../render/betaCity';
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
import { composeBeta } from './composeBeta';

/**
 * Dev-only S1 test scene (`npm run dev`, then `?siege-preview`), art plan §11.1.
 * α (chosen for DS5, art plan §9.2): the chosen S1-01 painting cut into layers
 * by the blockout masks. β, kept for comparison: the S1-04 ground plate with
 * the S1-02 gate and S1-03 wall kit laid on it, painted into one picture and
 * cut with the same masks. Sample units (S1-05, S1-06 poses) are sorted among
 * the layers.
 */
const ART = '/docs/siege/chencang/art';
const DIR = `${ART}/s1-01-city-vignette`;
const FOOTPRINTS = Object.values(
  import.meta.glob('/docs/siege/chencang/art/s1-01-city-vignette/footprints.json', {
    eager: true,
    import: 'default',
  }),
)[0] as {
  size: [number, number];
  cell: [number, number];
  level: number;
  origin: [number, number];
  objects: SceneObject[];
};
const urls = (files: Record<string, unknown>) => files as Record<string, string>;
const MASKS = urls(
  import.meta.glob('/docs/siege/chencang/art/s1-01-city-vignette/masks/*.png', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);
const ATTEMPTS = urls(
  import.meta.glob('/docs/siege/chencang/art/s1-01-city-vignette/attempts/*.{webp,png}', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);
const GUIDES = urls(
  import.meta.glob('/docs/siege/chencang/art/s1-01-city-vignette/{blockout,grid}.png', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);
const first = <T,>(files: Record<string, unknown>) => Object.values(files)[0] as T;
const GATE = first<{
  size: [number, number];
  cell: [number, number];
  origin: [number, number];
  objects: KitObject[];
}>(
  import.meta.glob('/docs/siege/chencang/art/s1-02-south-gate/footprints.json', {
    eager: true,
    import: 'default',
  }),
);
const KIT = first<{
  pieces: Array<{
    name: string;
    cell: KitPiece['cell'];
    footprint: { origin: [number, number]; objects: KitObject[] };
  }>;
}>(
  import.meta.glob('/docs/siege/chencang/art/s1-03-wall-kit/pieces.json', {
    eager: true,
    import: 'default',
  }),
);
const BETA_IMAGES = urls(
  import.meta.glob(
    [
      '/docs/siege/chencang/art/s1-0[23]-*/selected-transparent.png',
      '/docs/siege/chencang/art/s1-04-ground-plate/attempts/*.webp',
    ],
    { query: '?url', import: 'default', eager: true },
  ),
);
interface PoseFile {
  asset: string;
  poses: Array<{
    name: string;
    cell: [number, number, number, number];
    bodyHeight: number;
    anchor: [number, number];
    path: string;
  }>;
}
const POSE_FILES = import.meta.glob<PoseFile>('/docs/siege/chencang/art/s1-0[56]-*/poses.json', {
  eager: true,
  import: 'default',
});
const POSE_IMAGES = urls(
  import.meta.glob('/docs/siege/chencang/art/s1-0[56]-*/poses/*.png', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);

const [W, H] = FOOTPRINTS.size;
const FRAME: SiegeFrame = {
  ox: FOOTPRINTS.origin[0],
  oy: FOOTPRINTS.origin[1],
  cw: FOOTPRINTS.cell[0],
  cd: FOOTPRINTS.cell[1],
  lh: FOOTPRINTS.level,
};
const CHOSEN = 'v2-a.webp';
/** The S1-04 attempt used under the β pieces. */
const GROUND = 'v2.webp';
const WALL_HEIGHT = 3;
/** Wall-top units stand near the parapet so it covers their lower half (plan §9.1). */
const WALL_FOOT = 0.85;
/** Plan §5.2: a figure is about 36px from soles to helmet at 100%. */
const BODY = 36;
/**
 * The ink-04 stand-ins are 512px boxes with the figure in the lower part, feet
 * at 93% of the height; at 56px the figure is about 36px tall.
 */
const SPRITE = 56;
const SPRITE_FOOT = 0.93;
/** The figure's own box around the feet, for occlusion tests. */
const FIGURE: ScreenRect = [-18, -38, 18, 2];
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5];

type Side = 'shu' | 'wei';
type Troop = 'infantry' | 'archer';
type Facing = 'north' | 'east' | 'south' | 'west';
const FACINGS: Facing[] = ['north', 'east', 'south', 'west'];
const FACING_NAME: Record<Facing, string> = { north: '北', east: '东', south: '南', west: '西' };
/** Pose columns of the S1-05 and S1-06 sheets. */
const ACTIONS: Record<Troop, string[]> = {
  infantry: ['idle', 'march', 'attack'],
  archer: ['idle', 'draw', 'fire'],
};
const ACTION_NAME: Record<string, string> = {
  idle: '待机',
  march: '行进',
  attack: '攻击',
  draw: '拉弓',
  fire: '火箭',
};
interface PreviewUnit {
  id: string;
  side: Side;
  troop: Troop;
  x: number;
  y: number;
  h: number;
  facing: Facing;
  action: string;
}

/** Plan §11.1: six Shu outside the trench and on the bridge, two Wei archers on the south wall, two Wei infantry behind it. */
const INITIAL_UNITS: PreviewUnit[] = [
  {
    id: 'shu-1',
    side: 'shu',
    troop: 'infantry',
    x: 17,
    y: 19,
    h: 0,
    facing: 'north',
    action: 'idle',
  },
  {
    id: 'shu-2',
    side: 'shu',
    troop: 'infantry',
    x: 20,
    y: 20,
    h: 0,
    facing: 'north',
    action: 'march',
  },
  {
    id: 'shu-3',
    side: 'shu',
    troop: 'infantry',
    x: 23,
    y: 18,
    h: 0,
    facing: 'north',
    action: 'attack',
  },
  {
    id: 'shu-4',
    side: 'shu',
    troop: 'infantry',
    x: 24,
    y: 17,
    h: 0,
    facing: 'north',
    action: 'march',
  },
  {
    id: 'shu-5',
    side: 'shu',
    troop: 'infantry',
    x: 27,
    y: 19,
    h: 0,
    facing: 'east',
    action: 'march',
  },
  {
    id: 'shu-6',
    side: 'shu',
    troop: 'infantry',
    x: 30,
    y: 20,
    h: 0,
    facing: 'west',
    action: 'attack',
  },
  {
    id: 'wei-1',
    side: 'wei',
    troop: 'archer',
    x: 18,
    y: 16,
    h: WALL_HEIGHT,
    facing: 'south',
    action: 'draw',
  },
  {
    id: 'wei-2',
    side: 'wei',
    troop: 'archer',
    x: 29,
    y: 16,
    h: WALL_HEIGHT,
    facing: 'south',
    action: 'fire',
  },
  {
    id: 'wei-3',
    side: 'wei',
    troop: 'infantry',
    x: 20,
    y: 15,
    h: 0,
    facing: 'south',
    action: 'idle',
  },
  {
    id: 'wei-4',
    side: 'wei',
    troop: 'infantry',
    x: 27,
    y: 15,
    h: 0,
    facing: 'south',
    action: 'idle',
  },
];
const SIDE_COLOR: Record<Side, string> = { shu: '#5f9a5a', wei: '#2f4a6e' };
const SIDE_NAME: Record<Side, string> = { shu: '蜀', wei: '魏' };
const TROOP_NAME = { infantry: '步', archer: '弓' } as const;

interface Pose {
  href: string;
  size: [number, number];
  anchor: [number, number];
  scale: number;
}
/** S1-05 is the Shu halberdier, S1-06 the Wei archer; other troops have no siege art yet. */
const POSE_SETS: Partial<Record<`${Side}-${Troop}`, { asset: string; poses: Map<string, Pose> }>> =
  Object.fromEntries(
    Object.entries(POSE_FILES).map(([path, file]) => {
      const dir = path.slice(0, path.lastIndexOf('/'));
      const poses = new Map(
        file.poses.map((pose): [string, Pose] => [
          pose.name,
          {
            href: POSE_IMAGES[`${dir}/${pose.path}`]!,
            size: [pose.cell[2], pose.cell[3]],
            anchor: pose.anchor,
            scale: BODY / pose.bodyHeight,
          },
        ]),
      );
      return [file.asset === 's1-05' ? 'shu-infantry' : 'wei-archer', { asset: file.asset, poses }];
    }),
  );

/** West is the east pose mirrored; a missing pose falls back to standing in the same direction. */
function poseFor(unit: PreviewUnit) {
  const set = POSE_SETS[`${unit.side}-${unit.troop}`];
  if (!set) return null;
  const facing = unit.facing === 'west' ? 'east' : unit.facing;
  const wanted = `${facing}-${unit.action}`;
  const name = [wanted, `${facing}-idle`, 'south-idle'].find((key) => set.poses.has(key))!;
  return {
    ...set.poses.get(name)!,
    asset: set.asset,
    flip: unit.facing === 'west',
    exact: name === wanted,
  };
}

const BETA_DRAWS = betaDraws({
  frame: FRAME,
  city: FOOTPRINTS.objects,
  gate: { name: 's1-02', cell: [0, 0, ...GATE.size], origin: GATE.origin, objects: GATE.objects },
  kit: KIT.pieces.map((piece) => ({
    name: piece.name,
    cell: piece.cell,
    origin: piece.footprint.origin,
    objects: piece.footprint.objects,
  })),
  scale: GATE.cell[0] / FRAME.cw,
});
/** Objects that still come from the α painting in β (no piece until S2). */
const BETA_MISSING = new Set(
  BETA_DRAWS.flatMap((draw) => (draw.type === 'painting' ? [draw.objectId] : [])),
);
const NONE = new Set<string>();

const WALL_CELLS = new Set(
  FOOTPRINTS.objects
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

const SLICES: SceneSlice[] = FOOTPRINTS.objects.flatMap((object) => sliceObject(FRAME, object));
const sliceKey = (slice: SceneSlice) => `${slice.objectId}-${slice.row}`;
const maskUrl = (id: string) => MASKS[`${DIR}/masks/${id}.png`];

function unitFoot(unit: PreviewUnit): [number, number] {
  return project(FRAME, unit.x + 0.5, unit.y + (unit.h === WALL_HEIGHT ? WALL_FOOT : 0.5), unit.h);
}
function unitRect(unit: PreviewUnit): ScreenRect {
  const [fx, fy] = unitFoot(unit);
  return [fx + FIGURE[0], fy + FIGURE[1], fx + FIGURE[2], fy + FIGURE[3]];
}
const unitDepth = (unit: PreviewUnit) => ({ row: unit.y, height: unit.h + STANDING_EPSILON });
const spriteUrl = (troop: Troop) =>
  resolvePublicAsset(`assets/v03/units/${troop}-small-ink-04.webp`, import.meta.env.BASE_URL);

/** Layers drawn after the unit that overlap it; parapets are left out because covering legs is their job. */
function occluders(unit: PreviewUnit, slices: SceneSlice[]): SceneSlice[] {
  const rect = unitRect(unit);
  const depth = unitDepth(unit);
  return slices.filter(
    (slice) =>
      slice.kind !== 'parapet' && compareDepth(slice, depth) > 0 && rectsOverlap(slice.rect, rect),
  );
}

export default function SiegePreview() {
  const attempts = useMemo(
    () =>
      Object.entries(ATTEMPTS)
        .map(([path, href]) => ({ name: path.split('/').pop()!, href }))
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })),
    [],
  );
  const [background, setBackground] = useState(
    attempts.find((attempt) => attempt.name === CHOSEN)?.href ??
      attempts[0]?.href ??
      GUIDES[`${DIR}/blockout.png`]!,
  );
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);
  const [layersOnly, setLayersOnly] = useState(false);
  const [showUnits, setShowUnits] = useState(true);
  const [silhouettes, setSilhouettes] = useState(true);
  const [xray, setXray] = useState(false);
  const [units, setUnits] = useState(INITIAL_UNITS);
  const [selected, setSelected] = useState<string | null>(null);
  const [beta, setBeta] = useState<{ full: string; kit: string } | { error: string } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; h: number } | null>(null);
  const frame = useRef<HTMLDivElement | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(
    null,
  );
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Paint both β pictures once: with the missing objects cut from the α painting, and without.
  useEffect(() => {
    const image = (path: string) => BETA_IMAGES[`${ART}/${path}`]!;
    const sources = {
      size: [W, H] as [number, number],
      ground: image(`s1-04-ground-plate/attempts/${GROUND}`),
      gate: image('s1-02-south-gate/selected-transparent.png'),
      kit: image('s1-03-wall-kit/selected-transparent.png'),
      painting: ATTEMPTS[`${DIR}/attempts/${CHOSEN}`]!,
      mask: (id: string) => maskUrl(id)!,
      bbox: (id: string) => FOOTPRINTS.objects.find((object) => object.id === id)!.bbox,
    };
    let alive = true;
    const made: string[] = [];
    Promise.all([composeBeta(BETA_DRAWS, sources, true), composeBeta(BETA_DRAWS, sources, false)])
      .then(([full, kit]) => {
        made.push(full, kit);
        if (alive) setBeta({ full, kit });
      })
      .catch((error: Error) => alive && setBeta({ error: error.message }));
    return () => {
      alive = false;
      made.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const betaReady = beta && 'full' in beta ? beta : null;
  // Without the α fill the missing objects are bare ground, so they must not cover anyone.
  const slices = useMemo(() => {
    const hidden = background === betaReady?.kit ? BETA_MISSING : NONE;
    return SLICES.filter((slice) => !hidden.has(slice.objectId));
  }, [background, betaReady]);
  const shown = showUnits ? units : [];
  const items = useMemo(() => {
    const list: Array<{ slice: SceneSlice } | { unit: PreviewUnit }> = [
      ...slices.map((slice) => ({ slice })),
      ...shown.map((unit) => ({ unit })),
    ];
    const depth = (item: (typeof list)[number]) =>
      'slice' in item ? item.slice : unitDepth(item.unit);
    // Stable sort keeps blockout order for equal keys; units go after slices of equal depth.
    return list.sort((a, b) => compareDepth(depth(a), depth(b)));
  }, [shown, slices]);
  const picked = units.find((unit) => unit.id === selected);
  const pickedPose = picked ? poseFor(picked) : null;
  const updatePicked = (change: Partial<PreviewUnit>) =>
    setUnits((list) => list.map((unit) => (unit.id === selected ? { ...unit, ...change } : unit)));

  // Zoom toward the pointer; a non-passive listener so the page does not scroll.
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

  const toScene = (clientX: number, clientY: number): [number, number] | null => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return null;
    return [((clientX - rect.left) / rect.width) * W, ((clientY - rect.top) / rect.height) * H];
  };
  const pickAt = (clientX: number, clientY: number) => {
    const point = toScene(clientX, clientY);
    return point ? pickCell(FRAME, point[0], point[1], [0, WALL_HEIGHT], standsAt) : null;
  };
  const unitAt = (clientX: number, clientY: number) => {
    const point = toScene(clientX, clientY);
    if (!point) return null;
    // The front-most unit under the pointer wins.
    return [...shown]
      .sort((a, b) => compareDepth(unitDepth(b), unitDepth(a)))
      .find((unit) => {
        const [x0, y0, x1, y1] = unitRect(unit);
        return point[0] >= x0 && point[0] <= x1 && point[1] >= y0 && point[1] <= y1;
      });
  };

  const label: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };
  const sliceOpacity = xray ? 0.45 : 1;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 300px',
        height: '100vh',
        background: '#e8dfcc',
        color: '#2e2923',
        font: '14px system-ui, sans-serif',
      }}
    >
      <div
        ref={frame}
        style={{ overflow: 'auto', minHeight: 0, cursor: drag.current ? 'grabbing' : 'default' }}
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
          if (selected && cell)
            setUnits((list) =>
              list.map((entry) => (entry.id === selected ? { ...entry, ...cell } : entry)),
            );
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
            {FOOTPRINTS.objects.map((object) => (
              <mask
                key={object.id}
                id={`mask-${object.id}`}
                maskUnits="userSpaceOnUse"
                x={0}
                y={0}
                width={W}
                height={H}
              >
                <image href={maskUrl(object.id)} width={W} height={H} />
              </mask>
            ))}
            {SLICES.map((slice) => {
              const [x0, y0, x1, y1] = slice.rect;
              return (
                <clipPath key={sliceKey(slice)} id={`clip-${sliceKey(slice)}`}>
                  <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
                </clipPath>
              );
            })}
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
                {occluders(unit, slices).map((slice) => (
                  <g key={sliceKey(slice)} clipPath={`url(#clip-${sliceKey(slice)})`}>
                    <image href={maskUrl(slice.objectId)} width={W} height={H} />
                  </g>
                ))}
              </mask>
            ))}
            {/* Plan §9.4: an ink outline with a faint wash, so a hidden unit reads through the wall. */}
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
          </defs>
          {layersOnly ? (
            <rect width={W} height={H} fill="#cfc9bb" />
          ) : (
            <image href={background} width={W} height={H} />
          )}
          {items.map((item) =>
            'slice' in item ? (
              <g
                key={sliceKey(item.slice)}
                clipPath={`url(#clip-${sliceKey(item.slice)})`}
                mask={`url(#mask-${item.slice.objectId})`}
                opacity={sliceOpacity}
              >
                <image href={background} width={W} height={H} />
              </g>
            ) : (
              <UnitSprite
                key={item.unit.id}
                unit={item.unit}
                selected={item.unit.id === selected}
              />
            ),
          )}
          {silhouettes
            ? shown.map((unit) =>
                occluders(unit, slices).length ? (
                  <g key={unit.id} mask={`url(#cover-${unit.id})`} opacity={0.9}>
                    <UnitSprite unit={unit} silhouette />
                  </g>
                ) : null,
              )
            : null}
          {showGrid ? <image href={GUIDES[`${DIR}/grid.png`]} width={W} height={H} /> : null}
          {hover ? <CellOutline cell={hover} active={Boolean(selected)} /> : null}
        </svg>
      </div>
      <aside
        style={{
          padding: 14,
          overflow: 'auto',
          display: 'grid',
          gap: 12,
          alignContent: 'start',
          borderLeft: '1px solid #b8ab8c',
        }}
      >
        <strong>攻城 S1 预览（开发用）</strong>
        <label style={label}>
          画面
          <select value={background} onChange={(event) => setBackground(event.target.value)}>
            {attempts.map((attempt) => (
              <option key={attempt.href} value={attempt.href}>
                α · {attempt.name}
                {attempt.name === CHOSEN ? '（定稿）' : ''}
              </option>
            ))}
            {betaReady ? (
              <>
                <option value={betaReady.full}>β · 分件拼城，缺件用 α 补</option>
                <option value={betaReady.kit}>β · 只有分件</option>
              </>
            ) : null}
            <option value={GUIDES[`${DIR}/blockout.png`]}>灰盒 blockout.png</option>
          </select>
        </label>
        <small>
          画法已定 α（2026-11-01），β 只作对照：S1-04 地表 {GROUND} + S1-02 南门 + S1-03
          城墙模块（直段两端各裁 4px 墨线收边、稍拉宽盖住接缝）。没有分件的
          {BETA_MISSING.size} 个物件（北门、东西门、北面两座角楼、城内建筑）从 α
          原画按蒙版抠来补上。
          {beta === null ? ' 正在拼图……' : 'error' in beta ? ` 拼图失败：${beta.error}` : ''}
        </small>
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
              {value * 100}%
            </button>
          ))}
        </div>
        <label style={label}>
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(event) => setShowGrid(event.target.checked)}
          />
          叠格子线（grid.png）
        </label>
        <label style={label}>
          <input
            type="checkbox"
            checked={layersOnly}
            onChange={(event) => setLayersOnly(event.target.checked)}
          />
          只看切出的立体件（检查切层边缘）
        </label>
        <label style={label}>
          <input
            type="checkbox"
            checked={showUnits}
            onChange={(event) => setShowUnits(event.target.checked)}
          />
          示例部队（蜀 6、魏 4）
        </label>
        <label style={label}>
          <input
            type="checkbox"
            checked={silhouettes}
            onChange={(event) => setSilhouettes(event.target.checked)}
          />
          被挡住的部队画剪影
        </label>
        <label style={label}>
          <input
            type="checkbox"
            checked={xray}
            onChange={(event) => setXray(event.target.checked)}
          />
          透视墙体
        </label>
        <div style={{ display: 'grid', gap: 4 }}>
          {units.map((unit) => (
            <button
              key={unit.id}
              type="button"
              aria-pressed={unit.id === selected}
              style={{
                textAlign: 'left',
                fontWeight: unit.id === selected ? 700 : 400,
                borderLeft: `6px solid ${SIDE_COLOR[unit.side]}`,
              }}
              onClick={() => setSelected(unit.id === selected ? null : unit.id)}
            >
              {SIDE_NAME[unit.side]}
              {TROOP_NAME[unit.troop]} · ({unit.x}, {unit.y}){unit.h ? ' · 墙头' : ''} · 朝
              {FACING_NAME[unit.facing]} {ACTION_NAME[unit.action]}
              {occluders(unit, slices).length ? ' · 被挡' : ''}
            </button>
          ))}
          <button type="button" onClick={() => setUnits(INITIAL_UNITS)}>
            部队复位
          </button>
        </div>
        {picked ? (
          <div style={{ display: 'grid', gap: 6 }}>
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
              {ACTIONS[picked.troop].map((action) => (
                <button
                  key={action}
                  type="button"
                  aria-pressed={picked.action === action}
                  style={{ fontWeight: picked.action === action ? 700 : 400 }}
                  onClick={() => updatePicked({ action })}
                >
                  {ACTION_NAME[action]}
                </button>
              ))}
            </div>
            <small>
              {pickedPose
                ? `${pickedPose.asset.toUpperCase()} 姿态${pickedPose.flip ? '（朝东镜像）' : ''}${pickedPose.exact ? '' : '；表里没有这个朝向的这个动作，先用待机'}`
                : '这个兵种还没有攻城图，暂用野战 ink-04 小兵'}
            </small>
          </div>
        ) : null}
        <small>
          点部队选中，再点格子把它挪过去；点到墙顶就站上墙头（3
          层），其余站在地面。拖动平移，滚轮缩放。蜀戟兵用 S1-05、魏弓兵用 S1-06，人高约 {BODY}
          px；魏步兵还没有攻城图，暂用野战 ink-04 小兵。
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

function UnitSprite({
  unit,
  selected = false,
  silhouette = false,
}: {
  unit: PreviewUnit;
  selected?: boolean;
  silhouette?: boolean;
}) {
  const [fx, fy] = unitFoot(unit);
  const pose = poseFor(unit);
  // Pose sheets are registered at the feet; the ink-04 stand-ins face right.
  const image = pose
    ? {
        href: pose.href,
        x: -pose.anchor[0] * pose.scale,
        y: -pose.anchor[1] * pose.scale,
        width: pose.size[0] * pose.scale,
        height: pose.size[1] * pose.scale,
        flip: pose.flip,
      }
    : {
        href: spriteUrl(unit.troop),
        x: -SPRITE / 2,
        y: -SPRITE * SPRITE_FOOT,
        width: SPRITE,
        height: SPRITE,
        flip: unit.facing === 'west',
      };
  return (
    <g transform={`translate(${fx} ${fy})`}>
      {silhouette ? null : (
        <ellipse
          rx={15}
          ry={6}
          fill={SIDE_COLOR[unit.side]}
          opacity={0.7}
          stroke={selected ? '#f2c14e' : 'none'}
          strokeWidth={3}
        />
      )}
      <image
        href={image.href}
        x={image.x}
        y={image.y}
        width={image.width}
        height={image.height}
        transform={image.flip ? 'scale(-1 1)' : undefined}
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
