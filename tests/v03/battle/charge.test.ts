import { describe, expect, it } from 'vitest';
import { field, neutral, strike, unit, type Spec } from './fieldHelpers';
import {
  applyBattleAction,
  advanceBattleDay,
  predictBattleAttack,
  runBattleAiTurn,
  type V03TacticalBattleState,
} from '../../../src/v03/battle';
import { playtestFixture } from '../../../src/v03/dev/fixtures';
import { formatBattleLog } from '../../../src/v03/i18n/formatters';

/** Cavalry at (5,10) with an enemy infantry formation at (9,10) facing it, a charge range apart. */
const cavalryField = (extra: Partial<Spec> = {}, target: Partial<Spec> = {}) =>
  field([
    { id: 'c', side: 'attacker', type: 'cavalry', x: 5, y: 10, ...extra },
    { id: 'i', side: 'defender', type: 'infantry', x: 9, y: 10, facing: 'w', ...target },
  ]);

function move(battle: V03TacticalBattleState, id: string, x: number, y: number) {
  const result = applyBattleAction(battle, { type: 'move', unitId: id, x, y });
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** What the hit would be with no facing rules at all. */
const plainHit = (battle: V03TacticalBattleState, from: string, to: string) =>
  predictBattleAttack(neutral(battle), from, to)!.estimatedCasualties!;

describe('cavalry charge (B-03)', () => {
  it('a straight run of three plain cells gives x1.3', () => {
    const charged = move(cavalryField(), 'c', 8, 10);
    expect(unit(charged, 'c').charging).toBe(true);
    const forecast = predictBattleAttack(charged, 'c', 'i')!;
    expect(forecast.charge).toBe(true);
    expect(forecast.aspect).toBe('front');
    const result = strike(charged, 'c', 'i');
    expect(Math.abs(result.primary - plainHit(charged, 'c', 'i') * 1.3)).toBeLessThanOrEqual(1);
    expect(result.primaryParams.charge).toBe(true);
    expect(result.primary).toBe(forecast.estimatedCasualties);
    // The charge is spent by the attack.
    expect(unit(result.state, 'c').charging).toBeFalsy();
  });

  it('no charge for a short run, a diagonal run or a run through forest', () => {
    expect(unit(move(cavalryField(), 'c', 7, 10), 'c').charging).toBeFalsy();
    expect(unit(move(cavalryField(), 'c', 7, 11), 'c').charging).toBeFalsy();
    const rough = cavalryField();
    rough.map.terrain[10 * rough.map.width + 6] = 'forest';
    const afterForest = move(rough, 'c', 8, 10);
    expect(unit(afterForest, 'c').charging).toBeFalsy();
    const forecast = predictBattleAttack(afterForest, 'c', 'i')!;
    expect(forecast.charge).toBe(false);
    expect(strike(afterForest, 'c', 'i').primary).toBe(forecast.estimatedCasualties);
  });

  it('infantry never charge, and the charge ends at rollover', () => {
    const walker = field([
      { id: 'w', side: 'attacker', type: 'infantry', x: 5, y: 10 },
      { id: 'i', side: 'defender', type: 'infantry', x: 20, y: 20 },
    ]);
    expect(unit(move(walker, 'w', 8, 10), 'w').charging).toBeFalsy();
    const charged = move(cavalryField({}, { x: 20, y: 20 }), 'c', 8, 10);
    expect(unit(charged, 'c').charging).toBe(true);
    expect(unit(advanceBattleDay(charged), 'c').charging).toBeFalsy();
  });

  it('a braced formation hit from the front cancels the charge and counters x1.2', () => {
    const start = move(cavalryField({}, { x: 9, y: 10 }), 'c', 8, 10);
    Object.assign(unit(start, 'i'), { braced: true });
    const forecast = predictBattleAttack(start, 'c', 'i')!;
    expect(forecast.charge).toBe(false);
    expect(forecast.braced).toBe(true);
    const result = strike(start, 'c', 'i');
    expect(result.primary).toBe(plainHit(start, 'c', 'i'));
    expect(result.primary).toBe(forecast.estimatedCasualties);
    expect(result.counter).toBe(forecast.counterattack.estimatedCasualties);
    expect(result.counterParams!.braced).toBe(true);
    const plain = neutral(start);
    Object.assign(unit(plain, 'i'), {
      troops: unit(result.state, 'i').troops,
      morale: unit(result.state, 'i').morale,
    });
    const full = predictBattleAttack(plain, 'i', 'c')!.estimatedCasualties!;
    expect(Math.abs(result.counter! - full * 1.2)).toBeLessThanOrEqual(1);
  });

  it('a brace does nothing from the flank, when wavering, or for a unit that moved', () => {
    const flank = move(cavalryField({}, { facing: 'n', troops: 3000 }), 'c', 8, 10);
    Object.assign(unit(flank, 'i'), { braced: true });
    const forecast = predictBattleAttack(flank, 'c', 'i')!;
    expect(forecast).toMatchObject({ aspect: 'flank', charge: true, braced: false });
    const result = strike(flank, 'c', 'i');
    expect(result.primary).toBe(forecast.estimatedCasualties);
    expect(Math.abs(result.primary - plainHit(flank, 'c', 'i') * 1.3 * 1.25)).toBeLessThanOrEqual(
      1.5,
    );
    const plain = neutral(flank);
    Object.assign(unit(plain, 'i'), {
      troops: unit(result.state, 'i').troops,
      morale: unit(result.state, 'i').morale,
    });
    const full = predictBattleAttack(plain, 'i', 'c')!.estimatedCasualties!;
    expect(Math.abs(result.counter! - full * 0.5)).toBeLessThanOrEqual(1);

    const wavering = move(cavalryField(), 'c', 8, 10);
    Object.assign(unit(wavering, 'i'), { braced: true, morale: 30 });
    expect(predictBattleAttack(wavering, 'c', 'i')).toMatchObject({ charge: true, braced: false });
  });

  it('holding without a move braces infantry; moving or acting ends it', () => {
    const start = field([
      { id: 'a', side: 'attacker', type: 'infantry', x: 5, y: 10 },
      { id: 'k', side: 'attacker', type: 'cavalry', x: 5, y: 12 },
      { id: 'd', side: 'defender', type: 'infantry', x: 20, y: 20 },
    ]);
    const held = applyBattleAction(start, { type: 'wait', unitId: 'a' });
    expect(held.ok && unit(held.state, 'a').braced).toBe(true);
    // Cavalry cannot brace.
    const cavalryHeld = applyBattleAction(start, { type: 'wait', unitId: 'k' });
    expect(cavalryHeld.ok && unit(cavalryHeld.state, 'k').braced).toBeFalsy();
    // It lasts through the rollover, until the formation next moves.
    const next = advanceBattleDay(held.ok ? held.state : start);
    expect(unit(next, 'a').braced).toBe(true);
    expect(unit(move(next, 'a', 7, 10), 'a').braced).toBeFalsy();
    // Moving first and then waiting does not brace.
    const moved = applyBattleAction(move(start, 'a', 6, 10), { type: 'wait', unitId: 'a' });
    expect(moved.ok && unit(moved.state, 'a').braced).toBeFalsy();
  });

  it('a hold executed by the AI braces the formation', () => {
    const start = field([
      { id: 'a', side: 'defender', type: 'infantry', x: 5, y: 10 },
      { id: 'd', side: 'attacker', type: 'infantry', x: 20, y: 20 },
    ]);
    unit(start, 'a').order = { kind: 'hold' };
    const after = runBattleAiTurn(start, 'defender', {}, { useOrders: true, assignOrders: false });
    expect(unit(after, 'a')).toMatchObject({ x: 5, y: 10, braced: true });
  });
});

describe('battle log notes (B-02, B-03)', () => {
  it('names the flank, rear, charge, brace and melee in both languages', () => {
    const state = playtestFixture('battle');
    const battle = state.battles[0]!.battleData;
    const [source, target] = battle.units;
    const line = (params: Record<string, string | number | boolean>, locale: 'en' | 'zh') =>
      formatBattleLog(
        {
          day: 1,
          index: 1,
          code: 'log.attack',
          params: { sourceId: source!.id, targetId: target!.id, casualties: 9, ...params },
        },
        battle,
        state,
        locale,
      );
    expect(line({}, 'en')).not.toMatch(/flank|behind|charge|braced|melee/);
    expect(line({ aspect: 'flank' }, 'en')).toContain('(from the flank)');
    expect(line({ aspect: 'rear' }, 'en')).toContain('(from behind)');
    expect(line({ charge: true }, 'en')).toContain('(charge)');
    expect(line({ braced: true, counter: true }, 'en')).toContain('(braced)');
    expect(line({ melee: true }, 'en')).toContain('melee');
    expect(line({ aspect: 'flank' }, 'zh')).toContain('侧击');
    expect(line({ aspect: 'rear', charge: true }, 'zh')).toContain('背击');
    expect(line({ charge: true }, 'zh')).toContain('冲锋');
  });
});

describe('archers in melee (B-03)', () => {
  const archerField = (distance: number) =>
    field([
      {
        id: 'a',
        side: 'attacker',
        type: 'infantry',
        x: 9 - distance,
        y: 10,
        attackRange: 2,
        troops: 1000,
      },
      { id: 'r', side: 'defender', type: 'archer', x: 9, y: 10, facing: 'w', troops: 1000 },
    ]);

  it('takes x1.3 at distance 1 and x1 at distance 2', () => {
    const near = archerField(1);
    const nearForecast = predictBattleAttack(near, 'a', 'r')!;
    expect(nearForecast.melee).toBe(true);
    const nearHit = strike(near, 'a', 'r');
    expect(Math.abs(nearHit.primary - plainHit(near, 'a', 'r') * 1.3)).toBeLessThanOrEqual(1);
    expect(nearHit.primary).toBe(nearForecast.estimatedCasualties);
    expect(nearHit.counter).toBe(nearForecast.counterattack.estimatedCasualties);
    expect(nearHit.primaryParams.melee).toBe(true);

    const far = archerField(2);
    const farForecast = predictBattleAttack(far, 'a', 'r')!;
    expect(farForecast.melee).toBe(false);
    const farHit = strike(far, 'a', 'r');
    expect(farHit.primary).toBe(plainHit(far, 'a', 'r'));
    expect(farHit.primary).toBe(farForecast.estimatedCasualties);
  });

  it('applies to a counterattack that lands on archers at distance 1', () => {
    const start = field([
      { id: 'r', side: 'attacker', type: 'archer', x: 9, y: 10, facing: 'e', troops: 1000 },
      { id: 'i', side: 'defender', type: 'infantry', x: 10, y: 10, facing: 'w', troops: 1000 },
    ]);
    const forecast = predictBattleAttack(start, 'r', 'i')!;
    const result = strike(start, 'r', 'i');
    expect(result.counter).toBe(forecast.counterattack.estimatedCasualties);
    expect(result.counterParams!.melee).toBe(true);
  });
});
