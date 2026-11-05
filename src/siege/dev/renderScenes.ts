import { createSiegeState } from '../rules/state';
import { ENGINE_RULES } from '../rules/tuning';
import { INNER_WALL_SEGMENTS, SOUTH_TRENCH } from '../content/chencang';
import type { EngineKind, SiegeEngine, SiegeState } from '../rules/types';
import type { Facing } from '../save';
import type { NightPresentation } from '../render/nightReplay';

export const RENDER_SCENES = [
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

/** Fixed review fixtures: no random actions or AI, and never saved. */
export function createRenderScene(name: RenderSceneName): RenderScene {
  const state = createSiegeState(228);
  state.day = 3;
  state.weather = 'clear';
  state.engines = [];
  state.units.forEach((u, i) => {
    u.x = 16 + (i % 9) * 2;
    u.y = u.side === 'wei' ? 16 : 22;
    u.level = u.side === 'wei' ? 'wall' : 'ground';
  });
  // Keep the normal roster nearby for selection, without obscuring the samples.
  state.units[9]!.y = 24;
  const result: RenderScene = { state, facings: {}, legend: '' };
  const ladder = (x: number, progress: 0 | 1 | 2 | 3, unitIndex: number) => {
    state.engines.push(engine(`ladder-${x}`, 'ladder', x, 19, { raisedAt: { x, y: 16 } }));
    state.footholds[`${x},16`] = progress;
    Object.assign(state.units[unitIndex]!, { x, y: 19 });
  };
  if (name === 'ramps') {
    state.units.forEach((unit) => {
      unit.y = 24;
      unit.level = 'ground';
    });
    Object.assign(state.units[5]!, { x: 21, y: 15, level: 'ground', troops: 800 });
    Object.assign(state.units[6]!, { x: 26, y: 15, level: 'ground', troops: 800 });
    result.facings[state.units[5]!.id] = 'east';
    result.facings[state.units[6]!.id] = 'west';
    result.legend = 'South ramps: units at (21,15) and (26,15), descending towards the gate.';
  } else if (name === 'visible') {
    // The planner's look-probe fixture, before any unit is selected.
    const original = createSiegeState(228);
    state.units = original.units;
    state.engines = original.engines;
    const set = (id: string, x: number, y: number, level: 'wall' | 'ground') =>
      Object.assign(
        state.units.find((u) => u.id === id)!,
        { x, y, level, moved: false, acted: false },
      );
    set('shu-weiyan', 18, 16, 'wall');
    set('shu-wangping', 19, 16, 'wall');
    set('shu-liaohua', 17, 15, 'ground');
    set('shu-jiangwei', 18, 15, 'ground');
    set('shu-wuyi', 21, 15, 'ground');
    set('shu-captain-1', 23, 15, 'ground');
    set('wei-wangsheng', 16, 15, 'ground');
    state.footholds['18,16'] = 3;
    state.engines[0]!.raisedAt = { x: 18, y: 16 };
    result.legend =
      'Walkway, inside wall, ramp, gate approach and Wei behind the wall; raised ladder at 18,16.';
  } else if (name === 'footholds') {
    [16, 19, 28, 31].forEach((x, i) => ladder(x, i as 0 | 1 | 2 | 3, i + 1));
    const defender = state.units.find((u) => u.side === 'wei')!;
    Object.assign(defender, { x: 32, y: 16, morale: 60 });
    state.log.push({
      day: state.day,
      code: 'defenderDisplaced',
      params: {
        unitId: defender.id,
        from: '31,16',
        to: '32,16',
        level: 'wall',
        moraleBefore: 70,
        moraleAfter: 60,
      },
    });
    result.legend =
      'West to east: 0/3, 1/3 (a), 2/3 (a + b), 3/3 (top). Hover the forecast sample to blink. Defender at (32,16): displaced, morale -10.';
  } else if (name === 'assault') {
    ladder(18, 2, 1);
    ladder(29, 2, 2);
    state.units[1]!.assaultedDay = state.day;
    state.units[2]!.assaultedDay = state.day;
    result.repulsedUnits = [state.units[2]!.id];
    result.legend =
      'West: storming mass at the wall foot. East: repulsed mass (static review sample). Start replay to see the failed assault fade.';
  } else if (name === 'mounds') {
    [16, 19, 27, 29, 32].forEach((x, i) => {
      state.mounds[`${x},17`] = [1, 2, 3, 5, 6][i] as 1 | 2 | 3 | 5 | 6;
      state.trenchFill[`${x},17`] = 3;
      state.trenchFill[`${x},18`] = 3;
    });
    Object.assign(state.units[1]!, { x: 32, y: 17, troops: 800 });
    result.legend =
      'West to east: progress 1, 2, 3, 5, 6. One unit stands on the finished ramp; defenders remain behind its crest.';
  } else if (name === 'covered') {
    state.engines = [
      engine('covered-ladder-n', 'ladder', 16, 20, { covered: true }),
      engine('covered-ladder-e', 'ladder', 18, 20, { covered: true }),
      engine('covered-ladder-raised', 'ladder', 20, 19, {
        covered: true,
        raisedAt: { x: 20, y: 16 },
      }),
      engine('covered-ram-n', 'ram', 24, 20, { covered: true }),
      engine('covered-ram-e', 'ram', 26, 20, { covered: true }),
      engine('covered-ram-damaged', 'ram', 29, 20, { covered: true, durability: 149 }),
      engine('burning-ladder', 'ladder', 31, 20, { covered: true, burning: true }),
      engine('burning-ram', 'ram', 33, 20, { covered: true, burning: true }),
    ];
    result.facings = { 'covered-ladder-e': 'east', 'covered-ram-e': 'west' };
    result.legend =
      'All S8 covered variants: north / east / raised ladders; north / mirrored east / damaged rams. East edge: legacy burning path.';
  } else if (name === 'preparations' || name === 'nightTorches') {
    state.preparations.braziers = {
      '16,16': { litDay: state.day },
      '19,16': { litDay: 1 },
      '31,16': { litDay: 1 },
    };
    state.preparations.boulders = { '27,16': { day: 1 } };
    state.preparations.millstones = {
      '24,16': { day: 1, hoisted: true },
      // Synthetic plain-wall sample: today's map has no plain wall directly
      // over a gate approach. Exercise the other cell type allowed by §5.7.
      '26,16': { day: 1, hoisted: true },
    };
    result.legend =
      'Brazier prepared today + firewood; usable brazier; hoisted millstones in front of gate top (24,16) and plain wall (26,16, synthetic approach sample); boulders. Unlit brazier reference in the strip below.';
    if (name === 'nightTorches') {
      state.weather = 'snow';
      state.engines = [
        engine('night-ladder', 'ladder', 18, 21),
        engine('night-ram', 'ram', 24, 20),
      ];
      result.night = { kind: 'torches', duration: 130 };
      result.legend =
        'Snow, flat 45% night tint, radial brazier lights and torch flare. Replay also demonstrates a northward engine slide and ladder crossfade.';
    }
  } else if (name === 'sortie') {
    state.engines = [engine('sortie-target', 'ram', 25, 20, { burning: true, durability: 130 })];
    result.night = {
      kind: 'sortie',
      duration: 130,
      party: { from: { x: 24, y: 20 }, to: { x: 25, y: 20 }, pose: 'east-kindle', kindle: true },
    };
    result.legend =
      'Party at target, torch lit and engine burning. Reference strip: all six poses. Replay success, guarded failure, and night-assault failure with the controls.';
  } else if (name === 'formations') {
    state.units.forEach((u, i) => {
      u.troops = i < 4 ? [800, 801, 2000, 2001][i]! : 3000;
    });
    state.engines = Array.from({ length: 8 }, (_, i) =>
      engine(`stress-${i}`, i % 2 ? 'ram' : 'ladder', 16 + i * 2, 20),
    );
    result.legend =
      'First four ground units: 800 / 801 / 2000 / 2001 troops = 1 / 3 / 3 / 5 figures. Remaining units: five figures. 10 Shu, 6 Wei, 8 engines.';
  } else {
    // A conservative composite stress fixture, not a simulated sequence:
    // maximum formations, tall burning engines, the entire mound front,
    // all inner walls, six sets of preparations and a torch-bearing sortie.
    state.units.forEach((u) => {
      u.troops = 3000;
    });
    state.engines = Array.from({ length: 8 }, (_, i) =>
      engine(`worst-tower-${i}`, 'tower', 15 + i * 2, 20, { burning: true }),
    );
    for (const cell of SOUTH_TRENCH.filter((c) => c.y === 17)) {
      state.mounds[`${cell.x},17`] = 6;
      state.trenchFill[`${cell.x},17`] = 3;
      state.trenchFill[`${cell.x},18`] = 3;
    }
    for (const segment of INNER_WALL_SEGMENTS) state.innerWall[segment.index] = 4;
    for (const x of [16, 19, 22, 24, 29, 31]) {
      const key = `${x},16`;
      state.preparations.braziers[key] = { litDay: state.day };
      state.preparations.boulders[key] = { day: 1 };
      state.preparations.millstones[key] = { day: 1, hoisted: true };
    }
    result.night = {
      kind: 'sortie',
      duration: 130,
      party: { from: { x: 24, y: 20 }, to: { x: 25, y: 20 }, pose: 'east-kindle', kindle: true },
    };
    result.legend =
      'Stress composite: all 16 units have five figures; eight burning towers; full mound front and inner walls; six preparation sets; torch-bearing sortie. Static scenery must never disappear.';
  }
  return result;
}
