import { describe, expect, it } from 'vitest';
import { army, find, logged, type ArmySpec } from './armyHelpers';
import {
  advanceBattleDay,
  applyBattleAction,
  getForcedBattleOutcome,
  runBattleAiTurn,
  type V03TacticalBattleState,
} from '../../../src/v03/battle';
import { createV03Game } from '../../../src/v03/initial-state';
import { executeV03Command } from '../../../src/v03/commands';
import { advanceV03 } from '../../../src/v03/engine';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { pursuitEffects, retreatRisk } from '../../../src/v03/campaign/battle-aftermath';
import { PERSONNEL_RULES } from '../../../src/v03/campaign/personnel';

/** Five attackers and five defenders; a0 stands beside d3 and d0 (the defender commander) is far away. */
const line = (side: 'attacker' | 'defender', extra: Partial<ArmySpec>[] = []): ArmySpec[] =>
  Array.from({ length: 5 }, (_, index) => ({
    id: `${side === 'attacker' ? 'a' : 'd'}${index}`,
    side,
    x: side === 'attacker' ? 3 : 20,
    y: 4 + index * 3,
    ...(side === 'defender' && index === 0 ? { force: 90 } : {}),
    ...extra[index],
  }));
const battleOf = (
  defenders: Partial<ArmySpec>[] = [],
  attackers: ArmySpec[] = line('attacker'),
  options: Parameters<typeof army>[1] = {},
) => {
  const specs = [...attackers, ...line('defender', defenders)];
  // a0 attacks d3: put them side by side.
  const battle = army(specs, options);
  Object.assign(find(battle, 'a0'), { x: 10, y: 10 });
  Object.assign(find(battle, 'd3'), { x: 11, y: 10 });
  return battle;
};
const hit = (battle: V03TacticalBattleState, target = 'd3') => {
  const result = applyBattleAction(battle, { type: 'attack', unitId: 'a0', targetId: target });
  if (!result.ok) throw new Error(result.error);
  return result.state;
};
const deltas = (battle: V03TacticalBattleState) =>
  logged(battle, 'log.armyMorale').map((entry) => [
    entry.params.side,
    entry.params.delta,
    entry.params.cause,
  ]);

