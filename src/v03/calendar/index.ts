import type { RouteDefinition } from '../geography';

export const DAYS_PER_MONTH = 30;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
export const DAYS_PER_DECADE_STEP = 10;

export interface CalendarDate {
  year: number;
  month: number;
  dayOfMonth: number;
  absoluteDay: number;
}

/** absoluteDay 0 is the first morning of startYear/month 1/day 1. */
export function calendarDateAt(startYear: number, absoluteDay: number): CalendarDate {
  if (!Number.isInteger(startYear)) throw new Error('startYear must be an integer.');
  if (!Number.isSafeInteger(absoluteDay) || absoluteDay < 0) {
    throw new Error('absoluteDay must be a non-negative safe integer.');
  }
  const yearOffset = Math.floor(absoluteDay / DAYS_PER_YEAR);
  const dayWithinYear = absoluteDay % DAYS_PER_YEAR;
  return {
    year: startYear + yearOffset,
    month: Math.floor(dayWithinYear / DAYS_PER_MONTH) + 1,
    dayOfMonth: (dayWithinYear % DAYS_PER_MONTH) + 1,
    absoluteDay,
  };
}

export function absoluteDayOf(
  startYear: number,
  year: number,
  month: number,
  dayOfMonth: number,
): number {
  if (!Number.isInteger(year) || year < startYear) throw new Error('year is outside the calendar.');
  if (!Number.isInteger(month) || month < 1 || month > MONTHS_PER_YEAR) {
    throw new Error('month must be between 1 and 12.');
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > DAYS_PER_MONTH) {
    throw new Error('dayOfMonth must be between 1 and 30.');
  }
  return (year - startYear) * DAYS_PER_YEAR + (month - 1) * DAYS_PER_MONTH + dayOfMonth - 1;
}

export type AdvanceChoice = 1 | 10;

export interface ScheduledEvent {
  id: string;
  absoluteDay: number;
  kind: 'arrival' | 'battle' | 'decision' | 'deadline' | 'monthly-report' | 'other';
  pause: boolean;
  /** Hidden enemy events must not be surfaced by advance-until-event. */
  visibleToPlayer: boolean;
}

export interface AdvanceResult {
  fromDay: number;
  toDay: number;
  daysAdvanced: number;
  event: ScheduledEvent | null;
  hitStepLimit: boolean;
}

/**
 * Find the next player-visible event. The explicit cap keeps a missing event from
 * turning an advance command into an unbounded loop.
 */
export function advanceUntilEvent(
  currentDay: number,
  events: readonly ScheduledEvent[],
  maxDays = DAYS_PER_YEAR,
): AdvanceResult {
  if (!Number.isSafeInteger(currentDay) || currentDay < 0) throw new Error('Invalid current day.');
  if (!Number.isInteger(maxDays) || maxDays < 1) throw new Error('maxDays must be positive.');
  const nextEvent = events
    .filter((event) => event.visibleToPlayer && event.absoluteDay > currentDay)
    .sort((a, b) => a.absoluteDay - b.absoluteDay || a.id.localeCompare(b.id))[0];
  const limitDay = currentDay + maxDays;
  if (!nextEvent || nextEvent.absoluteDay > limitDay) {
    return {
      fromDay: currentDay,
      toDay: limitDay,
      daysAdvanced: maxDays,
      event: null,
      hitStepLimit: true,
    };
  }
  return {
    fromDay: currentDay,
    toDay: nextEvent.absoluteDay,
    daysAdvanced: nextEvent.absoluteDay - currentDay,
    event: nextEvent,
    hitStepLimit: false,
  };
}

export type GroundMovementClass = 'infantry' | 'archer' | 'cavalry' | 'guard' | 'elite' | 'naval';

export interface TravelComposition {
  troopTypes: readonly GroundMovementClass[];
  /** Only a standalone officer/courier receives the single-person profile. */
  soloOfficer?: boolean;
  heavySupplyTrain?: boolean;
}

