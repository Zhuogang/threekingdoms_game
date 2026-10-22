import type { TravelComposition, JourneySegmentSnapshot } from '../calendar';
import { estimateCampaignSupply } from '../calendar';
import { getV03AttackAllianceBlock } from '../campaign/monthly-systems';
import { estimateRequisition } from './authority';
import type {
  V03BattleIntent,
  V03CampaignDirective,
  V03GameState,
  V03Journey,
  V03JourneyCargo,
  V03JourneyKind,
  V03OrderStatus,
  V03Requisition,
} from '../types';

export type GovernanceOrderReasonCode =
  | 'order.invalid-phase'
  | 'order.invalid-amount'
  | 'order.source-unavailable'
  | 'order.target-unavailable'
  | 'order.same-city'
  | 'order.target-not-friendly'
  | 'order.target-is-friendly'
  | 'order.target-allied'
  | 'order.target-cooldown'
  | 'order.route-unavailable'
  | 'order.party-unavailable'
  | 'order.minimum-garrison'
  | 'order.shortfall'
  | 'order.deadline-too-soon'
  | 'order.active-directive'
  | 'order.stale-proposal'
  | 'order.invalid-choice'
  | 'order.invalid-reduction'
  | 'order.already-dispatched'
  | 'order.already-closed'
  | 'order.dispatch-failed'
  | 'order.not-found';

export interface OrderRoutePlan {
  routeId: string;
  routeVersion: string;
  roadKmNominal: number;
  estimatedDays: number;
  /** Ordered origin, friendly transit cities, and destination for map and audit display. */
  routeCityIds?: readonly string[];
  /** Route data is snapshotted by the journey factory; no later route edit changes an ETA. */
  routeSnapshot: readonly JourneySegmentSnapshot[];
}

export interface OrderPartyPlan {
  /** Whole officers are assigned to the journey; the selected troops must equal their rostered troops. */
  officerIds: readonly string[];
  troopCount: number;
  composition: TravelComposition;
}

export interface PlanRouteInput {
  state: Readonly<V03GameState>;
  sourceCityId: string;
  targetCityId: string;
  departureDay: number;
  troopCount: number;
  kind: Extract<V03JourneyKind, 'requisition' | 'campaign' | 'appointment'>;
  composition: TravelComposition;
}

export interface PlanPartyInput {
  state: Readonly<V03GameState>;
  sourceCityId: string;
  maxTroops: number;
  kind: Extract<V03JourneyKind, 'requisition' | 'campaign'>;
}

export interface JourneyCreationInput {
  id: string;
  executionId: string;
  ownerFactionId: string;
  kind: Extract<V03JourneyKind, 'requisition' | 'campaign' | 'appointment'>;
  intent?: V03BattleIntent;
  sourceCityId: string;
  targetCityId: string;
  departureDay: number;
  arrivalDay: number;
  route: OrderRoutePlan;
  party: OrderPartyPlan;
  /** Requisition cargo is delivered; campaign provisions go in carriedFood and are consumed in transit. */
  cargo: V03JourneyCargo;
  carriedFood: number;
}

/** Inject route lookup and journey construction so governance does not own geography or logistics math. */
export interface GovernanceOrderServices {
  planRoute(input: PlanRouteInput): OrderRoutePlan | null;
  planParty(input: PlanPartyInput): OrderPartyPlan | null;
  createJourney(input: JourneyCreationInput): V03Journey;
}

export interface RequisitionInput {
  sourceCityId: string;
  targetCityId: string;
  requested: V03JourneyCargo;
  requestedByDay: number | null;
}

export interface CampaignDirectiveInput {
  sourceCityId: string;
  targetCityId: string;
  intent: V03BattleIntent;
  requestedTroops: number;
  requestedByDay: number | null;
}

export interface RequisitionPreview {
  requested: V03JourneyCargo;
  executable: V03JourneyCargo;
  deficit: V03JourneyCargo;
  earliestDepartureDay: number | null;
  estimatedArrivalDay: number | null;
  ready: boolean;
  requiresPlayerChoice: boolean;
  route: OrderRoutePlan | null;
  party: OrderPartyPlan | null;
  reasonCodes: GovernanceOrderReasonCode[];
  reasons: string[];
}

export interface CampaignDirectivePreview {
  requestedTroops: number;
  executableTroops: number;
  deficitTroops: number;
  requestedFood: number;
  executableFood: number;
  earliestDepartureDay: number | null;
  estimatedArrivalDay: number | null;
  ready: boolean;
  requiresPlayerChoice: boolean;
  route: OrderRoutePlan | null;
  party: OrderPartyPlan | null;
  reasonCodes: GovernanceOrderReasonCode[];
  reasons: string[];
}

export interface GovernanceOrderResult<TOrder, TPreview> {
  ok: boolean;
  state: V03GameState;
  order?: TOrder;
  preview?: TPreview;
  reasonCode?: GovernanceOrderReasonCode;
  message?: string;
}

const zeroCargo = (): V03JourneyCargo => ({ gold: 0, food: 0, troops: 0 });
const ACTIVE_DIRECTIVE_STATUSES: readonly V03OrderStatus[] = [
  'requested',
  'proposed',
  'waiting',
  'accepted',
  'reserved',
  'dispatched',
];

