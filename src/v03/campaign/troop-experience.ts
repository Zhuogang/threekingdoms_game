import type { TroopType } from '../content/types';

/** Soldier experience is independent of the commanding officer's own experience. */
export const MAX_TROOP_EXPERIENCE = 1900;

export interface TroopPool {
  troops: number;
  /** Mean experience per soldier, retained at full numeric precision. */
  troopExperience: number;
}

export const TROOP_TYPES: readonly TroopType[] = ['infantry', 'archer', 'cavalry'];
export type ReservePools = Record<TroopType, TroopPool>;

export function createReservePools(infantry = 0, archer = 0, cavalry = 0): ReservePools {
  return {
    infantry: { troops: infantry, troopExperience: 0 },
    archer: { troops: archer, troopExperience: 0 },
    cavalry: { troops: cavalry, troopExperience: 0 },
  };
}

/** reserve is a checked aggregate used by city summaries; pools retain type and experience. */
export function setReservePool(
  city: { reserve: number; reservePools: ReservePools },
  type: TroopType,
  pool: TroopPool,
): void {
  checkPool(pool);
  city.reservePools = { ...city.reservePools, [type]: { ...pool } };
  city.reserve = TROOP_TYPES.reduce((sum, kind) => sum + city.reservePools[kind].troops, 0);
}

export function troopLevel(experience: number): number {
  checkExperience(experience);
  return Math.min(20, 1 + Math.floor(experience / 100));
}

function checkExperience(experience: number): void {
  if (!Number.isFinite(experience) || experience < 0 || experience > MAX_TROOP_EXPERIENCE)
    throw new RangeError('Soldier experience must be between 0 and 1900.');
}

function checkPool(pool: TroopPool): void {
  if (!Number.isSafeInteger(pool.troops) || pool.troops < 0)
    throw new RangeError('Troop counts must be nonnegative safe integers.');
  checkExperience(pool.troopExperience);
  if (pool.troops === 0 && pool.troopExperience !== 0)
    throw new RangeError('An empty troop pool cannot retain experience.');
}

export function mergeTroopPools(...pools: readonly TroopPool[]): TroopPool {
  pools.forEach(checkPool);
  const troops = pools.reduce((sum, pool) => sum + pool.troops, 0);
  if (!Number.isSafeInteger(troops)) throw new RangeError('Troop count exceeds capacity.');
  return {
    troops,
    troopExperience:
      troops === 0
        ? 0
        : Math.min(
            MAX_TROOP_EXPERIENCE,
            pools.reduce((sum, pool) => sum + pool.troops * pool.troopExperience, 0) / troops,
          ),
  };
}

/** Uniform splitting: both parts retain their soldiers' experience; empty parts reset. */
export function splitTroopPool(pool: TroopPool, count: number) {
  checkPool(pool);
  if (!Number.isSafeInteger(count) || count < 0 || count > pool.troops)
    throw new RangeError('Cannot split more soldiers than the pool contains.');
  return {
    remaining: {
      troops: pool.troops - count,
      troopExperience: pool.troops === count ? 0 : pool.troopExperience,
    },
    taken: { troops: count, troopExperience: count === 0 ? 0 : pool.troopExperience },
  };
}

/** Casualties/desertion remove soldiers uniformly and cannot improve their mean experience. */
export function applyTroopLoss(pool: TroopPool, survivors: number): void {
  const { taken } = splitTroopPool(pool, survivors);
  Object.assign(pool, taken);
}
