import { describe, expect, it } from 'vitest';
import { field, neutral, strike, unit, type Spec } from './fieldHelpers';
import { decodeV03Save, encodeV03Save } from '../../../src/v03/platform/storage';
import { playtestFixture } from '../../../src/v03/dev/fixtures';
import {
  advanceBattleDay,
  applyBattleAction,
  attackAspect,
  evaluateBattleTurn,
  predictBattleAttack,
  reachablePath,
  runBattleAiTurn,
  type V03TacticalBattleState,
} from '../../../src/v03/battle';

describe('facing (B-02)', () => {
  const hits = (aspectCell: [number, number]) =>
    field([
      { id: 'a', side: 'attacker', type: 'infantry', x: aspectCell[0], y: aspectCell[1] },
      { id: 'd', side: 'defender', type: 'infantry', x: 10, y: 10, facing: 'w', troops: 1500 },
    ]);

  it('classifies the aspect by angle: front diagonal is front, rear diagonal is flank', () => {
    const target = { x: 10, y: 10, facing: 'w' as const };
    expect(attackAspect({ x: 9, y: 10 }, target)).toBe('front');
    expect(attackAspect({ x: 7, y: 11 }, target)).toBe('front');
    expect(attackAspect({ x: 11, y: 10 }, target)).toBe('rear');
    expect(attackAspect({ x: 10, y: 9 }, target)).toBe('flank');
    expect(attackAspect({ x: 10, y: 12 }, target)).toBe('flank');
    expect(attackAspect({ x: 9, y: 9 }, target)).toBe('front');
    expect(attackAspect({ x: 11, y: 11 }, target)).toBe('flank');
    expect(attackAspect({ x: 12, y: 11 }, target)).toBe('rear');
  });

  it('hits 1 : 1.25 : 1.5 from the front, flank and rear', () => {
    const front = strike(hits([9, 10]), 'a', 'd');
    const flank = strike(hits([10, 9]), 'a', 'd');
    const rear = strike(hits([11, 10]), 'a', 'd');
    expect(front.primaryParams.aspect).toBeUndefined();
    expect(flank.primaryParams.aspect).toBe('flank');
    expect(rear.primaryParams.aspect).toBe('rear');
    expect(Math.abs(flank.primary - front.primary * 1.25)).toBeLessThanOrEqual(1);
    expect(Math.abs(rear.primary - front.primary * 1.5)).toBeLessThanOrEqual(1);
  });

  it('counterattacks 1 : 0.5 : 0 after a front, flank and rear hit', () => {
    for (const [cell, factor] of [
      [[9, 10], 1],
      [[10, 9], 0.5],
      [[11, 10], 0],
    ] as const) {
      const start = hits([cell[0], cell[1]]);
      const result = strike(start, 'a', 'd');
      if (factor === 0) {
        expect(result.counter).toBeNull();
        continue;
      }
      // What the defender would deal from the survivors, fighting with no facing rules.
      const plain = neutral(start);
      Object.assign(unit(plain, 'd'), {
        troops: unit(result.state, 'd').troops,
        morale: unit(result.state, 'd').morale,
      });
      const full = predictBattleAttack(plain, 'd', 'a')!.estimatedCasualties!;
      expect(Math.abs(result.counter! - full * factor)).toBeLessThanOrEqual(1);
    }
  });

  it('forecasts equal the resolution for every aspect', () => {
    for (const cell of [
      [9, 10],
      [10, 9],
      [10, 11],
      [11, 10],
    ] as const) {
      const start = hits([cell[0], cell[1]]);
      const forecast = predictBattleAttack(start, 'a', 'd')!;
      const result = strike(start, 'a', 'd');
      expect(result.primary).toBe(forecast.estimatedCasualties);
      expect(result.counter).toBe(forecast.counterattack.estimatedCasualties);
      expect(forecast.aspect).toBe(
        attackAspect({ x: cell[0], y: cell[1] }, unit(start, 'd') as never),
      );
    }
  });

  it('turns after a move to its last step and after an attack toward the target', () => {
    const start = field([
      { id: 'a', side: 'attacker', type: 'infantry', x: 5, y: 5 },
      { id: 'd', side: 'defender', type: 'infantry', x: 20, y: 20 },
    ]);
    expect(unit(start, 'a').facing).toBe('e');
    expect(unit(start, 'd').facing).toBe('w');
    const path = reachablePath(start, 'a', 5, 7)!;
    expect(path[0]).toEqual({ x: 5, y: 5 });
    expect(path[path.length - 1]).toEqual({ x: 5, y: 7 });
    const down = applyBattleAction(start, { type: 'move', unitId: 'a', x: 5, y: 7 });
    expect(down.ok && unit(down.state, 'a').facing).toBe('s');
    const left = applyBattleAction(start, { type: 'move', unitId: 'a', x: 3, y: 5 });
    expect(left.ok && unit(left.state, 'a').facing).toBe('w');

    const contact = field([
      { id: 'a', side: 'attacker', type: 'infantry', x: 5, y: 5, facing: 'e' },
      { id: 'd', side: 'defender', type: 'infantry', x: 5, y: 4, facing: 'w' },
    ]);
    const struck = strike(contact, 'a', 'd');
    expect(unit(struck.state, 'a').facing).toBe('n');
    // A counterattack does not turn the defender; holding keeps the facing.
    expect(unit(struck.state, 'd').facing).toBe('w');
    const held = applyBattleAction(start, { type: 'wait', unitId: 'a' });
    expect(held.ok && unit(held.state, 'a').facing).toBe('e');
  });

  it('prefers a free flank to an equal frontal hit', () => {
    for (const flankFacing of ['w', 'n'] as const) {
      // `front` faces the attacker; the other target's facing exposes its rear (w) or flank (n).
      const battle = field([
        { id: 'a', side: 'defender', type: 'infantry', x: 10, y: 10 },
        { id: 'front', side: 'attacker', type: 'infantry', x: 11, y: 10, facing: 'w' },
        { id: 'open', side: 'attacker', type: 'infantry', x: 9, y: 10, facing: flankFacing },
      ]);
      battle.playerSide = 'attacker';
      expect(attackAspect(unit(battle, 'a'), unit(battle, 'front') as never)).toBe('front');
      expect(evaluateBattleTurn(battle, 'a')[0]!.targetId).toBe('open');
    }
  });

  it('gives no facing without the option and leaves the battle unchanged', () => {
    const specs: Spec[] = [
      { id: 'a', side: 'attacker', type: 'infantry', x: 5, y: 5 },
      { id: 'b', side: 'attacker', type: 'cavalry', x: 5, y: 9 },
      { id: 'd', side: 'defender', type: 'infantry', x: 8, y: 6 },
      { id: 'e', side: 'defender', type: 'archer', x: 9, y: 9 },
    ];
    const run = (battle: V03TacticalBattleState) => {
      let state = battle;
      for (let day = 0; day < 12 && !state.outcome; day++) {
        state = runBattleAiTurn(state, 'attacker');
        if (!state.outcome) state = runBattleAiTurn(state, 'defender');
        if (!state.outcome) state = advanceBattleDay(state);
      }
      return state;
    };
    const off = field(specs, false);
    expect(off.units.some((entry) => 'facing' in entry)).toBe(false);
    const finished = run(off);
    expect(finished.units.some((entry) => 'facing' in entry || 'braced' in entry)).toBe(false);
    expect(finished.logEntries!.some((entry) => 'aspect' in entry.params)).toBe(false);
    // The same battle with the rules on is a different battle but still plays out.
    const on = run(field(specs, true));
    expect(on.units.every((entry) => entry.facing !== undefined)).toBe(true);
  });

  it('round-trips facing, charging and braced through a save', () => {
    const state = playtestFixture('battle');
    const battle = state.battles[0]!.battleData;
    const [first, second] = battle.units;
    Object.assign(first!, { facing: 'n', charging: true });
    Object.assign(second!, { facing: 'w', braced: true });
    const restored = decodeV03Save(encodeV03Save(state)).battles[0]!.battleData.units;
    expect(restored[0]).toMatchObject({ facing: 'n', charging: true });
    expect(restored[1]).toMatchObject({ facing: 'w', braced: true });
    (first as { facing: string }).facing = 'up';
    expect(() => decodeV03Save(encodeV03Save(state))).toThrow();
  });
});
