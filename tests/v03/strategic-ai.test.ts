import { describe, expect, it, vi } from 'vitest';
import { createV03Game } from '../../src/v03/initial-state';
import { createV03OrderServices } from '../../src/v03/governance/services';
import { estimateCampaignSupply } from '../../src/v03/calendar';
import { ROUTE_DEFINITIONS } from '../../src/v03/geography';
import { planStrategicRivalCampaigns } from '../../src/v03/strategic-ai';
import type { V03CampaignDirective, V03City, V03GameState, V03Officer } from '../../src/v03/types';

function city(id: string, factionId: string | null, garrisonTroops: number, food = 50000): V03City {
  return {
    id,
    name: id,
    chinese: id,
    region: 'test',
    factionId,
    population: 100000,
    farming: 100,
    commerce: 100,
    loyalty: 80,
    gold: 10000,
    food,
    reserve: 0,
    garrisonTroops,
    governorId: null,
    pendingAppointment: null,
    governanceMode: factionId ? 'steward' : 'steward',
  };
}

function officer(
  id: string,
  factionId: string,
  cityId: string,
  troops = 1000,
  force = 70,
  troopType: V03Officer['troopType'] = 'infantry',
): V03Officer {
  return {
    id,
    name: id,
    chinese: id,
    factionId,
    location: { kind: 'city', cityId },
    force,
    intellect: 70,
    loyalty: 80,
    age: 35,
    troops,
    troopType,
    experience: 0,
    level: 0,
    governorOfCityId: null,
    alive: true,
  };
}

function fixture(): V03GameState {
  const state = structuredClone(createV03Game('cao', 17));
  const yuan = state.factions.find((faction) => faction.id === 'yuan')!;
  state.cities = [
    city('ye', 'yuan', 6000),
    city('jinyang', 'cao', 3000),
    city('pingyuan', null, 0),
  ];
  state.officers = Array.from({ length: 6 }, (_, index) =>
    officer(
      index === 0 ? yuan.leaderOfficerId : `yuan-officer-${index}`,
      'yuan',
      'ye',
      1000,
      90 - index,
      (['infantry', 'cavalry', 'archer', 'infantry', 'cavalry', 'archer'] as const)[index]!,
    ),
  );
  state.requisitions = [];
  state.directives = [];
  state.journeys = [];
  state.battles = [];
  return state;
}

function directive(
  factionId: string,
  sourceCityId: string,
  targetCityId: string,
  status: V03CampaignDirective['status'],
): V03CampaignDirective {
  return {
    id: `${sourceCityId}-order`,
    factionId,
    sourceCityId,
    targetCityId,
    intent: 'conquer',
    requestedTroops: 1000,
    proposedTroops: 1000,
    requestedByDay: null,
    earliestDepartureDay: null,
    estimatedArrivalDay: null,
    status,
    journeyId: null,
    governanceRevision: 0,
    message: '',
  };
}

