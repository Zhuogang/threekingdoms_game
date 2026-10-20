import { activateScenario } from '../content/scenario';
import { allied } from './world';
import type { GameState } from './types';

/**
 * Fog of war is presentation only: the simulation and the AI always see exact numbers.
 * The player sees exact figures for their own and allied cities, and for any city their
 * scouts reported on within the last two months; elsewhere only ranges.
 */
export const SCOUT_MONTHS = 2;

export function isScouted(state: GameState, cityId: string): boolean {
  activateScenario(state.scenarioId);
  const city = state.cities.find((c) => c.id === cityId);
  if (!city) return false;
  if (
    city.factionId === state.playerFactionId ||
    allied(state, state.playerFactionId, city.factionId)
  )
    return true;
  const seen = state.scouted[cityId];
  return seen !== undefined && state.turn - seen < SCOUT_MONTHS;
}

/** Stable pseudo-random fraction from a string, so the same fog shows the same range. */
function fraction(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return (hash % 1000) / 1000;
}

/** A rounded range containing `value`, fixed per city and statistic. */
export function fogRange(value: number, cityId: string, stat: string): [number, number] {
  const low = 0.7 + fraction(`${cityId}:${stat}:low`) * 0.15;
  const high = 1.15 + fraction(`${cityId}:${stat}:high`) * 0.15;
  const step = value >= 5000 ? 500 : value >= 500 ? 100 : 10;
  return [
    Math.max(0, Math.floor((value * low) / step) * step),
    Math.ceil((value * high) / step) * step,
  ];
}
