import { deepFreeze } from './freeze';

/** Capital work points, governor actions and officer growth. */
export const CITY_WORK = deepFreeze({
  /** Gold cost of one farming, commerce or loyalty work action. */
  workGold: 80,
  /** Work points a city earns per work period (manual quota). */
  manualPointsPerPeriod: 2,
  /** Days in a work period. */
  periodDays: 10,
  /** Unused work points carry over up to one month's worth (three periods). */
  bankMaxPoints: 6,
  /** Periods per month used to convert legacy month budgets. */
  periodsPerMonth: 3,
  /** Gold cost of rewarding one officer. */
  rewardGold: 100,
  /** Gold cost of issuing fine arms to one officer. */
  equipmentGold: 180,
  relief: {
    /** Gold cost of relief. */
    gold: 80,
    /** Food cost of relief. */
    food: 600,
    /** City loyalty gained. */
    loyaltyGain: 15,
    /** Relief settles this many people: about a year to repay its cost in tax (PF-RL-02). */
    population: 1500,
  },
  trade: {
    /** Food moved by one market trade at ten food per gold. */
    food: 2000,
    /** Gold moved by one market trade. */
    gold: 200,
  },
  /** Days a capital task occupies the officer who carries it out. */
  busyDays: {
    developFarming: 10,
    developCommerce: 10,
    train: 10,
    recruit: 5,
    security: 5,
    relieve: 5,
    search: 5,
    buyFood: 2,
    sellFood: 2,
  },
  /** City loyalty lost when soldiers are recruited. */
  recruitLoyaltyLoss: 2,
  security: {
    /** City loyalty gained by security work. */
    loyaltyBase: 8,
    /** Manager intellect divided by this adds loyalty. */
    intellectDivisor: 20,
  },
  develop: {
    /** Farming gained by one development action. */
    farmingGain: 20,
    /** Commerce gained by one development action. */
    commerceGain: 10,
    /** Farming and commerce cannot be developed past this. */
    cap: 500,
    /** City loyalty gained by the legacy restore-loyalty action. */
    legacyLoyaltyGain: 2,
  },
  equip: {
    /** Force gained from fine arms. */
    forceGain: 5,
    /** Force limit with fine arms. */
    forceCap: 105,
  },
  /** Force limit of an officer without fine arms. */
  baseForceCap: 100,
  training: {
    /** Experience gained by one training action. */
    experienceGain: 25,
    /** Experience for each officer level. */
    experiencePerLevel: 100,
    /** Highest officer level. */
    maxLevel: 5,
    /** Highest officer experience from training. */
    experienceCap: 500,
    /** Force gained on each level. */
    forcePerLevel: 2,
    /** Intellect gained on each level by archers. */
    archerIntellectPerLevel: 2,
  },
  search: {
    /** Base chance in percent that a search finds an officer. */
    baseChance: 40,
    /** Manager intellect divided by this adds to the chance. */
    intellectDivisor: 2,
    /** Loyalty of a found officer is this plus a random value below `loyaltySpan`. */
    joinLoyaltyBase: 65,
    /** Number of distinct found-officer loyalty rolls. */
    joinLoyaltySpan: 16,
  },
  /** Loyalty gained by a feast. */
  feastLoyaltyGain: 8,
  /** Loyalty gained by a reward. */
  rewardLoyaltyGain: 15,
} as const);
