import { project, rectsOverlap, STANDING_EPSILON, type DepthKey, type ScreenRect } from './scene';
import { CHENCANG_LAYOUT, layoutSymbol } from '../content/chencang';
import { fineSpanOf } from '../content/coarseGrid';
import { cellTerrain, isMapCell } from '../rules/map';
import type { Cell, SiegePosition, SiegeState } from '../rules/types';
import MAP from '../../../docs/siege/chencang/art/s2-01-full-map/footprints.json' with { type: 'json' };

const FRAME = {
  ox: MAP.origin[0]!,
  oy: MAP.origin[1]!,
  cw: MAP.cell[0]!,
  cd: MAP.cell[1]!,
  lh: MAP.level,
};

export const centre = (r: ScreenRect): [number, number] => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
export const contains = (r: ScreenRect, x: number, y: number) =>
  x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
const wallColumn = (x: number) => x >= 4 && x <= 12;
const innerColumn = (x: number) => layoutSymbol(x, 6) === 'R';
const heightOf = (p: SiegePosition) =>
  p.level === 'wall' ? (layoutSymbol(p.x, p.y) === 'R' ? 2 : 3) : 0;

/** Standing planes use the original inclusive fine spans. Ramps read as ground. */
export function planeRect(p: SiegePosition): ScreenRect {
  const s = fineSpanOf(p),
    h = heightOf(p);
  return [...project(FRAME, s.west, s.north, h), ...project(FRAME, s.east + 1, s.south + 1, h)];
}

/** Half-open rectangles give shared edges exactly one owner. Hidden north trench
 * cells have no screen area. Optional state only affects the row behind a built R. */
export function hitRect(p: SiegePosition, state?: SiegeState): ScreenRect | null {
  if (!isMapCell(p.x, p.y)) return null;
  if (p.y === 1 && wallColumn(p.x)) return null;
  const r = planeRect(p);
  const y = (fine: number) => project(FRAME, 0, fine)[1];
  if (wallColumn(p.x)) {
    if (p.y === 0) r[3] = y(2.5);
    if (p.y === 6) r[3] = y(14.5);
    if (p.y === 5 && innerColumn(p.x) && state && cellTerrain(state, p.x, 6) === 'wall')
      r[3] = y(11);
  }
  if (p.level === 'wall' && p.y === 3 && (p.x === 4 || p.x === 12)) r[1] = y(5);
  if (p.level === 'wall' && (p.y === 2 || p.y === 7)) {
    // Gate tops own only their top. The other cells also own the visible face.
    if (layoutSymbol(p.x, p.y) !== 'G') r[3] = y(p.y === 2 ? 5 : 17);
  }
  if (layoutSymbol(p.x, p.y) === 'G') {
    if (p.y === 2 || p.y === 7) {
      if (p.level === 'ground') {
        r[1] = y(p.y === 2 ? 3.5 : 15.5);
        r[3] = y(p.y === 2 ? 5 : 17);
      }
    } else {
      // Side passages are hidden by the roof. Reserve a 64×24 inner-mouth
      // strip at the south end of the top's rect; no overlap with either wall.
      r[1] = y(p.level === 'wall' ? 7.5 : 10);
      r[3] = y(p.level === 'wall' ? 10 : 10.5);
    }
  }
  return r;
}

/** Fine-coordinate feet measured against the painting; ground overrides only.
 * Courtyard feet sit on the paving below the hall; row-six feet in the yard. */
export const ANCHOR_OVERRIDES: Readonly<Record<string, readonly [number, number]>> = {
  '7,3': [22.15, 5.2],
  '9,3': [25.85, 5.2],
  '5,4': [15.65, 7.8],
  '11,4': [32.35, 7.8],
  '5,6': [15.65, 13.6],
  '7,6': [21.5, 14.05],
  '9,6': [26.5, 14.05],
  '11,6': [32.35, 13.6],
  '6,6': [18.5, 13.6],
  '8,6': [24, 12.25],
  '10,6': [29.5, 13.6],
  '9,4': [26.5, 8.15],
  '10,4': [28.5, 8.15],
};
export function anchor(p: SiegePosition, state?: SiegeState): [number, number] {
  let at = centre(planeRect(p));
  if (p.level === 'ground') {
    const override = ANCHOR_OVERRIDES[`${p.x},${p.y}`];
    if (override) at = project(FRAME, ...override);
  }
  const r = hitRect(p, state);
  return r
    ? [Math.max(r[0] + 5, Math.min(r[2] - 5, at[0])), Math.max(r[1] + 5, Math.min(r[3] - 5, at[1]))]
    : at;
}

