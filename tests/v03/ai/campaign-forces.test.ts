import { describe, expect, it, vi } from 'vitest';
import { planStrategicRivalCampaigns } from '../../../src/v03/strategic-ai';
import { dispatchRivalCampaignPlan } from '../../../src/v03/engine';
import { forecastCityEconomy } from '../../../src/v03/campaign/economy';
import { createV03Game } from '../../../src/v03/initial-state';
import { createV03OrderServices } from '../../../src/v03/governance/services';
import { estimateCampaignSupply } from '../../../src/v03/calendar';
import { incomingCampaignThreats } from '../../../src/v03/ai/campaign-threats';
import { forecastCampaignHome } from '../../../src/v03/ai/campaign-home';
import { createAiDecisionTrace, withAiDecisionTrace } from '../../../src/v03/ai/decision-trace';
import { estimateCampaignMatchup } from '../../../src/v03/ai/campaign-strength';
import { rivalDecisionFixture } from '../helpers/ai-fixtures';

function inboundCampaign(state: ReturnType<typeof rivalDecisionFixture>) {
  const source = state.cities.find((city) => city.id === 'jinyang')!;
  source.factionId = 'cao';
  const officer = createV03Game('cao', 17).officers.find((entry) => entry.id === 'caocao')!;
  Object.assign(officer, {
    troops: 5000,
    wounded: 0,
    reorganizationDays: 0,
    location: { kind: 'journey', journeyId: 'incoming-campaign' },
  });
  state.officers.push(officer);
  const services = createV03OrderServices();
  const composition = {
    troopTypes: [officer.troopType],
    cavalryTroops: 5000,
    heavySupplyTrain: true,
  };
  const route = services.planRoute({
    state,
    sourceCityId: 'jinyang',
    targetCityId: 'ye',
    movingFactionId: 'cao',
    departureDay: state.absoluteDay,
    troopCount: 5000,
    kind: 'campaign',
    composition,
  })!;
  const journey = services.createJourney({
    id: 'incoming-campaign',
    executionId: 'incoming-order',
    ownerFactionId: 'cao',
    kind: 'campaign',
    intent: 'conquer',
    sourceCityId: 'jinyang',
    targetCityId: 'ye',
    departureDay: state.absoluteDay,
    arrivalDay: state.absoluteDay + route.estimatedDays,
    route,
    party: { officerIds: [officer.id], troopCount: 5000, composition },
    cargo: { gold: 0, food: 0, troops: 0 },
    carriedFood: 100_000,
  });
  state.journeys.push(journey);
  return journey;
}

describe('V04-06 viable campaign forces', () => {
  it('uses a sufficient small force for an empty city instead of consuming the maximum army', () => {
    const state = rivalDecisionFixture();
    state.cities.find((city) => city.id === 'pingyuan')!.garrisonTroops = 0;
    const plan = planStrategicRivalCampaigns(state, { factionId: 'yuan' })[0]!;
    expect(plan.targetCityId).toBe('pingyuan');
    expect(plan.requestedTroops).toBe(1000);
    expect(plan.officerIds).toHaveLength(1);
  });

  it('does not fund a departure that leaves the next actual home food bill uncovered', () => {
    const state = rivalDecisionFixture();
    state.cities = state.cities.filter((city) => city.id !== 'jinyang');
    const home = state.cities.find((city) => city.id === 'ye')!;
    Object.assign(home, { population: 0, farming: 0 });
    state.cities.find((city) => city.id === 'pingyuan')!.garrisonTroops = 0;
    const expensive = planStrategicRivalCampaigns(state, { factionId: 'yuan' })[0]!;
    home.food = expensive.food + 1;
    const before = structuredClone(state);
    const plans = planStrategicRivalCampaigns(state, { factionId: 'yuan' });
    expect(state).toEqual(before);
    for (const plan of plans) {
      const committed = structuredClone(state);
      expect(dispatchRivalCampaignPlan(committed, plan)).toBe(true);
      expect(forecastCityEconomy(committed, 'ye').projectedAvailable.food).toBeGreaterThanOrEqual(
        0,
      );
    }
  });

  it('keeps the field army at home when a credible invasion would overwhelm the remainder', () => {
    const state = rivalDecisionFixture();
    inboundCampaign(state);
    const before = structuredClone(state);
    expect(planStrategicRivalCampaigns(state, { factionId: 'yuan' })).toEqual([]);
    expect(state).toEqual(before);
    state.journeys = [];
    expect(planStrategicRivalCampaigns(state, { factionId: 'yuan' }).length).toBeGreaterThan(0);
  });

  it.each(['allied', 'transfer', 'returning', 'cancelled'] as const)(
    'does not mistake an %s journey for an invasion',
    (kind) => {
      const state = rivalDecisionFixture();
      const journey = inboundCampaign(state);
      if (kind === 'allied') state.alliances.push({ a: 'cao', b: 'yuan', expiresMonthIndex: 3 });
      else if (kind === 'transfer') journey.kind = 'transfer';
      else if (kind === 'returning') journey.status = 'returning';
      else journey.returnRequested = true;
      expect(planStrategicRivalCampaigns(state, { factionId: 'yuan' }).length).toBeGreaterThan(0);
    },
  );
});

