import { deepFreeze } from './freeze';

/** Troops, wounded, soldier experience and prisoners. */
export const PERSONNEL = deepFreeze({
  /** Most troops (healthy plus wounded) one officer can command. */
  capacity: 10_000,
  /** Percent of casualties that survive as wounded. */
  woundedPercent: 60,
  /** Percent of an orderly retreat's formation captured. */
  orderlyCapturePercent: 5,
  /** Percent of a forced retreat's formation captured. */
  forcedCapturePercent: 25,
  /** Percent of wounded who recover each recovery step. */
  recoveryPercent: 10,
  /** Days a reorganizing formation is unavailable. */
  reorganizationDays: 10,
  troopExperience: {
    /** Highest soldier experience. */
    max: 1900,
    /** Experience for each soldier level. */
    perLevel: 100,
    /** Highest soldier level. */
    maxLevel: 20,
  },
  prisoner: {
    /** Loyalty an officer loses each month in captivity. */
    captivityMonthlyLoyaltyLoss: 5,
    /** Loyalty a defecting ruler's officers lose. */
    rulerDefectionLoyaltyLoss: 10,
    /** Lowest recruit chance in percent. */
    recruitChanceMin: 5,
    /** Highest recruit chance in percent. */
    recruitChanceMax: 90,
    /** Chance in percent that an exchange is accepted. */
    exchangeChance: 75,
    /** Loyalty of a recruited prisoner. */
    joinLoyalty: 60,
    /** Loyalty at which a benevolent holder lets a prisoner go instead of recruiting. */
    benevolentReleaseLoyalty: 75,
  },
} as const);
