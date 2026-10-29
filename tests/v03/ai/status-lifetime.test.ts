import { describe, expect, it } from 'vitest';
import {
  advanceBattleDay,
  applyBattleAction,
  getBattleTacticTargets,
  predictBattleAttack,
  predictBattleTactic,
  runBattleAiTurn,
  type BattleSide,
  type BattleTactic,
  type V03TacticalBattleState,
} from '../../../src/v03/battle';
import { decisionBattle } from '../helpers/ai-fixtures';

function unit(battle: V03TacticalBattleState, id: string) {
  return battle.units.find((entry) => entry.id === id)!;
}
function cast(
  battle: V03TacticalBattleState,
  tactic: BattleTactic,
  source = 'actor',
  target = 'strong',
) {
  const result = applyBattleAction(battle, {
    type: 'tactic',
    tactic,
    unitId: source,
    targetId: target,
  });
  expect(result.ok, result.ok ? '' : result.error).toBe(true);
  return result.state;
}
function mirrored(side: BattleSide) {
  const battle = decisionBattle();
  if (side === 'defender')
    for (const unit of battle.units) unit.side = unit.side === 'attacker' ? 'defender' : 'attacker';
  battle.playerSide = side;
  battle.tacticPoints = { attacker: 10, defender: 10 };
  const caster = unit(battle, 'actor');
  Object.assign(caster, {
    troopType: 'infantry',
    troops: 100,
    initialTroops: 100,
    intellect: 120,
    morale: 100,
  });
  Object.assign(unit(battle, 'strong'), {
    troops: 5000,
    initialTroops: 5000,
    morale: 100,
    x: 8,
    y: 5,
    intellect: 0,
  });
  Object.assign(unit(battle, 'weak'), { x: 20, y: 15, morale: 100 });
  battle.rngState = 2;
  return battle;
}

