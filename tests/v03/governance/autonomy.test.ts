import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import {
  applyGovernorMonthlyWork,
  planGovernorMonthlyWork,
} from '../../../src/v03/governance/autonomy';
import type { V03GameState, V03Journey } from '../../../src/v03/types';

function fixture(): { state: V03GameState; cityId: string } {
  const state = createV03Game('cao', 31);
  const city = state.cities.find(
    (entry) => entry.factionId === state.playerFactionId && entry.id !== state.playerCapitalCityId,
  );
  const officer = state.officers.find(
    (entry) => entry.factionId === state.playerFactionId && entry.alive,
  );
  if (!city || !officer) throw new Error('Expected a non-capital city and a living officer.');
  officer.location = { kind: 'city', cityId: city.id };
  officer.governorOfCityId = city.id;
  city.governorId = officer.id;
  city.governanceMode = 'governor';
  city.farming = 25;
  city.commerce = 75;
  city.gold = 1000;
  city.food = 0;
  officer.troops = 10_000;
  return { state, cityId: city.id };
}

function hostileJourney(cityId: string): V03Journey {
  return {
    id: 'enemy-campaign',
    executionId: 'enemy-order',
    ownerFactionId: 'enemy',
    kind: 'campaign',
    intent: 'conquer',
    sourceCityId: 'enemy-city',
    destinationCityId: cityId,
    routeId: 'enemy-city--target-city',
    routeVersion: 'test',
    routeSnapshot: [],
    roadKmNominal: 100,
    departedAbsoluteDay: 0,
    expectedArrivalDay: 5,
    elapsedDays: 0,
    segmentProgressKm: [],
    segmentWaitDays: [],
    manifest: {
      officerIds: ['enemy-officer'],
      troopCount: 1000,
      composition: { troopTypes: ['infantry'] },
      carriedFood: 1000,
      cargo: { gold: 0, food: 0, troops: 1000 },
    },
    status: 'outbound',
    deliveredCargo: {},
    consumedFood: 0,
    supplyRemainderMicro: 0,
    accumulatedFoodShortfall: 0,
  };
}