export const BASELINE_SPEED_KM_PER_DAY: Readonly<Record<'plain' | 'hill' | 'mountain', number>> = {
  plain: 20,
  hill: 15,
  mountain: 10,
};

export const SPEED_UNCERTAINTY_KM_PER_DAY = {
  plain: { low: 15, high: 25 },
  hill: { low: 12, high: 20 },
  mountain: { low: 8, high: 15 },
} as const;

function movementMultiplier(
  terrain: 'plain' | 'hill' | 'mountain',
  composition: TravelComposition,
): number {
  const lightCavalryOnly =
    composition.soloOfficer === true ||
    (composition.troopTypes.length > 0 &&
      composition.troopTypes.every((type) => type === 'cavalry'));
  let multiplier = lightCavalryOnly
    ? terrain === 'plain'
      ? 1.5
      : terrain === 'hill'
        ? 1.2
        : 1
    : 1;
  if (composition.heavySupplyTrain) {
    const trainMultiplier = terrain === 'plain' ? 0.75 : terrain === 'hill' ? 0.8 : 0.8;
    multiplier = Math.min(multiplier, trainMultiplier);
  }
  return multiplier;
}

export interface SegmentTravelEstimate {
  terrain: 'plain' | 'hill' | 'mountain';
  lengthKm: number;
  baseSpeedKmPerDay: number;
  speedMultiplier: number;
  effectiveSpeedKmPerDay: number;
  workDays: number;
}

export interface TravelEstimate {
  routeId: string;
  direction: 'forward' | 'reverse';
  roadKmNominal: number;
  estimatedDays: number;
  estimatedArrivalDay: number;
  baselineDaysLow: number;
  baselineDaysNominal: number;
  baselineDaysHigh: number;
  segments: readonly SegmentTravelEstimate[];
  fixedDelayDays: number;
  reasonBreakdown: readonly string[];
}

export function estimateTravel(
  route: RouteDefinition,
  direction: 'forward' | 'reverse',
  departureAbsoluteDay: number,
  composition: TravelComposition,
): TravelEstimate {
  if (!Number.isSafeInteger(departureAbsoluteDay) || departureAbsoluteDay < 0) {
    throw new Error('departureAbsoluteDay must be a non-negative safe integer.');
  }
  const segmentEstimates = route.segments.map((segment) => {
    const baseSpeedKmPerDay = BASELINE_SPEED_KM_PER_DAY[segment.terrain];
    const speedMultiplier = movementMultiplier(segment.terrain, composition);
    const effectiveSpeedKmPerDay = baseSpeedKmPerDay * speedMultiplier;
    return {
      terrain: segment.terrain,
      lengthKm: segment.lengthKm,
      baseSpeedKmPerDay,
      speedMultiplier,
      effectiveSpeedKmPerDay,
      workDays: segment.lengthKm / effectiveSpeedKmPerDay,
    };
  });
  const fixedDelayDays = route.segments.reduce((sum, segment) => sum + segment.fixedDelayDays, 0);
  const workDays = segmentEstimates.reduce((sum, segment) => sum + segment.workDays, 0);
  const estimatedDays = Math.max(1, Math.ceil(workDays + fixedDelayDays - 1e-10));
  const reasonBreakdown = segmentEstimates.map(
    (segment) =>
      `${segment.lengthKm} km ${segment.terrain}: ${segment.effectiveSpeedKmPerDay} km/day, ${segment.workDays.toFixed(2)} days`,
  );
  if (fixedDelayDays > 0)
    reasonBreakdown.push(`Verified route waiting/handling: ${fixedDelayDays} days`);
  return {
    routeId: route.id,
    direction,
    roadKmNominal: route.roadKmNominal,
    estimatedDays,
    estimatedArrivalDay: departureAbsoluteDay + estimatedDays,
    baselineDaysLow: route.baselineDaysLow,
    baselineDaysNominal: route.baselineDaysNominal,
    baselineDaysHigh: route.baselineDaysHigh,
    segments: segmentEstimates,
    fixedDelayDays,
    reasonBreakdown,
  };
}

