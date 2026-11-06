import { createSiegeState } from '../rules/state';
import { ENGINE_RULES } from '../rules/tuning';
import { INNER_WALL_SEGMENTS, RAMPS, SOUTH_TRENCH } from '../content/chencang';
import type { EngineKind, SiegeEngine, SiegeState } from '../rules/types';
import type { Facing } from '../save';
import type { NightPresentation } from '../render/nightReplay';
import { standingPositions } from '../render/boardGeometry';

export const RENDER_SCENES = [
  'board',
  'footholds',
  'assault',
  'mounds',
  'covered',
  'preparations',
  'nightTorches',
  'sortie',
  'formations',
  'worst',
  'visible',
  'ramps',
] as const;
export type RenderSceneName = (typeof RENDER_SCENES)[number];
export interface RenderScene {
  state: SiegeState;
  facings: Record<string, Facing>;
  night?: NightPresentation;
  repulsedUnits?: string[];
  legend: string;
}
const engine = (
  id: string,
  kind: EngineKind,
  x: number,
  y: number,
  extra: Partial<SiegeEngine> = {},
): SiegeEngine => ({
  id,
  kind,
  x,
  y,
  durability: ENGINE_RULES[kind].durability,
  max: ENGINE_RULES[kind].durability,
  burning: false,
  wrecked: false,
  covered: false,
  ...extra,
});

