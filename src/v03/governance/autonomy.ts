import { cityProduction, forecastCityEconomy } from '../campaign/economy';
import { incomingCampaignThreats } from '../ai/campaign-threats';
import { recruitmentQuote } from '../campaign/recruitment';
import { DAYS_PER_MONTH, PILOT_LOGISTICS_RATES } from '../calendar';
import { availableReserveTroops, cityPersonnelSummary } from '../campaign/personnel';
import type { V03City, V03GameState } from '../types';
import type { TroopType } from '../content/types';
import { isCityCommitted, isOfficerReservedForOrder } from './commitments';
import {
  CITY_MONTHLY_WORK_GOLD_COST,
  GOVERNOR_EQUIPMENT_GOLD_COST,
  GOVERNOR_RELIEF_FOOD_COST,
  GOVERNOR_RELIEF_GOLD_COST,
  GOVERNOR_REWARD_GOLD_COST,
  applyGovernorCityAction,
  applyNpcCapitalCityAction,
  applySharedCityWorkEffect,
  automaticTalentWorkUsed,
  committedCityStock,
  getAutomaticCityActionAvailability,
  hasTrainingBenefit,
  localSearchCandidates,
  cityWorkQuota,
  cityActionWorkCost,
  cityWorkUsedThisPeriod,
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
  factionId: string | null;
  npcCapital: boolean;
  troopType: TroopType;
  firstAssignment: boolean;
  snapshot: string;
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
  projectedFoodAfterWork: number;
  projectedGoldAfterWork: number;
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

const MONTHLY_FOOD_RATE = DAYS_PER_MONTH * PILOT_LOGISTICS_RATES.cityFoodPerTroopDay;

/** One deterministic action; both NPC capitals and local governors share city budgets. */
export function planGovernorMonthlyWork(
  state: Readonly<V03GameState>,
  cityId: string,
  settledMonth?: number,
): GovernorMonthlyWorkPlan {
  // Retain the old call signature, but never use its ambiguous month hint in forecasts.
  if (
    settledMonth !== undefined &&
    (!Number.isInteger(settledMonth) || settledMonth < 1 || settledMonth > 12)
  )
    throw new Error('settledMonth must be between 1 and 12.');
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city) throw new Error('Unknown city ' + cityId + '.');
  const faction = state.factions.find((entry) => entry.id === city.factionId);
  const npcCapital = Boolean(
    faction &&
    !faction.eliminated &&
    !faction.isPlayer &&
    faction.id !== state.playerFactionId &&
    faction.capitalCityId === city.id &&
    city.governanceMode === 'ruler',
  );
  const local = state.officers
    .filter(
      (officer) =>
        city.factionId !== null &&
        officer.alive &&
        officer.factionId === city.factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    )
    .sort((a, b) => b.intellect - a.intellect || a.id.localeCompare(b.id));
  const manager =
    local.find((officer) => officer.id === city.governorId) ??
    (npcCapital ? local.find((officer) => officer.id === faction?.leaderOfficerId) : undefined) ??
    local[0];
  const reserves = committedCityStock(state, city.id);
  const upkeep = Math.ceil(cityPersonnelSummary(state, city.id).foodHeadcount * MONTHLY_FOOD_RATE);
  const protectedFood = Math.max(500, upkeep * 2) + reserves.food;
  const economy = forecastCityEconomy(state, cityId);
  const projectedNextMonthFood = economy.projectedFood;
  const threats = incomingCampaignThreats(state, cityId);
  const candidates = localSearchCandidates(state, city.id);
  const workUsed = cityWorkUsedThisPeriod(state, city);
  const awaitingAppointment = new Set(
    state.cities.flatMap((entry) =>
      entry.pendingAppointment?.governorId ? [entry.pendingAppointment.governorId] : [],
    ),
  );
  const plan: GovernorMonthlyWorkPlan = {
    cityId,
    month: economy.boundary.harvestMonth,
    factionId: city.factionId,
    npcCapital,
    troopType: manager?.troopType ?? 'infantry',
    firstAssignment: false,
    snapshot: JSON.stringify({
      revision: state.revision,
      rng: state.rng,
      month: state.monthIndex,
      city,
      faction,
      local,
      candidates,
      sources: state.troopSources.filter((source) => source.cityId === cityId),
      requisitions: state.requisitions.filter((order) => order.sourceCityId === cityId),
      directives: state.directives.filter((order) => order.sourceCityId === cityId),
      personnelDay: state.personnelDay,
      economy,
      threats,
    }),
    managerOfficerId: manager?.id ?? null,
    managerIntellectAtPlan: manager?.intellect ?? 0,
    managerForceAtPlan: manager?.force ?? 0,
    targetOfficerId: null,
    targetOfficerExperienceAtPlan: 0,
    targetOfficerForceAtPlan: 0,
    targetOfficerLoyaltyAtPlan: 0,
    targetOfficerEquipmentAtPlan: null,
    targetTroops: null,
    neutralOfficerIdsAtPlan: candidates.map((officer) => officer.id),
    rngAtPlan: state.rng,
    action: null,
    workPoints: 0,
    goldCost: 0,
    foodCost: 0,
    protectedFood,
    reservedGold: reserves.gold,
    reservedFood: reserves.food,
    reservedTroops: reserves.troops,
    projectedNextMonthFood,
    projectedFoodAfterWork: economy.projectedAvailable.food,
    projectedGoldAfterWork: economy.projectedAvailable.gold,
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
    reasonCode: 'development-capped',
    reason: 'No affordable useful monthly work remains.',
  };
  const stop = (reasonCode: GovernorWorkReasonCode, reason: string) =>
    Object.assign(plan, { reasonCode, reason });
  if (
    !faction ||
    faction.eliminated ||
    (city.governanceMode === 'ruler' && !npcCapital) ||
    city.id === state.playerCapitalCityId
  )
    return stop(
      'manager-unavailable',
      'Player capitals and unowned cities do not receive automatic work.',
    );
  if (!manager)
    return stop('manager-unavailable', 'No living local officer can organize this work.');
  if (isCityCommitted(state, city.id))
    return stop(
      'city-threatened',
      'City work is paused while its personnel and resources are committed to an active battle.',
    );
  const workSpent = workUsed >= cityWorkQuota(state, city);

  let failure = '';
  let orderReserveBlocked = false;
  const forecasts = new Map<string, { city: V03City; economy: typeof economy } | null>();
  function afterWork(
    action: GovernorWorkAction,
    goldCost: number,
    foodCost: number,
    troopType = manager!.troopType,
  ) {
    const key = `${action}:${goldCost}:${foodCost}:${troopType}`;
    if (forecasts.has(key)) return forecasts.get(key)!;
    let updated: V03City | null;
    if (
      action === 'develop-farming' ||
      action === 'develop-commerce' ||
      action === 'recruit' ||
      action === 'buy-food' ||
      action === 'sell-food' ||
      action === 'security' ||
      action === 'relieve' ||
      action === 'restore-loyalty'
    )
      updated = applySharedCityWorkEffect(city!, action, manager!, troopType);
    else updated = { ...city!, gold: city!.gold - goldCost, food: city!.food - foodCost };
    const result = updated
      ? {
          city: updated,
          economy: forecastCityEconomy(
            {
              ...state,
              cities: state.cities.map((entry) => (entry.id === cityId ? updated : entry)),
            },
            cityId,
          ),
        }
      : null;
    forecasts.set(key, result);
    return result;
  }
  function offer(
    action: GovernorWorkAction,
    reasonCode: GovernorWorkReasonCode,
    reason: string,
    targetOfficerId: string | null = null,
    targetTroops: number | null = null,
    troopType = manager!.troopType,
  ): boolean {
    if (
      threats.length &&
      ['develop-farming', 'develop-commerce', 'search', 'sell-food'].includes(action)
    ) {
      failure =
        'An approaching hostile army makes defense preparation more useful than optional development.';
      return false;
    }
    const target = local.find((officer) => officer.id === targetOfficerId);
    const goldCost =
      action === 'recruit'
        ? recruitmentQuote(city!, manager!.force, troopType).gold
        : ['restore-loyalty', 'develop-farming', 'develop-commerce', 'buy-food'].includes(action)
          ? CITY_MONTHLY_WORK_GOLD_COST
          : action === 'reward'
            ? GOVERNOR_REWARD_GOLD_COST
            : action === 'relieve'
              ? GOVERNOR_RELIEF_GOLD_COST
              : action === 'equip'
                ? GOVERNOR_EQUIPMENT_GOLD_COST
                : 0;
    const foodCost =
      action === 'relieve' ? GOVERNOR_RELIEF_FOOD_COST : action === 'sell-food' ? 800 : 0;
    if (foodCost && city!.food - foodCost < protectedFood) {
      failure = 'Spending food would use the protected reserve or an approved order.';
      orderReserveBlocked ||= city!.food - foodCost < reserves.food;
      return false;
    }
    if (action === 'recruit') {
      const gain = recruitmentQuote(city!, manager!.force, troopType).troops;
      const extraUpkeep = Math.ceil(gain * (troopType === 'cavalry' ? 2 : 1) * MONTHLY_FOOD_RATE);
      if (city!.food - reserves.food < Math.max(500, (upkeep + extraUpkeep) * 2)) {
        failure =
          'The city cannot support the additional recruited soldiers above its protected food reserve.';
        return false;
      }
    }
    const actorId = action === 'recruit' ? manager!.id : (targetOfficerId ?? manager!.id);
    const available = getAutomaticCityActionAvailability(
      state,
      {
        cityId,
        action,
        officerId: actorId,
        troopType,
        amount: targetTroops ?? undefined,
      },
      npcCapital ? faction!.id : undefined,
    );
    if (!available.ok) {
      failure = available.reason ?? '';
      orderReserveBlocked ||= failure.includes('reserved');
      return false;
    }
    const after = afterWork(action, goldCost, foodCost, troopType);
    if (!after) return false;
    if (goldCost > 0 && after.economy.projectedAvailable.gold < 0) {
      failure = 'Spending gold would leave the next accrued wages or an approved order unfunded.';
      return false;
    }
    if (
      (goldCost > 0 || foodCost > 0) &&
      after.economy.projectedAvailable.food < 0 &&
      !['buy-food', 'develop-farming'].includes(action)
    ) {
      failure = 'This work would leave the next food bill or an approved order unfunded.';
      return false;
    }
    Object.assign(plan, {
      action,
      workPoints: cityActionWorkCost(action),
      goldCost,
      foodCost,
      reasonCode,
      reason,
      troopType,
      targetOfficerId,
      targetTroops,
      projectedFoodAfterWork: after.economy.projectedAvailable.food,
      projectedGoldAfterWork: after.economy.projectedAvailable.gold,
      firstAssignment: action === 'assign-troops' && target?.troops === 0 && target.wounded === 0,
      targetOfficerExperienceAtPlan: target?.experience ?? 0,
      targetOfficerForceAtPlan: target?.force ?? 0,
      targetOfficerLoyaltyAtPlan: target?.loyalty ?? 0,
      targetOfficerEquipmentAtPlan: target?.equipment ?? null,
    });
    return true;
  }
  const none = () =>
    workSpent
      ? stop('monthly-work-spent', 'The city has used all work points for this ten-day period.')
      : stop(
          orderReserveBlocked
            ? 'approved-order-reserve'
            : failure.includes('approaching hostile')
              ? 'city-threatened'
              : failure
                ? 'insufficient-budget'
                : 'development-capped',
          failure || plan.reason,
        );

  // First cover the actual deadline. If both actions cover it, recurring farming
  // wins; otherwise choose the largest real reduction in the shortfall.
  const foodAtDeadline = threats.length
    ? Math.min(city.food, projectedNextMonthFood)
    : projectedNextMonthFood;
  if (!workSpent && foodAtDeadline < protectedFood) {
    const alternatives = (['develop-farming', 'buy-food'] as const)
      .flatMap((action) => {
        const after = afterWork(action, CITY_MONTHLY_WORK_GOLD_COST, 0);
        if (!after) return [];
        const food = threats.length
          ? Math.min(after.city.food, after.economy.projectedFood)
          : after.economy.projectedFood;
        return [{ action, food, covers: food >= protectedFood }];
      })
      .sort(
        (a, b) =>
          Number(b.covers) - Number(a.covers) ||
          (a.covers
            ? Number(b.action === 'develop-farming') - Number(a.action === 'develop-farming')
            : b.food - a.food),
      );
    for (const { action } of alternatives)
      if (
        offer(
          action,
          'food-security',
          action === 'buy-food'
            ? 'Buy food to reduce the projected shortage before the next bill or approaching battle.'
            : 'The next harvest gain covers the food reserve shortfall; invest in farming.',
        )
      )
        return plan;
    // Unaffordable food work must not suppress free loyalty or reserve organization.
  }
  if (!workSpent && city.loyalty < 60) {
    if (
      offer(
        'relieve',
        'population-relief',
        'City loyalty is below 60; relief protects the food reserve.',
      )
    )
      return plan;
    // Security is free and restores at least eight loyalty for the same work point.
    // Retain restore-loyalty only as a legacy command/report name.
    if (offer('security', 'public-order', 'Restore public order before optional work.'))
      return plan;
    return none();
  }
  if (
    city.loyalty < 70 &&
    offer('security', 'public-order', 'Restore public order before optional work.')
  )
    return plan;
  const reward = local
    .filter((officer) => officer.loyalty < 55)
    .sort((a, b) => a.loyalty - b.loyalty || a.id.localeCompare(b.id))[0];
  if (reward) {
    if (
      offer('reward', 'officer-reward', 'A dangerously disloyal officer needs a reward.', reward.id)
    )
      return plan;
    if (offer('feast', 'officer-loyalty', 'A feast urgently restores local officer loyalty.'))
      return plan;
  }

  function organizeReserves(): boolean {
    // Existing reserves already eat city rations. Refill stationed contingents before
    // optional training, including non-governors and after another monthly action.
    for (const officer of [...local].sort(
      (a, b) => a.troops + a.wounded - b.troops - b.wounded || a.id.localeCompare(b.id),
    )) {
      if (
        officer.troops + officer.wounded === 0 ||
        officer.reorganizationDays > 0 ||
        awaitingAppointment.has(officer.id) ||
        isOfficerReservedForOrder(state, officer.id)
      )
        continue;
      const ready =
        availableReserveTroops(state, cityId, officer.troopType) -
        reserves.troops -
        (threats.length ? 0 : 1000);
      const amount = Math.min(10_000 - officer.wounded, officer.troops + ready);
      if (
        ready > 0 &&
        amount > officer.troops &&
        offer(
          'assign-troops',
          'troop-organization',
          threats.length
            ? 'Organize available reserves for the approaching battle.'
            : 'Reinforce a stationed officer while protecting a 1,000-soldier same-type reserve.',
          officer.id,
          amount,
          officer.troopType,
        )
      )
        return true;
    }
    return false;
  }
  if (threats.length && organizeReserves()) return plan;

  const newcomer =
    automaticTalentWorkUsed(state, city, 'assign') < 1
      ? local
          .filter(
            (officer) =>
              officer.troops === 0 &&
              officer.wounded === 0 &&
              officer.reorganizationDays === 0 &&
              !awaitingAppointment.has(officer.id) &&
              !isOfficerReservedForOrder(state, officer.id),
          )
          .sort(
            (a, b) => b.force + b.intellect - a.force - a.intellect || a.id.localeCompare(b.id),
          )[0]
      : undefined;
  if (newcomer) {
    const ready = Math.max(
      0,
      availableReserveTroops(state, city.id, newcomer.troopType) - reserves.troops,
    );
    if (
      ready >= 100 &&
      offer(
        'assign-troops',
        'troop-organization',
        'Organize the strongest eligible zero-army officer with 100–500 same-type soldiers.',
        newcomer.id,
        Math.min(500, ready),
        newcomer.troopType,
      )
    )
      return plan;
    if (
      ready < 100 &&
      offer(
        'recruit',
        'reserve-recruitment',
        'Recruit the zero-army target’s troop type before its first assignment.',
        newcomer.id,
        null,
        newcomer.troopType,
      )
    )
      return plan;
  }
  if (foodAtDeadline < protectedFood && !threats.length) {
    if (organizeReserves()) return plan;
    return none();
  }
  if (
    automaticTalentWorkUsed(state, city, 'search') < 1 &&
    candidates.length &&
    offer(
      'search',
      'local-search',
      'Approach local free officers, at most once automatically per month.',
    )
  )
    return plan;
  if (
    manager.troops > 0 &&
    availableReserveTroops(state, city.id, manager.troopType) - reserves.troops < 500 &&
    offer('recruit', 'reserve-recruitment', 'Replenish the manager’s same-type reserve.')
  )
    return plan;
  if (
    city.food >= protectedFood + 800 &&
    city.gold < reserves.gold + 80 &&
    offer('sell-food', 'market-balance', 'Sell surplus food to fund city work.')
  )
    return plan;
  if (organizeReserves()) return plan;
  if (workUsed === 0) {
    const trainee = local
      .filter((officer) => officer.troops > 0 && hasTrainingBenefit(officer))
      .sort((a, b) => a.experience - b.experience || a.id.localeCompare(b.id))[0];
    if (trainee && offer('train', 'officer-training', 'Train a local officer.', trainee.id))
      return plan;
  }
  // Compare the next three real production increments, including the harvest
  // season and caps. The existing market exchange values ten food as one gold.
  const sectors = (['develop-farming', 'develop-commerce'] as const)
    .flatMap((action) => {
      const after = afterWork(action, CITY_MONTHLY_WORK_GOLD_COST, 0);
      if (!after) return [];
      let value = 0;
      for (let offset = 0; offset < 3; offset++) {
        const month = ((economy.boundary.harvestMonth - 1 + offset) % 12) + 1;
        const beforeProduction = cityProduction(city, month),
          afterProduction = cityProduction(after.city, month);
        value +=
          (afterProduction.food - beforeProduction.food) / 10 +
          afterProduction.gold -
          beforeProduction.gold;
      }
      return [{ action, value }];
    })
    .sort((a, b) => b.value - a.value || a.action.localeCompare(b.action));
  for (const { action, value } of sectors)
    if (
      value > 0 &&
      offer(
        action,
        'economic-balance',
        'Invest in the larger production gain over the next three settlements.',
      )
    )
      return plan;
  const equipmentTarget = local
    .filter((officer) => officer.equipment !== 'Fine arms' && officer.force < 105)
    .sort((a, b) => b.troops - a.troops || b.force - a.force || a.id.localeCompare(b.id))[0];
  if (
    equipmentTarget &&
    offer('equip', 'equipment-issue', 'Issue fine arms to a local officer.', equipmentTarget.id)
  )
    return plan;
  return none();
}

