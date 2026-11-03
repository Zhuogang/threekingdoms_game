import { describe, expect, it } from 'vitest';
import {
  deserializeSiegeSave,
  loadSiege,
  saveSiege,
  serializeSiegeSave,
  SIEGE_SAVE_KEY,
  type SiegeSave,
  presentationFor,
} from '../../src/siege/save';
import { createSiegeState } from '../../src/siege/rules/state';
import { endDay } from '../../src/siege/rules/day';
import { runDefenderTurn } from '../../src/siege/ai/defender';
import { act, duel, engine } from './rulesFixtures';

describe('independent Chencang saves', () => {
  it('remembers opening progress, act banners and dismissed hints, while accepting task F saves', () => {
    const save: SiegeSave = {
      state: createSiegeState(228),
      phase: 'opening',
      facings: {},
      presentation: { openingStep: 4, bannersSeen: [1], dismissedHints: ['wall', 'frontage'] },
    };
    expect(deserializeSiegeSave(serializeSiegeSave(save))).toEqual(save);
    const old: SiegeSave = { state: save.state, phase: 'battle', facings: {} };
    const loaded = deserializeSiegeSave(serializeSiegeSave(old));
    expect(presentationFor(loaded)).toEqual({
      openingStep: 6,
      bannersSeen: [1],
      dismissedHints: [],
    });
    expect(() =>
      deserializeSiegeSave(
        JSON.stringify({
          ...save,
          presentation: { ...save.presentation, dismissedHints: ['unknown'] },
        }),
      ),
    ).toThrow();
  });
  it('preserves every state field and replays the same actions and AI to the identical outcome', () => {
    const { state, shu } = duel({ x: 20, y: 19 });
    state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
    state.weather = 'wind';
    state.rngState = 0xabcdef;
    shu.casualtyRemainder = 0.65;
    shu.troopExperience = 120;
    let original = act(state, { type: 'attack', unitId: shu.id, targetId: state.units[1]!.id });
    original = act(original, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'earthCart' });
    const save: SiegeSave = { state: original, phase: 'battle', facings: { engine: 'west' } };
    const loaded = deserializeSiegeSave(serializeSiegeSave(save));
    expect(loaded).toEqual(save);
    expect(loaded.state).not.toBe(original);
    let replay = loaded.state;
    while (!original.outcome) {
      original = endDay(original, runDefenderTurn);
      replay = endDay(replay, runDefenderTurn);
      expect(replay).toEqual(original);
    }
    expect(replay.outcome).toBeTruthy();
    expect(replay.seed).toBe(state.seed);
    expect(replay.rngState).toBe(original.rngState);
  });
  it('only touches its own storage slot, with deployment and facing intact', () => {
    const values = new Map([['threekingdoms-v03-autosave', 'campaign payload']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    expect(loadSiege(storage)).toBeNull();
    const save: SiegeSave = { state: createSiegeState(921), phase: 'deploy', facings: {} };
    saveSiege(save, storage);
    expect(loadSiege(storage)).toEqual(save);
    expect([...values.keys()].sort()).toEqual(
      ['threekingdoms-v03-autosave', SIEGE_SAVE_KEY].sort(),
    );
    expect(values.get('threekingdoms-v03-autosave')).toBe('campaign payload');
  });
  it('rejects malformed, incomplete or other campaign payloads', () => {
    for (const value of ['{', 'null', '{}', JSON.stringify({ state: { version: 'v03' } })])
      expect(() => deserializeSiegeSave(value)).toThrow();
    const save = { state: createSiegeState(5), phase: 'battle', facings: {} };
    const invalid = structuredClone(save);
    invalid.state.units[0]!.troops = -2;
    expect(() => deserializeSiegeSave(JSON.stringify(invalid))).toThrow();
  });
});
