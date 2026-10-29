import { createV03Game } from '../../../src/v03/initial-state';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { createBattleMap, createTacticalBattle } from '../../../src/v03/battle';

/** Planner fixture, deliberately limited to Ye and its two actual adjacent routes. */
export function rivalDecisionFixture() {
  const state = createV03Game('cao', 17);
  state.cities = state.cities.filter((city) => ['ye', 'jinyang', 'pingyuan'].includes(city.id));
  for (const city of state.cities)
    Object.assign(city, {
      factionId: city.id === 'ye' ? 'yuan' : null,
      food: 100_000,
      gold: 10_000,
      garrisonTroops: city.id === 'ye' ? 6000 : 1000,
      reserve: 0,
      reservePools: createReservePools(0),
      governorId: null,
      pendingAppointment: null,
      governanceMode: 'steward',
    });
  const roster = ['yuanshao', 'yanliang', 'guotu', 'yuejin', 'tianfeng', 'jushou'];
  state.officers = state.officers.filter((officer) => roster.includes(officer.id));
  for (const officer of state.officers)
    Object.assign(officer, {
      factionId: 'yuan',
      location: { kind: 'city', cityId: 'ye' },
      troops: 1000,
      wounded: 0,
      reorganizationDays: 0,
      governorOfCityId: null,
    });
  return state;
}

export function decisionBattle() {
  const map = createBattleMap({ regionId: 'xiapi', seed: 7 });
  map.terrain.fill('plain');
  const battle = createTacticalBattle({
    id: 'v04-decisions',
    map,
    seed: 7,
    playerSide: 'attacker',
    supplies: { attacker: 100_000, defender: 100_000 },
    attackerUnits: [
      { id: 'actor', name: 'Actor', troopType: 'archer', troops: 1000, force: 80, intellect: 70 },
    ],
    defenderUnits: [
      { id: 'weak', name: 'Weak', troopType: 'infantry', troops: 20, force: 70, intellect: 0 },
      {
        id: 'strong',
        name: 'Strong',
        troopType: 'infantry',
        troops: 3000,
        force: 70,
        intellect: 0,
      },
    ],
  });
  Object.assign(
    battle.units.find((unit) => unit.id === 'actor')!,
    { x: 5, y: 5 },
  );
  Object.assign(
    battle.units.find((unit) => unit.id === 'weak')!,
    { x: 7, y: 5 },
  );
  Object.assign(
    battle.units.find((unit) => unit.id === 'strong')!,
    { x: 5, y: 7 },
  );
  battle.weather = 'clear';
  return battle;
}
