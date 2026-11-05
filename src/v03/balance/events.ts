import { deepFreeze } from './freeze';

/** Monthly random events: chance in percent per month, then effects. */
export const EVENTS = deepFreeze({
  plague: {
    /** Chance in percent each month. */
    chance: 3,
    /** Share of population lost. */
    populationLoss: 0.08,
    /** City loyalty lost. */
    loyaltyLoss: 3,
    /** Population never falls below this. */
    populationFloor: 500,
  },
  bumperHarvest: {
    /** Chance in percent in harvest months. */
    chance: 12,
    /** Food gained per farming point. */
    foodPerFarming: 5,
  },
  locusts: {
    /** Chance in percent in summer. */
    chance: 6,
    /** Share of food lost. */
    foodLoss: 0.25,
  },
  bandits: {
    /** Chance in percent each month. */
    chance: 4,
    /** Share of gold stolen. */
    goldLoss: 0.12,
    /** Share of each reserve pool that remains. */
    reserveRetained: 0.94,
    /** City loyalty lost. */
    loyaltyLoss: 2,
  },
  wanderingOfficer: {
    /** Chance in percent each month. */
    chance: 5,
  },
  comeOfAge: {
    /** Age at which officers mature each January. */
    age: 18,
    /** Force limit with fine arms. */
    forceCapFineArms: 105,
    /** Force limit without. */
    forceCap: 100,
    /** Intellect limit. */
    intellectCap: 100,
  },
  festival: {
    /** Chance in percent in the first two months of the year. */
    chance: 8,
    /** Gold cost. */
    goldCost: 150,
    /** City loyalty gained. */
    loyaltyGain: 6,
  },
  drought: {
    /** Chance in percent in summer. */
    chance: 4,
    /** Farming lost (at most the city's farming). */
    farmingLoss: 15,
  },
  scholar: {
    /** Chance in percent each month. */
    chance: 3,
    /** Intellect gained. */
    intellectGain: 1,
    /** Officers at this intellect or above are not eligible. */
    intellectLimit: 100,
  },
  coalition: {
    /** Months a coalition invitation lasts. */
    invitationMonths: 3,
    /** The anti-Dong coalition forms in or before this year. */
    lastYear: 191,
    /** Houses besides Dong needed for it to form. */
    minMembers: 3,
  },
  evacuation: {
    /** Dong evacuates Luoyang when a neighbour has more than this multiple of its strength. */
    neighborStrengthRatio: 1.8,
    /** Gold looted per point of the leader's intellect plus force. */
    goldPerPower: 2,
    /** Gold looted per commerce point. */
    goldPerCommerce: 1.5,
    /** Food looted per point of the leader's intellect plus force. */
    foodPerPower: 5,
    /** Food looted per farming point. */
    foodPerFarming: 4,
    /** City loyalty, farming and commerce are divided by this. */
    damageDivisor: 2,
    /** Share of population left. */
    populationRetained: 0.92,
    /** Population is never reduced below this. */
    populationFloor: 500,
    /** Intellect and force assumed when no officer is left to lead. */
    defaultLeaderStat: 60,
  },
} as const);
