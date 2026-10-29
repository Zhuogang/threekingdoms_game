import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

/** Observe the real save boundary without replacing or changing the live simulation. */
export function validateCampaignSaveCheckpoint(api, state, reason) {
  const before = structuredClone(state);
  try {
    const payload = api.encodeV03Save(state);
    const serialized = JSON.parse(payload).state;
    const restored = api.decodeV03Save(payload);
    // Saving deliberately compacts old history; compare with the actual snapshot.
    assert.deepStrictEqual(restored, serialized, 'Reload changed the serialized campaign state.');
    return {
      reason,
      absoluteDay: state.absoluteDay,
      phase: state.phase,
      bytes: Buffer.byteLength(payload, 'utf8'),
      sha256: createHash('sha256').update(payload).digest('hex'),
    };
  } finally {
    assert.deepStrictEqual(state, before, 'Save validation changed the live campaign or RNG.');
  }
}
