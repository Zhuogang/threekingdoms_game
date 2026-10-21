import type { SupplyDays } from './types';

/** A side eats `ceil(livingTroops / SUPPLY_DIVISOR)` food per battle day. */
export const SUPPLY_DIVISOR = 25;
export const SUPPLY_DAY_OPTIONS: readonly SupplyDays[] = [10, 20, 30];
export const DEFAULT_SUPPLY_DAYS: SupplyDays = 20;
/** Raids are quick strikes with a fixed 10-day supply and day limit. */
export const RAID_SUPPLY_DAYS: SupplyDays = 10;

export function isSupplyDays(value: unknown): value is SupplyDays {
  return SUPPLY_DAY_OPTIONS.includes(value as SupplyDays);
}

/** Food committed by a march: the chosen number of days of battle rations. */
export function supplyFood(troops: number, days: SupplyDays = DEFAULT_SUPPLY_DAYS): number {
  return days * Math.ceil(troops / SUPPLY_DIVISOR);
}
