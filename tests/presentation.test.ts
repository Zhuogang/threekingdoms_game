import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BATTLEFIELD_LABELS,
  levelPips,
  nextReadyUnit,
  unitReadiness,
} from '../src/ui/battlePresentation';
import { translateText } from '../src/i18n/core';
import { readDisplayPreset, writeDisplayPreset, DISPLAY_PREFERENCE_KEY } from '../src/ui/display';
import type { BattleState, BattleUnit } from '../src/game/types';
import { validateState } from '../src/game/campaign';
import { fullBattle } from './e2e/rendering-fixtures';

const unit = (id: string, changes: Partial<BattleUnit> = {}): BattleUnit => ({
  id,
  officerId: id,
  name: id,
  side: 'attacker',
  x: 0,
  y: 0,
  troops: 1000,
  initialTroops: 1000,
  force: 70,
  intellect: 70,
  troopType: 'infantry',
  level: 0,
  moved: false,
  acted: false,
  hurt: false,
  morale: 80,
  status: 'normal',
  ...changes,
});
const battle = (units: BattleUnit[]) => ({ units, playerSide: 'attacker' }) as BattleState;

afterEach(() => vi.unstubAllGlobals());

describe('veteran and battlefield presentation', () => {
  it.each(['xiapi', 'shouchun', 'hanzhong', 'chengdu'])(
    'uses a valid maximum-size rendering fixture at %s',
    (target) => {
      const state = fullBattle(target);
      expect(validateState(state)).toBeNull();
      for (const side of ['attacker', 'defender'])
        expect(
          state.battle!.units.filter((unit) => unit.side === side && unit.troops > 0),
        ).toHaveLength(10);
    },
  );
  it.each([
    [0, ''],
    [1, '★'],
    [2, '★'],
    [3, '★★'],
    [4, '★★'],
    [5, '★★★'],
    [6, '★★★'],
  ])('shows level %s consistently on badges and map tokens', (level, expected) => {
    expect(levelPips(Number(level))).toBe(expected);
  });
  it('names every battlefield profile in both languages', () => {
    expect(Object.keys(BATTLEFIELD_LABELS).sort()).toEqual([
      'forest',
      'mountain',
      'plains',
      'river',
    ]);
    for (const label of Object.values(BATTLEFIELD_LABELS)) {
      expect(translateText(label, 'en')).toBe(label);
      expect(translateText(label, 'zh')).toMatch(/[㐀-鿿]/u);
    }
  });
});

describe('presentation preferences tolerate browser storage failures', () => {
  it('defaults absent, corrupt, and inherited-property values to Comfortable', () => {
    for (const value of [null, '{invalid}', 'constructor', 'prototype', 'LARGE']) {
      vi.stubGlobal('localStorage', { getItem: () => value });
      expect(readDisplayPreset()).toBe('comfortable');
    }
  });
  it('persists valid presets without requiring browser storage availability', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    writeDisplayPreset('large');
    expect(data.get(DISPLAY_PREFERENCE_KEY)).toBe('large');
    expect(readDisplayPreset()).toBe('large');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(readDisplayPreset()).toBe('comfortable');
    expect(() => writeDisplayPreset('compact')).not.toThrow();
  });
});

describe('next ready commander', () => {
  it('cycles roster order once, includes moved units, skips all unavailable cases, and never mutates a battle', () => {
    const state = battle([
      unit('ready-a'),
      unit('enemy', { side: 'defender' }),
      unit('dead', { troops: 0 }),
      unit('spent', { acted: true }),
      unit('confused', { status: 'confused' }),
      unit('moved', { moved: true }),
      unit('ready-b'),
    ]);
    const original = structuredClone(state);
    expect(nextReadyUnit(state, 'ready-a')?.id).toBe('moved');
    expect(nextReadyUnit(state, 'moved')?.id).toBe('ready-b');
    expect(nextReadyUnit(state, 'ready-b')?.id).toBe('ready-a');
    expect(nextReadyUnit(state, null)?.id).toBe('ready-a');
    expect(nextReadyUnit(state, 'unknown')?.id).toBe('ready-a');
    expect(state).toEqual(original);
  });
  it('supports a lone eligible unit and an exhausted or empty roster', () => {
    expect(nextReadyUnit(battle([unit('last')]), 'last')?.id).toBe('last');
    expect(nextReadyUnit(battle([unit('spent', { acted: true })]), 'spent')).toBeNull();
    expect(nextReadyUnit(battle([]), null)).toBeNull();
  });
  it('keeps inspiration separate from readiness and distinguishes movement from action', () => {
    expect(unitReadiness(unit('ready', { status: 'inspired' }))).toBe('Ready');
    expect(unitReadiness(unit('moved', { moved: true }))).toBe('Moved · action ready');
    expect(unitReadiness(unit('acted', { moved: true, acted: true }))).toBe('Finished for today');
    expect(unitReadiness(unit('confused', { acted: true, status: 'confused' }))).toBe(
      'Confused · unavailable',
    );
  });
});