export interface JourneyManifest {
  officerIds: readonly string[];
  troopCount: number;
  composition: TravelComposition;
  carriedFood: number;
  cargo: Readonly<Record<string, number>>;
}

export type JourneyStatus = 'outbound' | 'returning' | 'waiting' | 'delivered' | 'cancelled';

export interface JourneySegmentSnapshot {
  terrain: 'plain' | 'hill' | 'mountain';
  lengthKm: number;
  baseSpeedKmPerDay: number;
  speedMultiplier: number;
  fixedDelayDays: number;
}

/** Entirely serializable snapshot; route edits cannot change an existing ETA. */
export interface Journey {
  id: string;
  executionId: string;
  ownerFactionId: string;
  sourceCityId: string;
  destinationCityId: string;
  routeId: string;
  routeVersion: string;
  routeSnapshot: readonly JourneySegmentSnapshot[];
  roadKmNominal: number;
  departedAbsoluteDay: number;
  expectedArrivalDay: number;
  elapsedDays: number;
  segmentProgressKm: number[];
  segmentWaitDays: number[];
  manifest: JourneyManifest;
  status: JourneyStatus;
  deliveredCargo: Record<string, number>;
  consumedFood: number;
  supplyRemainderMicro: number;
  accumulatedFoodShortfall: number;
}

export function createJourney(input: {
  id: string;
  executionId: string;
  ownerFactionId: string;
  route: RouteDefinition;
  sourceCityId: string;
  destinationCityId: string;
  departureAbsoluteDay: number;
  routeVersion?: string;
  manifest: JourneyManifest;
}): Journey {
  const { route, sourceCityId, destinationCityId } = input;
  const direction =
    sourceCityId === route.fromCityId && destinationCityId === route.toCityId
      ? 'forward'
      : sourceCityId === route.toCityId && destinationCityId === route.fromCityId
        ? 'reverse'
        : null;
  if (!direction) throw new Error('Journey endpoints do not match the selected route.');
  if (input.manifest.troopCount < 0 || !Number.isFinite(input.manifest.troopCount)) {
    throw new Error('Invalid troop count in journey manifest.');
  }
  if (input.manifest.carriedFood < 0 || !Number.isFinite(input.manifest.carriedFood)) {
    throw new Error('Invalid carried food in journey manifest.');
  }
  const estimate = estimateTravel(
    route,
    direction,
    input.departureAbsoluteDay,
    input.manifest.composition,
  );
  return {
    id: input.id,
    executionId: input.executionId,
    ownerFactionId: input.ownerFactionId,
    sourceCityId,
    destinationCityId,
    routeId: route.id,
    routeVersion: input.routeVersion ?? 'v0.3-geography-1',
    routeSnapshot: route.segments.map((segment) => ({
      terrain: segment.terrain,
      lengthKm: segment.lengthKm,
      baseSpeedKmPerDay: BASELINE_SPEED_KM_PER_DAY[segment.terrain],
      speedMultiplier: movementMultiplier(segment.terrain, input.manifest.composition),
      fixedDelayDays: segment.fixedDelayDays,
    })),
    roadKmNominal: route.roadKmNominal,
    departedAbsoluteDay: input.departureAbsoluteDay,
    expectedArrivalDay: estimate.estimatedArrivalDay,
    elapsedDays: 0,
    segmentProgressKm: route.segments.map(() => 0),
    segmentWaitDays: route.segments.map((segment) => segment.fixedDelayDays),
    manifest: structuredClone(input.manifest),
    status: 'outbound',
    deliveredCargo: {},
    consumedFood: 0,
    supplyRemainderMicro: 0,
    accumulatedFoodShortfall: 0,
  };
}