/** All coordinates are V1 board cells. Fixtures are pictures, never saves. */
export function createRenderScene(name: RenderSceneName): RenderScene {
  const state = createSiegeState(228);
  state.day = 3;
  state.weather = 'clear';
  state.engines = [];
  const result: RenderScene = { state, facings: {}, legend: '' };
  const ladder = (x: number, progress: 0 | 1 | 2 | 3, index: number) => {
    state.engines.push(engine(`ladder-${x}`, 'ladder', x, 10, { raisedAt: { x, y: 7 } }));
    state.footholds[`${x},7`] = progress;
    Object.assign(state.units[index]!, { x, y: 10, level: 'ground' });
  };
  if (name === 'board') {
    const template = state.units[1]!;
    state.units = standingPositions(state).map((p) => ({
      ...template,
      ...p,
      id: `board-${p.x}-${p.y}-${p.level}`,
      side: p.level === 'wall' ? 'wei' : 'shu',
      troops: 150,
      wounded: 0,
      officer: {
        ...template.officer,
        portraitId: null,
        chinese: `${p.x},${p.y}`,
        name: `${p.x},${p.y}`,
      },
      moved: false,
      acted: false,
    }));
    result.legend =
      'V2 review sheet: half-open hit rectangles; teal ground, magenta wall. One full-size figure per position, including trench fill targets and both gate planes. Gate planes are schematic, not simultaneous legal occupants.';
  } else if (name === 'ramps') {
    RAMPS.forEach(({ ground }, i) => {
      Object.assign(state.units[i]!, ground, { level: 'ground', troops: 800 });
      result.facings[state.units[i]!.id] = i % 2 ? 'west' : 'east';
    });
    result.legend = 'All eight ramps. Feet on the painted slopes; south ramps at (7,6), (9,6).';
  } else if (name === 'visible') {
    state.engines = createSiegeState(228).engines;
    const places = [
      [8, 12],
      [6, 7],
      [7, 7],
      [5, 6],
      [7, 6],
      [9, 6],
      [8, 6],
      [3, 11],
      [2, 11],
      [14, 11],
      [8, 7],
      [9, 7],
      [10, 7],
      [11, 7],
      [4, 4],
      [12, 4],
    ];
    state.units.forEach((u, i) => {
      const [x, y] = places[i]!;
      Object.assign(u, {
        x,
        y,
        level: y === 7 || (y === 4 && (x === 4 || x === 12)) ? 'wall' : 'ground',
        moved: false,
        acted: false,
      });
    });
    state.engines[0]!.y = 10;
    state.engines[0]!.raisedAt = { x: 6, y: 7 };
    state.footholds['6,7'] = 3;
    result.legend =
      'Wall, inner yard, ramps, gate and units behind buildings. Every unit has a plate; hidden pixels are yellow.';
  } else if (name === 'footholds') {
    [5, 6, 10, 11].forEach((x, i) => ladder(x, i as 0 | 1 | 2 | 3, i + 1));
    const defender = state.units.find((u) => u.side === 'wei')!;
    Object.assign(defender, { x: 12, y: 7, morale: 60 });
    state.log.push({
      day: state.day,
      code: 'defenderDisplaced',
      params: {
        unitId: defender.id,
        from: '11,7',
        to: '12,7',
        level: 'wall',
        moraleBefore: 70,
        moraleAfter: 60,
      },
    });
    result.legend =
      'West to east: foothold 0/3, 1/3, 2/3, 3/3. Displaced defender at (12,7), morale -10.';
  } else if (name === 'assault') {
    ladder(6, 2, 1);
    ladder(10, 2, 2);
    state.units[1]!.assaultedDay = state.units[2]!.assaultedDay = state.day;
    result.repulsedUnits = [state.units[2]!.id];
    result.legend =
      'Storming mass at the row-10 ladder base (6,10), repulsed at (10,10); original uniform art size.';
  } else if (name === 'mounds') {
    [5, 6, 7, 9, 10].forEach((x, i) => {
      state.mounds[`${x},8`] = [1, 2, 3, 5, 6][i] as 1 | 2 | 3 | 5 | 6;
      state.trenchFill[`${x},8`] = state.trenchFill[`${x},9`] = 3;
    });
    Object.assign(state.units[1]!, { x: 10, y: 8, troops: 800 });
    result.legend =
      'Mound progress 1,2,3,5,6. Filled cells cover every fine cell. One unit on the finished mound.';
  } else if (name === 'covered') {
    state.engines = [
      engine('covered-ladder-n', 'ladder', 5, 10, { covered: true }),
      engine('covered-ladder-e', 'ladder', 6, 10, { covered: true }),
      engine('covered-ladder-raised', 'ladder', 7, 10, { covered: true, raisedAt: { x: 7, y: 7 } }),
      engine('covered-ram-n', 'ram', 8, 10, { covered: true }),
      engine('covered-ram-e', 'ram', 9, 10, { covered: true }),
      engine('covered-ram-damaged', 'ram', 10, 10, { covered: true, durability: 149 }),
      engine('burning-ladder', 'ladder', 11, 10, { covered: true, burning: true }),
      engine('burning-ram', 'ram', 12, 10, { covered: true, burning: true }),
    ];
    result.facings = { 'covered-ladder-e': 'east', 'covered-ram-e': 'west' };
    result.legend =
      'All six covered engine variants, plus burning ladder and ram. Raised ladder uniformly fitted to base and parapet.';
  } else if (name === 'preparations' || name === 'nightTorches') {
    state.preparations.braziers = {
      '5,7': { litDay: state.day },
      '6,7': { litDay: 1 },
      '11,7': { litDay: 1 },
    };
    state.preparations.boulders = { '9,7': { day: 1 } };
    state.preparations.millstones = {
      '8,7': { day: 1, hoisted: true },
      '10,7': { day: 1, hoisted: true },
    };
    result.legend =
      'Three braziers, today’s firewood, boulders, gate and plain-wall millstones. All positions use boardGeometry.';
    if (name === 'nightTorches') {
      state.weather = 'snow';
      state.engines = [engine('night-ladder', 'ladder', 6, 10), engine('night-ram', 'ram', 8, 10)];
      result.night = { kind: 'torches', duration: 130 };
    }
  } else if (name === 'sortie') {
    state.engines = [engine('sortie-target', 'ram', 9, 10, { burning: true, durability: 130 })];
    result.night = {
      kind: 'sortie',
      duration: 130,
      party: { from: { x: 8, y: 10 }, to: { x: 9, y: 10 }, pose: 'east-kindle', kindle: true },
    };
    result.legend =
      'Sortie at (9,10); torch lit. Replay success, guarded failure, night assault failure.';
  } else if (name === 'formations') {
    state.units.forEach((u, i) => {
      u.troops = i < 4 ? [800, 801, 2000, 2001][i]! : 3000;
    });
    state.engines = Array.from({ length: 8 }, (_, i) =>
      engine(`stress-${i}`, i % 2 ? 'ram' : 'ladder', 4 + i, 10),
    );
    result.legend =
      'Troop thresholds 800/801/2000/2001: 1/3/3/5, capped by cell shape. Original figure dimensions.';
  } else {
    state.units.forEach((u) => {
      u.troops = 3000;
    });
    state.engines = Array.from({ length: 8 }, (_, i) =>
      engine(`worst-tower-${i}`, 'tower', 4 + i, 10, { burning: true }),
    );
    for (const cell of SOUTH_TRENCH.filter((c) => c.y === 8)) {
      state.mounds[`${cell.x},8`] = 6;
      state.trenchFill[`${cell.x},8`] = state.trenchFill[`${cell.x},9`] = 3;
    }
    for (const segment of INNER_WALL_SEGMENTS) state.innerWall[segment.index] = 4;
    for (const x of [5, 6, 7, 8, 10, 11]) {
      const key = `${x},7`;
      state.preparations.braziers[key] = { litDay: state.day };
      state.preparations.boulders[key] = { day: 1 };
      state.preparations.millstones[key] = { day: 1, hoisted: true };
    }
    result.night = {
      kind: 'sortie',
      duration: 130,
      party: { from: { x: 8, y: 10 }, to: { x: 9, y: 10 }, pose: 'east-kindle', kindle: true },
    };
    result.legend =
      'Stress: 16 maximum formations, eight burning towers, full mound front, all inner walls, six preparations, sortie. No art omitted.';
  }
  return result;
}
