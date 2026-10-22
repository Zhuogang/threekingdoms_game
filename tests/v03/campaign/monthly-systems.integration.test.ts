import { describe, expect, it } from 'vitest';
import { advanceV03 } from '../../../src/v03/engine';
import { createV03Game } from '../../../src/v03/initial-state';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';

function saveValidationMessage(state: ReturnType<typeof createV03Game>): string {
  try {
    encodeV03Save(state);
    return 'State is valid for v0.3 save.';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('v0.3 monthly campaign event integration', () => {
  it('fires the historical anti-Dong event, persists its invitation and treaties, and round-trips the save', () => {
    const state = createV03Game('cao', 31021, 'divided-realm-190');
    state.absoluteDay = 29;
    state.monthIndex = 0;

    const result = advanceV03(state, 1);

    expect(result.error).toBeUndefined();
    expect(result.daysAdvanced).toBe(1);
    expect(result.state.monthIndex).toBe(1);
    expect(result.state.firedMonthlyEventIds).toContain('anti-dong-coalition');
    expect(result.state.events).toContainEqual(
      expect.objectContaining({
        kind: 'campaignEvent',
        title: 'Monthly campaign event: anti-dong-coalition',
        absoluteDay: 30,
      }),
    );
    expect(result.state.coalitionInvitations).toContainEqual({
      id: 'invitation:anti-dong-coalition:1',
      eventId: 'anti-dong-coalition',
      targetFactionId: 'dong',
      memberFactionIds: ['liu', 'sun', 'yan', 'yuan'],
      expiresMonthIndex: 4,
    });
    expect(result.state.alliances).toEqual(
      expect.arrayContaining([
        { a: 'liu', b: 'sun', expiresMonthIndex: 7 },
        { a: 'yan', b: 'yuan', expiresMonthIndex: 7 },
      ]),
    );
    expect(validateV03State(result.state), saveValidationMessage(result.state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
  });
});