function msg(code: GovernanceOrderReasonCode, detail?: string): string {
  const base: Record<GovernanceOrderReasonCode, string> = {
    'order.invalid-phase': 'Orders can only be issued during campaign planning.',
    'order.invalid-amount': 'Enter a positive whole-number amount within the available range.',
    'order.source-unavailable': 'The source city is no longer held by your faction.',
    'order.target-unavailable': 'The destination city no longer exists.',
    'order.same-city': 'Choose a different destination city.',
    'order.target-not-friendly': 'The destination must be held by your faction.',
    'order.target-is-friendly': 'A campaign directive must target an enemy or independent city.',
    'order.target-allied': 'An active alliance prevents this attack.',
    'order.target-cooldown': 'This city is recovering from a recent raid or sack.',
    'order.route-unavailable': 'There is no currently usable route to the destination.',
    'order.party-unavailable': 'The governor cannot assemble an available force for this order.',
    'order.minimum-garrison': 'The city must retain its protected minimum garrison.',
    'order.shortfall':
      'The full request is not currently executable; choose a reduced amount, wait, or cancel.',
    'order.deadline-too-soon':
      'The earliest feasible departure is later than the requested deadline.',
    'order.active-directive': 'This source city already has an active campaign directive.',
    'order.stale-proposal':
      'Authority, resources, or the route changed; review the refreshed proposal before confirming.',
    'order.invalid-choice': 'This answer is not valid for the current order state.',
    'order.invalid-reduction':
      'The reduced amount must be positive and no greater than the current executable proposal.',
    'order.already-dispatched':
      'This order has already been dispatched; no additional resources were taken.',
    'order.already-closed': 'This order is already closed.',
    'order.dispatch-failed':
      'The shipment could not be created; no resources or officers were changed.',
    'order.not-found': 'The requested order could not be found.',
  };
  return detail ? `${base[code]} ${detail}` : base[code];
}

function validAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function addReason(
  codes: GovernanceOrderReasonCode[],
  reasons: string[],
  code: GovernanceOrderReasonCode,
  detail?: string,
) {
  if (!codes.includes(code)) codes.push(code);
  const text = msg(code, detail);
  if (!reasons.includes(text)) reasons.push(text);
}

function routePlan(
  state: V03GameState,
  services: GovernanceOrderServices,
  input: Omit<PlanRouteInput, 'state'>,
): OrderRoutePlan | null {
  try {
    const plan = services.planRoute({ ...input, state: structuredClone(state) });
    if (
      !plan ||
      !plan.routeId ||
      !plan.routeVersion ||
      !Number.isSafeInteger(plan.estimatedDays) ||
      plan.estimatedDays < 1 ||
      !Number.isFinite(plan.roadKmNominal) ||
      plan.roadKmNominal <= 0 ||
      !Array.isArray(plan.routeSnapshot) ||
      plan.routeSnapshot.length === 0
    )
      return null;
    return structuredClone(plan);
  } catch {
    return null;
  }
}

function partyPlan(
  state: V03GameState,
  services: GovernanceOrderServices,
  input: Omit<PlanPartyInput, 'state'>,
): OrderPartyPlan | null {
  if (input.maxTroops <= 0)
    return { officerIds: [], troopCount: 0, composition: { troopTypes: [] } };
  try {
    const party = services.planParty({ ...input, state: structuredClone(state) });
    if (
      !party ||
      !Number.isSafeInteger(party.troopCount) ||
      party.troopCount <= 0 ||
      party.troopCount > input.maxTroops
    )
      return null;
    const ids = [...party.officerIds];
    if (
      ids.length === 0 ||
      new Set(ids).size !== ids.length ||
      party.composition.troopTypes.length === 0
    )
      return null;
    const officers = ids.map((id) => state.officers.find((officer) => officer.id === id));
    if (
      officers.some(
        (officer) =>
          !officer ||
          !officer.alive ||
          officer.factionId !== state.playerFactionId ||
          officer.location.kind !== 'city' ||
          officer.location.cityId !== input.sourceCityId,
      )
    )
      return null;
    const rostered = officers.reduce((sum, officer) => sum + (officer?.troops ?? 0), 0);
    if (rostered !== party.troopCount) return null;
    return structuredClone({ ...party, officerIds: ids });
  } catch {
    return null;
  }
}

function validRequisitionInput(
  state: V03GameState,
  input: RequisitionInput,
  codes: GovernanceOrderReasonCode[],
  reasons: string[],
) {
  if (state.phase !== 'planning') addReason(codes, reasons, 'order.invalid-phase');
  const source = state.cities.find((city) => city.id === input.sourceCityId);
  const target = state.cities.find((city) => city.id === input.targetCityId);
  if (!source || source.factionId !== state.playerFactionId)
    addReason(codes, reasons, 'order.source-unavailable');
  if (!target) addReason(codes, reasons, 'order.target-unavailable');
  else if (target.factionId !== state.playerFactionId)
    addReason(codes, reasons, 'order.target-not-friendly');
  if (input.sourceCityId === input.targetCityId) addReason(codes, reasons, 'order.same-city');
  if (
    !validAmount(input.requested.gold) ||
    !validAmount(input.requested.food) ||
    !validAmount(input.requested.troops) ||
    input.requested.gold + input.requested.food + input.requested.troops <= 0 ||
    (input.requestedByDay !== null &&
      (!Number.isSafeInteger(input.requestedByDay) || input.requestedByDay < state.absoluteDay))
  )
    addReason(codes, reasons, 'order.invalid-amount');
  return source && target && codes.length === 0;
}

/** estimateRequisition enforces a friendly receiver; campaign logistics use a private projection target. */
function estimateCampaignResources(
  state: V03GameState,
  sourceCityId: string,
  requested: V03JourneyCargo,
  routeDays: number,
) {
  const receiver = state.cities.find(
    (city) => city.id !== sourceCityId && city.factionId === state.playerFactionId,
  );
  const projectionId = receiver?.id ?? '__campaign-resource-projection__';
  const projectedState = receiver
    ? state
    : {
        ...state,
        cities: [
          ...state.cities,
          {
            ...state.cities.find((city) => city.id === sourceCityId)!,
            id: projectionId,
            name: 'Campaign resource projection',
            chinese: '出征资源估算',
            gold: 0,
            food: 0,
            garrisonTroops: 0,
          },
        ],
      };
  return estimateRequisition(projectedState, sourceCityId, projectionId, requested, routeDays);
}

