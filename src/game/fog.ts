import { activateScenario } from '../content/scenario';
import { plunderOutcome } from './plunder';
import { allied } from './world';
import type { City, GameState, Officer } from './types';

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

/** An unscouted city's farming and commerce are only known to within this fraction. */
export const FOG_LOOT_SPREAD = 0.25;
export interface LootRange {
  gold: [number, number];
  food: [number, number];
  /** True when the city is scouted, so the figures are exact. */
  exact: boolean;
}

/** Expected raid or sack loot; a range when the target's economy is hidden by fog. Pure. */
export function lootRange(
  state: GameState,
  target: City,
  leader: Pick<Officer, 'intellect' | 'force'>,
): LootRange {
  const mid = plunderOutcome(target, leader);
  if (isScouted(state, target.id))
    return { gold: [mid.gold, mid.gold], food: [mid.food, mid.food], exact: true };
  const at = (scale: number) =>
    plunderOutcome(
      {
        ...target,
        commerce: Math.floor(target.commerce * scale),
        farming: Math.floor(target.farming * scale),
      },
      leader,
    );
  const low = at(1 - FOG_LOOT_SPREAD);
  const high = at(1 + FOG_LOOT_SPREAD);
  return {
    gold: [Math.min(low.gold, mid.gold), Math.max(high.gold, mid.gold)],
    food: [Math.min(low.food, mid.food), Math.max(high.food, mid.food)],
    exact: false,
  };
}
