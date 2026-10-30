import { describe, expect, it } from 'vitest';
import {
  applyBattleAction,
  evaluateBattleTurn,
  getUnitReachableTiles,
  manhattanDistance,
  predictBattleAttack,
  runBattleAiTurn,
  type BattleAction,
} from '../../../src/v03/battle';
import { createAiDecisionTrace, withAiDecisionTrace } from '../../../src/v03/ai/decision-trace';
import { decisionBattle } from '../helpers/ai-fixtures';

describe('V04-05 movement and coordination', () => {
  it.each(['attacker', 'defender'] as const)(
    'compares a better move-and-shot for the %s even while a weak target is already in range',
    (side) => {
      const battle = decisionBattle();
      if (side === 'defender')
        for (const unit of battle.units)
          unit.side = unit.side === 'attacker' ? 'defender' : 'attacker';
      Object.assign(
        battle.units.find((unit) => unit.id === 'strong')!,
        { x: 5, y: 10, morale: 10 },
      );
      battle.tacticPoints[side] = 0;
      const available = predictBattleAttack(battle, 'actor', 'weak')!;
      expect(available.inRange).toBe(true);
      expect(predictBattleAttack(battle, 'actor', 'strong')!.inRange).toBe(false);
      const result = runBattleAiTurn(battle, side);
      expect(result.units.find((unit) => unit.id === 'strong')!.troops).toBeLessThan(3000);
      expect(result.units.find((unit) => unit.id === 'weak')!.troops).toBe(20);
    },
  );

  it('does not advance a routed formation toward enemy attack positions without a rescue benefit', () => {
    const battle = decisionBattle();
    const actor = battle.units.find((unit) => unit.id === 'actor')!;
    const enemy = battle.units.find((unit) => unit.id === 'strong')!;
    Object.assign(actor, { morale: 10, wounded: 1000 });
    Object.assign(
      battle.units.find((unit) => unit.id === 'weak')!,
      {
        side: 'attacker',
        troops: 1000,
        initialTroops: 1000,
        x: 1,
        y: 1,
        acted: true,
        intellect: 0,
        force: 0,
      },
    );
    Object.assign(enemy, { x: 5, y: 10 });
    battle.tacticPoints.attacker = 0;
    const result = runBattleAiTurn(battle, 'attacker');
    const after = result.units.find((unit) => unit.id === 'actor')!;
    expect(manhattanDistance(after, enemy)).toBeGreaterThanOrEqual(manhattanDistance(actor, enemy));
    expect(after.acted).toBe(true);
  });
});

