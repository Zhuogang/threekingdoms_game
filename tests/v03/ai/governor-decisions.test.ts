import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { forecastCityEconomy } from '../../../src/v03/campaign/economy';
import { createV03OrderServices } from '../../../src/v03/governance/services';
import {
  applyGovernorMonthlyWork,
  planGovernorMonthlyWork,
} from '../../../src/v03/governance/autonomy';
import { applySharedCityWorkEffect } from '../../../src/v03/governance/city-actions';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import type { V03GameState } from '../../../src/v03/types';

function fixture(day = 29) {
  const state = createV03Game('cao', 17);
  state.absoluteDay = day;
  state.monthIndex = Math.floor(day / 30);
  const city = state.cities.find((c) => c.id === 'xuchang')!;
  const manager = state.officers.find((o) => o.id === city.governorId)!;
  Object.assign(city, {
    food: 0,
    gold: 1000,
    population: 1000,
    farming: 0,
    commerce: 0,
    loyalty: 100,
    garrisonTroops: 1000,
    reserve: 0,
    reservePools: createReservePools(),
    troopServiceDaysThisMonth: 1000 * (day % 30),
    cavalryServiceDaysThisMonth: 0,
    prisonerServiceDaysThisMonth: 0,
    prisonerCavalryDaysThisMonth: 0,
    workMonthIndex: state.monthIndex,
    workPeriodIndex: Math.floor(day / 10),
    workPointsUsed: 0,
    autoAssignmentsThisMonth: 1,
    autoSearchesThisMonth: 1,
  });
  for (const o of state.officers)
    if (
      o.location.kind === 'city' &&
      o.location.cityId === city.id &&
      o.factionId === city.factionId
    )
      Object.assign(o, {
        troops: o.id === manager.id ? 1000 : 0,
        wounded: 0,
        troopType: 'infantry',
        troopExperience: 0,
        reorganizationDays: 0,
        force: 105,
        intellect: 80,
        experience: 500,
        level: 5,
        loyalty: 100,
        equipment: 'Fine arms',
      });
  state.personnelDay = createPersonnelDay(state);
  return { state, city, manager };
}
function invasion(state: V03GameState) {
  const officer = state.officers.find((o) => o.id === 'yuanshao')!;
  const id = 'governor-invasion';
  Object.assign(officer, {
    troops: 3000,
    wounded: 0,
    reorganizationDays: 0,
    location: { kind: 'journey', journeyId: id },
  });
  const service = createV03OrderServices();
  const composition = {
    troopTypes: [officer.troopType],
    cavalryTroops: officer.troopType === 'cavalry' ? 3000 : 0,
    heavySupplyTrain: true,
  };
  const route = service.planRoute({
    state,
    sourceCityId: 'wancheng',
    targetCityId: 'xuchang',
    movingFactionId: 'yuan',
    departureDay: state.absoluteDay,
    troopCount: 3000,
    kind: 'campaign',
    composition,
  })!;
  const journey = service.createJourney({
    id,
    executionId: 'governor-invasion-order',
    ownerFactionId: 'yuan',
    kind: 'campaign',
    intent: 'conquer',
    sourceCityId: 'wancheng',
    targetCityId: 'xuchang',
    departureDay: state.absoluteDay,
    arrivalDay: state.absoluteDay + route.estimatedDays,
    route,
    party: { officerIds: [officer.id], troopCount: 3000, composition },
    cargo: { gold: 0, food: 0, troops: 0 },
    carriedFood: 10_000,
  });
  state.journeys.push(journey);
  return journey;
}

