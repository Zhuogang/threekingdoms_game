import { deepFreeze } from './freeze';

/** Standing orders (B-01): evaluator weights per order and the enemy AI's order rules. */
export const ORDERS = deepFreeze({
  /** Multiplier on the progress term of the turn score, per order. */
  progressWeight: {
    free: 1,
    advance: 1.5,
    hold: 0,
    skirmish: 0.5,
    charge: 2,
    screen: 0,
    withdraw: 0,
    pursue: 1.5,
  },
  /** Multiplier on the exposure term of the turn score, per order. */
  exposureWeight: {
    free: 1,
    advance: 1,
    hold: 1.2,
    skirmish: 1.5,
    charge: 0.4,
    screen: 1,
    withdraw: 2,
    pursue: 0.8,
  },
  skirmish: {
    /** Nearest enemy distance an archer on skirmish keeps, at least. */
    minDistance: 2,
    /** And at most. */
    maxDistance: 3,
  },
  ai: {
    /** Plain cells of straight lane a fierce cavalry formation needs to be sent charging. */
    chargeMinLane: 3,
    /** An archer skirmishes when a friendly infantry formation stands within this many cells. */
    skirmishInfantryRange: 2,
  },
} as const);
