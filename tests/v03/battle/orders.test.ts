import { describe, expect, it } from 'vitest';
import { executeV03Command } from '../../../src/v03/commands';
import { playtestFixture } from '../../../src/v03/dev/fixtures';
import { decodeV03Save, encodeV03Save } from '../../../src/v03/platform/storage';
import {
  advanceBattleDay,
  aiAssignOrders,
  applyBattleAction,
  createBattleMap,
  createTacticalBattle,
  evaluateBattleTurn,
  impossibleOrders,
  manhattanDistance,
  orderConstraintFor,
  runBattleAiTurn,
  type BattleOrder,
  type BattleTroopType,
  type V03TacticalBattleState,
} from '../../../src/v03/battle';

interface Spec {
  id: string;
  side: 'attacker' | 'defender';
  type: BattleTroopType;
  x: number;
  y: number;
  troops?: number;
  force?: number;
  morale?: number;
  fierce?: boolean;
}

/** A plain-terrain battle with units placed exactly; the attacker is the player. */
function field(specs: Spec[]): V03TacticalBattleState {
  const map = createBattleMap({ regionId: 'xiapi', seed: 7 });
  map.terrain.fill('plain');
  const roster = (side: Spec['side']) =>
    specs
      .filter((spec) => spec.side === side)
      .map((spec) => ({
        id: spec.id,
        name: spec.id,
        troopType: spec.type,
        troops: spec.troops ?? 1000,
        force: spec.force ?? 70,
        intellect: 40,
        fierce: spec.fierce,
      }));
  const battle = createTacticalBattle({
    id: 'orders',
    map,
    seed: 7,
    playerSide: 'attacker',
    supplies: { attacker: 100_000, defender: 100_000 },
    attackerUnits: roster('attacker'),
    defenderUnits: roster('defender'),
  });
  for (const spec of specs) {
    const unit = battle.units.find((entry) => entry.id === spec.id)!;
    Object.assign(unit, { x: spec.x, y: spec.y }, spec.morale ? { morale: spec.morale } : {});
  }
  battle.weather = 'clear';
  battle.tacticPoints = { attacker: 0, defender: 0 };
  return battle;
}
const unit = (battle: V03TacticalBattleState, id: string) =>
  battle.units.find((entry) => entry.id === id)!;
const give = (battle: V03TacticalBattleState, id: string, order: BattleOrder) => {
  unit(battle, id).order = order;
  return battle;
};
const run = (battle: V03TacticalBattleState, side: 'attacker' | 'defender' = 'attacker') =>
  runBattleAiTurn(battle, side, {}, { useOrders: true, assignOrders: false });
const nearest = (battle: V03TacticalBattleState, id: string) =>
  Math.min(
    ...battle.units
      .filter((entry) => entry.side !== unit(battle, id).side && entry.troops > 0)
      .map((entry) => manhattanDistance(unit(battle, id), entry)),
  );
const logged = (battle: V03TacticalBattleState, code: string) =>
  (battle.logEntries ?? []).filter((entry) => entry.code === code);

