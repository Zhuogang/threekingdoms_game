import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import {
  applyV03CityAction,
  getV03CityActionAvailability,
} from '../../../src/v03/governance/city-actions';
import type { V03GameState, V03Officer } from '../../../src/v03/types';

function fixture(seed = 51): { state: V03GameState; cityId: string; officer: V03Officer } {
  const state = createV03Game('cao', seed);
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  const officer = state.officers.find(
    (entry) =>
      entry.alive &&
      entry.factionId === state.playerFactionId &&
      entry.location.kind === 'city' &&
      entry.location.cityId === city.id,
  );
  if (!officer) throw new Error('The ruler capital must have a local officer.');
  city.gold = 1000;
  city.food = 3000;
  city.farming = 30;
  city.commerce = 30;
  city.workMonthIndex = state.monthIndex;
  city.workPointsUsed = 0;
  return { state, cityId: city.id, officer };
}

function nextMonth(state: V03GameState): void {
  state.absoluteDay += 30;
  state.monthIndex++;
}

function rand(state: V03GameState, max: number): number {
  let value = state.rng || 190;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rng = value >>> 0;
  return state.rng % max;
}

describe('v0.3 ruler city actions', () => {
  it.each([
    { force: 100, experience: 500 },
    { force: 100, experience: 10_000 },
  ])('shares training rejection when both benefits are capped: %o', ({ force, experience }) => {
    const { state, cityId, officer } = fixture();
    Object.assign(officer, { force, experience, level: 5, troops: 300 });
    const input = { cityId, action: 'train' as const, officerId: officer.id };
    const before = structuredClone(state);

    const availability = getV03CityActionAvailability(state, input);
    const executed = applyV03CityAction(state, input);

    expect(availability).toEqual({ ok: false, reason: executed.error });
    expect(availability.reason).toContain('training limit');
    expect(state).toEqual(before);
  });

  it('queries search availability without consuming RNG, stock or monthly work', () => {
    const { state, cityId } = fixture();
    const before = structuredClone(state);
    expect(getV03CityActionAvailability(state, { cityId, action: 'search' })).toEqual({
      ok: true,
      reason: null,
    });
    expect(state).toEqual(before);
  });

  it('shares authority, work-budget and affordability rejections with command execution', () => {
    for (const kind of ['authority', 'work', 'gold', 'valid'] as const) {
      const { state, cityId } = fixture();
      const city = state.cities.find((entry) => entry.id === cityId)!;
      if (kind === 'authority') city.governanceMode = 'steward';
      if (kind === 'work') city.workPointsUsed = 3;
      if (kind === 'gold') city.gold = 0;
      const input = { cityId, action: 'develop-farming' as const };
      const availability = getV03CityActionAvailability(state, input);
      const executed = applyV03CityAction(state, input);
      expect(availability.ok).toBe(executed.ok);
      expect(availability.reason).toBe(executed.error ?? null);
    }
  });

  it('protects approved gold, food and garrison commitments in previews and execution', () => {
    const { state, cityId, officer } = fixture();
    const city = state.cities.find((entry) => entry.id === cityId)!;
    officer.loyalty = 50;
    officer.force = 60;
    state.requisitions.push({
      id: 'approved-capital-stock',
      factionId: state.playerFactionId,
      sourceCityId: cityId,
      targetCityId: 'puyang',
      requested: { gold: 900, food: 2700, troops: city.garrisonTroops },
      proposed: { gold: 900, food: 2700, troops: city.garrisonTroops },
      createdDay: state.absoluteDay,
      requestedByDay: null,
      earliestDepartureDay: null,
      estimatedArrivalDay: null,
      status: 'reserved',
      journeyId: null,
      governanceRevision: state.governanceRevision,
      message: 'Reserved stock',
    });
    for (const input of [
      { cityId, action: 'equip' as const, officerId: officer.id },
      { cityId, action: 'relieve' as const },
      { cityId, action: 'assign-troops' as const, officerId: officer.id, amount: 0 },
    ]) {
      const availability = getV03CityActionAvailability(state, input);
      const executed = applyV03CityAction(state, input);
      expect(availability.ok).toBe(false);
      expect(availability.reason).toContain('reserved');
      expect(executed.error).toBe(availability.reason);
      expect(executed.state).toBe(state);
    }
    // Spending exactly the unreserved balance remains legal.
    expect(
      getV03CityActionAvailability(state, { cityId, action: 'reward', officerId: officer.id }).ok,
    ).toBe(true);
    // A dispatched journey has already debited its cargo; do not reserve it twice.
    state.requisitions[0]!.journeyId = 'already-debited-journey';
    expect(
      getV03CityActionAvailability(state, { cityId, action: 'equip', officerId: officer.id }).ok,
    ).toBe(true);
  });
  it('uses the same 80-gold work effect and fixed ten-day quota for direct development', () => {
    const { state, cityId } = fixture();
    const city = state.cities.find((entry) => entry.id === cityId)!;
    const quota = 2;
    city.workPointsUsed = quota - 1;
    const before = structuredClone(state);

    const result = applyV03CityAction(state, { cityId, action: 'develop-farming' });

    expect(result.ok).toBe(true);
    expect(result.state.cities.find((entry) => entry.id === cityId)).toMatchObject({
      farming: 50,
      gold: 920,
      workPointsUsed: quota,
    });
    expect(state).toEqual(before);
    const repeated = applyV03CityAction(result.state, { cityId, action: 'develop-commerce' });
    expect(repeated.ok).toBe(false);
    expect(repeated.state).toBe(result.state);
  });

  it('rejects direct controls in a governor city even when the command is constructed by hand', () => {
    const { state, cityId } = fixture();
    state.cities.find((entry) => entry.id === cityId)!.governanceMode = 'governor';

    const result = applyV03CityAction(state, { cityId, action: 'search' });

    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
  });

  it('recruits from population into reserve, then assigns reserve soldiers to a local officer', () => {
    const { state, cityId, officer } = fixture();
    const city = state.cities.find((entry) => entry.id === cityId)!;
    const population = city.population;
    const reserve = city.reserve;
    const recruited = applyV03CityAction(state, { cityId, action: 'recruit' });
    expect(recruited.ok).toBe(true);
    const afterRecruit = recruited.state.cities.find((entry) => entry.id === cityId)!;
    expect(afterRecruit.population).toBeLessThan(population);
    expect(afterRecruit.reserve).toBeGreaterThan(reserve);
    expect(afterRecruit.loyalty).toBe(city.loyalty - 2);

    nextMonth(recruited.state);
    const amount = recruited.state.officers.find((entry) => entry.id === officer.id)!.troops + 100;
    const assigned = applyV03CityAction(recruited.state, {
      cityId,
      action: 'assign-troops',
      officerId: officer.id,
      amount,
    });
    expect(assigned.ok).toBe(true);
    expect(assigned.state.officers.find((entry) => entry.id === officer.id)?.troops).toBe(amount);
    expect(assigned.state.cities.find((entry) => entry.id === cityId)?.reserve).toBe(
      afterRecruit.reserve - 100,
    );
  });

  it('trains a serving officer and raises level only at the experience threshold', () => {
    const { state, cityId, officer } = fixture();
    officer.troops = 300;
    officer.experience = 90;
    officer.level = 0;

    const result = applyV03CityAction(state, { cityId, action: 'train', officerId: officer.id });

    expect(result.ok).toBe(true);
    expect(result.state.officers.find((entry) => entry.id === officer.id)).toMatchObject({
      experience: 115,
      level: 1,
    });
  });

  it('runs security, feast and the fixed-price 800-food market actions through one work point each', () => {
    const { state, cityId, officer } = fixture();
    const city = state.cities.find((entry) => entry.id === cityId)!;
    city.loyalty = 50;
    officer.loyalty = 50;
    const secured = applyV03CityAction(state, { cityId, action: 'security' });
    expect(secured.ok).toBe(true);
    expect(secured.state.cities.find((entry) => entry.id === cityId)?.loyalty).toBeGreaterThan(50);

    nextMonth(secured.state);
    const feasted = applyV03CityAction(secured.state, { cityId, action: 'feast' });
    expect(feasted.ok).toBe(true);
    expect(feasted.state.officers.find((entry) => entry.id === officer.id)?.loyalty).toBe(58);

    nextMonth(feasted.state);
    const bought = applyV03CityAction(feasted.state, { cityId, action: 'buy-food' });
    expect(bought.ok).toBe(true);
    expect(bought.state.cities.find((entry) => entry.id === cityId)).toMatchObject({
      food: city.food + 800,
      gold: city.gold - 80,
    });
    nextMonth(bought.state);
    const sold = applyV03CityAction(bought.state, { cityId, action: 'sell-food' });
    expect(sold.ok).toBe(true);
    expect(sold.state.cities.find((entry) => entry.id === cityId)?.food).toBe(city.food);
  });

  it('searches only local neutral officers and uses the saved RNG stream', () => {
    const { state, cityId, officer } = fixture(17);
    const city = state.cities.find((entry) => entry.id === cityId)!;
    const neutral = {
      ...structuredClone(officer),
      id: 'neutral-search',
      name: 'Neutral',
      chinese: '无名',
      factionId: null,
      governorOfCityId: null,
      loyalty: 0,
    };
    state.officers.push(neutral);
    const expectedRngState = structuredClone(state);
    const candidates = expectedRngState.officers
      .filter(
        (candidate) =>
          candidate.alive &&
          candidate.factionId === null &&
          candidate.location.kind === 'city' &&
          candidate.location.cityId === city.id,
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const selected = candidates.length
      ? candidates[rand(expectedRngState, candidates.length)]
      : undefined;
    const found = Boolean(
      selected && rand(expectedRngState, 100) < 40 + Math.floor(officer.intellect / 2),
    );
    if (found) rand(expectedRngState, 16);

    const result = applyV03CityAction(state, { cityId, action: 'search' });

    expect(result.ok).toBe(true);
    expect(result.state.rng).toBe(expectedRngState.rng);
    expect(result.state.officers.find((entry) => entry.id === selected?.id)?.factionId).toBe(
      found ? 'cao' : null,
    );
    expect(city.workPointsUsed).toBe(0);
  });

  it('executes legacy reward, fine arms, and population relief through ruler work orders', () => {
    const { state, cityId, officer } = fixture();
    const city = state.cities.find((entry) => entry.id === cityId)!;
    officer.loyalty = 40;
    officer.force = 102;
    const rewarded = applyV03CityAction(state, { cityId, action: 'reward', officerId: officer.id });
    expect(rewarded.ok).toBe(true);
    expect(rewarded.state.officers.find((entry) => entry.id === officer.id)?.loyalty).toBe(55);
    expect(rewarded.state.cities.find((entry) => entry.id === cityId)?.gold).toBe(city.gold - 100);

    nextMonth(rewarded.state);
    const equipped = applyV03CityAction(rewarded.state, {
      cityId,
      action: 'equip',
      officerId: officer.id,
    });
    expect(equipped.ok).toBe(true);
    expect(equipped.state.officers.find((entry) => entry.id === officer.id)).toMatchObject({
      force: 105,
      equipment: 'Fine arms',
    });
    expect(equipped.state.cities.find((entry) => entry.id === cityId)?.gold).toBe(city.gold - 280);

    nextMonth(equipped.state);
    const population = city.population;
    const relieved = applyV03CityAction(equipped.state, {
      cityId,
      action: 'relieve',
      officerId: officer.id,
    });
    expect(relieved.ok).toBe(true);
    expect(relieved.state.cities.find((entry) => entry.id === cityId)).toMatchObject({
      gold: city.gold - 360,
      food: city.food - 600,
      loyalty: city.loyalty + 15,
      population: population + 300,
    });
  });
});
