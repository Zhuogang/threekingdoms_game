import { describe, expect, it } from 'vitest';
import { validateCampaignSaveCheckpoint } from '../../tools/campaign-save-checkpoint.mjs';
import { createV03Game } from '../../src/v03/initial-state';
import { executeV03Command } from '../../src/v03/commands';
import { decodeV03Save, encodeV03Save } from '../../src/v03/platform/storage';
import { strandedReturnMonthEndFixture } from './helpers/stranded-return-fixture';

const api = { encodeV03Save, decodeV03Save };

describe('passive campaign save checkpoints', () => {
  it('records reproducible save evidence without changing live state or RNG', () => {
    const state = createV03Game('cao', 610301);
    const before = structuredClone(state);
    const record = validateCampaignSaveCheckpoint(api, state, 'initial');
    expect(record).toMatchObject({ reason: 'initial', absoluteDay: 0, phase: 'planning' });
    expect(record.bytes).toBeGreaterThan(0);
    expect(record.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(validateCampaignSaveCheckpoint(api, state, 'initial')).toEqual(record);
    expect(state).toEqual(before);
  });

  it('compares reload with the compacted snapshot while preserving live history', () => {
    const state = createV03Game('liu', 970302);
    state.log = Array.from({ length: 1600 }, (_, i) => `Report ${i}`);
    const before = structuredClone(state);
    expect(decodeV03Save(encodeV03Save(state)).log).toHaveLength(1000);
    expect(() => validateCampaignSaveCheckpoint(api, state, 'month-boundary')).not.toThrow();
    expect(state).toEqual(before);
  });

  it('rejects unfinished battle settlement in a finished campaign', () => {
    const { state } = strandedReturnMonthEndFixture();
    const result = executeV03Command(state, { type: 'advance', days: 1 });
    expect(result.ok, result.error).toBe(true);
    expect(validateCampaignSaveCheckpoint(api, result.state, 'final').phase).toBe('finished');
    expect(result.state.battles.length).toBeGreaterThan(0);
    result.state.battles[0]!.active = true;
    const before = structuredClone(result.state);
    expect(() => validateCampaignSaveCheckpoint(api, result.state, 'final')).toThrow(
      'cannot be saved',
    );
    expect(result.state).toEqual(before);
  });

  it('fails if decoding changes a serialized resource or RNG', () => {
    const state = createV03Game('cao', 610301);
    const changedDecoder = (payload: string) => {
      const restored = decodeV03Save(payload);
      restored.rng++;
      return restored;
    };
    expect(() =>
      validateCampaignSaveCheckpoint({ ...api, decodeV03Save: changedDecoder }, state, 'initial'),
    ).toThrow('Reload changed the serialized campaign state');
  });

  it('fails if the codec mutates the live simulation', () => {
    const state = createV03Game('cao', 610301);
    expect(() =>
      validateCampaignSaveCheckpoint(
        {
          ...api,
          encodeV03Save: (source) => {
            source.rng++;
            return encodeV03Save(source);
          },
        },
        state,
        'initial',
      ),
    ).toThrow('Save validation changed the live campaign or RNG');
  });
});
