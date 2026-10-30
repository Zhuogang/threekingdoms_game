import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { executeV03Command } from '../../../src/v03/commands';
import { advanceV03 } from '../../../src/v03/engine';
import { availableTroops, createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import {
  applyV03CityAction,
  cityWorkQuota,
  getV03CityActionAvailability,
} from '../../../src/v03/governance/city-actions';
import {
  applyGovernorMonthlyWork,
  planGovernorMonthlyWork,
} from '../../../src/v03/governance/autonomy';
import { installGovernor } from '../../../src/v03/governance/appointments';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import type { V03CityAction, V03GameState } from '../../../src/v03/types';

const cityAt = (state: V03GameState, id: string) => state.cities.find((entry) => entry.id === id)!;
const reload = (state: V03GameState) => decodeV03Save(encodeV03Save(state));
function fixture(mode: 'player' | 'governor' | 'ai' = 'player') {
  const state = createV03Game('cao', 1);
  const city = cityAt(
    state,
    mode === 'player' ? 'chenliu' : mode === 'governor' ? 'xuchang' : 'jianye',
  );
  const officer = state.officers.find(
    (entry) =>
      entry.id === (mode === 'player' ? 'caocao' : mode === 'governor' ? 'caoren' : 'sunjian'),
  )!;
  for (const local of state.officers) {
    if (
      local.alive &&
      local.factionId === city.factionId &&
      local.location.kind === 'city' &&
      local.location.cityId === city.id
    )
      Object.assign(local, {
        troops: 10_000,
        wounded: 0,
        reorganizationDays: 0,
        loyalty: 100,
        force: 105,
        equipment: 'Fine arms',
        experience: 500,
        level: 5,
      });
  }
  Object.assign(officer, {
    troops: 1000,
    wounded: 20,
    troopExperience: 1200,
    loyalty: 30,
    force: 70,
    equipment: null,
  });
  Object.assign(city, {
    gold: 10_000,
    food: 200_000,
    farming: 500,
    commerce: 500,
    loyalty: 100,
    reserve: 30_000,
    reservePools: createReservePools(10_000, 10_000, 10_000),
    workMonthIndex: state.monthIndex,
    workPointsUsed: 2,
  });
  city.garrisonTroops = state.officers
    .filter(
      (entry) =>
        entry.alive &&
        entry.factionId === city.factionId &&
        entry.location.kind === 'city' &&
        entry.location.cityId === city.id,
    )
    .reduce((sum, entry) => sum + availableTroops(entry), 0);
  state.personnelDay = createPersonnelDay(state);
  expect(validateV03State(state)).toBe(true);
  return { state, city, officer };
}

describe('fixed city work points and free preparations', () => {
  it('keeps two points per owned city regardless of staffing, while requiring an executor', () => {
    const { state, city, officer } = fixture();
    for (const place of state.cities)
      expect(cityWorkQuota(state, place)).toBe(place.factionId ? 2 : 0);
    city.workPointsUsed = 1;
    city.farming = 100;
    for (const local of state.officers) {
      if (
        local.id !== officer.id &&
        local.location.kind === 'city' &&
        local.location.cityId === city.id &&
        local.factionId === 'cao'
      )
        local.location = { kind: 'city', cityId: 'puyang' };
    }
    expect(cityWorkQuota(state, city)).toBe(2);
    expect(applyV03CityAction(state, { cityId: city.id, action: 'develop-farming' }).ok).toBe(true);
    officer.location = { kind: 'city', cityId: 'puyang' };
    expect(cityWorkQuota(state, city)).toBe(2);
    expect(
      getV03CityActionAvailability(state, { cityId: city.id, action: 'develop-farming' }).reason,
    ).toContain('stationed');
    expect(city.workPointsUsed).toBe(1);
  });

  it.each(['assign-troops', 'reward', 'equip'] as const)(
    'allows %s after all points are spent, charges only existing resources, and survives reload',
    (action) => {
      const { state, city, officer } = fixture();
      const before = structuredClone(state);
      const input = {
        cityId: city.id,
        action,
        officerId: officer.id,
        amount: officer.troops + 100,
      };
      expect(getV03CityActionAvailability(state, input).ok).toBe(true);
      const result = applyV03CityAction(state, input);
      expect(result.ok, result.error).toBe(true);
      const after = cityAt(result.state, city.id);
      expect(after.workPointsUsed).toBe(2);
      expect(after.workMonthIndex).toBe(state.monthIndex);
      expect(after.gold).toBe(
        city.gold - (action === 'reward' ? 100 : action === 'equip' ? 180 : 0),
      );
      expect(after.reserve).toBe(city.reserve - (action === 'assign-troops' ? 100 : 0));
      expect(result.state.officers.find((entry) => entry.id === officer.id)).toMatchObject(
        action === 'reward'
          ? { loyalty: 45 }
          : action === 'equip'
            ? { equipment: 'Fine arms', force: 75 }
            : {
                troops: 1100,
                wounded: 20,
                troopExperience: expect.closeTo((1200 * 1020) / 1120, 8),
              },
      );
      expect(reload(result.state)).toEqual(result.state);
      expect(state).toEqual(before);
    },
  );

  it.each([
    'develop-farming',
    'develop-commerce',
    'restore-loyalty',
    'search',
    'recruit',
    'security',
    'feast',
    'train',
    'relieve',
    'buy-food',
    'sell-food',
  ] as V03CityAction[])('still blocks paid %s after two work points', (action) => {
    const { state, city, officer } = fixture();
    const result = applyV03CityAction(state, { cityId: city.id, action, officerId: officer.id });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('no work points left; 2 more arrive in');
    expect(result.state).toBe(state);
  });

  it('still enforces gold, equipment caps, troop commitments and reorganization for free actions', () => {
    const { state, city, officer } = fixture();
    city.gold = 0;
    for (const action of ['reward', 'equip'] as const)
      expect(applyV03CityAction(state, { cityId: city.id, action, officerId: officer.id }).ok).toBe(
        false,
      );
    city.gold = 10_000;
    officer.equipment = 'Fine arms';
    expect(
      applyV03CityAction(state, { cityId: city.id, action: 'equip', officerId: officer.id }).error,
    ).toContain('already');
    officer.reorganizationDays = 1;
    expect(
      applyV03CityAction(state, {
        cityId: city.id,
        action: 'assign-troops',
        officerId: officer.id,
        amount: 1100,
      }).error,
    ).toContain('reorganizing');
    officer.reorganizationDays = 0;
    state.requisitions.push({
      id: 'protected-army',
      factionId: 'cao',
      sourceCityId: city.id,
      targetCityId: 'puyang',
      requested: { gold: 0, food: 0, troops: city.garrisonTroops },
      proposed: { gold: 0, food: 0, troops: city.garrisonTroops },
      createdDay: state.absoluteDay,
      requestedByDay: null,
      earliestDepartureDay: null,
      estimatedArrivalDay: null,
      status: 'reserved',
      journeyId: null,
      governanceRevision: 0,
      message: '',
    });
    expect(
      applyV03CityAction(state, {
        cityId: city.id,
        action: 'assign-troops',
        officerId: officer.id,
        amount: 900,
      }).error,
    ).toContain('reserved');
    expect(
      executeV03Command(state, { type: 'returnTroops', cityId: city.id, officerId: officer.id })
        .error,
    ).toContain('reserved');
  });

  it('returns a capital contingent after two points without resetting work or losing personnel and XP', () => {
    const { state, city, officer } = fixture();
    const result = executeV03Command(state, {
      type: 'returnTroops',
      cityId: city.id,
      officerId: officer.id,
    });
    expect(result.ok, result.error).toBe(true);
    expect(cityAt(result.state, city.id)).toMatchObject({
      workPointsUsed: 2,
      workMonthIndex: state.monthIndex,
      reserve: city.reserve + officer.troops,
    });
    expect(result.state.officers.find((entry) => entry.id === officer.id)!.troops).toBe(0);
    expect(
      result.state.troopSources
        .filter((entry) => entry.sourceOfficerId === officer.id)
        .reduce((sum, entry) => sum + entry.wounded, 0),
    ).toBe(20);
    expect(reload(result.state)).toEqual(result.state);
  });

  it('does not carry previous-month work into a free action, and keeps first automatic assignment independently saveable', () => {
    const { state, city, officer } = fixture('governor');
    state.absoluteDay = 30;
    state.monthIndex = 1;
    Object.assign(officer, {
      troops: 0,
      wounded: 0,
      troopExperience: 0,
      loyalty: 100,
      equipment: 'Fine arms',
      force: 105,
    });
    city.garrisonTroops -= 1000;
    city.autoAssignmentsThisMonth = 1;
    city.autoSearchesThisMonth = 1;
    state.personnelDay = createPersonnelDay(state);
    const plan = planGovernorMonthlyWork(state, city.id, 2);
    expect(plan).toMatchObject({ action: 'assign-troops', workPoints: 0, firstAssignment: true });
    const next = applyGovernorMonthlyWork(state, plan).state!;
    expect(cityAt(next, city.id)).toMatchObject({
      workMonthIndex: 1,
      workPointsUsed: 0,
      autoAssignmentsThisMonth: 1,
      autoSearchesThisMonth: 0,
    });
    expect(reload(next)).toEqual(next);
    const invalid = structuredClone(next);
    cityAt(invalid, city.id).autoSearchesThisMonth = 1;
    expect(validateV03State(invalid)).toBe(true);
    cityAt(invalid, city.id).autoSearchesThisMonth = 2;
    expect(validateV03State(invalid)).toBe(false);
  });

  it.each(['governor', 'ai'] as const)(
    'lets %s finish free actions after paid work, then stops without a loop',
    (mode) => {
      const { state, city, officer } = fixture(mode);
      let next = state;
      const actions: string[] = [];
      for (let i = 0; i < 10; i++) {
        const plan = planGovernorMonthlyWork(next, city.id, 1);
        if (!plan.action) break;
        expect(plan.workPoints).toBe(0);
        actions.push(plan.action);
        const applied = applyGovernorMonthlyWork(next, plan);
        expect(applied.applied, applied.reason).toBe(true);
        next = reload(applied.state!);
        expect(cityAt(next, city.id).workPointsUsed).toBe(2);
      }
      expect(actions).toEqual(['reward', 'reward', 'assign-troops', 'equip']);
      expect(planGovernorMonthlyWork(next, city.id, 1)).toMatchObject({
        action: null,
        reasonCode: 'monthly-work-spent',
      });
      expect(next.officers.find((entry) => entry.id === officer.id)).toMatchObject({
        loyalty: 60,
        equipment: 'Fine arms',
        troops: 9980,
        wounded: 20,
      });
      expect(cityAt(next, city.id).gold).toBe(city.gold - 380);
    },
  );

  it('preserves spent points through office installation and dismissal in the same month', () => {
    const { state, city, officer } = fixture('governor');
    installGovernor(state, city, null);
    expect(city.workPointsUsed).toBe(2);
    installGovernor(state, city, officer);
    expect(city.workPointsUsed).toBe(2);
    expect(reload(state)).toEqual(state);
  });

  it('runs a month-boundary governor/AI settlement through two paid points plus free preparations', () => {
    let state = createV03Game('cao', 1);
    state.absoluteDay = 29;
    state.alliances = state.factions.flatMap((a, i) =>
      state.factions.slice(i + 1).map((b) => ({ a: a.id, b: b.id, expiresMonthIndex: 6 })),
    );
    const city = cityAt(state, 'beihai');
    const officer = state.officers.find((entry) => entry.id === city.governorId)!;
    // The governor spent its day-20 points, so the boundary brings exactly two.
    Object.assign(city, { workMonthIndex: 0, workPeriodIndex: 2, workPointsUsed: 2 });
    city.farming = 100;
    city.commerce = 100;
    city.loyalty = 100;
    city.food = 200_000;
    city.gold = 10_000;
    city.reservePools = createReservePools(10_000, 10_000, 10_000);
    city.reserve = 30_000;
    officer.loyalty = 30;
    officer.equipment = null;
    officer.experience = 500;
    officer.level = 5;
    officer.force = 70;
    state.personnelDay = createPersonnelDay(state);
    const result = advanceV03(state, 1);
    expect(result.error).toBeUndefined();
    expect(result.daysAdvanced).toBe(1);
    state = reload(result.state);
    expect(cityAt(state, city.id)).toMatchObject({
      workMonthIndex: 1,
      workPointsUsed: 2,
    });
    const invested = cityAt(state, city.id);
    expect((invested.farming - 100) / 20 + (invested.commerce - 100) / 10).toBe(1);
    expect(state.officers.find((entry) => entry.id === officer.id)).toMatchObject({
      loyalty: 60,
      troops: 9700,
      equipment: 'Fine arms',
    });
    expect(state.absoluteDay).toBe(30);
  });
});