describe('v0.3 governor monthly work planning', () => {
  it('includes rear wounded, reserves and captive cavalry in the food forecast', () => {
    const { state, cityId } = fixture();
    const before = planGovernorMonthlyWork(state, cityId, 3);
    state.troopSources.push({
      id: 'recovering-cavalry',
      cityId,
      factionId: state.playerFactionId,
      sourceOfficerId: null,
      autoReturn: false,
      troopType: 'cavalry',
      troops: 500,
      wounded: 1500,
      troopExperience: 1200,
      reorganizationDays: 0,
    });
    const city = state.cities.find((entry) => entry.id === cityId)!;
    city.reservePools.archer.troops += 1000;
    city.reserve += 1000;
    const prisoner = state.officers.find(
      (officer) => officer.factionId !== state.playerFactionId && officer.alive,
    )!;
    Object.assign(prisoner, {
      troops: 100,
      wounded: 900,
      troopType: 'cavalry',
      location: { kind: 'captured', cityId },
    });
    const after = planGovernorMonthlyWork(state, cityId, 3);
    // 2000 cavalry + 1000 archers + 1000 captive cavalry = 7000 ration headcount.
    expect(before.projectedNextMonthFood - after.projectedNextMonthFood).toBe(840);
    expect(after.protectedFood - before.protectedFood).toBe(1680);
  });

  it.each(['departure', 'capture'] as const)(
    'uses a local acting officer for monthly autonomy when the governor is in %s',
    (absence) => {
      const { state, cityId } = fixture();
      const city = state.cities.find((entry) => entry.id === cityId)!;
      const governor = state.officers.find((entry) => entry.id === city.governorId)!;
      const actingOfficer = state.officers.find(
        (entry) =>
          entry.id !== governor.id && entry.factionId === state.playerFactionId && entry.alive,
      )!;
      actingOfficer.location = { kind: 'city', cityId };
      actingOfficer.troops = 0;
      const otherCityId = state.cities.find(
        (entry) => entry.factionId === state.playerFactionId && entry.id !== cityId,
      )!.id;
      for (const officer of state.officers) {
        if (
          officer.id !== governor.id &&
          officer.id !== actingOfficer.id &&
          officer.factionId === state.playerFactionId &&
          officer.location.kind === 'city' &&
          officer.location.cityId === cityId
        )
          officer.location = { kind: 'city', cityId: otherCityId };
      }
      governor.location =
        absence === 'departure'
          ? { kind: 'journey', journeyId: 'governor-away' }
          : { kind: 'captured', cityId };

      const plan = planGovernorMonthlyWork(state, cityId, 3);
      expect(plan.managerOfficerId).toBe(actingOfficer.id);
      expect(plan.action).not.toBeNull();
    },
  );

  it('plans one deterministic, explainable action and applies only its gold cost and one improvement', () => {
    const { state, cityId } = fixture();
    const before = structuredClone(state);
    const first = planGovernorMonthlyWork(state, cityId, 3);
    const repeated = planGovernorMonthlyWork(state, cityId, 3);

    expect(first).toEqual(repeated);
    expect(state).toEqual(before);
    expect(first).toMatchObject({
      cityId,
      managerOfficerId: state.cities.find((city) => city.id === cityId)?.governorId,
      action: 'develop-farming',
      workPoints: 1,
      goldCost: 80,
      reasonCode: 'food-security',
    });

    const result = applyGovernorMonthlyWork(state, first);
    expect(result.applied).toBe(true);
    expect(result.city).toMatchObject({ farming: 26, commerce: 75, gold: 920 });
    expect(state.cities.find((city) => city.id === cityId)?.farming).toBe(25);

    const afterApplying = structuredClone(state);
    Object.assign(
      afterApplying.cities.find((city) => city.id === cityId)!,
      result.city,
    );
    const replay = applyGovernorMonthlyWork(afterApplying, first);
    expect(replay.applied).toBe(false);
    expect(replay.city?.gold).toBe(920);
    expect(replay.city?.farming).toBe(26);
  });

  it('relieves low-loyalty cities when protected food is safe and keeps RNG unchanged', () => {
    const { state, cityId } = fixture();
    const city = state.cities.find((entry) => entry.id === cityId)!;
    city.food = 10_000;
    city.loyalty = 42;
    state.officers.find((officer) => officer.governorOfCityId === cityId)!.troops = 0;
    const before = structuredClone(state);

    const plan = planGovernorMonthlyWork(state, cityId, 3);

    expect(state).toEqual(before);
    expect(plan).toMatchObject({
      action: 'relieve',
      reasonCode: 'population-relief',
      goldCost: 80,
      foodCost: 600,
      loyaltyAtPlan: 42,
    });
    expect(plan.reason).toContain('below 60');
    const result = applyGovernorMonthlyWork(state, plan);
    expect(result.applied).toBe(true);
    expect(result.city).toMatchObject({ loyalty: 57, gold: 920, food: 9400 });
    expect(result.city?.population).toBe(city.population + 300);
    expect(state.rng).toBe(before.rng);
  });

  it('rejects a loyalty plan after the city changes before it is applied', () => {
    const { state, cityId } = fixture();
    const city = state.cities.find((entry) => entry.id === cityId)!;
    city.food = 10_000;
    city.loyalty = 49;
    state.officers.find((officer) => officer.governorOfCityId === cityId)!.troops = 0;
    const plan = planGovernorMonthlyWork(state, cityId, 3);
    expect(plan.action).toBe('relieve');

    city.loyalty = 52;
    expect(applyGovernorMonthlyWork(state, plan).applied).toBe(false);
  });

  it('uses shared security, recruitment, and market effects only when their reserves allow them', () => {
    const { state, cityId } = fixture();
    const city = state.cities.find((entry) => entry.id === cityId)!;
    const manager = state.officers.find((officer) => officer.governorOfCityId === cityId)!;
    manager.troops = 0;
    city.food = 10_000;
    city.reserve = 1000;
    city.reservePools = createReservePools(0, 0, 1000);
    city.loyalty = 60;
    city.gold = 0;
    let plan = planGovernorMonthlyWork(state, cityId, 3);
    expect(plan).toMatchObject({ action: 'security', goldCost: 0, reasonCode: 'public-order' });
    let result = applyGovernorMonthlyWork(state, plan);
    expect(result.applied).toBe(true);
    expect(result.city?.loyalty).toBe(68 + Math.floor(manager.intellect / 20));

    city.loyalty = 80;
    city.reserve = 0;
    city.reservePools = createReservePools();
    city.gold = 1000;
    plan = planGovernorMonthlyWork(state, cityId, 3);
    expect(plan).toMatchObject({
      action: 'recruit',
      goldCost: 600,
      reasonCode: 'reserve-recruitment',
    });
    result = applyGovernorMonthlyWork(state, plan);
    expect(result.applied).toBe(true);
    expect(result.city?.reserve).toBeGreaterThan(0);
    expect(result.city?.population).toBeLessThan(city.population);

    city.reserve = 1000;
    city.reservePools = createReservePools(0, 0, 1000);
    city.population = 1000;
    manager.troops = 5000;
    city.garrisonTroops = 5000;
    city.farming = 500;
    city.commerce = 500;
    city.food = 0;
    city.gold = 1000;
    plan = planGovernorMonthlyWork(state, cityId, 3);
    expect(plan).toMatchObject({ action: 'buy-food', goldCost: 80, reasonCode: 'food-security' });
    result = applyGovernorMonthlyWork(state, plan);
    expect(result.applied).toBe(true);
    expect(result.city).toMatchObject({ gold: 920, food: 800 });

    city.food = 5000;
    city.gold = 0;
    plan = planGovernorMonthlyWork(state, cityId, 3);
    expect(plan).toMatchObject({ action: 'sell-food', goldCost: 0, reasonCode: 'market-balance' });
    result = applyGovernorMonthlyWork(state, plan);
    expect(result.applied).toBe(true);
    expect(result.city).toMatchObject({ gold: 80, food: 4200 });
  });

  it('plans officer loyalty, local search, training, and safe troop assignment deterministically', () => {
    const { state, cityId } = fixture();
    const city = state.cities.find((entry) => entry.id === cityId)!;
    const local = state.officers.filter(
      (officer) =>
        officer.alive &&
        officer.factionId === city.factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    );
    const manager = state.officers.find((officer) => officer.governorOfCityId === cityId)!;
    city.food = 10_000;
    city.farming = 500;
    city.commerce = 500;
    city.loyalty = 80;
    city.reserve = 1000;
    city.reservePools = createReservePools(0, 0, 1000);
    city.gold = 1000;
    for (const officer of local) officer.loyalty = 100;

    manager.loyalty = 60;
    let plan = planGovernorMonthlyWork(state, cityId, 3);
    expect(plan).toMatchObject({ action: 'feast', reasonCode: 'officer-loyalty' });
    let result = applyGovernorMonthlyWork(state, plan);
    expect(result.applied).toBe(true);
    expect(result.state?.officers.find((officer) => officer.id === manager.id)?.loyalty).toBe(68);

    manager.loyalty = 100;
    state.officers.push({
      ...structuredClone(manager),
      id: 'local-neutral',
      factionId: null,
      location: { kind: 'city', cityId },
      governorOfCityId: null,
      troops: 0,
    });
    plan = planGovernorMonthlyWork(state, cityId, 3);
    const repeatedSearchPlan = planGovernorMonthlyWork(state, cityId, 3);
    expect(plan).toEqual(repeatedSearchPlan);
    expect(plan).toMatchObject({ action: 'search', reasonCode: 'local-search' });
    result = applyGovernorMonthlyWork(state, plan);
    expect(result.applied).toBe(true);
    expect(result.state?.rng).not.toBe(state.rng);

    state.officers = state.officers.filter((officer) => officer.id !== 'local-neutral');
    for (const officer of local) officer.troops = 0;
    manager.experience = 90;
    manager.force = 50;
    manager.troops = 1000;
    plan = planGovernorMonthlyWork(state, cityId, 3);
    expect(plan).toMatchObject({ action: 'train', targetOfficerId: manager.id });
    result = applyGovernorMonthlyWork(state, plan);
    expect(result.state?.officers.find((officer) => officer.id === manager.id)).toMatchObject({
      experience: 115,
      level: 1,
    });

    for (const officer of local) {
      officer.force = 100;
      officer.experience = 10_000;
      officer.troops = 0;
    }
    city.reserve = 5000;
    city.reservePools = createReservePools(0, 0, 5000);
    city.garrisonTroops = 0;
    plan = planGovernorMonthlyWork(state, cityId, 3);
    expect(plan).toMatchObject({
      action: 'assign-troops',
      targetOfficerId: manager.id,
      targetTroops: 4000,
    });
    result = applyGovernorMonthlyWork(state, plan);
    expect(result.state?.officers.find((officer) => officer.id === manager.id)?.troops).toBe(4000);
    expect(result.city).toMatchObject({ reserve: 1000, garrisonTroops: 4000 });
  });

  it('ports legacy officer rewards, relief, and fine arms within protected monthly budgets', () => {
    const rewarded = fixture();
    const rewardCity = rewarded.state.cities.find((entry) => entry.id === rewarded.cityId)!;
    const rewardOfficer = rewarded.state.officers.find(
      (officer) => officer.id === rewardCity.governorId,
    )!;
    rewardCity.food = 10_000;
    rewardCity.farming = 500;
    rewardCity.commerce = 500;
    rewardCity.loyalty = 80;
    rewardCity.reserve = 1000;
    rewardCity.reservePools = createReservePools(0, 0, 1000);
    rewardOfficer.troops = 0;
    rewardOfficer.loyalty = 40;
    for (const officer of rewarded.state.officers.filter(
      (entry) => entry.location.kind === 'city' && entry.location.cityId === rewarded.cityId,
    ))
      if (officer.id !== rewardOfficer.id) officer.loyalty = 100;

    const rewardPlan = planGovernorMonthlyWork(rewarded.state, rewarded.cityId, 3);
    expect(rewardPlan).toMatchObject({
      action: 'reward',
      targetOfficerId: rewardOfficer.id,
      goldCost: 100,
      foodCost: 0,
      reasonCode: 'officer-reward',
    });
    const rewardResult = applyGovernorMonthlyWork(rewarded.state, rewardPlan);
    expect(rewardResult.applied).toBe(true);
    expect(rewardResult.city?.gold).toBe(rewardCity.gold - 100);
    expect(
      rewardResult.state?.officers.find((entry) => entry.id === rewardOfficer.id)?.loyalty,
    ).toBe(55);

    const relieved = fixture();
    const reliefCity = relieved.state.cities.find((entry) => entry.id === relieved.cityId)!;
    reliefCity.food = 10_000;
    reliefCity.loyalty = 55;
    reliefCity.gold = 1000;
    const reliefPopulation = reliefCity.population;
    const reliefPlan = planGovernorMonthlyWork(relieved.state, relieved.cityId, 3);
    expect(reliefPlan).toMatchObject({
      action: 'relieve',
      goldCost: 80,
      foodCost: 600,
      reasonCode: 'population-relief',
    });
    const reliefResult = applyGovernorMonthlyWork(relieved.state, reliefPlan);
    expect(reliefResult.applied).toBe(true);
    expect(reliefResult.city).toMatchObject({
      gold: 920,
      food: 9400,
      loyalty: 70,
      population: reliefPopulation + 300,
    });

    const equipped = fixture();
    const equipmentCity = equipped.state.cities.find((entry) => entry.id === equipped.cityId)!;
    const equipmentOfficer = equipped.state.officers.find(
      (officer) => officer.id === equipmentCity.governorId,
    )!;
    equipmentCity.food = 10_000;
    equipmentCity.farming = 500;
    equipmentCity.commerce = 500;
    equipmentCity.loyalty = 80;
    equipmentCity.reserve = 1000;
    equipmentCity.reservePools = createReservePools(0, 0, 1000);
    equipmentCity.gold = 1000;
    for (const officer of equipped.state.officers.filter(
      (entry) => entry.location.kind === 'city' && entry.location.cityId === equipped.cityId,
    )) {
      officer.loyalty = 100;
      officer.troops = 0;
      officer.experience = 10_000;
      officer.force = 100;
    }
    equipmentOfficer.force = 102;

    const equipmentPlan = planGovernorMonthlyWork(equipped.state, equipped.cityId, 3);
    expect(equipmentPlan).toMatchObject({
      action: 'equip',
      targetOfficerId: equipmentOfficer.id,
      goldCost: 180,
      reasonCode: 'equipment-issue',
    });
    const equipmentResult = applyGovernorMonthlyWork(equipped.state, equipmentPlan);
    expect(equipmentResult.applied).toBe(true);
    expect(equipmentResult.city?.gold).toBe(820);
    expect(
      equipmentResult.state?.officers.find((entry) => entry.id === equipmentOfficer.id),
    ).toMatchObject({
      equipment: 'Fine arms',
      force: 105,
    });

    const saved = structuredClone(equipmentResult.state!);
    expect(applyGovernorMonthlyWork(saved, equipmentPlan).applied).toBe(false);
  });

  it('protects food committed to accepted orders and the next-month upkeep buffer', () => {
    const { state, cityId } = fixture();
    const city = state.cities.find((entry) => entry.id === cityId)!;
    city.gold = 120;
    city.food = 100;
    state.requisitions.push({
      id: 'approved-food',
      factionId: state.playerFactionId,
      sourceCityId: cityId,
      targetCityId: 'friend',
      requested: { gold: 0, food: 500, troops: 0 },
      proposed: { gold: 50, food: 500, troops: 0 },
      createdDay: state.absoluteDay,
      requestedByDay: null,
      earliestDepartureDay: state.absoluteDay,
      estimatedArrivalDay: state.absoluteDay + 10,
      status: 'accepted',
      journeyId: null,
      governanceRevision: state.governanceRevision,
      message: 'Approved.',
    });

    const plan = planGovernorMonthlyWork(state, cityId, 3);
    expect(plan.action).toBeNull();
    expect(plan.reasonCode).toBe('approved-order-reserve');
    expect(plan.reservedGold).toBe(50);
    expect(plan.reservedFood).toBe(500);
    expect(plan.protectedFood).toBeGreaterThanOrEqual(1000);
  });

  it('pauses development under an incoming hostile force and reports the reason', () => {
    const { state, cityId } = fixture();
    state.journeys.push(hostileJourney(cityId));

    const plan = planGovernorMonthlyWork(state, cityId, 3);

    expect(plan.action).toBeNull();
    expect(plan.reasonCode).toBe('city-threatened');
  });

  it('does not give work to a ruler capital or a city without local staff', () => {
    const { state, cityId } = fixture();
    const capital = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
    const capitalPlan = planGovernorMonthlyWork(state, capital.id, 3);
    expect(capitalPlan.action).toBeNull();
    expect(capitalPlan.reasonCode).toBe('manager-unavailable');

    state.officers = state.officers.filter(
      (officer) => !(officer.location.kind === 'city' && officer.location.cityId === cityId),
    );
    const unstaffed = planGovernorMonthlyWork(state, cityId, 3);
    expect(unstaffed.action).toBeNull();
    expect(unstaffed.reasonCode).toBe('manager-unavailable');
  });

  it('rejects invalid month numbers rather than generating inconsistent seasonal forecasts', () => {
    const { state, cityId } = fixture();
    expect(() => planGovernorMonthlyWork(state, cityId, 0)).toThrow(
      'settledMonth must be between 1 and 12.',
    );
  });
});
