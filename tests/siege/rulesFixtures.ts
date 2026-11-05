import {
  APPROACH_ROW,
  ROAD_COL,
  SOUTH_WALL_ROW,
  TRENCH_INNER_ROW,
  TRENCH_OUTER_ROW,
} from '../../src/siege/content/coarseGrid';
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
  Object.assign(shu, { ...approach(7), troops: 2000 }, shuChanges);
  Object.assign(wei, { ...southWall(7), troops: 300 }, weiChanges);
  state.units = [shu, wei];
  state.engines = [];
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

/** Board landmarks. Offsets count board cells, never pixels or fine art cells. */
export const ground = ({ x, y }: import('../../src/siege/rules/types').Cell) => ({
  x,
  y,
  level: 'ground' as const,
});
export const wall = ({ x, y }: import('../../src/siege/rules/types').Cell) => ({
  x,
  y,
  level: 'wall' as const,
});
export const southWall = (x = 6) => wall({ x, y: SOUTH_WALL_ROW });
export const approach = (x = 6, south = 0) => ground({ x, y: APPROACH_ROW + south });
export const innerTrench = (x = 6) => ground({ x, y: TRENCH_INNER_ROW });
export const outerTrench = (x = 6) => ground({ x, y: TRENCH_OUTER_ROW });
export const southInside = (x = ROAD_COL) => ground({ x, y: SOUTH_WALL_ROW - 1 });
export function isolatedUnit(
  side: 'shu' | 'wei',
  position = side === 'shu' ? approach() : southWall(),
) {
  const state = createSiegeState(42);
  const unit = state.units.find((u) => u.side === side)!;
  Object.assign(unit, position);
  state.units = [unit];
  state.engines = [];
  return { state, unit };
}
