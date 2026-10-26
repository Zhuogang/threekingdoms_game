import { scenarioById, SCENARIOS } from './content/scenario';
import { createReservePools } from './campaign/troop-experience';
import { CITY_GEOGRAPHY_BY_ID, type CityId } from './geography';
import type { V03City, V03Faction, V03GameState, V03Officer } from './types';

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

  const officers: V03Officer[] = scenario.officers.map((officer) => ({
    id: officer.id,
    name: officer.name,
    chinese: officer.chinese,
    factionId: officer.factionId,
    location: officer.captive
      ? { kind: 'captured', cityId: officer.cityId }
      : { kind: 'city', cityId: officer.cityId },
    force: officer.force,
    intellect: officer.intellect,
    loyalty: officer.loyalty,
    age: officer.age,
    troops: officer.fate === 'active' && !officer.captive ? officer.troops : 0,
    troopExperience: 0,
    troopType: officer.troopType,
    equipment: officer.equipment === 'Fine arms' ? 'Fine arms' : null,
    experience: officer.experience,
    level: officer.level,
    governorOfCityId: null,
    alive: officer.fate === 'active',
  }));

  const capitals = new Map<string, string>();
  const factions: V03Faction[] = scenario.factions.map((faction) => {
    const leader =
      officers.find((officer) => officer.name === faction.leader && officer.alive) ??
      officers.find((officer) => officer.factionId === faction.id && officer.alive);
    if (!leader || leader.location.kind !== 'city')
      throw new Error(`Could not locate the living ruler for ${faction.name}.`);
    const rulerCityId = leader.location.cityId;
    const capital = scenario.cities.find(
      (city) => city.id === rulerCityId && city.factionId === faction.id,
    );
    const fallback = scenario.cities.find((city) => city.factionId === faction.id);
    if (!capital && !fallback) throw new Error(`Faction ${faction.id} has no starting city.`);
    const capitalCityId = capital?.id ?? fallback!.id;
    capitals.set(faction.id, capitalCityId);
    return {
      id: faction.id,
      name: faction.name,
      chinese: leader.chinese,
      leaderOfficerId: leader.id,
      color: faction.color,
      capitalCityId,
      isPlayer: faction.id === playerFactionId,
      eliminated: false,
    };
  });

  const cities: V03City[] = scenario.cities.map((city) => {
    const geo = CITY_GEOGRAPHY_BY_ID.get(city.id as CityId);
    if (!geo) throw new Error(`Missing historical geography for ${city.id}.`);
    const governanceMode =
      city.factionId === null
        ? 'steward'
        : capitals.get(city.factionId) === city.id
          ? 'ruler'
          : city.governorId &&
              officers.some(
                (officer) =>
                  officer.id === city.governorId &&
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
      reserve: city.reserve,
      reservePools: createReservePools(city.reserve / 2, city.reserve / 4, city.reserve / 4),
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
      governorId: governanceMode === 'governor' ? city.governorId : null,
      pendingAppointment: null,
      governanceMode,
      workMonthIndex: 0,
      workPointsUsed: 0,
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

  return {
    version: 3,
    ruleset: 'hegemony-3',
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
}

export function availableV03Scenarios() {
  return SCENARIOS.map(({ id, title, year, description }) => ({ id, title, year, description }));
}