/** Re-plan before executing; neither stale plans nor rejected actions mutate the input. */
export function applyGovernorMonthlyWork(
  state: Readonly<V03GameState>,
  plan: GovernorMonthlyWorkPlan,
): GovernorMonthlyWorkResult {
  const city = state.cities.find((entry) => entry.id === plan.cityId);
  if (!city) return { applied: false, city: null, reason: 'The city no longer exists.' };
  const current = planGovernorMonthlyWork(state, plan.cityId);
  if (!plan.action || JSON.stringify(current) !== JSON.stringify(plan))
    return {
      applied: false,
      city: structuredClone(city),
      reason: 'The work plan is stale or has no action.',
    };
  const input = {
    cityId: city.id,
    action: plan.action,
    troopType: plan.troopType,
    officerId:
      (plan.action === 'recruit'
        ? plan.managerOfficerId
        : (plan.targetOfficerId ?? plan.managerOfficerId)) ?? undefined,
    amount: plan.targetTroops ?? undefined,
  };
  const applied = plan.npcCapital
    ? applyNpcCapitalCityAction(state as V03GameState, plan.factionId!, input)
    : applyGovernorCityAction(state as V03GameState, input);
  if (!applied.ok) return { applied: false, city: structuredClone(city), reason: applied.error! };
  return {
    applied: true,
    city: applied.state.cities.find((entry) => entry.id === city.id)!,
    state: applied.state,
    reason: plan.reason,
  };
}
