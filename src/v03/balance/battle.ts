import { deepFreeze } from './freeze';

/** Core tactical-battle numbers: day limits, the normal-attack formula, terrain, water and experience. */
export const BATTLE = deepFreeze({
  dayLimit: {
    /** Day limit of a conquest battle (battle/types.ts). */
    conquest: 30,
    /** Day limit of a raid (was 10 until PF-RL-10). */
    raid: 14,
  },
  damage: {
    /** Share of the attacking formation's troops lost by the target on an even exchange. */
    coefficient: 0.3,
    /** Added to the attacker's force in the force ratio (numerator). */
    forceOffsetSource: 55,
    /** Added to the target's force in the force ratio (denominator). */
    forceOffsetTarget: 65,
    /** Constant part of the attacker morale term: 0.65 + morale / 170. */
    moraleBase: 0.65,
    /** Divisor of the attacker's morale in the morale term. */
    moraleDivisor: 170,
    /** A normal hit never deals fewer troops of damage than this. */
    floor: 20,
    /** Damage multiplier of cavalry against archers. */
    cavalryVsArcher: 1.3,
    /** Damage multiplier of infantry against cavalry. */
    infantryVsCavalry: 1.2,
    /** Damage multiplier of archers against infantry. */
    archerVsInfantry: 1.15,
    /** Damage multiplier of an attacker whose morale is below the wavering line. */
    wavering: 0.85,
    /** Damage multiplier against a routed target. */
    routedTarget: 1.2,
    /** Damage multiplier of an inspired (rallied) attacker. */
    inspired: 1.2,
  },
  moraleLoss: {
    /** Most morale a single hit can take away. */
    cap: 45,
    /** Morale lost per whole target formation of casualties: ceil(fraction * this). */
    perCasualtyFraction: 55,
  },
  terrain: {
    /** Damage multiplier against a target standing on a hill. */
    hillDefense: 0.8,
    /** Damage multiplier against a target standing in a forest. */
    forestDefense: 0.82,
    /** Fire damage multiplier against a target standing in a forest. */
    forestFire: 1.4,
  },
  water: {
    /** Attack multiplier of a unit standing on water. */
    attack: 0.75,
    /** Damage multiplier against a target standing on water. */
    incomingDamage: 1.25,
  },
  movement: {
    /** Movement points per day: infantry. */
    budgetInfantry: 3,
    /** Movement points per day: cavalry. */
    budgetCavalry: 5,
    /** Movement points per day: archers. */
    budgetArcher: 3,
    /** Cost of entering forest or hill for cavalry. */
    roughCostCavalry: 3,
    /** Cost of entering forest or hill for infantry and archers. */
    roughCostOther: 2,
    /** Least cost of any step that touches water. */
    waterStepMinimum: 2,
  },
  /** Facing (B-02): damage multipliers by the aspect of a hit, and the counterattack that survives it. */
  facing: {
    flank: 1.25,
    rear: 1.5,
    counterFlank: 0.5,
    counterRear: 0,
  },
  /** Charge (B-03). */
  charge: {
    /** Plain cells in a straight line a cavalry formation must cross before its attack counts as a charge. */
    minRun: 3,
  },
  /**
   * Per-arm numbers added by F-02. Used by B-03 (charge, brace and archer melee);
   * referenced from content/units.ts only.
   */
  arms: {
    /** Multiplier on melee damage taken: infantry, cavalry, archer. */
    meleeIncomingInfantry: 1,
    meleeIncomingCavalry: 1,
    meleeIncomingArcher: 1.3,
    /** Cavalry charge damage multiplier. */
    chargeCavalry: 1.3,
    /** Infantry brace counterattack multiplier. */
    braceInfantry: 1.2,
  },
  troopExperience: {
    /** Attack bonus per soldier level above the first. */
    attackPerLevel: 0.02,
    /** Damage reduction per soldier level above the first, for the defender. */
    defensePerLevel: 0.01,
  },
  experienceGain: {
    /** Soldier XP for a formation that fought. */
    base: 40,
    /** Extra XP scaled by the share of its starting troops it killed. */
    perCasualtyShare: 80,
    /** Extra XP for the winning side. */
    victory: 20,
  },
  hunger: {
    /** Share of troops and wounded lost for each day without rations. */
    dailyLossFraction: 0.01,
    /** Morale lost for each day without rations. */
    moraleLoss: 5,
  },
  roster: {
    /** Soldier experience limit accepted for a roster entry. */
    experienceLimit: 1900,
    /** Force limit accepted for a roster entry. */
    forceLimit: 120,
    /** Intellect limit accepted for a roster entry. */
    intellectLimit: 120,
    /** Officer level limit accepted for a roster entry. */
    levelLimit: 5,
    /** Intellect assumed when a roster entry has none. */
    defaultIntellect: 40,
    /** Attack range of archers by default. */
    archerRange: 3,
  },
  /** Most battle log lines kept. */
  logCap: 250,
} as const);