/** Slice rows are integral fine rows. Height never borrows a tower's roof. */
export function depthOf(p: SiegePosition, state?: SiegeState): DepthKey {
  const foot = anchor(p),
    h = heightOf(p);
  return {
    row: Math.floor((foot[1] - FRAME.oy + h * FRAME.lh) / FRAME.cd),
    // A finished mound is one painted surface with nominal height 3. Its
    // walkers sort just after that surface; their feet still follow its slope.
    height:
      (p.level === 'ground' && (p.y === 8 || p.y === 9) && state?.mounds[`${p.x},8`] === 6
        ? 3
        : h) + STANDING_EPSILON,
  };
}

/** Includes trench targets for filling and gate mouths usable by Wei even when
 * intact. Terrain legality remains in the rules; picking never depends on actor. */
export function standingPositions(state: SiegeState): SiegePosition[] {
  return CHENCANG_LAYOUT.flatMap((row, y) =>
    [...row].flatMap((_, x) => {
      const terrain = cellTerrain(state, x, y);
      if (terrain === 'water' || terrain === 'building') return [];
      const levels: SiegePosition['level'][] =
        terrain === 'gate' ? ['wall', 'ground'] : terrain === 'wall' ? ['wall'] : ['ground'];
      return levels.map((level) => ({ x, y, level })).filter((p) => hitRect(p, state));
    }),
  );
}
const hitCache = new WeakMap<
  SiegeState,
  { signature: string; entries: Array<{ p: SiegePosition; r: ScreenRect }> }
>();
export function positionAt(state: SiegeState, sx: number, sy: number): SiegePosition | null {
  const signature =
    [0, 1, 2, 3].map((i) => Number(state.innerWall[i] === 4)).join('') +
    Object.values(state.gates)
      .map((g) => Number(g.broken))
      .join('');
  let cached = hitCache.get(state);
  // Game states are immutable, but dev fixtures can mutate fortifications.
  // Occupancy never participates in this cache or in the inverse geometry.
  if (!cached || cached.signature !== signature) {
    cached = {
      signature,
      entries: standingPositions(state).map((p) => ({ p, r: hitRect(p, state)! })),
    };
    hitCache.set(state, cached);
  }
  return cached.entries.find(({ r }) => contains(r, sx, sy))?.p ?? null;
}

export const formationCount = (troops: number): 1 | 3 | 5 =>
  troops <= 800 ? 1 : troops <= 2000 ? 3 : 5;
/** Offsets are feet, relative to anchor. Full-size soldiers keep their original
 * pose dimensions. Narrow tops cap at three; side walls use two files. */
export function formationFor(p: SiegePosition, troops: number): Array<[number, number]> {
  const r = planeRect(p),
    at = anchor(p),
    w = r[2] - r[0],
    d = r[3] - r[1];
  const narrow = w <= 64 && d <= 48;
  const n = Math.min(formationCount(troops), narrow ? 3 : p.level === 'wall' ? 6 : 9);
  let offsets: Array<[number, number]>;
  if (n === 1) offsets = [[0, 0]];
  else if (p.level === 'wall' && w >= 160)
    offsets = Array.from({ length: n }, (_, i) => [(i - (n - 1) / 2) * 32, 0]);
  else if (p.level === 'wall' && w <= 64 && d > 48)
    offsets = Array.from({ length: n }, (_, i) => [
      (i % 2 ? 1 : -1) * 14,
      (Math.floor(i / 2) - 1) * 28,
    ]);
  else
    offsets =
      n === 3
        ? [
            [-14, -6],
            [14, -6],
            [0, 6],
          ]
        : [
            [-28, -12],
            [0, -12],
            [28, -12],
            [-14, 12],
            [14, 12],
          ];
  return offsets.map(([x, y]) => [
    Math.max(r[0] + 6, Math.min(r[2] - 6, at[0] + x)) - at[0],
    Math.max(r[1] + 6, Math.min(r[3] - 6, at[1] + y)) - at[1],
  ]);
}