export function previewRequisition(
  state: V03GameState,
  input: RequisitionInput,
  services: GovernanceOrderServices,
): RequisitionPreview {
  const requested = { ...input.requested };
  const codes: GovernanceOrderReasonCode[] = [];
  const reasons: string[] = [];
  const valid = validRequisitionInput(state, input, codes, reasons);
  if (!valid) {
    return {
      requested,
      executable: zeroCargo(),
      deficit: { ...requested },
      earliestDepartureDay: null,
      estimatedArrivalDay: null,
      ready: false,
      requiresPlayerChoice: true,
      route: null,
      party: null,
      reasonCodes: codes,
      reasons,
    };
  }
  const preliminaryRoute = routePlan(state, services, {
    sourceCityId: input.sourceCityId,
    targetCityId: input.targetCityId,
    departureDay: state.absoluteDay,
    troopCount: requested.troops,
    kind: 'requisition',
    composition: { troopTypes: [] },
  });
  if (!preliminaryRoute) addReason(codes, reasons, 'order.route-unavailable');
  if (!preliminaryRoute) {
    return {
      requested,
      executable: zeroCargo(),
      deficit: { ...requested },
      earliestDepartureDay: null,
      estimatedArrivalDay: null,
      ready: false,
      requiresPlayerChoice: true,
      route: null,
      party: null,
      reasonCodes: codes,
      reasons,
    };
  }
  const estimate = estimateRequisition(
    state,
    input.sourceCityId,
    input.targetCityId,
    requested,
    preliminaryRoute.estimatedDays,
  );
  const party =
    requested.troops > 0 && estimate.executable.troops > 0
      ? partyPlan(state, services, {
          sourceCityId: input.sourceCityId,
          maxTroops: estimate.executable.troops,
          kind: 'requisition',
        })
      : { officerIds: [], troopCount: 0, composition: { troopTypes: [] } as TravelComposition };
  const executable = { ...estimate.executable };
  if (requested.troops > 0 && !party) executable.troops = 0;
  else if (party && requested.troops > 0) executable.troops = party.troopCount;
  const deficit = {
    gold: requested.gold - executable.gold,
    food: requested.food - executable.food,
    troops: requested.troops - executable.troops,
  };
  if (requested.troops > 0 && !party) addReason(codes, reasons, 'order.party-unavailable');
  for (const detail of estimate.reasons) reasons.push(detail);
  if (
    deficit.troops > 0 &&
    estimate.executable.troops > 0 &&
    party &&
    party.troopCount < estimate.executable.troops
  )
    addReason(codes, reasons, 'order.party-unavailable');
  if (deficit.troops > 0 && estimate.executable.troops < requested.troops)
    addReason(codes, reasons, 'order.minimum-garrison');
  const earliestDepartureDay = estimate.earliestDepartureDay;
  const earliestRoute =
    earliestDepartureDay === null
      ? null
      : routePlan(state, services, {
          sourceCityId: input.sourceCityId,
          targetCityId: input.targetCityId,
          departureDay: earliestDepartureDay,
          troopCount: requested.troops,
          kind: 'requisition',
          composition: party?.composition ?? { troopTypes: [] },
        });
  if (earliestDepartureDay !== null && !earliestRoute)
    addReason(codes, reasons, 'order.route-unavailable');
  const estimatedArrivalDay =
    earliestDepartureDay === null || !earliestRoute
      ? null
      : earliestDepartureDay + earliestRoute.estimatedDays;
  if (
    input.requestedByDay !== null &&
    earliestDepartureDay !== null &&
    earliestDepartureDay > input.requestedByDay
  )
    addReason(codes, reasons, 'order.deadline-too-soon');
  const ready =
    deficit.gold === 0 &&
    deficit.food === 0 &&
    deficit.troops === 0 &&
    (input.requestedByDay === null || state.absoluteDay <= input.requestedByDay);
  if (!ready && codes.length === 0) addReason(codes, reasons, 'order.shortfall');
  return {
    requested,
    executable,
    deficit,
    earliestDepartureDay,
    estimatedArrivalDay,
    ready,
    requiresPlayerChoice: !ready,
    route: preliminaryRoute,
    party,
    reasonCodes: codes,
    reasons,
  };
}

