import { isCityCommitted } from './governance/commitments';
/**
 * Deterministic monthly rival campaign planning for v0.3.
 *
 * This module is intentionally a pure planner: it reads one state snapshot and
 * returns executable campaign intents. The engine owns committing an intent to a
 * directive/journey and debiting food. A caller should commit each returned plan
 * before invoking the planner again, so the state's active-order checks can see it.
 */
import {
  estimateCampaignSupply,
  type SupplyEstimate,
  type SupplyEstimateInput,
  type TravelComposition,
} from './calendar';
import { createV03OrderServices } from './governance/services';
import type { OrderPartyPlan, OrderRoutePlan, PlanRouteInput } from './governance/orders';
import { ROUTE_BY_ID, routeIdBetween, type CityId } from './geography';
import type { V03CampaignDirective, V03GameState, V03Officer, V03OrderStatus } from './types';

const ACTIVE_DIRECTIVE_STATUSES: readonly V03OrderStatus[] = [
  'requested',
  'proposed',
  'waiting',
  'accepted',
  'reserved',
  'dispatched',
];
const ACTIVE_JOURNEY_STATUSES = new Set(['outbound', 'returning', 'waiting']);
const CAMPAIGN_BATTLE_RESERVE_DAYS = 30;
const MAX_OFFICERS_PER_PARTY = 10;

/** Route and ration callbacks mirror the existing order service contracts. */
export interface StrategicAiPlannerServices {
  planRoute(input: PlanRouteInput): OrderRoutePlan | null;
  estimateSupply(input: SupplyEstimateInput): SupplyEstimate;
}

/**
 * One validated, immediately executable rival order proposal.
 *
 * The engine can create a V03CampaignDirective and V03Journey from this data
 * using its normal ID allocation and dispatch path. `requestedTroops` always
 * equals the whole-officer `party.troopCount`; `food` uses the same 30-day
 * battle reserve and return-trip estimate as player campaign orders.
 */
export interface StrategicRivalCampaignPlan {
  factionId: string;
  sourceCityId: string;
  targetCityId: string;
  intent: 'conquer';
  requestedTroops: number;
  proposedTroops: number;
  requestedByDay: null;
  departureDay: number;
  estimatedArrivalDay: number;
  officerIds: readonly string[];
  party: OrderPartyPlan;
  route: OrderRoutePlan;
  supply: SupplyEstimate;
  food: number;
}

export interface StrategicAiPlannerOptions {
  /** Override only for tests or host-specific route/ration services. */
  services?: StrategicAiPlannerServices;
  /** Number of new attacks a rival may plan at one monthly boundary; defaults to one. */
  maxPlansPerFaction?: number;
}

interface Candidate extends StrategicRivalCampaignPlan {
  defenderTroops: number;
}

const defaultOrderServices = createV03OrderServices();
const defaultPlannerServices: StrategicAiPlannerServices = {
  planRoute: defaultOrderServices.planRoute,
  estimateSupply: estimateCampaignSupply,
};

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isActiveDirective(directive: V03CampaignDirective): boolean {
  return ACTIVE_DIRECTIVE_STATUSES.includes(directive.status);
}

function activeCampaignJourneys(state: Readonly<V03GameState>) {
  return state.journeys.filter(
    (journey) => journey.kind === 'campaign' && ACTIVE_JOURNEY_STATUSES.has(journey.status),
  );
}

function protectedMinimumGarrison(troops: number): number {
  // Keep the authority layer's established minimum: 35% of the garrison, capped at 1,000.
  return Math.min(1000, Math.ceil(troops * 0.35));
}

function reservedSourceTroops(state: Readonly<V03GameState>, cityId: string): number {
  const requisitions = state.requisitions
    .filter(
      (order) =>
        order.sourceCityId === cityId &&
        order.journeyId === null &&
        ['accepted', 'reserved', 'dispatched'].includes(order.status),
    )
    .reduce((total, order) => total + order.proposed.troops, 0);
  const directives = state.directives
    .filter(
      (order) =>
        order.sourceCityId === cityId &&
        order.journeyId === null &&
        ['accepted', 'reserved', 'dispatched'].includes(order.status),
    )
    .reduce((total, order) => total + order.proposedTroops, 0);
  return requisitions + directives;
}

function reservedSourceFood(state: Readonly<V03GameState>, cityId: string): number {
  return state.requisitions
    .filter(
      (order) =>
        order.sourceCityId === cityId &&
        order.journeyId === null &&
        ['accepted', 'reserved', 'dispatched'].includes(order.status),
    )
    .reduce((total, order) => total + order.proposed.food, 0);
}

function availableOfficers(
  state: Readonly<V03GameState>,
  factionId: string,
  cityId: string,
  leaderOfficerId: string,
): V03Officer[] {
  return state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === cityId &&
        officer.troops > 0,
    )
    .sort((a, b) => {
      const leaderOrder = Number(b.id === leaderOfficerId) - Number(a.id === leaderOfficerId);
      return leaderOrder || b.force - a.force || b.troops - a.troops || compareIds(a.id, b.id);
    });
}

