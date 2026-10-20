import { DEFAULT_DAY_LIMIT, startingTacticPoints } from './battle';
import { levelForExperience } from './officers';
import type { BattleUnit, GameState } from './types';

/**
 * Deterministic defaults applied when a v1 save becomes a v2 save. Migration
 * never draws RNG: the same v1 save always becomes the same v2 state.
 * Every new field a rules task adds to saved state extends this section.
 */
export const MIGRATION_DEFAULTS = {
  plunderCooldownUntil: 0,
  fate: 'active' as const,
  intent: 'conquer' as const,
  dayLimit: DEFAULT_DAY_LIMIT,
  hurt: false,
  truceUntilTurn: 0,
  lastBattle: null,
};

type Legacy = Record<string, any>;

/** Convert a validated v1 state (see the v1 save schema) into the v2 shape. */
export function migrateV1toV2(v1: Legacy): GameState {
  const state = structuredClone(v1);
  const withIntent = (order: Legacy): Legacy => ({ ...order, intent: MIGRATION_DEFAULTS.intent });
  state.version = 2;
  state.ruleset = 'baye-atlas-2';
  state.cities = state.cities.map((city: Legacy) => ({
    ...city,
    plunderCooldownUntil: MIGRATION_DEFAULTS.plunderCooldownUntil,
  }));
  const officers: Legacy[] = state.officers.map((officer: Legacy) => ({
    ...officer,
    level: levelForExperience(officer.experience),
    fate: MIGRATION_DEFAULTS.fate,
  }));
  state.officers = officers;
  state.orders = state.orders.map(withIntent);
  if (state.resolution)
    state.resolution = { ...state.resolution, queue: state.resolution.queue.map(withIntent) };
  if (state.battle) {
    const levelOf = (officerId: string): number =>
      officers.find((officer) => officer.id === officerId)?.level ?? 0;
    const units: BattleUnit[] = state.battle.units.map((unit: Legacy) => ({
      ...unit,
      level: unit.officerId.startsWith('militia-') ? 0 : levelOf(unit.officerId),
      hurt: MIGRATION_DEFAULTS.hurt,
    }));
    state.battle = {
      ...state.battle,
      order: withIntent(state.battle.order),
      units,
      dayLimit: MIGRATION_DEFAULTS.dayLimit,
      nextWeather: state.battle.weather,
      tacticPoints: {
        attacker: startingTacticPoints(units, 'attacker'),
        defender: startingTacticPoints(units, 'defender'),
      },
    };
  }
  state.truceUntilTurn = MIGRATION_DEFAULTS.truceUntilTurn;
  state.lastBattle = MIGRATION_DEFAULTS.lastBattle;
  state.reputation = {};
  return state as GameState;
}
