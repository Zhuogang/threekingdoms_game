import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { advanceV03 } from '../../../src/v03/engine';
import {
  applyV03CityAction,
  cityDevelopmentCaps,
  cityFoodTradeFood,
  developmentGain,
  getV03CityActionAvailability,
  politicsFactor,
  reliefPopulation,
  securityLoyaltyGain,
} from '../../../src/v03/governance/city-actions';
import { planGovernorMonthlyWork } from '../../../src/v03/governance/autonomy';
import { rankWorkExecutors } from '../../../src/v03/ui/panels/CityWorkAssignment';
import type { V03GameState, V03Officer } from '../../../src/v03/types';

function capital() {
  const state = createV03Game('cao', 51);
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  const officer = state.officers.find(
    (entry) =>
      entry.alive &&
      entry.factionId === state.playerFactionId &&
      entry.location.kind === 'city' &&
      entry.location.cityId === city.id,
  )!;
  Object.assign(city, {
    gold: 5000,
    food: 20_000,
    population: 20_000,
    loyalty: 40,
    farming: 100,
    commerce: 100,
    workMonthIndex: state.monthIndex,
    workPointsUsed: 0,
  });
  return { state, city, officer };
}

// Expected values written out from 0.7 + politics / 200 so the tests do not reuse the helpers.
const EXPECTED = {
  30: { farming: 17, commerce: 9, security: 9, relief: 1275, trade: 1700 },
  50: { farming: 19, commerce: 10, security: 10, relief: 1425, trade: 1900 },
  90: { farming: 23, commerce: 12, security: 12, relief: 1725, trade: 2300 },
} as const;

