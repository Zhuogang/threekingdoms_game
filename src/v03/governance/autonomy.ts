import { recruitmentQuote } from '../campaign/recruitment';
import type { V03City, V03GameState } from '../types';
import {
  CITY_MONTHLY_WORK_GOLD_COST,
  GOVERNOR_EQUIPMENT_GOLD_COST,
  GOVERNOR_RELIEF_FOOD_COST,
  GOVERNOR_RELIEF_GOLD_COST,
  GOVERNOR_REWARD_GOLD_COST,
  applyGovernorCityAction,
  cityWorkQuota,
  cityWorkUsedThisMonth,
} from './city-actions';

export type GovernorWorkAction =
  | 'restore-loyalty'
  | 'develop-farming'
  | 'develop-commerce'
  | 'security'
  | 'recruit'
  | 'buy-food'
  | 'sell-food'
  | 'search'
  | 'train'
  | 'feast'
  | 'reward'
  | 'relieve'
  | 'equip'
  | 'assign-troops';

export type GovernorWorkReasonCode =
  | 'food-security'
  | 'economic-balance'
  | 'manager-unavailable'
  | 'city-threatened'
  | 'monthly-work-spent'
  | 'low-loyalty'
  | 'public-order'
  | 'reserve-recruitment'
  | 'market-balance'
  | 'local-search'
  | 'officer-training'
  | 'officer-loyalty'
  | 'officer-reward'
  | 'equipment-issue'
  | 'population-relief'
  | 'troop-organization'
  | 'approved-order-reserve'
  | 'insufficient-budget'
  | 'development-capped';

export interface GovernorMonthlyWorkPlan {
  cityId: string;
  month: number;
  managerOfficerId: string | null;
  managerIntellectAtPlan: number;
  targetOfficerId: string | null;
  targetOfficerExperienceAtPlan: number;
  targetOfficerForceAtPlan: number;
  targetOfficerLoyaltyAtPlan: number;
  targetOfficerEquipmentAtPlan: 'Fine arms' | null;
  targetTroops: number | null;
  neutralOfficerIdsAtPlan: string[];
  rngAtPlan: number;
  action: GovernorWorkAction | null;
  workPoints: number;
  goldCost: number;
  foodCost: number;
  protectedFood: number;
  reservedGold: number;
  reservedFood: number;
  reservedTroops: number;
  projectedNextMonthFood: number;
  workMonthIndex: number;
  workPointsUsedAtPlan: number;
  farmingAtPlan: number;
  commerceAtPlan: number;
  goldAtPlan: number;
  foodAtPlan: number;
  loyaltyAtPlan: number;
  populationAtPlan: number;
  reserveAtPlan: number;
  garrisonAtPlan: number;
  managerForceAtPlan: number;
  reasonCode: GovernorWorkReasonCode;
  reason: string;
}

export interface GovernorMonthlyWorkResult {
  applied: boolean;
  city: V03City | null;
  state?: V03GameState;
  reason: string;
}

const LOYALTY_RECOVERY_THRESHOLD = 50;
const MONTHLY_LOYALTY_RECOVERY = 2;
const RESOURCE_CAP = 9_999_999;

function localManager(state: Readonly<V03GameState>, city: V03City): string | null {
  const localOfficers = state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === city.factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    )
    .sort((a, b) => b.intellect - a.intellect || a.id.localeCompare(b.id));
  const appointed = city.governorId
    ? localOfficers.find((officer) => officer.id === city.governorId)
    : undefined;
  return appointed?.id ?? localOfficers[0]?.id ?? null;
}

function hasIncomingThreat(state: Readonly<V03GameState>, city: V03City): boolean {
  const hostileJourneys = state.journeys.some(
    (journey) =>
      journey.ownerFactionId !== city.factionId &&
      journey.destinationCityId === city.id &&
      (journey.status === 'outbound' || journey.status === 'waiting'),
  );
  const activeBattle = state.battles.some((battle) => {
    if (!battle.active) return false;
    const attackerJourney = state.journeys.find(
      (journey) => journey.id === battle.attackerJourneyId,
    );
    return attackerJourney?.destinationCityId === city.id;
  });
  return hostileJourneys || activeBattle;
}

