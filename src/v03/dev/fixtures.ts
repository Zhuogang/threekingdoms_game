import { createV03Game } from '../initial-state';
import { executeV03Command } from '../commands';
import { resolveSuccessions } from '../campaign/prisoners';
import type { V03GameState } from '../types';

export const PLAYTEST_FIXTURES = [
  'battle',
  'rival-battle',
  'ruler-captured',
  'shortage',
  'many-reports',
] as const;
export type PlaytestFixture = (typeof PLAYTEST_FIXTURES)[number];
function acknowledge(state: V03GameState) {
  state.events.forEach((event) => {
    event.acknowledged = true;
  });
  return state;
}
export function playtestFixture(name: PlaytestFixture): V03GameState {
  let state = createV03Game('cao', 481516);
  if (name === 'battle' || name === 'rival-battle') {
    const ids = state.officers
      .filter(
        (officer) =>
          officer.factionId === 'cao' &&
          officer.location.kind === 'city' &&
          officer.location.cityId === 'chenliu' &&
          officer.troops > 0,
      )
      .map((officer) => officer.id);
    const result = executeV03Command(state, {
      type: 'marchArmy',
      sourceCityId: 'chenliu',
      targetCityId: 'luoyang',
      officerIds: ids,
      intent: 'conquer',
    });
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    const journey = state.journeys[0]!;
    journey.routeSnapshot = journey.routeSnapshot.map((segment) => ({
      ...segment,
      lengthKm: 1,
      fixedDelayDays: 0,
    }));
    journey.expectedArrivalDay = 1;
    for (let day = 0; day < 10 && !state.battles.length; day++)
      state = executeV03Command(acknowledge(state), { type: 'advance', days: 1 }).state;
    if (name === 'rival-battle') {
      state.playerFactionId = 'sun';
      state.playerCapitalCityId = state.factions.find(
        (faction) => faction.id === 'sun',
      )!.capitalCityId;
      state.factions.forEach((faction) => {
        faction.isPlayer = faction.id === 'sun';
      });
    }
    return acknowledge(state);
  }
  if (name === 'ruler-captured') {
    const officer = state.officers.find(
      (entry) =>
        entry.id === state.factions.find((faction) => faction.id === 'cao')!.leaderOfficerId,
    )!;
    const city = state.cities.find(
      (entry) => officer.location.kind === 'city' && entry.id === officer.location.cityId,
    )!;
    city.garrisonTroops -= officer.troops;
    officer.troops = 0;
    officer.location = { kind: 'captured', cityId: 'luoyang' };
    // A rival prisoner in the player's capital exercises the holder UI.
    const rival = state.officers.find(
      (entry) => entry.factionId === 'dong' && entry.id !== 'dongzhuo' && entry.alive,
    )!;
    const old = state.cities.find(
      (entry) => rival.location.kind === 'city' && entry.id === rival.location.cityId,
    );
    if (old) old.garrisonTroops = Math.max(0, old.garrisonTroops - rival.troops);
    if (rival.governorOfCityId) {
      const governed = state.cities.find((city) => city.id === rival.governorOfCityId);
      if (governed) {
        governed.governorId = null;
        governed.governanceMode = 'steward';
      }
    }
    rival.troops = 0;
    rival.location = { kind: 'captured', cityId: state.playerCapitalCityId };
    rival.governorOfCityId = null;
    resolveSuccessions(state);
    return state;
  }
  if (name === 'shortage') {
    state.absoluteDay = 29;
    const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
    city.food = 0;
    city.gold = 0;
    city.troopServiceDaysThisMonth = 100_000_000;
    return state;
  }
  for (let index = 0; index < 24; index++)
    state.events.push({
      id: `fixture-report-${index}`,
      kind: 'diplomacy',
      code: 'diplomacy',
      params: {},
      title: 'Council report',
      detail: 'A council report awaits acknowledgement.',
      absoluteDay: 0,
      entityId: state.playerFactionId,
      acknowledged: false,
      tier: 'critical',
    });
  return state;
}

export function installPlaytestHarness(
  getState: () => V03GameState | null,
  dispatch: (command: Parameters<typeof executeV03Command>[1]) => void,
) {
  const freeze = (value: unknown): unknown => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const harness = Object.freeze({
    get state() {
      return freeze(structuredClone(getState()));
    },
    dispatch,
    fixtures: PLAYTEST_FIXTURES,
  });
  Object.defineProperty(window, '__V03_PLAYTEST__', { configurable: true, value: harness });
  return () => {
    Reflect.deleteProperty(window, '__V03_PLAYTEST__');
  };
}
