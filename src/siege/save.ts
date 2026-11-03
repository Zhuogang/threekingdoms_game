import { z } from 'zod';
import type { SiegeState } from './rules/types';

export const SIEGE_SAVE_KEY = 'threekingdoms-siege-chencang';
export type Facing = 'north' | 'east' | 'west' | 'south';
export const HINT_KINDS = ['wall', 'trench', 'ladder', 'frontage', 'innerWall'] as const;
export type HintKind = (typeof HINT_KINDS)[number];
export interface SiegePresentation {
  openingStep: number;
  bannersSeen: Array<1 | 2>;
  dismissedHints: HintKind[];
}
export interface SiegeSave {
  state: SiegeState;
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
const stateSchema = z.object({
  version: z.literal('siege_v0.1'),
  seed: integer.nonnegative(),
  rngState: integer.nonnegative(),
  day: integer.min(1).max(20),
  act: z.union([z.literal(1), z.literal(2)]),
  weather: z.enum(['clear', 'snow', 'wind']),
  weatherByDay: z.record(z.string(), z.enum(['clear', 'snow', 'wind'])),
  grain: integer.nonnegative(),
  zhangheDistance: integer.nonnegative(),
  units: z.array(
    z.looseObject({
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
      officer: z.object({
        id: z.string(),
        name: z.string(),
        chinese: z.string(),
        portraitId: z.string().nullable(),
      }),
    }),
  ),
  engines: z.array(
    z.looseObject({
      ...cell,
      id: z.string(),
      kind: z.enum(['ladder', 'ram', 'earthCart', 'tower']),
      durability: z.number().nonnegative(),
      max: z.number().positive(),
      burning: z.boolean(),
      wrecked: z.boolean(),
      raisedAt: z.object(cell).optional(),
      uses: integer.optional(),
      moved: z.boolean().optional(),
      acted: z.boolean().optional(),
    }),
  ),
  gates: z.object(
    Object.fromEntries(
      ['south', 'north', 'west', 'east'].map((id) => [
        id,
        z.looseObject({
          durability: z.number().nonnegative(),
          max: z.number().positive(),
          broken: z.boolean(),
        }),
      ]),
    ),
  ),
  trenchFill: z.record(
    z.string(),
    z.union([
      z.literal(0),
      z.literal(0.5),
      z.literal(1),
      z.literal(1.5),
      z.literal(2),
      z.literal(2.5),
      z.literal(3),
    ]),
  ),
  innerWall: z.record(z.string(), integer.min(0).max(4)),
  workshops: z.array(
    z.object({
      id: z.string(),
      queue: z.enum(['ladder', 'ram', 'earthCart', 'tower']).nullable(),
      daysRemaining: integer.nonnegative(),
    }),
  ),
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
  holdFast: z.object({ day: integer, cells: z.array(z.object(cell)) }).optional(),
  withdrawn: z.boolean().optional(),
});
const saveSchema = z.object({
  state: stateSchema,
  phase: z.enum(['opening', 'deploy', 'battle']),
  facings: z.record(z.string(), z.enum(['north', 'east', 'west', 'south'])),
  presentation: z
    .object({
      openingStep: integer.min(0).max(6),
      bannersSeen: z.array(z.union([z.literal(1), z.literal(2)])),
      dismissedHints: z.array(z.enum(HINT_KINDS)),
    })
    .optional(),
});

export function serializeSiegeSave(save: SiegeSave): string {
  // Validate, then serialize the original so no rule fields or fractional remainders are discarded.
  saveSchema.parse(save);
  return JSON.stringify(save);
}
export function deserializeSiegeSave(payload: string): SiegeSave {
  const value: unknown = JSON.parse(payload);
  saveSchema.parse(value);
  return value as SiegeSave;
}
export function saveSiege(save: SiegeSave, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(SIEGE_SAVE_KEY, serializeSiegeSave(save));
}
export function loadSiege(storage: Pick<Storage, 'getItem'> = localStorage): SiegeSave | null {
  const payload = storage.getItem(SIEGE_SAVE_KEY);
  return payload === null ? null : deserializeSiegeSave(payload);
}
export function hasSiegeSave(): boolean {
  try {
    return localStorage.getItem(SIEGE_SAVE_KEY) !== null;
  } catch {
    return false;
  }
}
