import { PILOT_LOGISTICS_RATES } from '../calendar';
import { forecastCityEconomy } from '../campaign/economy';
import { getV03AttackAllianceBlock } from '../campaign/monthly-systems';
import { recruitmentQuote } from '../campaign/recruitment';
import { cityBattleRoster, groupOfficers, rosterFromGroups } from '../campaign/roster';
import { cityPersonnelSummary } from '../campaign/personnel';
import { ROUTE_BY_ID, routeIdBetween, type CityId } from '../geography';
import { isCityCommitted } from '../governance/commitments';
import { orderLifecycle } from '../governance/order-lifecycle';
import { previewNpcRequisition, requestNpcRequisition } from '../governance/orders';
import { createV03OrderServices } from '../governance/services';
import { reviewStrategicRivalCampaigns, type StrategicCampaignOpportunity } from '../strategic-ai';
import type { V03City, V03FactionObjective, V03GameState, V03ObjectiveReason } from '../types';
import { isRivalCampaignOfficerAvailable } from './campaign-legality';
import { incomingCampaignThreats } from './campaign-threats';
import { estimateCampaignMatchup } from './campaign-strength';
import { recordAiDecision } from './decision-trace';

const services = createV03OrderServices();
const bounded = (value: number) => Math.min(9_999_999, Math.max(0, Math.ceil(value)));
const ownedCities = (state: Readonly<V03GameState>, factionId: string) =>
  state.cities
    .filter((city) => city.factionId === factionId)
    .sort((a, b) => a.id.localeCompare(b.id));
const army = (state: Readonly<V03GameState>, city: V03City) =>
  state.officers.filter((officer) =>
    isRivalCampaignOfficerAvailable(state, officer, city.factionId!, city.id),
  );

function recovery(
  state: Readonly<V03GameState>,
  factionId: string,
  reason: V03ObjectiveReason,
  cancelled = false,
  previous?: V03FactionObjective,
): V03FactionObjective {
  const cities = ownedCities(state, factionId);
  const city = cities.sort(
    (a, b) =>
      forecastCityEconomy(state, a.id).projectedAvailable.food -
        forecastCityEconomy(state, b.id).projectedAvailable.food || a.id.localeCompare(b.id),
  )[0];
  const economy = city && forecastCityEconomy(state, city.id);
  const foodTarget = economy
    ? Math.max(500, economy.available.food - economy.projectedAvailable.food)
    : 0;
  return {
    factionId,
    mode: 'recover',
    sourceCityId: city?.id ?? null,
    targetCityId: null,
    commanderOfficerId: null,
    startedDay: state.absoluteDay,
    reviewDay: state.absoluteDay + 30,
    forceTarget: 0,
    foodTarget: bounded(foodTarget),
    forceDeficit: 0,
    foodDeficit: bounded(foodTarget - (economy?.available.food ?? 0)),
    reason,
    cancellationReason: cancelled ? reason : (previous?.cancellationReason ?? null),
    orderIds: [],
  };
}

function associatedOrders(state: Readonly<V03GameState>, objective: V03FactionObjective) {
  return objective.orderIds.filter(
    (id) =>
      state.requisitions.some(
        (order) =>
          order.id === id &&
          order.factionId === objective.factionId &&
          order.targetCityId === objective.sourceCityId,
      ) ||
      state.directives.some(
        (order) =>
          order.id === id &&
          order.factionId === objective.factionId &&
          order.sourceCityId === objective.sourceCityId &&
          order.targetCityId === objective.targetCityId,
      ),
  );
}

