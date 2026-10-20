import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dispatch, validateState } from '../src/game/campaign';
import type { GameCommand } from '../src/game/types';
import { decodeSave, encodeSave } from '../src/platform/saves';

const load = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const manifest = JSON.parse(load('legacy-manifest.json')) as {
  sourceCommit: string;
  fixtures: {
    file: string;
    sha256: string;
    phase: string;
    queueLength: number;
    battleUnits: number;
  }[];
};
const continuations = JSON.parse(load('legacy-continuations.json')) as {
  continuations: {
    fixture: string;
    commands: GameCommand[];
    fields: string[];
    sha256: string;
    turn: number;
    phase: string;
  }[];
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((key) => [key, canonical(object[key])]),
    );
  }
  return value;
}

describe('retained pre-improvement v0.1 saves (migrated to v2)', () => {
  it.each(manifest.fixtures)('retains and reads $file without regenerating it', (fixture) => {
    const text = load(fixture.file.split('/').at(-1)!);
    expect(createHash('sha256').update(text).digest('hex')).toBe(fixture.sha256);
    const raw = JSON.parse(text).state;
    expect(raw).not.toHaveProperty('reports');
    expect(raw).not.toHaveProperty('rivalAggression');
    const state = decodeSave(text);
    expect(validateState(state)).toBeNull();
    expect(state.phase).toBe(fixture.phase);
    expect(state.resolution?.queue.length ?? state.orders.length).toBe(fixture.queueLength);
    expect(state.battle?.units.length ?? 0).toBe(fixture.battleUnits);
    expect(decodeSave(encodeSave(state))).toEqual(state);
  });

  it('keeps the dense visual fixture semantically valid and representative', () => {
    const state = decodeSave(load('legacy-dense-battle.json'));
    const units = state.battle!.units;
    expect(new Set(units.map((unit) => unit.troopType)).size).toBe(6);
    expect(units.some((unit) => unit.officerId.startsWith('militia-'))).toBe(true);
    expect(units.some((unit) => unit.officerId === 'xiahoudun')).toBe(true);
    expect(units.some((unit) => unit.officerId === 'xiahouyuan')).toBe(true);
    expect(units.some((unit) => unit.officerId === 'taishici')).toBe(true);
    expect(units.some((unit) => unit.moved && !unit.acted)).toBe(true);
    expect(units.some((unit) => unit.acted)).toBe(true);
    expect(units.some((unit) => unit.status === 'confused')).toBe(true);
    expect(units.some((unit) => unit.status === 'inspired')).toBe(true);
  });

  it.each(continuations.continuations)(
    'migrates $fixture to v2 and continues it identically after a reload',
    (fixture) => {
      let state = decodeSave(load(`legacy-${fixture.fixture}.json`));
      let resumed = decodeSave(encodeSave(state));
      for (const command of fixture.commands) {
        const uninterrupted = dispatch(state, command);
        const restored = dispatch(decodeSave(encodeSave(resumed)), command);
        expect(uninterrupted.ok).toBe(true);
        expect(restored.ok).toBe(true);
        expect(restored.state).toEqual(uninterrupted.state);
        expect(validateState(restored.state)).toBeNull();
        state = uninterrupted.state;
        resumed = restored.state;
      }
      expect(state.turn).toBe(fixture.turn);
      expect(state.phase).toBe(fixture.phase);
      // v2 hashes were recorded intentionally after the gameplay-improvement rules landed.
      const originalFields = Object.fromEntries(
        fixture.fields.map((key) => [key, state[key as keyof typeof state]]),
      );
      expect(
        createHash('sha256')
          .update(JSON.stringify(canonical(originalFields)))
          .digest('hex'),
      ).toBe(fixture.sha256);
    },
  );
});
