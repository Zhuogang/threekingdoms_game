import { describe, expect, it } from 'vitest';
import {
  decodeV03Save,
  encodeV03Save,
  loadV03Autosave,
  saveV03Autosave,
  V03_AUTOSAVE_KEY,
} from '../../../src/v03/platform/storage';
import type { V03GameState } from '../../../src/v03/types';

function sampleState(): V03GameState {
  return {
    version: 3,
    ruleset: 'hegemony-3',
    revision: 5,
    scenarioId: 'divided-realm-190',
    seed: 19,
    playerFactionId: 'cao',
    startYear: 190,
    absoluteDay: 30,
    monthIndex: 1,
    rng: 99,
    nextId: 7,
    phase: 'planning',
    playerCapitalCityId: 'xuchang',
    factions: [
      {
        id: 'cao',
        name: 'Cao Cao',
        chinese: '曹',
        leaderOfficerId: 'caocao',
        color: '#53778d',
        capitalCityId: 'xuchang',
        isPlayer: true,
        eliminated: false,
      },
      {
        id: 'yuan',
        name: 'Yuan Shao',
        chinese: '袁',
        leaderOfficerId: 'yuanshao',
        color: '#93824b',
        capitalCityId: 'ye',
        isPlayer: false,
        eliminated: false,
      },
    ],
    cities: [
      {
        id: 'xuchang',
        name: 'Xuchang',
        chinese: '许昌',
        region: 'Central',
        factionId: 'cao',
        population: 5000,
        farming: 60,
        commerce: 60,
        loyalty: 70,
        gold: 500,
        food: 700,
        reserve: 0,
        garrisonTroops: 1000,
        governorId: null,
        pendingAppointment: null,
        governanceMode: 'ruler',
      },
      {
        id: 'ye',
        name: 'Ye',
        chinese: '邺',
        region: 'North',
        factionId: 'yuan',
        population: 6000,
        farming: 70,
        commerce: 60,
        loyalty: 70,
        gold: 600,
        food: 800,
        reserve: 0,
        garrisonTroops: 1200,
        governorId: null,
        pendingAppointment: null,
        governanceMode: 'steward',
      },
    ],
    officers: [
      {
        id: 'caocao',
        name: 'Cao Cao',
        chinese: '曹操',
        factionId: 'cao',
        location: { kind: 'city', cityId: 'xuchang' },
        force: 80,
        intellect: 98,
        loyalty: 100,
        age: 35,
        troops: 0,
        troopType: 'infantry',
        experience: 0,
        level: 0,
        governorOfCityId: null,
        alive: true,
      },
      {
        id: 'yuanshao',
        name: 'Yuan Shao',
        chinese: '袁绍',
        factionId: 'yuan',
        location: { kind: 'city', cityId: 'ye' },
        force: 70,
        intellect: 75,
        loyalty: 100,
        age: 40,
        troops: 0,
        troopType: 'infantry',
        experience: 0,
        level: 0,
        governorOfCityId: null,
        alive: true,
      },
    ],
    journeys: [],
    requisitions: [],
    directives: [],
    battles: [],
    dayResolution: null,
    events: [],
    log: [],
    winnerFactionId: null,
    governanceRevision: 0,
  };
}

describe('v0.3 save format and namespace', () => {
  it('round-trips a new campaign without changing its day or ruleset', () => {
    const original = sampleState();
    const restored = decodeV03Save(encodeV03Save(original));
    expect(restored).toEqual(original);
    expect(restored.absoluteDay).toBe(30);
    expect(restored.ruleset).toBe('hegemony-3');
  });

  it('rejects a v0.2 save without trying a migration', () => {
    expect(() =>
      decodeV03Save({ format: 'baye.save', version: 2, ruleset: 'baye-atlas-2' }),
    ).toThrow('This save belongs to an older version.');
  });

  it('rejects internally inconsistent references before returning state', () => {
    const state = sampleState();
    state.playerCapitalCityId = 'missing-city';
    expect(() => encodeV03Save(state)).toThrow('state is not valid');
  });

  it('uses only the v0.3 autosave key and leaves a rejected old record untouched', () => {
    const oldRecord = JSON.stringify({ format: 'baye.save', version: 2, ruleset: 'baye-atlas-2' });
    const values = new Map<string, string>([[V03_AUTOSAVE_KEY, oldRecord]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(() => loadV03Autosave(storage)).toThrow('older version');
    expect(values.get(V03_AUTOSAVE_KEY)).toBe(oldRecord);
    saveV03Autosave(sampleState(), storage);
    expect(values.get(V03_AUTOSAVE_KEY)).toContain('hegemony-3');
  });
});