/** Pure reconciliation, also used on load. Never creates orders, resources or RNG draws. */
export function reconcileFactionObjectives(state: V03GameState): V03GameState {
  if (!state.factionObjectives?.length) return state;
  const objectives = state.factionObjectives.flatMap((original) => {
    const faction = state.factions.find((entry) => entry.id === original.factionId);
    if (!faction || faction.eliminated || faction.isPlayer || faction.id === state.playerFactionId)
      return [];
    const source = state.cities.find((city) => city.id === original.sourceCityId);
    let invalid: V03ObjectiveReason | null = null;
    if (original.sourceCityId && (!source || source.factionId !== faction.id))
      invalid = 'ownership-changed';
    if (original.mode === 'prepare-conquest' || original.mode === 'conquer') {
      const target = state.cities.find((city) => city.id === original.targetCityId);
      if (!invalid && original.mode === 'conquer' && target?.factionId === faction.id)
        return [recovery(state, faction.id, 'campaign-resolved', false, original)];
      if (!source || !target || target.factionId === faction.id) invalid = 'ownership-changed';
      else if (
        target.factionId &&
        getV03AttackAllianceBlock(state.alliances, faction.id, target.factionId, state.monthIndex)
      )
        invalid = 'alliance-changed';
      else if (!ROUTE_BY_ID.has(routeIdBetween(source.id as CityId, target.id as CityId)))
        invalid = 'route-unavailable';
      const commander = state.officers.find(
        (officer) => officer.id === original.commanderOfficerId,
      );
      if (
        !invalid &&
        (!commander?.alive ||
          commander.factionId !== faction.id ||
          commander.location.kind === 'captured' ||
          (original.mode === 'prepare-conquest' &&
            !isRivalCampaignOfficerAvailable(state, commander, faction.id, source!.id)))
      )
        invalid = 'commander-unavailable';
    }
    if (invalid) return [recovery(state, faction.id, invalid, true, original)];
    return [{ ...original, orderIds: associatedOrders(state, original) }];
  });
  return JSON.stringify(objectives) === JSON.stringify(state.factionObjectives)
    ? state
    : { ...state, factionObjectives: objectives };
}

function defensiveObjective(
  state: Readonly<V03GameState>,
  factionId: string,
  previous?: V03FactionObjective,
) {
  const threatened = ownedCities(state, factionId)
    .map((city) => ({
      city,
      active: isCityCommitted(state, city.id),
      threats: incomingCampaignThreats(state, city.id),
    }))
    .filter((entry) => entry.active || entry.threats.length)
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        b.threats.reduce((sum, threat) => sum + threat.troops, 0) -
          a.threats.reduce((sum, threat) => sum + threat.troops, 0) ||
        a.city.id.localeCompare(b.city.id),
    )[0];
  if (!threatened) return null;
  const { city, threats, active } = threatened;
  const roster = cityBattleRoster(state, city.id, 'objective-defense').roster;
  const ids = new Set(threats.flatMap((threat) => threat.officerIds));
  const hostile = rosterFromGroups(
    groupOfficers(
      state.officers
        .filter((officer) => ids.has(officer.id))
        .map((officer) => ({ ...officer, wounded: 0 })),
    ),
    'objective-threat',
  ).roster;
  const incoming =
    threats.length && state.journeys.find((journey) => journey.id === threats[0]!.journeyId);
  const matchup =
    !active && incoming
      ? estimateCampaignMatchup(
          hostile,
          roster,
          incoming.routeCityIds ?? [incoming.sourceCityId, city.id],
        )
      : null;
  const ownTroops = roster.reduce((sum, unit) => sum + unit.troops, 0);
  const forceDeficit =
    matchup && matchup.ratio > 0.9
      ? Math.max(
          0,
          ownTroops ? Math.ceil(ownTroops * (matchup.ratio / 0.9 - 1)) : matchup.attackerTroops,
        )
      : 0;
  const economy = forecastCityEconomy(state, city.id);
  const fieldFood =
    roster.reduce((sum, unit) => sum + unit.troops * (unit.troopType === 'cavalry' ? 2 : 1), 0) *
    PILOT_LOGISTICS_RATES.battleFoodPerTroopDay *
    30;
  const approachFood =
    cityPersonnelSummary(state, city.id).foodHeadcount *
    PILOT_LOGISTICS_RATES.cityFoodPerTroopDay *
    (threats[0]?.daysUntilArrival ?? 0);
  const foodTarget = active
    ? 0
    : Math.max(
        500,
        fieldFood + approachFood,
        economy.available.food - economy.projectedAvailable.food,
      );
  const same =
    previous?.mode === 'defend' &&
    previous.sourceCityId === city.id &&
    state.absoluteDay < previous.startedDay + 90;
  const startedDay = same ? previous.startedDay : state.absoluteDay;
  return {
    factionId,
    mode: 'defend' as const,
    sourceCityId: city.id,
    targetCityId: null,
    commanderOfficerId: null,
    startedDay,
    reviewDay: Math.min(startedDay + 90, state.absoluteDay + 30),
    forceTarget: bounded(ownTroops + forceDeficit),
    forceDeficit: bounded(forceDeficit),
    foodTarget: bounded(foodTarget),
    foodDeficit: bounded(foodTarget - economy.available.food),
    reason: active ? ('active-defense' as const) : ('incoming-army' as const),
    cancellationReason:
      previous?.mode === 'prepare-conquest'
        ? ('incoming-army' as const)
        : (previous?.cancellationReason ?? null),
    orderIds: same ? associatedOrders(state, previous) : [],
  };
}

