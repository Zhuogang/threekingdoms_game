import { deepFreeze } from './freeze';

/** City production, upkeep, logistics, shortage penalties, conquest and plunder. */
export const ECONOMY = deepFreeze({
  /** Highest stock of food, gold or reserve a city can hold. */
  resourceCap: 9_999_999,
  production: {
    /** Food per farming point in an ordinary month. */
    foodPerFarming: 2.2,
    /** Food per farming point in the harvest month. */
    foodPerFarmingHarvest: 4,
    /** Calendar month of the harvest. */
    harvestMonth: 9,
    /** Population divided by this adds food. */
    foodPopulationDivisor: 80,
    /** Population divided by this adds gold. */
    goldPopulationDivisor: 150,
    /** Gold per commerce point. */
    goldPerCommerce: 0.55,
    /** Constant part of the loyalty multiplier on gold: 0.8 + loyalty / 500. */
    goldLoyaltyBase: 0.8,
    /** Divisor of loyalty in the loyalty multiplier on gold. */
    goldLoyaltyDivisor: 500,
  },
  /** Gold upkeep per soldier-month. */
  goldUpkeepPerTroopMonth: 0.025,
  logistics: {
    /** Food a soldier eats per day in a city. */
    cityFoodPerTroopDay: 0.004,
    /** Food a soldier eats per day on the march. */
    travelFoodPerTroopDay: 0.008,
    /** Food a soldier eats per day in battle. */
    battleFoodPerTroopDay: 0.04,
  },
  shortage: {
    /** City loyalty lost when the monthly food bill cannot be paid. */
    foodCityLoyaltyLoss: 8,
    /** Share of troops, reserves, sources and captives that stay after a food shortage. */
    foodTroopsRetained: 0.85,
    /** Loyalty each serving officer loses in a food shortage. */
    foodOfficerLoyaltyLoss: 4,
    /** Loyalty each serving officer loses when the gold bill cannot be paid. */
    goldOfficerLoyaltyLoss: 3,
  },
  conquest: {
    /** Highest city loyalty after a conquest. */
    loyaltyCap: 50,
    /** Highest city loyalty after a conquest by a benevolent ruler. */
    benevolentLoyaltyCap: 60,
  },
  plunder: {
    /** Gold taken per point of the leader's force plus intellect. */
    goldPerPower: 2,
    /** Gold taken per commerce point. */
    goldPerCommerce: 1.5,
    /** Food taken per point of the leader's force plus intellect. */
    foodPerPower: 5,
    /** Food taken per farming point. */
    foodPerFarming: 4,
    /** City loyalty, farming and commerce are divided by this. */
    damageDivisor: 2,
    /** Share of population left. */
    populationRetained: 0.92,
    /** Population is never reduced below this (unless already lower). */
    populationFloor: 500,
    /** Days before the city can be plundered again. */
    cooldownDays: 90,
  },
} as const);