function previewCampaign(
  state: V03GameState,
  input: CampaignDirectiveInput,
  services: GovernanceOrderServices,
): CampaignDirectivePreview {
  const codes: GovernanceOrderReasonCode[] = [];
  const reasons: string[] = [];
  const source = state.cities.find((city) => city.id === input.sourceCityId);
  const target = state.cities.find((city) => city.id === input.targetCityId);
  if (state.phase !== 'planning') addReason(codes, reasons, 'order.invalid-phase');
  if (!source || source.factionId !== state.playerFactionId)
    addReason(codes, reasons, 'order.source-unavailable');
  if (!target) addReason(codes, reasons, 'order.target-unavailable');
  else if (target.factionId === state.playerFactionId)
    addReason(codes, reasons, 'order.target-is-friendly');
  else if (
    target.factionId &&
    getV03AttackAllianceBlock(
      state.alliances,
      state.playerFactionId,
      target.factionId,
      state.monthIndex,
    )
  )
    addReason(codes, reasons, 'order.target-allied');
  else if (input.intent !== 'conquer' && state.absoluteDay < (target.plunderCooldownUntilDay ?? 0))
    addReason(codes, reasons, 'order.target-cooldown');
  if (input.sourceCityId === input.targetCityId) addReason(codes, reasons, 'order.same-city');
  if (
    !Number.isSafeInteger(input.requestedTroops) ||
    input.requestedTroops <= 0 ||
    (input.requestedByDay !== null &&
      (!Number.isSafeInteger(input.requestedByDay) || input.requestedByDay < state.absoluteDay))
  )
    addReason(codes, reasons, 'order.invalid-amount');
  if (!source || !target || codes.length > 0) {
    return {
      requestedTroops: input.requestedTroops,
      executableTroops: 0,
      deficitTroops: input.requestedTroops,
      requestedFood: 0,
      executableFood: 0,
      earliestDepartureDay: null,
      estimatedArrivalDay: null,
      ready: false,
      requiresPlayerChoice: true,
      route: null,
      party: null,
      reasonCodes: codes,
      reasons,
    };
  }
  const routeSeed = routePlan(state, services, {
    sourceCityId: input.sourceCityId,
    targetCityId: input.targetCityId,
    departureDay: state.absoluteDay,
    troopCount: input.requestedTroops,
    kind: 'campaign',
    composition: { troopTypes: [] },
  });
  if (!routeSeed) {
    addReason(codes, reasons, 'order.route-unavailable');
    return {
      requestedTroops: input.requestedTroops,
      executableTroops: 0,
      deficitTroops: input.requestedTroops,
      requestedFood: 0,
      executableFood: 0,
      earliestDepartureDay: null,
      estimatedArrivalDay: null,
      ready: false,
      requiresPlayerChoice: true,
      route: null,
      party: null,
      reasonCodes: codes,
      reasons,
    };
  }
  const troopEstimate = estimateCampaignResources(
    state,
    input.sourceCityId,
    { gold: 0, food: 0, troops: input.requestedTroops },
    routeSeed.estimatedDays,
  );
  let party = partyPlan(state, services, {
    sourceCityId: input.sourceCityId,
    maxTroops: troopEstimate.executable.troops,
    kind: 'campaign',
  });
  if (!party) addReason(codes, reasons, 'order.party-unavailable');
  let executableTroops = party?.troopCount ?? 0;
  if (executableTroops === 0) {
    return {
      requestedTroops: input.requestedTroops,
      executableTroops: 0,
      deficitTroops: input.requestedTroops,
      requestedFood: 0,
      executableFood: 0,
      earliestDepartureDay: null,
      estimatedArrivalDay: null,
      ready: false,
      requiresPlayerChoice: true,
      route: routeSeed,
      party: null,
      reasonCodes: codes,
      reasons,
    };
  }

  let route = routePlan(state, services, {
    sourceCityId: input.sourceCityId,
    targetCityId: input.targetCityId,
    departureDay: state.absoluteDay,
    troopCount: executableTroops,
    kind: 'campaign',
    composition: party!.composition,
  });
  if (!route) {
    addReason(codes, reasons, 'order.route-unavailable');
    return {
      requestedTroops: input.requestedTroops,
      executableTroops: 0,
      deficitTroops: input.requestedTroops,
      requestedFood: 0,
      executableFood: 0,
      earliestDepartureDay: null,
      estimatedArrivalDay: null,
      ready: false,
      requiresPlayerChoice: true,
      route: null,
      party: null,
      reasonCodes: codes,
      reasons,
    };
  }
  const returnDays = route.estimatedDays;
  const supplyFor = (troops: number) =>
    estimateCampaignSupply({
      troopCount: troops,
      outboundDays: route!.estimatedDays,
      battleDays: input.intent === 'raid' ? 10 : 30,
      returnDays,
    });
  let supply = supplyFor(executableTroops);
  let resourceEstimate = estimateCampaignResources(
    state,
    input.sourceCityId,
    { gold: 0, food: supply.totalFood, troops: executableTroops },
    route.estimatedDays,
  );
  // If provisions are the limiting factor, offer the largest executable force that can be fed now.
  if (resourceEstimate.executable.food < supply.totalFood) {
    let low = 0;
    let high = executableTroops;
    while (low < high) {
      const candidate = Math.ceil((low + high) / 2);
      const candidateFood = supplyFor(candidate).totalFood;
      if (candidateFood <= resourceEstimate.executable.food) low = candidate;
      else high = candidate - 1;
    }
    const foodSupportedParty =
      low > 0
        ? partyPlan(state, services, {
            sourceCityId: input.sourceCityId,
            maxTroops: low,
            kind: 'campaign',
          })
        : null;
    if (foodSupportedParty) {
      party = foodSupportedParty;
      executableTroops = foodSupportedParty.troopCount;
      route = routePlan(state, services, {
        sourceCityId: input.sourceCityId,
        targetCityId: input.targetCityId,
        departureDay: state.absoluteDay,
        troopCount: executableTroops,
        kind: 'campaign',
        composition: party.composition,
      });
      if (route) {
        supply = supplyFor(executableTroops);
        resourceEstimate = estimateCampaignResources(
          state,
          input.sourceCityId,
          { gold: 0, food: supply.totalFood, troops: executableTroops },
          route.estimatedDays,
        );
      }
    } else {
      executableTroops = 0;
      party = null;
    }
  }
  if (input.requestedTroops > troopEstimate.executable.troops)
    addReason(codes, reasons, 'order.minimum-garrison');
  const deficitTroops = input.requestedTroops - executableTroops;
  const requestedFood = supplyFor(input.requestedTroops).totalFood;
  const executableFood = resourceEstimate.executable.food;
  const earliestDepartureDay = resourceEstimate.earliestDepartureDay;
  const earliestRoute =
    earliestDepartureDay === null
      ? null
      : routePlan(state, services, {
          sourceCityId: input.sourceCityId,
          targetCityId: input.targetCityId,
          departureDay: earliestDepartureDay,
          troopCount: input.requestedTroops,
          kind: 'campaign',
          composition: party?.composition ?? { troopTypes: [] },
        });
  if (earliestDepartureDay !== null && !earliestRoute)
    addReason(codes, reasons, 'order.route-unavailable');
  const estimatedArrivalDay =
    earliestDepartureDay === null || !earliestRoute
      ? null
      : earliestDepartureDay + earliestRoute.estimatedDays;
  if (
    input.requestedByDay !== null &&
    earliestDepartureDay !== null &&
    earliestDepartureDay > input.requestedByDay
  )
    addReason(codes, reasons, 'order.deadline-too-soon');
  const ready =
    deficitTroops === 0 &&
    resourceEstimate.ready &&
    (input.requestedByDay === null || state.absoluteDay <= input.requestedByDay);
  if (!ready && codes.length === 0) addReason(codes, reasons, 'order.shortfall');
  return {
    requestedTroops: input.requestedTroops,
    executableTroops,
    deficitTroops,
    requestedFood,
    executableFood,
    earliestDepartureDay,
    estimatedArrivalDay,
    ready,
    requiresPlayerChoice: !ready,
    route,
    party,
    reasonCodes: codes,
    reasons,
  };
}

