import { SIEGE_TUNING as T } from './rules/tuning';
import { z } from 'zod';
import { COUNTER_KINDS, type CounterKind } from './ui/counters';
import type { SiegeState, SiegeLogEntry, SiegeSide } from './rules/types';

export const SIEGE_SAVE_KEY = 'threekingdoms-siege-chencang-v2';
export const siegeSaveKey = (side: SiegeSide) => `${SIEGE_SAVE_KEY}-${side}`;
const LAST_SIDE_KEY = `${SIEGE_SAVE_KEY}-last-side`;
export type Facing = 'north' | 'east' | 'west' | 'south';
export const HINT_KINDS = ['wall', 'trench', 'ladder', 'frontage', 'innerWall'] as const;
export type HintKind = (typeof HINT_KINDS)[number];
export interface SiegeWalkthrough {
  status: 'active' | 'done' | 'skipped';
  step: number;
  startDay: number;
  logStart: number;
  logCursor?: number;
  cartWorkshopId?: string;
  cartId?: string;
  ladderId?: string;
  infantryId?: string;
  archerId?: string;
}
export interface SiegePresentation {
  openingStep: number;
  bannersSeen: Array<1 | 2>;
  dismissedHints: HintKind[];
  walkthrough?: SiegeWalkthrough;
  dismissedCounters?: CounterKind[];
  reportReadDay?: number;
  reportSeen?: Record<string, number>;
  reportObservations?: SiegeLogEntry[];
  attackerTurnDay?: number;
}
export interface SiegeSave {
  state: SiegeState;
  /** Legacy call sites may omit this; the serializer writes Shu. Stored v0.2 saves require it. */
  playerSide?: 'shu' | 'wei';
  phase: 'opening' | 'deploy' | 'battle';
  facings: Record<string, Facing>;
  presentation?: SiegePresentation;
}
/** Task F saves continue directly, without interrupting a battle with an old act banner. */
export function presentationFor(save: SiegeSave): SiegePresentation {
  return (
    save.presentation ?? {
      openingStep: 6,
      bannersSeen: save.phase === 'battle' ? [save.state.act] : [],
      dismissedHints: [],
    }
  );
}
const integer = z.number().int();
const cell = { x: integer, y: integer };
const scoreSchema = z.strictObject({
  side: z.enum(['shu', 'wei']),
  tier: z.enum([
    'swiftVictory',
    'victory',
    'costlyVictory',
    'orderlyWithdrawal',
    'grainWithdrawal',
    'defeat',
    'annihilation',
    'perfectDefense',
    'firmDefense',
    'narrowDefense',
    'cityFallen',
  ]),
  score: z.number(),
  parts: z.record(z.string(), z.number()),
});
const stateSchema = z.strictObject({
  version: z.literal('siege_v0.2'),
  seed: integer.nonnegative(),
  rngState: integer.nonnegative(),
  day: integer.min(1).max(T.days),
  act: z.union([z.literal(1), z.literal(2)]),
  weather: z.enum(['clear', 'snow', 'wind']),
  weatherByDay: z.record(z.string(), z.enum(['clear', 'snow', 'wind'])),
  grain: integer.nonnegative(),
  zhangheDistance: integer.nonnegative(),
  units: z.array(
    z.strictObject({
      ...cell,
      id: z.string(),
      side: z.enum(['shu', 'wei']),
      level: z.enum(['ground', 'wall']),
      troopType: z.enum(['infantry', 'archer']),
      troops: integer.nonnegative(),
      wounded: integer.nonnegative(),
      morale: z.number(),
      force: z.number(),
      intellect: z.number(),
      moved: z.boolean(),
      acted: z.boolean(),
      routed: z.boolean(),
      casualtyRemainder: z.number().nonnegative().optional(),
      troopExperience: z.number().nonnegative().optional(),
      lostTroopsToday: integer.nonnegative().optional(),
      attackedFromBelowDay: integer.min(1).max(T.days).optional(),
      climbing: z.boolean().optional(),
      suppressedDay: integer.min(1).max(T.days).optional(),
      assaultedDay: integer.min(1).max(T.days).optional(),
      rotateRecoveryDay: integer
        .min(1)
        .max(T.days + 1)
        .optional(),
      officer: z.strictObject({
        id: z.string(),
        name: z.string(),
        chinese: z.string(),
        portraitId: z.string().nullable(),
      }),
    }),
  ),
  engines: z.array(
    z.strictObject({
      ...cell,
      id: z.string(),
      kind: z.enum(['ladder', 'ram', 'earthCart', 'tower']),
      durability: z.number().nonnegative(),
      max: z.number().positive(),
      burning: z.boolean(),
      covered: z.boolean().optional(),
      wrecked: z.boolean(),
      raisedAt: z.object(cell).optional(),
      uses: integer.min(1).max(T.cartLoads).optional(),
      moved: z.boolean().optional(),
      acted: z.boolean().optional(),
    }),
  ),
  gates: z.object(
    Object.fromEntries(
      ['south', 'north', 'west', 'east'].map((id) => [
        id,
        z.strictObject({
          durability: z.number().nonnegative(),
          max: z.number().positive(),
          broken: z.boolean(),
          damaged: z.boolean().optional(),
        }),
      ]),
    ),
  ),
  trenchFill: z.record(z.string(), z.number().min(0).max(T.trenchCapacity).multipleOf(0.25)),
  innerWall: z.record(z.string(), integer.min(0).max(4)),
  workshops: z.array(
    z.object({
      id: z.string(),
      queue: z.enum(['ladder', 'ram', 'earthCart', 'tower']).nullable(),
      daysRemaining: integer.nonnegative(),
    }),
  ),
  footholds: z.record(z.string().regex(/^\d+,\d+$/), integer.min(0).max(T.footholdComplete)),
  mounds: z.record(z.string().regex(/^\d+,17$/), integer.min(0).max(T.moundComplete)),
  preparations: z.strictObject({
    braziers: z.record(
      z.string().regex(/^\d+,\d+$/),
      z.strictObject({ litDay: integer.min(1).max(T.days) }),
    ),
    millstones: z.record(
      z.string().regex(/^\d+,\d+$/),
      z.strictObject({ hoisted: z.boolean(), day: integer.min(1).max(T.days) }),
    ),
    boulders: z.record(
      z.string().regex(/^\d+,\d+$/),
      z.strictObject({ day: integer.min(1).max(T.days) }),
    ),
  }),
  nightOrders: z.strictObject({
    shu: z.strictObject({ kind: z.literal('nightAssault') }).optional(),
    wei: z
      .discriminatedUnion('kind', [
        z.strictObject({ kind: z.literal('torches') }),
        z.strictObject({
          kind: z.literal('nightRepair'),
          target: z.enum(['south', 'north', 'east', 'west']),
        }),
        z.strictObject({ kind: z.literal('sortie'), target: z.string(), unitId: z.string() }),
      ])
      .optional(),
  }),
  mainBodyThreatened: z.boolean(),
  stats: z.strictObject({
    shuLost: integer.nonnegative(),
    weiLost: integer.nonnegative(),
    enginesLost: integer.nonnegative(),
    assaults: integer.nonnegative(),
    nightClashes: integer.nonnegative(),
    nightResults: z.array(
      z.strictObject({ day: integer.min(1).max(T.days), kind: z.string(), result: z.string() }),
    ),
    idleDays: integer.nonnegative(),
    lastActiveDay: integer.min(1).max(T.days).nullable(),
    score: z.strictObject({ shu: scoreSchema, wei: scoreSchema }).nullable(),
    moundsBuilt: integer.nonnegative(),
    gateEverBroken: z.boolean(),
    wallEverHeldAtNight: z.boolean(),
    wallNights: integer.min(0).max(T.days),
    firstFootholdDay: integer.min(1).max(T.days).nullable(),
    firstWallDay: integer.min(1).max(T.days).nullable(),
  }),
  ordersUsed: z.object({
    shu: z.record(z.string(), z.boolean()),
    wei: z.record(z.string(), z.boolean()),
  }),
  log: z.array(
    z.object({
      day: integer,
      code: z.string(),
      params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
    }),
  ),
  outcome: z.enum(['victory', 'historical', 'defeat']).nullable(),
  act2Day: integer.optional(),
  enginesLostAct1: integer.optional(),
  holdFast: z
    .object({ day: integer.min(1).max(T.days + 1), cells: z.array(z.object(cell)) })
    .optional(),
  withdrawn: z.boolean().optional(),
});
const saveSchema = z.strictObject({
  state: stateSchema,
  playerSide: z.enum(['shu', 'wei']),
  phase: z.enum(['opening', 'deploy', 'battle']),
  facings: z.record(z.string(), z.enum(['north', 'east', 'west', 'south'])),
  presentation: z
    .object({
      openingStep: integer.min(0).max(6),
      bannersSeen: z.array(z.union([z.literal(1), z.literal(2)])),
      dismissedHints: z.array(z.enum(HINT_KINDS)),
      dismissedCounters: z.array(z.enum(COUNTER_KINDS)).optional(),
      reportReadDay: integer.min(1).max(T.days).optional(),
      reportSeen: z.record(z.string(), integer.min(1).max(T.days)).optional(),
      attackerTurnDay: integer.min(1).max(T.days).optional(),
      reportObservations: z
        .array(
          z.object({
            day: integer,
            code: z.literal('innerWallCompleted'),
            params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
          }),
        )
        .optional(),
      walkthrough: z
        .object({
          status: z.enum(['active', 'done', 'skipped']),
          step: integer.min(1).max(9),
          startDay: integer.min(1).max(T.days),
          logStart: integer.nonnegative(),
          logCursor: integer.nonnegative().optional(),
          cartWorkshopId: z.string().optional(),
          cartId: z.string().optional(),
          ladderId: z.string().optional(),
          infantryId: z.string().optional(),
          archerId: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export function serializeSiegeSave(save: SiegeSave): string {
  // Validate, then serialize the original so no rule fields or fractional remainders are discarded.
  const value = { ...save, playerSide: save.playerSide ?? 'shu' };
  saveSchema.parse(value);
  return JSON.stringify(value);
}
export function deserializeSiegeSave(payload: string): SiegeSave & { playerSide: 'shu' | 'wei' } {
  const value: unknown = JSON.parse(payload);
  saveSchema.parse(value);
  return value as SiegeSave & { playerSide: 'shu' | 'wei' };
}
export function saveSiege(save: SiegeSave, storage: Pick<Storage, 'setItem'> = localStorage): void {
  const side = save.playerSide ?? 'shu';
  storage.setItem(siegeSaveKey(side), serializeSiegeSave(save));
  storage.setItem(LAST_SIDE_KEY, side);
}
export function loadSiege(
  storage: Pick<Storage, 'getItem'> = localStorage,
  side?: SiegeSide,
): SiegeSave | null {
  const preferred = side ?? (storage.getItem(LAST_SIDE_KEY) === 'wei' ? 'wei' : 'shu');
  const sides: SiegeSide[] = side ? [side] : [preferred, preferred === 'shu' ? 'wei' : 'shu'];
  for (const candidate of sides) {
    const payload = storage.getItem(siegeSaveKey(candidate));
    if (payload !== null) {
      const save = deserializeSiegeSave(payload);
      if (save.playerSide !== candidate) throw new Error('Save side does not match its slot.');
      return save;
    }
  }
  // Read the package M slot without moving or overwriting it.
  const legacy = storage.getItem(SIEGE_SAVE_KEY);
  if (legacy === null) return null;
  const save = deserializeSiegeSave(legacy);
  return !side || save.playerSide === side ? save : null;
}
export function hasSiegeSave(side?: SiegeSide): boolean {
  try {
    return loadSiege(localStorage, side) !== null;
  } catch {
    return false;
  }
}