describe('V04-03 activation and hit lifetimes', () => {
  it.each(['attacker', 'defender'] as const)(
    'Confuse cast after an action persists and skips exactly one AI activation: %s caster',
    (side) => {
      let battle = mirrored(side);
      const targetSide = unit(battle, 'strong').side;
      unit(battle, 'strong').acted = true;
      battle = cast(battle, 'confuse');
      expect(unit(battle, 'strong').status).toBe('confused');
      const before = structuredClone(battle);
      expect(
        runBattleAiTurn(battle, targetSide).units.find((entry) => entry.id === 'strong')!.status,
      ).toBe('confused');
      expect(battle).toEqual(before);
      battle.units.forEach((entry) => (entry.acted = true));
      battle = advanceBattleDay(battle);
      expect(unit(battle, 'strong').status).toBe('confused');
      const location = { x: unit(battle, 'strong').x, y: unit(battle, 'strong').y };
      battle = runBattleAiTurn(battle, targetSide);
      expect(unit(battle, 'strong')).toMatchObject({
        ...location,
        status: 'normal',
        moved: true,
        acted: true,
      });
      const skipped = battle.logEntries!.filter(
        (entry) => entry.code === 'log.confused' && entry.params.unitId === 'strong',
      ).length;
      expect(skipped).toBe(1);
      battle = runBattleAiTurn(battle, targetSide);
      expect(
        battle.logEntries!.filter(
          (entry) => entry.code === 'log.confused' && entry.params.unitId === 'strong',
        ),
      ).toHaveLength(1);
    },
  );

  it.each(['attacker', 'defender'] as const)(
    'the real day flow can confuse the already-finished human side: %s',
    (side) => {
      let battle = mirrored(side === 'attacker' ? 'defender' : 'attacker');
      battle.playerSide = side;
      battle = advanceBattleDay(battle);
      expect(unit(battle, 'strong')).toMatchObject({ status: 'confused', acted: false });
      const rejected = applyBattleAction(battle, { type: 'wait', unitId: 'strong' });
      expect(rejected.ok).toBe(false);
      expect(rejected.state).toEqual(battle);
      unit(battle, 'actor').isMilitia = true;
      battle = advanceBattleDay(battle);
      expect(unit(battle, 'strong').status).toBe('normal');
      expect(
        battle.logEntries!.filter(
          (entry) => entry.code === 'log.confused' && entry.params.unitId === 'strong',
        ),
      ).toHaveLength(1);
    },
  );

  it('consumes a routed move/hold opportunity, never creates an activation for a dead unit', () => {
    let battle = mirrored('attacker');
    Object.assign(unit(battle, 'strong'), { morale: 10, status: 'confused' });
    const location = { x: unit(battle, 'strong').x, y: unit(battle, 'strong').y };
    battle = runBattleAiTurn(battle, 'defender');
    expect(unit(battle, 'strong')).toMatchObject({
      ...location,
      acted: true,
      moved: true,
      status: 'normal',
    });
    const dead = mirrored('attacker');
    Object.assign(unit(dead, 'strong'), { troops: 0, wounded: 10, status: 'confused' });
    const after = runBattleAiTurn(dead, 'defender');
    expect(
      after.logEntries!.some(
        (entry) => entry.code === 'log.confused' && entry.params.unitId === 'strong',
      ),
    ).toBe(false);
  });

  it('repeated Confuse does not stack and Rally clears a pending lost activation', () => {
    let battle = mirrored('attacker');
    battle = cast(battle, 'confuse');
    unit(battle, 'actor').acted = false;
    battle.tacticPoints.attacker = 10;
    battle.rngState = 2;
    battle = cast(battle, 'confuse');
    battle = runBattleAiTurn(battle, 'defender');
    expect(battle.logEntries!.filter((entry) => entry.code === 'log.confused')).toHaveLength(1);
    expect(unit(battle, 'strong').status).toBe('normal');
    battle = mirrored('attacker');
    unit(battle, 'strong').side = 'attacker';
    unit(battle, 'strong').status = 'confused';
    expect(getBattleTacticTargets(battle, 'actor', 'rally').map((entry) => entry.id)).toContain(
      'strong',
    );
    battle = cast(battle, 'rally');
    expect(unit(battle, 'strong')).toMatchObject({ status: 'inspired', acted: false });
  });

  it('an Inspired ordinary hit and counterattack each consume their own bonus and match the preview', () => {
    const battle = decisionBattle();
    const source = unit(battle, 'actor'),
      target = unit(battle, 'strong');
    Object.assign(source, {
      troopType: 'infantry',
      attackRange: 1,
      status: 'inspired',
      troops: 3000,
      initialTroops: 3000,
    });
    Object.assign(target, { x: 6, y: 5, status: 'inspired', morale: 100 });
    const preview = predictBattleAttack(battle, source.id, target.id)!;
    expect(preview.counterattack.possible).toBe(true);
    const before = structuredClone(battle);
    const result = applyBattleAction(battle, {
      type: 'attack',
      unitId: source.id,
      targetId: target.id,
    });
    expect(result.ok).toBe(true);
    expect(battle).toEqual(before);
    expect(unit(result.state, source.id)).toMatchObject({
      status: 'normal',
      troops: 3000 - preview.counterattack.estimatedCasualties!,
    });
    expect(unit(result.state, target.id)).toMatchObject({
      status: 'normal',
      troops: 3000 - preview.estimatedCasualties!,
    });
    const nextHit = predictBattleAttack(result.state, target.id, source.id)!.estimatedCasualties;
    const buffed = structuredClone(result.state);
    unit(buffed, target.id).status = 'inspired';
    expect(predictBattleAttack(buffed, target.id, source.id)!.estimatedCasualties).toBeGreaterThan(
      nextHit!,
    );
  });

  it.each(['fire', 'rockfall', 'ambush'] as const)(
    '%s only uses or consumes Inspired when it is a qualifying hit',
    (tactic) => {
      const battle = decisionBattle();
      Object.assign(unit(battle, 'actor'), { status: 'inspired', intellect: 80 });
      if (tactic === 'ambush') battle.map.terrain[5 * battle.map.width + 5] = 'forest';
      if (tactic === 'rockfall') battle.map.terrain[5 * battle.map.width + 5] = 'hill';
      const normal = structuredClone(battle);
      unit(normal, 'actor').status = 'normal';
      const preview = predictBattleTactic(battle, 'actor', tactic, 'strong')!;
      const plain = predictBattleTactic(normal, 'actor', tactic, 'strong')!;
      if (tactic === 'ambush') expect(preview.minCasualties).toBeGreaterThan(plain.minCasualties);
      else expect(preview).toEqual(plain);
      const result = cast(battle, tactic);
      expect(unit(result, 'actor').status).toBe(tactic === 'ambush' ? 'normal' : 'inspired');
      const damage = 3000 - unit(result, 'strong').troops;
      expect(damage).toBeGreaterThanOrEqual(preview.minCasualties);
      expect(damage).toBeLessThanOrEqual(preview.maxCasualties);
    },
  );

  it('Rally lasts through an unused day and repeated Rally never stacks hit multipliers', () => {
    let battle = decisionBattle();
    unit(battle, 'strong').side = 'attacker';
    unit(battle, 'strong').morale = 100;
    Object.assign(unit(battle, 'weak'), { x: 6, y: 7, troops: 3000, initialTroops: 3000 });
    battle = cast(battle, 'rally');
    const preview = predictBattleAttack(battle, 'strong', 'weak');
    expect(preview?.estimatedCasualties).toBeGreaterThan(0);
    unit(battle, 'actor').acted = false;
    battle.tacticPoints.attacker = 10;
    battle = cast(battle, 'rally');
    expect(predictBattleAttack(battle, 'strong', 'weak')).toEqual(preview);
    battle.units.forEach((entry) => (entry.acted = true));
    battle = advanceBattleDay(battle);
    expect(unit(battle, 'strong').status).toBe('inspired');
  });
});
