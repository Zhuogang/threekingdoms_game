import { describe, expect, it } from 'vitest';
import { BATTLE, RECRUITMENT } from '../../src/v03/balance';
import { createTacticalBattle, predictBattleAttack } from '../../src/v03/battle/engine';
import { createBattleMap } from '../../src/v03/battle/maps';
import { movementBudget, terrainMovementCost } from '../../src/v03/battle/rules';
import type { BattleTerrain, BattleTroopType } from '../../src/v03/battle/types';
import { UNITS, type UnitArm } from '../../src/v03/content/units';
import { troopDisplayType } from '../../src/v03/rendering/presentation';

const ARMS: UnitArm[] = ['infantry', 'cavalry', 'archer'];

function plainBattle(attacker: BattleTroopType, defender: BattleTroopType) {
  const base = createBattleMap({ regionId: 'shouchun' });
  const state = createTacticalBattle({
    id: `units-${attacker}-${defender}`,
    map: { ...base, terrain: base.terrain.map((): BattleTerrain => 'plain') },
    attackerUnits: [
      { id: 'a1', name: 'A', troopType: attacker, troops: 100000, force: 80, troopExperience: 0 },
    ],
    defenderUnits: [
      { id: 'd1', name: 'D', troopType: defender, troops: 10000000, force: 80, troopExperience: 0 },
    ],
  });
  state.units[0]!.x = 5;
  state.units[0]!.y = 5;
  state.units[1]!.x = 6;
  state.units[1]!.y = 5;
  return state;
}

describe('unit table', () => {
  it('matches the balance values', () => {
    expect(ARMS.map((arm) => UNITS[arm].move)).toEqual([3, 5, 3]);
    expect(ARMS.map((arm) => UNITS[arm].move)).toEqual([
      BATTLE.movement.budgetInfantry,
      BATTLE.movement.budgetCavalry,
      BATTLE.movement.budgetArcher,
    ]);
    expect(ARMS.map((arm) => UNITS[arm].attackRange)).toEqual([1, 1, 3]);
    expect(UNITS.cavalry.matchup.archer).toBe(BATTLE.damage.cavalryVsArcher);
    expect(UNITS.infantry.matchup.cavalry).toBe(BATTLE.damage.infantryVsCavalry);
    expect(UNITS.archer.matchup.infantry).toBe(BATTLE.damage.archerVsInfantry);
    expect(ARMS.map((arm) => UNITS[arm].meleeIncoming)).toEqual([1, 1, 1.3]);
    expect(ARMS.map((arm) => UNITS[arm].charge)).toEqual([null, 1.3, null]);
    expect(ARMS.map((arm) => UNITS[arm].brace)).toEqual([1.2, null, null]);
    expect(ARMS.map((arm) => UNITS[arm].foodWeight)).toEqual([1, 2, 1]);
    expect(UNITS.cavalry.recruit.multiplier).toEqual({
      north: RECRUITMENT.multiplier.cavalryNorth,
      central: RECRUITMENT.multiplier.cavalryCentral,
      south: RECRUITMENT.multiplier.cavalrySouth,
    });
    expect(UNITS.cavalry.recruit.gold).toEqual({
      north: RECRUITMENT.gold.cavalryNorth,
      central: RECRUITMENT.gold.cavalryCentral,
      south: RECRUITMENT.gold.cavalrySouth,
    });
    expect(UNITS.archer.recruit.gold.south).toBe(RECRUITMENT.gold.archer);
    expect(UNITS.infantry.recruit.multiplier.central).toBe(RECRUITMENT.multiplier.infantry);
    expect(ARMS.map((arm) => UNITS[arm].eliteKey)).toEqual([
      'heavy-infantry',
      'elite-cavalry',
      'strong-archer',
    ]);
    expect(ARMS.every((arm) => UNITS[arm].eliteLevel === 11)).toBe(true);
  });

  it('feeds movement rules', () => {
    for (const arm of ARMS) expect(movementBudget(arm)).toBe(UNITS[arm].move);
    expect(terrainMovementCost('cavalry', 'hill')).toBe(3);
    expect(terrainMovementCost('archer', 'forest')).toBe(2);
    expect(terrainMovementCost('infantry', 'cliff')).toBe(Number.POSITIVE_INFINITY);
  });

  it('applies the matchup table in predictBattleAttack for every arm pair', () => {
    const neutral = predictBattleAttack(
      plainBattle('infantry', 'infantry'),
      'a1',
      'd1',
    )!.estimatedCasualties!;
    expect(neutral).toBeGreaterThan(1000);
    for (const source of ARMS)
      for (const target of ARMS) {
        const forecast = predictBattleAttack(plainBattle(source, target), 'a1', 'd1')!;
        expect(forecast.estimatedCasualties! / neutral).toBeCloseTo(
          UNITS[source].matchup[target],
          2,
        );
      }
  });

  it('maps level 11 to the elite display type', () => {
    const level11 = 1000;
    expect(troopDisplayType('infantry', level11)).toBe('heavy-infantry');
    expect(troopDisplayType('cavalry', level11)).toBe('elite-cavalry');
    expect(troopDisplayType('archer', level11)).toBe('strong-archer');
    expect(troopDisplayType('infantry', 0)).toBe('infantry');
    expect(troopDisplayType('water', level11)).toBe('water');
  });
});
