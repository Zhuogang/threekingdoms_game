import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { CITY_RECORDS } from '../../../src/v03/content/cities';
import {
  applySharedCityWorkEffect,
  applyV03CityAction,
  cityDevelopmentCaps,
  getV03CityActionAvailability,
} from '../../../src/v03/governance/city-actions';
import { planGovernorMonthlyWork } from '../../../src/v03/governance/autonomy';
import type { V03City } from '../../../src/v03/types';

const politics60 = { force: 0, intellect: 0, politics: 60 };

function developUntilStuck(source: V03City, action: 'develop-farming' | 'develop-commerce') {
  let city = { ...source, gold: 1_000_000 };
  for (let guard = 0; guard < 200; guard++) {
    const next = applySharedCityWorkEffect(city, action, politics60);
    if (!next) return city;
    city = next;
  }
  throw new Error('development never stopped');
}

describe('L-01 per-city development caps', () => {
  it('reads each city’s caps from its record', () => {
    for (const [id, record] of Object.entries(CITY_RECORDS))
      expect(cityDevelopmentCaps(id)).toEqual({
        farming: record.farmingCap,
        commerce: record.commerceCap,
      });
    expect(cityDevelopmentCaps('tianshui')).toEqual({ farming: 300, commerce: 280 });
    expect(cityDevelopmentCaps('chengdu')).toEqual({ farming: 800, commerce: 700 });
  });

  it('stops a D city (tianshui) at 300 farming', () => {
    const state = createV03Game('cao', 1);
    const city = state.cities.find((entry) => entry.id === 'tianshui')!;
    city.farming = 100;
    const done = developUntilStuck(city, 'develop-farming');
    expect(done.farming).toBe(300);
    expect(applySharedCityWorkEffect(done, 'develop-farming', politics60)).toBeNull();
    expect(developUntilStuck(city, 'develop-commerce').commerce).toBe(280);
  });

  it('lets an S city (chengdu) continue past 500 to 800', () => {
    const state = createV03Game('cao', 1);
    const city = state.cities.find((entry) => entry.id === 'chengdu')!;
    city.farming = 490;
    const step = applySharedCityWorkEffect(city, 'develop-farming', politics60)!;
    expect(step.farming).toBe(510);
    const done = developUntilStuck({ ...city, farming: 510 }, 'develop-farming');
    expect(done.farming).toBe(800);
    expect(developUntilStuck(city, 'develop-commerce').commerce).toBe(700);
  });

  it('clamps the last step to the cap and reports the cap when development is refused', () => {
    const state = createV03Game('cao', 1);
    const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
    const caps = cityDevelopmentCaps(city.id);
    const officer = state.officers.find(
      (entry) =>
        entry.alive &&
        entry.factionId === state.playerFactionId &&
        entry.location.kind === 'city' &&
        entry.location.cityId === city.id,
    )!;
    Object.assign(city, { gold: 1000, farming: caps.farming - 3, workPointsUsed: 0 });
    city.workMonthIndex = state.monthIndex;
    const input = { cityId: city.id, action: 'develop-farming' as const, officerId: officer.id };
    const result = applyV03CityAction(state, input);
    expect(result.ok, result.error).toBe(true);
    expect(result.state.cities.find((entry) => entry.id === city.id)!.farming).toBe(caps.farming);
    city.farming = caps.farming;
    const refused = getV03CityActionAvailability(state, input);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain(String(caps.farming));
  });

  describe('governor planner', () => {
    function governed() {
      const state = createV03Game('cao', 17);
      const city = state.cities.find((entry) => entry.id === 'xuchang')!;
      const manager = state.officers.find((entry) => entry.id === city.governorId)!;
      Object.assign(city, {
        food: 200_000,
        gold: 5000,
        // Only the protected residents remain, so recruitment is not on offer.
        population: 1000,
        loyalty: 100,
        garrisonTroops: 1000,
        reserve: 0,
        reservePools: createReservePools(),
        workMonthIndex: state.monthIndex,
        workPeriodIndex: Math.floor(state.absoluteDay / 10),
        workPointsUsed: 0,
        autoAssignmentsThisMonth: 1,
        autoSearchesThisMonth: 1,
      });
      for (const officer of state.officers)
        if (
          officer.location.kind === 'city' &&
          officer.location.cityId === city.id &&
          officer.factionId === city.factionId
        )
          Object.assign(officer, {
            troops: officer.id === manager.id ? 1000 : 0,
            wounded: 0,
            troopExperience: 0,
            reorganizationDays: 0,
            force: 105,
            equipment: 'Fine arms',
            experience: 500,
            level: 5,
            loyalty: 100,
          });
      state.personnelDay = createPersonnelDay(state);
      return { state, city };
    }

    it('does not choose a capped sector', () => {
      const { state, city } = governed();
      const caps = cityDevelopmentCaps(city.id);
      city.farming = 100;
      city.commerce = caps.commerce;
      expect(planGovernorMonthlyWork(state, city.id).action).toBe('develop-farming');
      city.farming = caps.farming;
      city.commerce = 100;
      expect(planGovernorMonthlyWork(state, city.id).action).toBe('develop-commerce');
      city.commerce = caps.commerce;
      const plan = planGovernorMonthlyWork(state, city.id);
      expect(plan.action).not.toBe('develop-farming');
      expect(plan.action).not.toBe('develop-commerce');
    });
  });
});
