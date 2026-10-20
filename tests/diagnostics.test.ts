import { describe, expect, it } from 'vitest';
import {
  campaignOutcome,
  cityCheckpoint,
  forceBucket,
  horizonStatus,
  parseTuningOverrides,
  retentionStatus,
} from '../tools/diagnosticMetrics';
import { game } from './fixtures';

describe('balance measurement definitions', () => {
  it('distinguishes Hegemon victory, total unification and leading a defeated player', () => {
    const state = game();
    state.phase = 'finished';
    state.turn = 60;
    state.winner = state.playerFactionId;
    state.hegemon = { factionId: state.playerFactionId, months: 12 };
    expect(campaignOutcome(state)).toMatchObject({
      reason: 'hegemon',
      playerWon: true,
      endedMonth: 60,
    });
    state.cities.forEach((c) => {
      c.factionId = state.playerFactionId;
    });
    expect(campaignOutcome(state).reason).toBe('unification');
    state.cities[0]!.factionId = 'red';
    state.cities[1]!.factionId = 'green';
    state.winner = 'red';
    state.hegemon = { factionId: null, months: 0 };
    expect(campaignOutcome(state)).toMatchObject({
      reason: 'playerElimination',
      rivalVictory: false,
    });
    state.hegemon = { factionId: 'red', months: 12 };
    expect(campaignOutcome(state)).toMatchObject({
      reason: 'playerElimination',
      rivalVictory: false,
    });
    state.cities[1]!.factionId = state.playerFactionId;
    expect(campaignOutcome(state)).toMatchObject({ reason: 'hegemon', rivalVictory: true });
    state.phase = 'planning';
    state.winner = null;
    expect(campaignOutcome(state)).toMatchObject({ reason: 'unfinished', endedMonth: null });
  });

  it('uses identical force-ratio boundaries regardless of which side is stronger', () => {
    for (const [strong, expected] of [
      [1599, 'contested'],
      [1600, 'uneven'],
      [2999, 'uneven'],
      [3000, 'lopsided'],
    ] as const) {
      expect(forceBucket({ attackerStart: strong, defenderStart: 1000 })).toBe(expected);
      expect(forceBucket({ attackerStart: 1000, defenderStart: strong })).toBe(expected);
    }
  });

  it('does not substitute final territory for unobserved later months', () => {
    expect(cityCheckpoint({ 48: 9 }, 48, 60)).toEqual({ cities: 9, status: 'observed' });
    expect(cityCheckpoint({ 48: 9 }, 96, 60)).toEqual({
      cities: null,
      status: 'endedBeforeHorizon',
    });
    expect(cityCheckpoint({ 48: 9 }, 96, null)).toEqual({ cities: null, status: 'notReached' });
  });

  it('censors future retention checks while retaining conclusive prior losses', () => {
    expect(retentionStatus(6, null, 12)).toEqual({ observed: false, kept: null });
    expect(retentionStatus(6, 3, 12)).toEqual({ observed: true, kept: false });
    expect(retentionStatus(12, 9, 6)).toEqual({ observed: true, kept: true });
    expect(retentionStatus(12, null, 12)).toEqual({ observed: true, kept: true });
  });

  it('does not extrapolate survival to an unobserved future horizon', () => {
    expect(horizonStatus({ months: 48, endedMonth: null, eliminated: null }, 96)).toEqual({
      observed: false,
      survived: null,
      active: null,
    });
    expect(horizonStatus({ months: 40, endedMonth: 40, eliminated: null }, 48)).toEqual({
      observed: true,
      survived: true,
      active: false,
    });
    expect(horizonStatus({ months: 40, endedMonth: 40, eliminated: 40 }, 48)).toEqual({
      observed: true,
      survived: false,
      active: false,
    });
    expect(horizonStatus({ months: 96, endedMonth: null, eliminated: null }, 48)).toEqual({
      observed: true,
      survived: true,
      active: true,
    });
  });

  it('rejects invalid tuning before any overrides are applied', () => {
    for (const raw of [
      'null',
      '[]',
      '{"normalDamageRate":1e999}',
      '{"counterRate":-1}',
      '{"holdNearCampRadius":1.5}',
      '{"attackMultipliers":{"balanced":"1.2"}}',
      '{"attackMultipliers":{"unknown":1}}',
      '{"armyBreak":1}',
      '{"unknown":1}',
    ])
      expect(() => parseTuningOverrides(raw)).toThrow();
    expect(
      parseTuningOverrides(
        '{"normalDamageRate":0.21,"attackMultipliers":{"balanced":1.2},"armyBreak":false}',
      ),
    ).toEqual({ normalDamageRate: 0.21, attackMultipliers: { balanced: 1.2 }, armyBreak: false });
  });
});