export function previewCampaignDirective(
  state: V03GameState,
  input: CampaignDirectiveInput,
  services: GovernanceOrderServices,
): CampaignDirectivePreview {
  return previewCampaign(state, input, services);
}

function validJourney(input: JourneyCreationInput, journey: V03Journey): boolean {
  return (
    journey.id === input.id &&
    journey.executionId === input.executionId &&
    journey.ownerFactionId === input.ownerFactionId &&
    journey.kind === input.kind &&
    journey.sourceCityId === input.sourceCityId &&
    journey.destinationCityId === input.targetCityId &&
    journey.departedAbsoluteDay === input.departureDay &&
    journey.expectedArrivalDay === input.arrivalDay &&
    journey.routeId === input.route.routeId &&
    journey.routeVersion === input.route.routeVersion &&
    journey.status === 'outbound' &&
    journey.manifest.troopCount === input.party.troopCount &&
    journey.manifest.carriedFood === input.carriedFood &&
    input.party.officerIds.every((id) => journey.manifest.officerIds.includes(id)) &&
    (input.kind !== 'campaign' || journey.intent === input.intent)
  );
}

function dispatch(
  state: V03GameState,
  input: JourneyCreationInput,
  services: GovernanceOrderServices,
): { state: V03GameState; journey: V03Journey } | null {
  const source = state.cities.find((city) => city.id === input.sourceCityId);
  if (!source || source.factionId !== input.ownerFactionId) return null;
  const party = input.party;
  if (party.troopCount > 0) {
    const officers = party.officerIds.map((id) => state.officers.find((entry) => entry.id === id));
    if (
      officers.some(
        (officer) =>
          !officer ||
          !officer.alive ||
          officer.factionId !== input.ownerFactionId ||
          officer.location.kind !== 'city' ||
          officer.location.cityId !== input.sourceCityId,
      )
    )
      return null;
    if (officers.reduce((sum, officer) => sum + (officer?.troops ?? 0), 0) !== party.troopCount)
      return null;
  }
  for (const resource of ['gold', 'food', 'troops'] as const) {
    if (!validAmount(input.cargo[resource])) return null;
  }
  if (
    source.gold < input.cargo.gold ||
    source.food < input.cargo.food ||
    source.garrisonTroops < input.cargo.troops
  )
    return null;
  let journey: V03Journey;
  try {
    journey = services.createJourney({
      ...structuredClone(input),
      route: structuredClone(input.route),
      party: structuredClone(input.party),
    });
  } catch {
    return null;
  }
  if (!journey || !validJourney(input, journey)) return null;
  const next = structuredClone(state);
  const nextSource = next.cities.find((city) => city.id === input.sourceCityId)!;
  nextSource.gold -= input.cargo.gold;
  nextSource.food -= input.cargo.food;
  nextSource.garrisonTroops -= input.cargo.troops;
  for (const officerId of input.party.officerIds) {
    const officer = next.officers.find((entry) => entry.id === officerId)!;
    officer.location = { kind: 'journey', journeyId: journey.id };
  }
  next.journeys.push(structuredClone(journey));
  return { state: next, journey };
}

function withRevision(state: V03GameState): V03GameState {
  state.revision += 1;
  state.nextId += 1;
  return state;
}

function requisitionId(state: V03GameState) {
  return `${state.scenarioId}:requisition:${state.nextId}`;
}
function directiveId(state: V03GameState) {
  return `${state.scenarioId}:directive:${state.nextId}`;
}
function journeyId(state: V03GameState) {
  return `${state.scenarioId}:journey:${state.nextId + 1}`;
}

function requisitionJourneyInput(
  state: V03GameState,
  order: V03Requisition,
  cargo: V03JourneyCargo,
  preview: RequisitionPreview,
  services: GovernanceOrderServices,
): JourneyCreationInput | null {
  if (!preview.route) return null;
  let party = preview.party;
  if (cargo.troops > 0) {
    party = partyPlan(state, services, {
      sourceCityId: order.sourceCityId,
      maxTroops: cargo.troops,
      kind: 'requisition',
    });
    if (!party || party.troopCount !== cargo.troops) return null;
  } else party = { officerIds: [], troopCount: 0, composition: { troopTypes: [] } };
  const route = routePlan(state, services, {
    sourceCityId: order.sourceCityId,
    targetCityId: order.targetCityId,
    departureDay: state.absoluteDay,
    troopCount: cargo.troops,
    kind: 'requisition',
    composition: party?.composition ?? { troopTypes: [] },
  });
  if (!route) return null;
  return {
    id: journeyId(state),
    executionId: order.id,
    ownerFactionId: order.factionId,
    kind: 'requisition',
    sourceCityId: order.sourceCityId,
    targetCityId: order.targetCityId,
    departureDay: state.absoluteDay,
    arrivalDay: state.absoluteDay + route.estimatedDays,
    route,
    party: party!,
    cargo,
    carriedFood: 0,
  };
}

function dispatchRequisition(
  state: V03GameState,
  order: V03Requisition,
  cargo: V03JourneyCargo,
  preview: RequisitionPreview,
  services: GovernanceOrderServices,
): GovernanceOrderResult<V03Requisition, RequisitionPreview> {
  const input = requisitionJourneyInput(state, order, cargo, preview, services);
  if (!input)
    return {
      ok: false,
      state,
      order,
      preview,
      reasonCode: 'order.party-unavailable',
      message: msg('order.party-unavailable'),
    };
  const result = dispatch(state, input, services);
  if (!result)
    return {
      ok: false,
      state,
      order,
      preview,
      reasonCode: 'order.dispatch-failed',
      message: msg('order.dispatch-failed'),
    };
  const next = result.state;
  const nextOrder = next.requisitions.find((entry) => entry.id === order.id)!;
  Object.assign(nextOrder, {
    proposed: { ...cargo },
    status: 'dispatched' as const,
    journeyId: result.journey.id,
    earliestDepartureDay: state.absoluteDay,
    estimatedArrivalDay: result.journey.expectedArrivalDay,
    governanceRevision: state.governanceRevision,
    message: 'The shipment has departed and its source cargo is debited.',
  });
  return { ok: true, state: withRevision(next), order: nextOrder, preview };
}

