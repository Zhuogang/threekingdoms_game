import { describe, expect, it } from 'vitest';
import { army, find, logged } from './armyHelpers';
import {
  aiAssignOrders,
  applyBattleAction,
  baggageRosterEntry,
  createCanvasBattleMap,
  createTacticalBattle,
  evaluateBattleActions,
  getBattleTimeoutOutcome,
  getUnitAttackTargets,
  predictBattleAttack,
  runBattleAiTurn,
} from '../../../src/v03/battle';
import { createV03Game } from '../../../src/v03/initial-state';
import { executeV03Command } from '../../../src/v03/commands';
import { applyV03BattleAction } from '../../../src/v03/engine';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';

/** Defender cavalry (the player) beside an attacker baggage train; `screen` puts a friend next to it. */
const raidField = (screen: boolean, extra: { baggageTroops?: number } = {}) =>
  army(
    [
      { id: 'a-line', side: 'attacker', x: screen ? 5 : 12, y: screen ? 11 : 16 },
      { id: 'a-bag', side: 'attacker', role: 'baggage', x: 5, y: 10, troops: extra.baggageTroops },
      { id: 'd-cav', side: 'defender', type: 'cavalry', x: 4, y: 10 },
      { id: 'd-line', side: 'defender', x: 30, y: 10 },
    ],
    { playerSide: 'defender' },
  );

