import { reconcileFactionObjectives } from '../ai/faction-objectives';
import { reconcileV03Rulers } from '../engine';
import { capturedRulerFaction } from '../campaign/prisoners';
import { validateOfficerRosterState } from '../campaign/officer-lifecycle';
import { OFFICER_ROSTER_VERSION } from '../content/officer-roster-setups';
import { z } from 'zod';
import type { V03GameState } from '../types';
import { PERSONNEL_RULES } from '../campaign/personnel';
import { validateBattleMap } from '../battle/maps';
import { canvasBattlefieldIds } from '../battle/battlefields/layout';

const safeInt = z.number().int().safe();
const nonnegative = safeInt.nonnegative();
const troopExperience = z.number().finite().min(0).max(1900);
const troopPool = z
  .object({ troops: nonnegative, troopExperience })
  .strict()
  .refine((pool) => pool.troops > 0 || pool.troopExperience === 0);
const reservePools = z
  .object({ infantry: troopPool, archer: troopPool, cavalry: troopPool })
  .strict();
const id = z.string().min(1).max(120);
// A byte cap bounds JSON parsing before Zod walks an imported file. Collection
// limits remain generous enough for long campaigns and are secondary guards.
export const V03_MAX_SAVE_BYTES = 16 * 1024 * 1024;
const HISTORY_RECORD_LIMIT = 25_000;
const BATTLE_HISTORY_LIMIT = 10_000;
const RECENT_EVENT_HISTORY = 1_500;
const RECENT_BATTLE_HISTORY = 100;
const RECENT_ORDER_HISTORY = 500;
const RECENT_JOURNEY_HISTORY = 500;
const RECENT_LOG_HISTORY = 1_000;
const cargo = z.object({ gold: nonnegative, food: nonnegative, troops: nonnegative }).strict();
const troopType = z.enum(['infantry', 'cavalry', 'archer']);
const intent = z.enum(['conquer', 'raid', 'sack']);
const battlefieldIds = new Set(canvasBattlefieldIds());
// Campaign battles are fought only on 48×32 canvas battlefields; earlier saves
// with 24×20 regional battles are not accepted.
const battlePosition = z
  .object({
    x: safeInt.min(0).max(47),
    y: safeInt.min(0).max(31),
  })
  .strict();