describe('standing order executor', () => {
  it('hold never moves but still strikes from where it stands', () => {
    const open = field([
      { id: 'a', side: 'attacker', type: 'infantry', x: 5, y: 5 },
      { id: 'e', side: 'defender', type: 'infantry', x: 9, y: 5 },
    ]);
    expect(evaluateBattleTurn(open, 'a')[0]!.moveCost).toBeGreaterThan(0);
    give(open, 'a', { kind: 'hold' });
    for (const choice of evaluateBattleTurn(open, 'a'))
      expect([choice.x, choice.y]).toEqual([5, 5]);
    const after = run(open);
    expect([unit(after, 'a').x, unit(after, 'a').y]).toEqual([5, 5]);
    expect(unit(after, 'a').acted).toBe(true);

    const adjacent = give(
      field([
        { id: 'a', side: 'attacker', type: 'infantry', x: 5, y: 5 },
        { id: 'e', side: 'defender', type: 'infantry', x: 6, y: 5 },
      ]),
      'a',
      { kind: 'hold' },
    );
    expect(unit(run(adjacent), 'e').troops).toBeLessThan(1000);
  });

  it('advance only steps closer to its target', () => {
    const battle = give(
      field([
        { id: 'a', side: 'attacker', type: 'infantry', x: 3, y: 5 },
        { id: 'near', side: 'defender', type: 'infantry', x: 3, y: 1 },
        { id: 'far', side: 'defender', type: 'infantry', x: 12, y: 5 },
      ]),
      'a',
      { kind: 'advance', target: { unitId: 'far' } },
    );
    const before = manhattanDistance(unit(battle, 'a'), unit(battle, 'far'));
    for (const choice of evaluateBattleTurn(battle, 'a'))
      expect(manhattanDistance(choice, unit(battle, 'far'))).toBeLessThanOrEqual(before);
    const best = evaluateBattleTurn(battle, 'a')[0]!;
    expect(manhattanDistance(best, unit(battle, 'far'))).toBeLessThan(before);
    const toCell = give(battle, 'a', { kind: 'advance', target: { x: 3, y: 9 } });
    expect(evaluateBattleTurn(toCell, 'a')[0]!.y).toBeGreaterThan(5);
  });

  it('skirmish keeps an archer 2 to 3 cells from the enemy and only volleys', () => {
    const battle = give(
      field([
        { id: 'a', side: 'attacker', type: 'archer', x: 5, y: 5 },
        { id: 'e', side: 'defender', type: 'infantry', x: 7, y: 5 },
      ]),
      'a',
      { kind: 'skirmish' },
    );
    for (const choice of evaluateBattleTurn(battle, 'a'))
      expect(manhattanDistance(choice, unit(battle, 'e'))).toBe(3);
    const after = run(battle);
    expect(manhattanDistance(unit(after, 'a'), unit(after, 'e'))).toBe(3);
    expect(unit(after, 'e').troops).toBeLessThan(1000);
    // Out of range it closes toward the band without entering contact.
    const far = give(
      field([
        { id: 'a', side: 'attacker', type: 'archer', x: 2, y: 5 },
        { id: 'e', side: 'defender', type: 'infantry', x: 9, y: 5 },
      ]),
      'a',
      { kind: 'skirmish' },
    );
    for (const choice of evaluateBattleTurn(far, 'a'))
      expect(manhattanDistance(choice, unit(far, 'e'))).toBeGreaterThanOrEqual(2);
    expect(nearest(run(far), 'a')).toBeLessThan(nearest(far, 'a'));
  });

  it('charge attacks a target that a free formation would not choose', () => {
    const specs: Spec[] = [
      { id: 'a', side: 'attacker', type: 'cavalry', x: 2, y: 5, troops: 400, force: 60 },
      { id: 'e', side: 'defender', type: 'infantry', x: 6, y: 5, troops: 4000, force: 95 },
    ];
    const free = field(specs);
    expect(unit(run(free), 'e').troops).toBe(4000);
    const charging = give(field(specs), 'a', { kind: 'charge', target: { unitId: 'e' } });
    const after = run(charging);
    expect(unit(after, 'e').troops).toBeLessThan(4000);
    expect(manhattanDistance(unit(after, 'a'), unit(after, 'e'))).toBe(1);
    expect(logged(after, 'log.orderExecuted')).toHaveLength(1);
  });

  it('withdraw increases the distance and never attacks', () => {
    const battle = give(
      field([
        { id: 'a', side: 'attacker', type: 'infantry', x: 5, y: 5 },
        { id: 'e', side: 'defender', type: 'infantry', x: 8, y: 5 },
      ]),
      'a',
      { kind: 'withdraw' },
    );
    const after = run(battle);
    expect(nearest(after, 'a')).toBeGreaterThan(nearest(battle, 'a'));
    expect(unit(after, 'e').troops).toBe(1000);
    // Pinned in contact it cannot leave, and still does not attack.
    const pinned = give(
      field([
        { id: 'a', side: 'attacker', type: 'infantry', x: 5, y: 5 },
        { id: 'e', side: 'defender', type: 'infantry', x: 6, y: 5 },
      ]),
      'a',
      { kind: 'withdraw' },
    );
    expect(unit(run(pinned), 'e').troops).toBe(1000);
  });

  it('screen stays adjacent to its friend and defends it', () => {
    const specs: Spec[] = [
      { id: 'baggage', side: 'attacker', type: 'infantry', x: 5, y: 5 },
      { id: 'a', side: 'attacker', type: 'infantry', x: 4, y: 5 },
      { id: 'e', side: 'defender', type: 'infantry', x: 9, y: 5 },
    ];
    const battle = give(field(specs), 'a', { kind: 'screen', friendId: 'baggage' });
    for (const choice of evaluateBattleTurn(battle, 'a'))
      expect(manhattanDistance(choice, unit(battle, 'baggage'))).toBe(1);
    // From afar it comes alongside.
    const away = give(
      give(field([specs[0]!, { ...specs[1]!, x: 1, y: 5 }, specs[2]!]), 'baggage', {
        kind: 'hold',
      }),
      'a',
      { kind: 'screen', friendId: 'baggage' },
    );
    const closer = run(away);
    expect(manhattanDistance(unit(closer, 'a'), unit(closer, 'baggage'))).toBeLessThan(4);
    // An enemy beside the friend is struck.
    const threatened = give(
      give(field([specs[0]!, specs[1]!, { ...specs[2]!, x: 6, y: 5 }]), 'baggage', {
        kind: 'hold',
      }),
      'a',
      { kind: 'screen', friendId: 'baggage' },
    );
    const struck = run(threatened);
    expect(manhattanDistance(unit(struck, 'a'), unit(struck, 'baggage'))).toBe(1);
    expect(unit(struck, 'e').troops).toBeLessThan(1000);
  });

  it('pursue strikes routed enemies first and is free when none is routed', () => {
    const specs: Spec[] = [
      { id: 'a', side: 'attacker', type: 'cavalry', x: 5, y: 5 },
      { id: 'healthy', side: 'defender', type: 'infantry', x: 7, y: 5 },
      { id: 'routed', side: 'defender', type: 'infantry', x: 5, y: 8, morale: 10 },
    ];
    const after = run(give(field(specs), 'a', { kind: 'pursue' }));
    expect(unit(after, 'routed').troops).toBeLessThan(1000);
    expect(unit(after, 'healthy').troops).toBe(1000);
    const calm = field(specs.map((spec) => ({ ...spec, morale: undefined })));
    const pursuing = give(structuredClone(calm), 'a', { kind: 'pursue' });
    expect(orderConstraintFor(pursuing, unit(pursuing, 'a'))).toBeNull();
    expect(evaluateBattleTurn(pursuing, 'a')).toEqual(evaluateBattleTurn(calm, 'a'));
  });
});