describe('baggage train (B-04)', () => {
  it('is sized at 5% of the line troops, at least 100', () => {
    expect(baggageRosterEntry('b', 8000)).toMatchObject({
      role: 'baggage',
      troops: 400,
      force: 30,
      intellect: 30,
      leadership: 30,
      attackRange: 0,
    });
    expect(baggageRosterEntry('b', 1000).troops).toBe(100);
  });

  it('stands in the rear column of the attacker band, middle row, without displacing a formation', () => {
    const map = createCanvasBattleMap('bf01-north-plain', { seed: 3 });
    const battle = createTacticalBattle({
      id: 'deploy',
      map,
      attackerUnits: [
        ...Array.from({ length: 8 }, (_, index) => ({
          id: `a${index}`,
          name: `a${index}`,
          troopType: 'infantry' as const,
          troops: 1000,
          force: 60,
        })),
        baggageRosterEntry('a-bag', 8000),
      ],
      defenderUnits: [{ id: 'd0', name: 'd0', troopType: 'infantry', troops: 1000, force: 60 }],
    });
    const bag = find(battle, 'a-bag');
    const rearX = Math.min(...map.attackerDeployment.map((cell) => cell.x));
    expect(bag.x).toBe(rearX);
    const rows = map.attackerDeployment.map((cell) => cell.y);
    const middle = (Math.min(...rows) + Math.max(...rows)) / 2;
    expect(Math.abs(bag.y - middle)).toBeLessThanOrEqual(1);
    expect(bag).toMatchObject({ role: 'baggage', attackRange: 0 });
    expect(new Set(battle.units.map((unit) => `${unit.x},${unit.y}`)).size).toBe(
      battle.units.length,
    );
  });

  it('never attacks and never counterattacks; it has no tactics', () => {
    const battle = raidField(true);
    const bag = find(battle, 'a-bag');
    expect(getUnitAttackTargets(battle, bag.id)).toEqual([]);
    const own = army(
      [
        { id: 'a-line', side: 'attacker', x: 5, y: 11 },
        { id: 'a-bag', side: 'attacker', role: 'baggage', x: 5, y: 10 },
        { id: 'd-cav', side: 'defender', type: 'cavalry', x: 4, y: 10 },
        { id: 'd-line', side: 'defender', x: 30, y: 10 },
      ],
      { playerSide: 'attacker' },
    );
    expect(applyBattleAction(own, { type: 'attack', unitId: 'a-bag', targetId: 'd-cav' }).ok).toBe(
      false,
    );
    expect(
      applyBattleAction(own, {
        type: 'tactic',
        unitId: 'a-bag',
        tactic: 'rally',
        targetId: 'a-line',
      }).ok,
    ).toBe(false);
    // A hit on a screened train gets no answer.
    const hit = applyBattleAction(battle, { type: 'attack', unitId: 'd-cav', targetId: 'a-bag' });
    expect(hit.ok).toBe(true);
    expect(logged(hit.state, 'log.attack').filter((entry) => entry.params.counter)).toHaveLength(0);
  });

  it('an unscreened train is captured whole: supplies zero, army morale -25, every unit -10 morale', () => {
    const battle = raidField(false);
    const before = Object.fromEntries(battle.units.map((unit) => [unit.id, unit.morale]));
    const armyBefore = battle.armyMorale!.attacker;
    const forecast = predictBattleAttack(battle, 'd-cav', 'a-bag')!;
    expect(forecast.captures).toBe(true);
    expect(forecast.counterattack.possible).toBe(false);
    const result = applyBattleAction(battle, {
      type: 'attack',
      unitId: 'd-cav',
      targetId: 'a-bag',
    });
    expect(result.ok).toBe(true);
    const after = result.state;
    expect(find(after, 'a-bag').troops).toBe(0);
    expect(after.supplies.attacker).toBe(0);
    expect(after.supplies.defender).toBe(100_000);
    expect(logged(after, 'log.baggageCaptured')).toHaveLength(1);
    expect(logged(after, 'log.baggageLost')).toHaveLength(0);
    expect(after.armyMorale!.attacker).toBe(armyBefore - 25);
    expect(find(after, 'a-line').morale).toBe(before['a-line']! - 10);
    // The owner's formations lose the 10 once; the captor is untouched.
    expect(find(after, 'd-cav').morale).toBe(before['d-cav']);
  });

  it('a screened train takes ordinary damage; reaching zero is a loss with the same consequences', () => {
    const screened = raidField(true);
    const hit = applyBattleAction(screened, { type: 'attack', unitId: 'd-cav', targetId: 'a-bag' });
    expect(hit.ok).toBe(true);
    const bag = find(hit.state, 'a-bag');
    expect(bag.troops).toBeGreaterThan(0);
    expect(bag.troops).toBeLessThan(1000);
    expect(hit.state.supplies.attacker).toBe(100_000);
    expect(logged(hit.state, 'log.baggageCaptured')).toHaveLength(0);
    const fragile = raidField(true, { baggageTroops: 5 });
    const lost = applyBattleAction(fragile, { type: 'attack', unitId: 'd-cav', targetId: 'a-bag' });
    expect(lost.ok).toBe(true);
    expect(logged(lost.state, 'log.baggageLost')).toHaveLength(1);
    expect(lost.state.supplies.attacker).toBe(0);
    expect(lost.state.armyMorale!.attacker).toBe(fragile.armyMorale!.attacker - 25);
  });

  it('a routed friendly neighbour does not screen', () => {
    const battle = raidField(true);
    find(battle, 'a-line').morale = 10;
    const result = applyBattleAction(battle, {
      type: 'attack',
      unitId: 'd-cav',
      targetId: 'a-bag',
    });
    expect(logged(result.state, 'log.baggageCaptured')).toHaveLength(1);
  });

  it('the timeout survivor count ignores the baggage', () => {
    const battle = army(
      [
        { id: 'a-line', side: 'attacker', x: 5, y: 10, troops: 300 },
        { id: 'a-bag', side: 'attacker', role: 'baggage', x: 3, y: 10, troops: 5000 },
        { id: 'd-line', side: 'defender', x: 30, y: 10, troops: 400 },
      ],
      { armyMorale: false },
    );
    expect(getBattleTimeoutOutcome(battle).winner).toBe('defender');
  });

  it('an army with only its baggage left is eliminated', () => {
    const battle = army(
      [
        { id: 'a-line', side: 'attacker', x: 5, y: 10, troops: 1 },
        { id: 'a-bag', side: 'attacker', role: 'baggage', x: 3, y: 10 },
        { id: 'd-line', side: 'defender', x: 6, y: 10 },
      ],
      { playerSide: 'defender' },
    );
    const result = applyBattleAction(battle, {
      type: 'attack',
      unitId: 'd-line',
      targetId: 'a-line',
    });
    expect(result.state.outcome).toMatchObject({ winner: 'defender', reason: 'elimination' });
  });

  it('the defender AI sorties for an exposed baggage train, and takes it', () => {
    const battle = army(
      [
        { id: 'a-line', side: 'attacker', x: 8, y: 16 },
        { id: 'a-bag', side: 'attacker', role: 'baggage', x: 3, y: 10 },
        { id: 'd-cav', side: 'defender', type: 'cavalry', x: 9, y: 10 },
        { id: 'd-line', side: 'defender', x: 40, y: 10 },
      ],
      { playerSide: 'attacker' },
    );
    const assigned = aiAssignOrders(battle, 'defender');
    expect(find(assigned, 'd-cav').order).toEqual({
      kind: 'advance',
      target: { unitId: 'a-bag' },
    });
    const raided = runBattleAiTurn(battle, 'defender', {}, { useOrders: true });
    expect(logged(raided, 'log.baggageCaptured')).toHaveLength(1);
    expect(raided.supplies.attacker).toBe(0);
  });

  it('the evaluator values capturing an unscreened train above an even line fight', () => {
    const battle = army(
      [
        { id: 'a-line', side: 'attacker', x: 4, y: 12 },
        { id: 'a-bag', side: 'attacker', role: 'baggage', x: 4, y: 10 },
        { id: 'd-cav', side: 'defender', type: 'cavalry', x: 4, y: 11 },
        { id: 'd-line', side: 'defender', x: 30, y: 10 },
      ],
      { playerSide: 'attacker' },
    );
    const choices = evaluateBattleActions(battle, 'd-cav').filter(
      (choice) => choice.action === 'attack',
    );
    const bag = choices.find((choice) => choice.targetId === 'a-bag')!;
    const line = choices.find((choice) => choice.targetId === 'a-line')!;
    expect(bag.finishValue).toBeGreaterThan(line.finishValue);
    expect(bag.score).toBeGreaterThan(line.score);
  });

  it('the attacker keeps its nearest line formation screening the train when the enemy is near', () => {
    const battle = army(
      [
        { id: 'a-near', side: 'attacker', x: 7, y: 10 },
        { id: 'a-far', side: 'attacker', x: 14, y: 14 },
        { id: 'a-bag', side: 'attacker', role: 'baggage', x: 3, y: 10 },
        { id: 'd-cav', side: 'defender', type: 'cavalry', x: 6, y: 7 },
        { id: 'd-line', side: 'defender', x: 40, y: 10 },
      ],
      { playerSide: 'defender' },
    );
    const assigned = aiAssignOrders(battle, 'attacker');
    expect(find(assigned, 'a-near').order).toEqual({ kind: 'screen', friendId: 'a-bag' });
    expect(find(assigned, 'a-far').order).toBeUndefined();
    expect(find(assigned, 'a-bag').order).toBeUndefined();
    // Executed, the screen ends beside the train.
    const moved = runBattleAiTurn(battle, 'attacker', {}, { useOrders: true });
    const near = find(moved, 'a-near');
    const bag = find(moved, 'a-bag');
    expect(Math.abs(near.x - bag.x) + Math.abs(near.y - bag.y)).toBe(1);
    // No enemy near: no screen.
    find(battle, 'd-cav').x = 20;
    find(battle, 'd-cav').y = 7;
    expect(find(aiAssignOrders(battle, 'attacker'), 'a-near').order).toBeUndefined();
  });
});

