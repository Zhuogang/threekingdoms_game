import { describe, expect, it } from 'vitest';
import {
  BATTLE_MORALE_RECOVERY_CAP,
  RAID_BATTLE_DAYS,
  advanceBattleDay,
  applyBattleAction,
  battleTemperament,
  campaignBattleDays,
  canvasBattlefieldIds,
  createCanvasBattleMap,
  deploymentColumns,
  evaluateBattleActions,
  evaluateBattleTurn,
  getUnitReachableTiles,
  manhattanDistance,
  predictBattleAttack,
  predictBattleTactic,
  runBattleAiTurn,
  type V03TacticalBattleState,
} from '../../src/v03/battle';
import { executeV03Command } from '../../src/v03/commands';
import { playtestFixture } from '../../src/v03/dev/fixtures';
import { formatBattleLog } from '../../src/v03/i18n/formatters';
import { localizedEvent } from '../../src/v03/ui/shared/legacy-events';
import { decodeV03Save, encodeV03Save } from '../../src/v03/platform/storage';
import {
  appendedBattleEntries,
  planBattlePlayback,
} from '../../src/v03/ui/hooks/useBattlePlayback';
import { decisionBattle } from './helpers/ai-fixtures';

const unit = (battle: V03TacticalBattleState, id: string) =>
  battle.units.find((entry) => entry.id === id)!;

