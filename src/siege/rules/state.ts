import { ENGINE_RULES, SIEGE_TUNING } from './tuning';
import {
  GATES,
  INNER_WALL_SEGMENTS,
  SHU_ROSTER,
  SOUTH_TRENCH,
  WEI_ROSTER,
  WORKSHOPS,
  cellKey,
} from '../content/chencang';
import {
  INITIAL_MORALE,
  INITIAL_ZHANGHE_DISTANCE,
  SIEGE_DAYS,
  SIEGE_VERSION,
  advanceRandomState,
  tacticalSeed,
} from './constants';
import type {
  GateId,
  SiegePosition,
  SiegeRosterEntry,
  SiegeSide,
  SiegeState,
  SiegeUnit,
  SiegeWeather,
} from './types';

export function createSiegeState(seed: number): SiegeState {
  const normalizedSeed = seed >>> 0;
  let rngState = tacticalSeed('chencang', normalizedSeed);
  const weatherByDay: SiegeState['weatherByDay'] = {};
  for (let day = 1; day <= SIEGE_DAYS; day++) {
    rngState = advanceRandomState(rngState);
    weatherByDay[day] = weatherFromRoll(rngState / 0x100000000);
  }

  function place(roster: SiegeRosterEntry, side: SiegeSide, position: SiegePosition): SiegeUnit {
    return {
      ...roster,
      officer: { ...roster.officer },
      ...position,
      side,
      wounded: 0,
      morale: INITIAL_MORALE,
      moved: false,
      acted: false,
      routed: false,
    };
  }

  const weiColumns = [23, 22, 17, 25, 26, 30];
  const units = [
    ...SHU_ROSTER.map((entry, index) =>
      place(
        entry,
        'shu',
        index === 0
          ? { x: 23, y: 25, level: 'ground' }
          : { x: 19 + index, y: 21 + Math.floor((index - 1) / 3), level: 'ground' },
      ),
    ),
    ...WEI_ROSTER.map((entry, index) =>
      place(entry, 'wei', { x: weiColumns[index]!, y: 16, level: 'wall' }),
    ),
  ];

  return {
    version: SIEGE_VERSION,
    seed: normalizedSeed,
    rngState,
    day: 1,
    act: 1,
    weather: weatherByDay[1]!,
    weatherByDay,
    grain: SIEGE_DAYS,
    zhangheDistance: INITIAL_ZHANGHE_DISTANCE,
    units,
    engines: (
      [
        ['ladder', 18, 19],
        ['ladder', 29, 19],
        ['ram', 24, 21],
        ['earthCart', 21, 20],
      ] as const
    ).map(([kind, x, y], index) => ({
      id: `starting-${kind}-${index + 1}`,
      kind,
      x,
      y,
      durability: ENGINE_RULES[kind].durability,
      max: ENGINE_RULES[kind].durability,
      burning: false,
      covered: false,
      wrecked: false,
      moved: false,
      acted: false,
      ...(kind === 'earthCart' ? { uses: SIEGE_TUNING.cartLoads } : {}),
    })),
    footholds: {},
    mounds: {},
    preparations: { braziers: {}, millstones: {}, boulders: {} },
    nightOrders: {},
    mainBodyThreatened: false,
    stats: {
      shuLost: 0,
      weiLost: 0,
      enginesLost: 0,
      assaults: 0,
      nightClashes: 0,
      nightResults: [],
      idleDays: 0,
      lastActiveDay: null,
      score: null,
      moundsBuilt: 0,
      gateEverBroken: false,
      wallEverHeldAtNight: false,
      wallNights: 0,
      firstFootholdDay: null,
      firstWallDay: null,
    },
    gates: Object.fromEntries(
      (Object.keys(GATES) as GateId[]).map((id) => [
        id,
        { durability: GATES[id].max, max: GATES[id].max, broken: false, damaged: false },
      ]),
    ) as SiegeState['gates'],
    trenchFill: Object.fromEntries(SOUTH_TRENCH.map((cell) => [cellKey(cell), 0])),
    innerWall: Object.fromEntries(INNER_WALL_SEGMENTS.map(({ index }) => [index, 0])),
    workshops: WORKSHOPS.map(({ id }) => ({ id, queue: null, daysRemaining: 0 })),
    ordersUsed: { shu: { 1: false }, wei: { 1: false } },
    log: [],
    outcome: null,
  };
}

/** Roll in [0, 1): clear 60%, snow 30%, wind 10%. */
export function weatherFromRoll(roll: number): SiegeWeather {
  return roll < 0.6 ? 'clear' : roll < 0.9 ? 'snow' : 'wind';
}
