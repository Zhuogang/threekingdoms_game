import type { GameState } from '../src/game/types';
import { HEGEMON_MONTHS } from '../src/game/world';
import type { BattleTuning } from '../src/game/battle';
import type { RivalAggression } from '../src/game/aiPolicy';

/** A symmetric ratio: exactly 1.6 is uneven and exactly 3 is lopsided. */
export const forceRatio = (battle: { attackerStart: number; defenderStart: number }) =>
  Math.max(battle.attackerStart, battle.defenderStart) /
  Math.max(1, Math.min(battle.attackerStart, battle.defenderStart));
export const forceBucket = (battle: { attackerStart: number; defenderStart: number }) => {
  const ratio = forceRatio(battle);
  return ratio < 1.6 ? 'contested' : ratio < 3 ? 'uneven' : 'lopsided';
};
export const ratioStat = (numerator: number, denominator: number) => ({
  numerator,
  denominator,
  percent: denominator ? Math.round((numerator * 1000) / denominator) / 10 : null,
});

export type EndingReason = 'unification' | 'hegemon' | 'playerElimination' | 'unfinished';
/** A winner on player elimination is only the leading house, not necessarily a victor. */
export function campaignOutcome(state: GameState) {
  const playerCities = state.cities.filter((c) => c.factionId === state.playerFactionId).length;
  let reason: EndingReason = 'unfinished';
  if (state.phase === 'finished') {
    if (state.winner && state.cities.every((c) => c.factionId === state.winner))
      reason = 'unification';
    // finishMonth checks elimination before updating the Hegemon clock. The clock
    // can reach twelve on that same turn without actually proclaiming a Hegemon.
    else if (playerCities === 0) reason = 'playerElimination';
    else if (state.winner === state.hegemon.factionId && state.hegemon.months >= HEGEMON_MONTHS)
      reason = 'hegemon';
    else throw new Error('Finished diagnostic campaign has no recognized ending.');
  }
  return {
    reason,
    winner: state.phase === 'finished' ? state.winner : null,
    endedMonth: state.phase === 'finished' ? state.turn : null,
    playerWon: state.phase === 'finished' && state.winner === state.playerFactionId,
    rivalVictory:
      (reason === 'unification' || reason === 'hegemon') && state.winner !== state.playerFactionId,
    playerEliminated: playerCities === 0,
  };
}

export interface CityCheckpoint {
  cities: number | null;
  status: 'observed' | 'endedBeforeHorizon' | 'notReached';
}
/** Prior loss is conclusive; an intact realm observed for fewer months is censored. */
export function retentionStatus(months: number, firstLoss: number | null, horizon: number) {
  if (firstLoss !== null && firstLoss <= horizon) return { observed: true, kept: false };
  return months >= horizon ? { observed: true, kept: true } : { observed: false, kept: null };
}
/** Early terminal outcomes are observed; unfinished runs before a horizon are censored. */
export function horizonStatus(
  run: { months: number; endedMonth: number | null; eliminated: number | null },
  horizon: number,
) {
  if (run.months < horizon && run.endedMonth === null)
    return { observed: false, survived: null, active: null };
  return {
    observed: true,
    survived: run.eliminated === null || run.eliminated > horizon,
    active: run.endedMonth === null || run.endedMonth > horizon,
  };
}
/** Never carry terminal territory forward and describe it as a later observation. */
export function cityCheckpoint(
  observed: Record<number, number>,
  horizon: number,
  endedMonth: number | null,
): CityCheckpoint {
  if (Object.hasOwn(observed, horizon)) return { cities: observed[horizon]!, status: 'observed' };
  return {
    cities: null,
    status: endedMonth !== null && endedMonth < horizon ? 'endedBeforeHorizon' : 'notReached',
  };
}

const TUNING_RANGES: Record<Exclude<keyof BattleTuning, 'armyBreak'>, [number, number]> = {
  normalDamageRate: [0.01, 1],
  fireDamageRate: [0.01, 1],
  rockfallDamageRate: [0.01, 1],
  counterRate: [0, 1],
  guardCounterRate: [0, 1],
  flankBonus: [0, 1],
  flankCap: [0, 2],
  routedMorale: [0, 100],
  holdNearCampRadius: [0, 20],
};
export type TuningOverrides = Partial<BattleTuning> & {
  attackMultipliers?: Partial<Record<RivalAggression, number>>;
};
/** Validate the entire override before a caller mutates any module-level tuning. */
export function parseTuningOverrides(raw: string): TuningOverrides {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
    throw new Error('Diagnostic tuning must be an object.');
  const finiteIn = (key: string, value: unknown, min: number, max: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)
      throw new Error(`Tuning ${key} must be a finite number in [${min}, ${max}].`);
  };
  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'attackMultipliers') {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('attackMultipliers must be an object.');
      for (const [preset, multiplier] of Object.entries(value)) {
        if (!['cautious', 'balanced', 'aggressive'].includes(preset))
          throw new Error(`Unknown aggression: ${preset}`);
        finiteIn(`${key}.${preset}`, multiplier, 0.1, 4);
      }
    } else if (key === 'armyBreak') {
      if (typeof value !== 'boolean') throw new Error('armyBreak must be boolean.');
    } else if (Object.hasOwn(TUNING_RANGES, key)) {
      const [min, max] = TUNING_RANGES[key as keyof typeof TUNING_RANGES];
      finiteIn(key, value, min, max);
      if (['routedMorale', 'holdNearCampRadius'].includes(key) && !Number.isInteger(value))
        throw new Error(`${key} must be an integer.`);
    } else throw new Error(`Unknown tuning lever: ${key}`);
  }
  return parsed as TuningOverrides;
}
