import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../src/v03/initial-state';
import { advanceV03 } from '../../src/v03/engine';
import {
  createOpeningOfficer,
  expectedOfficerRosterIds,
  officerRosterPlan,
  planOfficerDebuts,
} from '../../src/v03/campaign/officer-lifecycle';
import { createPersonnelDay } from '../../src/v03/campaign/personnel';
import { createReservePools } from '../../src/v03/campaign/troop-experience';
import { OFFICER_CATALOG_BY_ID } from '../../src/v03/content/officer-catalog';
import { officerAgeAtYear, officerBaseStatsAtYear } from '../../src/v03/content/officer-timeline';
import { createOfficerRosterSetup } from '../../src/v03/content/officer-roster-setups';
import {
  decodeV03Save,
  encodeV03Save,
  loadV03Autosave,
  validateV03State,
} from '../../src/v03/platform/storage';
import { applyV03CityAction } from '../../src/v03/governance/city-actions';
import { localizedEvent } from '../../src/v03/ui/shared/legacy-events';
import type { V03GameState } from '../../src/v03/types';

const get = (state: V03GameState, id: string) =>
  state.officers.find((officer) => officer.id === id)!;
const notices = (state: V03GameState) =>
  state.events.filter(
    (event) => event.kind === 'campaignEvent' && event.title === 'New officers appeared',
  );

/** A controlled late-year fixture, not a claim of having simulated every intervening year. */
function yearEnd(scenarioId = 'divided-realm-190', year = 190, player = 'yan'): V03GameState {
  const state = createV03Game(player, 19, scenarioId);
  state.monthIndex = (year - state.startYear) * 12;
  const catchup = planOfficerDebuts(state);
  state.officers.push(...catchup.officers);
  state.lastOfficerDebutYear = year;
  state.absoluteDay = (year - state.startYear) * 360 + 359;
  state.monthIndex = Math.floor(state.absoluteDay / 30);
  for (const officer of state.officers) {
    if (officer.alive) {
      const definition = OFFICER_CATALOG_BY_ID.get(officer.id)!;
      officer.age = officerAgeAtYear(definition.timeline.birthYear, year);
      Object.assign(
        officer,
        officerBaseStatsAtYear(
          { force: definition.adultForce, intellect: definition.adultIntellect },
          definition.timeline.birthYear,
          year,
        ),
      );
    }
    officer.troops = 0;
    officer.wounded = 0;
    officer.reorganizationDays = 0;
    officer.troopExperience = 0;
  }
  for (const city of state.cities) {
    city.garrisonTroops = 0;
    city.reserve = 0;
    city.reservePools = createReservePools(0);
    city.food = 100_000;
    city.gold = 0;
    city.loyalty = 100;
  }
  state.personnelDay = createPersonnelDay(state);
  expect(validateV03State(state)).toBe(true);
  return state;
}

describe('R2 actual new-campaign initialization', () => {
  for (const scenarioId of ['divided-realm-190', 'guandu-200'] as const) {
    it(`initializes every faction using the reviewed ${scenarioId} configuration`, () => {
      const opening = createOfficerRosterSetup(scenarioId);
      for (const faction of opening.factions) {
        const state = createV03Game(faction.id, 20261026, scenarioId);
        expect(validateV03State(state)).toBe(true);
        expect(state).toMatchObject({
          officerRosterVersion: 1,
          lastOfficerDebutYear: opening.year,
        });
        expect(state.officers.map((officer) => officer.id).sort()).toEqual(
          opening.officers
            .filter((officer) => officer.status !== 'pending')
            .map((officer) => officer.id)
            .sort(),
        );
        expect(state.officers).toHaveLength(scenarioId === 'divided-realm-190' ? 69 : 81);
        for (const row of opening.officers) {
          if (row.status === 'pending')
            expect(state.officers.some((officer) => officer.id === row.id)).toBe(false);
          else
            expect(get(state, row.id)).toMatchObject({
              age: row.age,
              troops: row.troops,
              force: row.force,
              intellect: row.intellect,
              alive: row.status !== 'deceased',
              factionId: row.factionId,
              location: { kind: 'city', cityId: row.cityId },
            });
        }
        for (const city of state.cities) {
          const row = opening.cities.find((candidate) => candidate.id === city.id)!;
          expect(city.garrisonTroops).toBe(row.healthyTroops);
          expect(city.governorId).toBe(row.governorId);
          expect(city.reserve).toBe(
            Object.values(city.reservePools).reduce((sum, pool) => sum + pool.troops, 0),
          );
        }
        expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
      }
    });
  }

  it('rejects attempting to initialize a pending person as an officer', () => {
    expect(() =>
      createOpeningOfficer(
        createOfficerRosterSetup('divided-realm-190').officers.find(
          (officer) => officer.id === 'jiangwei',
        )!,
      ),
    ).toThrow('unavailable');
  });
});