/** Start an actual return journey over the saved route, preserving its provenance. */
export function beginJourneyReturn(
  journey: Journey,
  departureAbsoluteDay: number,
  returnManifest: JourneyManifest = journey.manifest,
): Journey {
  if (journey.status !== 'delivered' && journey.status !== 'waiting') {
    throw new Error('A return trip can only begin after arrival or while held at the destination.');
  }
  if (!Number.isSafeInteger(departureAbsoluteDay) || departureAbsoluteDay < 0) {
    throw new Error('departureAbsoluteDay must be a non-negative safe integer.');
  }
  const routeSnapshot = [...journey.routeSnapshot].reverse();
  const workDays = routeSnapshot.reduce(
    (sum, segment) =>
      sum +
      segment.lengthKm / (segment.baseSpeedKmPerDay * segment.speedMultiplier) +
      segment.fixedDelayDays,
    0,
  );
  return {
    ...journey,
    sourceCityId: journey.destinationCityId,
    destinationCityId: journey.sourceCityId,
    departedAbsoluteDay: departureAbsoluteDay,
    expectedArrivalDay: departureAbsoluteDay + Math.max(1, Math.ceil(workDays - 1e-10)),
    elapsedDays: 0,
    routeSnapshot,
    segmentProgressKm: routeSnapshot.map(() => 0),
    segmentWaitDays: routeSnapshot.map((segment) => segment.fixedDelayDays),
    manifest: structuredClone(returnManifest),
    status: 'returning',
    deliveredCargo: {},
    consumedFood: 0,
    supplyRemainderMicro: 0,
    accumulatedFoodShortfall: 0,
  };
}

export interface JourneyStepResult {
  journey: Journey;
  arrived: boolean;
  distanceTravelledKm: number;
  foodShortfall: number;
}

/** Advances one full strategic day. The journey is immutable from the caller's view. */
export function advanceJourneyOneDay(journey: Journey): JourneyStepResult {
  if (journey.status !== 'outbound' && journey.status !== 'returning') {
    return {
      journey,
      arrived: journey.status === 'delivered',
      distanceTravelledKm: 0,
      foodShortfall: 0,
    };
  }
  const updated: Journey = {
    ...journey,
    segmentProgressKm: [...journey.segmentProgressKm],
    segmentWaitDays: [...journey.segmentWaitDays],
  };
  let remainingWorkDays = 1;
  let distanceTravelledKm = 0;
  for (let index = 0; index < updated.routeSnapshot.length && remainingWorkDays > 1e-10; index++) {
    const segment = updated.routeSnapshot[index]!;
    const waitRemaining = updated.segmentWaitDays[index]!;
    if (waitRemaining > 0) {
      const waited = Math.min(waitRemaining, remainingWorkDays);
      updated.segmentWaitDays[index] = waitRemaining - waited;
      remainingWorkDays -= waited;
      if (remainingWorkDays <= 1e-10) break;
    }
    const leftKm = segment.lengthKm - updated.segmentProgressKm[index]!;
    if (leftKm <= 1e-10) continue;
    const speed = segment.baseSpeedKmPerDay * segment.speedMultiplier;
    const movementKm = Math.min(leftKm, speed * remainingWorkDays);
    updated.segmentProgressKm[index] = updated.segmentProgressKm[index]! + movementKm;
    distanceTravelledKm += movementKm;
    remainingWorkDays -= movementKm / speed;
  }
  updated.elapsedDays += 1;
  const arrived = updated.routeSnapshot.every((segment, index) => {
    return (
      updated.segmentWaitDays[index]! <= 1e-10 &&
      updated.segmentProgressKm[index]! >= segment.lengthKm - 1e-8
    );
  });
  const dailyChargeMicro =
    updated.manifest.troopCount *
    Math.round(PILOT_LOGISTICS_RATES.travelFoodPerTroopDay * 1_000_000);
  const rationMicro = updated.supplyRemainderMicro + dailyChargeMicro;
  const rationWholeFood = Math.floor(rationMicro / 1_000_000);
  const paidFood = Math.min(updated.manifest.carriedFood, rationWholeFood);
  const foodShortfall = Math.max(0, (rationMicro - paidFood * 1_000_000) / 1_000_000);
  updated.manifest = { ...updated.manifest, carriedFood: updated.manifest.carriedFood - paidFood };
  updated.consumedFood += paidFood;
  updated.accumulatedFoodShortfall += foodShortfall;
  updated.supplyRemainderMicro = foodShortfall > 0 ? 0 : rationMicro - paidFood * 1_000_000;
  if (arrived) updated.status = 'delivered';
  return { journey: updated, arrived, distanceTravelledKm, foodShortfall };
}

