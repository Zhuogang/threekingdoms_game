import { createV03Game } from '../../../src/v03/initial-state';
import { createV03OrderServices } from '../../../src/v03/governance/services';
import { createPersonnelDay, personnelCount } from '../../../src/v03/campaign/personnel';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { encodeV03Save } from '../../../src/v03/platform/storage';

export function strandedReturnFixture(player = 'yuan') {
  const state = createV03Game(player, 91);
  const services = createV03OrderServices();
  const officer = state.officers.find((entry) => entry.id === 'caocao')!;
  officer.troops -= 83;
  officer.wounded += 83;
  const composition = {
    troopTypes: [officer.troopType],
    cavalryTroops: officer.troopType === 'cavalry' ? personnelCount(officer) : 0,
    woundedTroops: officer.wounded,
  };
  const route = services.planRoute({
    state,
    movingFactionId: 'cao',
    sourceCityId: 'chenliu',
    targetCityId: 'xuchang',
    departureDay: 0,
    troopCount: personnelCount(officer),
    kind: 'requisition',
    composition,
  })!;
  if (!route) throw new Error('Expected a route for the stranded-return fixture.');
  const created = services.createJourney({
    id: 'stranded-return',
    executionId: 'stranded-return:execution',
    ownerFactionId: 'cao',
    kind: 'requisition',
    sourceCityId: 'chenliu',
    targetCityId: 'xuchang',
    departureDay: 0,
    arrivalDay: route.estimatedDays,
    route,
    party: { officerIds: [officer.id], troopCount: personnelCount(officer), composition },
    cargo: { gold: 157, food: 233, troops: 0 },
    carriedFood: 1000,
  });
  state.journeys.push({ ...created, kind: 'return', status: 'waiting' });
  const journey = state.journeys[0]!;
  journey.segmentProgressKm = journey.routeSnapshot.map((segment) => segment.lengthKm);
  journey.segmentWaitDays.fill(0);
  journey.elapsedDays = route.estimatedDays;
  state.absoluteDay = route.estimatedDays + 1;
  const target = state.cities.find((city) => city.id === 'xuchang')!;
  for (const city of state.cities.filter((city) => city.factionId === 'cao')) {
    city.factionId = 'yuan';
    city.governorId = null;
    city.governanceMode = 'steward';
    city.population += city.reserve;
    city.reservePools = createReservePools();
    city.reserve = 0;
    city.garrisonTroops = 0;
    city.garrisonExperience = 0;
  }
  for (const entry of state.officers.filter((entry) => entry.factionId === 'cao')) {
    entry.governorOfCityId = null;
    entry.location = { kind: 'captured', cityId: target.id };
  }
  officer.location = { kind: 'journey', journeyId: journey.id };
  state.personnelDay = createPersonnelDay(state);
  encodeV03Save(state);
  return { state, journey, target, officer };
}