export function requestRequisition(
  state: V03GameState,
  input: RequisitionInput,
  services: GovernanceOrderServices,
): GovernanceOrderResult<V03Requisition, RequisitionPreview> {
  const preview = previewRequisition(state, input, services);
  if (
    preview.reasonCodes.some(
      (code) =>
        ![
          'order.shortfall',
          'order.minimum-garrison',
          'order.party-unavailable',
          'order.deadline-too-soon',
        ].includes(code),
    )
  ) {
    return {
      ok: false,
      state,
      preview,
      reasonCode: preview.reasonCodes[0],
      message: preview.reasons[0],
    };
  }
  const order: V03Requisition = {
    id: requisitionId(state),
    factionId: state.playerFactionId,
    sourceCityId: input.sourceCityId,
    targetCityId: input.targetCityId,
    requested: { ...preview.requested },
    proposed: { ...preview.executable },
    createdDay: state.absoluteDay,
    requestedByDay: input.requestedByDay,
    earliestDepartureDay: preview.earliestDepartureDay,
    estimatedArrivalDay: preview.estimatedArrivalDay,
    status: preview.ready ? 'accepted' : 'proposed',
    journeyId: null,
    governanceRevision: state.governanceRevision,
    message: preview.ready ? 'The full request is ready for dispatch.' : preview.reasons.join(' '),
  };
  const staged = structuredClone(state);
  staged.requisitions.push(order);
  staged.revision += 1;
  staged.nextId += 1;
  if (!preview.ready)
    return { ok: true, state: staged, order: staged.requisitions.at(-1), preview };
  const dispatched = dispatchRequisition(
    staged,
    structuredClone(staged.requisitions.at(-1)!),
    input.requested,
    preview,
    services,
  );
  return dispatched.ok ? dispatched : { ...dispatched, state };
}

function replaceRequisition(
  state: V03GameState,
  order: V03Requisition,
  preview: RequisitionPreview,
  status: V03OrderStatus,
  extraMessage?: string,
  reasonCode?: GovernanceOrderReasonCode,
): GovernanceOrderResult<V03Requisition, RequisitionPreview> {
  const next = structuredClone(state);
  const updated = next.requisitions.find((entry) => entry.id === order.id)!;
  updated.proposed = { ...preview.executable };
  updated.earliestDepartureDay = preview.earliestDepartureDay;
  updated.estimatedArrivalDay = preview.estimatedArrivalDay;
  updated.governanceRevision = state.governanceRevision;
  updated.status = status;
  updated.message =
    extraMessage ?? (preview.reasons.join(' ') || 'The full request is currently executable.');
  withRevision(next);
  return { ok: true, state: next, order: updated, preview, ...(reasonCode ? { reasonCode } : {}) };
}

export function answerRequisition(
  state: V03GameState,
  id: string,
  answer: 'accept' | 'reduce' | 'wait' | 'cancel',
  services: GovernanceOrderServices,
  reduced?: V03JourneyCargo,
): GovernanceOrderResult<V03Requisition, RequisitionPreview> {
  const order = state.requisitions.find((entry) => entry.id === id);
  if (!order)
    return { ok: false, state, reasonCode: 'order.not-found', message: msg('order.not-found') };
  if (state.phase !== 'planning')
    return {
      ok: false,
      state,
      order,
      reasonCode: 'order.invalid-phase',
      message: msg('order.invalid-phase'),
    };
  if (order.journeyId !== null || order.status === 'dispatched' || order.status === 'delivered')
    return {
      ok: true,
      state,
      order,
      reasonCode: 'order.already-dispatched',
      message: msg('order.already-dispatched'),
    };
  if (['cancelled', 'rejected', 'failed'].includes(order.status)) {
    return answer === 'cancel'
      ? {
          ok: true,
          state,
          order,
          reasonCode: 'order.already-closed',
          message: msg('order.already-closed'),
        }
      : {
          ok: false,
          state,
          order,
          reasonCode: 'order.already-closed',
          message: msg('order.already-closed'),
        };
  }
  const input: RequisitionInput = {
    sourceCityId: order.sourceCityId,
    targetCityId: order.targetCityId,
    requested: order.requested,
    requestedByDay: order.requestedByDay,
  };
  const preview = previewRequisition(state, input, services);
  if (answer === 'cancel') {
    const next = structuredClone(state);
    const updated = next.requisitions.find((entry) => entry.id === id)!;
    updated.status = 'cancelled';
    updated.message = 'The requisition was cancelled before dispatch.';
    return { ok: true, state: withRevision(next), order: updated, preview };
  }
  if (answer === 'wait') return replaceRequisition(state, order, preview, 'waiting');
  if (order.governanceRevision !== state.governanceRevision) {
    return replaceRequisition(
      state,
      order,
      preview,
      'proposed',
      msg('order.stale-proposal'),
      'order.stale-proposal',
    );
  }
  if (answer === 'accept') {
    if (!preview.ready)
      return replaceRequisition(
        state,
        order,
        preview,
        'proposed',
        preview.reasons.join(' ') || msg('order.shortfall'),
      );
    return dispatchRequisition(state, order, order.requested, preview, services);
  }
  if (
    answer !== 'reduce' ||
    !reduced ||
    !validAmount(reduced.gold) ||
    !validAmount(reduced.food) ||
    !validAmount(reduced.troops) ||
    reduced.gold + reduced.food + reduced.troops <= 0 ||
    reduced.gold > preview.executable.gold ||
    reduced.food > preview.executable.food ||
    reduced.troops > preview.executable.troops
  )
    return {
      ok: false,
      state,
      order,
      preview,
      reasonCode: 'order.invalid-reduction',
      message: msg('order.invalid-reduction'),
    };
  return dispatchRequisition(state, order, reduced, preview, services);
}