describe('army morale deltas (B-05)', () => {
  it('opens at 50 + commander leadership / 2 (force when leadership is absent)', () => {
    const battle = army([
      { id: 'a0', side: 'attacker', x: 3, y: 5, leadership: 80, force: 60 },
      { id: 'a1', side: 'attacker', x: 3, y: 6, leadership: 40, force: 99 },
      { id: 'd0', side: 'defender', x: 20, y: 5, force: 90 },
    ]);
    expect(battle.armyMorale).toEqual({ attacker: 90, defender: 95 });
    expect(battle.shaken).toEqual({ attacker: false, defender: false });
    expect(battle.pending).toBeNull();
  });

  it('a routed enemy formation costs it 8 and gives us 5; a destroyed one costs 12 and gives 6', () => {
    const routed = hit(battleOf([{}, {}, {}, { morale: 22 }]));
    expect(find(routed, 'd3').morale).toBeLessThan(20);
    expect(routed.armyMorale).toEqual({ attacker: 90, defender: 87 });
    expect(deltas(routed)).toEqual(
      expect.arrayContaining([
        ['defender', -8, 'routed'],
        ['attacker', 5, 'enemyRouted'],
      ]),
    );
    const destroyed = hit(battleOf([{}, {}, {}, { troops: 1 }]));
    expect(find(destroyed, 'd3').troops).toBe(0);
    expect(destroyed.armyMorale).toEqual({ attacker: 91, defender: 83 });
    expect(deltas(destroyed)).toEqual(
      expect.arrayContaining([
        ['defender', -12, 'destroyed'],
        ['attacker', 6, 'enemyDestroyed'],
      ]),
    );
  });

  it('counts a formation once, and a routed one later destroyed costs 12 in all', () => {
    const routed = hit(battleOf([{}, {}, {}, { morale: 22 }]));
    expect(find(routed, 'd3').counted).toBe('routed');
    Object.assign(find(routed, 'd3'), { troops: 1 });
    Object.assign(find(routed, 'a0'), { acted: false });
    const finished = hit(routed);
    expect(find(finished, 'd3').counted).toBe('destroyed');
    expect(finished.armyMorale!.defender).toBe(95 - 12);
    expect(finished.armyMorale!.attacker).toBe(85 + 6);
  });

  it("the commander's formation routing costs a further 20", () => {
    const battle = battleOf([{ morale: 22 }]);
    Object.assign(find(battle, 'a0'), { x: 19, y: 4 });
    const result = hit(battle, 'd0');
    expect(find(result, 'd0').morale).toBeLessThan(20);
    expect(result.armyMorale!.defender).toBe(95 - 8 - 20);
    expect(deltas(result)).toEqual(expect.arrayContaining([['defender', -20, 'commander']]));
  });

  it('the attacker loses 2 at each rollover after day 20, and the change is not logged', () => {
    const battle = battleOf();
    battle.day = 20;
    const next = advanceBattleDay(battle);
    expect(next.day).toBe(21);
    expect(next.armyMorale).toEqual({ attacker: 83, defender: 95 });
    expect(deltas(next)).toEqual([]);
    const early = advanceBattleDay(battleOf());
    expect(early.armyMorale).toEqual({ attacker: 85, defender: 95 });
  });

  it('is shaken once: every living formation of the side loses 15 morale a single time', () => {
    const battle = battleOf([{}, {}, { morale: 22 }, { morale: 22 }]);
    battle.armyMorale!.defender = 35;
    Object.assign(find(battle, 'd2'), { x: 10, y: 11 });
    const first = hit(battle);
    expect(first.shaken!.defender).toBe(true);
    expect(logged(first, 'log.armyShaken')).toHaveLength(1);
    expect(find(first, 'd1').morale).toBe(80 - 15);
    expect(find(first, 'd4').morale).toBe(80 - 15);
    Object.assign(find(first, 'a0'), { acted: false });
    const second = hit(first, 'd2');
    expect(logged(second, 'log.armyShaken')).toHaveLength(1);
    expect(find(second, 'd1').morale).toBe(80 - 15);
  });
});

describe('breaking (B-05)', () => {
  it('breaks when 60% of the line formations are routed or destroyed', () => {
    const battle = battleOf([{}, { morale: 10 }, { morale: 10 }, { morale: 22 }]);
    const result = hit(battle);
    expect(result.outcome).toEqual({ winner: 'attacker', reason: 'rout', cause: 'formations' });
    const two = battleOf([{}, { morale: 10 }, {}, { morale: 22 }]);
    expect(hit(two).outcome).toBeNull();
  });

  it('breaks when army morale falls to 10, and when every formation is routed', () => {
    const low = battleOf([{}, {}, {}, { morale: 22 }]);
    low.armyMorale!.defender = 14;
    expect(hit(low).outcome).toEqual({ winner: 'attacker', reason: 'rout', cause: 'armyMorale' });
    const all = battleOf([
      { morale: 10 },
      { morale: 10 },
      { morale: 10 },
      { morale: 22 },
      { morale: 10 },
    ]);
    expect(hit(all).outcome).toEqual({ winner: 'attacker', reason: 'rout', cause: 'allRouted' });
  });

  it('names the baggage as the cause when it fell and morale ran out', () => {
    const battle = army(
      [
        ...line('attacker'),
        ...line('defender', [{}, {}, {}, { morale: 22 }]),
        { id: 'd-bag', side: 'defender', role: 'baggage', x: 25, y: 10 },
      ],
      {},
    );
    Object.assign(find(battle, 'a0'), { x: 10, y: 10 });
    Object.assign(find(battle, 'd3'), { x: 11, y: 10 });
    find(battle, 'd-bag').troops = 0;
    battle.armyMorale!.defender = 14;
    expect(hit(battle).outcome?.cause).toBe('baggage');
  });

  it('a battle created without the option is unchanged: no army morale state anywhere', () => {
    let battle = battleOf([{}, { morale: 10 }, { morale: 10 }, { morale: 22 }], line('attacker'), {
      armyMorale: false,
    });
    expect(battle.armyMorale).toBeUndefined();
    battle = hit(battle);
    expect(battle.outcome).toBeNull();
    for (let day = 0; day < 8 && !battle.outcome; day++) {
      battle = runBattleAiTurn(battle, 'attacker');
      if (!battle.outcome) battle = runBattleAiTurn(battle, 'defender');
      if (!battle.outcome) battle = advanceBattleDay(battle);
    }
    expect(battle.armyMorale).toBeUndefined();
    expect(battle.shaken).toBeUndefined();
    expect(battle.pending).toBeUndefined();
    expect(
      battle.units.every((unit) => unit.counted === undefined && unit.role === undefined),
    ).toBe(true);
    expect(battle.outcome === null || battle.outcome.cause === undefined).toBe(true);
    expect(logged(battle, 'log.armyMorale')).toHaveLength(0);
  });
});