describe('setOrder', () => {
  const base = () =>
    field([
      { id: 'inf', side: 'attacker', type: 'infantry', x: 3, y: 3 },
      { id: 'arc', side: 'attacker', type: 'archer', x: 3, y: 4 },
      { id: 'cav', side: 'attacker', type: 'cavalry', x: 3, y: 5 },
      { id: 'e', side: 'defender', type: 'infantry', x: 9, y: 5 },
    ]);
  const order = (battle: V03TacticalBattleState, unitId: string, next: BattleOrder) =>
    applyBattleAction(battle, { type: 'setOrder', unitId, order: next });

  it('follows the legality rules and never spends the unit', () => {
    const battle = base();
    expect(order(battle, 'inf', { kind: 'charge', target: { unitId: 'e' } }).ok).toBe(false);
    expect(order(battle, 'cav', { kind: 'skirmish' }).ok).toBe(false);
    expect(order(battle, 'inf', { kind: 'pursue' }).ok).toBe(false);
    expect(order(battle, 'arc', { kind: 'screen', friendId: 'arc' }).ok).toBe(false);
    expect(order(battle, 'arc', { kind: 'screen', friendId: 'missing' }).ok).toBe(false);
    expect(order(battle, 'inf', { kind: 'advance', target: { x: 999, y: 0 } }).ok).toBe(false);
    expect(order(battle, 'inf', { kind: 'advance', target: { unitId: 'arc' } }).ok).toBe(false);
    expect(order(battle, 'e', { kind: 'hold' }).ok).toBe(false);
    const ok = order(battle, 'cav', { kind: 'charge', target: { unitId: 'e' } });
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(unit(ok.state, 'cav')).toMatchObject({
      moved: false,
      acted: false,
      order: { kind: 'charge', target: { unitId: 'e' } },
    });
    expect(logged(ok.state, 'log.order')).toMatchObject([
      { params: { unitId: 'cav', order: 'charge', targetId: 'e' } },
    ]);
    const freed = order(ok.state, 'cav', { kind: 'free' });
    expect(freed.ok && unit(freed.state, 'cav').order).toBeUndefined();
    const dead = base();
    unit(dead, 'arc').troops = 0;
    expect(order(dead, 'inf', { kind: 'screen', friendId: 'arc' }).ok).toBe(false);
  });
});

