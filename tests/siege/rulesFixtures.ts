import { expect } from 'vitest';
import { applySiegeAction } from '../../src/siege/rules/actions';
import { ENGINE_RULES } from '../../src/siege/rules/day';
import { createSiegeState } from '../../src/siege/rules/state';
import type {
  EngineKind,
  SiegeAction,
  SiegeEngine,
  SiegeState,
  SiegeUnit,
} from '../../src/siege/rules/types';

export function engine(
  kind: EngineKind,
  x: number,
  y: number,
  changes: Partial<SiegeEngine> = {},
): SiegeEngine {
  const max = ENGINE_RULES[kind].durability;
  return {
    id: 'engine',
    kind,
    x,
    y,
    durability: max,
    max,
    burning: false,
    wrecked: false,
    ...changes,
  };
}

export function duel(shuChanges: Partial<SiegeUnit> = {}, weiChanges: Partial<SiegeUnit> = {}) {
  const state = createSiegeState(42);
  const shu = state.units[1]!;
  const wei = state.units[10]!;
  Object.assign(shu, { x: 20, y: 19, troops: 2000 }, shuChanges);
  Object.assign(wei, { x: 20, y: 16, level: 'wall', troops: 300 }, weiChanges);
  state.units = [shu, wei];
  return { state, shu, wei };
}

export function act(state: SiegeState, action: SiegeAction): SiegeState {
  const before = structuredClone(state);
  const result = applySiegeAction(state, action);
  expect(state).toEqual(before);
  expect(result.ok, !result.ok ? result.reason : '').toBe(true);
  if (!result.ok) throw new Error(result.reason);
  expect(result.events).toEqual(result.state.log.slice(state.log.length));
  expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
  return result.state;
}

export function refused(state: SiegeState, action: SiegeAction, message?: RegExp): void {
  const before = structuredClone(state);
  const result = applySiegeAction(state, action);
  expect(result.ok).toBe(false);
  if (!result.ok && message) expect(result.reason).toMatch(message);
  expect(state).toEqual(before);
}