describe('play-feel phase 2: battles that move', () => {
  describe('PF-RL-10 closer deployment and longer raids', () => {
    it('deploys the fronts about 15 columns apart on every canvas battlefield', () => {
      for (const id of canvasBattlefieldIds()) {
        const map = createCanvasBattleMap(id, { seed: 1 });
        const front = Math.min(...map.defenderDeployment.slice(0, 10).map((cell) => cell.x));
        const rear = Math.max(...map.attackerDeployment.slice(0, 10).map((cell) => cell.x));
        // 15 apart, up to 17 where a channel (wetlands) or cliff (Yangtze crossing) intervenes.
        expect(front - rear, id).toBeLessThanOrEqual(17);
        expect(front - rear, id).toBeGreaterThanOrEqual(15);
        expect(deploymentColumns(id).defender).toEqual([31, 34]);
      }
    });

    it('gives raids 14 battle days and provisions them for 14', () => {
      expect(RAID_BATTLE_DAYS).toBe(14);
      expect(campaignBattleDays('raid')).toBe(14);
      expect(campaignBattleDays('conquer')).toBe(30);
      expect(campaignBattleDays(undefined)).toBe(30);
    });
  });

  describe('PF-RL-11 morale that breathes', () => {
    function quietBattle() {
      const battle = decisionBattle();
      // Both enemies lose their next activation, so only the player's shot lands today.
      Object.assign(unit(battle, 'weak'), {
        troops: 600,
        initialTroops: 600,
        morale: 50,
        status: 'confused',
      });
      Object.assign(unit(battle, 'strong'), { x: 20, y: 15, morale: 50, status: 'confused' });
      unit(battle, 'actor').morale = 50;
      return battle;
    }

    it('restores 5 morale to fed formations that lost no troops, never past 80', () => {
      const battle = quietBattle();
      const shot = applyBattleAction(battle, { type: 'attack', unitId: 'actor', targetId: 'weak' });
      expect(shot.ok).toBe(true);
      const struckMorale = unit(shot.state, 'weak').morale;
      const next = advanceBattleDay(shot.state);

      expect(unit(next, 'actor').morale).toBe(55);
      expect(unit(next, 'strong').morale).toBe(55);
      // The formation that was hit today does not recover.
      expect(unit(next, 'weak').morale).toBe(struckMorale);
      expect(next.logEntries!.filter((entry) => entry.code === 'log.recover')).toEqual([
        expect.objectContaining({
          params: expect.objectContaining({ side: 'attacker', count: 1 }),
        }),
        expect.objectContaining({
          params: expect.objectContaining({ side: 'defender', count: 1 }),
        }),
      ]);

      const high = quietBattle();
      unit(high, 'actor').morale = 78;
      unit(high, 'strong').morale = 95;
      const capped = advanceBattleDay(high);
      expect(unit(capped, 'actor').morale).toBe(BATTLE_MORALE_RECOVERY_CAP);
      // Rally can still lift a formation above 80; recovery never lowers it.
      expect(unit(capped, 'strong').morale).toBe(95);
    });

    it('does not restore morale to a side that cannot pay today’s rations', () => {
      const battle = quietBattle();
      battle.supplies.attacker = 0;
      const next = advanceBattleDay(battle);
      expect(unit(next, 'actor').morale).toBe(50);
      expect(unit(next, 'strong').morale).toBe(55);
    });
  });

  describe('PF-RL-12 every tactic has a niche', () => {
    it('makes Fire outdamage an ordinary hit on a forest target, with no counterattack', () => {
      const battle = decisionBattle();
      const actor = unit(battle, 'actor');
      Object.assign(actor, { troopType: 'infantry', attackRange: 1, force: 70, intellect: 80 });
      Object.assign(unit(battle, 'strong'), { x: 5, y: 6, intellect: 50 });
      battle.map.terrain[6 * battle.map.width + 5] = 'forest';
      const attack = predictBattleAttack(battle, 'actor', 'strong')!;
      const fire = predictBattleTactic(battle, 'actor', 'fire', 'strong')!;
      expect(fire.minCasualties).toBeGreaterThan(attack.estimatedCasualties!);
    });

    it('makes Fire in Wind outdamage an ordinary hit for a much cleverer caster', () => {
      const battle = decisionBattle();
      Object.assign(unit(battle, 'actor'), {
        troopType: 'infantry',
        attackRange: 1,
        force: 70,
        intellect: 100,
      });
      Object.assign(unit(battle, 'strong'), { x: 5, y: 6, intellect: 40 });
      battle.weather = 'wind';
      const attack = predictBattleAttack(battle, 'actor', 'strong')!;
      const fire = predictBattleTactic(battle, 'actor', 'fire', 'strong')!;
      expect(fire.minCasualties).toBeGreaterThan(attack.estimatedCasualties!);
    });
  });

  describe('PF-RL-13 routed formations can leave contact', () => {
    it('allows a routed formation in contact one step, but pins an ordinary one', () => {
      const battle = decisionBattle();
      Object.assign(unit(battle, 'actor'), { troopType: 'infantry', attackRange: 1 });
      Object.assign(unit(battle, 'strong'), { x: 6, y: 5 });
      expect(getUnitReachableTiles(battle, 'actor')).toEqual([]);

      unit(battle, 'actor').morale = 15;
      const steps = getUnitReachableTiles(battle, 'actor');
      expect(steps.length).toBeGreaterThan(0);
      expect(steps.every((tile) => manhattanDistance(tile, unit(battle, 'actor')) === 1)).toBe(
        true,
      );
      expect(steps.some((tile) => tile.x === 6 && tile.y === 5)).toBe(false);
      expect(applyBattleAction(battle, { type: 'move', unitId: 'actor', x: 4, y: 5 }).ok).toBe(
        true,
      );
    });
  });

  describe('PF-BA-01 commanders with temperament', () => {
    it('rates Lü Bu aggressive and Zhuge Liang cautious, deterministically', () => {
      expect(battleTemperament({ force: 100, intellect: 26, fierce: true })).toBe(1);
      expect(battleTemperament({ force: 38, intellect: 100 })).toBe(-1);
      expect(Math.abs(battleTemperament({ force: 70, intellect: 65 }))).toBeLessThan(0.1);
    });

    function approach(leader: { force: number; intellect: number; fierce?: boolean }) {
      const battle = decisionBattle();
      Object.assign(unit(battle, 'actor'), {
        ...leader,
        troopType: 'infantry',
        attackRange: 1,
        x: 3,
        y: 10,
        troops: 1500,
        initialTroops: 1500,
      });
      Object.assign(unit(battle, 'weak'), {
        troopType: 'archer',
        attackRange: 3,
        troops: 1500,
        initialTroops: 1500,
        x: 12,
        y: 10,
      });
      Object.assign(unit(battle, 'strong'), { troops: 1500, initialTroops: 1500, x: 13, y: 12 });
      battle.tacticPoints.attacker = 0;
      const choice = evaluateBattleTurn(battle, 'actor')[0]!;
      return Math.min(
        manhattanDistance(choice, unit(battle, 'weak')),
        manhattanDistance(choice, unit(battle, 'strong')),
      );
    }

    it('lets an aggressive leader close in where a cautious one keeps its distance', () => {
      const aggressive = approach({ force: 100, intellect: 26, fierce: true });
      const cautious = approach({ force: 38, intellect: 100 });
      expect(aggressive).toBeLessThan(cautious);
    });

    it('makes clever and cunning leaders readier to spend tactic points', () => {
      const battle = decisionBattle();
      battle.tacticPoints.attacker = 12;
      const fireCost = (intellect: number, cunning: boolean) => {
        const copy = structuredClone(battle);
        Object.assign(unit(copy, 'actor'), { intellect, cunning });
        return evaluateBattleActions(copy, 'actor').find((choice) => choice.action === 'fire')!
          .pointCost;
      };
      expect(fireCost(100, true)).toBeLessThan(fireCost(100, false));
      expect(fireCost(100, false)).toBeLessThan(fireCost(65, false));
    });
  });

  describe('PF-BA-02 and PF-BA-04 pacing of the AI', () => {
    it('presses a side behind on the timeout count from the last 30% of the day limit', () => {
      const battle = decisionBattle();
      // The defender has more troops, so the attacker loses a timeout.
      const score = (day: number) => {
        const copy = structuredClone(battle);
        copy.day = day;
        return evaluateBattleTurn(copy, 'actor').find(
          (choice) =>
            choice.action === 'attack' && choice.targetId === 'strong' && !choice.moveCost,
        )!.score;
      };
      // 30-day limit: day 21 leaves 10 days, day 22 leaves 9 (≤ 30%).
      expect(score(22)).toBeGreaterThan(score(21));
      expect(score(21)).toBe(score(5));
    });

    it('counts only the two strongest likely attackers in a formation’s exposure', () => {
      const battle = decisionBattle();
      // Three archer formations two cells away, beyond the infantry's counterattack.
      Object.assign(unit(battle, 'actor'), { troopType: 'infantry', attackRange: 1, troops: 5000 });
      const archers = { troopType: 'archer', attackRange: 3, troops: 1500, initialTroops: 1500 };
      Object.assign(unit(battle, 'weak'), { ...archers, x: 7, y: 5 });
      Object.assign(unit(battle, 'strong'), { ...archers, x: 5, y: 7, troops: 1200 });
      battle.units.push({ ...structuredClone(unit(battle, 'weak')), id: 'third', x: 3, y: 5 });
      battle.tacticPoints.attacker = 0;
      const hold = evaluateBattleTurn(battle, 'actor').find((choice) => choice.action === 'hold')!;
      const hits = ['weak', 'strong', 'third'].map(
        (id) => predictBattleAttack(battle, id, 'actor')!.estimatedCasualties!,
      );
      const strongestTwo = hits.sort((a, b) => b - a)[0]! + hits[1]!;
      expect(hits[2]).toBeGreaterThan(0);
      expect(hold.exposure).toBe(strongestTwo);
    });
  });

  describe('PF-BA-03 the AI uses the whole kit', () => {
    it('ambushes from a forest when it beats the ordinary attack', () => {
      const battle = decisionBattle();
      Object.assign(unit(battle, 'actor'), {
        troopType: 'infantry',
        attackRange: 1,
        intellect: 70,
      });
      Object.assign(unit(battle, 'strong'), { x: 5, y: 6, troops: 1500, initialTroops: 1500 });
      Object.assign(unit(battle, 'weak'), { x: 20, y: 15 });
      battle.map.terrain[5 * battle.map.width + 5] = 'forest';
      battle.tacticPoints.attacker = 12;
      expect(evaluateBattleActions(battle, 'actor')[0]).toMatchObject({
        action: 'ambush',
        targetId: 'strong',
      });
    });

    it('drops rocks from a hill in rain, when Fire would fizzle', () => {
      const battle = decisionBattle();
      Object.assign(unit(battle, 'actor'), {
        troopType: 'infantry',
        attackRange: 1,
        intellect: 80,
      });
      Object.assign(unit(battle, 'strong'), { x: 5, y: 7, troops: 1500, initialTroops: 1500 });
      Object.assign(unit(battle, 'weak'), { x: 20, y: 15 });
      battle.map.terrain[5 * battle.map.width + 5] = 'hill';
      battle.weather = 'rain';
      battle.tacticPoints.attacker = 12;
      expect(evaluateBattleActions(battle, 'actor')[0]).toMatchObject({
        action: 'rockfall',
        targetId: 'strong',
      });
    });

    it('burns a forest target rather than trading blows', () => {
      const battle = decisionBattle();
      Object.assign(unit(battle, 'actor'), {
        troopType: 'infantry',
        attackRange: 1,
        force: 70,
        intellect: 80,
      });
      Object.assign(unit(battle, 'strong'), { x: 5, y: 6, troops: 1500, initialTroops: 1500 });
      Object.assign(unit(battle, 'weak'), { x: 20, y: 15 });
      battle.map.terrain[6 * battle.map.width + 5] = 'forest';
      battle.tacticPoints.attacker = 12;
      expect(evaluateBattleActions(battle, 'actor')[0]).toMatchObject({
        action: 'fire',
        targetId: 'strong',
      });
    });

    it('raids supplies when the enemy will run out of food before the battle ends', () => {
      const battle = decisionBattle();
      Object.assign(unit(battle, 'actor'), { troopType: 'cavalry', attackRange: 1, intellect: 40 });
      Object.assign(unit(battle, 'strong'), { x: 5, y: 7, troops: 3000, initialTroops: 3000 });
      Object.assign(unit(battle, 'weak'), { x: 20, y: 15 });
      // A few days of food against more than ten days still to fight.
      battle.supplies.defender = 400;
      battle.tacticPoints.attacker = 12;
      expect(evaluateBattleActions(battle, 'actor')[0]).toMatchObject({
        action: 'raidSupply',
        targetId: 'strong',
      });
    });
  });

  describe('PF-BA-05 readable intent', () => {
    it('logs the enemy’s posture only when it changes, from the player’s side', () => {
      let state = playtestFixture('battle');
      const battleId = state.battles[0]!.id;
      for (let day = 0; day < 6 && state.battles.find((b) => b.id === battleId)?.active; day++) {
        state.events.forEach((event) => (event.acknowledged = true));
        const result = executeV03Command(state, { type: 'completeBattleDay', battleId });
        expect(result.ok, result.error).toBe(true);
        state = result.state;
      }
      const battle = state.battles.find((entry) => entry.id === battleId)!;
      const data = battle.battleData;
      const enemy = data.playerSide === 'attacker' ? 'defender' : 'attacker';
      const postures = data.logEntries!.filter((entry) => entry.code === 'log.posture');
      expect(postures.length).toBeGreaterThan(0);
      expect(postures.every((entry) => entry.params.side === enemy)).toBe(true);
      for (let index = 1; index < postures.length; index++)
        expect(postures[index]!.params.posture).not.toBe(postures[index - 1]!.params.posture);
      expect(formatBattleLog(postures[0]!, data, state, 'en')).toMatch(/^The enemy /);
      expect(formatBattleLog(postures[0]!, data, state, 'zh')).toMatch(/^敌军/);
    });
  });

  describe('PF-UI-07 and PF-UI-08 battle readability', () => {
    it('forecasts the target’s morale and whether the hit destroys or routs it', () => {
      const battle = decisionBattle();
      const finishing = predictBattleAttack(battle, 'actor', 'weak')!;
      expect(finishing.targetResult).toBe('destroyed');
      Object.assign(unit(battle, 'strong'), { x: 7, y: 5, troops: 600, morale: 25 });
      unit(battle, 'weak').x = 20;
      const breaking = predictBattleAttack(battle, 'actor', 'strong')!;
      expect(breaking.targetMoraleAfter).toBeLessThan(20);
      expect(breaking.targetResult).toBe('routs');
      const shot = applyBattleAction(battle, {
        type: 'attack',
        unitId: 'actor',
        targetId: 'strong',
      });
      expect(unit(shot.state, 'strong').morale).toBe(breaking.targetMoraleAfter);
    });

    it('tags counterattacks and reads coordinates 1-based in the log', () => {
      let state = playtestFixture('battle');
      const battleId = state.battles[0]!.id;
      const data = state.battles[0]!.battleData;
      const [attacker, defender] = [
        data.units.find((entry) => entry.side === data.playerSide && entry.troopType !== 'archer')!,
        data.units.find((entry) => entry.side !== data.playerSide && entry.troopType !== 'archer')!,
      ];
      Object.assign(defender, { x: attacker.x + 1, y: attacker.y });
      const struck = executeV03Command(state, {
        type: 'battleAction',
        battleId,
        action: { type: 'attack', unitId: attacker.id, targetId: defender.id },
      });
      expect(struck.ok, struck.error).toBe(true);
      state = struck.state;
      const log = state.battles[0]!.battleData;
      const counter = log.logEntries!.find((entry) => entry.params.counter === true)!;
      expect(formatBattleLog(counter, log, state, 'en')).toMatch(/counterattacks/);
      expect(formatBattleLog(counter, log, state, 'zh')).toMatch(/反击/);
      const move = {
        day: 1,
        index: 0,
        code: 'log.move',
        params: { unitId: attacker.id, x: 0, y: 4 },
      };
      expect(formatBattleLog(move, log, state, 'en')).toMatch(/\(1, 5\)/);
    });

    it('plans an enemy-turn replay from the log, frame by frame, with a summary', () => {
      let state = playtestFixture('battle');
      const battleId = state.battles[0]!.id;
      let plan: ReturnType<typeof planBattlePlayback> = null;
      for (let day = 0; day < 8 && !plan?.summary.attacks; day++) {
        state.events.forEach((event) => (event.acknowledged = true));
        const before = state.battles.find((entry) => entry.id === battleId)!.battleData;
        const result = executeV03Command(state, { type: 'completeBattleDay', battleId });
        expect(result.ok, result.error).toBe(true);
        state = result.state;
        const after = state.battles.find((entry) => entry.id === battleId)!;
        if (!after.active) break;
        plan = planBattlePlayback(before, after.battleData);
      }
      expect(plan).not.toBeNull();
      expect(plan!.frames.length).toBeGreaterThan(1);
      expect(plan!.summary.attacks).toBeGreaterThan(0);
      const after = state.battles.find((entry) => entry.id === battleId)!.battleData;
      // The final frame matches the committed board for every surviving formation.
      const last = plan!.frames.at(-1)!;
      for (const formation of after.units.filter((entry) => entry.troops > 0))
        expect(last.positions.get(formation.id)).toEqual({ x: formation.x, y: formation.y });
      expect(plan!.frames.some((frame) => frame.floats.length > 0)).toBe(true);
    });

    it('finds appended log lines even after the log was trimmed', () => {
      const battle = decisionBattle();
      battle.log = Array.from({ length: 250 }, (_, index) => `line ${index}`);
      battle.logEntries = battle.log.map((_, index) => ({
        day: 1,
        index,
        code: 'log.wait',
        params: { unitId: 'actor' },
      }));
      const after = structuredClone(battle);
      after.log = [...battle.log.slice(5), ...Array.from({ length: 5 }, (_, i) => `new ${i}`)];
      after.logEntries = after.log.map((_, index) => ({
        day: 2,
        index,
        code: index >= 245 ? 'log.move' : 'log.wait',
        params: { unitId: 'actor' },
      }));
      expect(appendedBattleEntries(battle, after).map((entry) => entry.index)).toEqual([
        245, 246, 247, 248, 249,
      ]);
    });
  });

  describe('PF-BA-06 auto-command asks before withdrawing', () => {
    it('hands a losing battle back with a report instead of withdrawing the army', () => {
      const state = playtestFixture('battle');
      const battle = state.battles[0]!;
      battle.autoCommand = true;
      const side = battle.battleData.playerSide;
      for (const formation of battle.battleData.units)
        if (formation.side === side)
          formation.troops = Math.max(1, Math.floor(formation.troops / 20));
      const result = executeV03Command(state, { type: 'advance', days: 1 });
      expect(result.ok, result.error).toBe(true);

      const after = result.state.battles.find((entry) => entry.id === battle.id)!;
      expect(after.active).toBe(true);
      expect(after.battleData.outcome).toBeNull();
      expect(after.autoCommand).toBe(false);
      expect(after.playerDayComplete).toBe(false);
      const report = result.state.events.find((event) => event.code === 'battle.withdrawalAsked')!;
      expect(report.entityId).toBe(battle.id);
      expect(localizedEvent(report, result.state, 'en').title).toMatch(/ask to withdraw/);
      expect(localizedEvent(report, result.state, 'zh').title).toMatch(/请求撤退/);
      // The open day survives a save, and the player can still withdraw by hand.
      expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
      const acknowledged = structuredClone(result.state);
      acknowledged.events.forEach((event) => (event.acknowledged = true));
      const withdrawn = executeV03Command(acknowledged, {
        type: 'battleAction',
        battleId: battle.id,
        action: { type: 'retreat', side },
      });
      expect(withdrawn.ok, withdrawn.error).toBe(true);
    });

    it('still lets AI-only battles withdraw on their own', () => {
      const battle = playtestFixture('battle').battles[0]!.battleData;
      const side = battle.playerSide === 'attacker' ? 'defender' : 'attacker';
      const weakened = structuredClone(battle);
      for (const formation of weakened.units) if (formation.side === side) formation.troops = 1;
      weakened.retreatAllowed = { attacker: true, defender: true };
      expect(runBattleAiTurn(weakened, side).outcome?.reason).toBe('retreat');
    });
  });
});
