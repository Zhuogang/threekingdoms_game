import {
  createJourney as createCalendarJourney,
  estimateTravel,
  type TravelComposition,
} from '../calendar';
import { ROUTE_BY_ID, routeIdBetween, type CityId } from '../geography';
import type { V03Journey } from '../types';
import type {
  GovernanceOrderServices,
  JourneyCreationInput,
  OrderPartyPlan,
  OrderRoutePlan,
  PlanPartyInput,
  PlanRouteInput,
} from './orders';

function planRoute(input: PlanRouteInput): OrderRoutePlan | null {
  const route = ROUTE_BY_ID.get(
    routeIdBetween(input.sourceCityId as CityId, input.targetCityId as CityId),
  );
  if (!route) return null;
  const direction = input.sourceCityId === route.fromCityId ? 'forward' : 'reverse';
  const travel = estimateTravel(route, direction, input.departureDay, input.composition);
  return {
    routeId: route.id,
    routeVersion: 'v0.3-geography-1',
    roadKmNominal: route.roadKmNominal,
    estimatedDays: travel.estimatedDays,
    routeSnapshot: travel.segments.map((segment, index) => ({
      terrain: segment.terrain,
      lengthKm: segment.lengthKm,
      baseSpeedKmPerDay: segment.baseSpeedKmPerDay,
      speedMultiplier: segment.speedMultiplier,
      fixedDelayDays: route.segments[index]?.fixedDelayDays ?? 0,
    })),
  };
}

function planParty(input: PlanPartyInput): OrderPartyPlan | null {
  if (input.maxTroops <= 0)
    return { officerIds: [], troopCount: 0, composition: { troopTypes: [] } };
  const candidates = input.state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === input.state.playerFactionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === input.sourceCityId &&
        officer.troops > 0,
    )
    .sort((a, b) => {
      const leaderA =
        a.id ===
        input.state.factions.find((faction) => faction.id === input.state.playerFactionId)
          ?.leaderOfficerId
          ? 1
          : 0;
      const leaderB =
        b.id ===
        input.state.factions.find((faction) => faction.id === input.state.playerFactionId)
          ?.leaderOfficerId
          ? 1
          : 0;
      return (
        leaderB - leaderA || b.force - a.force || b.troops - a.troops || a.id.localeCompare(b.id)
      );
    });
  const selected = [] as typeof candidates;
  let troopCount = 0;
  for (const officer of candidates) {
    if (selected.length >= 10) break;
    if (troopCount + officer.troops > input.maxTroops) continue;
    selected.push(officer);
    troopCount += officer.troops;
  }
  if (troopCount === 0) return null;
  const troopTypes = selected.map((officer) => officer.troopType);
  const composition: TravelComposition = {
    troopTypes,
    heavySupplyTrain: input.kind === 'campaign',
  };
  return { officerIds: selected.map((officer) => officer.id), troopCount, composition };
}

function createJourney(input: JourneyCreationInput): V03Journey {
  const route = ROUTE_BY_ID.get(input.route.routeId);
  if (!route) throw new Error(`Unknown route ${input.route.routeId}.`);
  const journey = createCalendarJourney({
    id: input.id,
    executionId: input.executionId,
    ownerFactionId: input.ownerFactionId,
    route,
    sourceCityId: input.sourceCityId as CityId,
    destinationCityId: input.targetCityId as CityId,
    departureAbsoluteDay: input.departureDay,
    routeVersion: input.route.routeVersion,
    manifest: {
      officerIds: input.party.officerIds,
      troopCount: input.party.troopCount,
      composition: input.party.composition,
      carriedFood: input.carriedFood,
      cargo: { gold: input.cargo.gold, food: input.cargo.food, troops: input.cargo.troops },
    },
  });
  if (journey.expectedArrivalDay !== input.arrivalDay)
    throw new Error('Journey estimate changed while building its snapshot.');
  return { ...journey, kind: input.kind, ...(input.intent ? { intent: input.intent } : {}) };
}

export function createV03OrderServices(): GovernanceOrderServices {
  return { planRoute, planParty, createJourney };
}
