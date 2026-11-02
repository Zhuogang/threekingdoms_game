import {
  CITY_BOUNDS,
  DEPLOY_SHU,
  DEPLOY_WEI,
  GATES,
  INNER_WALL_SEGMENTS,
  SHU_ROSTER,
  SOUTH_TRENCH,
  WEI_ROSTER,
  WORKSHOPS,
  cellKey,
  layoutSymbol,
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
  const randomIndex = (length: number): number => {
    rngState = advanceRandomState(rngState);
    return rngState % length;
  };
  const weatherOptions: readonly SiegeWeather[] = ['clear', 'snow', 'wind'];
  const weatherByDay: SiegeState['weatherByDay'] = {};
  for (let day = 1; day <= SIEGE_DAYS; day++) {
    weatherByDay[day] = weatherOptions[randomIndex(weatherOptions.length)]!;
  }

  const occupied = new Set<string>();
  const positionKey = (p: SiegePosition) => `${cellKey(p)},${p.level}`;
  function place(
    roster: SiegeRosterEntry,
    side: SiegeSide,
    zone: readonly SiegePosition[],
  ): SiegeUnit {
    const available = zone.filter((p) => !occupied.has(positionKey(p)));
    if (!available.length) throw new Error(`No deployment cell for ${roster.id}`);
    const position = available[randomIndex(available.length)]!;
    occupied.add(positionKey(position));
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

  const southWall = DEPLOY_WEI.filter(
    (p) => p.level === 'wall' && p.y === CITY_BOUNDS.south && layoutSymbol(p.x, p.y) === 'W',
  );
  // Reserve the south wall for archers before placing the other Wei formations.
  const weiArchers = WEI_ROSTER.filter((entry) => entry.troopType === 'archer').map((entry) =>
    place(entry, 'wei', southWall),
  );
  const weiOthers = WEI_ROSTER.filter((entry) => entry.troopType !== 'archer').map((entry) =>
    place(entry, 'wei', DEPLOY_WEI),
  );
  const weiUnits = [...weiArchers, ...weiOthers];
  const units = [
    ...SHU_ROSTER.map((entry) => place(entry, 'shu', DEPLOY_SHU)),
    ...WEI_ROSTER.map((entry) => weiUnits.find((unit) => unit.id === entry.id)!),
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
    engines: [],
    gates: Object.fromEntries(
      (Object.keys(GATES) as GateId[]).map((id) => [
        id,
        { durability: GATES[id].max, max: GATES[id].max, broken: false },
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
