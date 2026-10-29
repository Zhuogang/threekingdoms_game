import { describe, expect, it } from 'vitest';
import {
  evaluateBattleActions,
  predictBattleAttack,
  runBattleAiTurn,
} from '../../../src/v03/battle';
import { createAiDecisionTrace, withAiDecisionTrace } from '../../../src/v03/ai/decision-trace';
import { decisionBattle } from '../helpers/ai-fixtures';

describe('V04-04 meaningful tactical alternatives', () => {
  it('takes a safe finishing hit instead of a larger attack with worse retaliation', () => {
    const battle = decisionBattle();
    const [actor, weak, strong] = battle.units;
    Object.assign(actor!, { troopType: 'infantry', attackRange: 1, intellect: 0 });
    Object.assign(weak!, { troops: 100, initialTroops: 100, x: 5, y: 6 });
    Object.assign(strong!, { force: 100, x: 6, y: 5 });
    const trap = predictBattleAttack(battle, 'actor', 'strong')!;
    expect(trap.estimatedCasualties).toBeGreaterThan(100);
    expect(trap.counterattack.estimatedCasualties).toBeGreaterThan(trap.estimatedCasualties!);
    const before = structuredClone(battle);
    const choices = evaluateBattleActions(battle, 'actor');
    expect(choices[0]).toMatchObject({ action: 'attack', targetId: 'weak' });
    expect(battle).toEqual(before);
    const result = runBattleAiTurn(battle, 'attacker');
    expect(result.units.find((entry) => entry.id === 'weak')!.troops).toBe(0);
    expect(result.units.find((entry) => entry.id === 'actor')!.troops).toBe(1000);
    expect(result.units.find((entry) => entry.id === 'strong')!.troops).toBe(3000);
  });

  it('rallies a recoverable formation when recovery beats the available weak shot', () => {
    const battle = decisionBattle();
    const [actor, ally, enemy] = battle.units;
    Object.assign(actor!, { intellect: 90, morale: 100 });
    Object.assign(ally!, {
      side: 'attacker',
      troops: 3000,
      initialTroops: 3000,
      wounded: 1000,
      morale: 10,
      x: 6,
      y: 5,
    });
    Object.assign(enemy!, { troops: 100, initialTroops: 100, x: 5, y: 7 });
    battle.units.push({
      ...structuredClone(enemy!),
      id: 'distant',
      troops: 5000,
      initialTroops: 5000,
      x: 20,
      y: 15,
    });
    battle.tacticPoints.attacker = 2;
    expect(evaluateBattleActions(battle, 'actor')[0]).toMatchObject({
      action: 'rally',
      targetId: 'weak',
    });
    const result = runBattleAiTurn(battle, 'attacker');
    expect(result.units.find((entry) => entry.id === 'weak')!.morale).toBeGreaterThanOrEqual(20);
    expect(result.logEntries!.find((entry) => entry.code === 'log.tactic')?.params.tactic).toBe(
      'rally',
    );
  });

  it('does not waste the last useful tactic points refreshing a healthy Inspired unit', () => {
    const battle = decisionBattle();
    Object.assign(battle.units[0]!, { morale: 100, status: 'inspired' });
    battle.tacticPoints.attacker = 2;
    expect(evaluateBattleActions(battle, 'actor')[0]!.action).toBe('attack');
    expect(runBattleAiTurn(battle, 'attacker').tacticPoints.attacker).toBe(2);
  });

  it('values an effective supply raid against a hungry army using actual healthy/wounded demand', () => {
    const battle = decisionBattle();
    Object.assign(battle.units[0]!, {
      troops: 100,
      initialTroops: 100,
      troopType: 'infantry',
      attackRange: 1,
      intellect: 65,
      morale: 100,
    });
    Object.assign(battle.units[1]!, { x: 20, y: 15 });
    Object.assign(battle.units[2]!, {
      troops: 1200,
      initialTroops: 1200,
      wounded: 300,
      x: 7,
      y: 5,
    });
    battle.tacticPoints.attacker = 10;
    battle.supplies.defender = 500;
    const before = structuredClone(battle);
    expect(evaluateBattleActions(battle, 'actor')[0]).toMatchObject({
      action: 'raidSupply',
      targetId: 'strong',
    });
    expect(battle).toEqual(before);
    const result = runBattleAiTurn(battle, 'attacker');
    expect(result.supplies.defender).toBe(0);
    expect(result.supplies.attacker).toBe(battle.supplies.attacker + 250);
    battle.supplies.defender = 100000;
    expect(evaluateBattleActions(battle, 'actor')[0]!.action).not.toBe('raidSupply');
  });

  it('ends a winnable battle instead of spending the action on optional recovery', () => {
    const battle = decisionBattle();
    battle.units[2]!.side = 'attacker';
    battle.units[2]!.morale = 10;
    battle.tacticPoints.attacker = 10;
    expect(evaluateBattleActions(battle, 'actor')[0]).toMatchObject({
      action: 'attack',
      targetId: 'weak',
    });
    expect(runBattleAiTurn(battle, 'attacker').outcome).toEqual({
      winner: 'attacker',
      reason: 'elimination',
    });
  });

  it('records compared costs and actual selection without altering the random stream', () => {
    const battle = decisionBattle();
    const before = structuredClone(battle);
    const trace = createAiDecisionTrace(1000);
    const result = withAiDecisionTrace(trace, () => runBattleAiTurn(battle, 'attacker'));
    expect(result).toEqual(runBattleAiTurn(battle, 'attacker'));
    expect(battle).toEqual(before);
    const selected = trace.events.find(
      (entry) => entry.kind === 'tactical' && entry.status === 'selected',
    );
    // With reachable threats included, the safe finishing shot now beats
    // entering the stronger infantry's next attack range.
    expect(selected).toMatchObject({
      action: 'attack',
      targetId: 'weak',
      pointCost: 0,
      exposure: 0,
    });
    const fire = trace.events.find((entry) => entry.kind === 'tactical' && entry.action === 'fire');
    expect(fire).toMatchObject({ status: 'candidate' });
    expect(
      trace.events.some(
        (entry) =>
          entry.kind === 'tactical' && entry.status === 'committed' && entry.action === 'attack',
      ),
    ).toBe(true);
  });
});
