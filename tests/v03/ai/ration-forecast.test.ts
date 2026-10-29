import { describe, expect, it } from 'vitest';
import { forecastBattleRations } from '../../../src/v03/battle/supply';
import { decisionBattle } from '../helpers/ai-fixtures';

describe('V04-02 actual battle provisions', () => {
  it('values 500 food for 1200 infantry at 48/day, including wounded and the unpaid fraction', () => {
    const battle = decisionBattle();
    const unit = battle.units[0]!;
    Object.assign(unit, { troops: 1000, wounded: 200, troopType: 'infantry' });
    battle.supplies.attacker = 500;
    const before = structuredClone(battle);
    expect(forecastBattleRations(battle, 'attacker')).toMatchObject({
      dailyFood: 48,
      supplyDays: 500 / 48,
      wholeFood: 48,
    });
    expect(forecastBattleRations(battle, 'attacker', 500000).supplyDays).toBe(499.5 / 48);
    expect(battle).toEqual(before);
    unit.troopType = 'cavalry';
    expect(forecastBattleRations(battle, 'attacker').dailyFood).toBe(96);
  });

  it('carries sub-unit demand without rounding every day, and detects fractional starvation', () => {
    const battle = decisionBattle();
    Object.assign(battle.units[0]!, { troops: 1, wounded: 0, troopType: 'infantry' });
    battle.supplies.attacker = 1;
    let remainder = 0;
    for (let day = 0; day < 25; day++) {
      const preview = forecastBattleRations(battle, 'attacker', remainder);
      expect(preview.shortage).toBe(false);
      battle.supplies.attacker -= preview.wholeFood;
      remainder = preview.remainderMicro;
    }
    expect(battle.supplies.attacker).toBe(0);
    expect(remainder).toBe(0);
    expect(forecastBattleRations(battle, 'attacker').shortage).toBe(true);
    battle.units[0]!.troops = 0;
    expect(forecastBattleRations(battle, 'attacker').supplyDays).toBe(Infinity);
  });
});