describe('lapsing and impossible orders', () => {
  it('frees an order whose target died and says so', () => {
    const battle = give(
      field([
        { id: 'a', side: 'attacker', type: 'cavalry', x: 2, y: 5 },
        { id: 'e', side: 'defender', type: 'infantry', x: 8, y: 5 },
        { id: 'f', side: 'defender', type: 'infantry', x: 8, y: 7 },
      ]),
      'a',
      { kind: 'charge', target: { unitId: 'e' } },
    );
    unit(battle, 'e').troops = 0;
    expect(impossibleOrders(battle, 'attacker')).toEqual([
      { unitId: 'a', order: 'charge', reason: 'targetDead' },
    ]);
    const after = run(battle);
    expect(unit(after, 'a').order).toBeUndefined();
    expect(logged(after, 'log.orderLapsed')).toMatchObject([
      { params: { unitId: 'a', order: 'charge', reason: 'targetDead' } },
    ]);
  });

  it('lists a screen whose friend died and an advance with no route', () => {
    const battle = field([
      { id: 'a', side: 'attacker', type: 'infantry', x: 2, y: 5 },
      { id: 'b', side: 'attacker', type: 'infantry', x: 2, y: 7 },
      { id: 'c', side: 'attacker', type: 'infantry', x: 4, y: 7 },
      { id: 'e', side: 'defender', type: 'infantry', x: 8, y: 5 },
    ]);
    give(battle, 'a', { kind: 'screen', friendId: 'b' });
    give(battle, 'c', { kind: 'advance', target: { unitId: 'e' } });
    unit(battle, 'b').troops = 0;
    for (let y = 0; y < battle.map.height; y++)
      battle.map.terrain[y * battle.map.width + 6] = 'cliff';
    expect(impossibleOrders(battle, 'attacker')).toEqual([
      { unitId: 'a', order: 'screen', reason: 'friendDead' },
      { unitId: 'c', order: 'advance', reason: 'noRoute' },
    ]);
  });
});

describe('AI order layer', () => {
  it('sends archers backed by infantry to skirmish, and only those', () => {
    const battle = field([
      { id: 'inf', side: 'defender', type: 'infantry', x: 10, y: 5 },
      { id: 'near', side: 'defender', type: 'archer', x: 11, y: 5 },
      { id: 'lone', side: 'defender', type: 'archer', x: 10, y: 12 },
      { id: 'e', side: 'attacker', type: 'infantry', x: 2, y: 5 },
    ]);
    const assigned = aiAssignOrders(battle, 'defender');
    expect(unit(assigned, 'near').order).toEqual({ kind: 'skirmish' });
    expect(unit(assigned, 'lone').order).toBeUndefined();
    expect(unit(assigned, 'inf').order).toBeUndefined();
    expect(unit(battle, 'near').order).toBeUndefined();
  });

  it('charges a fierce cavalry formation down a plain lane at an archer or a wavering target', () => {
    const specs: Spec[] = [
      { id: 'cav', side: 'defender', type: 'cavalry', x: 10, y: 5, fierce: true },
      { id: 'arc', side: 'attacker', type: 'archer', x: 5, y: 5 },
      { id: 'inf', side: 'attacker', type: 'infantry', x: 10, y: 9 },
    ];
    const battle = field(specs);
    expect(unit(aiAssignOrders(battle, 'defender'), 'cav').order).toEqual({
      kind: 'charge',
      target: { unitId: 'arc' },
    });
    // A steady infantry formation is no target; a wavering one is.
    const steady = field([specs[0]!, specs[2]!]);
    expect(unit(aiAssignOrders(steady, 'defender'), 'cav').order).toBeUndefined();
    const wavering = field([specs[0]!, { ...specs[2]!, morale: 30 }]);
    expect(unit(aiAssignOrders(wavering, 'defender'), 'cav').order).toMatchObject({
      kind: 'charge',
      target: { unitId: 'inf' },
    });
    // No lane, no charge: forest in the way, or a cavalry that is not fierce.
    const forest = field(specs);
    forest.map.terrain[5 * forest.map.width + 7] = 'forest';
    expect(unit(aiAssignOrders(forest, 'defender'), 'cav').order).toBeUndefined();
    const mild = field(specs.map((spec) => ({ ...spec, fierce: false })));
    expect(unit(aiAssignOrders(mild, 'defender'), 'cav').order).toBeUndefined();
  });

  it('withdraws every formation when the side has to withdraw', () => {
    const battle = field([
      { id: 'a', side: 'defender', type: 'infantry', x: 10, y: 5 },
      { id: 'b', side: 'defender', type: 'archer', x: 10, y: 7 },
      { id: 'e', side: 'attacker', type: 'infantry', x: 2, y: 5, troops: 9000 },
    ]);
    battle.retreatAllowed.defender = true;
    for (const id of ['a', 'b']) unit(battle, id).troops = 100;
    const assigned = aiAssignOrders(battle, 'defender');
    expect(unit(assigned, 'a').order).toEqual({ kind: 'withdraw' });
    expect(unit(assigned, 'b').order).toEqual({ kind: 'withdraw' });
  });
});

