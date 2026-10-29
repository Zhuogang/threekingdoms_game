import { forecastCityEconomy } from '../campaign/economy';
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

function hasIncomingThreat(state: Readonly<V03GameState>, city: V03City): boolean {
  return (
    isCityCommitted(state, city.id) ||
    state.journeys.some(
      (journey) =>
        journey.ownerFactionId !== city.factionId &&
        journey.destinationCityId === city.id &&
        ['outbound', 'waiting'].includes(journey.status),
    )
  );
}

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
  if (hasIncomingThreat(state, city))
    return stop(
      'city-threatened',
      'Monthly work is paused while a hostile force threatens the city.',
    );
  const workSpent = workUsed >= cityWorkQuota(state, city);

  let failure = '';
  function offer(
    action: GovernorWorkAction,
    reasonCode: GovernorWorkReasonCode,
    reason: string,
    targetOfficerId: string | null = null,
    targetTroops: number | null = null,
    troopType = manager!.troopType,
  ): boolean {
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
          failure.includes('reserved')
            ? 'approved-order-reserve'
            : failure
              ? 'insufficient-budget'
              : 'development-capped',
          failure || plan.reason,
        );

  // Urgent safety work is never displaced by optional recruitment or development.
  if (!workSpent && projectedNextMonthFood < protectedFood) {
    if (
      city.farming < 500 &&
      offer('develop-farming', 'food-security', 'Food security requires farming.')
    )
      return plan;
    if (offer('buy-food', 'food-security', 'The city buys food to protect next-month provisions.'))
      return plan;
    return none();
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
    if (
      city.loyalty < 50 &&
      offer('restore-loyalty', 'low-loyalty', 'Restore struggling city loyalty.')
    )
      return plan;
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
      availableReserveTroops(state, city.id, officer.troopType) - reserves.troops - 1000;
    const amount = Math.min(10_000 - officer.wounded, officer.troops + ready);
    if (
      ready > 0 &&
      amount > officer.troops &&
      offer(
        'assign-troops',
        'troop-organization',
        'Reinforce a stationed officer while protecting a 1,000-soldier same-type reserve.',
        officer.id,
        amount,
        officer.troopType,
      )
    )
      return plan;
  }
  if (workUsed === 0) {
    const trainee = local
      .filter((officer) => officer.troops > 0 && hasTrainingBenefit(officer))
      .sort((a, b) => a.experience - b.experience || a.id.localeCompare(b.id))[0];
    if (trainee && offer('train', 'officer-training', 'Train a local officer.', trainee.id))
      return plan;
  }
  const sectors =
    city.farming <= city.commerce
      ? (['develop-farming', 'develop-commerce'] as const)
      : (['develop-commerce', 'develop-farming'] as const);
  for (const action of sectors)
    if (offer(action, 'economic-balance', 'Develop the lower economic sector.')) return plan;
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