/** Pilot rates are visible and adjustable; they are not historical claims. */
export const PILOT_LOGISTICS_RATES = {
  cityFoodPerTroopDay: 0.004,
  travelFoodPerTroopDay: 0.008,
  battleFoodPerTroopDay: 0.04,
  source: 'Prototype rates only; compare against paired v0.3 campaign simulations.',
} as const;

export interface SupplyEstimateInput {
  troopCount: number;
  outboundDays: number;
  battleDays: number;
  returnDays: number;
  rateOverrides?: Partial<Omit<typeof PILOT_LOGISTICS_RATES, 'source'>>;
}

export interface SupplyEstimate {
  outboundFood: number;
  battleReserveFood: number;
  returnFood: number;
  totalFood: number;
  reserveFood: number;
  rates: Omit<typeof PILOT_LOGISTICS_RATES, 'source'>;
}

export function estimateCampaignSupply(input: SupplyEstimateInput): SupplyEstimate {
  for (const [name, value] of Object.entries(input)) {
    if (
      name !== 'rateOverrides' &&
      (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    ) {
      throw new Error(`${name} must be a non-negative number.`);
    }
  }
  const rates = { ...PILOT_LOGISTICS_RATES, ...input.rateOverrides };
  const outboundFood = input.troopCount * input.outboundDays * rates.travelFoodPerTroopDay;
  const battleReserveFood = input.troopCount * input.battleDays * rates.battleFoodPerTroopDay;
  const returnFood = input.troopCount * input.returnDays * rates.travelFoodPerTroopDay;
  const totalFood = Math.ceil(outboundFood + battleReserveFood + returnFood);
  return {
    outboundFood,
    battleReserveFood,
    returnFood,
    totalFood,
    reserveFood: totalFood,
    rates: {
      cityFoodPerTroopDay: rates.cityFoodPerTroopDay,
      travelFoodPerTroopDay: rates.travelFoodPerTroopDay,
      battleFoodPerTroopDay: rates.battleFoodPerTroopDay,
    },
  };
}

/** Fixed-point daily food charge; carry `remainderMilli` between days to avoid rounding tax. */
export interface FoodChargeAccumulator {
  resourceFood: number;
  remainderMicro: number;
  totalChargedMicro: number;
}

export function chargeDailyFood(input: {
  account: FoodChargeAccumulator;
  troopCount: number;
  dailyRatePerTroop: number;
}): FoodChargeAccumulator {
  if (input.troopCount < 0 || input.dailyRatePerTroop < 0)
    throw new Error('Food charges must be non-negative.');
  // Quantize the configured rate once to micro-food; summing troop groups then
  // remains associative and does not charge an extra rounding unit on split.
  const rateMicro = Math.round(input.dailyRatePerTroop * 1_000_000);
  const chargeMicro = input.troopCount * rateMicro;
  const total = input.account.remainderMicro + chargeMicro;
  const wholeFood = Math.floor(total / 1_000_000);
  if (wholeFood > input.account.resourceFood)
    throw new Error('Insufficient food for this daily charge.');
  return {
    resourceFood: input.account.resourceFood - wholeFood,
    remainderMicro: total - wholeFood * 1_000_000,
    totalChargedMicro: input.account.totalChargedMicro + chargeMicro,
  };
}

export interface CargoBundle {
  gold: number;
  food: number;
  reserve: number;
}

export type CargoStage = 'reserved' | 'inTransit' | 'delivered' | 'released' | 'lost';

export interface CargoExecution {
  executionId: string;
  stage: CargoStage;
  original: CargoBundle;
  remaining: CargoBundle;
  delivered: CargoBundle;
  lost: CargoBundle;
}

export interface CargoLedger {
  available: CargoBundle;
  executions: Record<string, CargoExecution>;
}

const zeroCargo = (): CargoBundle => ({ gold: 0, food: 0, reserve: 0 });
const copyCargo = (cargo: CargoBundle): CargoBundle => ({ ...cargo });
const assertCargo = (cargo: CargoBundle): void => {
  for (const value of Object.values(cargo)) {
    if (!Number.isSafeInteger(value) || value < 0)
      throw new Error('Cargo amounts must be non-negative integers.');
  }
};

export function createCargoLedger(available: CargoBundle): CargoLedger {
  assertCargo(available);
  return { available: copyCargo(available), executions: {} };
}

/** Atomic, idempotency-keyed available → reserved transition. */
export function reserveCargo(
  ledger: CargoLedger,
  executionId: string,
  cargo: CargoBundle,
): CargoLedger {
  if (ledger.executions[executionId]) throw new Error(`Execution ${executionId} already exists.`);
  assertCargo(cargo);
  for (const key of Object.keys(cargo) as (keyof CargoBundle)[]) {
    if (cargo[key] > ledger.available[key]) throw new Error(`Insufficient ${key} to reserve.`);
  }
  const available = copyCargo(ledger.available);
  for (const key of Object.keys(cargo) as (keyof CargoBundle)[]) available[key] -= cargo[key];
  return {
    available,
    executions: {
      ...ledger.executions,
      [executionId]: {
        executionId,
        stage: 'reserved',
        original: copyCargo(cargo),
        remaining: copyCargo(cargo),
        delivered: zeroCargo(),
        lost: zeroCargo(),
      },
    },
  };
}

function transitionCargo(
  ledger: CargoLedger,
  executionId: string,
  from: CargoStage,
  to: CargoStage,
  field: 'remaining' | 'delivered' | 'lost',
): CargoLedger {
  const execution = ledger.executions[executionId];
  if (!execution || execution.stage !== from)
    throw new Error(`Execution ${executionId} cannot move from ${from}.`);
  return {
    ...ledger,
    executions: {
      ...ledger.executions,
      [executionId]: {
        ...execution,
        stage: to,
        remaining: to === 'inTransit' ? copyCargo(execution.remaining) : zeroCargo(),
        [field]: copyCargo(execution.remaining),
      },
    },
  };
}

export function dispatchCargo(ledger: CargoLedger, executionId: string): CargoLedger {
  return transitionCargo(ledger, executionId, 'reserved', 'inTransit', 'remaining');
}

export function deliverCargo(ledger: CargoLedger, executionId: string): CargoLedger {
  return transitionCargo(ledger, executionId, 'inTransit', 'delivered', 'delivered');
}

export function loseCargo(ledger: CargoLedger, executionId: string): CargoLedger {
  return transitionCargo(ledger, executionId, 'inTransit', 'lost', 'lost');
}

/** A pre-departure cancellation releases the reservation without recreating work. */
export function cancelCargoBeforeDeparture(ledger: CargoLedger, executionId: string): CargoLedger {
  const execution = ledger.executions[executionId];
  if (!execution || execution.stage !== 'reserved') {
    throw new Error(`Execution ${executionId} is no longer cancellable before departure.`);
  }
  const available = copyCargo(ledger.available);
  for (const key of Object.keys(execution.remaining) as (keyof CargoBundle)[]) {
    available[key] += execution.remaining[key];
  }
  return {
    available,
    executions: {
      ...ledger.executions,
      [executionId]: { ...execution, stage: 'released', remaining: zeroCargo() },
    },
  };
}

export * from './day-resolution';
