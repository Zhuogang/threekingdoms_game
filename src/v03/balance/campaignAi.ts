import { deepFreeze } from './freeze';

/** Governor autonomy, ruler temperament, strategic AI scoring, diplomacy and hegemony. */
export const CAMPAIGN_AI = deepFreeze({
  autonomy: {
    /** Least food a governor keeps untouched. */
    protectedFoodFloor: 500,
    /** Protected food is at least this many months of upkeep. */
    protectedUpkeepMonths: 2,
    /** City loyalty below which relief is offered first. */
    reliefLoyaltyBelow: 60,
    /** City loyalty below which security is offered. */
    securityLoyaltyBelow: 70,
    /** Officer loyalty below which a reward is offered. */
    rewardLoyaltyBelow: 55,
    /** Reserve troops kept back when organizing officers in peace. */
    reserveKeep: 1000,
    /** Fewest ready soldiers that justify organizing a zero-army officer. */
    newcomerMinReady: 100,
    /** Most soldiers given to a zero-army officer. */
    newcomerMaxTroops: 500,
    /** Reserve below which the manager's troop type is replenished. */
    replenishBelow: 500,
    /** Gold above the reserved gold below which surplus food is sold. */
    sellFoodGoldMargin: 80,
    /** Settlements compared when choosing what to develop. */
    developHorizonMonths: 3,
    /** Food counts as one gold per this many food when comparing development. */
    foodPerGold: 10,
  },
  temperament: {
    /** Neutral least force ratio for a conquest departure. */
    neutralAdmissionRatio: 0.8,
    /** Neutral highest tolerated home-risk ratio. */
    neutralHomeRiskLimit: 0.9,
    /** Fierce rulers accept this least force ratio. */
    fierceAdmissionRatio: 0.7,
    /** Benevolent rulers demand this least force ratio. */
    benevolentAdmissionRatio: 0.95,
    /** Fierce rulers tolerate this home-risk ratio. */
    fierceHomeRiskLimit: 1.1,
    /** Weight of expected losses for cunning rulers. */
    cunningLossWeight: 2,
    /** Weight of expected losses otherwise. */
    defaultLossWeight: 1,
    /** Least force ratio for a raid by a fierce or greedy ruler. */
    raidRatio: 0.5,
  },
  strategic: {
    /** Most officers in one campaign party. */
    maxOfficersPerParty: 10,
    /** A raid takes no city: it scores this share of a conquest. */
    raidScoreFactor: 0.5,
    /** A city lost by conquest stays a priority this many days. */
    recentLossDays: 360,
    /** Highest target value bonus. */
    maxTargetValue: 0.5,
    /** Population divided by this counts toward a city's wealth. */
    wealthPopulationDivisor: 1000,
    /** Farming divided by this counts toward a city's wealth. */
    wealthFarmingDivisor: 2,
    /** Target bonus for the hegemon's capital. */
    capitalBonus: 0.25,
    /** Target bonus for a recently lost city. */
    recentLossBonus: 0.25,
    /** Target bonus for the leading house's cities. */
    leaderBonus: 0.2,
    /** Largest target bonus for a rich city, for greedy rulers. */
    wealthBonus: 0.25,
    /** Slope of the wealth bonus above the mean wealth. */
    wealthSlope: 4,
    /** Target bonus for an isolated city, for cunning rulers. */
    isolationBonus: 0.15,
    /** Share of a source garrison that stays home... */
    garrisonFraction: 0.35,
    /** ...up to this many troops. */
    garrisonCap: 1000,
    /** Small party size relative to the defenders. */
    smallPartyRatio: 1.2,
    /** Balanced party size relative to the defenders. */
    balancedPartyRatio: 1.6,
    score: {
      /** Value of one city before discounts. */
      cityValue: 1000,
      /** Expected losses are divided by this. */
      lossDivisor: 1000,
      /** Food carried is divided by this. */
      foodDivisor: 10000,
      /** Troops committed are divided by this. */
      troopDivisor: 10000,
      /** Travel days are divided by this. */
      dayDivisor: 30,
      /** Weight of home risk. */
      homeRiskWeight: 0.5,
    },
    /** Candidate targets examined per source city. */
    optionsExamined: 3,
    /** A retained plan stays unless the best new plan scores more than this share of it. */
    retainShare: 0.8,
  },
  diplomacy: {
    /** A broken treaty weighs on every later proposal for this many months. */
    treatyBreakMonths: 24,
    /** Armies this close to their target when a treaty is signed press on. */
    recallMinDays: 5,
    /** Base acceptance points. */
    baseChance: 40,
    /** The proposer's intellect divided by this adds points. */
    intellectDivisor: 2,
    /** Points: a shared border with the strongest house. */
    commonEnemy: 20,
    /** Points: the target is the strongest house. */
    targetStrongest: -30,
    /** Points: the proposer is the strongest house. */
    playerStrongest: -30,
    /** Points: the target has an army marching on the proposer. */
    armyMarching: -30,
    /** Points: the proposer recently broke a treaty. */
    treatyBroken: -30,
    /** Points: the target ruler is benevolent. */
    benevolentRuler: 10,
    /** Points: the target ruler is fierce. */
    fierceRuler: -10,
    /** Points: the proposer is a small house. */
    smallHouse: 15,
    /** A house with at most this many cities is small. */
    smallHouseCities: 2,
    /** Lowest acceptance chance in percent. */
    minChance: 5,
    /** Highest acceptance chance in percent. */
    maxChance: 90,
  },
  /** Months an alliance lasts. */
  allianceDurationMonths: 6,
  hegemon: {
    /** Cities a house must hold to claim hegemony. */
    cities: 16,
    /** Months the claim must be held. */
    holdMonths: 12,
  },
} as const);