/** A broken defender with the attacker's cavalry ready; `loserFirst` lets the AI break the human instead. */
const breakingField = (attackers: Partial<ArmySpec>[] = [{ fierce: true }]) => {
  const specs: ArmySpec[] = [
    ...line('attacker', [
      { force: 90, ...attackers[0] },
      { type: 'cavalry', y: 20 },
      { type: 'cavalry', y: 23 },
    ]),
    ...line('defender', [{}, {}, {}, { morale: 22 }]),
  ];
  const battle = army(specs);
  Object.assign(find(battle, 'a0'), { x: 10, y: 10 });
  Object.assign(find(battle, 'a1'), { type: 'cavalry', troopType: 'cavalry' });
  for (const id of ['a1', 'a2']) Object.assign(find(battle, id), { troopType: 'cavalry' });
  Object.assign(find(battle, 'd3'), { x: 11, y: 10 });
  Object.assign(find(battle, 'd1'), { morale: 10 });
  Object.assign(find(battle, 'd2'), { morale: 10 });
  return battle;
};

describe('pursuit (B-05)', () => {
  it('waits for the pursuit when the winner has cavalry, the AI loser already naming its rear guard', () => {
    const broken = hit(breakingField());
    expect(broken.outcome).toBeNull();
    expect(broken.pending).toMatchObject({
      kind: 'pursuit',
      winner: 'attacker',
      loser: 'defender',
      cause: 'formations',
    });
    expect(broken.pending!.pursuers).toBeUndefined();
    expect(broken.pending!.rearGuard).toBe('d0');
    // Nothing else may be done until it is decided.
    const stuck = applyBattleAction(broken, { type: 'wait', unitId: 'a3' });
    expect(stuck.ok).toBe(false);
  });

  it('two pursuers and no rear guard: the outcome records both', () => {
    const broken = hit(breakingField());
    broken.pending!.rearGuard = null;
    const resolved = applyBattleAction(broken, { type: 'pursuit', pursuers: ['a1', 'a2'] });
    expect(resolved.ok).toBe(true);
    expect(resolved.state.pending).toBeNull();
    expect(resolved.state.outcome).toEqual({
      winner: 'attacker',
      reason: 'rout',
      cause: 'formations',
      pursuit: { pursuers: ['a1', 'a2'], rearGuard: null },
    });
    expect(logged(resolved.state, 'log.pursuit')).toHaveLength(1);
  });

  it('refuses a pursuer that is not eligible cavalry', () => {
    const broken = hit(breakingField());
    expect(applyBattleAction(broken, { type: 'pursuit', pursuers: ['a3'] }).ok).toBe(false);
    Object.assign(find(broken, 'a1'), { morale: 30 });
    expect(applyBattleAction(broken, { type: 'pursuit', pursuers: ['a1'] }).ok).toBe(false);
  });

  it('the rear guard takes one free hit from each pursuer', () => {
    const broken = hit(breakingField());
    broken.pending!.rearGuard = 'd4';
    const before = find(broken, 'd4').troops;
    const resolved = applyBattleAction(broken, { type: 'pursuit', pursuers: ['a1', 'a2'] }).state;
    const strikes = logged(resolved, 'log.attack').filter(
      (entry) => entry.params.targetId === 'd4' && !entry.params.counter,
    );
    expect(strikes.map((entry) => entry.params.sourceId)).toEqual(['a1', 'a2']);
    expect(find(resolved, 'd4').troops).toBeLessThan(before);
    expect(resolved.outcome?.pursuit).toEqual({ pursuers: ['a1', 'a2'], rearGuard: 'd4' });
  });

  it('a fierce AI winner pursues with every cavalry formation, a cautious one with one', () => {
    const humanLoses = (fierce: boolean) => {
      const battle = breakingField([{ fierce }]);
      battle.playerSide = 'defender';
      Object.assign(find(battle, 'd3'), { morale: 10 });
      return runBattleAiTurn(battle, 'attacker');
    };
    const aggressive = humanLoses(true);
    expect(aggressive.pending).toMatchObject({ winner: 'attacker', pursuers: ['a1', 'a2'] });
    expect(aggressive.pending!.rearGuard).toBeUndefined();
    const careful = humanLoses(false);
    expect(careful.pending!.pursuers).toHaveLength(1);
    // The human loser answers with a rear guard.
    const answered = applyBattleAction(aggressive, { type: 'pursuit', rearGuard: 'd4' });
    expect(answered.ok).toBe(true);
    expect(answered.state.outcome?.pursuit).toEqual({ pursuers: ['a1', 'a2'], rearGuard: 'd4' });
  });

  it('committing the day answers the player half: every eligible cavalry pursues, no rear guard', () => {
    const won = hit(breakingField());
    const resolvedWon = advanceBattleDay(won);
    expect(resolvedWon.outcome?.pursuit).toEqual({ pursuers: ['a1', 'a2'], rearGuard: 'd0' });
    const lost = breakingField();
    lost.playerSide = 'defender';
    Object.assign(find(lost, 'd3'), { morale: 10 });
    const broken = runBattleAiTurn(lost, 'attacker');
    expect(broken.pending).not.toBeNull();
    expect(advanceBattleDay(broken).outcome?.pursuit).toEqual({
      pursuers: ['a1', 'a2'],
      rearGuard: null,
    });
  });

  it('AI-vs-AI battles decide both halves at once', () => {
    const battle = breakingField();
    battle.playerSide = 'defender';
    Object.assign(find(battle, 'd3'), { morale: 10 });
    const done = runBattleAiTurn(battle, 'attacker', {}, { autoPursuit: true });
    expect(done.pending).toBeNull();
    expect(done.outcome?.pursuit?.pursuers).toEqual(['a1', 'a2']);
    expect(done.outcome?.pursuit?.rearGuard).toBe('d0');
  });

  it('no pursuit when the winner has no eligible cavalry', () => {
    const battle = breakingField();
    for (const id of ['a1', 'a2']) Object.assign(find(battle, id), { troopType: 'infantry' });
    expect(hit(battle).outcome).toMatchObject({ reason: 'rout', cause: 'formations' });
    const tired = breakingField();
    for (const id of ['a1', 'a2']) Object.assign(find(tired, id), { morale: 39 });
    const result = hit(tired);
    expect(result.pending).toBeNull();
    expect(result.outcome).toMatchObject({ reason: 'rout' });
  });

  it('hunger can finish a pursuit by itself: the forced outcome decides every half', () => {
    const broken = breakingField();
    broken.playerSide = 'defender';
    Object.assign(find(broken, 'd3'), { morale: 10 });
    const forced = getForcedBattleOutcome(broken);
    expect(forced).toMatchObject({ winner: 'attacker', reason: 'rout' });
    expect(forced?.pursuit?.pursuers).toEqual(['a1', 'a2']);
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

describe('pursuit aftermath (B-05)', () => {
  const pursuit = (count: number, rearGuard: string | null) => ({
    pursuers: Array.from({ length: count }, (_, index) => `p${index}`),
    rearGuard,
  });

  it('two pursuers raise a 25% capture risk to 35% and the wounded share from 60% to 80%', () => {
    const { battle } = campaignBattle();
    battle.battleData.outcome = {
      winner: 'defender',
      reason: 'rout',
      cause: 'formations',
      pursuit: pursuit(2, null),
    };
    expect(retreatRisk(battle, true)).toBe(PERSONNEL_RULES.forcedCapturePercent + 10);
    expect(retreatRisk(battle, true)).toBe(35);
    expect(60 + pursuitEffects(battle.battleData.outcome.pursuit).woundedPoints).toBe(80);
  });

  it('with a rear guard the effects halve: 30% and 70%, and the rear guard itself takes none', () => {
    const { battle } = campaignBattle();
    battle.battleData.outcome = {
      winner: 'defender',
      reason: 'rout',
      pursuit: pursuit(2, 'guard'),
    };
    expect(retreatRisk(battle, true)).toBe(30);
    expect(60 + pursuitEffects(battle.battleData.outcome.pursuit).woundedPoints).toBe(70);
    expect(retreatRisk(battle, true, true)).toBe(25);
  });

  it('caps at +30 and ignores a retreat that is not a rout', () => {
    expect(pursuitEffects(pursuit(9, null))).toEqual({ capturePoints: 30, woundedPoints: 30 });
    expect(pursuitEffects(undefined)).toEqual({ capturePoints: 0, woundedPoints: 0 });
    const { battle } = campaignBattle();
    battle.battleData.engaged = true;
    battle.battleData.outcome = { winner: 'defender', reason: 'retreat' };
    expect(retreatRisk(battle, true)).toBe(PERSONNEL_RULES.orderlyCapturePercent);
  });

  it('settlement leaves more of the loser survivors wounded', () => {
    const run = (withPursuit: boolean) => {
      const { state, battle } = campaignBattle();
      // Find a rng whose capture rolls both miss at 40%, so the officers come home to compare.
      for (let seed = 1; seed < 5000; seed++) {
        let value = seed;
        const rolls = [0, 1].map(() => {
          value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
          return value % 100;
        });
        if (rolls.every((roll) => roll >= 40)) {
          state.rng = seed;
          break;
        }
      }
      battle.autoCommand = true;
      state.events.forEach((entry) => (entry.acknowledged = true));
      battle.battleData.outcome = {
        winner: 'defender',
        reason: 'rout',
        ...(withPursuit ? { pursuit: pursuit(3, null) } : {}),
      };
      const after = advanceV03(state, 1).state;
      return ['caocao', 'xiahoudun'].map((id) => {
        const officer = after.officers.find((entry) => entry.id === id)!;
        return {
          troops: officer.troops,
          wounded: officer.wounded,
          captured: officer.location.kind === 'captured',
        };
      });
    };
    const plain = run(false);
    const pressed = run(true);
    expect(plain.every((entry) => !entry.captured)).toBe(true);
    expect(pressed.every((entry) => !entry.captured)).toBe(true);
    const hurt = plain.reduce((sum, entry) => sum + Math.floor((entry.troops * 30) / 100), 0);
    expect(pressed.reduce((sum, entry) => sum + entry.wounded, 0)).toBeGreaterThan(
      plain.reduce((sum, entry) => sum + entry.wounded, 0),
    );
    expect(
      plain.reduce((sum, entry) => sum + entry.troops, 0) -
        pressed.reduce((sum, entry) => sum + entry.troops, 0),
    ).toBeGreaterThan(hurt - 3);
  });
});