describe('R2 annual appearances and persistence', () => {
  it('crosses December 30 with one appearance, correct age and zero resources, then reloads without repeating', () => {
    const before = yearEnd();
    const after = advanceV03(before, 1).state;
    expect(after.absoluteDay).toBe(360);
    expect(after.lastOfficerDebutYear).toBe(191);
    expect(after.officers).toHaveLength(70);
    expect(get(after, 'zhanglu')).toMatchObject({
      age: 29,
      factionId: null,
      alive: true,
      troops: 0,
      wounded: 0,
      experience: 0,
      troopExperience: 0,
      reorganizationDays: 0,
      governorOfCityId: null,
      location: { kind: 'city', cityId: 'hanzhong' },
    });
    expect(get(after, 'caocao').age).toBe(37);
    // His reference death is 190; a campaign already in progress does not force it.
    expect(get(after, 'zuzhao').alive).toBe(true);
    expect(notices(after)).toHaveLength(1);
    expect(validateV03State(after)).toBe(true);
    const loaded = decodeV03Save(encodeV03Save(after));
    const again = advanceV03(loaded, 1).state;
    expect(get(again, 'zhanglu').age).toBe(29);
    expect(get(again, 'caocao').age).toBe(37);
    expect(again.officers.filter((officer) => officer.id === 'zhanglu')).toHaveLength(1);
    expect(notices(again)).toHaveLength(1);
    expect(planOfficerDebuts(again)).toEqual({ officers: [], notices: [], throughYear: 191 });
    expect(before.officers).toHaveLength(69);
  });

  it('keeps single-day, ten-day and next-event advances consistent at the same year boundary', () => {
    const before = yearEnd();
    const states = ([1, 10, 'next-event'] as const).map((mode) => advanceV03(before, mode).state);
    for (const state of states) {
      expect(state.lastOfficerDebutYear).toBe(191);
      expect(state.officers.map((officer) => [officer.id, officer.age])).toEqual(
        states[0]!.officers.map((officer) => [officer.id, officer.age]),
      );
      expect(notices(state)).toHaveLength(1);
      expect(validateV03State(state)).toBe(true);
    }
  });

  it('resumes a save waiting for annual month settlement without skipping or repeating appearances', () => {
    const pending = yearEnd();
    pending.absoluteDay = 360;
    pending.monthIndex = 12;
    pending.dayResolution = {
      processingAbsoluteDay: 359,
      phase: 'month-settlement',
      battleIds: [],
      completedBattleIds: [],
      daybreakJourneySignatures: {},
      arrivals: [],
      cityServiceAccounted: true,
      settledMonth: { year: 190, month: 12 },
    };
    pending.personnelDay = createPersonnelDay(pending);
    expect(validateV03State(pending)).toBe(true);
    let resumed = advanceV03(decodeV03Save(encodeV03Save(pending)), 1).state;
    expect(resumed.lastOfficerDebutYear).toBe(191);
    expect(resumed.officers.filter((officer) => officer.id === 'zhanglu')).toHaveLength(1);
    resumed = advanceV03(decodeV03Save(encodeV03Save(resumed)), 1).state;
    expect(notices(resumed)).toHaveLength(1);
    expect(get(resumed, 'caocao').age).toBe(37);
  });

  it('merges a multi-person appearance into one localized annual notice and creates no retroactive city work', () => {
    const before = yearEnd('divided-realm-190', 194);
    const after = advanceV03(before, 1).state;
    const arrivals = notices(after);
    expect(arrivals).toHaveLength(1);
    expect(JSON.parse(arrivals[0]!.detail).entityIds).toEqual(['lvmeng', 'zhugejin']);
    expect(localizedEvent(arrivals[0]!, after, 'zh').detail).toContain('登场');
    expect(localizedEvent(arrivals[0]!, after, 'en').detail).toContain('city searches');
    for (const id of ['lvmeng', 'zhugejin'])
      expect(get(after, id)).toMatchObject({ factionId: null, troops: 0, experience: 0 });
    expect(get(after, 'lvmeng')).toMatchObject({ age: 18, force: 81, intellect: 87 });
    // Sun-held cities get residents rather than automatically acquiring these officers.
    expect(get(after, 'lvmeng').location).toEqual({ kind: 'city', cityId: 'shouchun' });
    expect(get(after, 'zhugejin').location).toEqual({ kind: 'city', cityId: 'jianye' });
  });

  it('keeps an opening death record frozen and retains an officer past a historical death year', () => {
    const before = yearEnd('guandu-200', 200);
    const after = advanceV03(before, 1).state;
    expect(get(after, 'zuzhao')).toMatchObject({ alive: false, age: 36 });
    expect(get(after, 'sunce')).toMatchObject({ alive: true, age: 27 });
    expect(get(after, 'guanping')).toMatchObject({
      alive: true,
      age: 16,
      troops: 0,
      factionId: null,
    });
    expect(decodeV03Save(encodeV03Save(after))).toEqual(after);
  });

  it('never resurrects an officer killed after appearing or re-adds a missing past-year record', () => {
    const state = yearEnd('guandu-200', 201);
    const victim = get(state, 'guanping');
    victim.alive = false;
    state.personnelDay = createPersonnelDay(state);
    const after = advanceV03(decodeV03Save(encodeV03Save(state)), 1).state;
    expect(get(after, 'guanping')).toMatchObject({ alive: false, age: 16 });
    expect(after.officers.filter((officer) => officer.id === 'guanping')).toHaveLength(1);
    const corrupt = structuredClone(after);
    corrupt.officers = corrupt.officers.filter((officer) => officer.id !== 'guanping');
    expect(validateV03State(corrupt)).toBe(false);
    expect(planOfficerDebuts(corrupt).officers.some((officer) => officer.id === 'guanping')).toBe(
      false,
    );
  });

  it('does not overwrite an existing due-year record, even if that officer has died or been captured', () => {
    for (const mode of ['dead', 'captured', 'recruited'] as const) {
      const state = yearEnd('guandu-200', 200);
      state.monthIndex = 12;
      const due = planOfficerDebuts(state).officers.find((officer) => officer.id === 'guanping')!;
      if (mode === 'dead') due.alive = false;
      if (mode === 'captured') due.location = { kind: 'captured', cityId: 'xuchang' };
      if (mode === 'recruited') due.factionId = 'cao';
      state.officers.push(due);
      const previous = structuredClone(due);
      expect(planOfficerDebuts(state).officers.some((officer) => officer.id === 'guanping')).toBe(
        false,
      );
      expect(due).toEqual(previous);
    }
  });

  it('supports a late-year appearance without forcing historical deaths or extra adulthood growth', () => {
    const before = yearEnd('guandu-200', 224);
    const after = advanceV03(before, 1).state;
    expect(get(after, 'jiangwei')).toMatchObject({
      age: 24,
      force: 89,
      intellect: 90,
      troops: 0,
      factionId: null,
    });
    expect(get(after, 'caocao')).toMatchObject({ alive: true, age: 71 });
    expect(after.officers).toHaveLength(98);
    expect(after.officers.filter((officer) => officer.alive)).toHaveLength(83);
    expect(validateV03State(after)).toBe(true);
  });

  it('plans appearances without RNG draws, and fails without changing the input if a configured city is missing', () => {
    const state = yearEnd();
    state.monthIndex = 12;
    const snapshot = structuredClone(state);
    planOfficerDebuts(state);
    expect(state).toEqual(snapshot);
    state.cities = state.cities.filter((city) => city.id !== 'hanzhong');
    const corrupt = structuredClone(state);
    expect(() => planOfficerDebuts(state)).toThrow('Missing officer appearance city');
    expect(state).toEqual(corrupt);
  });
});