function directiveJourneyInput(
  state: V03GameState,
  order: V03CampaignDirective,
  troops: number,
  services: GovernanceOrderServices,
): JourneyCreationInput | null {
  const party = partyPlan(state, services, {
    sourceCityId: order.sourceCityId,
    maxTroops: troops,
    kind: 'campaign',
  });
  if (!party || party.troopCount !== troops) return null;
  const route = routePlan(state, services, {
    sourceCityId: order.sourceCityId,
    targetCityId: order.targetCityId,
    departureDay: state.absoluteDay,
    troopCount: troops,
    kind: 'campaign',
    composition: party.composition,
  });
  if (!route) return null;
  const supply = estimateCampaignSupply({
    troopCount: troops,
    outboundDays: route.estimatedDays,
    battleDays: order.intent === 'raid' ? 10 : 30,
    returnDays: route.estimatedDays,
  });
  return {
    id: journeyId(state),
    executionId: order.id,
    ownerFactionId: order.factionId,
    kind: 'campaign',
    intent: order.intent,
    sourceCityId: order.sourceCityId,
    targetCityId: order.targetCityId,
    departureDay: state.absoluteDay,
    arrivalDay: state.absoluteDay + route.estimatedDays,
    route,
    party,
    cargo: { gold: 0, food: 0, troops },
    carriedFood: supply.totalFood,
  };
}

function dispatchDirective(
  state: V03GameState,
  order: V03CampaignDirective,
  troops: number,
  preview: CampaignDirectivePreview,
  services: GovernanceOrderServices,
): GovernanceOrderResult<V03CampaignDirective, CampaignDirectivePreview> {
  const input = directiveJourneyInput(state, order, troops, services);
  if (!input)
    return {
      ok: false,
      state,
      order,
      preview,
      reasonCode: 'order.party-unavailable',
      message: msg('order.party-unavailable'),
    };
  const source = state.cities.find((city) => city.id === order.sourceCityId);
  if (!source || source.food < input.carriedFood || source.garrisonTroops < troops)
    return {
      ok: false,
      state,
      order,
      preview,
      reasonCode: 'order.dispatch-failed',
      message: msg('order.dispatch-failed'),
    };
  const result = dispatch(state, input, services);
  if (!result)
    return {
      ok: false,
      state,
      order,
      preview,
      reasonCode: 'order.dispatch-failed',
      message: msg('order.dispatch-failed'),
    };
  const next = result.state;
  const nextSource = next.cities.find((city) => city.id === order.sourceCityId)!;
  nextSource.food -= input.carriedFood;
  const nextOrder = next.directives.find((entry) => entry.id === order.id)!;
  nextOrder.proposedTroops = troops;
  nextOrder.status = 'dispatched';
  nextOrder.journeyId = result.journey.id;
  nextOrder.earliestDepartureDay = state.absoluteDay;
  nextOrder.estimatedArrivalDay = result.journey.expectedArrivalDay;
  nextOrder.governanceRevision = state.governanceRevision;
  nextOrder.message = 'The campaign force and its provisions have departed.';
  return { ok: true, state: withRevision(next), order: nextOrder, preview };
}

export function requestCampaignDirective(
  state: V03GameState,
  input: CampaignDirectiveInput,
  services: GovernanceOrderServices,
): GovernanceOrderResult<V03CampaignDirective, CampaignDirectivePreview> {
  const existing = state.directives.find(
    (directive) =>
      directive.sourceCityId === input.sourceCityId &&
      ACTIVE_DIRECTIVE_STATUSES.includes(directive.status),
  );
  if (existing)
    return {
      ok: false,
      state,
      order: existing,
      reasonCode: 'order.active-directive',
      message: msg('order.active-directive'),
    };
  const preview = previewCampaign(state, input, services);
  if (
    preview.reasonCodes.some(
      (code) =>
        ![
          'order.shortfall',
          'order.minimum-garrison',
          'order.party-unavailable',
          'order.deadline-too-soon',
        ].includes(code),
    )
  ) {
    return {
      ok: false,
      state,
      preview,
      reasonCode: preview.reasonCodes[0],
      message: preview.reasons[0],
    };
  }
  const order: V03CampaignDirective = {
    id: directiveId(state),
    factionId: state.playerFactionId,
    sourceCityId: input.sourceCityId,
    targetCityId: input.targetCityId,
    intent: input.intent,
    requestedTroops: input.requestedTroops,
    proposedTroops: preview.executableTroops,
    requestedByDay: input.requestedByDay,
    earliestDepartureDay: preview.earliestDepartureDay,
    estimatedArrivalDay: preview.estimatedArrivalDay,
    status: preview.ready ? 'accepted' : 'proposed',
    journeyId: null,
    governanceRevision: state.governanceRevision,
    message: preview.ready
      ? 'The requested campaign force is ready for dispatch.'
      : preview.reasons.join(' '),
  };
  const staged = structuredClone(state);
  staged.directives.push(order);
  staged.revision += 1;
  staged.nextId += 1;
  if (!preview.ready) return { ok: true, state: staged, order: staged.directives.at(-1), preview };
  const dispatched = dispatchDirective(
    staged,
    structuredClone(staged.directives.at(-1)!),
    input.requestedTroops,
    preview,
    services,
  );
  return dispatched.ok ? dispatched : { ...dispatched, state };
}

function replaceDirective(
  state: V03GameState,
  order: V03CampaignDirective,
  preview: CampaignDirectivePreview,
  status: V03OrderStatus,
  extraMessage?: string,
  reasonCode?: GovernanceOrderReasonCode,
): GovernanceOrderResult<V03CampaignDirective, CampaignDirectivePreview> {
  const next = structuredClone(state);
  const updated = next.directives.find((entry) => entry.id === order.id)!;
  updated.proposedTroops = preview.executableTroops;
  updated.earliestDepartureDay = preview.earliestDepartureDay;
  updated.estimatedArrivalDay = preview.estimatedArrivalDay;
  updated.governanceRevision = state.governanceRevision;
  updated.status = status;
  updated.message =
    extraMessage ?? (preview.reasons.join(' ') || 'The requested force is currently executable.');
  withRevision(next);
  return { ok: true, state: next, order: updated, preview, ...(reasonCode ? { reasonCode } : {}) };
}