function approvedReserves(state: Readonly<V03GameState>, cityId: string) {
  const outstanding = (status: string, journeyId: string | null) =>
    journeyId === null && (status === 'accepted' || status === 'reserved');
  let gold = 0;
  let food = 0;
  let troops = 0;
  for (const order of state.requisitions) {
    if (order.sourceCityId !== cityId || !outstanding(order.status, order.journeyId)) continue;
    gold += order.proposed.gold;
    food += order.proposed.food;
    troops += order.proposed.troops;
  }
  for (const order of state.directives) {
    if (order.sourceCityId === cityId && outstanding(order.status, order.journeyId))
      troops += order.proposedTroops;
  }
  return { gold, food, troops };
}

function noWork(
  city: V03City,
  month: number,
  workMonthIndex: number,
  managerOfficerId: string | null,
  protectedFood: number,
  reservedGold: number,
  reservedFood: number,
  reservedTroops: number,
  projectedNextMonthFood: number,
  reasonCode: GovernorWorkReasonCode,
  reason: string,
): GovernorMonthlyWorkPlan {
  return {
    cityId: city.id,
    month,
    managerOfficerId,
    managerIntellectAtPlan: 0,
    targetOfficerId: null,
    targetOfficerExperienceAtPlan: 0,
    targetOfficerForceAtPlan: 0,
    targetOfficerLoyaltyAtPlan: 0,
    targetOfficerEquipmentAtPlan: null,
    targetTroops: null,
    neutralOfficerIdsAtPlan: [],
    rngAtPlan: 0,
    action: null,
    workPoints: 0,
    goldCost: 0,
    foodCost: 0,
    protectedFood,
    reservedGold,
    reservedFood,
    reservedTroops,
    projectedNextMonthFood,
    workMonthIndex,
    workPointsUsedAtPlan: 0,
    farmingAtPlan: city.farming,
    commerceAtPlan: city.commerce,
    goldAtPlan: city.gold,
    foodAtPlan: city.food,
    loyaltyAtPlan: city.loyalty,
    populationAtPlan: city.population,
    reserveAtPlan: city.reserve,
    garrisonAtPlan: city.garrisonTroops,
    managerForceAtPlan: 0,
    reasonCode,
    reason,
  };
}

/**
 * Plan one deterministic monthly city-work action for the city's local governor or steward.
 * Call only from monthly settlement; querying the plan never changes the campaign or RNG.
 */