describe('R2 adulthood retains actual training and equipment', () => {
  it.each([104, 105])(
    'reports only actual maturity gains at the equipment/stat limits (%s force)',
    (force) => {
      const state = yearEnd('divided-realm-190', 191, 'sun');
      Object.assign(get(state, 'sunce'), { force, intellect: 100, equipment: 'Fine arms' });
      const after = advanceV03(state, 1).state;
      const event = after.events.find(
        (entry) => entry.detail.includes('come-of-age') && entry.detail.includes('sunce'),
      )!;
      expect(JSON.parse(event.detail).values).toMatchObject({
        forceGain: 105 - force,
        intellectGain: 0,
      });
      expect(get(after, 'sunce').force).toBe(105);
    },
  );
  it('adds +3/+2 to a trained, leveled and equipped seventeen-year-old, once across reload', () => {
    let state = yearEnd('divided-realm-190', 191, 'sun');
    const sunce = get(state, 'sunce');
    sunce.troops = 500;
    sunce.experience = 75;
    const city = state.cities.find((city) => city.id === 'jianye')!;
    city.garrisonTroops = 500;
    city.gold = 5000;
    city.workMonthIndex = state.monthIndex;
    city.workPointsUsed = 0;
    state.personnelDay = createPersonnelDay(state);
    const equip = applyV03CityAction(state, {
      cityId: 'jianye',
      officerId: 'sunce',
      action: 'equip',
    });
    expect(equip.ok).toBe(true);
    const training = applyV03CityAction(equip.state, {
      cityId: 'jianye',
      officerId: 'sunce',
      action: 'train',
    });
    expect(training.ok).toBe(true);
    state = training.state;
    expect(get(state, 'sunce')).toMatchObject({
      age: 17,
      force: 100,
      intellect: 74,
      equipment: 'Fine arms',
      experience: 100,
      level: 1,
    });
    const after = advanceV03(decodeV03Save(encodeV03Save(state)), 1).state;
    expect(get(after, 'sunce')).toMatchObject({
      age: 18,
      force: 103,
      intellect: 76,
      equipment: 'Fine arms',
      experience: 100,
      level: 1,
    });
    const again = advanceV03(decodeV03Save(encodeV03Save(after)), 1).state;
    expect(get(again, 'sunce')).toMatchObject({
      age: 18,
      force: 103,
      equipment: 'Fine arms',
      experience: 100,
      level: 1,
    });
  });
});

