import { deepFreeze } from './freeze';

/** Battle tactics: points, costs, requirements, ranges and effects. */
export const TACTICS = deepFreeze({
  points: {
    /** Most tactic points a side can hold. */
    cap: 30,
    /** Points regained each day. */
    regen: 2,
    /** Opening points are each non-militia officer's intellect divided by this, rounded down. */
    openingIntellectDivisor: 10,
  },
  /** Tactic point cost of each tactic (a cunning officer pays one less, at least 1). */
  cost: {
    fire: 4,
    confuse: 3,
    // 2 until PF-RL-12: at the daily regeneration of 2 it was free upkeep.
    rally: 3,
    raidSupply: 4,
    ambush: 3,
    rockfall: 4,
  },
  requirement: {
    /** Intellect needed for Fire. */
    fire: 60,
    /** Intellect needed for Confuse. */
    confuse: 70,
    /** Intellect needed for Rally. */
    rally: 50,
    /** Force that qualifies for Rally in place of intellect. */
    rallyForce: 85,
    /** Intellect needed for Raid supplies (cavalry qualify regardless). */
    raidSupply: 60,
    /** Intellect needed for Ambush. */
    ambush: 60,
    /** Intellect needed for Rockfall. */
    rockfall: 65,
    /** Officer level from which every intellect requirement is reduced. */
    veteranLevel: 3,
    /** Reduction of every intellect requirement for veteran officers. */
    veteranReduction: 10,
  },
  range: {
    /** Range of general tactics. */
    base: 2,
    /** Range of general tactics for archers and high-intellect officers. */
    long: 3,
    /** Intellect that gives the long range. */
    longIntellect: 80,
    /** Ambush and Rockfall never reach farther than this. */
    groundTacticMax: 2,
  },
  fire: {
    /** Share of the caster's troops dealt as damage (PF-RL-12). */
    coefficient: 0.21,
    /** Fire never deals less than this. */
    floor: 12,
    /** Added to the caster's intellect in the intellect ratio. */
    intellectOffsetSource: 30,
    /** Added to the target's intellect in the intellect ratio. */
    intellectOffsetTarget: 55,
    /** Lowest intellect ratio used by Fire and Rockfall. */
    ratioFloor: 0.35,
    /** Forecast variation: lowest. */
    variationMin: 0.9,
    /** Forecast variation: highest. */
    variationMax: 1.1,
    /** Resolution variation is (rollBase + random below rollSpan) / 100. */
    rollBase: 90,
    /** Number of distinct variation rolls. */
    rollSpan: 21,
    /** Fire multiplier in rain. */
    rainMultiplier: 0.4,
    /** Fire multiplier in wind. */
    windMultiplier: 1.25,
  },
  rockfall: {
    /** Share of the caster's troops dealt as damage (PF-RL-12). */
    coefficient: 0.18,
    /** Morale the target loses. */
    moraleLoss: 10,
  },
  ambush: {
    /** Multiplier on a normal hit. */
    multiplier: 1.4,
    /** Forecast variation: lowest. */
    variationMin: 0.88,
    /** Forecast variation: highest. */
    variationMax: 1.12,
    /** Resolution variation is (rollBase + random below rollSpan) / 100. */
    rollBase: 88,
    /** Number of distinct variation rolls. */
    rollSpan: 25,
  },
  raidSupply: {
    /** Least food seized (capped by the target's stock). */
    minimum: 100,
    /** Share of the target's troops seized as food when above the minimum. */
    troopFraction: 0.5,
    /** The raider keeps the seized food divided by this, rounded down. */
    keptDivisor: 2,
  },
  rally: {
    /** Morale restored before the intellect bonus. */
    base: 15,
    /** Intellect divided by this adds morale. */
    intellectDivisor: 5,
  },
  confuse: {
    /** Base success chance in percent. */
    base: 55,
    /** Lowest success chance in percent. */
    min: 20,
    /** Highest success chance in percent. */
    max: 90,
  },
} as const);