export function planGovernorMonthlyWork(
  state: Readonly<V03GameState>,
  cityId: string,
  settledMonth: number,
): GovernorMonthlyWorkPlan {
  if (!Number.isInteger(settledMonth) || settledMonth < 1 || settledMonth > 12)
    throw new Error('settledMonth must be between 1 and 12.');
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city) throw new Error(`Unknown city ${cityId}.`);
  const managerOfficerId = localManager(state, city);
  const localTroops = state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === city.factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    )
    .reduce((sum, officer) => sum + officer.troops * (officer.troopType === 'cavalry' ? 2 : 1), 0);
  const monthlyFoodUpkeep = Math.ceil(localTroops * 0.12);
  const reserves = approvedReserves(state, city.id);
  const protectedFood = Math.max(500, monthlyFoodUpkeep * 2) + reserves.food;
  const nextMonth = (settledMonth % 12) + 1;
  const nextHarvest = Math.floor(city.farming * (nextMonth === 9 ? 4 : 2.2) + city.population / 80);
  const projectedNextMonthFood = Math.min(
    RESOURCE_CAP,
    city.food + nextHarvest - monthlyFoodUpkeep,
  );

  if (city.factionId === null || city.governanceMode === 'ruler')
    return noWork(
      city,
      settledMonth,
      state.monthIndex,
      managerOfficerId,
      protectedFood,
      reserves.gold,
      reserves.food,
      reserves.troops,
      projectedNextMonthFood,
      'manager-unavailable',
      'Directly ruled or unowned cities do not receive governor work.',
    );
  if (!managerOfficerId)
    return noWork(
      city,
      settledMonth,
      state.monthIndex,
      null,
      protectedFood,
      reserves.gold,
      reserves.food,
      reserves.troops,
      projectedNextMonthFood,
      'manager-unavailable',
      'No living officer is available in the city to organize monthly work.',
    );
  if (hasIncomingThreat(state, city))
    return noWork(
      city,
      settledMonth,
      state.monthIndex,
      managerOfficerId,
      protectedFood,
      reserves.gold,
      reserves.food,
      reserves.troops,
      projectedNextMonthFood,
      'city-threatened',
      'Monthly development is paused while a hostile force threatens the city.',
    );
  if (cityWorkUsedThisMonth(state, city) >= cityWorkQuota(state, city))
    return noWork(
      city,
      settledMonth,
      state.monthIndex,
      managerOfficerId,
      protectedFood,
      reserves.gold,
      reserves.food,
      reserves.troops,
      projectedNextMonthFood,
      'monthly-work-spent',
      'The city has used all work points staffed for this month.',
    );

  // Once food security, approved commitments and known threats are handled,
  // prioritize a struggling city over optional economic growth.
  const manager = state.officers.find((officer) => officer.id === managerOfficerId)!;
  const workUsed = cityWorkUsedThisMonth(state, city);
  const local = state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === city.factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const neutralOfficerIdsAtPlan = state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === null &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    )
    .map((officer) => officer.id)
    .sort();
  const trainee = local
    .filter(
      (officer) =>
        officer.troops > 0 &&
        officer.experience < 10_000 &&
        officer.force < (officer.equipment === 'Fine arms' ? 105 : 100),
    )
    .sort((a, b) => a.experience - b.experience || a.id.localeCompare(b.id))[0];
  const rewardTarget = local
    .filter((officer) => officer.loyalty < 55)
    .sort((a, b) => a.loyalty - b.loyalty || a.id.localeCompare(b.id))[0];
  const equipmentTarget = local
    .filter((officer) => officer.equipment !== 'Fine arms' && officer.force < 105)
    .sort((a, b) => b.troops - a.troops || b.force - a.force || a.id.localeCompare(b.id))[0];
  const needsFeast = local.some((officer) => officer.loyalty < 92);
  let targetOfficerId: string | null = null;
  let targetTroops: number | null = null;
  const action: GovernorWorkAction | null =
    projectedNextMonthFood < protectedFood
      ? city.farming < 500
        ? 'develop-farming'
        : 'buy-food'
      : city.loyalty < 60
        ? city.food >= protectedFood + GOVERNOR_RELIEF_FOOD_COST &&
          city.gold >= reserves.gold + GOVERNOR_RELIEF_GOLD_COST
          ? 'relieve'
          : city.loyalty < LOYALTY_RECOVERY_THRESHOLD
            ? 'restore-loyalty'
            : 'security'
        : city.loyalty < 70
          ? 'security'
          : rewardTarget && city.gold >= reserves.gold + GOVERNOR_REWARD_GOLD_COST
            ? ((targetOfficerId = rewardTarget.id), 'reward')
            : city.reservePools[manager.troopType].troops < 500 && city.population > 1000
              ? 'recruit'
              : city.food >= protectedFood + 800 && city.gold < reserves.gold + 80
                ? 'sell-food'
                : workUsed === 0 && needsFeast
                  ? 'feast'
                  : workUsed === 0 && neutralOfficerIdsAtPlan.length > 0
                    ? 'search'
                    : workUsed === 0 && trainee
                      ? ((targetOfficerId = trainee.id), 'train')
                      : workUsed === 0 &&
                          manager.troops < 10_000 &&
                          city.reservePools[manager.troopType].troops - reserves.troops > 1000
                        ? ((targetOfficerId = manager.id),
                          (targetTroops = Math.min(
                            10_000,
                            manager.troops +
                              city.reservePools[manager.troopType].troops -
                              reserves.troops -
                              1000,
                          )),
                          'assign-troops')
                        : city.farming < 500 && city.farming <= city.commerce
                          ? 'develop-farming'
                          : city.commerce < 500 && city.commerce < city.farming
                            ? 'develop-commerce'
                            : workUsed === 0 &&
                                equipmentTarget &&
                                city.gold >= reserves.gold + GOVERNOR_EQUIPMENT_GOLD_COST
                              ? ((targetOfficerId = equipmentTarget.id), 'equip')
                              : null;

  if (!action)
    return noWork(
      city,
      settledMonth,
      state.monthIndex,
      managerOfficerId,
      protectedFood,
      reserves.gold,
      reserves.food,
      reserves.troops,
      projectedNextMonthFood,
      'development-capped',
      'Farming and commerce are already at their current limits.',
    );

  const goldCost =
    action === 'recruit'
      ? recruitmentQuote(city, manager.force, manager.troopType).gold
      : action === 'restore-loyalty' ||
          action === 'develop-farming' ||
          action === 'develop-commerce' ||
          action === 'buy-food'
        ? CITY_MONTHLY_WORK_GOLD_COST
        : action === 'reward'
          ? GOVERNOR_REWARD_GOLD_COST
          : action === 'relieve'
            ? GOVERNOR_RELIEF_GOLD_COST
            : action === 'equip'
              ? GOVERNOR_EQUIPMENT_GOLD_COST
              : 0;
  const foodCost = action === 'relieve' ? GOVERNOR_RELIEF_FOOD_COST : 0;
  if (goldCost > 0 && city.gold < reserves.gold + goldCost)
    return noWork(
      city,
      settledMonth,
      state.monthIndex,
      managerOfficerId,
      protectedFood,
      reserves.gold,
      reserves.food,
      reserves.troops,
      projectedNextMonthFood,
      city.gold < goldCost ? 'insufficient-budget' : 'approved-order-reserve',
      city.gold < goldCost
        ? `The city cannot pay the ${goldCost}-gold monthly work cost.`
        : `Spending ${goldCost} gold would use resources reserved for an approved order.`,
    );
  if (foodCost > 0 && city.food < protectedFood + foodCost)
    return noWork(
      city,
      settledMonth,
      state.monthIndex,
      managerOfficerId,
      protectedFood,
      reserves.gold,
      reserves.food,
      reserves.troops,
      projectedNextMonthFood,
      'approved-order-reserve',
      `Spending ${foodCost} food would use the city’s protected reserve or an approved order.`,
    );

  const targetOfficer = targetOfficerId
    ? state.officers.find((officer) => officer.id === targetOfficerId)
    : undefined;

  return {
    cityId: city.id,
    month: settledMonth,
    managerOfficerId,
    managerIntellectAtPlan: manager.intellect,
    targetOfficerId,
    targetOfficerExperienceAtPlan: targetOfficer?.experience ?? 0,
    targetOfficerForceAtPlan: targetOfficer?.force ?? 0,
    targetOfficerLoyaltyAtPlan: targetOfficer?.loyalty ?? 0,
    targetOfficerEquipmentAtPlan: targetOfficer?.equipment === 'Fine arms' ? 'Fine arms' : null,
    targetTroops,
    neutralOfficerIdsAtPlan: action === 'search' ? neutralOfficerIdsAtPlan : [],
    rngAtPlan: state.rng,
    action,
    workPoints: 1,
    goldCost,
    foodCost,
    protectedFood,
    reservedGold: reserves.gold,
    reservedFood: reserves.food,
    reservedTroops: reserves.troops,
    projectedNextMonthFood,
    workMonthIndex: state.monthIndex,
    workPointsUsedAtPlan: workUsed,
    farmingAtPlan: city.farming,
    commerceAtPlan: city.commerce,
    goldAtPlan: city.gold,
    foodAtPlan: city.food,
    loyaltyAtPlan: city.loyalty,
    populationAtPlan: city.population,
    reserveAtPlan: city.reserve,
    garrisonAtPlan: city.garrisonTroops,
    managerForceAtPlan: manager.force,
    reasonCode:
      action === 'restore-loyalty'
        ? 'low-loyalty'
        : action === 'security'
          ? 'public-order'
          : action === 'recruit'
            ? 'reserve-recruitment'
            : action === 'sell-food'
              ? 'market-balance'
              : action === 'search'
                ? 'local-search'
                : action === 'train'
                  ? 'officer-training'
                  : action === 'feast'
                    ? 'officer-loyalty'
                    : action === 'reward'
                      ? 'officer-reward'
                      : action === 'relieve'
                        ? 'population-relief'
                        : action === 'equip'
                          ? 'equipment-issue'
                          : action === 'assign-troops'
                            ? 'troop-organization'
                            : projectedNextMonthFood < protectedFood
                              ? 'food-security'
                              : 'economic-balance',
    reason:
      action === 'restore-loyalty'
        ? `Loyalty is below ${LOYALTY_RECOVERY_THRESHOLD}; a monthly recovery effort improves it by ${MONTHLY_LOYALTY_RECOVERY}.`
        : action === 'security'
          ? 'Public order is below 70%; the city uses a work point to restore loyalty.'
          : action === 'recruit'
            ? `The city reserve is below 500; recruitment converts local population into up to ${recruitmentQuote(city, manager.force, manager.troopType).troops} reserve troops.`
            : action === 'buy-food'
              ? 'The next-month food forecast is below the protected reserve and farming is capped; the city buys 800 food.'
              : action === 'sell-food'
                ? 'The city holds 800 food above its protected reserve and needs gold for approved commitments.'
                : action === 'search'
                  ? 'A local neutral officer can be approached; only one search is attempted per month.'
                  : action === 'train'
                    ? `The city trains ${trainee?.name ?? 'a local officer'} using one work point.`
                    : action === 'feast'
                      ? 'Local officer loyalty is below 92%; one feast raises each local officer by up to 8.'
                      : action === 'reward'
                        ? `${targetOfficer?.name ?? 'A local officer'} is below 55 loyalty; a 100-gold reward adds up to 15.`
                        : action === 'relieve'
                          ? `City loyalty is below 60; the governor spends 80 gold and 600 food above the protected reserve to add up to 15 loyalty and 300 population.`
                          : action === 'equip'
                            ? `${targetOfficer?.name ?? 'A local officer'} lacks fine arms; issuing them costs 180 gold and adds up to 5 force, up to 105.`
                            : action === 'assign-troops'
                              ? `The manager receives ${Math.max(0, (targetTroops ?? 0) - manager.troops)} unreserved soldiers, leaving a 1,000-troop reserve and approved troop orders protected.`
                              : action === 'develop-farming'
                                ? projectedNextMonthFood < protectedFood
                                  ? 'The next-month food forecast is below the protected reserve, so farming is prioritized.'
                                  : 'Farming is the lower developed economic sector.'
                                : 'Commerce is the lower developed economic sector while the food reserve is protected.',
  };
}