const battleMap = z
  .object({
    mapId: id,
    templateVersion: z.literal('v0.3.2'),
    regionId: z.enum(['hanzhong', 'shouchun', 'xiapi', 'chengdu']),
    battlefieldId: id.refine((value) => battlefieldIds.has(value)),
    approachDirection: z.enum(['north', 'east', 'south', 'west']),
    seed: safeInt,
    width: z.literal(48),
    height: z.literal(32),
    terrain: z.array(z.enum(['plain', 'forest', 'hill', 'water', 'cliff'])).length(1536),
    attackerDeployment: z.array(battlePosition).min(10).max(80),
    defenderDeployment: z.array(battlePosition).min(10).max(80),
    landmarks: z
      .array(
        z
          .object({
            id,
            kind: z.enum(['river', 'ridge', 'road', 'irrigation']),
            label: z.string().max(200),
            positions: z.array(battlePosition).max(1536),
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
    x: safeInt.min(0).max(47),
    y: safeInt.min(0).max(31),
    troops: nonnegative,
    wounded: nonnegative,
    casualtyRemainder: safeInt.min(0).max(99),
    initialTroops: nonnegative,
    troopExperience,
    initialTroopExperience: troopExperience,
    combatCasualtiesDealt: nonnegative,
    combatCasualtiesReceived: nonnegative,
    force: z.number().finite().min(0).max(120),
    intellect: z.number().finite().min(0).max(120),
    level: safeInt.min(0).max(5),
    isMilitia: z.boolean(),
    cunning: z.boolean(),
    fierce: z.boolean().optional(),
    attackRange: safeInt.min(1).max(24),
    morale: nonnegative.max(100),
    // Existing enum encodes a pending activation/hit; old v3 saves retain their effect.
    status: z.enum(['normal', 'confused', 'inspired']),
    moved: z.boolean(),
    acted: z.boolean(),
  })
  .strict();
const tacticalBattle = z
  .object({
    schemaVersion: z.literal(1),
    engaged: z.boolean(),
    retreatAllowed: z.object({ attacker: z.boolean(), defender: z.boolean() }).strict(),
    id,
    map: battleMap,
    playerSide: z.enum(['attacker', 'defender']),
    day: safeInt.min(1).max(1000),
    dayLimit: safeInt.min(1).max(1000),
    timeoutPolicy: z.enum(['survivor-count', 'field-control', 'defender-holds', 'draw']),
    tacticPoints: z
      .object({ attacker: safeInt.min(0).max(30), defender: safeInt.min(0).max(30) })
      .strict(),
    supplies: z.object({ attacker: nonnegative, defender: nonnegative }).strict(),
    rngState: safeInt.min(0).max(0xffffffff),
    weather: z.enum(['clear', 'rain', 'wind']),
    nextWeather: z.enum(['clear', 'rain', 'wind']),
    units: z.array(tacticalUnit).min(1).max(20),
    log: z.array(z.string().max(1000)).max(2000),
    logEntries: z
      .array(
        z
          .object({
            day: nonnegative,
            index: nonnegative,
            code: z.string().max(100),
            params: z.record(
              z.string().max(100),
              z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]),
            ),
          })
          .strict(),
      )
      .max(2000)
      .optional(),
    outcome: z
      .object({
        winner: z.enum(['attacker', 'defender']).nullable(),
        reason: z.enum(['elimination', 'dayLimit', 'retreat', 'rout']),
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
  z
    .object({
      kind: z.literal('captured'),
      cityId: id.nullable(),
      holderFactionId: id.optional(),
      journeyId: id.optional(),
    })
    .strict(),
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
const timedAlliance = z.object({ a: id, b: id, expiresMonthIndex: nonnegative }).strict();
const coalitionInvitation = z
  .object({
    id,
    eventId: z.literal('anti-dong-coalition'),
    targetFactionId: id,
    memberFactionIds: z.array(id).max(20),
    expiresMonthIndex: nonnegative,
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
    reservePools,
    garrisonTroops: nonnegative,
    garrisonExperience: troopExperience,
    governorId: id.nullable(),
    pendingAppointment: z
      .object({ governorId: id.nullable(), effectiveDay: nonnegative, journeyId: id.optional() })
      .strict()
      .nullable(),
    governanceMode: z.enum(['ruler', 'governor', 'steward']),
    plunderCooldownUntilDay: nonnegative.optional(),
    lostBy: z.object({ factionId: id, absoluteDay: nonnegative }).strict().optional(),
    workMonthIndex: nonnegative.optional(),
    workPeriodIndex: nonnegative.optional(),
    workPointsUsed: safeInt.min(0).max(3).optional(),
    autoSearchesThisMonth: safeInt.min(0).max(1).optional(),
    autoAssignmentsThisMonth: safeInt.min(0).max(1).optional(),
    troopServiceDaysThisMonth: safeInt.min(0).max(300_000_000).optional(),
    cavalryServiceDaysThisMonth: safeInt.min(0).max(300_000_000).optional(),
    prisonerServiceDaysThisMonth: safeInt.min(0).max(300_000_000).optional(),
    prisonerCavalryDaysThisMonth: safeInt.min(0).max(300_000_000).optional(),
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
    age: nonnegative.nullable(),
    troops: nonnegative,
    troopType,
    wounded: nonnegative,
    reorganizationDays: safeInt.min(0).max(PERSONNEL_RULES.reorganizationDays),
    equipment: z.literal('Fine arms').nullable().optional(),
    troopExperience,
    experience: nonnegative,
    level: safeInt.min(0).max(20),
    governorOfCityId: id.nullable(),
    alive: z.boolean(),
    prisonerActionMonth: nonnegative.optional(),
    capturedRulerFactionId: id.nullable().optional(),
  })
  .strict();
const journey = z
  .object({
    id,
    kind: z.enum(['requisition', 'campaign', 'appointment', 'transfer', 'return']),
    intent: intent.optional(),
    returnRequested: z.boolean().optional(),
    executionId: id,
    ownerFactionId: id,
    sourceCityId: id,
    destinationCityId: id,
    routeId: id,
    routeVersion: z.string().min(1).max(40),
    routeCityIds: z.array(id).min(2).max(100).optional(),
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
            cavalryTroops: nonnegative.optional(),
            woundedTroops: nonnegative.optional(),
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
    food: nonnegative.optional(),
    officerIds: z.array(id).max(100).optional(),
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
const sideReportSchema = z
  .object({
    startingTroops: nonnegative,
    survivingTroops: nonnegative,
    woundedTroops: nonnegative,
    returned: z.array(id).max(100),
    captured: z.array(id).max(100),
    killed: z.array(id).max(100),
    troopGrowth: z
      .array(
        z
          .object({
            officerId: id.nullable(),
            troopType,
            survivingTroops: nonnegative,
            woundedTroops: nonnegative,
            beforeExperience: troopExperience,
            afterExperience: troopExperience,
            participated: z.boolean(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
const event = z
  .object({
    id,
    absoluteDay: nonnegative,
    kind: z.enum([
      'journeyArrival',
      'battleReady',
      'succession',
      'prisonerAction',
      'battleResolved',
      'requisitionResponse',
      'governorChanged',
      'monthBoundary',
      'campaignEvent',
      'hegemonWarning',
      'hostileApproach',
      'diplomacy',
      'factionEliminated',
      'victory',
    ]),
    title: z.string().max(200),
    detail: z.string().max(3000),
    entityId: id.nullable(),
    acknowledged: z.boolean(),
    code: z.string().max(100).optional(),
    params: z
      .record(
        z.string().max(100),
        z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]),
      )
      .optional(),
    tier: z.enum(['critical', 'notice', 'chronicle']).optional(),
    battleOutcome: z
      .object({
        cityId: id,
        cityCaptured: z.boolean(),
        winner: z.enum(['attacker', 'defender', 'draw']),
        attacker: sideReportSchema,
        defender: sideReportSchema,
        loot: z.object({ gold: nonnegative, food: nonnegative }).strict(),
        returnArrivalDay: nonnegative.nullable(),
      })
      .strict()
      .optional(),
    monthlySummary: z
      .array(
        z
          .object({
            cityId: id,
            gold: safeInt,
            food: safeInt,
            troops: safeInt,
            governorActions: z.array(z.string().max(100)).max(10),
            shortage: z.boolean(),
          })
          .strict(),
      )
      .max(100)
      .optional(),
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
    playerDayComplete: z.boolean(),
    autoCommand: z.boolean().optional(),
    outcome: z.enum(['attacker', 'defender', 'draw']).nullable(),
    loot: z.object({ gold: nonnegative, food: nonnegative }).strict().nullable(),
    battleData: tacticalBattle,
    attackerFood: nonnegative,
    defenderFood: nonnegative,
    attackerFoodRemainderMicro: nonnegative,
    defenderFoodRemainderMicro: nonnegative,
    foodShortfallDays: nonnegative,
    lastRationDay: nonnegative.optional(),
    foodOverflow: nonnegative.optional(),
    populationOutflow: nonnegative.optional(),
    rearDispersed: nonnegative.optional(),
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
    daybreakJourneySignatures: z.record(id, z.string().max(10_000)),
    arrivals: z.array(id).max(1000),
    cityServiceAccounted: z.boolean().default(false),
    settledMonth: z
      .object({ year: safeInt, month: safeInt.min(1).max(12) })
      .strict()
      .optional(),
  })
  .strict()
  .nullable();

const troopSource = z
  .object({
    id,
    cityId: id,
    factionId: id.nullable(),
    sourceOfficerId: id.nullable(),
    autoReturn: z.boolean(),
    troopType,
    troops: nonnegative,
    wounded: nonnegative,
    troopExperience,
    reorganizationDays: safeInt.min(0).max(PERSONNEL_RULES.reorganizationDays),
  })
  .strict();

const personnelDay = z
  .object({
    absoluteDay: nonnegative,
    completed: z.boolean(),
    entries: z
      .array(
        z
          .object({
            recordId: z.string().min(1).max(160),
            cityId: id,
            factionId: id.nullable(),
            holderFactionId: id.nullable(),
            troopType,
            troops: nonnegative,
            wounded: nonnegative,
            reorganizationDays: safeInt.min(0).max(PERSONNEL_RULES.reorganizationDays),
            foodAvailable: z.boolean(),
          })
          .strict(),
      )
      .max(HISTORY_RECORD_LIMIT),
    rations: z
      .array(
        z
          .object({
            recordId: z.string().min(1).max(160),
            troops: nonnegative,
            wounded: nonnegative,
          })
          .strict(),
      )
      .max(HISTORY_RECORD_LIMIT),
  })
  .strict();

const objectiveReason = z.enum([
  'incoming-army',
  'active-defense',
  'ready',
  'force-shortfall',
  'food-shortfall',
  'no-opportunity',
  'campaign-active',
  'campaign-resolved',
  'ownership-changed',
  'alliance-changed',
  'commander-unavailable',
  'route-unavailable',
  'budget-impossible',
  'preparation-expired',
  'opportunity-changed',
]);
const factionObjective = z
  .object({
    factionId: id,
    mode: z.enum(['defend', 'recover', 'prepare-conquest', 'conquer']),
    sourceCityId: id.nullable(),
    targetCityId: id.nullable(),
    commanderOfficerId: id.nullable(),
    startedDay: nonnegative,
    reviewDay: nonnegative,
    forceTarget: nonnegative.max(9_999_999),
    foodTarget: nonnegative.max(9_999_999),
    forceDeficit: nonnegative.max(9_999_999),
    foodDeficit: nonnegative.max(9_999_999),
    reason: objectiveReason,
    cancellationReason: objectiveReason.nullable(),
    orderIds: z.array(id).max(2),
  })
  .strict();

const stateSchema = z
  .object({
    version: z.literal(3),
    ruleset: z.literal('hegemony-3'),
    personnelSchema: z.literal(1),
    officerRosterVersion: z.literal(OFFICER_ROSTER_VERSION),
    lastOfficerDebutYear: safeInt.min(100).max(3000),
    troopSources: z.array(troopSource).max(HISTORY_RECORD_LIMIT),
    personnelDay,
    revision: nonnegative,
    scenarioId: id,
    seed: safeInt,
    playerFactionId: id,
    startYear: safeInt.min(100).max(3000),
    absoluteDay: nonnegative,
    monthIndex: nonnegative,
    rng: safeInt.min(0).max(0xffffffff),
    alliances: z.array(timedAlliance).max(200),
    coalitionInvitations: z.array(coalitionInvitation).max(100),
    firedMonthlyEventIds: z.array(id).max(100),
    lastAllianceBreakMonthByFaction: z.record(id, nonnegative),
    lastAllianceProposalMonthByTarget: z.record(id, nonnegative).optional(),
    hegemon: z.object({ factionId: id.nullable(), months: safeInt.min(0).max(12) }).strict(),
    nextId: nonnegative,
    phase: z.enum(['planning', 'battle', 'finished']),
    playerCapitalCityId: id,
    factions: z.array(faction).min(2).max(20),
    factionObjectives: z.array(factionObjective).max(20).optional(),
    cities: z.array(city).min(1).max(100),
    officers: z.array(officer).min(1).max(2000),
    journeys: z.array(journey).max(HISTORY_RECORD_LIMIT),
    requisitions: z.array(requisition).max(HISTORY_RECORD_LIMIT),
    directives: z.array(directive).max(HISTORY_RECORD_LIMIT),
    battles: z.array(battle).max(BATTLE_HISTORY_LIMIT),
    dayResolution,
    events: z.array(event).max(HISTORY_RECORD_LIMIT),
    log: z.array(z.string().max(3000)).max(10_000),
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
  // Structural memory errors are rejected. Stale world references are safely
  // reconciled on load and before planning, without moving any resources.
  const objectives = state.factionObjectives ?? [];
  if (
    new Set(objectives.map((objective) => objective.factionId)).size !== objectives.length ||
    objectives.some(
      (objective) =>
        objective.startedDay > state.absoluteDay ||
        objective.reviewDay < objective.startedDay ||
        objective.reviewDay > objective.startedDay + 90 ||
        new Set(objective.orderIds).size !== objective.orderIds.length,
    )
  )
    return false;
  if (!validateOfficerRosterState(state)) return false;
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
  if (
    state.factions.filter((entry) => entry.isPlayer && entry.id === state.playerFactionId)
      .length !== 1 ||
    state.factions.filter((entry) => entry.isPlayer).length !== 1
  )
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
  const requisitionIds = new Set(state.requisitions.map((entry) => entry.id));
  const alliancePairs = new Set<string>();
  for (const alliance of state.alliances) {
    if (
      !factionIds.has(alliance.a) ||
      !factionIds.has(alliance.b) ||
      alliance.a === alliance.b ||
      alliance.expiresMonthIndex <= state.monthIndex ||
      alliance.expiresMonthIndex > state.monthIndex + 6
    )
      return false;
    const pair = [alliance.a, alliance.b].sort().join(':');
    if (alliancePairs.has(pair)) return false;
    alliancePairs.add(pair);
  }
  if (
    !isUnique(state.firedMonthlyEventIds) ||
    new Set(state.coalitionInvitations.map((invitation) => invitation.id)).size !==
      state.coalitionInvitations.length ||
    state.coalitionInvitations.some(
      (invitation) =>
        !factionIds.has(invitation.targetFactionId) ||
        invitation.expiresMonthIndex <= state.monthIndex ||
        invitation.expiresMonthIndex > state.monthIndex + 3 ||
        invitation.memberFactionIds.some((factionId) => !factionIds.has(factionId)) ||
        new Set(invitation.memberFactionIds).size !== invitation.memberFactionIds.length,
    ) ||
    Object.entries(state.lastAllianceBreakMonthByFaction).some(
      ([factionId, month]) => !factionIds.has(factionId) || month > state.monthIndex,
    ) ||
    Object.entries(state.lastAllianceProposalMonthByTarget ?? {}).some(
      ([factionId, month]) =>
        !factionIds.has(factionId) ||
        factionId === state.playerFactionId ||
        month > state.monthIndex,
    ) ||
    (state.hegemon.factionId === null) !== (state.hegemon.months === 0)
  )
    return false;
  const officerAssignments = new Map<string, string>();
  const activeJourneyOfficerIds = new Set<string>();
  const activeBattleOfficerIds = new Set<string>();
  for (const entry of state.factions) {
    if (!cityIds.has(entry.capitalCityId) || !officerIds.has(entry.leaderOfficerId)) return false;
    const capital = state.cities.find((cityEntry) => cityEntry.id === entry.capitalCityId);
    if (
      !entry.eliminated &&
      state.cities.some((city) => city.factionId === entry.id) &&
      capital?.factionId !== entry.id
    )
      return false;
    if (entry.eliminated && state.cities.some((cityEntry) => cityEntry.factionId === entry.id))
      return false;
  }
  if (state.factions.some((entry) => entry.eliminated && entry.id === state.playerFactionId)) {
    if (state.phase !== 'finished') return false;
  }
  for (const entry of state.cities) {
    if (
      entry.reserve !==
      Object.values(entry.reservePools).reduce((sum, pool) => sum + pool.troops, 0)
    )
      return false;
    if (entry.garrisonTroops === 0 && entry.garrisonExperience !== 0) return false;
    if (entry.factionId !== null && !factionIds.has(entry.factionId)) return false;
    if (
      entry.lostBy &&
      (!factionIds.has(entry.lostBy.factionId) || entry.lostBy.absoluteDay > state.absoluteDay)
    )
      return false;
    if (
      (entry.workMonthIndex === undefined) !== (entry.workPointsUsed === undefined) ||
      (entry.workMonthIndex !== undefined && entry.workMonthIndex > state.monthIndex)
    )
      return false;
    if (
      entry.workPeriodIndex !== undefined &&
      (entry.workMonthIndex === undefined ||
        entry.workPeriodIndex > Math.floor(state.absoluteDay / 10) ||
        Math.floor(entry.workPeriodIndex / 3) !== entry.workMonthIndex)
    )
      return false;
    // Talent limits remain monthly even when the ten-day work budget refreshes.
    if (
      ((entry.autoSearchesThisMonth ?? 0) > 0 || (entry.autoAssignmentsThisMonth ?? 0) > 0) &&
      entry.workMonthIndex === undefined
    )
      return false;
    // Work already spent in this month does not become invalid if officers
    // depart or are reassigned later in the same settlement period.
    if (entry.governorId !== null && !officerIds.has(entry.governorId)) return false;
    if (entry.governorId !== null) {
      const governor = state.officers.find((officerEntry) => officerEntry.id === entry.governorId);
      if (
        !governor ||
        governor.governorOfCityId !== entry.id ||
        governor.factionId !== entry.factionId ||
        !governor.alive
      )
        return false;
    }
    if (
      entry.governanceMode === 'ruler' &&
      entry.id !== state.playerCapitalCityId &&
      entry.factionId === state.playerFactionId
    )
      return false;
    if (
      entry.pendingAppointment &&
      ((entry.pendingAppointment.governorId !== null &&
        !officerIds.has(entry.pendingAppointment.governorId)) ||
        (entry.pendingAppointment.journeyId && !journeyIds.has(entry.pendingAppointment.journeyId)))
    )
      return false;
    if (entry.pendingAppointment?.journeyId) {
      const appointmentJourney = state.journeys.find(
        (journeyEntry) => journeyEntry.id === entry.pendingAppointment?.journeyId,
      );
      if (
        !appointmentJourney ||
        appointmentJourney.kind !== 'appointment' ||
        appointmentJourney.destinationCityId !== entry.id ||
        entry.pendingAppointment.governorId === null ||
        !appointmentJourney.manifest.officerIds.includes(entry.pendingAppointment.governorId) ||
        appointmentJourney.status === 'cancelled'
      )
        return false;
    }
  }
  for (const entry of state.officers) {
    if (entry.troops + entry.wounded > PERSONNEL_RULES.capacity) return false;
    if (
      entry.troops + entry.wounded === 0 &&
      (entry.troopExperience !== 0 || entry.reorganizationDays !== 0)
    )
      return false;
    if (entry.factionId !== null && !factionIds.has(entry.factionId)) return false;
    if (
      entry.capturedRulerFactionId != null &&
      (!factionIds.has(entry.capturedRulerFactionId) ||
        entry.capturedRulerFactionId !== entry.factionId ||
        !entry.alive ||
        entry.location.kind !== 'captured')
    )
      return false;
    if (entry.governorOfCityId !== null && !cityIds.has(entry.governorOfCityId)) return false;
    if (entry.location.kind === 'city' && !cityIds.has(entry.location.cityId)) return false;
    if (entry.location.kind === 'journey' && !journeyIds.has(entry.location.journeyId))
      return false;
    if (entry.location.kind === 'battle' && !battleIds.has(entry.location.battleId)) return false;
    if (entry.location.kind === 'captured') {
      const location = entry.location;
      if ((location.cityId !== null) === (location.journeyId !== undefined)) return false;
      const holdingCity = state.cities.find((cityEntry) => cityEntry.id === location.cityId);
      const escort = state.journeys.find((journeyEntry) => journeyEntry.id === location.journeyId);
      const holderId = holdingCity?.factionId ?? escort?.ownerFactionId;
      if (
        (!holdingCity && !escort) ||
        (location.holderFactionId && location.holderFactionId !== holderId)
      )
        return false;
      if (
        escort &&
        (!location.holderFactionId || !['outbound', 'returning', 'waiting'].includes(escort.status))
      )
        return false;
    }
    if (entry.governorOfCityId !== null) {
      const governedCity = state.cities.find(
        (cityEntry) => cityEntry.id === entry.governorOfCityId,
      );
      if (!governedCity || governedCity.governorId !== entry.id) return false;
    }
    if (entry.location.kind === 'journey') {
      const journeyId = entry.location.journeyId;
      const assignedJourney = state.journeys.find((journeyEntry) => journeyEntry.id === journeyId);
      if (
        !assignedJourney ||
        !['outbound', 'returning', 'waiting'].includes(assignedJourney.status) ||
        !assignedJourney.manifest.officerIds.includes(entry.id) ||
        activeJourneyOfficerIds.has(entry.id)
      )
        return false;
      activeJourneyOfficerIds.add(entry.id);
      officerAssignments.set(entry.id, assignedJourney.id);
    }
    if (entry.location.kind === 'battle') {
      const battleId = entry.location.battleId;
      const assignedBattle = state.battles.find((battleEntry) => battleEntry.id === battleId);
      if (
        !assignedBattle?.active ||
        !battleHasOfficer(assignedBattle, entry.id) ||
        activeBattleOfficerIds.has(entry.id)
      )
        return false;
      activeBattleOfficerIds.add(entry.id);
      officerAssignments.set(entry.id, assignedBattle.id);
    }
  }
  if (!unique(state.troopSources)) return false;
  for (const source of state.troopSources) {
    const sourceCity = state.cities.find((entry) => entry.id === source.cityId);
    if (!sourceCity || source.factionId !== sourceCity.factionId) return false;
    if (source.sourceOfficerId !== null && !officerIds.has(source.sourceOfficerId)) return false;
    if (source.autoReturn && source.sourceOfficerId === null) return false;
    if (
      source.troops + source.wounded === 0 ||
      !Number.isSafeInteger(source.troops + source.wounded)
    )
      return false;
    if (
      source.sourceOfficerId !== null &&
      state.officers.find((entry) => entry.id === source.sourceOfficerId)?.troopType !==
        source.troopType
    )
      return false;
  }
  const validPersonnelRecord = (recordId: string) => {
    if (recordId.startsWith('officer:')) return officerIds.has(recordId.slice(8));
    if (recordId.startsWith('source:'))
      return state.troopSources.some((source) => source.id === recordId.slice(7));
    return false;
  };
  if (
    state.personnelDay.absoluteDay > state.absoluteDay ||
    !isUnique(state.personnelDay.entries.map((entry) => entry.recordId)) ||
    !isUnique(state.personnelDay.rations.map((entry) => entry.recordId))
  )
    return false;
  for (const entry of state.personnelDay.entries) {
    if (!validPersonnelRecord(entry.recordId) || !cityIds.has(entry.cityId)) return false;
    if (entry.factionId !== null && !factionIds.has(entry.factionId)) return false;
    if (entry.holderFactionId !== null && !factionIds.has(entry.holderFactionId)) return false;
    if (!Number.isSafeInteger(entry.troops + entry.wounded)) return false;
  }
  const validRationRecord = (recordId: string) => {
    if (validPersonnelRecord(recordId)) return true;
    if (recordId.startsWith('militia:')) return cityIds.has(recordId.slice(8));
    if (!recordId.startsWith('reserve:')) return false;
    const parts = recordId.slice(8).split(':');
    return (
      parts.length === 2 &&
      cityIds.has(parts[0]!) &&
      ['infantry', 'archer', 'cavalry'].includes(parts[1]!)
    );
  };
  if (state.personnelDay.rations.some((entry) => !validRationRecord(entry.recordId))) return false;
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
    if ((entry.manifest.composition.cavalryTroops ?? 0) > entry.manifest.troopCount) return false;
    if ((entry.manifest.composition.woundedTroops ?? 0) > entry.manifest.troopCount) return false;
    if (!isUnique(entry.manifest.officerIds)) return false;
    if (entry.manifest.officerIds.some((officerId) => !officerIds.has(officerId))) return false;
    if (
      entry.routeCityIds &&
      (entry.routeCityIds.length < 2 ||
        entry.routeCityIds.some((cityId) => !cityIds.has(cityId)) ||
        entry.routeCityIds[0] !== entry.sourceCityId ||
        entry.routeCityIds.at(-1) !== entry.destinationCityId)
    )
      return false;
    if (
      entry.segmentProgressKm.some(
        (distance, index) => distance > entry.routeSnapshot[index]!.lengthKm + 1e-7,
      )
    )
      return false;
    const active = ['outbound', 'returning', 'waiting'].includes(entry.status);
    if (active) {
      const battleInProgress = state.battles.find(
        (battleEntry) =>
          battleEntry.active &&
          [battleEntry.attackerJourneyId, battleEntry.defenderJourneyId].includes(entry.id),
      );
      for (const officerId of entry.manifest.officerIds) {
        if (
          activeJourneyOfficerIds.has(officerId) &&
          officerAssignments.get(officerId) !== entry.id
        )
          return false;
        const officer = state.officers.find((officerEntry) => officerEntry.id === officerId);
        if (
          officer?.location.kind === 'journey' &&
          officer.location.journeyId === entry.id &&
          officerAssignments.get(officerId) !== entry.id
        )
          return false;
        if (
          battleInProgress
            ? officer?.location.kind !== 'battle' ||
              officer.location.battleId !== battleInProgress.id ||
              !battleHasOfficer(battleInProgress, officerId)
            : officer?.location.kind !== 'journey' || officer.location.journeyId !== entry.id
        )
          return false;
      }
      if (entry.kind === 'requisition') {
        const order = state.requisitions.find((orderEntry) => orderEntry.id === entry.executionId);
        if (!order || order.journeyId !== entry.id) return false;
      }
      if (entry.kind === 'campaign') {
        const order = state.directives.find((orderEntry) => orderEntry.id === entry.executionId);
        if (!order || order.journeyId !== entry.id) return false;
      }
    }
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
  for (const entry of state.requisitions) {
    if (entry.journeyId === null) continue;
    const assignedJourney = state.journeys.find(
      (journeyEntry) => journeyEntry.id === entry.journeyId,
    );
    if (
      !assignedJourney ||
      assignedJourney.executionId !== entry.id ||
      assignedJourney.kind !== 'requisition' ||
      assignedJourney.ownerFactionId !== entry.factionId ||
      assignedJourney.sourceCityId !== entry.sourceCityId ||
      assignedJourney.destinationCityId !== entry.targetCityId
    )
      return false;
  }
  for (const entry of state.directives) {
    if (entry.journeyId === null) continue;
    const assignedJourney = state.journeys.find(
      (journeyEntry) => journeyEntry.id === entry.journeyId,
    );
    if (
      !assignedJourney ||
      assignedJourney.executionId !== entry.id ||
      assignedJourney.kind !== 'campaign' ||
      assignedJourney.ownerFactionId !== entry.factionId ||
      assignedJourney.sourceCityId !== entry.sourceCityId ||
      assignedJourney.destinationCityId !== entry.targetCityId
    )
      return false;
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
    const attackerJourney = state.journeys.find(
      (journeyEntry) => journeyEntry.id === entry.attackerJourneyId,
    );
    if (
      !attackerJourney ||
      attackerJourney.kind !== 'campaign' ||
      attackerJourney.ownerFactionId !== entry.attackerFactionId ||
      !cityIds.has(attackerJourney.destinationCityId)
    )
      return false;
    if (entry.active && state.phase !== 'battle') return false;
    if (entry.active === entry.resolved) return false;
    const battle = entry.battleData;
    if (
      battle.id !== entry.id ||
      battle.map.mapId !== entry.mapId ||
      battle.map.templateVersion !== entry.mapVersion ||
      battle.map.seed !== entry.seed ||
      battle.supplies.attacker !== entry.attackerFood ||
      battle.supplies.defender !== entry.defenderFood
    )
      return false;
    if (validateBattleMap(battle.map).length > 0) return false;
    if (
      battle.units.some(
        (unit) =>
          unit.x >= battle.map.width ||
          unit.y >= battle.map.height ||
          battle.map.terrain[unit.y * battle.map.width + unit.x] === 'cliff',
      )
    )
      return false;
    if (new Set(battle.units.map((unit) => unit.id)).size !== battle.units.length) return false;
    const sideOfficerIds = [
      ...Object.values(entry.attackerFormationOfficerIds).flat(),
      ...Object.values(entry.defenderFormationOfficerIds).flat(),
    ];
    if (
      new Set(sideOfficerIds).size !== sideOfficerIds.length ||
      sideOfficerIds.some((officerId) => !officerIds.has(officerId))
    )
      return false;
    for (const [unitId, ids] of Object.entries(entry.attackerFormationOfficerIds)) {
      if (!battle.units.some((unit) => unit.id === unitId && unit.side === 'attacker'))
        return false;
      if (entry.active && ids.some((officerId) => officerAssignments.get(officerId) !== entry.id))
        return false;
    }
    for (const [unitId, ids] of Object.entries(entry.defenderFormationOfficerIds)) {
      if (!battle.units.some((unit) => unit.id === unitId && unit.side === 'defender'))
        return false;
      if (entry.active && ids.some((officerId) => officerAssignments.get(officerId) !== entry.id))
        return false;
    }
    if (
      new Set(battle.units.filter((unit) => unit.troops > 0).map((unit) => `${unit.x},${unit.y}`))
        .size !== battle.units.filter((unit) => unit.troops > 0).length
    )
      return false;
    if (battle.units.some((unit) => unit.troops + unit.wounded > unit.initialTroops)) return false;
    if (battle.units.some((unit) => unit.troops + unit.wounded === 0 && unit.troopExperience !== 0))
      return false;
    if (entry.resolved !== (battle.outcome !== null)) return false;
    if (
      entry.outcome !== null &&
      (entry.outcome === 'draw'
        ? battle.outcome?.winner !== null
        : battle.outcome?.winner !== entry.outcome)
    )
      return false;
  }
  if (
    state.dayResolution &&
    Object.keys(state.dayResolution.daybreakJourneySignatures).some(
      (journeyId) => !journeyIds.has(journeyId),
    )
  )
    return false;
  if (state.dayResolution) {
    if (state.dayResolution.phase === 'month-settlement') {
      if (
        state.dayResolution.processingAbsoluteDay + 1 !== state.absoluteDay ||
        !state.dayResolution.settledMonth
      )
        return false;
    } else if (state.dayResolution.processingAbsoluteDay !== state.absoluteDay) return false;
    if (
      !isUnique(state.dayResolution.battleIds) ||
      !isUnique(state.dayResolution.completedBattleIds) ||
      !isUnique(state.dayResolution.arrivals) ||
      state.dayResolution.battleIds.some((entry) => !battleIds.has(entry))
    )
      return false;
    if (state.dayResolution.arrivals.some((entry) => !journeyIds.has(entry))) return false;
    if (
      state.dayResolution.completedBattleIds.some(
        (entry) => !state.dayResolution!.battleIds.includes(entry),
      )
    )
      return false;
    if (
      state.dayResolution.phase === 'battles' &&
      (state.dayResolution.battleIds.length === 0 ||
        state.dayResolution.completedBattleIds.length >= state.dayResolution.battleIds.length)
    )
      return false;
    if (
      state.dayResolution.phase !== 'battles' &&
      state.dayResolution.completedBattleIds.length !== state.dayResolution.battleIds.length
    )
      return false;
    if (
      state.dayResolution.phase === 'month-settlement' &&
      (state.dayResolution.settledMonth?.year !==
        state.startYear +
          Math.floor(Math.floor(state.dayResolution.processingAbsoluteDay / 30) / 12) ||
        state.dayResolution.settledMonth?.month !==
          (Math.floor(state.dayResolution.processingAbsoluteDay / 30) % 12) + 1)
    )
      return false;
  }
  if (state.winnerFactionId !== null && !factionIds.has(state.winnerFactionId)) return false;
  if ((state.phase === 'finished') !== (state.winnerFactionId !== null)) return false;
  if ((state.phase === 'battle') !== state.battles.some((entry) => entry.active)) return false;
  const validEventReference = (entry: V03GameState['events'][number]) => {
    if (entry.entityId === null)
      return entry.kind === 'monthBoundary' || entry.kind === 'campaignEvent';
    switch (entry.kind) {
      case 'succession':
        return factionIds.has(entry.entityId);
      case 'prisonerAction':
        return officerIds.has(entry.entityId);
      case 'journeyArrival':
        return journeyIds.has(entry.entityId);
      case 'battleReady':
      case 'battleResolved':
        return battleIds.has(entry.entityId);
      case 'requisitionResponse':
        return requisitionIds.has(entry.entityId);
      case 'governorChanged':
      case 'hostileApproach':
        return cityIds.has(entry.entityId);
      case 'factionEliminated':
      case 'victory':
        return factionIds.has(entry.entityId);
      case 'monthBoundary':
      case 'campaignEvent':
        return false;
      case 'hegemonWarning':
      case 'diplomacy':
        return factionIds.has(entry.entityId);
    }
  };
  if (state.events.some((entry) => !validEventReference(entry))) return false;
  return true;
}

function isUnique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function battleHasOfficer(entry: V03GameState['battles'][number], officerId: string): boolean {
  return (
    Object.values(entry.attackerFormationOfficerIds).some((ids) => ids.includes(officerId)) ||
    Object.values(entry.defenderFormationOfficerIds).some((ids) => ids.includes(officerId))
  );
}

export function encodeV03Save(state: V03GameState): string {
  const snapshot = compactV03History(state);
  if (!validateV03State(snapshot))
    throw new Error('The v0.3 campaign state is not valid and cannot be saved.');
  const payload = JSON.stringify({
    format: V03_SAVE_FORMAT,
    version: 3,
    ruleset: 'hegemony-3',
    state: snapshot,
  });
  assertSaveSize(payload);
  return payload;
}

export function decodeV03Save(payload: string | unknown): V03GameState {
  let decoded: unknown = payload;
  if (typeof payload === 'string') {
    assertSaveSize(payload);
    try {
      decoded = JSON.parse(payload) as unknown;
    } catch {
      throw new Error('This save file is not valid JSON.');
    }
  } else {
    try {
      const serialized = JSON.stringify(payload);
      if (serialized === undefined) throw new Error('The file is not serializable JSON.');
      assertSaveSize(serialized);
    } catch (error) {
      if (error instanceof Error && error.message.includes('exceeds the v0.3 save limit'))
        throw error;
      throw new Error('This file is not a valid hegemony.save v0.3 campaign.');
    }
  }
  const parsed = envelopeSchema.safeParse(decoded);
  if (!parsed.success) {
    const candidate = decoded as {
      version?: unknown;
      formatVersion?: unknown;
      ruleset?: unknown;
      format?: unknown;
      state?: {
        version?: unknown;
        ruleset?: unknown;
        personnelSchema?: unknown;
        officerRosterVersion?: unknown;
      };
    } | null;
    const recognizedEnvelope =
      candidate &&
      typeof candidate === 'object' &&
      (candidate.format === 'baye.save' || candidate.format === 'hegemony.save') &&
      typeof candidate.ruleset === 'string';
    const oldBayeEnvelope =
      candidate &&
      candidate.format === 'baye.save' &&
      (candidate.formatVersion === 1 || candidate.formatVersion === 2) &&
      candidate.state?.version === candidate.formatVersion &&
      candidate.state.ruleset === `baye-atlas-${candidate.formatVersion}`;
    if (
      oldBayeEnvelope ||
      (recognizedEnvelope && (candidate.version === 1 || candidate.version === 2))
    ) {
      throw new Error(
        'This save belongs to an older version. Start a new v0.3 campaign; existing data was left unchanged.',
      );
    }
    if (
      recognizedEnvelope &&
      candidate.format === 'hegemony.save' &&
      Number.isSafeInteger(candidate.version) &&
      (candidate.version as number) > 3
    )
      throw new Error(
        'This save uses an unsupported newer version. Open it with a compatible game version; existing data was left unchanged.',
      );
    if (
      recognizedEnvelope &&
      candidate.format === 'hegemony.save' &&
      candidate.version === 3 &&
      candidate.ruleset === 'hegemony-3' &&
      candidate.state &&
      typeof candidate.state === 'object' &&
      candidate.state.version === 3 &&
      candidate.state.ruleset === 'hegemony-3'
    ) {
      if (candidate.state.personnelSchema === undefined)
        throw new Error(
          'This save predates the wounded personnel schema. Export the original data and start a new campaign; existing data was left unchanged.',
        );
      if (
        Number.isSafeInteger(candidate.state.personnelSchema) &&
        (candidate.state.personnelSchema as number) > 1
      )
        throw new Error(
          'This save uses an unsupported newer personnel schema; existing data was left unchanged.',
        );
      if (
        candidate.state.officerRosterVersion === undefined ||
        (Number.isSafeInteger(candidate.state.officerRosterVersion) &&
          (candidate.state.officerRosterVersion as number) < OFFICER_ROSTER_VERSION)
      )
        throw new Error(
          'This save uses an older officer roster. Export the original data and start a new campaign; existing data was left unchanged.',
        );
      if (
        Number.isSafeInteger(candidate.state.officerRosterVersion) &&
        (candidate.state.officerRosterVersion as number) > OFFICER_ROSTER_VERSION
      )
        throw new Error(
          'This save uses an unsupported newer officer roster version; existing data was left unchanged.',
        );
    }
    throw new Error('This file is not a valid hegemony.save v0.3 campaign.');
  }
  if (!validateV03State(parsed.data.state))
    throw new Error('The save contains inconsistent campaign state.');
  return reconcileFactionObjectives(reconcileV03Rulers(compactV03History(parsed.data.state)));
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
  const payload = readV03AutosavePayload(storage);
  return payload === null ? null : decodeV03Save(payload);
}

/** Recovery export must work even when the current schema cannot decode the save. */
export function readV03AutosavePayload(
  storage: Pick<Storage, 'getItem'> = localStorage,
): string | null {
  return storage.getItem(V03_AUTOSAVE_KEY);
}

function assertSaveSize(payload: string): void {
  if (payload.length > V03_MAX_SAVE_BYTES) {
    throw new Error(`This save exceeds the v0.3 save limit of ${V03_MAX_SAVE_BYTES} bytes.`);
  }
  const byteLength = new TextEncoder().encode(payload).byteLength;
  if (byteLength > V03_MAX_SAVE_BYTES) {
    throw new Error(`This save exceeds the v0.3 save limit of ${V03_MAX_SAVE_BYTES} bytes.`);
  }
}

/**
 * Keep saves bounded without trimming anything that is still part of live play.
 * This operates on a clone, so saving/exporting never mutates the running campaign.
 */
function compactV03History(source: V03GameState): V03GameState {
  const state = structuredClone(source);
  for (const officer of state.officers) {
    if (officer.capturedRulerFactionId !== undefined) continue;
    const factionId = capturedRulerFaction(state, officer);
    if (factionId) officer.capturedRulerFactionId = factionId;
  }
  const keepRecentOrPinned = <T extends { id: string }>(
    entries: T[],
    recentCount: number,
    pinnedIds: ReadonlySet<string> = new Set(),
  ): T[] => {
    const recent = new Set(entries.slice(-recentCount).map((entry) => entry.id));
    for (const id of pinnedIds) recent.add(id);
    return entries.filter((entry) => recent.has(entry.id));
  };
  const activeOrder = (status: string) =>
    ['requested', 'proposed', 'waiting', 'accepted', 'reserved', 'dispatched'].includes(status);
  const recentAcknowledgedEventIds = new Set(
    state.events
      .filter((event) => event.acknowledged)
      .slice(-RECENT_EVENT_HISTORY)
      .map((event) => event.id),
  );
  // Filter in place order so interleaved pending and acknowledged reports remain
  // chronological in the saved campaign timeline.
  const retainedEvents = state.events.filter(
    (event) =>
      !event.acknowledged ||
      event.params?.governancePending === true ||
      recentAcknowledgedEventIds.has(event.id),
  );
  const eventBattleIds = new Set(
    retainedEvents
      .filter((event) => event.kind === 'battleReady' || event.kind === 'battleResolved')
      .map((event) => event.entityId!)
      .filter(Boolean),
  );
  const eventJourneyIds = new Set(
    retainedEvents
      .filter((event) => event.kind === 'journeyArrival')
      .map((event) => event.entityId!),
  );
  const eventRequisitionIds = new Set(
    retainedEvents
      .filter((event) => event.kind === 'requisitionResponse')
      .map((event) => event.entityId!),
  );

  state.events = retainedEvents;
  const requisitionIds = new Set(
    state.requisitions
      .filter((entry) => activeOrder(entry.status))
      .map((entry) => entry.id)
      .concat([...eventRequisitionIds]),
  );
  const directiveIds = new Set(
    state.directives.filter((entry) => activeOrder(entry.status)).map((entry) => entry.id),
  );
  state.requisitions = keepRecentOrPinned(
    state.requisitions.filter(
      (entry) => requisitionIds.has(entry.id) || !activeOrder(entry.status),
    ),
    RECENT_ORDER_HISTORY,
    requisitionIds,
  );
  state.directives = keepRecentOrPinned(
    state.directives.filter((entry) => directiveIds.has(entry.id) || !activeOrder(entry.status)),
    RECENT_ORDER_HISTORY,
    directiveIds,
  );

  const battleIdsToKeep = new Set([
    ...eventBattleIds,
    ...(state.dayResolution?.battleIds ?? []),
    ...state.battles.filter((entry) => entry.active).map((entry) => entry.id),
  ]);
  state.battles = keepRecentOrPinned(
    state.battles.filter((entry) => !entry.active),
    RECENT_BATTLE_HISTORY,
    battleIdsToKeep,
  ).concat(state.battles.filter((entry) => entry.active));

  const journeyIdsToKeep = new Set([
    ...eventJourneyIds,
    ...(state.dayResolution?.arrivals ?? []),
    ...state.officers.flatMap((officer) =>
      officer.location.kind === 'journey' ||
      (officer.location.kind === 'captured' && officer.location.journeyId)
        ? [officer.location.journeyId!]
        : [],
    ),
    ...state.cities.flatMap((city) =>
      city.pendingAppointment?.journeyId ? [city.pendingAppointment.journeyId] : [],
    ),
    ...state.requisitions.flatMap((entry) => (entry.journeyId ? [entry.journeyId] : [])),
    ...state.directives.flatMap((entry) => (entry.journeyId ? [entry.journeyId] : [])),
    ...state.battles.flatMap((entry) => [entry.attackerJourneyId, entry.defenderJourneyId ?? '']),
  ]);
  state.journeys = keepRecentOrPinned(
    state.journeys.filter((entry) => entry.status === 'delivered' || entry.status === 'cancelled'),
    RECENT_JOURNEY_HISTORY,
    journeyIdsToKeep,
  ).concat(
    state.journeys.filter((entry) => entry.status !== 'delivered' && entry.status !== 'cancelled'),
  );
  state.log = state.log.slice(-RECENT_LOG_HISTORY);
  const journeyOrder = new Map(source.journeys.map((entry, index) => [entry.id, index]));
  const battleOrder = new Map(source.battles.map((entry, index) => [entry.id, index]));
  state.journeys.sort((a, b) => journeyOrder.get(a.id)! - journeyOrder.get(b.id)!);
  state.battles.sort((a, b) => battleOrder.get(a.id)! - battleOrder.get(b.id)!);
  return state;
}
