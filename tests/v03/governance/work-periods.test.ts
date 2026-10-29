import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { advanceV03 } from '../../../src/v03/engine';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import {
  applyV03CityAction,
  cityWorkQuota,
  cityWorkUsedThisPeriod,
  cityWorkRefreshDays,
  getV03CityActionAvailability,
} from '../../../src/v03/governance/city-actions';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import type { V03GameState } from '../../../src/v03/types';

const cityAt = (state: V03GameState, id: string) => state.cities.find((city) => city.id === id)!;
const reload = (state: V03GameState) => decodeV03Save(encodeV03Save(state));
function fixture(day = 0, used = 2) {
  const state = createV03Game('liu', 1);
  state.absoluteDay = day;
  state.monthIndex = Math.floor(day / 30);
  state.alliances = state.factions.flatMap((a, index) =>
    state.factions
      .slice(index + 1)
      .map((b) => ({ a: a.id, b: b.id, expiresMonthIndex: state.monthIndex + 6 })),
  );
  const city = cityAt(state, state.playerCapitalCityId);
  Object.assign(city, {
    farming: 100,
    commerce: 100,
    gold: 10_000,
    workMonthIndex: state.monthIndex,
    workPeriodIndex: Math.floor(day / 10),
    workPointsUsed: used,
  });
  state.personnelDay = createPersonnelDay(state);
  expect(validateV03State(state)).toBe(true);
  return { state, city };
}
function advance(state: V03GameState, days: 1 | 10) {
  state.events.forEach((event) => (event.acknowledged = true));
  const result = advanceV03(state, days);
  expect(result.error).toBeUndefined();
  expect(result.daysAdvanced).toBe(days);
  expect(validateV03State(result.state)).toBe(true);
  return result.state;
}
const remaining = (state: V03GameState, id: string) =>
  Math.max(
    0,
    cityWorkQuota(state, cityAt(state, id)) - cityWorkUsedThisPeriod(state, cityAt(state, id)),
  );