export function answerCampaignDirective(
  state: V03GameState,
  id: string,
  answer: 'accept' | 'reduce' | 'wait' | 'cancel',
  services: GovernanceOrderServices,
  reducedTroops?: number,
): GovernanceOrderResult<V03CampaignDirective, CampaignDirectivePreview> {
  const order = state.directives.find((entry) => entry.id === id);
  if (!order)
    return { ok: false, state, reasonCode: 'order.not-found', message: msg('order.not-found') };
  if (state.phase !== 'planning')
    return {
      ok: false,
      state,
      order,
      reasonCode: 'order.invalid-phase',
      message: msg('order.invalid-phase'),
    };
  if (order.journeyId !== null || order.status === 'dispatched' || order.status === 'delivered')
    return {
      ok: true,
      state,
      order,
      reasonCode: 'order.already-dispatched',
      message: msg('order.already-dispatched'),
    };
  if (['cancelled', 'rejected', 'failed'].includes(order.status)) {
    return answer === 'cancel'
      ? {
          ok: true,
          state,
          order,
          reasonCode: 'order.already-closed',
          message: msg('order.already-closed'),
        }
      : {
          ok: false,
          state,
          order,
          reasonCode: 'order.already-closed',
          message: msg('order.already-closed'),
        };
  }
  const input: CampaignDirectiveInput = {
    sourceCityId: order.sourceCityId,
    targetCityId: order.targetCityId,
    intent: order.intent,
    requestedTroops: order.requestedTroops,
    requestedByDay: order.requestedByDay,
  };
  const preview = previewCampaign(state, input, services);
  if (answer === 'cancel') {
    const next = structuredClone(state);
    const updated = next.directives.find((entry) => entry.id === id)!;
    updated.status = 'cancelled';
    updated.message = 'The campaign directive was cancelled before dispatch.';
    return { ok: true, state: withRevision(next), order: updated, preview };
  }
  if (answer === 'wait') return replaceDirective(state, order, preview, 'waiting');
  if (order.governanceRevision !== state.governanceRevision)
    return replaceDirective(
      state,
      order,
      preview,
      'proposed',
      msg('order.stale-proposal'),
      'order.stale-proposal',
    );
  if (answer === 'accept') {
    if (!preview.ready)
      return replaceDirective(
        state,
        order,
        preview,
        'proposed',
        preview.reasons.join(' ') || msg('order.shortfall'),
      );
    return dispatchDirective(state, order, order.requestedTroops, preview, services);
  }
  if (
    answer !== 'reduce' ||
    !Number.isSafeInteger(reducedTroops) ||
    reducedTroops! <= 0 ||
    reducedTroops! > preview.executableTroops
  )
    return {
      ok: false,
      state,
      order,
      preview,
      reasonCode: 'order.invalid-reduction',
      message: msg('order.invalid-reduction'),
    };
  const reducedPreview = previewCampaign(
    state,
    { ...input, requestedTroops: reducedTroops! },
    services,
  );
  if (!reducedPreview.ready)
    return replaceDirective(
      state,
      order,
      reducedPreview,
      'proposed',
      reducedPreview.reasons.join(' ') || msg('order.shortfall'),
    );
  return dispatchDirective(state, order, reducedTroops!, reducedPreview, services);
}

export function refreshWaitingRequisitions(
  state: V03GameState,
  services: GovernanceOrderServices,
): V03GameState {
  const next = structuredClone(state);
  let changed = false;
  for (const order of next.requisitions.filter((entry) => entry.status === 'waiting')) {
    const preview = previewRequisition(
      next,
      {
        sourceCityId: order.sourceCityId,
        targetCityId: order.targetCityId,
        requested: order.requested,
        requestedByDay: order.requestedByDay,
      },
      services,
    );
    const status: V03OrderStatus = preview.ready ? 'proposed' : 'waiting';
    order.proposed = { ...preview.executable };
    order.earliestDepartureDay = preview.earliestDepartureDay;
    order.estimatedArrivalDay = preview.estimatedArrivalDay;
    order.governanceRevision = next.governanceRevision;
    order.status = status;
    order.message =
      preview.reasons.join(' ') || 'The full request is currently executable; confirm to dispatch.';
    changed = true;
  }
  if (changed) withRevision(next);
  return changed ? next : state;
}

export function refreshWaitingCampaignDirectives(
  state: V03GameState,
  services: GovernanceOrderServices,
): V03GameState {
  const next = structuredClone(state);
  let changed = false;
  for (const order of next.directives.filter((entry) => entry.status === 'waiting')) {
    const preview = previewCampaign(
      next,
      {
        sourceCityId: order.sourceCityId,
        targetCityId: order.targetCityId,
        intent: order.intent,
        requestedTroops: order.requestedTroops,
        requestedByDay: order.requestedByDay,
      },
      services,
    );
    order.proposedTroops = preview.executableTroops;
    order.earliestDepartureDay = preview.earliestDepartureDay;
    order.estimatedArrivalDay = preview.estimatedArrivalDay;
    order.governanceRevision = next.governanceRevision;
    order.status = preview.ready ? 'proposed' : 'waiting';
    order.message =
      preview.reasons.join(' ') ||
      'The requested force is currently executable; confirm to dispatch.';
    changed = true;
  }
  if (changed) withRevision(next);
  return changed ? next : state;
}

/** Refresh both waiting-order families after a day/month or governance change. */
export function refreshWaitingOrders(
  state: V03GameState,
  services: GovernanceOrderServices,
): V03GameState {
  const requisitions = refreshWaitingRequisitions(state, services);
  return refreshWaitingCampaignDirectives(requisitions, services);
}
