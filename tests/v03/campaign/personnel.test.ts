import { describe, expect, it } from 'vitest';
import {
  availableReserveSources,
  availableReserveTroops,
  availableTroops,
  cityPersonnelSummary,
  createPersonnelDay,
  custodyHolder,
  detachWoundedToCity,
  foodHeadcount,
  mergePersonnel,
  personnelCount,
  rejoinTroopSource,
  reinforcementCapacity,
  retainPersonnel,
  splitPersonnel,
  type PersonnelPool,
} from '../../../src/v03/campaign/personnel';
import { createV03Game } from '../../../src/v03/initial-state';
import { executeV03Command } from '../../../src/v03/commands';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { advanceV03 } from '../../../src/v03/engine';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import type { V03TroopSource } from '../../../src/v03/types';

function fixture() {
  const state = createV03Game('cao', 91);
  const officer = state.officers.find((entry) => entry.id === 'caocao')!;
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  city.garrisonTroops += 2000 - officer.troops;
  Object.assign(officer, { troops: 2000, wounded: 3000, troopExperience: 1200 });
  state.personnelDay = createPersonnelDay(state);
  return { state, officer, city };
}

function pool(
  troops: number,
  wounded: number,
  troopExperience = 1200,
  reorganizationDays = 0,
): PersonnelPool {
  return { troops, wounded, troopExperience, reorganizationDays };
}