describe('free orders change nothing', () => {
  const play = (
    battle: V03TacticalBattleState,
    options: { useOrders: boolean; assignOrders?: boolean },
  ) => {
    for (let day = 0; day < 20 && !battle.outcome; day++) {
      for (const side of ['attacker', 'defender'] as const)
        if (!battle.outcome) battle = runBattleAiTurn(battle, side, {}, options);
      if (!battle.outcome) battle = advanceBattleDay(battle, {}, options);
    }
    return battle;
  };
  const roster = (side: 'attacker' | 'defender', types: BattleTroopType[]) =>
    types.map((type, index) => ({
      id: `${side}-${index}`,
      name: `${side}-${index}`,
      troopType: type,
      troops: 1500 + index * 100,
      force: 60 + index * 3,
      intellect: 50,
    }));
  const build = (seed: number, types: BattleTroopType[]) =>
    createTacticalBattle({
      id: `identity-${seed}`,
      seed,
      map: createBattleMap({ regionId: 'hanzhong', seed }),
      attackerUnits: roster('attacker', types),
      defenderUnits: roster('defender', types),
      supplies: { attacker: 100_000, defender: 100_000 },
      dayLimit: 14,
    });

  it.each([1, 2, 3])(
    'seed %i: executing orders with none set equals not executing them',
    (seed) => {
      const types: BattleTroopType[] = ['infantry', 'cavalry', 'infantry', 'cavalry'];
      const off = play(build(seed, types), { useOrders: false });
      const on = play(build(seed, types), { useOrders: true });
      expect(on).toEqual(off);
    },
  );

  it('with archers present and the AI layer off, equally', () => {
    const types: BattleTroopType[] = ['infantry', 'archer', 'cavalry', 'archer'];
    const off = play(build(4, types), { useOrders: false });
    const on = play(build(4, types), { useOrders: true, assignOrders: false });
    expect(on).toEqual(off);
  });
});

describe('committing the day', () => {
  it('executes the standing orders of unacted formations with one command', () => {
    const state = playtestFixture('battle');
    const battle = state.battles[0]!;
    const side = battle.battleData.playerSide;
    const mine = battle.battleData.units.filter((entry) => entry.side === side && entry.troops > 0);
    const [holder, ...others] = mine;
    const placed = (units: typeof mine, id: string) => units.find((entry) => entry.id === id)!;
    const set = executeV03Command(state, {
      type: 'battleAction',
      battleId: battle.id,
      action: { type: 'setOrder', unitId: holder!.id, order: { kind: 'hold' } },
    });
    expect(set.ok).toBe(true);
    const done = executeV03Command(set.state, { type: 'completeBattleDay', battleId: battle.id });
    expect(done.ok).toBe(true);
    const after = done.state.battles.find((entry) => entry.id === battle.id)!.battleData.units;
    expect([placed(after, holder!.id).x, placed(after, holder!.id).y]).toEqual([
      holder!.x,
      holder!.y,
    ]);
    expect(
      others.some(
        (unit) => placed(after, unit.id).x !== unit.x || placed(after, unit.id).y !== unit.y,
      ),
    ).toBe(true);
    const logs = done.state.battles.find((entry) => entry.id === battle.id)!.battleData.logEntries;
    expect(logs?.filter((entry) => entry.code === 'log.orderExecuted')).toHaveLength(1);
  });
});

describe('saved orders', () => {
  it('round-trips every order kind and rejects an unknown one', () => {
    const state = playtestFixture('battle');
    const battle = state.battles[0]!.battleData;
    const [first, second] = battle.units.filter((entry) => entry.side === battle.playerSide);
    const foe = battle.units.find((entry) => entry.side !== battle.playerSide)!;
    first!.order = { kind: 'advance', target: { x: 4, y: 4 } };
    second!.order = { kind: 'screen', friendId: first!.id };
    foe.order = { kind: 'charge', target: { unitId: first!.id } };
    const restored = decodeV03Save(encodeV03Save(state));
    expect(restored.battles[0]!.battleData.units.map((entry) => entry.order)).toEqual(
      battle.units.map((entry) => entry.order),
    );
    (first!.order as { kind: string }).kind = 'rampage';
    expect(() => decodeV03Save(encodeV03Save(state))).toThrow();
  });
});