describe('O-03 politics drives civil work', () => {
  it('scales the factor as 0.7 + politics / 200', () => {
    expect(politicsFactor({ politics: 60 })).toBe(1);
    expect(politicsFactor({ politics: 30 })).toBeCloseTo(0.85);
    expect(politicsFactor({ politics: 90 })).toBeCloseTo(1.15);
  });

  describe.each([30, 50, 90] as const)('executor politics %s', (politics) => {
    const expected = EXPECTED[politics];
    const run = (action: Parameters<typeof applyV03CityAction>[1]['action']) => {
      const { state, city, officer } = capital();
      // High intellect and force prove those stats no longer matter here.
      Object.assign(officer, { politics, intellect: 100, force: 100 });
      const result = applyV03CityAction(state, { cityId: city.id, action, officerId: officer.id });
      expect(result.ok, result.error).toBe(true);
      const after = result.state.cities.find((entry) => entry.id === city.id)!;
      return { city, after, result };
    };

    it('develops farming and commerce by the scaled amount', () => {
      const farm = run('develop-farming');
      expect(farm.after.farming - farm.city.farming).toBe(expected.farming);
      expect(farm.result.message).toContain(`improved by ${expected.farming}`);
      const market = run('develop-commerce');
      expect(market.after.commerce - market.city.commerce).toBe(expected.commerce);
    });

    it('restores 8 + floor(politics / 20) loyalty with security', () => {
      const { city, after } = run('security');
      expect(after.loyalty - city.loyalty).toBe(expected.security);
    });

    it('settles scaled population with relief', () => {
      const { city, after } = run('relieve');
      expect(after.population - city.population).toBe(expected.relief);
    });

    it('moves scaled food per 200 gold when buying and selling', () => {
      const buy = run('buy-food');
      expect(buy.after.food - buy.city.food).toBe(expected.trade);
      expect(buy.city.gold - buy.after.gold).toBe(200);
      const sell = run('sell-food');
      expect(sell.city.food - sell.after.food).toBe(expected.trade);
      expect(sell.after.gold - sell.city.gold).toBe(200);
    });

    it('previews the same numbers the action applies', () => {
      const { state, city, officer } = capital();
      officer.politics = politics;
      expect(developmentGain('develop-farming', officer)).toBe(expected.farming);
      expect(developmentGain('develop-commerce', officer)).toBe(expected.commerce);
      expect(securityLoyaltyGain(officer)).toBe(expected.security);
      expect(reliefPopulation(officer)).toBe(expected.relief);
      expect(cityFoodTradeFood(officer)).toBe(expected.trade);
      // The work preview runs the real action on a copy: it must not touch the state.
      const before = structuredClone(state);
      for (const action of ['develop-farming', 'security', 'relieve', 'buy-food'] as const) {
        const input = { cityId: city.id, action, officerId: officer.id };
        expect(getV03CityActionAvailability(state, input).ok).toBe(true);
        const applied = applyV03CityAction(state, input);
        expect(applied.ok, applied.error).toBe(true);
      }
      expect(state).toEqual(before);
    });
  });

  it('keeps recruitment on force, whatever the politics', () => {
    const { state, city, officer } = capital();
    const recruit = (politics: number) => {
      const copy = structuredClone(state);
      copy.officers.find((entry) => entry.id === officer.id)!.politics = politics;
      return applyV03CityAction(copy, {
        cityId: city.id,
        action: 'recruit',
        officerId: officer.id,
      });
    };
    const low = recruit(0);
    const high = recruit(100);
    expect(low.ok, low.error).toBe(true);
    expect(low.state.cities.find((entry) => entry.id === city.id)!.reserve).toBe(
      high.state.cities.find((entry) => entry.id === city.id)!.reserve,
    );
  });

  describe('executor recommendation', () => {
    const officers = [
      { id: 'a', force: 95, intellect: 40, leadership: 50, politics: 30, cityWork: undefined },
      { id: 'b', force: 40, intellect: 95, leadership: 40, politics: 50, cityWork: undefined },
      { id: 'c', force: 50, intellect: 50, leadership: 95, politics: 40, cityWork: undefined },
      { id: 'd', force: 30, intellect: 60, leadership: 30, politics: 95, cityWork: undefined },
    ];
    it.each([
      ['recruit', 'a'],
      ['train', 'c'],
      ['search', 'b'],
      ['develop-farming', 'd'],
      ['develop-commerce', 'd'],
      ['security', 'd'],
      ['relieve', 'd'],
      ['buy-food', 'd'],
      ['sell-food', 'd'],
    ] as const)('ranks the best %s executor first', (action, best) => {
      expect(rankWorkExecutors(officers, action, 0)[0]!.id).toBe(best);
    });

    it('picks the highest-politics local officer when the player names no executor', () => {
      const { state, city, officer } = capital();
      const rival = state.officers.find(
        (entry) =>
          entry.id !== officer.id &&
          entry.alive &&
          entry.factionId === state.playerFactionId &&
          entry.location.kind === 'city',
      )!;
      rival.location = { kind: 'city', cityId: city.id };
      officer.politics = 20;
      rival.politics = 99;
      const farming = city.farming;
      const result = applyV03CityAction(state, { cityId: city.id, action: 'develop-farming' });
      expect(result.ok, result.error).toBe(true);
      const gain = result.state.cities.find((entry) => entry.id === city.id)!.farming - farming;
      expect(gain).toBe(developmentGain('develop-farming', rival));
    });
  });

  it('lets a governor planner prefer the highest-politics local officer as manager', () => {
    const state = createV03Game('cao', 17);
    const city = state.cities.find((entry) => entry.id === 'xuchang')!;
    city.governorId = null;
    city.governanceMode = 'steward';
    const visitor = state.officers.find(
      (entry) =>
        entry.alive &&
        entry.factionId === city.factionId &&
        entry.location.kind === 'city' &&
        entry.location.cityId !== city.id,
    )!;
    visitor.location = { kind: 'city', cityId: city.id };
    const locals = state.officers.filter(
      (entry) =>
        entry.alive &&
        entry.factionId === city.factionId &&
        entry.location.kind === 'city' &&
        entry.location.cityId === city.id,
    );
    expect(locals.length).toBeGreaterThanOrEqual(2);
    for (const entry of locals) {
      entry.politics = 30;
      entry.intellect = 90;
    }
    const clerk = locals[locals.length - 1]!;
    clerk.politics = 85;
    clerk.intellect = 40;
    expect(planGovernorMonthlyWork(state, city.id).managerOfficerId).toBe(clerk.id);
  });

  it('a politics-90 governor leaves farming at least 20% higher than a politics-40 one after 12 months', () => {
    const run = (politics: number) => {
      let state: V03GameState = createV03Game('cao', 17);
      // Peace keeps the year free of battles; chengdu's high ceiling keeps it from capping out.
      state.alliances = state.factions.flatMap((a, i) =>
        state.factions.slice(i + 1).map((b) => ({ a: a.id, b: b.id, expiresMonthIndex: 24 })),
      );
      const old = state.cities.find((entry) => entry.id === 'xuchang')!;
      const governor: V03Officer = state.officers.find((entry) => entry.id === old.governorId)!;
      old.governorId = null;
      old.governanceMode = 'steward';
      const city = state.cities.find((entry) => entry.id === 'chengdu')!;
      Object.assign(city, {
        factionId: 'cao',
        governorId: governor.id,
        governanceMode: 'governor',
        farming: 0,
        commerce: 300,
        population: 10_000,
        gold: 800,
        food: 200_000,
      });
      governor.governorOfCityId = city.id;
      governor.location = { kind: 'city', cityId: city.id };
      governor.politics = politics;
      for (let i = 0; i < 2000 && state.absoluteDay < 360 && state.phase !== 'finished'; i++) {
        state.events.forEach((event) => (event.acknowledged = true));
        state = advanceV03(state, 1).state;
      }
      expect(state.absoluteDay).toBe(360);
      return state.cities.find((entry) => entry.id === 'chengdu')!.farming;
    };
    const strong = run(90);
    const weak = run(40);
    expect(strong).toBeLessThan(cityDevelopmentCaps('chengdu').farming);
    expect(strong).toBeGreaterThanOrEqual(weak * 1.2);
  }, 120_000);
});
