import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { advanceV03 } from '../../../src/v03/engine';
import {
  createPersonnelDay,
  custodyHolder,
  detachWoundedToCity,
} from '../../../src/v03/campaign/personnel';
import {
  decodeV03Save,
  encodeV03Save,
  loadV03Autosave,
  readV03AutosavePayload,
  saveV03Autosave,
  validateV03State,
  V03_AUTOSAVE_KEY,
} from '../../../src/v03/platform/storage';
import type { V03GameState, V03Journey } from '../../../src/v03/types';

function woundedState() {
  const state = createV03Game('cao', 19);
  const officer = state.officers.find((entry) => entry.id === 'caocao')!;
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  city.garrisonTroops -= officer.troops;
  Object.assign(officer, { troops: 0, wounded: 3000, troopExperience: 1200.125 });
  state.personnelDay = createPersonnelDay(state);
  return { state, officer, city };
}

describe('personnel save schema and original-data recovery', () => {
  it('round-trips a pure-wounded elite force and multiple same-origin sources at full precision', () => {
    const { state, officer } = woundedState();
    expect(validateV03State(state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
    const source = detachWoundedToCity(state, officer.id)!;
    state.troopSources.push({
      ...source,
      id: 'other-injury',
      wounded: 500,
      troopExperience: 999.99,
      reorganizationDays: 10,
    });
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
    expect(officer.troopExperience).toBe(0);
  });

  it.each([
    'missing-field',
    'duplicate-id',
    'wrong-type',
    'wrong-owner',
    'unknown-officer',
    'unknown-city',
    'empty-source',
    'unknown-record',
    'unknown-day-holder',
    'unknown-ration-reserve',
    'duplicate-day',
    'oversized-officer',
    'lock-too-long',
  ])('rejects invalid personnel state: %s', (mode) => {
    const { state, officer } = woundedState();
    const source = detachWoundedToCity(state, officer.id)!;
    if (mode === 'missing-field') delete (officer as unknown as Record<string, unknown>).wounded;
    if (mode === 'duplicate-id') state.troopSources.push({ ...source });
    if (mode === 'wrong-type')
      source.troopType = officer.troopType === 'infantry' ? 'archer' : 'infantry';
    if (mode === 'wrong-owner') source.factionId = 'yuan';
    if (mode === 'unknown-officer') source.sourceOfficerId = 'missing';
    if (mode === 'unknown-city') source.cityId = 'missing';
    if (mode === 'empty-source') source.wounded = 0;
    if (mode === 'unknown-record') state.personnelDay.entries[0]!.recordId = 'officer:missing';
    if (mode === 'unknown-day-holder') state.personnelDay.entries[0]!.holderFactionId = 'missing';
    if (mode === 'unknown-ration-reserve')
      state.personnelDay.rations.push({
        recordId: 'reserve:missing:cavalry',
        troops: 1,
        wounded: 0,
      });
    if (mode === 'duplicate-day')
      state.personnelDay.entries.push({ ...state.personnelDay.entries[0]! });
    if (mode === 'oversized-officer') Object.assign(officer, { troops: 7000, wounded: 4000 });
    if (mode === 'lock-too-long') source.reorganizationDays = 11;
    expect(validateV03State(state)).toBe(false);
    expect(() => encodeV03Save(state)).toThrow('state is not valid');
  });

  it('recognizes a pre-personnel save and exports it byte-for-byte without decoding or overwriting', () => {
    const original = JSON.parse(encodeV03Save(createV03Game('cao', 19)));
    delete original.state.personnelSchema;
    delete original.state.personnelDay;
    delete original.state.troopSources;
    for (const officer of original.state.officers) {
      delete officer.wounded;
      delete officer.reorganizationDays;
    }
    const raw = JSON.stringify(original, null, 2);
    const values = new Map([[V03_AUTOSAVE_KEY, raw]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(() => loadV03Autosave(storage)).toThrow('predates the wounded personnel schema');
    expect(readV03AutosavePayload(storage)).toBe(raw);
    expect(values.size).toBe(1);
    const invalid = createV03Game('cao', 1);
    invalid.officers[0]!.wounded = -1;
    expect(() => saveV03Autosave(invalid, storage)).toThrow();
    expect(readV03AutosavePayload(storage)).toBe(raw);
  });

  it('distinguishes a newer personnel revision from malformed current-schema data', () => {
    const newer = JSON.parse(encodeV03Save(createV03Game('cao', 19)));
    newer.state.personnelSchema = 2;
    expect(() => decodeV03Save(newer)).toThrow('unsupported newer personnel schema');
    newer.state.personnelSchema = 1;
    delete newer.state.officers[0]!.wounded;
    expect(() => decodeV03Save(newer)).toThrow('not a valid hegemony.save');
  });

  it('retains live veteran records when compacting long history without mutating the campaign', () => {
    const { state, officer } = woundedState();
    detachWoundedToCity(state, officer.id);
    state.log = Array.from({ length: 1500 }, (_, index) => `old log ${index}`);
    const restored = decodeV03Save(encodeV03Save(state));
    expect(state.log).toHaveLength(1500);
    expect(restored.log).toHaveLength(1000);
    expect(restored.troopSources).toEqual(state.troopSources);
    expect(restored.personnelDay).toEqual(state.personnelDay);
  });

  it('represents escort custody at exactly one location without adding captives to the free party', () => {
    const { state } = woundedState();
    const captive = state.officers.find((entry) => entry.id === 'caocao')!;
    // Keep the ruler free so succession does not modify the round-trip snapshot.
    const prisoner = state.officers.find((entry) => entry.id === 'xiahoudun')!;
    const journey: V03Journey = {
      id: 'escort',
      kind: 'return',
      executionId: 'escort-execution',
      ownerFactionId: 'yuan',
      sourceCityId: 'chenliu',
      destinationCityId: 'ye',
      routeId: 'test',
      routeVersion: 'test',
      routeCityIds: ['chenliu', 'ye'],
      routeSnapshot: [
        {
          terrain: 'plain',
          lengthKm: 100,
          baseSpeedKmPerDay: 20,
          speedMultiplier: 1,
          fixedDelayDays: 0,
        },
      ],
      roadKmNominal: 100,
      departedAbsoluteDay: 0,
      expectedArrivalDay: 5,
      elapsedDays: 0,
      segmentProgressKm: [0],
      segmentWaitDays: [0],
      manifest: {
        officerIds: [],
        troopCount: 0,
        composition: { troopTypes: [] },
        carriedFood: 100,
        cargo: {},
      },
      status: 'returning',
      deliveredCargo: {},
      consumedFood: 0,
      supplyRemainderMicro: 0,
      accumulatedFoodShortfall: 0,
    };
    state.journeys.push(journey);
    prisoner.location = {
      kind: 'captured',
      cityId: null,
      holderFactionId: 'yuan',
      journeyId: journey.id,
    };
    expect(custodyHolder(state, prisoner)).toBe('yuan');
    expect(validateV03State(state)).toBe(true);
    expect(
      decodeV03Save(encodeV03Save(state)).officers.find((entry) => entry.id === prisoner.id)
        ?.location,
    ).toEqual(prisoner.location);
    expect(captive.location.kind).toBe('city');
    const originalGarrison = state.cities.find((city) => city.id === 'ye')!.garrisonTroops;
    let progressed = advanceV03(state, 1).state;
    const expectedFood = Math.floor(
      (prisoner.troops + prisoner.wounded) * (prisoner.troopType === 'cavalry' ? 2 : 1) * 0.008,
    );
    expect(progressed.journeys.find((entry) => entry.id === journey.id)?.consumedFood).toBe(
      expectedFood,
    );
    for (let day = 1; day < 5; day++) progressed = advanceV03(progressed, 1).state;
    expect(progressed.officers.find((entry) => entry.id === prisoner.id)?.location).toEqual({
      kind: 'captured',
      cityId: 'ye',
    });
    expect(progressed.cities.find((city) => city.id === 'ye')?.garrisonTroops).toBe(
      originalGarrison,
    );
    expect(validateV03State(progressed)).toBe(true);
    const before = structuredClone(state);
    prisoner.location.cityId = 'ye';
    expect(validateV03State(state)).toBe(false);
    Object.assign(state, before);
    const restored = state.officers.find((entry) => entry.id === prisoner.id)!;
    if (restored.location.kind !== 'captured') throw new Error('expected custody');
    restored.location.holderFactionId = 'cao';
    expect(validateV03State(state)).toBe(false);
  });

  it('rejects a missing custody location while permitting independent-city custody', () => {
    const state: V03GameState = createV03Game('cao', 19);
    const officer = state.officers.find((entry) => entry.id === 'xiahoudun')!;
    officer.location = { kind: 'captured', cityId: null };
    expect(validateV03State(state)).toBe(false);
    const independent = state.cities.find((entry) => entry.factionId === null)!;
    officer.location = { kind: 'captured', cityId: independent.id };
    expect(validateV03State(state)).toBe(true);
  });
});
