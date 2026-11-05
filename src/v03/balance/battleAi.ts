import { deepFreeze } from './freeze';

/** Battle AI valuations. These are casualty-equivalent preferences, not win probabilities. */
export const BATTLE_AI = deepFreeze({
  value: {
    /** Weight of the damage a formation takes back, against damage it deals. */
    retaliation: 1.1,
    /** Worth of removing (or losing) a whole formation. */
    formation: 80,
    /** Worth of each wounded man of a destroyed formation. */
    wounded: 0.15,
    /** Exposure worth of a formation that the next enemy reply could destroy. */
    formationLossExposure: 80,
    /** Worth of pushing a target into rout. */
    rout: 50,
    /** Value of one day of tactic-point recovery. */
    pointRecoveryDay: 24,
    /** Most the wounded of a destroyed formation can add. */
    woundedFinishCap: 200,
    /** Weight of a wounded man when counting people at risk or at stake. */
    woundedWeight: 0.6,
    /** Share of a possible later exchange counted when no shot exists yet. */
    noShotDiscount: 0.35,
    /** Extra cost multiplier on tactic points when few remain after paying. */
    pointScarcity: 1.5,
    /** Bonus for ending the battle by destroying the last enemy formation. */
    battleEndBonus: 500,
    /** Share of own healthy troops counted as saved when the battle ends. */
    battleEndTroopWeight: 0.5,
  },
  temperament: {
    /** Divisor of force minus intellect in the cautious-to-aggressive scale. */
    forceIntellectDivisor: 60,
    /** Aggression added by the fierce trait. */
    fierceBonus: 0.35,
    /** Intellect that is neutral for tactic appetite. */
    appetiteIntellectBase: 60,
    /** Divisor of intellect above the base in the appetite scale. */
    appetiteIntellectDivisor: 40,
    /** Appetite added by the cunning trait. */
    cunningBonus: 0.25,
    /** Weight of next-exchange exposure for a balanced leader. */
    exposureBase: 0.65,
    /** Temperament swing of the exposure weight. */
    exposureSwing: 0.35,
    /** Share of a tactic's point cost removed at full appetite. */
    appetiteCostSwing: 0.3,
  },
  preserve: {
    /** Extra weight on avoiding retaliation, at maximum soldier experience. */
    experience: 0.2,
  },
  rally: {
    /** Rally value when the target already acted or is the caster, before the last day. */
    spentTargetOpportunity: 0.45,
    /** Weight of a wounded man in the restored-morale value. */
    woundedWeight: 0.3,
    /** Scale of the restored-morale value. */
    moraleScale: 0.3,
    /** Value per troop of lifting a formation out of rout. */
    routRecovery: 0.08,
  },
  raidSupply: {
    /** Most days of hunger considered. */
    horizonDays: 10,
    /** Value of each person-day of hunger caused or relieved. */
    personDayValue: 0.012,
  },
  confuse: {
    /** Weight of protecting allies in the movement search. */
    allyProtection: 0.65,
  },
  blocking: {
    /** Penalty for boxing in an ally that would have one exit or none. */
    boxedIn: 80,
    /** Penalty for leaving an ally two exits. */
    narrowExit: 15,
  },
  urgency: {
    /** Share of the day limit in which a side that is behind starts pressing (PF-BA-02). */
    limitFraction: 0.3,
    /** The pressing period is at least this many days. */
    minDays: 3,
    /** Bonus on damage dealt when pressing. */
    bonus: 0.15,
  },
  approach: {
    /** Least value of one full move toward contact. */
    floor: 40,
    /** Share of the best normal hit that a full move toward contact is worth. */
    hitFraction: 0.9,
    /** Temperament swing of the approach value. */
    temperamentSwing: 0.3,
    /** A side that is not behind stops advancing hard in the last days of the limit. */
    finalDays: 3,
    /** Approach multiplier in those final days. */
    finalDaysFactor: 0.5,
  },
  /** Value per step of getting a routed formation nearer its rescuer. */
  rescueStep: 35,
  /** Destination cells given a full action comparison. */
  shortlist: 6,
  /** Cost of each movement point spent, as a tiebreak. */
  moveCost: 0.1,
  regret: {
    /** Most regret that raises a unit's turn priority. */
    cap: 200,
    /** Weight of regret in the turn priority. */
    weight: 0.5,
  },
  withdrawal: {
    /** AI withdraws when its troops fall to this percent of its opening strength... */
    openingPercent: 30,
    /** ...and to this percent of the enemy's current troops. */
    enemyPercent: 50,
  },
} as const);