describe('v0.3 strategic rival planning', () => {
  it('returns a repeatable, executable enemy campaign without mutating the snapshot', () => {
    const state = fixture();
    const before = structuredClone(state);

    const first = planStrategicRivalCampaigns(state);
    const second = planStrategicRivalCampaigns(state);

    expect(first).toEqual(second);
    expect(state).toEqual(before);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      factionId: 'yuan',
      sourceCityId: 'ye',
      targetCityId: 'pingyuan',
      intent: 'conquer',
      requestedByDay: null,
      requestedTroops: 5000,
      proposedTroops: 5000,
      departureDay: state.absoluteDay,
      estimatedArrivalDay: state.absoluteDay + first[0]!.route.estimatedDays,
    });
    expect(first[0]!.officerIds).toHaveLength(5);
    expect(first[0]!.party.composition).toMatchObject({
      troopTypes: ['infantry', 'cavalry', 'archer', 'infantry', 'cavalry'],
      heavySupplyTrain: true,
    });
    expect(first[0]!.route.routeId).toBe('pingyuan--ye');
    expect(first[0]!.food).toBe(first[0]!.supply.totalFood);
  });

  it('uses the shared route and campaign-supply contracts, including the battle reserve', () => {
    const state = fixture();
    const orderServices = createV03OrderServices();
    const estimateSupply = vi.fn(estimateCampaignSupply);
    const plans = planStrategicRivalCampaigns(state, {
      services: {
        planRoute: orderServices.planRoute,
        estimateSupply,
      },
    });

    expect(plans).toHaveLength(1);
    expect(estimateSupply).toHaveBeenCalledWith({
      troopCount: plans[0]!.requestedTroops,
      outboundDays: plans[0]!.route.estimatedDays,
      battleDays: 30,
      returnDays: plans[0]!.route.estimatedDays,
    });
    expect(plans[0]!.estimatedArrivalDay).toBe(state.absoluteDay + plans[0]!.route.estimatedDays);
  });

  it('treats an independent city as a valid target and never selects a friendly city', () => {
    const state = fixture();
    expect(planStrategicRivalCampaigns(state)[0]?.targetCityId).toBe('pingyuan');
    state.cities.find((entry) => entry.id === 'pingyuan')!.factionId = 'yuan';

    const plansAfterOccupation = planStrategicRivalCampaigns(state);
    expect(plansAfterOccupation.every((plan) => plan.targetCityId !== 'pingyuan')).toBe(true);
    expect(plansAfterOccupation[0]?.targetCityId).toBe('jinyang');
  });

  it('ranks a zero-garrison independent city as the 500 militia its battle receives', () => {
    const state = fixture();
    state.cities.find((entry) => entry.id === 'jinyang')!.garrisonTroops = 450;
    state.officers.push(officer('cao-defender', 'cao', 'jinyang', 450));

    expect(planStrategicRivalCampaigns(state)[0]?.targetCityId).toBe('jinyang');
  });

  it('does not give a capital a target-priority bonus', () => {
    const state = fixture();
    state.cities.find((entry) => entry.id === 'jinyang')!.garrisonTroops = 1000;
    state.factions.find((entry) => entry.id === 'cao')!.capitalCityId = 'jinyang';

    expect(planStrategicRivalCampaigns(state)[0]?.targetCityId).toBe('pingyuan');
  });

  it('does not duplicate active source orders or attack an occupied target', () => {
    const activeSource = fixture();
    activeSource.directives.push(directive('yuan', 'ye', 'jinyang', 'waiting'));
    expect(planStrategicRivalCampaigns(activeSource)).toEqual([]);

    const activeTarget = fixture();
    activeTarget.directives.push(directive('cao', 'xuchang', 'jinyang', 'dispatched'));
    expect(
      planStrategicRivalCampaigns(activeTarget).every((plan) => plan.targetCityId !== 'jinyang'),
    ).toBe(true);
  });

  it('does not plan when the source lacks available troops or the full campaign ration', () => {
    const troopShortage = fixture();
    troopShortage.cities[0]!.garrisonTroops = 1000;
    expect(planStrategicRivalCampaigns(troopShortage)).toEqual([]);

    const foodShortage = fixture();
    foodShortage.cities[0]!.food = 1;
    expect(planStrategicRivalCampaigns(foodShortage)).toEqual([]);
  });

  it('respects requisition reservations and the shared protected-garrison threshold', () => {
    const state = fixture();
    state.requisitions.push({
      id: 'reserved-troops',
      factionId: 'yuan',
      sourceCityId: 'ye',
      targetCityId: 'ye',
      requested: { gold: 0, food: 0, troops: 5000 },
      proposed: { gold: 0, food: 0, troops: 5000 },
      createdDay: 0,
      requestedByDay: null,
      earliestDepartureDay: null,
      estimatedArrivalDay: null,
      status: 'accepted',
      journeyId: null,
      governanceRevision: 0,
      message: '',
    });

    expect(planStrategicRivalCampaigns(state)).toEqual([]);
  });

  it('rejects an unreachable target and permits only one plan per source in a pass', () => {
    const unreachable = fixture();
    unreachable.cities = [city('ye', 'yuan', 6000), city('chengdu', 'cao', 1000)];
    expect(planStrategicRivalCampaigns(unreachable)).toEqual([]);

    const multipleTargets = fixture();
    const enemyNeighbors = ROUTE_DEFINITIONS.filter(
      (route) => route.fromCityId === 'ye' || route.toCityId === 'ye',
    )
      .map((route) => (route.fromCityId === 'ye' ? route.toCityId : route.fromCityId))
      .filter((cityId) => cityId !== 'jinyang');
    multipleTargets.cities.push(...enemyNeighbors.map((cityId) => city(cityId, 'cao', 1000)));

    const plans = planStrategicRivalCampaigns(multipleTargets, { maxPlansPerFaction: 4 });

    expect(plans.length).toBeLessThanOrEqual(1);
    expect(new Set(plans.map((plan) => plan.sourceCityId)).size).toBe(plans.length);
  });

  it('plans during battles and rejects a finished campaign', () => {
    const state = fixture();
    state.phase = 'battle';
    expect(planStrategicRivalCampaigns(state).length).toBeGreaterThan(0);
    state.phase = 'finished';
    expect(planStrategicRivalCampaigns(state)).toEqual([]);
  });
});
