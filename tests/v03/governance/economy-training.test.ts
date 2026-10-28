import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { advanceV03 } from '../../../src/v03/engine';
import {
  applyGovernorCityAction,
  applyV03CityAction,
  getV03CityActionAvailability,
} from '../../../src/v03/governance/city-actions';
import {
  applyGovernorMonthlyWork,
  planGovernorMonthlyWork,
} from '../../../src/v03/governance/autonomy';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { cityPersonnelSummary } from '../../../src/v03/campaign/personnel';
import { decodeV03Save, encodeV03Save } from '../../../src/v03/platform/storage';
import { localizeRoutineFeedback } from '../../../src/v03/ui/feedback';

const reload = (state: ReturnType<typeof createV03Game>) => decodeV03Save(encodeV03Save(state));
function fixture() {
  const state = createV03Game('cao', 1);
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  const officer = state.officers.find((entry) => entry.id === 'caocao')!;
  city.gold = 1000;
  city.food = 20_000;
  return { state, city, officer };
}

describe('existing economy and training adjustments', () => {
  for (const [field, action, gain] of [
    ['farming', 'develop-farming', 20],
    ['commerce', 'develop-commerce', 10],
  ] as const) {
    it.each([30, 495, 499])(
      `${action} charges 80 gold and one point, clamping the actual gain at 500 from %s`,
      (start) => {
        const { state, city } = fixture();
        city[field] = start;
        const before = structuredClone(state);
        const result = applyV03CityAction(state, { cityId: city.id, action });
        expect(result.ok, result.error).toBe(true);
        const actual = Math.min(gain, 500 - start);
        expect(result.state.cities.find((entry) => entry.id === city.id)).toMatchObject({
          [field]: start + actual,
          gold: 920,
          workPointsUsed: 1,
        });
        expect(result.message).toContain(`improved by ${actual} for 80 gold`);
        expect(localizeRoutineFeedback(result.message!, 'zh', result.state)).toContain(
          `提高了 ${actual}`,
        );
        expect(state).toEqual(before);
      },
    );

    it.each([500, 520])(
      `${action} rejects capped or legacy over-cap development at %s without rescaling`,
      (value) => {
        const { state, city } = fixture();
        city[field] = value;
        const restored = reload(state);
        const result = applyV03CityAction(restored, { cityId: city.id, action });
        expect(result.ok).toBe(false);
        expect(result.state).toBe(restored);
        expect(result.state.cities.find((entry) => entry.id === city.id)![field]).toBe(value);
      },
    );

    it(`${action} uses the same gain and cost for autonomous work`, () => {
      const { state } = fixture();
      const city = state.cities.find((entry) => entry.id === 'xuchang')!;
      city[field] = 100;
      city.gold = 1000;
      const result = applyGovernorCityAction(state, { cityId: city.id, action });
      expect(result.ok, result.error).toBe(true);
      expect(result.state.cities.find((entry) => entry.id === city.id)).toMatchObject({
        [field]: 100 + gain,
        gold: 920,
        workPointsUsed: 1,
      });
    });
  }

  it.each([0, 50, 100])(
    'uses city loyalty %s only in monthly tax, leaving harvest and staffing unchanged',
    (loyalty) => {
      const { state, city } = fixture();
      state.absoluteDay = 29;
      city.loyalty = loyalty;
      city.population = 15_000;
      city.commerce = 200;
      city.farming = 100;
      city.troopServiceDaysThisMonth = city.garrisonTroops * 29;
      const result = advanceV03(state, 1);
      expect(result.daysAdvanced, result.error).toBe(1);
      const settled = result.state.cities.find((entry) => entry.id === city.id)!;
      const tax = Math.floor(210 * (0.8 + loyalty / 500));
      // The seeded ledger covers 29 days; the last day also accounts for reserves.
      const wages = Math.ceil(
        ((city.garrisonTroops * 29 + cityPersonnelSummary(state, city.id).troops) * 0.025) / 30,
      );
      expect(settled.gold).toBe(city.gold + tax - wages);
      const fullLoyalty = structuredClone(state);
      fullLoyalty.cities.find((entry) => entry.id === city.id)!.loyalty = 100;
      const full = advanceV03(fullLoyalty, 1).state.cities.find((entry) => entry.id === city.id)!;
      expect(settled.food).toBe(full.food);
      expect(settled.population).toBe(full.population);
      expect(settled.garrisonTroops).toBe(full.garrisonTroops);
      expect(settled.reserve).toBe(full.reserve);
      expect(reload(result.state)).toEqual(result.state);
    },
  );

  it.each([false, true])(
    'allows XP-only training at the force cap (fine arms: %s), then stops at level five',
    (equipped) => {
      const { state, city, officer } = fixture();
      Object.assign(officer, {
        force: equipped ? 105 : 100,
        equipment: equipped ? 'Fine arms' : null,
        experience: 490,
        level: 4,
      });
      const input = { cityId: city.id, officerId: officer.id, action: 'train' as const };
      expect(getV03CityActionAvailability(state, input).ok).toBe(true);
      const result = applyV03CityAction(state, input);
      expect(result.ok, result.error).toBe(true);
      expect(result.state.officers.find((entry) => entry.id === officer.id)).toMatchObject({
        experience: 500,
        level: 5,
        force: equipped ? 105 : 100,
      });
      expect(result.message).toContain('+10 experience, +0 force and +0 intellect');
      expect(localizeRoutineFeedback(result.message!, 'zh', result.state)).toContain(
        '经验 +10，武力 +0',
      );
      const restored = reload(result.state);
      expect(getV03CityActionAvailability(restored, input).ok).toBe(false);
      expect(applyV03CityAction(restored, input).state).toBe(restored);
    },
  );

  it.each([500, 10_000])(
    'preserves saved XP %s while still allowing force-only training',
    (experience) => {
      const { state, city, officer } = fixture();
      Object.assign(officer, { experience, level: 5, force: 99 });
      const restored = reload(state);
      const input = { cityId: city.id, officerId: officer.id, action: 'train' as const };
      const result = applyV03CityAction(restored, input);
      expect(result.ok, result.error).toBe(true);
      expect(result.state.officers.find((entry) => entry.id === officer.id)).toMatchObject({
        experience,
        level: 5,
        force: 100,
      });
      expect(result.message).toContain('+0 experience, +1 force and +0 intellect');
      expect(reload(result.state)).toEqual(result.state);
      expect(applyV03CityAction(result.state, input).ok).toBe(false);
    },
  );

  it('keeps archer level-up intellect and reports the actual capped gain at full force', () => {
    const { state, city, officer } = fixture();
    Object.assign(officer, {
      troopType: 'archer',
      experience: 90,
      level: 0,
      force: 100,
      intellect: 99,
    });
    const result = applyV03CityAction(state, {
      cityId: city.id,
      officerId: officer.id,
      action: 'train',
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.state.officers.find((entry) => entry.id === officer.id)).toMatchObject({
      experience: 115,
      level: 1,
      force: 100,
      intellect: 100,
    });
    expect(result.message).toContain('+25 experience, +0 force and +1 intellect');
  });

  function autonomous() {
    const { state } = fixture();
    const city = state.cities.find((entry) => entry.id === 'xuchang')!;
    const local = state.officers.filter(
      (entry) =>
        entry.alive &&
        entry.factionId === 'cao' &&
        entry.location.kind === 'city' &&
        entry.location.cityId === city.id,
    );
    const manager = local.find((entry) => entry.id === city.governorId) ?? local[0]!;
    Object.assign(city, {
      food: 100_000,
      gold: 1000,
      loyalty: 100,
      farming: 300,
      commerce: 300,
      reserve: 3000,
      reservePools: createReservePools(1000, 1000, 1000),
    });
    for (const officer of local)
      Object.assign(officer, { troops: 1000, force: 100, experience: 500, level: 5, loyalty: 100 });
    state.officers = state.officers.filter(
      (entry) =>
        !(
          entry.factionId === null &&
          entry.location.kind === 'city' &&
          entry.location.cityId === city.id
        ),
    );
    return { state, city, manager };
  }

  it.each([55, 60, 91, 100])(
    'does not schedule routine feasts or rewards at officer loyalty %s',
    (loyalty) => {
      const { state, city, manager } = autonomous();
      manager.loyalty = loyalty;
      const plan = planGovernorMonthlyWork(state, city.id, 1);
      expect(plan.action).toBe('develop-farming');
      const result = applyGovernorMonthlyWork(state, plan);
      expect(result.applied).toBe(true);
      expect(result.state!.officers.find((entry) => entry.id === manager.id)!.loyalty).toBe(
        loyalty,
      );
    },
  );

  it.each([0, 1000])('retains emergency loyalty work below 55 with %s gold', (gold) => {
    const { state, city, manager } = autonomous();
    manager.loyalty = 54;
    city.gold = gold;
    const plan = planGovernorMonthlyWork(state, city.id, 1);
    expect(plan.action).toBe(gold ? 'reward' : 'feast');
    expect(applyGovernorMonthlyWork(state, plan).applied).toBe(true);
  });

  it('uses the same independent training caps in autonomous planning', () => {
    const { state, city, manager } = autonomous();
    for (const [force, experience, level] of [
      [100, 475, 4],
      [99, 10_000, 5],
    ]) {
      Object.assign(manager, { force, experience, level });
      const plan = planGovernorMonthlyWork(state, city.id, 1);
      expect(plan).toMatchObject({ action: 'train', targetOfficerId: manager.id });
      expect(applyGovernorMonthlyWork(state, plan).applied).toBe(true);
    }
  });
});
