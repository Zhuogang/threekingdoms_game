import {
  recordAiDecision,
  type CampaignDecisionReason,
  type AiDecisionEvent,
} from './ai/decision-trace';
import {
  busyCampaignTargets,
  rivalCampaignSourceBlock,
  rivalCampaignTargetBlock,
  isRivalCampaignOfficerAvailable,
} from './ai/campaign-legality';
import { committedCityStock } from './governance/city-actions';
import { cityBattleRoster } from './campaign/roster';
import { assessCampaignDeparture } from './ai/campaign-assessment';
/**
 * Deterministic monthly rival campaign planning for v0.3.
 *
 * This module is intentionally a pure planner: it reads one state snapshot and
 * returns executable campaign intents. The engine owns committing an intent to a
 * directive/journey and debiting food. A caller should commit each returned plan
 * before invoking the planner again, so the state's active-order checks can see it.
 */
import { estimateCampaignSupply, type SupplyEstimate, type SupplyEstimateInput } from './calendar';
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

type CampaignEvent = Extract<AiDecisionEvent, { kind: 'campaign' }>;

interface Candidate extends StrategicRivalCampaignPlan {
  defenderTroops: number;
  score: number;
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

function partyAlternatives(
  officers: readonly V03Officer[],
  maxTroops: number,
  defenderTroops: number,
): OrderPartyPlan[] {
  if (!Number.isSafeInteger(maxTroops) || maxTroops <= 0) return [];
  const smallest = Math.min(...officers.map((officer) => officer.troops));
  const parties: OrderPartyPlan[] = [];
  const seen = new Set<string>();
  for (const mode of ['small', 'balanced', 'maximum'] as const) {
    const desired =
      mode === 'small'
        ? Math.max(1, Math.ceil(defenderTroops * 1.2))
        : mode === 'balanced'
          ? Math.max(smallest * 2, Math.ceil(defenderTroops * 1.6))
          : maxTroops;
    const pool = officers.slice();
    if (mode === 'small')
      pool.sort(
        (a, b) =>
          a.troops - b.troops ||
          Number(a.troopType === 'cavalry') - Number(b.troopType === 'cavalry') ||
          b.force - a.force ||
          compareIds(a.id, b.id),
      );
    const selected: V03Officer[] = [];
    let troopCount = 0;
    while (pool.length && selected.length < MAX_OFFICERS_PER_PARTY && troopCount < desired) {
      const index =
        mode === 'balanced'
          ? pool.findIndex(
              (officer) =>
                troopCount + officer.troops <= maxTroops &&
                !selected.some((member) => member.troopType === officer.troopType),
            )
          : -1;
      const [officer] = pool.splice(index < 0 ? 0 : index, 1);
      if (!officer || troopCount + officer.troops > maxTroops) continue;
      selected.push(officer);
      troopCount += officer.troops;
    }
    if (!troopCount) continue;
    const key = selected
      .map((officer) => officer.id)
      .sort(compareIds)
      .join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    parties.push({
      officerIds: selected.map((officer) => officer.id),
      troopCount,
      composition: {
        cavalryTroops: selected
          .filter((officer) => officer.troopType === 'cavalry')
          .reduce((sum, officer) => sum + officer.troops, 0),
        troopTypes: selected.map((officer) => officer.troopType),
        heavySupplyTrain: true,
      },
    });
  }
  return parties;
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

function makeCandidate(
  state: Readonly<V03GameState>,
  factionId: string,
  sourceCityId: string,
  targetCityId: string,
  defenderTroops: number,
  party: OrderPartyPlan,
  services: StrategicAiPlannerServices,
  blocked: CampaignEvent[],
): Candidate | null {
  const observe = (event: CampaignEvent) => {
    recordAiDecision(event);
    if (event.status === 'rejected') blocked.push(event);
  };
  const reject = (reason: CampaignDecisionReason) => {
    observe({
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
  if (availableFood < supply.totalFood) {
    observe({
      kind: 'campaign',
      day: state.absoluteDay,
      factionId,
      sourceCityId,
      targetCityId,
      status: 'rejected',
      reason: 'unaffordable',
      troops: party.troopCount,
      defenderTroops,
      food: supply.totalFood,
      availableFood,
      foodDeficit: supply.totalFood - availableFood,
      travelDays: route.estimatedDays,
    });
    return null;
  }
  const assessment = assessCampaignDeparture(
    state,
    sourceCityId,
    targetCityId,
    party,
    supply.totalFood,
    route.estimatedDays,
  );
  // Ordinal value: one city, discounted by casualties, provisions, committed
  // soldiers, travel time and credible exposure at home. Hold/preparation is zero.
  const score =
    1000 /
    (1 +
      assessment.matchup.expectedLosses / 1000 +
      supply.totalFood / 10000 +
      party.troopCount / 10000 +
      route.estimatedDays / 30 +
      assessment.homeRisk * 0.5);
  observe({
    kind: 'campaign',
    day: state.absoluteDay,
    factionId,
    sourceCityId,
    targetCityId,
    status: assessment.reason ? 'rejected' : 'eligible',
    reason: assessment.reason ?? 'viable-campaign',
    troops: party.troopCount,
    defenderTroops,
    officerIds: [...party.officerIds],
    food: supply.totalFood,
    availableFood,
    travelDays: route.estimatedDays,
    score,
    forceRatio: assessment.matchup.ratio,
    expectedLosses: assessment.matchup.expectedLosses,
    homeProjectedFood: assessment.economy.projectedAvailable.food,
    homeRisk: assessment.homeRisk,
    forceDeficit: assessment.forceDeficit,
    foodDeficit: assessment.foodDeficit,
  });
  if (assessment.reason) return null;

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
    score,
  };
}

function compareCandidates(a: Candidate, b: Candidate): number {
  return (
    b.score - a.score ||
    a.food - b.food ||
    a.route.estimatedDays - b.route.estimatedDays ||
    compareIds(a.sourceCityId, b.sourceCityId) ||
    compareIds(a.targetCityId, b.targetCityId)
  );
}

/**
 * Build legal rival campaign plans from the current state, normally once after a
 * monthly settlement. The planner never mutates the state, uses no RNG or clock,
 * considers independent cities, excludes friendly/occupied targets, and returns
 * a deterministic shortlist of three source/target options and three parties each.
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
    const blocked: CampaignEvent[] = [];
    const optionsToRank: Array<{
      sourceCityId: string;
      targetCityId: string;
      defenderTroops: number;
      officers: V03Officer[];
      troopLimit: number;
      distance: number;
    }> = [];

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

        const routeId = routeIdBetween(source.id as CityId, target.id as CityId);
        const routeDefinition = ROUTE_BY_ID.get(routeId);
        if (!routeDefinition) continue;
        const reserved = committedCityStock(state, source.id);
        const troopLimit = Math.max(
          0,
          source.garrisonTroops - reserved.troops - protectedMinimumGarrison(source.garrisonTroops),
        );
        const officers = availableOfficers(state, faction.id, source.id, faction.leaderOfficerId);
        const deployable = Math.min(
          troopLimit,
          officers.reduce((sum, officer) => sum + officer.troops, 0),
        );
        if (deployable <= 0 || !officers.some((officer) => officer.troops <= troopLimit)) {
          recordAiDecision({
            kind: 'campaign',
            day: state.absoluteDay,
            factionId: faction.id,
            sourceCityId: source.id,
            targetCityId: target.id,
            status: 'rejected',
            reason: 'no-party',
          });
          continue;
        }
        const defenderTroops = cityBattleRoster(state, target.id, 'shortlist').roster.reduce(
          (sum, unit) => sum + unit.troops,
          0,
        );
        optionsToRank.push({
          sourceCityId: source.id,
          targetCityId: target.id,
          defenderTroops,
          officers,
          troopLimit,
          distance: routeDefinition.segments.reduce((sum, segment) => sum + segment.lengthKm, 0),
        });
      }
    }
    optionsToRank.sort(
      (a, b) =>
        a.defenderTroops / a.troopLimit - b.defenderTroops / b.troopLimit ||
        a.distance - b.distance ||
        compareIds(a.sourceCityId, b.sourceCityId) ||
        compareIds(a.targetCityId, b.targetCityId),
    );
    for (const option of optionsToRank.slice(0, 3)) {
      for (const party of partyAlternatives(
        option.officers,
        option.troopLimit,
        option.defenderTroops,
      )) {
        const candidate = makeCandidate(
          state,
          faction.id,
          option.sourceCityId,
          option.targetCityId,
          option.defenderTroops,
          party,
          services,
          blocked,
        );
        if (candidate) candidates.push(candidate);
      }
    }

    if (!candidates.length)
      recordAiDecision({
        kind: 'campaign',
        day: state.absoluteDay,
        factionId: faction.id,
        ...blocked[0],
        status: 'wait',
        reason: blocked[0]?.reason ?? 'no-eligible-campaign',
        score: 0,
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
        reason: 'viable-campaign',
        score: candidate.score,
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