describe('V04-07 governor decisions', () => {
  it.each([
    'buy-food',
    'develop-farming',
    'develop-commerce',
    'recruit',
    'sell-food',
    'relieve',
  ] as const)(
    'previews %s obligations exactly as the committed action, including save continuation',
    (action) => {
      const { state, city } = fixture();
      if (action === 'develop-farming') city.food = 600;
      if (action === 'develop-commerce') city.food = 100_000;
      if (action === 'recruit') Object.assign(city, { food: 100_000, population: 10_000 });
      if (action === 'sell-food') Object.assign(city, { food: 100_000, gold: 0 });
      if (action === 'relieve') Object.assign(city, { food: 100_000, loyalty: 40 });
      expect(validateV03State(state)).toBe(true);
      const before = structuredClone(state);
      const plan = planGovernorMonthlyWork(state, city.id);
      expect(plan.action).toBe(action);
      expect(state).toEqual(before);
      const reloaded = decodeV03Save(encodeV03Save(state));
      const loadedPlan = planGovernorMonthlyWork(reloaded, city.id);
      expect({ ...loadedPlan, snapshot: JSON.parse(loadedPlan.snapshot) }).toEqual({
        ...plan,
        snapshot: JSON.parse(plan.snapshot),
      });
      const result = applyGovernorMonthlyWork(reloaded, loadedPlan);
      expect(result.applied).toBe(true);
      const forecast = forecastCityEconomy(result.state!, city.id);
      expect(forecast.projectedAvailable).toEqual({
        food: plan.projectedFoodAfterWork,
        gold: plan.projectedGoldAfterWork,
      });
      expect(validateV03State(result.state!)).toBe(true);
      expect(applyGovernorMonthlyWork(result.state!, plan).applied).toBe(false);
    },
  );

  it('buys enough food to cover an imminent bill when farming cannot cover it', () => {
    const { state, city } = fixture();
    const before = structuredClone(state);
    const farm = applySharedCityWorkEffect(city, 'develop-farming')!;
    expect(
      forecastCityEconomy(
        { ...state, cities: state.cities.map((c) => (c.id === city.id ? farm : c)) },
        city.id,
      ).projectedAvailable.food,
    ).toBeLessThan(0);
    const plan = planGovernorMonthlyWork(state, city.id);
    expect(state).toEqual(before);
    expect(plan.action).toBe('buy-food');
    const result = applyGovernorMonthlyWork(state, plan);
    expect(result.applied).toBe(true);
    expect(
      forecastCityEconomy(result.state!, city.id).projectedAvailable.food,
    ).toBeGreaterThanOrEqual(0);
    expect(result.city).toMatchObject({ food: 800, gold: 920, farming: 0, workPointsUsed: 1 });
  });

  it('prefers recurring farming when its real next-harvest gain covers the reserve shortfall', () => {
    const { state, city } = fixture();
    city.food = 600; // 492 projected, just below the 500-food minimum buffer.
    const plan = planGovernorMonthlyWork(state, city.id);
    expect(plan.action).toBe('develop-farming');
    expect(
      forecastCityEconomy(applyGovernorMonthlyWork(state, plan).state!, city.id).projectedAvailable
        .food,
    ).toBeGreaterThanOrEqual(500);
  });

  it.each([
    ['allied', 'campaign'],
    ['noncombat', 'transfer'],
  ] as const)('does useful domestic work despite %s traffic', (kind, journeyKind) => {
    const { state, city } = fixture();
    const journey = invasion(state);
    journey.kind = journeyKind;
    if (kind === 'allied') state.alliances.push({ a: 'cao', b: 'yuan', expiresMonthIndex: 12 });
    expect(planGovernorMonthlyWork(state, city.id).action).toBe('buy-food');
  });

  it('buys food and organizes existing reserves before an invasion, including after paid work is spent', () => {
    const { state, city, manager } = fixture();
    invasion(state);
    expect(planGovernorMonthlyWork(state, city.id).action).toBe('buy-food');
    city.food = 10_000;
    city.reservePools = createReservePools(1000);
    city.reserve = 1000;
    city.workPointsUsed = 2;
    const plan = planGovernorMonthlyWork(state, city.id);
    expect(plan).toMatchObject({
      action: 'assign-troops',
      targetOfficerId: manager.id,
      targetTroops: 2000,
      workPoints: 0,
    });
    const result = applyGovernorMonthlyWork(state, plan);
    expect(result.applied).toBe(true);
    expect(result.city).toMatchObject({ garrisonTroops: 2000, reserve: 0, workPointsUsed: 2 });
    expect(result.state!.officers.find((o) => o.id === manager.id)!.reorganizationDays).toBe(0);
  });

  it('restores useful city loyalty before an approaching battle', () => {
    const { state, city } = fixture();
    invasion(state);
    Object.assign(city, { food: 600, gold: 0, loyalty: 40 });
    const plan = planGovernorMonthlyWork(state, city.id);
    expect(plan.action).toBe('security');
    expect(applyGovernorMonthlyWork(state, plan).city!.loyalty).toBeGreaterThan(40);
  });

  it('keeps an active battle as a hard restriction', () => {
    const { state, city } = fixture();
    const journey = invasion(state);
    state.battles.push({
      id: 'active-invasion',
      active: true,
      attackerJourneyId: journey.id,
    } as V03GameState['battles'][number]);
    expect(planGovernorMonthlyWork(state, city.id)).toMatchObject({
      action: null,
      reasonCode: 'city-threatened',
    });
  });

  it('preserves accrued wages before optional equipment or development', () => {
    const { state, city, manager } = fixture();
    Object.assign(city, { food: 100_000, gold: 200, troopServiceDaysThisMonth: 300_000 });
    Object.assign(manager, { equipment: null, force: 100 });
    expect(forecastCityEconomy(state, city.id).projectedAvailable.gold).toBeLessThan(0);
    const before = structuredClone(state);
    const plan = planGovernorMonthlyWork(state, city.id);
    expect(plan).toMatchObject({ action: null, reasonCode: 'insufficient-budget' });
    expect(state).toEqual(before);
  });

  it.each([
    [29, 'develop-commerce'],
    [269, 'develop-farming'],
  ] as const)(
    'compares real marginal production at day %s rather than the lowest sector',
    (day, action) => {
      const { state, city } = fixture(day);
      Object.assign(city, { food: 100_000, farming: 10, commerce: 301 });
      const plan = planGovernorMonthlyWork(state, city.id);
      expect(plan.action).toBe(action);
      expect(applyGovernorMonthlyWork(state, plan).applied).toBe(true);
    },
  );

  it('rejects a stale development plan after a real invasion becomes visible', () => {
    const { state, city } = fixture();
    Object.assign(city, { food: 100_000, farming: 10, commerce: 301 });
    const plan = planGovernorMonthlyWork(state, city.id);
    invasion(state);
    const before = structuredClone(state);
    expect(applyGovernorMonthlyWork(state, plan).applied).toBe(false);
    expect(state).toEqual(before);
  });
});