/** Art adapters keep all board→fine conversions in this module. */
export function artCell(p: Cell): [number, number] {
  const s = fineSpanOf(p);
  return [(s.west + s.east) / 2, (s.north + s.south) / 2];
}
export function fineFootprint(cells: Cell[]): ScreenRect {
  const spans = cells.map(fineSpanOf);
  return [
    Math.min(...spans.map((s) => s.west)),
    Math.min(...spans.map((s) => s.north)),
    Math.max(...spans.map((s) => s.east)),
    Math.max(...spans.map((s) => s.south)),
  ];
}
export function gateTowerAt(p: Cell) {
  const s = fineSpanOf(p);
  return MAP.objects.find(
    (o) =>
      o.kind === 'gate-tower' &&
      s.west <= o.cells[2]! &&
      s.east >= o.cells[0]! &&
      s.north <= o.cells[3]! &&
      s.south >= o.cells[1]!,
  );
}
export function wallFaceFoot(p: Cell): [number, number] {
  const r = planeRect({ ...p, level: 'wall' });
  return [(r[0] + r[2]) / 2, r[3] + 3 * FRAME.lh];
}
export function moundRegistration(p: Cell, height: number) {
  const s = fineSpanOf(p),
    outer = fineSpanOf({ x: p.x, y: p.y + 1 });
  return {
    crest: project(FRAME, (s.west + s.east + 1) / 2, s.north, height),
    base: project(FRAME, (s.west + s.east + 1) / 2, outer.south + 1),
  };
}
export function moundFoot(p: SiegePosition, height: number): [number, number] {
  const at = anchor(p);
  return [at[0], at[1] - height * FRAME.lh];
}
export function plateRect(
  p: SiegePosition,
  formationAnchor = anchor(p),
  figureTop = formationAnchor[1] - 44,
  belowFoot = false,
): ScreenRect {
  const [x, y] = formationAnchor;
  const top = Math.max(
    2,
    Math.min(MAP.size[1]! - 28, belowFoot ? y + 10 : Math.min(y - 70, figureTop - 30)),
  );
  const left = Math.max(2, Math.min(MAP.size[0]! - 94, x - 46));
  return [left, top, left + 92, top + 26];
}

export interface PlateFormation {
  id: string;
  position: SiegePosition;
  foot: [number, number];
  rect: ScreenRect;
  belowFoot?: boolean;
}
/** Keep each plate centred on its formation (clamped at map edges). Resolve nearby plates
 * upward with a 4px gap; the dense synthetic board sheet uses preferred slots.
 * At the map's north edge visibility takes priority over clearing a figure. */
export function layoutNameplates(
  formations: PlateFormation[],
  spread = true,
): Map<string, ScreenRect> {
  const placed = new Map<string, ScreenRect>();
  for (const f of [...formations].sort(
    (a, b) => a.foot[1] - b.foot[1] || a.foot[0] - b.foot[0] || a.id.localeCompare(b.id),
  )) {
    let r = plateRect(f.position, f.foot, f.rect[1], f.belowFoot);
    if (spread)
      for (let i = 0; i < formations.length; i++) {
        const blocker = [...placed.values()].find((b) =>
          rectsOverlap(r, [b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2]),
        );
        if (!blocker || blocker[1] - 30 < 2) break;
        r = [r[0], blocker[1] - 30, r[2], blocker[1] - 4];
        // A foot plate pushed upward past a neighbour must clear the ladder's
        // durability bar too (foot + 3 through + 7), rather than straddle it.
        if (f.belowFoot && r[1] < f.foot[1] + 7 && r[3] > f.foot[1] + 3) {
          const top = Math.max(2, f.foot[1] - 27);
          r = [r[0], top, r[2], top + 26];
        }
      }
    placed.set(f.id, r);
  }
  return placed;
}

/** The outer bank is the northern sixth of the ladder's own approach cell. */
export function raisedLadderFoot(engine: Cell): [number, number] {
  const r = planeRect({ ...engine, level: 'ground' });
  return [(r[0] + r[2]) / 2, r[1] + (r[3] - r[1]) / 6];
}
export function climbingBase(state: SiegeState, wall: Cell, climber?: Cell): SiegePosition {
  if (climber?.y === wall.y + 1) return { x: wall.x, y: wall.y + 1, level: 'ground' };
  const ladder = state.engines.find(
    (e) =>
      (!climber || (e.x === climber.x && e.y === climber.y)) &&
      e.kind === 'ladder' &&
      !e.wrecked &&
      e.durability > 0 &&
      e.raisedAt?.x === wall.x &&
      e.raisedAt.y === wall.y,
  );
  return { x: ladder?.x ?? wall.x, y: ladder?.y ?? wall.y + 1, level: 'ground' };
}
export function climbingFoot(state: SiegeState, wall: Cell, climber: Cell): [number, number] {
  const base = climbingBase(state, wall, climber);
  return base.y === wall.y + 1 ? anchor(base) : raisedLadderFoot(base);
}

export interface BoardGeometryHandle {
  hitRect: (p: SiegePosition) => ScreenRect | null;
  anchor: (p: SiegePosition) => [number, number];
  positionAt: (x: number, y: number) => SiegePosition | null;
}
declare global {
  interface Window {
    __siegeGeometry?: BoardGeometryHandle;
  }
}
