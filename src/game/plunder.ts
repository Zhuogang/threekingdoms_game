import type { City, Officer } from './types';

/** Plunder, raid and sack are all valued by this one formula (design decision D1). */
export const PLUNDER_COOLDOWN_MONTHS = 3;
export const PLUNDER_MIN_SUPPORT = 10;
export const PLUNDER_OFFICER_LOYALTY_LOSS = 3;
const GOLD_PER_POWER = 2;
const FOOD_PER_POWER = 5;
const GOLD_PER_COMMERCE = 1.5;
const FOOD_PER_FARMING = 4;
const POPULATION_KEPT = 0.92;
const POPULATION_FLOOR = 500;

export interface PlunderOutcome {
  gold: number;
  food: number;
  after: { loyalty: number; farming: number; commerce: number; population: number };
}

/** Pure. Uses the city's values before halving; `leader` supplies INT + FORCE. */
export function plunderOutcome(
  city: Pick<City, 'loyalty' | 'farming' | 'commerce' | 'population'>,
  leader: Pick<Officer, 'intellect' | 'force'>,
): PlunderOutcome {
  const power = leader.intellect + leader.force;
  return {
    gold: GOLD_PER_POWER * power + Math.floor(city.commerce * GOLD_PER_COMMERCE),
    food: FOOD_PER_POWER * power + Math.floor(city.farming * FOOD_PER_FARMING),
    after: {
      loyalty: Math.floor(city.loyalty / 2),
      farming: Math.floor(city.farming / 2),
      commerce: Math.floor(city.commerce / 2),
      population: Math.min(
        city.population,
        Math.max(POPULATION_FLOOR, Math.floor(city.population * POPULATION_KEPT)),
      ),
    },
  };
}

/** The raid or sack leader is the commander with the highest INT + FORCE. */
export function plunderLeader<T extends Pick<Officer, 'id' | 'intellect' | 'force'>>(
  commanders: readonly T[],
): T | undefined {
  return [...commanders].sort(
    (a, b) => b.intellect + b.force - (a.intellect + a.force) || a.id.localeCompare(b.id),
  )[0];
}
