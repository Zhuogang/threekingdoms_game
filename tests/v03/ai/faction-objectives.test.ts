import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { advanceV03, dispatchMonthlyRivalCampaigns } from '../../../src/v03/engine';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import {
  reviewFactionObjectives,
  updateFactionObjectives,
  reconcileFactionObjectives,
  supportFactionObjectives,
} from '../../../src/v03/ai/faction-objectives';
import { reviewStrategicRivalCampaigns } from '../../../src/v03/strategic-ai';
import { createV03OrderServices } from '../../../src/v03/governance/services';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { recruitmentQuote } from '../../../src/v03/campaign/recruitment';
import { forecastCityEconomy } from '../../../src/v03/campaign/economy';
import {
  planGovernorMonthlyWork,
  applyGovernorMonthlyWork,
} from '../../../src/v03/governance/autonomy';
import { encodeV03Save, decodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import { rivalDecisionFixture } from '../helpers/ai-fixtures';
import type { V03FactionObjective, V03GameState } from '../../../src/v03/types';

function hungryFront() {
  const state = rivalDecisionFixture();
  state.cities.find((city) => city.id === 'ye')!.food = 0;
  return state;
}
function remember(state: V03GameState) {
  const objective = reviewFactionObjectives(state).find((goal) => goal.factionId === 'yuan')!;
  state.factionObjectives = [objective];
  return objective;
}
function withDay(state: V03GameState, day: number) {
  state.absoluteDay = day;
  state.monthIndex = Math.floor(day / 30);
  state.personnelDay = createPersonnelDay(state);
}
function shipmentFixture() {
  const state = createV03Game('cao', 37, 'guandu-200');
  const front = state.cities.find((city) => city.id === 'jianye')!,
    donor = state.cities.find((city) => city.id === 'wu')!;
  const commander = state.officers.find(
    (officer) =>
      officer.alive &&
      officer.factionId === 'sun' &&
      officer.troops > 0 &&
      officer.location.kind === 'city' &&
      officer.location.cityId === front.id,
  )!;
  Object.assign(front, { food: 0, gold: 0 });
  Object.assign(donor, { food: 100_000, gold: 10_000 });
  const goal: V03FactionObjective = {
    factionId: 'sun',
    mode: 'prepare-conquest',
    sourceCityId: front.id,
    targetCityId: 'xiapi',
    commanderOfficerId: commander.id,
    startedDay: 0,
    reviewDay: 30,
    forceTarget: commander.troops,
    foodTarget: 3000,
    forceDeficit: 0,
    foodDeficit: 3000,
    reason: 'food-shortfall',
    cancellationReason: null,
    orderIds: [],
  };
  state.factionObjectives = [goal];
  return { state, front, donor, goal };
}

describe('V04-08 persistent faction objectives', () => {
  it('interrupts preparation for a real approaching hostile army', () => {
    const state = hungryFront();
    remember(state);
    const hostile = createV03Game('cao', 17).officers.find((officer) => officer.id === 'caocao')!;
    Object.assign(hostile, {
      troops: 5000,
      wounded: 0,
      location: { kind: 'journey', journeyId: 'objective-invasion' },
    });
    state.officers.push(hostile);
    const services = createV03OrderServices();
    const composition = {
      troopTypes: [hostile.troopType],
      cavalryTroops: 5000,
      heavySupplyTrain: true,
    };
    const route = services.planRoute({
      state,
      sourceCityId: 'jinyang',
      targetCityId: 'ye',
      movingFactionId: 'cao',
      departureDay: 0,
      troopCount: 5000,
      kind: 'campaign',
      composition,
    })!;
    state.journeys.push(
      services.createJourney({
        id: 'objective-invasion',
        executionId: 'objective-invasion-order',
        ownerFactionId: 'cao',
        kind: 'campaign',
        intent: 'conquer',
        sourceCityId: 'jinyang',
        targetCityId: 'ye',
        departureDay: 0,
        arrivalDay: route.estimatedDays,
        route,
        party: { officerIds: [hostile.id], troopCount: 5000, composition },
        cargo: { gold: 0, food: 0, troops: 0 },
        carriedFood: 10_000,
      }),
    );
    updateFactionObjectives(state);
    expect(state.factionObjectives!.find((goal) => goal.factionId === 'yuan')).toMatchObject({
      mode: 'defend',
      sourceCityId: 'ye',
      reason: 'incoming-army',
      cancellationReason: 'incoming-army',
    });
  });

  it('receives a real support convoy before launching at the normal monthly boundary, identically after reload', () => {
    const { state, front, donor } = shipmentFixture();
    // Only the intended front has a deployable Sun army. Other factions remain
    // staffed, but have no field forces in this controlled logistics continuation.
    for (const officer of state.officers)
      if (officer.location.kind === 'city' && officer.location.cityId !== front.id)
        Object.assign(officer, {
          troops: 0,
          wounded: 0,
          troopExperience: 0,
          reorganizationDays: 0,
        });
    for (const city of state.cities)
      if (city.id !== front.id)
        Object.assign(city, {
          garrisonTroops: city.id === 'shouchun' ? 100 : 0,
          garrisonExperience: 0,
          reserve: 0,
          reservePools: createReservePools(),
          population: 1000,
          food: city.id === donor.id ? 100_000 : 1000,
          gold: city.id === donor.id ? 10_000 : 0,
        });
    state.alliances = state.factions.flatMap((a, index) =>
      state.factions
        .slice(index + 1)
        .filter((b) => !([a.id, b.id].includes('sun') && [a.id, b.id].includes('cao')))
        .map((b) => ({ a: a.id, b: b.id, expiresMonthIndex: 6 })),
    );
    state.personnelDay = createPersonnelDay(state);
    state.factionObjectives = [];
    updateFactionObjectives(state);
    const selected = state.factionObjectives!.find((goal) => goal.factionId === 'sun')!;
    expect(selected).toMatchObject({ mode: 'prepare-conquest', sourceCityId: front.id });
    expect(selected.foodDeficit).toBeGreaterThan(0);
    expect(validateV03State(state)).toBe(true);
    expect(reviewStrategicRivalCampaigns(state, { factionId: 'sun' }).plans).toEqual([]);
    supportFactionObjectives(state);
    const shipment = state.requisitions.find((order) => order.factionId === 'sun')!;
    expect(shipment).toBeDefined();
    const arrivalDay = shipment.estimatedArrivalDay!;
    expect(arrivalDay).toBeLessThan(30);
    const advanceTo = (initial: V03GameState, target: number) => {
      let next = initial;
      while (next.absoluteDay < target) {
        next.events.forEach((event) => (event.acknowledged = true));
        next.battles.forEach((battle) => {
          if (battle.active) battle.autoCommand = true;
        });
        const result = advanceV03(next, 1);
        expect(result.error).toBeUndefined();
        expect(result.daysAdvanced).toBe(1);
        next = result.state;
        if (next.absoluteDay < arrivalDay)
          expect(next.cities.find((city) => city.id === front.id)!.food).toBe(0);
        if (next.absoluteDay < 30)
          expect(next.directives.filter((order) => order.factionId === 'sun')).toEqual([]);
      }
      return next;
    };
    const halfway = advanceTo(state, Math.max(1, arrivalDay - 1));
    const loaded = decodeV03Save(encodeV03Save(halfway));
    const completed = advanceTo(halfway, 30);
    expect(advanceTo(loaded, 30)).toEqual(completed);
    expect(completed.requisitions.filter((order) => order.factionId === 'sun')).toHaveLength(1);
    const campaigns = completed.directives.filter((order) => order.factionId === 'sun');
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]).toMatchObject({
      sourceCityId: front.id,
      targetCityId: selected.targetCityId,
      status: 'dispatched',
    });
    expect(completed.factionObjectives!.find((goal) => goal.factionId === 'sun')).toMatchObject({
      mode: 'conquer',
      orderIds: expect.arrayContaining([campaigns[0]!.id]),
    });
    expect(validateV03State(completed)).toBe(true);
  });

  it('recruits and organizes a preparation shortfall through the existing paid and free actions', () => {
    const { state, front, goal } = shipmentFixture();
    Object.assign(front, {
      food: 100_000,
      gold: 10_000,
      loyalty: 100,
      reserve: 0,
      reservePools: createReservePools(),
      workMonthIndex: 0,
      workPeriodIndex: 0,
      workPointsUsed: 0,
      autoSearchesThisMonth: 1,
      autoAssignmentsThisMonth: 1,
    });
    const locals = state.officers.filter(
      (officer) =>
        officer.alive &&
        officer.factionId === 'sun' &&
        officer.location.kind === 'city' &&
        officer.location.cityId === front.id,
    );
    for (const officer of locals)
      Object.assign(officer, {
        loyalty: 100,
        wounded: 0,
        reorganizationDays: 0,
      });
    const initialTroops = locals.reduce((sum, officer) => sum + officer.troops, 0);
    Object.assign(goal, {
      commanderOfficerId: 'zhouyu',
      forceTarget: initialTroops + 400,
      forceDeficit: 400,
      foodTarget: 500,
      foodDeficit: 0,
      reason: 'force-shortfall',
    });
    state.personnelDay = createPersonnelDay(state);
    expect(validateV03State(state)).toBe(true);
    const recruit = planGovernorMonthlyWork(state, front.id);
    expect(recruit.action).toBe('recruit');
    const manager = state.officers.find((officer) => officer.id === recruit.managerOfficerId)!;
    const quote = recruitmentQuote(front, manager.force, recruit.troopType);
    const recruited = applyGovernorMonthlyWork(state, recruit);
    expect(recruited.applied).toBe(true);
    expect(validateV03State(recruited.state!)).toBe(true);
    expect(recruited.city).toMatchObject({
      gold: front.gold - quote.gold,
      population: front.population - quote.troops,
      reserve: quote.troops,
      workPointsUsed: 1,
    });
    const organize = planGovernorMonthlyWork(recruited.state!, front.id);
    expect(organize).toMatchObject({ action: 'assign-troops', workPoints: 0 });
    const organized = applyGovernorMonthlyWork(recruited.state!, organize);
    expect(organized.applied).toBe(true);
    expect(organized.city).toMatchObject({
      reserve: quote.troops - 400,
      workPointsUsed: 1,
      gold: front.gold - quote.gold,
    });
    expect(
      organized
        .state!.officers.filter((officer) => locals.some((local) => local.id === officer.id))
        .reduce((sum, officer) => sum + officer.troops, 0),
    ).toBe(initialTroops + 400);
    expect(validateV03State(organized.state!)).toBe(true);
  });

  it('rejects support that cannot reach a real shortage before the next food bill', () => {
    const { state, front, donor } = shipmentFixture();
    withDay(state, 29);
    Object.assign(front, { farming: 0, population: 1000, troopServiceDaysThisMonth: 100_000 });
    for (const city of state.cities)
      if (city.factionId === 'sun' && city.id !== donor.id)
        Object.assign(city, { food: 0, gold: 0 });
    expect(forecastCityEconomy(state, front.id).projectedAvailable.food).toBeLessThan(0);
    const before = structuredClone(state);
    supportFactionObjectives(state);
    expect(state).toEqual(before);
  });

  it('derives an advisory food deficit from ordinary planning without changing resources or RNG', () => {
    const state = hungryFront();
    const before = structuredClone(state);
    const review = reviewStrategicRivalCampaigns(state, { factionId: 'yuan' });
    expect(review.plans).toEqual([]);
    expect(review.opportunities.some((option) => option.foodDeficit > 0)).toBe(true);
    const objective = reviewFactionObjectives(state).find((goal) => goal.factionId === 'yuan')!;
    expect(objective).toMatchObject({
      mode: 'prepare-conquest',
      sourceCityId: 'ye',
      reason: 'food-shortfall',
      startedDay: 0,
      reviewDay: 30,
      orderIds: [],
    });
    expect(objective.foodDeficit).toBeGreaterThan(0);
    expect(state).toEqual(before);
  });

  it('keeps a useful target across work periods, then recognizes actual preparation progress', () => {
    const state = hungryFront(),
      previous = remember(state);
    withDay(state, 10);
    updateFactionObjectives(state);
    const next = state.factionObjectives!.find((goal) => goal.factionId === 'yuan')!;
    expect(next.targetCityId).toBe(previous.targetCityId);
    expect(next.startedDay).toBe(0);
    state.cities.find((city) => city.id === 'ye')!.food = 100_000;
    updateFactionObjectives(state);
    expect(state.factionObjectives!.find((goal) => goal.factionId === 'yuan')).toMatchObject({
      mode: 'prepare-conquest',
      reason: 'ready',
      foodDeficit: 0,
      forceDeficit: 0,
    });
  });

  it('terminates a preparation that still has unmet deficits after ninety days', () => {
    const state = hungryFront();
    remember(state);
    withDay(state, 90);
    updateFactionObjectives(state);
    expect(state.factionObjectives!.find((goal) => goal.factionId === 'yuan')).toMatchObject({
      mode: 'recover',
      reason: 'preparation-expired',
      cancellationReason: 'preparation-expired',
    });
    expect(state.requisitions).toEqual([]);
  });

  it('abandons an outmatched target when another viable opportunity remains', () => {
    const state = rivalDecisionFixture();
    const previous = remember(state);
    expect(previous.reason).toBe('ready');
    state.cities.find((city) => city.id === previous.targetCityId)!.garrisonTroops = 50_000;
    updateFactionObjectives(state);
    const next = state.factionObjectives!.find((goal) => goal.factionId === 'yuan')!;
    expect(next).toMatchObject({
      mode: 'prepare-conquest',
      reason: 'ready',
      cancellationReason: 'opportunity-changed',
    });
    expect(next.targetCityId).not.toBe(previous.targetCityId);
  });

  it('finishes a successful conquest objective without treating it as a failed preparation', () => {
    const state = rivalDecisionFixture();
    remember(state);
    dispatchMonthlyRivalCampaigns(state);
    const previous = state.factionObjectives!.find((goal) => goal.factionId === 'yuan')!;
    state.cities.find((city) => city.id === previous.targetCityId)!.factionId = 'yuan';
    expect(
      reconcileFactionObjectives(state).factionObjectives!.find(
        (goal) => goal.factionId === 'yuan',
      ),
    ).toMatchObject({ mode: 'recover', reason: 'campaign-resolved', cancellationReason: null });
  });

  it.each(['source', 'target', 'alliance', 'commander', 'captivity', 'route'] as const)(
    'cancels a stale %s condition explicitly and harmlessly',
    (change) => {
      const state = hungryFront(),
        objective = remember(state);
      if (change === 'source')
        state.cities.find((city) => city.id === objective.sourceCityId)!.factionId = 'cao';
      if (change === 'target')
        state.cities.find((city) => city.id === objective.targetCityId)!.factionId = 'yuan';
      if (change === 'alliance') {
        state.cities.find((city) => city.id === objective.targetCityId)!.factionId = 'cao';
        state.alliances.push({ a: 'cao', b: 'yuan', expiresMonthIndex: 12 });
      }
      if (change === 'commander')
        state.officers.find((officer) => officer.id === objective.commanderOfficerId)!.alive =
          false;
      if (change === 'captivity')
        state.officers.find((officer) => officer.id === objective.commanderOfficerId)!.location = {
          kind: 'captured',
          cityId: 'jinyang',
          holderFactionId: 'cao',
        };
      if (change === 'route') {
        state.cities.push(createV03Game('cao', 17).cities.find((city) => city.id === 'chengdu')!);
        objective.targetCityId = 'chengdu';
      }
      const before = structuredClone(state);
      const result = reconcileFactionObjectives(state);
      const next = result.factionObjectives!.find((goal) => goal.factionId === 'yuan')!;
      expect(next.mode).toBe('recover');
      expect(next.cancellationReason).toBe(
        change === 'alliance'
          ? 'alliance-changed'
          : change === 'commander' || change === 'captivity'
            ? 'commander-unavailable'
            : change === 'route'
              ? 'route-unavailable'
              : 'ownership-changed',
      );
      expect(state).toEqual(before);
      expect(result.cities).toEqual(state.cities);
      expect(result.rng).toBe(state.rng);
      expect(result.nextId).toBe(state.nextId);
    },
  );

  it('persists compact optional memory and safely reconciles stale load references', () => {
    const state = createV03Game('cao', 37);
    const oldSave = encodeV03Save(state);
    expect(decodeV03Save(oldSave).factionObjectives).toBeUndefined();
    updateFactionObjectives(state);
    expect(validateV03State(state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(state)).factionObjectives).toEqual(state.factionObjectives);
    const active = state.factionObjectives!.find((goal) => goal.mode === 'prepare-conquest')!;
    expect(active).toBeDefined();
    active.targetCityId = 'missing-city';
    const loaded = decodeV03Save(encodeV03Save(state));
    expect(
      loaded.factionObjectives!.find((goal) => goal.factionId === active.factionId),
    ).toMatchObject({ mode: 'recover', cancellationReason: 'ownership-changed' });
    expect(loaded.cities).toEqual(state.cities);
    expect(loaded.rng).toBe(state.rng);
  });

  it('rejects duplicate objectives, future starts, excessive horizons and negative targets', () => {
    const state = createV03Game('cao', 37);
    updateFactionObjectives(state);
    const goal = state.factionObjectives![0]!;
    for (const patch of [{ startedDay: 1 }, { reviewDay: 91 }, { foodTarget: -1 }]) {
      const bad = structuredClone(state);
      Object.assign(bad.factionObjectives![0]!, patch);
      expect(validateV03State(bad)).toBe(false);
    }
    state.factionObjectives!.push(structuredClone(goal));
    expect(validateV03State(state)).toBe(false);
  });

  it('reconciles a captured ruler and stale order references on load without extra progress', () => {
    const { state, goal } = shipmentFixture();
    supportFactionObjectives(state);
    const commander = state.officers.find((officer) => officer.id === goal.commanderOfficerId)!;
    expect(state.factions.find((faction) => faction.id === 'sun')!.leaderOfficerId).toBe(
      commander.id,
    );
    const source = state.cities.find((city) => city.id === goal.sourceCityId)!;
    source.garrisonTroops -= commander.troops;
    if (commander.governorOfCityId) {
      const city = state.cities.find((entry) => entry.id === commander.governorOfCityId)!;
      Object.assign(city, { governorId: null, governanceMode: 'steward' });
      commander.governorOfCityId = null;
    }
    commander.location = { kind: 'captured', cityId: state.playerCapitalCityId };
    state.factionObjectives![0]!.orderIds.push('missing-order');
    state.personnelDay = createPersonnelDay(state);
    const withoutMemory = structuredClone(state);
    delete withoutMemory.factionObjectives;
    const expected = decodeV03Save(encodeV03Save(withoutMemory));
    const loaded = decodeV03Save(encodeV03Save(state));
    expect(loaded.factions.find((faction) => faction.id === 'sun')!.leaderOfficerId).not.toBe(
      commander.id,
    );
    expect(loaded.factionObjectives![0]).toMatchObject({
      mode: 'recover',
      cancellationReason: 'commander-unavailable',
      orderIds: [],
    });
    expect({ ...loaded, factionObjectives: undefined }).toEqual({
      ...expected,
      factionObjectives: undefined,
    });
    expect(decodeV03Save(encodeV03Save(loaded))).toEqual(loaded);
  });

  it('uses a real donor shipment, protects donor provisions, and does not duplicate it after reload', () => {
    const { state, front, donor } = shipmentFixture();
    const donorFood = donor.food,
      initialRng = state.rng;
    supportFactionObjectives(state);
    const order = state.requisitions.find((entry) => entry.factionId === 'sun')!;
    expect(order).toMatchObject({
      status: 'dispatched',
      sourceCityId: donor.id,
      targetCityId: front.id,
    });
    expect(order.proposed.food).toBe(3000);
    expect(state.cities.find((city) => city.id === front.id)!.food).toBe(0);
    expect(state.cities.find((city) => city.id === donor.id)!.food).toBe(donorFood - 3000);
    expect(state.rng).toBe(initialRng);
    expect(state.factionObjectives![0]!.orderIds).toEqual([order.id]);
    const loaded = decodeV03Save(encodeV03Save(state));
    const nextId = loaded.nextId;
    supportFactionObjectives(loaded);
    expect(loaded.nextId).toBe(nextId);
    expect(loaded.requisitions).toHaveLength(1);
    expect(loaded.cities).toEqual(state.cities);
  });

  it('does not ship resources from a donor that cannot meet its own bill', () => {
    const { state, donor } = shipmentFixture();
    donor.troopServiceDaysThisMonth = 100_000_000;
    donor.gold = 0;
    for (const city of state.cities)
      if (city.factionId === 'sun' && city.id !== donor.id)
        Object.assign(city, { food: 0, gold: 0 });
    const before = structuredClone(state);
    supportFactionObjectives(state);
    expect(state).toEqual(before);
  });

  it('records the monthly campaign as conquest without increasing the dispatch allowance', () => {
    const state = rivalDecisionFixture();
    remember(state);
    dispatchMonthlyRivalCampaigns(state);
    expect(state.directives.filter((order) => order.factionId === 'yuan')).toHaveLength(1);
    expect(state.factionObjectives!.find((goal) => goal.factionId === 'yuan')).toMatchObject({
      mode: 'conquer',
      reason: 'campaign-active',
    });
  });

  it('reviews objectives at a real work boundary without resetting work or talent quotas', () => {
    const state = createV03Game('cao', 37);
    withDay(state, 9);
    for (const city of state.cities) {
      city.autoSearchesThisMonth = 1;
      city.autoAssignmentsThisMonth = 1;
    }
    state.events.forEach((event) => (event.acknowledged = true));
    const advanced = advanceV03(state, 1).state;
    expect(advanced.factionObjectives!.length).toBeGreaterThan(0);
    expect(new Set(advanced.factionObjectives!.map((goal) => goal.factionId)).size).toBe(
      advanced.factionObjectives!.length,
    );
    expect(
      advanced.factionObjectives!.some((goal) => goal.factionId === state.playerFactionId),
    ).toBe(false);
    for (const city of advanced.cities) {
      expect(city.autoSearchesThisMonth).toBe(1);
      expect(city.autoAssignmentsThisMonth).toBe(1);
      expect(city.workPointsUsed ?? 0).toBeLessThanOrEqual(2);
    }
    expect(validateV03State(advanced)).toBe(true);
  });
});
