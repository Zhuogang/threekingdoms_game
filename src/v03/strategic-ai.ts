import { recordAiDecision, type CampaignDecisionReason } from './ai/decision-trace';
import {
  busyCampaignTargets,
  rivalCampaignSourceBlock,
  rivalCampaignTargetBlock,
  isRivalCampaignOfficerAvailable,
} from './ai/campaign-legality';
import { committedCityStock } from './governance/city-actions';
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
import type { V03GameState, V03Officer } from './types';

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
  /** A monthly retry refreshes one faction's alternatives against the latest state. */
  factionId?: string;
  excludedCandidates?: readonly Pick<StrategicRivalCampaignPlan, 'sourceCityId' | 'targetCityId'>[];
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

function protectedMinimumGarrison(troops: number): number {
  // Keep the authority layer's established minimum: 35% of the garrison, capped at 1,000.
  return Math.min(1000, Math.ceil(troops * 0.35));
}

function availableOfficers(
  state: Readonly<V03GameState>,
  factionId: string,
  cityId: string,
  leaderOfficerId: string,
): V03Officer[] {
  return state.officers
    .filter((officer) => isRivalCampaignOfficerAvailable(state, officer, factionId, cityId))
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
        officer.troops > 0 &&
        officer.reorganizationDays === 0,
    )
    .reduce((total, officer) => total + officer.troops, 0);
  // Match actual deployed strength; an undefended city receives no free militia.
  return Math.max(target.garrisonTroops, staffedTroops);
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
  const reject = (reason: CampaignDecisionReason) => {
    recordAiDecision({
      kind: 'campaign',
      day: state.absoluteDay,
      factionId,
      sourceCityId,
      targetCityId,
      status: 'rejected',
      reason,
    });
    return null;
  };
  const source = state.cities.find((city) => city.id === sourceCityId);
  if (!source || source.factionId !== factionId) return reject('source-busy');

  const routeId = routeIdBetween(sourceCityId as CityId, targetCityId as CityId);
  const routeDefinition = ROUTE_BY_ID.get(routeId);
  if (!routeDefinition) return reject('no-route');

  const reservedTroops = committedCityStock(state, sourceCityId).troops;
  const troopLimit = Math.max(
    0,
    source.garrisonTroops - reservedTroops - protectedMinimumGarrison(source.garrisonTroops),
  );
  const party = buildParty(state, factionId, sourceCityId, leaderOfficerId, troopLimit);
  if (!party) return reject('no-party');

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
    return reject('invalid-route');
  }
  if (!validateRoute(route, routeId)) return reject('invalid-route');

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
    return reject('invalid-supply');
  }
  const availableFood = source.food - committedCityStock(state, sourceCityId).food;
  if (!Number.isSafeInteger(supply.totalFood) || supply.totalFood <= 0)
    return reject('invalid-supply');
  recordAiDecision({
    kind: 'campaign',
    day: state.absoluteDay,
    factionId,
    sourceCityId,
    targetCityId,
    status: availableFood < supply.totalFood ? 'rejected' : 'eligible',
    reason: availableFood < supply.totalFood ? 'unaffordable' : 'force-ratio-and-travel',
    troops: party.troopCount,
    defenderTroops,
    food: supply.totalFood,
    availableFood,
    travelDays: route.estimatedDays,
  });
  if (availableFood < supply.totalFood) return null;

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
  const busyTargets = busyCampaignTargets(state);
  const plannedTargets = new Set<string>();
  const result: StrategicRivalCampaignPlan[] = [];

  const rivalFactions = state.factions
    .filter(
      (faction) =>
        faction.id !== state.playerFactionId &&
        !faction.isPlayer &&
        !faction.eliminated &&
        (!options.factionId || faction.id === options.factionId),
    )
    .sort((a, b) => compareIds(a.id, b.id));

  for (const faction of rivalFactions) {
    const ownedCities = state.cities
      .filter((city) => city.factionId === faction.id)
      .sort((a, b) => compareIds(a.id, b.id));
    const candidates: Candidate[] = [];

    for (const source of ownedCities) {
      const sourceBlock = rivalCampaignSourceBlock(state, faction.id, source.id);
      if (sourceBlock) {
        recordAiDecision({
          kind: 'campaign',
          day: state.absoluteDay,
          factionId: faction.id,
          sourceCityId: source.id,
          status: 'rejected',
          reason: sourceBlock,
        });
        continue;
      }
      for (const target of state.cities) {
        if (
          options.excludedCandidates?.some(
            (previous) =>
              previous.sourceCityId === source.id && previous.targetCityId === target.id,
          )
        )
          continue;
        const targetBlock = plannedTargets.has(target.id)
          ? 'target-busy'
          : rivalCampaignTargetBlock(state, faction.id, target.id, busyTargets);
        if (targetBlock) {
          recordAiDecision({
            kind: 'campaign',
            day: state.absoluteDay,
            factionId: faction.id,
            sourceCityId: source.id,
            targetCityId: target.id,
            status: 'rejected',
            reason: targetBlock,
          });
          continue;
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

    if (!candidates.length)
      recordAiDecision({
        kind: 'campaign',
        day: state.absoluteDay,
        factionId: faction.id,
        status: 'wait',
        reason: 'no-eligible-campaign',
      });
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
      recordAiDecision({
        kind: 'campaign',
        day: state.absoluteDay,
        factionId: faction.id,
        sourceCityId: candidate.sourceCityId,
        targetCityId: candidate.targetCityId,
        status: 'selected',
        reason: 'force-ratio-and-travel',
        troops: candidate.proposedTroops,
        defenderTroops: candidate.defenderTroops,
        food: candidate.food,
        travelDays: candidate.route.estimatedDays,
      });
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
