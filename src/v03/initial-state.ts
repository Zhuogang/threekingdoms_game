import { scenarioById, SCENARIOS } from './content/scenario';
import { officerRosterPlan, createOpeningOfficer } from './campaign/officer-lifecycle';
import { OFFICER_ROSTER_VERSION } from './content/officer-roster-setups';
import { createReservePools } from './campaign/troop-experience';
import { createPersonnelDay } from './campaign/personnel';
import { CITY_GEOGRAPHY_BY_ID, type CityId } from './geography';
import type { V03City, V03Faction, V03GameState } from './types';

export const DEFAULT_V03_SCENARIO_ID = 'divided-realm-190';

export function createV03Game(
  playerFactionId: string,
  seed: number,
  scenarioId = DEFAULT_V03_SCENARIO_ID,
): V03GameState {
  if (!Number.isSafeInteger(seed)) throw new Error('Campaign seed must be an integer.');
  const scenario = scenarioById(scenarioId);
  if (!scenario) throw new Error(`Unknown v0.3 scenario: ${scenarioId}.`);
  if (!scenario.factions.some((faction) => faction.id === playerFactionId))
    throw new Error(`Faction ${playerFactionId} is not available in this scenario.`);

  const roster = officerRosterPlan(scenario.id)?.opening;
  if (!roster) throw new Error('Missing officer roster configuration: ' + scenario.id);
  const officers = roster.officers
    .filter((officer) => officer.status !== 'pending')
    .map(createOpeningOfficer);
  const capitals = new Map(roster.factions.map((faction) => [faction.id, faction.capitalCityId]));
  const factions: V03Faction[] = scenario.factions.map((faction) => {
    const opening = roster.factions.find((entry) => entry.id === faction.id)!;
    const leader = officers.find((officer) => officer.id === opening.leaderOfficerId)!;
    return {
      id: faction.id,
      name: faction.name,
      chinese: leader.chinese,
      leaderOfficerId: leader.id,
      color: faction.color,
      capitalCityId: opening.capitalCityId,
      isPlayer: faction.id === playerFactionId,
      eliminated: false,
    };
  });

  const cities: V03City[] = scenario.cities.map((city) => {
    const geo = CITY_GEOGRAPHY_BY_ID.get(city.id as CityId);
    if (!geo) throw new Error(`Missing historical geography for ${city.id}.`);
    const opening = roster.cities.find((entry) => entry.id === city.id)!;
    const governorId = opening.governorId;
    const additions = opening.reserveAdditions;
    const governanceMode =
      city.factionId === null
        ? 'steward'
        : capitals.get(city.factionId) === city.id
          ? 'ruler'
          : governorId &&
              officers.some(
                (officer) =>
                  officer.id === governorId &&
                  officer.alive &&
                  officer.location.kind === 'city' &&
                  officer.location.cityId === city.id,
              )
            ? 'governor'
            : 'steward';
    return {
      id: city.id,
      name: city.name,
      chinese: city.chinese,
      region: city.region,
      factionId: city.factionId,
      population: city.population,
      farming: city.farming,
      commerce: city.commerce,
      loyalty: city.loyalty,
      gold: city.gold,
      food: city.food,
      reserve: city.reserve + additions.infantry + additions.archer + additions.cavalry,
      reservePools: createReservePools(
        city.reserve / 2 + additions.infantry,
        city.reserve / 4 + additions.archer,
        city.reserve / 4 + additions.cavalry,
      ),
      garrisonExperience: 0,
      garrisonTroops: officers.reduce(
        (total, officer) =>
          total +
          (officer.alive &&
          officer.factionId === city.factionId &&
          officer.location.kind === 'city' &&
          officer.location.cityId === city.id
            ? officer.troops
            : 0),
        0,
      ),
      governorId: governanceMode === 'governor' ? governorId : null,
      pendingAppointment: null,
      governanceMode,
      workMonthIndex: 0,
      workPointsUsed: 0,
      autoSearchesThisMonth: 0,
      autoAssignmentsThisMonth: 0,
      troopServiceDaysThisMonth: 0,
      cavalryServiceDaysThisMonth: 0,
      plunderCooldownUntilDay: 0,
    };
  });

  for (const city of cities) {
    if (city.governorId) {
      const governor = officers.find((officer) => officer.id === city.governorId);
      if (governor) governor.governorOfCityId = city.id;
    }
  }
  const playerCapitalCityId = capitals.get(playerFactionId);
  if (!playerCapitalCityId) throw new Error(`Faction ${playerFactionId} has no capital city.`);

  const state: V03GameState = {
    version: 3,
    ruleset: 'hegemony-3',
    personnelSchema: 1,
    officerRosterVersion: OFFICER_ROSTER_VERSION,
    lastOfficerDebutYear: scenario.year,
    troopSources: [],
    personnelDay: { absoluteDay: 0, completed: false, entries: [], rations: [] },
    revision: 0,
    scenarioId: scenario.id,
    seed: seed >>> 0,
    playerFactionId,
    startYear: scenario.year,
    absoluteDay: 0,
    monthIndex: 0,
    rng: seed >>> 0,
    alliances: [],
    coalitionInvitations: [],
    firedMonthlyEventIds: [],
    lastAllianceBreakMonthByFaction: {},
    hegemon: { factionId: null, months: 0 },
    nextId: 1,
    phase: 'planning',
    playerCapitalCityId,
    factions,
    cities,
    officers,
    journeys: [],
    requisitions: [],
    directives: [],
    battles: [],
    dayResolution: null,
    events: [],
    log: [],
    winnerFactionId: null,
    governanceRevision: 0,
  };
  state.personnelDay = createPersonnelDay(state);
  return state;
}

export function availableV03Scenarios() {
  return SCENARIOS.map(({ id, title, year, description }) => ({ id, title, year, description }));
}