function campaignBattle() {
  let state = createV03Game('cao', 19);
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  city.food = 1_000_000;
  for (const [id, troops] of [
    ['caocao', 5000],
    ['xiahoudun', 2000],
  ] as const) {
    const officer = state.officers.find((entry) => entry.id === id)!;
    city.garrisonTroops += troops - officer.troops;
    Object.assign(officer, { troops, troopExperience: 1200 });
  }
  state.personnelDay = createPersonnelDay(state);
  const dispatch = executeV03Command(state, {
    type: 'marchArmy',
    sourceCityId: city.id,
    targetCityId: 'ye',
    officerIds: ['caocao', 'xiahoudun'],
    intent: 'conquer',
  });
  expect(dispatch.ok, dispatch.error).toBe(true);
  state = dispatch.state;
  const journey = state.journeys.at(-1)!;
  journey.routeSnapshot = journey.routeSnapshot.map((segment) => ({
    ...segment,
    lengthKm: 1,
    fixedDelayDays: 0,
  }));
  journey.segmentProgressKm.fill(0);
  journey.segmentWaitDays.fill(0);
  state = executeV03Command(state, { type: 'advance', days: 1 }).state;
  return { state, battle: state.battles.find((entry) => entry.active)! };
}

describe('baggage in the campaign (B-04)', () => {
  it('the attacker brings a train; finishBattle does not allocate its survivors', () => {
    const { state, battle } = campaignBattle();
    const train = battle.battleData.units.find((unit) => unit.role === 'baggage')!;
    expect(train).toBeDefined();
    expect(train.side).toBe('attacker');
    expect(train.troops).toBe(
      Math.max(
        100,
        Math.round(
          0.05 *
            battle.battleData.units
              .filter((unit) => unit.side === 'attacker' && unit.role !== 'baggage')
              .reduce((sum, unit) => sum + unit.initialTroops, 0),
        ),
      ),
    );
    expect(battle.attackerFormationOfficerIds[train.id]).toBeUndefined();
    expect(battle.battleData.armyMorale).toBeDefined();
    expect(validateV03State(decodeV03Save(encodeV03Save(state)))).toBe(true);
    const ended = applyV03BattleAction(state, battle.id, { type: 'retreat', side: 'attacker' });
    expect(ended.ok).toBe(true);
    const report = ended.state.events.filter((event) => event.battleOutcome).at(-1)!.battleOutcome!;
    expect(report.attacker.troopGrowth.every((entry) => entry.officerId !== null)).toBe(true);
    const line = battle.battleData.units.filter(
      (unit) => unit.side === 'attacker' && unit.role !== 'baggage',
    );
    expect(report.attacker.startingTroops).toBe(
      line.reduce((sum, unit) => sum + unit.initialTroops, 0),
    );
  });

  it('a capture zeroes the campaign food mirror', () => {
    const { state, battle } = campaignBattle();
    const tactical = battle.battleData;
    const train = tactical.units.find((unit) => unit.role === 'baggage')!;
    const raider = tactical.units.find((unit) => unit.side === 'defender')!;
    tactical.playerSide = 'defender';
    state.playerFactionId = battle.defenderFactionId!;
    state.playerCapitalCityId = state.factions.find(
      (entry) => entry.id === state.playerFactionId,
    )!.capitalCityId;
    state.factions.forEach((entry) => (entry.isPlayer = entry.id === state.playerFactionId));
    tactical.map.terrain.fill('plain');
    tactical.units.forEach((unit, index) =>
      Object.assign(unit, { x: 30 + (index % 10), y: 20 + Math.floor(index / 10) * 2 }),
    );
    Object.assign(train, { x: 5, y: 5 });
    Object.assign(raider, {
      x: 6,
      y: 5,
      acted: false,
      moved: false,
      morale: 100,
      status: 'normal',
    });
    state.events.forEach((entry) => (entry.acknowledged = true));
    expect(battle.attackerFood).toBeGreaterThan(0);
    const result = applyV03BattleAction(state, battle.id, {
      type: 'attack',
      unitId: raider.id,
      targetId: train.id,
    });
    expect(result.ok, result.error).toBe(true);
    const after = result.state.battles.find((entry) => entry.id === battle.id)!;
    expect(after.battleData.supplies.attacker).toBe(0);
    expect(after.attackerFood).toBe(0);
    expect(validateV03State(result.state)).toBe(true);
  });
});