describe('ten-day work point refresh', () => {
  it('refreshes at the tenth actual day, then permits exactly two paid actions', () => {
    const { state, city } = fixture();
    let next = state;
    for (let day = 1; day < 10; day++) {
      next = advance(next, 1);
      expect(remaining(next, city.id)).toBe(0);
      expect(cityWorkRefreshDays(next)).toBe(10 - day);
    }
    next = advance(next, 1);
    expect(remaining(next, city.id)).toBe(2);
    expect(cityWorkRefreshDays(next)).toBe(10);
    expect(cityAt(next, city.id)).toMatchObject({ gold: city.gold, food: city.food });
    for (let used = 1; used <= 2; used++) {
      const result = applyV03CityAction(next, { cityId: city.id, action: 'develop-farming' });
      expect(result.ok, result.error).toBe(true);
      next = reload(result.state);
      expect(cityAt(next, city.id)).toMatchObject({
        workPeriodIndex: 1,
        workPointsUsed: used,
        workMonthIndex: 0,
      });
    }
    expect(
      applyV03CityAction(next, { cityId: city.id, action: 'develop-farming' }).error,
    ).toContain('ten-day period');
  });

  it('advancing ten days and ten separate daily advances use the same refresh and automatic work', () => {
    const { state, city } = fixture(4);
    const batch = advance(structuredClone(state), 10);
    let daily = structuredClone(state);
    for (let i = 0; i < 10; i++) daily = advance(daily, 1);
    expect(batch.absoluteDay).toBe(14);
    expect(remaining(batch, city.id)).toBe(2);
    expect(cityWorkRefreshDays(batch)).toBe(6);
    expect(batch.cities).toEqual(daily.cities);
    expect(batch.officers).toEqual(daily.officers);
    expect(batch.rng).toBe(daily.rng);
  });

  it.each([9, 19, 29, 359])(
    'handles the boundary after day %s once, including month/year changes and reload',
    (day) => {
      const { state, city } = fixture(day);
      const next = reload(advance(state, 1));
      expect(remaining(next, city.id)).toBe(2);
      const action = applyV03CityAction(next, { cityId: city.id, action: 'develop-commerce' });
      expect(action.ok, action.error).toBe(true);
      expect(remaining(action.state, city.id)).toBe(1);
      const tomorrow = advance(reload(action.state), 1);
      expect(remaining(tomorrow, city.id)).toBe(1);
      expect(cityAt(tomorrow, city.id).gold).toBe(cityAt(action.state, city.id).gold);
    },
  );

  it('does not accumulate unused points, refill on reload, or change state in availability queries', () => {
    const { state, city } = fixture(9, 0);
    const next = advance(state, 1);
    expect(remaining(next, city.id)).toBe(2);
    const before = structuredClone(next);
    expect(
      getV03CityActionAvailability(next, { cityId: city.id, action: 'develop-farming' }).ok,
    ).toBe(true);
    expect(next).toEqual(before);
    const spent = applyV03CityAction(next, { cityId: city.id, action: 'develop-farming' }).state;
    expect(remaining(reload(spent), city.id)).toBe(1);
  });

  it('does not refresh if an event interrupts the ten-day button before any time passes', () => {
    const { state, city } = fixture(9);
    state.events.push({
      id: 'stop-clock',
      absoluteDay: 9,
      kind: 'campaignEvent',
      tier: 'critical',
      title: 'Read this report',
      detail: '',
      entityId: null,
      acknowledged: false,
    });
    const result = advanceV03(state, 10);
    expect(result.daysAdvanced).toBe(0);
    expect(remaining(result.state, city.id)).toBe(0);
    expect(cityWorkRefreshDays(result.state)).toBe(1);
  });

  it('retains monthly talent counts after a period refresh and a free action; resets them only in the new month', () => {
    const { state, city } = fixture(9);
    city.autoSearchesThisMonth = 1;
    city.autoAssignmentsThisMonth = 1;
    let next = advance(state, 1);
    const ruler = next.officers.find((officer) => officer.id === 'liubei')!;
    ruler.loyalty = 50;
    const reward = applyV03CityAction(next, {
      cityId: city.id,
      action: 'reward',
      officerId: ruler.id,
    });
    expect(reward.ok, reward.error).toBe(true);
    next = reload(reward.state);
    expect(cityAt(next, city.id)).toMatchObject({
      workPeriodIndex: 1,
      workPointsUsed: 0,
      autoSearchesThisMonth: 1,
      autoAssignmentsThisMonth: 1,
    });
    next = advance(next, 10);
    next = advance(next, 10);
    const work = applyV03CityAction(next, { cityId: city.id, action: 'develop-farming' });
    expect(work.ok, work.error).toBe(true);
    expect(cityAt(reload(work.state), city.id)).toMatchObject({
      workMonthIndex: 1,
      workPeriodIndex: 3,
      workPointsUsed: 1,
      autoSearchesThisMonth: 0,
      autoAssignmentsThisMonth: 0,
    });
  });

  it('loads old monthly saves without refunding spent points, then refreshes after advancing across a period boundary', () => {
    const { state, city } = fixture(14, 3);
    for (const place of state.cities) delete place.workPeriodIndex;
    const restored = reload(state);
    expect(remaining(restored, city.id)).toBe(0);
    const next = reload(advance(restored, 10));
    expect(next.absoluteDay).toBe(24);
    expect(remaining(next, city.id)).toBe(2);
    expect(cityAt(restored, city.id).workPeriodIndex).toBeUndefined();
  });

  it('rejects future and mismatched work-period cursors while allowing monthly talent counts with zero current-period spending', () => {
    const { state, city } = fixture(14, 0);
    city.autoSearchesThisMonth = 1;
    expect(validateV03State(state)).toBe(true);
    city.workPeriodIndex = 2;
    expect(validateV03State(state)).toBe(false);
    city.workPeriodIndex = 1;
    city.workMonthIndex = 1;
    expect(validateV03State(state)).toBe(false);
  });

  it.each(['xuchang', 'beihai', 'jianye'])(
    'gives autonomous city %s two paid actions at each ten-day boundary, without adding monthly income',
    (cityId) => {
      const { state } = fixture(9);
      const city = cityAt(state, cityId);
      for (const officer of state.officers) {
        if (officer.location.kind !== 'city' || officer.location.cityId !== cityId) continue;
        if (officer.factionId === null) officer.location = { kind: 'city', cityId: 'xiangyang' };
        else
          Object.assign(officer, {
            force: 105,
            equipment: 'Fine arms',
            experience: 500,
            level: 5,
            loyalty: 100,
          });
      }
      Object.assign(city, {
        food: 200_000,
        gold: 10_000,
        farming: 100,
        commerce: 100,
        loyalty: 100,
        reserve: 3000,
        reservePools: createReservePools(1000, 1000, 1000),
        workPeriodIndex: 0,
        workPointsUsed: 2,
      });
      state.personnelDay = createPersonnelDay(state);
      const next = reload(advance(state, 1));
      expect(cityAt(next, cityId)).toMatchObject({
        workPeriodIndex: 1,
        workPointsUsed: 2,
        gold: 9840,
      });
      const investmentCount = (value: typeof city) =>
        (value.farming - 100) / 20 + (value.commerce - 100) / 10;
      expect(investmentCount(cityAt(next, cityId))).toBe(2);
      const after = reload(advance(next, 10));
      expect(cityAt(after, cityId)).toMatchObject({
        workPeriodIndex: 2,
        workPointsUsed: 2,
        gold: 9680,
      });
      expect(investmentCount(cityAt(after, cityId))).toBe(4);
    },
  );
});