describe('personnel source and availability contracts', () => {
  it.each([false, true])(
    'keeps paid food through returning wounded and reserves, including reassignment: %s',
    (reassign) => {
      const { state, officer, city } = fixture();
      for (const local of state.officers.filter(
        (entry) => entry.location.kind === 'city' && entry.location.cityId === city.id,
      ))
        Object.assign(local, { troops: 0, wounded: 0, troopExperience: 0 });
      Object.assign(officer, {
        troops: 2000,
        wounded: 3000,
        troopType: 'cavalry',
        troopExperience: 1200,
      });
      city.garrisonTroops = 2000;
      city.garrisonExperience = 0;
      city.reservePools = createReservePools();
      city.reserve = 0;
      city.troopServiceDaysThisMonth = 0;
      city.cavalryServiceDaysThisMonth = 0;
      state.personnelDay = createPersonnelDay(state);
      state.personnelDay.rations.push({
        recordId: `officer:${officer.id}`,
        troops: 2000,
        wounded: 3000,
      });
      const returned = executeV03Command(state, {
        type: 'returnTroops',
        cityId: city.id,
        officerId: officer.id,
      });
      expect(returned.ok, returned.error).toBe(true);
      let next = returned.state;
      if (reassign) {
        const recipient = next.officers.find((entry) => entry.id === 'xiahoudun')!;
        recipient.troopType = 'cavalry';
        const assigned = executeV03Command(next, {
          type: 'cityAction',
          cityId: city.id,
          action: 'assign-troops',
          officerId: recipient.id,
          amount: 1000,
        });
        expect(assigned.ok, assigned.error).toBe(true);
        next = assigned.state;
      }
      next = decodeV03Save(encodeV03Save(next));
      next = advanceV03(next, 1).state;
      expect(next.cities.find((entry) => entry.id === city.id)).toMatchObject({
        troopServiceDaysThisMonth: 0,
        cavalryServiceDaysThisMonth: 0,
      });
      next.events.forEach((event) => (event.acknowledged = true));
      next = advanceV03(next, 1).state;
      expect(next.cities.find((entry) => entry.id === city.id)).toMatchObject({
        troopServiceDaysThisMonth: 5000,
        cavalryServiceDaysThisMonth: 5000,
      });
      expect(validateV03State(next)).toBe(true);
    },
  );

  it('counts wounded against capacity but never as available troops', () => {
    expect(personnelCount(pool(2000, 3000))).toBe(5000);
    expect(reinforcementCapacity(pool(2000, 3000))).toBe(5000);
    expect(availableTroops(pool(2000, 3000))).toBe(2000);
    expect(availableTroops(pool(2000, 3000, 1200, 1))).toBe(0);
    expect(foodHeadcount(pool(2000, 3000), 'cavalry')).toBe(10000);
    expect(foodHeadcount(pool(2000, 3000), 'infantry')).toBe(5000);
  });

  it('retains elite experience when only wounded remain, including after splitting', () => {
    const original = pool(2000, 3000);
    const { remaining, taken } = splitPersonnel(original, 2000);
    expect(remaining).toEqual(pool(0, 3000));
    expect(taken).toEqual(pool(2000, 0));
    expect(mergePersonnel(remaining, taken)).toEqual(original);
    retainPersonnel(remaining, 0, 1);
    expect(remaining.troopExperience).toBe(1200);
    retainPersonnel(remaining, 0, 0);
    expect(remaining).toEqual(pool(0, 0, 0));
    expect(original).toEqual(pool(2000, 3000));
  });

  it('weights real reinforcement by healthy plus wounded and rejects restriction laundering', () => {
    expect(mergePersonnel(pool(0, 3000), pool(2000, 0, 0))).toEqual(pool(2000, 3000, 720));
    expect(() => mergePersonnel(pool(50, 0, 100, 10), pool(50, 0, 100))).toThrow('restrictions');
    expect(() => mergePersonnel(pool(50, 0, 100, 10), pool(50, 0, 100, 9))).toThrow('restrictions');
    expect(mergePersonnel(pool(0, 0, 0), pool(50, 0, 100, 10))).toEqual(pool(50, 0, 100, 10));
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid counts %s atomically',
    (bad) => {
      const original = pool(2000, 3000);
      expect(() => splitPersonnel(original, bad)).toThrow(RangeError);
      expect(original).toEqual(pool(2000, 3000));
      expect(() => splitPersonnel(original, 0, bad)).toThrow(RangeError);
    },
  );

  it('keeps personnel and weighted experience through seeded split/merge/loss sequences', () => {
    let random = 190;
    const next = (limit: number) => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return random % limit;
    };
    let current = mergePersonnel(pool(4200, 2800), pool(500, 500, 100));
    let lost = 0;
    let expectedExperienceTotal = personnelCount(current) * current.troopExperience;
    for (let i = 0; i < 200; i++) {
      const before = personnelCount(current);
      const parts = splitPersonnel(current, next(current.troops + 1), next(current.wounded + 1));
      current = mergePersonnel(parts.remaining, parts.taken);
      expect(personnelCount(current) + lost).toBe(8000);
      expect(personnelCount(current) * current.troopExperience).toBeCloseTo(
        expectedExperienceTotal,
        5,
      );
      if (current.troops > 0) {
        retainPersonnel(current, current.troops - 1, current.wounded);
        lost++;
      }
      expectedExperienceTotal *= personnelCount(current) / before;
    }
    expect(current.troopExperience).toBeCloseTo(1062.5, 9);
  });

  it('leaves old wounded as a separate record and transfers existing day credit once', () => {
    const { state, officer, city } = fixture();
    const reserveBefore = structuredClone(city.reservePools);
    state.personnelDay.rations = [
      { recordId: `officer:${officer.id}`, troops: 1000, wounded: 3000 },
    ];
    const source = detachWoundedToCity(state, officer.id)!;
    expect(source).toMatchObject({
      sourceOfficerId: officer.id,
      troops: 0,
      wounded: 3000,
      troopExperience: 1200,
      autoReturn: true,
    });
    expect(officer).toMatchObject({ troops: 2000, wounded: 0, troopExperience: 1200 });
    expect(city.reservePools).toEqual(reserveBefore);
    expect(
      state.personnelDay.entries.find((entry) => entry.recordId === `source:${source.id}`)?.wounded,
    ).toBe(3000);
    expect(
      state.personnelDay.entries.find((entry) => entry.recordId === `officer:${officer.id}`)
        ?.wounded,
    ).toBe(0);
    expect(state.personnelDay.rations).toContainEqual({
      recordId: `source:${source.id}`,
      troops: 0,
      wounded: 3000,
    });
    expect(detachWoundedToCity(state, officer.id)).toBeNull();
    expect(state.troopSources).toHaveLength(1);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });

  it('supports multiple different veteran records from the same officer without dilution', () => {
    const { state, officer } = fixture();
    detachWoundedToCity(state, officer.id);
    officer.wounded = 400;
    officer.troopExperience = 100;
    const second = detachWoundedToCity(state, officer.id)!;
    expect(state.troopSources.map((source) => source.troopExperience)).toEqual([1200, 100]);
    expect(second.id).not.toBe(state.troopSources[0]!.id);
    expect(validateV03State(state)).toBe(true);
    officer.factionId = 'yuan';
    expect(state.troopSources.every((source) => source.factionId === 'cao')).toBe(true);
  });

  it('merges only an actual ready same-type same-city transfer, preserving experience and capacity', () => {
    const { state, officer, city } = fixture();
    const source = detachWoundedToCity(state, officer.id)!;
    source.troops = 3000;
    source.wounded = 0;
    officer.troopExperience = 0;
    state.personnelDay = createPersonnelDay(state);
    const garrison = city.garrisonTroops;
    rejoinTroopSource(state, source.id, officer.id, 3000);
    expect(officer).toMatchObject({ troops: 5000, wounded: 0, troopExperience: 720 });
    expect(city.garrisonTroops).toBe(garrison + 3000);
    expect(state.troopSources).toEqual([]);
    expect(validateV03State(state)).toBe(true);
  });

  it('rejects cross-type, locked, oversized, away and order-reserved joins without mutation', () => {
    for (const mode of ['type', 'locked', 'capacity', 'away', 'order']) {
      const { state, officer, city } = fixture();
      const source = detachWoundedToCity(state, officer.id)!;
      source.troops = 3000;
      source.wounded = 0;
      if (mode === 'type')
        source.troopType = officer.troopType === 'infantry' ? 'archer' : 'infantry';
      if (mode === 'locked') source.reorganizationDays = 10;
      if (mode === 'capacity') officer.troops = 9000;
      if (mode === 'away') officer.location = { kind: 'city', cityId: 'ye' };
      if (mode === 'order')
        state.directives.push({
          id: 'pending',
          sourceCityId: city.id,
          journeyId: null,
          status: 'reserved',
        } as (typeof state.directives)[number]);
      const before = structuredClone(state);
      expect(() => rejoinTroopSource(state, source.id, officer.id, 3000)).toThrow();
      expect(state).toEqual(before);
    }
  });

  it('prioritizes own same-city veterans and excludes wounded, locked and foreign records', () => {
    const { state, officer, city } = fixture();
    const own = detachWoundedToCity(state, officer.id)!;
    own.troops = 300;
    own.wounded = 500;
    const other: V03TroopSource = {
      ...own,
      id: 'other',
      sourceOfficerId: null,
      autoReturn: false,
      troopExperience: 0,
    };
    state.troopSources.push(
      other,
      { ...other, id: 'locked', reorganizationDays: 10 },
      { ...other, id: 'elsewhere', cityId: 'ye', factionId: 'yuan' },
    );
    city.reservePools = createReservePools();
    expect(
      availableReserveSources(state, city.id, officer.troopType, officer.id).map(
        (entry) => entry.id,
      ),
    ).toEqual([own.id, 'other']);
    expect(availableReserveTroops(state, city.id, officer.troopType)).toBe(600);
    expect(
      availableReserveTroops(
        state,
        city.id,
        officer.troopType === 'infantry' ? 'archer' : 'infantry',
      ),
    ).toBe(0);
  });

  it('counts city personnel once, excludes reserves from field garrison and includes captive cavalry rations', () => {
    const { state, officer, city } = fixture();
    for (const local of state.officers.filter(
      (entry) => entry.location.kind === 'city' && entry.location.cityId === city.id,
    ))
      Object.assign(local, { troops: 0, wounded: 0, troopExperience: 0 });
    Object.assign(officer, {
      troops: 400,
      wounded: 200,
      troopExperience: 1200,
      troopType: 'cavalry',
    });
    city.garrisonTroops = 500;
    city.reservePools = createReservePools(200, 0, 100);
    city.reserve = 300;
    state.troopSources.push({
      id: 'rear',
      cityId: city.id,
      factionId: city.factionId,
      sourceOfficerId: officer.id,
      autoReturn: true,
      troopType: 'cavalry',
      ...pool(300, 50),
    });
    const captive = state.officers.find((entry) => entry.factionId === 'yuan')!;
    Object.assign(captive, {
      troops: 150,
      wounded: 50,
      troopType: 'cavalry',
      location: { kind: 'captured', cityId: city.id },
    });
    expect(cityPersonnelSummary(state, city.id)).toEqual({
      troops: 1100,
      wounded: 250,
      available: 500,
      prisoners: 200,
      foodHeadcount: 2800,
    });
    expect(custodyHolder(state, captive)).toBe('cao');
    expect(custodyHolder(state, officer)).toBeNull();
  });

  it('freezes eligibility before commands, and advances the snapshot independently of DayResolution', () => {
    const { state, officer, city } = fixture();
    const daybreak = structuredClone(state.personnelDay);
    officer.wounded += 10;
    city.food = 0;
    expect(state.personnelDay).toEqual(daybreak);
    expect(state.dayResolution).toBeNull();
    const next = advanceV03(state, 1).state;
    expect(next.absoluteDay).toBe(1);
    expect(next.personnelDay.absoluteDay).toBe(1);
    expect(next.personnelDay.completed).toBe(false);
    expect(
      next.personnelDay.entries.find((entry) => entry.recordId === `officer:${officer.id}`),
    ).toMatchObject({ wounded: 3010, foodAvailable: false });
    expect(next.dayResolution).toBeNull();
  });
});