/** Apply a still-current monthly work plan; stale previews and repeated application are rejected. */
export function applyGovernorMonthlyWork(
  state: Readonly<V03GameState>,
  plan: GovernorMonthlyWorkPlan,
): GovernorMonthlyWorkResult {
  const city = state.cities.find((entry) => entry.id === plan.cityId);
  if (!city) return { applied: false, city: null, reason: 'The city no longer exists.' };
  const current = planGovernorMonthlyWork(state, plan.cityId, plan.month);
  if (
    !plan.action ||
    current.action !== plan.action ||
    current.managerOfficerId !== plan.managerOfficerId ||
    current.managerIntellectAtPlan !== plan.managerIntellectAtPlan ||
    current.targetOfficerId !== plan.targetOfficerId ||
    current.targetOfficerExperienceAtPlan !== plan.targetOfficerExperienceAtPlan ||
    current.targetOfficerForceAtPlan !== plan.targetOfficerForceAtPlan ||
    current.targetOfficerLoyaltyAtPlan !== plan.targetOfficerLoyaltyAtPlan ||
    current.targetOfficerEquipmentAtPlan !== plan.targetOfficerEquipmentAtPlan ||
    current.targetTroops !== plan.targetTroops ||
    current.rngAtPlan !== plan.rngAtPlan ||
    current.neutralOfficerIdsAtPlan.join('|') !== plan.neutralOfficerIdsAtPlan.join('|') ||
    current.goldCost !== plan.goldCost ||
    current.foodCost !== plan.foodCost ||
    current.protectedFood !== plan.protectedFood ||
    current.reservedGold !== plan.reservedGold ||
    current.reservedFood !== plan.reservedFood ||
    current.reservedTroops !== plan.reservedTroops ||
    current.projectedNextMonthFood !== plan.projectedNextMonthFood ||
    current.farmingAtPlan !== plan.farmingAtPlan ||
    current.commerceAtPlan !== plan.commerceAtPlan ||
    current.goldAtPlan !== plan.goldAtPlan ||
    current.foodAtPlan !== plan.foodAtPlan ||
    current.loyaltyAtPlan !== plan.loyaltyAtPlan ||
    current.populationAtPlan !== plan.populationAtPlan ||
    current.reserveAtPlan !== plan.reserveAtPlan ||
    current.managerForceAtPlan !== plan.managerForceAtPlan ||
    current.workMonthIndex !== plan.workMonthIndex ||
    current.workPointsUsedAtPlan !== plan.workPointsUsedAtPlan ||
    current.garrisonAtPlan !== plan.garrisonAtPlan
  )
    return {
      applied: false,
      city: structuredClone(city),
      reason: 'The work plan is stale or has no action.',
    };

  const applied = applyGovernorCityAction(state as V03GameState, {
    cityId: city.id,
    action: plan.action,
    troopType: state.officers.find((o) => o.id === plan.managerOfficerId)?.troopType ?? 'infantry',
    officerId: plan.targetOfficerId ?? plan.managerOfficerId ?? undefined,
    amount: plan.targetTroops ?? undefined,
  });
  if (!applied.ok)
    return {
      applied: false,
      city: structuredClone(city),
      reason: applied.error ?? 'The city can no longer afford or apply this work action.',
    };
  return {
    applied: true,
    city: applied.state.cities.find((entry) => entry.id === city.id) ?? null,
    state: applied.state,
    reason: plan.reason,
  };
}
