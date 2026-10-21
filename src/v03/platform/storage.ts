import { z } from 'zod';
import type { V03GameState } from '../types';
import { validateBattleMap } from '../battle/maps';

const safeInt = z.number().int().safe();
const nonnegative = safeInt.nonnegative();
const id = z.string().min(1).max(120);
const cargo = z.object({ gold: nonnegative, food: nonnegative, troops: nonnegative }).strict();
const troopType = z.enum(['infantry', 'cavalry', 'archer', 'naval', 'elite', 'guard']);
const intent = z.enum(['conquer', 'raid', 'sack']);
const battlePosition = z
  .object({
    x: safeInt.min(0).max(23),
    y: safeInt.min(0).max(19),
  })
  .strict();
const battleMap = z
  .object({
    mapId: id,
    templateVersion: z.literal('v0.3.1'),
    regionId: z.enum(['hanzhong', 'shouchun', 'xiapi', 'chengdu']),
    approachDirection: z.enum(['north', 'east', 'south', 'west']),
    seed: safeInt,
    width: z.literal(24),
    height: z.literal(20),
    terrain: z.array(z.enum(['plain', 'forest', 'hill', 'water', 'cliff'])).length(480),
    attackerDeployment: z.array(battlePosition).min(10).max(40),
    defenderDeployment: z.array(battlePosition).min(10).max(40),
    objectives: z
      .array(
        z
          .object({
            id,
            kind: z.literal('camp'),
            owner: z.enum(['attacker', 'defender']),
            position: battlePosition,
          })
          .strict(),
      )
      .length(2),
    landmarks: z
      .array(
        z
          .object({
            id,
            kind: z.enum(['river', 'ridge', 'road', 'irrigation']),
            label: z.string().max(200),
            positions: z.array(battlePosition).max(480),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();
const tacticalUnit = z
  .object({
    id,
    name: z.string().max(160),
    side: z.enum(['attacker', 'defender']),
    troopType,
    x: safeInt.min(0).max(23),
    y: safeInt.min(0).max(19),
    troops: nonnegative,
    initialTroops: nonnegative,
    force: z.number().finite().min(0).max(120),
    attackRange: safeInt.min(1).max(24),
    morale: nonnegative.max(100),
    moved: z.boolean(),
    acted: z.boolean(),
  })
  .strict();
const tacticalBattle = z
  .object({
    schemaVersion: z.literal(1),
    id,
    map: battleMap,
    playerSide: z.enum(['attacker', 'defender']),
    day: safeInt.min(1).max(1000),
    dayLimit: safeInt.min(1).max(1000),
    timeoutPolicy: z.enum(['survivor-count', 'field-control', 'defender-holds', 'draw']),
    units: z.array(tacticalUnit).min(2).max(20),
    log: z.array(z.string().max(1000)).max(250),
    outcome: z
      .object({
        winner: z.enum(['attacker', 'defender']).nullable(),
        reason: z.enum(['elimination', 'camp', 'dayLimit']),
      })
      .strict()
      .nullable(),
  })
  .strict();
const orderStatus = z.enum([
  'requested',
  'proposed',
  'waiting',
  'accepted',
  'reserved',
  'dispatched',
  'delivered',
  'rejected',
  'cancelled',
  'failed',
]);
const location = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('city'), cityId: id }).strict(),
  z.object({ kind: z.literal('journey'), journeyId: id }).strict(),
  z.object({ kind: z.literal('battle'), battleId: id }).strict(),
  z.object({ kind: z.literal('captured'), cityId: id.nullable() }).strict(),
]);

const faction = z
  .object({
    id,
    name: z.string().max(120),
    chinese: z.string().max(30),
    leaderOfficerId: id,
    color: z.string().max(32),
    capitalCityId: id,
    isPlayer: z.boolean(),
    eliminated: z.boolean(),
  })
  .strict();
const city = z
  .object({
    id,
    name: z.string().max(120),
    chinese: z.string().max(30),
    region: z.string().max(100),
    factionId: id.nullable(),
    population: nonnegative,
    farming: nonnegative,
    commerce: nonnegative,
    loyalty: nonnegative,
    gold: nonnegative,
    food: nonnegative,
    reserve: nonnegative,
    garrisonTroops: nonnegative,
    governorId: id.nullable(),
    pendingAppointment: z
      .object({ governorId: id.nullable(), effectiveDay: nonnegative, journeyId: id.optional() })
      .strict()
      .nullable(),
    governanceMode: z.enum(['ruler', 'governor', 'steward']),
    plunderCooldownUntilDay: nonnegative.optional(),
  })
  .strict();
const officer = z
  .object({
    id,
    name: z.string().max(120),
    chinese: z.string().max(30),
    factionId: id.nullable(),
    location,
    force: nonnegative,
    intellect: nonnegative,
    loyalty: nonnegative,
    age: nonnegative,
    troops: nonnegative,
    troopType,
    experience: nonnegative,
    level: safeInt.min(0).max(20),
    governorOfCityId: id.nullable(),
    alive: z.boolean(),
  })
  .strict();
const journey = z
  .object({
    id,
    kind: z.enum(['requisition', 'campaign', 'appointment', 'return']),
    intent: intent.optional(),
    executionId: id,
    ownerFactionId: id,
    sourceCityId: id,
    destinationCityId: id,
    routeId: id,
    routeVersion: z.string().min(1).max(40),
    routeSnapshot: z
      .array(
        z
          .object({
            terrain: z.enum(['plain', 'hill', 'mountain']),
            lengthKm: z.number().finite().positive(),
            baseSpeedKmPerDay: z.number().finite().positive(),
            speedMultiplier: z.number().finite().positive(),
            fixedDelayDays: z.number().finite().nonnegative(),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    roadKmNominal: z.number().finite().positive(),
    departedAbsoluteDay: nonnegative,
    expectedArrivalDay: nonnegative,
    elapsedDays: nonnegative,
    segmentProgressKm: z.array(z.number().finite().nonnegative()).max(100),
    segmentWaitDays: z.array(z.number().finite().nonnegative()).max(100),
    manifest: z
      .object({
        officerIds: z.array(id).max(100),
        troopCount: nonnegative,
        composition: z
          .object({
            troopTypes: z.array(troopType).max(100),
            soloOfficer: z.boolean().optional(),
            heavySupplyTrain: z.boolean().optional(),
          })
          .strict(),
        carriedFood: nonnegative,
        cargo: z.record(z.string().max(80), z.number().finite().nonnegative()),
      })
      .strict(),
    status: z.enum(['outbound', 'returning', 'waiting', 'delivered', 'cancelled']),
    deliveredCargo: z.record(z.string().max(80), z.number().finite().nonnegative()),
    consumedFood: nonnegative,
    supplyRemainderMicro: nonnegative,
    accumulatedFoodShortfall: z.number().finite().nonnegative(),
  })
  .strict();
const requisition = z
  .object({
    id,
    factionId: id,
    sourceCityId: id,
    targetCityId: id,
    requested: cargo,
    proposed: cargo,
    createdDay: nonnegative,
    requestedByDay: nonnegative.nullable(),
    earliestDepartureDay: nonnegative.nullable(),
    estimatedArrivalDay: nonnegative.nullable(),
    status: orderStatus,
    journeyId: id.nullable(),
    governanceRevision: nonnegative,
    message: z.string().max(2000),
  })
  .strict();
const directive = z
  .object({
    id,
    factionId: id,
    sourceCityId: id,
    targetCityId: id,
    intent,
    requestedTroops: nonnegative,
    proposedTroops: nonnegative,
    requestedByDay: nonnegative.nullable(),
    earliestDepartureDay: nonnegative.nullable(),
    estimatedArrivalDay: nonnegative.nullable(),
    status: orderStatus,
    journeyId: id.nullable(),
    governanceRevision: nonnegative,
    message: z.string().max(2000),
  })
  .strict();
const event = z
  .object({
    id,
    absoluteDay: nonnegative,
    kind: z.enum([
      'journeyArrival',
      'battleReady',
      'battleResolved',
      'requisitionResponse',
      'governorChanged',
      'monthBoundary',
      'factionEliminated',
      'victory',
    ]),
    title: z.string().max(200),
    detail: z.string().max(3000),
    entityId: id.nullable(),
    acknowledged: z.boolean(),
  })
  .strict();
const battle = z
  .object({
    id,
    mapId: id,
    mapVersion: z.string().min(1).max(40),
    seed: safeInt,
    absoluteDay: nonnegative,
    attackerFactionId: id,
    defenderFactionId: id.nullable(),
    attackerJourneyId: id,
    defenderJourneyId: id.nullable(),
    intent,
    active: z.boolean(),
    resolved: z.boolean(),
    outcome: z.enum(['attacker', 'defender', 'draw']).nullable(),
    loot: z.object({ gold: nonnegative, food: nonnegative }).strict().nullable(),
    battleData: tacticalBattle,
    attackerFood: nonnegative,
    defenderFood: nonnegative,
    attackerFoodRemainderMicro: nonnegative,
    defenderFoodRemainderMicro: nonnegative,
    foodShortfallDays: nonnegative,
    attackerFormationOfficerIds: z.record(id, z.array(id).max(100)),
    defenderFormationOfficerIds: z.record(id, z.array(id).max(100)),
  })
  .strict();
const dayResolution = z
  .object({
    processingAbsoluteDay: nonnegative,
    phase: z.enum(['battles', 'journeys', 'date', 'month-settlement']),
    battleIds: z.array(id).max(100),
    completedBattleIds: z.array(id).max(100),
    arrivals: z.array(id).max(1000),
    settledMonth: z
      .object({ year: safeInt, month: safeInt.min(1).max(12) })
      .strict()
      .optional(),
  })
  .strict()
  .nullable();

const stateSchema = z
  .object({
    version: z.literal(3),
    ruleset: z.literal('hegemony-3'),
    revision: nonnegative,
    scenarioId: id,
    seed: safeInt,
    playerFactionId: id,
    startYear: safeInt.min(100).max(3000),
    absoluteDay: nonnegative,
    monthIndex: nonnegative,
    rng: safeInt.min(0).max(0xffffffff),
    nextId: nonnegative,
    phase: z.enum(['planning', 'battle', 'finished']),
    playerCapitalCityId: id,
    factions: z.array(faction).min(2).max(20),
    cities: z.array(city).min(1).max(100),
    officers: z.array(officer).min(1).max(2000),
    journeys: z.array(journey).max(2000),
    requisitions: z.array(requisition).max(2000),
    directives: z.array(directive).max(2000),
    battles: z.array(battle).max(200),
    dayResolution,
    events: z.array(event).max(2000),
    log: z.array(z.string().max(3000)).max(1000),
    winnerFactionId: id.nullable(),
    governanceRevision: nonnegative,
  })
  .strict();

const envelopeSchema = z
  .object({
    format: z.literal('hegemony.save'),
    version: z.literal(3),
    ruleset: z.literal('hegemony-3'),
    state: stateSchema,
  })
  .strict();

export const V03_AUTOSAVE_KEY = 'hegemony-v0.3:autosave';
export const V03_SAVE_FORMAT = 'hegemony.save';

export function validateV03State(value: unknown): value is V03GameState {
  const parsed = stateSchema.safeParse(value);
  if (!parsed.success) return false;
  const state = parsed.data;
  const unique = (items: Array<{ id: string }>) =>
    new Set(items.map((item) => item.id)).size === items.length;
  if (!unique(state.factions) || !unique(state.cities) || !unique(state.officers)) return false;
  if (
    !unique(state.journeys) ||
    !unique(state.requisitions) ||
    !unique(state.directives) ||
    !unique(state.battles)
  )
    return false;
  if (!unique(state.events)) return false;
  if (!state.factions.some((entry) => entry.id === state.playerFactionId && entry.isPlayer))
    return false;
  if (
    !state.factions.some(
      (entry) =>
        entry.id === state.playerFactionId && entry.capitalCityId === state.playerCapitalCityId,
    )
  )
    return false;
  if (state.monthIndex !== Math.floor(state.absoluteDay / 30)) return false;

  const factionIds = new Set(state.factions.map((entry) => entry.id));
  const cityIds = new Set(state.cities.map((entry) => entry.id));
  const officerIds = new Set(state.officers.map((entry) => entry.id));
  const journeyIds = new Set(state.journeys.map((entry) => entry.id));
  const battleIds = new Set(state.battles.map((entry) => entry.id));
  for (const entry of state.factions) {
    if (!cityIds.has(entry.capitalCityId) || !officerIds.has(entry.leaderOfficerId)) return false;
  }
  for (const entry of state.cities) {
    if (entry.factionId !== null && !factionIds.has(entry.factionId)) return false;
    if (entry.governorId !== null && !officerIds.has(entry.governorId)) return false;
    if (
      entry.governanceMode === 'ruler' &&
      entry.id !== state.playerCapitalCityId &&
      entry.factionId === state.playerFactionId
    )
      return false;
    if (
      entry.pendingAppointment &&
      entry.pendingAppointment.journeyId &&
      !journeyIds.has(entry.pendingAppointment.journeyId)
    )
      return false;
  }
  for (const entry of state.officers) {
    if (entry.factionId !== null && !factionIds.has(entry.factionId)) return false;
    if (entry.governorOfCityId !== null && !cityIds.has(entry.governorOfCityId)) return false;
    if (entry.location.kind === 'city' && !cityIds.has(entry.location.cityId)) return false;
    if (entry.location.kind === 'journey' && !journeyIds.has(entry.location.journeyId))
      return false;
    if (entry.location.kind === 'battle' && !battleIds.has(entry.location.battleId)) return false;
    if (
      entry.location.kind === 'captured' &&
      entry.location.cityId !== null &&
      !cityIds.has(entry.location.cityId)
    )
      return false;
  }
  for (const entry of state.journeys) {
    if (
      !factionIds.has(entry.ownerFactionId) ||
      !cityIds.has(entry.sourceCityId) ||
      !cityIds.has(entry.destinationCityId)
    )
      return false;
    if (entry.expectedArrivalDay < entry.departedAbsoluteDay) return false;
    if (
      entry.segmentProgressKm.length !== entry.routeSnapshot.length ||
      entry.segmentWaitDays.length !== entry.routeSnapshot.length
    )
      return false;
    if (entry.manifest.officerIds.some((officerId) => !officerIds.has(officerId))) return false;
  }
  for (const entry of [...state.requisitions, ...state.directives]) {
    if (
      !factionIds.has(entry.factionId) ||
      !cityIds.has(entry.sourceCityId) ||
      !cityIds.has(entry.targetCityId)
    )
      return false;
    if (entry.journeyId !== null && !journeyIds.has(entry.journeyId)) return false;
  }
  for (const entry of state.battles) {
    if (
      !factionIds.has(entry.attackerFactionId) ||
      (entry.defenderFactionId !== null && !factionIds.has(entry.defenderFactionId))
    )
      return false;
    if (!journeyIds.has(entry.attackerJourneyId)) return false;
    if (entry.defenderJourneyId !== null && !journeyIds.has(entry.defenderJourneyId)) return false;
    if (entry.resolved !== (entry.outcome !== null)) return false;
    if (entry.active === entry.resolved) return false;
    const battle = entry.battleData;
    if (
      battle.id !== entry.id ||
      battle.map.mapId !== entry.mapId ||
      battle.map.templateVersion !== entry.mapVersion ||
      battle.map.seed !== entry.seed
    )
      return false;
    if (validateBattleMap(battle.map).length > 0) return false;
    if (
      battle.units.some(
        (unit) => battle.map.terrain[unit.y * battle.map.width + unit.x] === 'cliff',
      )
    )
      return false;
    if (new Set(battle.units.map((unit) => unit.id)).size !== battle.units.length) return false;
    if (
      new Set(battle.units.filter((unit) => unit.troops > 0).map((unit) => `${unit.x},${unit.y}`))
        .size !== battle.units.filter((unit) => unit.troops > 0).length
    )
      return false;
    if (battle.units.some((unit) => unit.troops > unit.initialTroops)) return false;
    if (entry.resolved !== (battle.outcome !== null)) return false;
    if (
      entry.outcome !== null &&
      (entry.outcome === 'draw'
        ? battle.outcome?.winner !== null
        : battle.outcome?.winner !== entry.outcome)
    )
      return false;
  }
  if (state.dayResolution) {
    if (state.dayResolution.phase === 'month-settlement') {
      if (
        state.dayResolution.processingAbsoluteDay + 1 !== state.absoluteDay ||
        !state.dayResolution.settledMonth
      )
        return false;
    } else if (state.dayResolution.processingAbsoluteDay !== state.absoluteDay) return false;
    if (state.dayResolution.battleIds.some((entry) => !battleIds.has(entry))) return false;
    if (state.dayResolution.arrivals.some((entry) => !journeyIds.has(entry))) return false;
    if (
      state.dayResolution.completedBattleIds.some(
        (entry) => !state.dayResolution!.battleIds.includes(entry),
      )
    )
      return false;
  }
  if (state.winnerFactionId !== null && !factionIds.has(state.winnerFactionId)) return false;
  return true;
}

export function encodeV03Save(state: V03GameState): string {
  if (!validateV03State(state))
    throw new Error('The v0.3 campaign state is not valid and cannot be saved.');
  return JSON.stringify({ format: V03_SAVE_FORMAT, version: 3, ruleset: 'hegemony-3', state });
}

export function decodeV03Save(payload: string | unknown): V03GameState {
  let decoded: unknown = payload;
  if (typeof payload === 'string') {
    try {
      decoded = JSON.parse(payload) as unknown;
    } catch {
      throw new Error('This save file is not valid JSON.');
    }
  }
  const parsed = envelopeSchema.safeParse(decoded);
  if (!parsed.success) {
    const candidate = decoded as { version?: unknown; ruleset?: unknown; format?: unknown } | null;
    if (candidate && typeof candidate === 'object' && candidate.version !== 3) {
      throw new Error(
        'This save belongs to an older version. Start a new v0.3 campaign; existing data was left unchanged.',
      );
    }
    throw new Error('This file is not a valid hegemony.save v0.3 campaign.');
  }
  if (!validateV03State(parsed.data.state))
    throw new Error('The save contains inconsistent campaign state.');
  return structuredClone(parsed.data.state);
}

export function saveV03Autosave(
  state: V03GameState,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  const payload = encodeV03Save(state);
  storage.setItem(V03_AUTOSAVE_KEY, payload);
}

export function loadV03Autosave(
  storage: Pick<Storage, 'getItem'> = localStorage,
): V03GameState | null {
  const payload = storage.getItem(V03_AUTOSAVE_KEY);
  return payload === null ? null : decodeV03Save(payload);
}