describe('R2 save roster completeness and version guards', () => {
  it('rejects missing living/free/dead identities, future injection and unknown replacements', () => {
    const state = createV03Game('cao', 19, 'guandu-200');
    for (const id of ['caocao', 'zhugeliang', 'liru']) {
      const corrupt = structuredClone(state);
      corrupt.officers = corrupt.officers.filter((officer) => officer.id !== id);
      expect(validateV03State(corrupt), id).toBe(false);
    }
    const corrupt = structuredClone(state);
    corrupt.officers[0]!.id = 'unrecognized-officer';
    expect(validateV03State(corrupt)).toBe(false);
    const injected = structuredClone(state);
    injected.officers.push({
      ...get(state, 'zhugeliang'),
      id: 'jiangwei',
      name: 'Jiang Wei',
      chinese: '姜维',
    });
    expect(validateV03State(injected)).toBe(false);
  });

  it('rejects revived opening deaths, altered identities and a forged age/growth checkpoint', () => {
    const state = createV03Game('cao', 19, 'guandu-200');
    for (const mutation of [
      (s: V03GameState) => {
        get(s, 'liru').alive = true;
      },
      (s: V03GameState) => {
        get(s, 'caocao').age = 17;
      },
      (s: V03GameState) => {
        get(s, 'caocao').age = null;
      },
      (s: V03GameState) => {
        get(s, 'caocao').chinese = '另一个人';
      },
      (s: V03GameState) => {
        s.lastOfficerDebutYear = 199;
      },
      (s: V03GameState) => {
        s.lastOfficerDebutYear = 201;
      },
      (s: V03GameState) => {
        s.startYear = 190;
      },
    ]) {
      const corrupt = structuredClone(state);
      mutation(corrupt);
      expect(validateV03State(corrupt)).toBe(false);
    }
  });

  it('rejects old or newer roster saves without writing over the original payload', () => {
    const original = JSON.parse(encodeV03Save(createV03Game('cao', 19)));
    for (const version of [undefined, 0, 2]) {
      const envelope = structuredClone(original);
      if (version === undefined) delete envelope.state.officerRosterVersion;
      else envelope.state.officerRosterVersion = version;
      const payload = JSON.stringify(envelope);
      const storage = { getItem: () => payload };
      expect(() => loadV03Autosave(storage)).toThrow(
        version === 2 ? 'newer officer roster' : 'older officer roster',
      );
      expect(storage.getItem()).toBe(payload);
    }
    const missingCheckpoint = structuredClone(original);
    delete missingCheckpoint.state.lastOfficerDebutYear;
    expect(() => decodeV03Save(JSON.stringify(missingCheckpoint))).toThrow();
  });

  it('derives the exact expected cohort from the chosen opening and completed years', () => {
    expect(expectedOfficerRosterIds('divided-realm-190', 190)!.size).toBe(69);
    expect(expectedOfficerRosterIds('guandu-200', 200)!.size).toBe(81);
    expect(expectedOfficerRosterIds('guandu-200', 225)!.size).toBe(98);
    expect(officerRosterPlan('unknown-scenario')).toBeUndefined();
    expect(expectedOfficerRosterIds('unknown-scenario', 200)).toBe(null);
  });
});