function preparationValue(opportunity: StrategicCampaignOpportunity) {
  return opportunity.score / (1 + opportunity.forceDeficit / 1000 + opportunity.foodDeficit / 1000);
}
function canPrepare(state: Readonly<V03GameState>, opportunity: StrategicCampaignOpportunity) {
  if (
    opportunity.reason &&
    !['insufficient-force', 'home-food-shortage', 'unaffordable'].includes(opportunity.reason)
  )
    return false;
  const city = state.cities.find((entry) => entry.id === opportunity.plan.sourceCityId)!;
  const local = army(state, city);
  const commandRoom = local.reduce(
    (sum, officer) => sum + Math.max(0, 10_000 - officer.troops - officer.wounded),
    0,
  );
  const maxRecruitment =
    Math.max(
      0,
      ...local.map((officer) => recruitmentQuote(city, officer.force, officer.troopType).troops),
    ) * 18;
  // Eighteen ten-day work points over three months is an optimistic upper bound;
  // actual buying, recruitment and organization still spend their real budgets.
  return (
    opportunity.forceDeficit <=
    Math.min(Math.max(0, city.population - 1000), commandRoom, maxRecruitment)
  );
}

/** One small objective per living NPC faction, reviewed at existing work boundaries. */
export function reviewFactionObjectives(state: V03GameState): V03FactionObjective[] {
  const remembered = reconcileFactionObjectives(state).factionObjectives ?? [];
  if (state.phase === 'finished') return remembered;
  return state.factions
    .filter(
      (faction) => !faction.eliminated && !faction.isPlayer && faction.id !== state.playerFactionId,
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((faction) => {
      const previous = remembered.find((objective) => objective.factionId === faction.id);
      const defend = defensiveObjective(state, faction.id, previous);
      if (defend) return defend;
      if (previous?.mode === 'conquer') {
        const directive = state.directives.find(
          (order) => previous.orderIds.includes(order.id) && order.factionId === faction.id,
        );
        if (directive && orderLifecycle(state, directive).stage !== 'done')
          return { ...previous, reason: 'campaign-active' as const };
      }
      if (previous?.mode === 'recover' && state.absoluteDay < previous.reviewDay) {
        const current = recovery(state, faction.id, previous.reason, false, previous);
        return {
          ...current,
          startedDay: previous.startedDay,
          reviewDay: previous.reviewDay,
          orderIds: associatedOrders(state, { ...current, orderIds: previous.orderIds }),
        };
      }
      const review = reviewStrategicRivalCampaigns(state, { factionId: faction.id });
      const candidates = review.opportunities
        .filter((opportunity) => canPrepare(state, opportunity))
        .sort(
          (a, b) =>
            Number(a.reason !== null) - Number(b.reason !== null) ||
            preparationValue(b) - preparationValue(a) ||
            a.plan.sourceCityId.localeCompare(b.plan.sourceCityId) ||
            a.plan.targetCityId.localeCompare(b.plan.targetCityId),
        );
      let chosen = candidates[0];
      if (!chosen)
        return recovery(
          state,
          faction.id,
          review.opportunities.length ? 'budget-impossible' : 'no-opportunity',
          false,
          previous,
        );
      const retained = candidates.find(
        (opportunity) =>
          opportunity.plan.sourceCityId === previous?.sourceCityId &&
          opportunity.plan.targetCityId === previous?.targetCityId,
      );
      if (
        retained &&
        (!retained.reason || chosen.reason) &&
        preparationValue(retained) >= preparationValue(chosen) * 0.8
      )
        chosen = retained;
      const same =
        previous?.mode === 'prepare-conquest' &&
        previous.sourceCityId === chosen.plan.sourceCityId &&
        previous.targetCityId === chosen.plan.targetCityId;
      if (same && state.absoluteDay >= previous.startedDay + 90 && chosen.reason)
        return recovery(state, faction.id, 'preparation-expired', true, previous);
      const city = state.cities.find((entry) => entry.id === chosen.plan.sourceCityId)!;
      const readyTroops = army(state, city).reduce((sum, officer) => sum + officer.troops, 0);
      const startedDay = same ? previous.startedDay : state.absoluteDay;
      return {
        factionId: faction.id,
        mode: 'prepare-conquest' as const,
        sourceCityId: city.id,
        targetCityId: chosen.plan.targetCityId,
        commanderOfficerId: chosen.plan.officerIds[0] ?? null,
        startedDay,
        reviewDay: Math.min(startedDay + 90, state.absoluteDay + 30),
        forceTarget: bounded(readyTroops + chosen.forceDeficit),
        foodTarget: bounded(chosen.foodTarget),
        forceDeficit: bounded(chosen.forceDeficit),
        foodDeficit: bounded(chosen.foodDeficit),
        reason: !chosen.reason
          ? ('ready' as const)
          : chosen.forceDeficit
            ? ('force-shortfall' as const)
            : ('food-shortfall' as const),
        cancellationReason:
          !same && previous?.targetCityId
            ? ('opportunity-changed' as const)
            : (previous?.cancellationReason ?? null),
        orderIds: same ? associatedOrders(state, previous) : [],
      };
    });
}

function observe(
  state: V03GameState,
  objective: V03FactionObjective,
  status: 'selected' | 'retained' | 'cancelled' | 'support-committed' | 'campaign-committed',
  orderId?: string,
) {
  recordAiDecision({
    kind: 'objective',
    day: state.absoluteDay,
    factionId: objective.factionId,
    mode: objective.mode,
    sourceCityId: objective.sourceCityId,
    targetCityId: objective.targetCityId,
    status,
    reason: objective.reason,
    forceDeficit: objective.forceDeficit,
    foodDeficit: objective.foodDeficit,
    reviewDay: objective.reviewDay,
    ...(orderId ? { orderId } : {}),
  });
}

export function updateFactionObjectives(state: V03GameState): void {
  const previous = state.factionObjectives ?? [];
  state.factionObjectives = reviewFactionObjectives(state);
  for (const objective of state.factionObjectives) {
    const old = previous.find((entry) => entry.factionId === objective.factionId);
    observe(
      state,
      objective,
      objective.cancellationReason && objective.cancellationReason !== old?.cancellationReason
        ? 'cancelled'
        : old?.mode === objective.mode &&
            old.sourceCityId === objective.sourceCityId &&
            old.targetCityId === objective.targetCityId
          ? 'retained'
          : 'selected',
    );
  }
}

/** At most one active support shipment per faction and one dispatch per thirty days.
 * This first policy transports provisions/gold; officers and troops are prepared
 * locally through existing governor actions, without an extra campaign allowance.
 */
export function supportFactionObjectives(state: V03GameState): void {
  for (const objective of state.factionObjectives ?? []) {
    if (
      objective.mode === 'conquer' ||
      !objective.sourceCityId ||
      isCityCommitted(state, objective.sourceCityId)
    )
      continue;
    const receiver = state.cities.find(
      (city) => city.id === objective.sourceCityId && city.factionId === objective.factionId,
    );
    if (!receiver) continue;
    const orders = state.requisitions.filter((order) => order.factionId === objective.factionId);
    // A failed/cancelled order can still own cargo returning on a redirected or
    // recalled journey. Keep that support operation active until its party lands.
    const supportReturning = state.journeys.some(
      (journey) =>
        journey.ownerFactionId === objective.factionId &&
        ['outbound', 'returning', 'waiting'].includes(journey.status) &&
        orders.some((order) => order.journeyId && journey.id.startsWith(`${order.journeyId}:`)),
    );
    if (
      supportReturning ||
      orders.some(
        (order) =>
          state.absoluteDay - order.createdDay < 30 ||
          orderLifecycle(state, order).stage !== 'done',
      )
    )
      continue;
    const economy = forecastCityEconomy(state, receiver.id);
    const food = bounded(objective.foodTarget - economy.available.food);
    const commander = state.officers.find((officer) => officer.id === objective.commanderOfficerId);
    const neededGold =
      objective.forceDeficit && commander
        ? recruitmentQuote(receiver, commander.force, commander.troopType).gold
        : food
          ? 80
          : 0;
    const gold = bounded(
      neededGold - Math.min(economy.available.gold, economy.projectedAvailable.gold),
    );
    if (!food && !gold) continue;
    const donors = ownedCities(state, objective.factionId).filter(
      (city) =>
        city.id !== receiver.id &&
        !isCityCommitted(state, city.id) &&
        !incomingCampaignThreats(state, city.id).length,
    );
    const candidates = donors
      .flatMap((donor) => {
        const donorEconomy = forecastCityEconomy(state, donor.id);
        const monthlyFood =
          cityPersonnelSummary(state, donor.id).foodHeadcount *
          PILOT_LOGISTICS_RATES.cityFoodPerTroopDay *
          30;
        const spareFood = Math.max(
          0,
          Math.min(
            donorEconomy.available.food - Math.max(500, monthlyFood * 2),
            donorEconomy.projectedAvailable.food,
          ),
        );
        const spareGold = Math.max(
          0,
          Math.min(donorEconomy.available.gold - 80, donorEconomy.projectedAvailable.gold - 80),
        );
        const input = {
          sourceCityId: donor.id,
          targetCityId: receiver.id,
          requested: {
            food: Math.min(food, Math.floor(spareFood)),
            gold: Math.min(gold, Math.floor(spareGold)),
            troops: 0,
          },
          requestedByDay: null,
        };
        if (!input.requested.food && !input.requested.gold) return [];
        const preview = previewNpcRequisition(state, objective.factionId, input, services);
        const deadline =
          objective.mode === 'defend'
            ? state.absoluteDay +
              (incomingCampaignThreats(state, receiver.id)[0]?.daysUntilArrival ?? 0)
            : Math.min(
                objective.startedDay + 90,
                economy.projectedAvailable.food < 0 ? economy.boundary.absoluteDay : Infinity,
              );
        if (
          !preview.ready ||
          preview.estimatedArrivalDay === null ||
          preview.estimatedArrivalDay > deadline
        )
          return [];
        return [{ input, preview }];
      })
      .sort(
        (a, b) =>
          a.preview.estimatedArrivalDay! - b.preview.estimatedArrivalDay! ||
          b.input.requested.food - a.input.requested.food ||
          a.input.sourceCityId.localeCompare(b.input.sourceCityId),
      );
    const candidate = candidates[0];
    if (!candidate) continue;
    const sent = requestNpcRequisition(state, objective.factionId, candidate.input, services);
    if (!sent.ok || !sent.order) continue;
    Object.assign(state, sent.state);
    const current = state.factionObjectives!.find(
      (entry) => entry.factionId === objective.factionId,
    )!;
    current.orderIds = [sent.order.id];
    observe(state, current, 'support-committed', sent.order.id);
  }
}

export function recordFactionCampaign(
  state: V03GameState,
  factionId: string,
  sourceCityId: string,
  targetCityId: string,
  commanderOfficerId: string,
  orderId: string,
): void {
  const previous = state.factionObjectives?.find((objective) => objective.factionId === factionId);
  const same = previous?.sourceCityId === sourceCityId && previous.targetCityId === targetCityId;
  const startedDay = same ? previous.startedDay : state.absoluteDay;
  const objective: V03FactionObjective = {
    factionId,
    mode: 'conquer',
    sourceCityId,
    targetCityId,
    commanderOfficerId,
    startedDay,
    reviewDay: Math.min(startedDay + 90, state.absoluteDay + 30),
    forceTarget: 0,
    foodTarget: 0,
    forceDeficit: 0,
    foodDeficit: 0,
    reason: 'campaign-active',
    cancellationReason: previous?.cancellationReason ?? null,
    orderIds: [
      ...(same
        ? previous.orderIds.filter((id) => state.requisitions.some((order) => order.id === id))
        : []
      ).slice(0, 1),
      orderId,
    ],
  };
  // Another safe city can use the unchanged monthly campaign allowance while
  // the faction's primary work and support priority remains its threatened city.
  if (previous?.mode === 'defend') {
    observe(state, objective, 'campaign-committed', orderId);
    return;
  }
  state.factionObjectives = [
    ...(state.factionObjectives ?? []).filter((entry) => entry.factionId !== factionId),
    objective,
  ].sort((a, b) => a.factionId.localeCompare(b.factionId));
  observe(state, objective, 'campaign-committed', orderId);
}