describe('campaign estimates and actual commitment', () => {
  it('matches the post-dispatch bill while leaving wounded at home and charging the exact healthy party', () => {
    const state = rivalDecisionFixture();
    state.officers.forEach((officer, index) => (officer.wounded = (index + 1) * 17));
    const before = structuredClone(state);
    const plan = planStrategicRivalCampaigns(state, { factionId: 'yuan' })[0]!;
    const forecast = forecastCampaignHome(state, 'ye', plan.officerIds, plan.food);
    expect(state).toEqual(before);
    const party = state.officers.filter((officer) => plan.officerIds.includes(officer.id));
    const wounded = party.reduce((sum, officer) => sum + officer.wounded, 0);
    expect(dispatchRivalCampaignPlan(state, plan)).toBe(true);
    expect(forecastCityEconomy(state, 'ye')).toEqual(forecast);
    expect(state.journeys[0]!.manifest.troopCount).toBe(plan.requestedTroops);
    expect(state.journeys[0]!.manifest.officerIds).toEqual(plan.officerIds);
    expect(state.journeys[0]!.manifest.carriedFood).toBe(plan.food);
    expect(party.every((officer) => officer.wounded === 0)).toBe(true);
    expect(
      state.troopSources
        .filter((source) => source.cityId === 'ye')
        .reduce((sum, source) => sum + source.wounded, 0),
    ).toBe(wounded);
    expect(state.rng).toBe(before.rng);
    expect(state.nextId).toBe(before.nextId + 2 + party.length);
  });

  it.each(['new invasion', 'home bill', 'reinforced target'] as const)(
    'revalidates %s before any dispatch debit or ID allocation',
    (change) => {
      const state = rivalDecisionFixture();
      state.cities.find((city) => city.id === 'pingyuan')!.garrisonTroops = 0;
      const plan = planStrategicRivalCampaigns(state, { factionId: 'yuan' })[0]!;
      if (change === 'new invasion') inboundCampaign(state);
      else if (change === 'home bill')
        Object.assign(
          state.cities.find((city) => city.id === 'ye')!,
          { food: plan.food, farming: 0, population: 0 },
        );
      else state.cities.find((city) => city.id === plan.targetCityId)!.garrisonTroops = 50_000;
      const before = structuredClone(state);
      expect(dispatchRivalCampaignPlan(state, plan)).toBe(false);
      expect(state).toEqual(before);
    },
  );

  it('uses route progress for threat ETA and ignores an army with no deployable healthy troops', () => {
    const state = rivalDecisionFixture();
    const journey = inboundCampaign(state);
    journey.expectedArrivalDay = state.absoluteDay + 1;
    const before = structuredClone(state);
    const threats = incomingCampaignThreats(state, 'ye');
    expect(threats).toHaveLength(1);
    expect(threats[0]!.daysUntilArrival).toBeGreaterThan(1);
    expect(incomingCampaignThreats(state, 'ye', 1)).toEqual([]);
    expect(state).toEqual(before);
    state.officers.find((officer) => officer.id === 'caocao')!.troops = 0;
    expect(incomingCampaignThreats(state, 'ye')).toEqual([]);
  });

  it('bounds route/supply evaluations and emits distinct whole-officer parties', () => {
    const state = rivalDecisionFixture();
    const template = state.cities.find((city) => city.id === 'pingyuan')!;
    for (const id of ['beiping', 'puyang', 'luoyang'])
      state.cities.push({ ...structuredClone(template), id });
    const services = {
      planRoute: vi.fn(createV03OrderServices().planRoute),
      estimateSupply: vi.fn(estimateCampaignSupply),
    };
    const trace = createAiDecisionTrace(1000);
    withAiDecisionTrace(trace, () =>
      planStrategicRivalCampaigns(state, { factionId: 'yuan', services }),
    );
    expect(services.planRoute.mock.calls.length).toBeGreaterThan(0);
    expect(services.planRoute.mock.calls.length).toBeLessThanOrEqual(9);
    expect(services.estimateSupply.mock.calls.length).toBeLessThanOrEqual(9);
    const parties = new Map<string, Set<string>>();
    for (const event of trace.events) {
      if (event.kind !== 'campaign' || !event.officerIds || event.status === 'selected') continue;
      const key = `${event.sourceCityId}:${event.targetCityId}`;
      const ids = [...event.officerIds].sort().join('|');
      const seen = parties.get(key) ?? new Set<string>();
      expect(seen.has(ids)).toBe(false);
      seen.add(ids);
      parties.set(key, seen);
      expect(event.officerIds.length).toBeLessThanOrEqual(10);
    }
    expect(parties.size).toBeLessThanOrEqual(3);
    expect([...parties.values()].every((parties) => parties.size <= 3)).toBe(true);
  });

  it('reports a measurable preparation deficit and reconsiders a changed opportunity', () => {
    const state = rivalDecisionFixture();
    state.cities
      .filter((city) => city.id !== 'ye')
      .forEach((city) => (city.garrisonTroops = 50_000));
    const trace = createAiDecisionTrace(1000);
    expect(
      withAiDecisionTrace(trace, () => planStrategicRivalCampaigns(state, { factionId: 'yuan' })),
    ).toEqual([]);
    const wait = trace.events.find((event) => event.kind === 'campaign' && event.status === 'wait');
    expect(wait).toMatchObject({ reason: 'insufficient-force', score: 0 });
    expect(wait?.kind === 'campaign' && wait.forceDeficit).toBeGreaterThan(0);
    state.cities.find((city) => city.id === 'pingyuan')!.garrisonTroops = 1000;
    expect(planStrategicRivalCampaigns(state, { factionId: 'yuan' })).toHaveLength(1);
  });

  it('uses force, intellect, experience and troop matchup rather than headcount alone', () => {
    const attacker = {
      id: 'a',
      name: 'A',
      troopType: 'infantry' as const,
      troops: 1000,
      force: 50,
      intellect: 40,
    };
    const defender = {
      id: 'd',
      name: 'D',
      troopType: 'archer' as const,
      troops: 1000,
      force: 70,
      intellect: 40,
    };
    const route = ['ye', 'pingyuan'];
    const baseline = estimateCampaignMatchup([attacker], [defender], route);
    for (const improvement of [
      { force: 100 },
      { intellect: 120 },
      { troopExperience: 1900 },
      { troopType: 'cavalry' as const },
    ]) {
      const improved = estimateCampaignMatchup(
        [{ ...attacker, ...improvement }],
        [defender],
        route,
      );
      expect(improved.ratio, JSON.stringify(improvement)).toBeGreaterThan(baseline.ratio);
    }
    expect(attacker.troops).toBe(1000);
    expect(defender.troops).toBe(1000);
  });
});