function buildParty(
  state: Readonly<V03GameState>,
  factionId: string,
  cityId: string,
  leaderOfficerId: string,
  maxTroops: number,
): OrderPartyPlan | null {
  if (!Number.isSafeInteger(maxTroops) || maxTroops <= 0) return null;
  const selected: V03Officer[] = [];
  let troopCount = 0;
  for (const officer of availableOfficers(state, factionId, cityId, leaderOfficerId)) {
    if (selected.length >= MAX_OFFICERS_PER_PARTY) break;
    if (troopCount + officer.troops > maxTroops) continue;
    selected.push(officer);
    troopCount += officer.troops;
  }
  if (troopCount <= 0) return null;
  const composition: TravelComposition = {
    cavalryTroops: selected
      .filter((o) => o.troopType === 'cavalry')
      .reduce((sum, o) => sum + o.troops, 0),
    troopTypes: selected.map((officer) => officer.troopType),
    heavySupplyTrain: true,
  };
  return {
    officerIds: selected.map((officer) => officer.id),
    troopCount,
    composition,
  };
}

function hasActiveSourceOrder(state: Readonly<V03GameState>, cityId: string): boolean {
  if (
    state.directives.some(
      (directive) => directive.sourceCityId === cityId && isActiveDirective(directive),
    )
  )
    return true;
  return activeCampaignJourneys(state).some((journey) => journey.sourceCityId === cityId);
}

function getBusyCampaignTargets(state: Readonly<V03GameState>): Set<string> {
  const busy = new Set<string>();
  for (const directive of state.directives) {
    if (isActiveDirective(directive)) busy.add(directive.targetCityId);
  }
  for (const journey of activeCampaignJourneys(state)) busy.add(journey.destinationCityId);
  for (const battle of state.battles) {
    if (!battle.active || battle.resolved) continue;
    for (const journeyId of [battle.attackerJourneyId, battle.defenderJourneyId]) {
      if (!journeyId) continue;
      const journey = state.journeys.find((entry) => entry.id === journeyId);
      if (journey) busy.add(journey.destinationCityId);
    }
  }
  return busy;
}

function validateRoute(
  route: OrderRoutePlan | null,
  expectedRouteId: string,
): route is OrderRoutePlan {
  return Boolean(
    route &&
    route.routeId === expectedRouteId &&
    ROUTE_BY_ID.has(route.routeId) &&
    Number.isSafeInteger(route.estimatedDays) &&
    route.estimatedDays > 0 &&
    Number.isFinite(route.roadKmNominal) &&
    route.roadKmNominal > 0 &&
    Array.isArray(route.routeSnapshot) &&
    route.routeSnapshot.length > 0,
  );
}

function expectedBattleDefenderTroops(state: Readonly<V03GameState>, cityId: string): number {
  const target = state.cities.find((city) => city.id === cityId);
  if (!target) return 0;
  const staffedTroops = state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === target.factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === target.id &&
        officer.troops > 0,
    )
    .reduce((total, officer) => total + officer.troops, 0);
  // openBattle supplies a 500-person militia when a city has no staffed
  // defenders, even when its stored garrison is zero.
  return Math.max(target.garrisonTroops, staffedTroops, staffedTroops === 0 ? 500 : 0);
}

function makeCandidate(
  state: Readonly<V03GameState>,
  factionId: string,
  leaderOfficerId: string,
  sourceCityId: string,
  targetCityId: string,
  defenderTroops: number,
  services: StrategicAiPlannerServices,
): Candidate | null {
  const source = state.cities.find((city) => city.id === sourceCityId);
  if (!source || source.factionId !== factionId) return null;

  const routeId = routeIdBetween(sourceCityId as CityId, targetCityId as CityId);
  const routeDefinition = ROUTE_BY_ID.get(routeId);
  if (!routeDefinition) return null;

  const reservedTroops = reservedSourceTroops(state, sourceCityId);
  const troopLimit = Math.max(
    0,
    source.garrisonTroops - reservedTroops - protectedMinimumGarrison(source.garrisonTroops),
  );
  const party = buildParty(state, factionId, sourceCityId, leaderOfficerId, troopLimit);
  if (!party) return null;

  let route: OrderRoutePlan | null;
  try {
    route = services.planRoute({
      state,
      sourceCityId,
      targetCityId,
      departureDay: state.absoluteDay,
      troopCount: party.troopCount,
      kind: 'campaign',
      composition: party.composition,
    });
  } catch {
    return null;
  }
  if (!validateRoute(route, routeId)) return null;

  let supply: SupplyEstimate;
  try {
    supply = services.estimateSupply({
      troopCount: party.troopCount,
      cavalryTroops: party.composition.cavalryTroops,
      outboundDays: route.estimatedDays,
      battleDays: CAMPAIGN_BATTLE_RESERVE_DAYS,
      returnDays: route.estimatedDays,
    });
  } catch {
    return null;
  }
  const availableFood = source.food - reservedSourceFood(state, sourceCityId);
  if (
    !Number.isSafeInteger(supply.totalFood) ||
    supply.totalFood <= 0 ||
    availableFood < supply.totalFood
  )
    return null;

  return {
    factionId,
    sourceCityId,
    targetCityId,
    intent: 'conquer',
    requestedTroops: party.troopCount,
    proposedTroops: party.troopCount,
    requestedByDay: null,
    departureDay: state.absoluteDay,
    estimatedArrivalDay: state.absoluteDay + route.estimatedDays,
    officerIds: [...party.officerIds],
    party,
    route,
    supply,
    food: supply.totalFood,
    defenderTroops,
  };
}