describe('bounded formation choices', () => {
  it('uses the cheaper finisher before spending the stronger archer on another target', () => {
    const battle = decisionBattle();
    const [actor, weak, strong] = battle.units;
    Object.assign(actor!, { moved: true });
    Object.assign(weak!, { troops: 300, initialTroops: 300, status: 'confused' });
    Object.assign(strong!, { troops: 1000, initialTroops: 1000, status: 'confused' });
    battle.map.terrain[strong!.y * battle.map.width + strong!.x] = 'forest';
    battle.units.push({ ...actor!, id: 'cheap', troops: 900, initialTroops: 900, x: 8, y: 4 });
    battle.tacticPoints.attacker = 0;
    const trace = createAiDecisionTrace(1000);
    const result = withAiDecisionTrace(trace, () => runBattleAiTurn(battle, 'attacker'));
    const attacks = trace.events.filter(
      (event) =>
        event.kind === 'tactical' && event.status === 'committed' && event.action === 'attack',
    );
    expect(attacks).toMatchObject([
      { unitId: 'cheap', targetId: 'weak' },
      { unitId: 'actor', targetId: 'strong' },
    ]);
    expect(result.units.find((unit) => unit.id === 'weak')!.troops).toBe(0);
    expect(result.units.find((unit) => unit.id === 'strong')!.troops).toBeLessThan(700);
  });

  it('reopens a narrow passage after a kill and replays each activation as a legal player command', () => {
    const battle = decisionBattle();
    const [actor, weak, strong] = battle.units;
    battle.map.terrain.fill('cliff');
    for (let x = 1; x <= 12; x++) battle.map.terrain[5 * battle.map.width + x] = 'plain';
    battle.map.terrain[4 * battle.map.width + 4] = 'plain';
    Object.assign(actor!, { id: 'cheap', troops: 800, initialTroops: 800, x: 4, y: 4 });
    Object.assign(weak!, { x: 5, y: 5 });
    Object.assign(strong!, { x: 9, y: 5, troops: 1000, initialTroops: 1000, status: 'confused' });
    battle.units.push({
      ...actor!,
      id: 'rear',
      troopType: 'cavalry',
      attackRange: 1,
      troops: 2500,
      initialTroops: 2500,
      x: 4,
      y: 5,
    });
    battle.tacticPoints.attacker = 0;
    expect(getUnitReachableTiles(battle, 'rear')).toEqual([]);
    const trace = createAiDecisionTrace(1000);
    const result = withAiDecisionTrace(trace, () => runBattleAiTurn(battle, 'attacker'));
    expect(result.units.find((unit) => unit.id === 'weak')!.troops).toBe(0);
    expect(result.units.find((unit) => unit.id === 'rear')!.x).toBeGreaterThan(5);
    expect(result.units.find((unit) => unit.id === 'strong')!.troops).toBeLessThan(1000);
    let replay = battle;
    const spent = new Set<string>();
    for (const event of trace.events) {
      if (event.kind !== 'tactical') continue;
      if (event.status === 'selected') {
        const fresh = evaluateBattleTurn(replay, event.unitId!)[0]!;
        expect(event).toMatchObject(fresh);
      }
      if (event.status !== 'committed') continue;
      const unitId = event.unitId!;
      expect(spent.has(unitId)).toBe(false);
      let action: BattleAction;
      if (event.action === 'move') action = { type: 'move', unitId, x: event.x!, y: event.y! };
      else if (event.action === 'attack')
        action = { type: 'attack', unitId, targetId: event.targetId! };
      else if (event.action === 'hold') action = { type: 'wait', unitId };
      else throw new Error(`Unexpected action ${event.action}`);
      const committed = applyBattleAction(replay, action);
      expect(committed.ok).toBe(true);
      replay = committed.state;
      if (action.type !== 'move') spent.add(unitId);
    }
    expect(replay).toEqual(result);
  });

  it('accounts for an enemy reaching the cell vacated by the moving archer', () => {
    const battle = decisionBattle();
    battle.tacticPoints.attacker = 0;
    const moveAndShots = evaluateBattleTurn(battle, 'actor').filter(
      (choice) => choice.moveCost > 0 && choice.action === 'attack' && choice.targetId === 'strong',
    );
    expect(moveAndShots.length).toBeGreaterThan(0);
    // Every retained shot stays within the infantry's next reachable attack.
    expect(moveAndShots.every((choice) => choice.exposure > 0)).toBe(true);
  });

  it('moves a routed wounded unit toward a legal Rally instead of the enemy', () => {
    const battle = decisionBattle();
    Object.assign(battle.units[0]!, { morale: 10, wounded: 1000 });
    Object.assign(battle.units[1]!, {
      side: 'attacker',
      x: 10,
      y: 5,
      troops: 1000,
      initialTroops: 1000,
      intellect: 90,
    });
    Object.assign(battle.units[2]!, { x: 1, y: 5 });
    battle.tacticPoints.attacker = 3;
    const choice = evaluateBattleTurn(battle, 'actor')[0]!;
    expect(choice.action).toBe('hold');
    expect(choice.x).toBeGreaterThan(5);
    expect(manhattanDistance(choice, battle.units[1]!)).toBeLessThanOrEqual(3);
  });

  it('avoids a pointless final-day march when the existing timeout policy awards the field', () => {
    const battle = decisionBattle();
    for (const unit of battle.units) unit.side = unit.side === 'attacker' ? 'defender' : 'attacker';
    Object.assign(battle.units[1]!, { x: 20, y: 15 });
    Object.assign(battle.units[2]!, { x: 22, y: 15 });
    battle.day = battle.dayLimit;
    battle.timeoutPolicy = 'defender-holds';
    battle.tacticPoints.defender = 0;
    expect(evaluateBattleTurn(battle, 'actor')[0]).toMatchObject({
      action: 'hold',
      x: 5,
      y: 5,
      moveCost: 0,
      progressValue: 0,
    });
  });
});

describe('baseline withdrawal comparison', () => {
  it.each([true, false])(
    'preserves the retreat threshold and return-route permission (%s)',
    (allowed) => {
      const battle = decisionBattle();
      Object.assign(battle.units[0]!, { troops: 100, wounded: 50 });
      battle.engaged = true;
      battle.retreatAllowed.attacker = allowed;
      const trace = createAiDecisionTrace(1000);
      const result = withAiDecisionTrace(trace, () => runBattleAiTurn(battle, 'attacker'));
      const withdrawal = trace.events.find(
        (event) =>
          event.kind === 'tactical' && event.action === 'retreat' && event.status !== 'committed',
      );
      expect(withdrawal).toMatchObject({
        reason: 'opening-force-retreat',
        retreatAllowed: allowed,
        retreatRiskPercent: allowed ? 5 : 100,
      });
      if (allowed) {
        expect(result.outcome).toEqual({ winner: 'defender', reason: 'retreat' });
        const holding = trace.events.find(
          (event) =>
            event.kind === 'tactical' &&
            event.action === 'hold' &&
            event.reason === 'opening-force-retreat',
        );
        expect((withdrawal as { score: number }).score).toBeGreaterThan(
          (holding as { score: number }).score,
        );
      } else {
        expect(result.outcome?.reason).not.toBe('retreat');
      }
    },
  );
});
