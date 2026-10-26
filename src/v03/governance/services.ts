import {
  createJourney as createCalendarJourney,
  estimateTravel,
  type TravelComposition,
} from '../calendar';
import {
  findStrategicRoutePath,
  ROUTE_BY_ID,
  ROUTE_DEFINITIONS,
  type CityId,
  type RouteDefinition,
} from '../geography';
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
  const source = input.state.cities.find((city) => city.id === input.sourceCityId);
  if (!source?.factionId) return null;
  const allowedCityIds = new Set<CityId>([
    ...input.state.cities
      .filter((city) => city.factionId === source.factionId)
      .map((city) => city.id as CityId),
    input.targetCityId as CityId,
  ]);
  const path = findStrategicRoutePath(input.sourceCityId as CityId, input.targetCityId as CityId, {
    allowedCityIds,
    departureAbsoluteDay: input.departureDay,
    composition: input.composition,
  });
  if (!path || path.legs.length === 0) return null;
  const legs = path.legs.map((leg) => ({
    leg,
    travel: estimateTravel(leg.route, leg.direction, input.departureDay, input.composition),
  }));
  const routeSnapshot = legs.flatMap(({ leg, travel }) =>
    travel.segments.map((segment, index) => ({
      terrain: segment.terrain,
      lengthKm: segment.lengthKm,
      baseSpeedKmPerDay: segment.baseSpeedKmPerDay,
      speedMultiplier: segment.speedMultiplier,
      fixedDelayDays: leg.route.segments[index]?.fixedDelayDays ?? 0,
    })),
  );
  const routeId =
    path.legs.length === 1 ? path.legs[0]!.route.id : `path-${stablePathHash(path.cityIds)}`;
  return {
    routeId,
    routeVersion: 'v0.3-geography-2-path',
    roadKmNominal: path.roadKmNominal,
    estimatedDays: path.estimatedDays,
    routeCityIds: path.cityIds,
    routeSnapshot,
  };
}

function stablePathHash(cityIds: readonly string[]): string {
  let hash = 2_166_136_261;
  for (const character of cityIds.join('\u0000'))
    hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return (hash >>> 0).toString(16).padStart(8, '0');
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
    cavalryTroops: selected
      .filter((o) => o.troopType === 'cavalry')
      .reduce((sum, o) => sum + o.troops, 0),
    heavySupplyTrain: input.kind === 'campaign',
  };
  return { officerIds: selected.map((officer) => officer.id), troopCount, composition };
}

function createJourney(input: JourneyCreationInput): V03Journey {
  const base =
    ROUTE_BY_ID.get(input.route.routeId) ??
    ROUTE_BY_ID.get(input.route.routeCityIds?.slice(0, 2).sort().join('--') ?? '') ??
    ROUTE_DEFINITIONS[0]!;
  const route: RouteDefinition = {
    ...base,
    id: input.route.routeId,
    fromCityId: input.sourceCityId as CityId,
    toCityId: input.targetCityId as CityId,
    roadKmLow: input.route.roadKmNominal,
    roadKmNominal: input.route.roadKmNominal,
    roadKmHigh: input.route.roadKmNominal,
    segments: input.route.routeSnapshot.map((segment) => ({
      terrain: segment.terrain,
      lengthKm: segment.lengthKm,
      fixedDelayDays: segment.fixedDelayDays,
      researchNote: 'Copied from the versioned leg geography snapshot.',
    })),
  };
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
  return {
    ...journey,
    kind: input.kind,
    routeCityIds: [...(input.route.routeCityIds ?? [input.sourceCityId, input.targetCityId])],
    ...(input.intent ? { intent: input.intent } : {}),
  };
}

export function createV03OrderServices(): GovernanceOrderServices {
  return { planRoute, planParty, createJourney };
}