function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    a.defenderTroops / a.proposedTroops - b.defenderTroops / b.proposedTroops ||
    a.route.estimatedDays - b.route.estimatedDays ||
    compareIds(a.sourceCityId, b.sourceCityId) ||
    compareIds(a.targetCityId, b.targetCityId)
  );
}

/**
 * Build legal rival campaign plans from the current state, normally once after a
 * monthly settlement. The planner never mutates the state, uses no RNG or clock,
 * considers independent cities, excludes friendly/occupied targets, and returns
 * stable ordering by defender-to-proposed-force ratio and travel time.
 */
export function planStrategicRivalCampaigns(
  state: Readonly<V03GameState>,
  options: StrategicAiPlannerOptions = {},
): StrategicRivalCampaignPlan[] {
  if (
    state.phase === 'finished' ||
    !Number.isSafeInteger(state.absoluteDay) ||
    state.absoluteDay < 0
  )
    return [];
  const maxPlansPerFaction = options.maxPlansPerFaction ?? 1;
  if (!Number.isSafeInteger(maxPlansPerFaction) || maxPlansPerFaction < 1) return [];

  const services = options.services ?? defaultPlannerServices;
  const factionsById = new Map(state.factions.map((faction) => [faction.id, faction]));
  const busyTargets = getBusyCampaignTargets(state);
  const plannedTargets = new Set<string>();
  const result: StrategicRivalCampaignPlan[] = [];

  const rivalFactions = state.factions
    .filter(
      (faction) => faction.id !== state.playerFactionId && !faction.isPlayer && !faction.eliminated,
    )
    .sort((a, b) => compareIds(a.id, b.id));

  for (const faction of rivalFactions) {
    const ownedCities = state.cities
      .filter((city) => city.factionId === faction.id)
      .sort((a, b) => compareIds(a.id, b.id));
    const candidates: Candidate[] = [];

    for (const source of ownedCities) {
      if (isCityCommitted(state, source.id) || hasActiveSourceOrder(state, source.id)) continue;
      for (const target of state.cities) {
        if (
          target.id === source.id ||
          target.factionId === faction.id ||
          busyTargets.has(target.id) ||
          plannedTargets.has(target.id)
        )
          continue;
        // Independent cities are valid conquests. They are often the only
        // bridge between rival territories, so excluding them can stall a
        // faction even when it has troops and adjacent expansion options.
        if (target.factionId) {
          const targetFaction = factionsById.get(target.factionId);
          if (!targetFaction || targetFaction.eliminated) continue;
        }

        const candidate = makeCandidate(
          state,
          faction.id,
          faction.leaderOfficerId,
          source.id,
          target.id,
          expectedBattleDefenderTroops(state, target.id),
          services,
        );
        if (candidate) candidates.push(candidate);
      }
    }

    candidates.sort(compareCandidates);
    const plannedSources = new Set<string>();
    let factionPlans = 0;
    for (const candidate of candidates) {
      if (factionPlans >= maxPlansPerFaction) break;
      if (plannedSources.has(candidate.sourceCityId) || plannedTargets.has(candidate.targetCityId))
        continue;
      plannedSources.add(candidate.sourceCityId);
      plannedTargets.add(candidate.targetCityId);
      factionPlans++;
      result.push({
        factionId: candidate.factionId,
        sourceCityId: candidate.sourceCityId,
        targetCityId: candidate.targetCityId,
        intent: candidate.intent,
        requestedTroops: candidate.requestedTroops,
        proposedTroops: candidate.proposedTroops,
        requestedByDay: candidate.requestedByDay,
        departureDay: candidate.departureDay,
        estimatedArrivalDay: candidate.estimatedArrivalDay,
        officerIds: candidate.officerIds,
        party: candidate.party,
        route: candidate.route,
        supply: candidate.supply,
        food: candidate.food,
      });
    }
  }

  return result;
}
