import { describe, expect, it } from 'vitest';
import { planDefenderTurn, runDefenderTurn } from '../../src/siege/ai/defender';
import { COURTYARD, INNER_WALL_SEGMENTS } from '../../src/siege/content/chencang';
import { applySiegeAction } from '../../src/siege/rules/actions';
import { endDay } from '../../src/siege/rules/day';
import { createSiegeState } from '../../src/siege/rules/state';
import type { SiegeState } from '../../src/siege/rules/types';
import { engine } from './rulesFixtures';

function keepWei(state: SiegeState, ids: string[]) {
  state.units = state.units.filter((u) => u.side === 'shu' || ids.includes(u.id));
}

describe('Wei defender AI', () => {
  it('prepares a millstone before striking a ram on a later day', () => {
    const state = createSiegeState(1);
    keepWei(state, ['wei-haozhao']);
    state.engines = [engine('ram', 8, 8)];
    expect(planDefenderTurn(state)).toContainEqual({
      type: 'hoistMillstone',
      unitId: 'wei-haozhao',
    });
    state.day = 2;
    state.preparations.millstones['8,7'] = { hoisted: true, day: 1 };
    const before = structuredClone(state);
    expect(planDefenderTurn(state)).toContainEqual({
      type: 'dropMillstone',
      unitId: 'wei-haozhao',
      engineId: 'engine',
    });
    expect(runDefenderTurn(state).engines[0]!.durability).toBe(100);
    expect(state).toEqual(before);
    state.preparations.millstones['8,7']!.hoisted = false;
    expect(planDefenderTurn(state).some((a) => a.type === 'dropMillstone')).toBe(false);
  });

  it.each([false, true])(
    'ranks fire targets by priority and the covered penalty (covered=%s)',
    (covered) => {
      const state = createSiegeState(2);
      keepWei(state, ['wei-haozhao', 'wei-captain-1']);
      Object.assign(
        state.units.find((u) => u.id === 'wei-captain-1')!,
        { x: 7, y: 7 },
      );
      state.day = 2;
      state.preparations.braziers['7,7'] = { litDay: 1 };
      state.engines = [
        engine('earthCart', 7, 9, { id: 'cart' }),
        engine('ladder', 7, 10, { id: 'ladder', raisedAt: { x: 7, y: 7 }, covered }),
      ];
      expect(planDefenderTurn(state).filter((a) => a.type === 'fireArrows')[0]).toEqual({
        type: 'fireArrows',
        unitId: 'wei-captain-1',
        engineId: covered ? 'cart' : 'ladder',
      });
    },
  );

  it('sends the nearest free defender above a raised ladder and plans legal actions', () => {
    const state = createSiegeState(3);
    keepWei(state, ['wei-haozhao', 'wei-wangsheng']);
    Object.assign(
      state.units.find((u) => u.id === 'wei-wangsheng')!,
      { x: 6, y: 7 },
    );
    state.units.find((u) => u.id === 'wei-haozhao')!.x = 10;
    state.engines = [engine('ladder', 7, 10, { raisedAt: { x: 7, y: 7 } })];
    const plan = planDefenderTurn(state);
    expect(plan).toContainEqual({
      type: 'move',
      unitId: 'wei-wangsheng',
      x: 7,
      y: 7,
      level: 'wall',
    });
    let draft = state;
    for (const action of plan) {
      const result = applySiegeAction(draft, action);
      expect(result.ok, JSON.stringify(action)).toBe(true);
      if (result.ok) draft = result.state;
    }
    expect(runDefenderTurn(state)).toEqual(draft);
  });

  it('uses nightRepair on an intact gate below half, ahead of holdFast', () => {
    const state = createSiegeState(4);
    state.gates.south.durability = 250;
    state.engines = [engine('ladder', 7, 10, { raisedAt: { x: 7, y: 7 } })];
    expect(planDefenderTurn(state).at(-1)).toEqual({
      type: 'order',
      side: 'wei',
      kind: 'nightRepair',
      target: 'south',
    });
    const defended = runDefenderTurn(state);
    expect(defended.gates.south.durability).toBe(250);
    expect(endDay(defended).gates.south.durability).toBe(350);
  });

  it('holds the most pressed wall run, otherwise rallies the lowest morale', () => {
    const state = createSiegeState(5);
    state.engines = [
      engine('ladder', 7, 10, { id: 'west', raisedAt: { x: 7, y: 7 } }),
      engine('ladder', 9, 10, { id: 'east', raisedAt: { x: 9, y: 7 } }),
    ];
    state.trenchFill['10,8'] = 3;
    expect(planDefenderTurn(state).at(-1)).toMatchObject({
      kind: 'holdFast',
      target: { x: 9, y: 7 },
    });
    state.engines = [];
    state.trenchFill['10,8'] = 0;
    state.units.find((u) => u.id === 'wei-wangsheng')!.morale = 25;
    expect(planDefenderTurn(state).at(-1)).toMatchObject({
      kind: 'rally',
      target: 'wei-wangsheng',
    });
  });

  it('prioritizes wall intruders over climbers, then uses boulders when the wall is clear', () => {
    const state = createSiegeState(6);
    keepWei(state, ['wei-haozhao', 'wei-wangsheng', 'wei-captain-1', 'wei-captain-2']);
    for (const [i, id] of ['wei-captain-1', 'wei-captain-2'].entries())
      Object.assign(
        state.units.find((u) => u.id === id)!,
        COURTYARD[i]!,
        { level: 'ground' },
      );
    Object.assign(
      state.units.find((u) => u.id === 'wei-wangsheng')!,
      { x: 6, y: 7 },
    );
    Object.assign(state.units[1]!, { x: 7, y: 7, level: 'wall' });
    Object.assign(state.units[2]!, { x: 7, y: 10, climbing: true });
    state.engines = [engine('ladder', 7, 10, { raisedAt: { x: 7, y: 7 } })];
    const plan = planDefenderTurn(state);
    expect(plan).toContainEqual({
      type: 'attack',
      unitId: 'wei-haozhao',
      targetId: state.units[1]!.id,
    });
    Object.assign(state.units[1]!, { x: 6, y: 10, level: 'ground' });
    state.units.find((u) => u.id === 'wei-wangsheng')!.x = 7;
    state.day = 2;
    state.preparations.boulders['7,7'] = { day: 1 };
    state.footholds['7,7'] = 1;
    expect(planDefenderTurn(state)).toContainEqual({
      type: 'dropBoulders',
      unitId: 'wei-wangsheng',
      targetId: state.units[2]!.id,
    });
  });

  it('withdraws wounded defenders from a pressed section and brings fresh troops in', () => {
    const state = createSiegeState(7);
    keepWei(state, ['wei-haozhao', 'wei-wangsheng']);
    Object.assign(
      state.units.find((u) => u.id === 'wei-haozhao')!,
      { x: 7, y: 7, troops: 100, wounded: 100 },
    );
    Object.assign(
      state.units.find((u) => u.id === 'wei-wangsheng')!,
      { x: 6, y: 7 },
    );
    state.engines = [engine('ladder', 7, 10, { raisedAt: { x: 7, y: 7 } })];
    Object.assign(state.units[1]!, { x: 7, y: 10, climbing: true });
    const plan = planDefenderTurn(state);
    const retreat = plan.find((a) => a.type === 'move' && a.unitId === 'wei-haozhao');
    expect(retreat).toBeDefined();
    expect(retreat).not.toMatchObject({ x: 7, y: 7, level: 'wall' });
    expect(plan.some((a) => a.type === 'move' && a.unitId === 'wei-wangsheng')).toBe(true);
  });

  it('builds in act 2, choosing the segment facing the most gaps first', () => {
    const state = createSiegeState(8);
    keepWei(state, ['wei-haozhao', 'wei-wangsheng']);
    Object.assign(
      state.units.find((u) => u.id === 'wei-wangsheng')!,
      { x: 10, y: 7 },
    );
    state.act = 2;
    state.engines = [];
    state.day = 4;
    Object.assign(
      state.units.find((u) => u.id === 'wei-haozhao')!,
      { x: 8, y: 6, level: 'ground' },
    );
    state.trenchFill['10,8'] = 3;
    const first = runDefenderTurn(state);
    expect(first.units.find((u) => u.id === 'wei-haozhao')).toMatchObject({
      x: 9,
      y: 6,
      level: 'ground',
    });
    expect(first.innerWall[2]).toBe(1);
    const next = endDay(runDefenderTurn(first));
    expect(next.innerWall[2]).toBe(1); // The builder cannot act twice in one day.
    expect(runDefenderTurn(next).innerWall[2]).toBe(2);
    expect(INNER_WALL_SEGMENTS[2]!.cells.some((c) => c.x === 9)).toBe(true);
  });

  it.each(['gate', 'innerWall'] as const)(
    'falls back to the courtyard when the %s is lost',
    (breach) => {
      const state = createSiegeState(9);
      keepWei(state, ['wei-haozhao']);
      const commander = state.units.find((u) => u.id === 'wei-haozhao')!;
      Object.assign(commander, { x: 8, y: 5, level: 'ground' });
      if (breach === 'gate') state.gates.south.broken = true;
      else {
        state.innerWall[2] = 4;
        Object.assign(state.units[1]!, { x: 9, y: 6, level: 'wall' });
      }
      const result = runDefenderTurn(state);
      const unit = result.units.find((u) => u.id === commander.id)!;
      expect(COURTYARD.some((c) => c.x === unit.x && c.y === unit.y)).toBe(true);
    },
  );

  it('uses the night sortie against an unescorted engine without walking through an occupied gate', () => {
    const state = createSiegeState(10);
    keepWei(state, ['wei-haozhao', 'wei-captain-1']);
    state.engines = [engine('earthCart', 8, 10)];
    state.units.find((u) => u.id === 'wei-haozhao')!.moved = true;
    expect(planDefenderTurn(state).some((a) => a.type === 'order' && a.kind === 'sortie')).toBe(
      false,
    );
    for (const unit of state.units.filter((u) => u.side === 'shu')) unit.y++;
    const plan = planDefenderTurn(state);
    expect(plan).toContainEqual({ type: 'order', side: 'wei', kind: 'sortie', target: 'engine' });
    expect(plan.some((a) => a.type === 'move' && a.level === 'ground' && a.y > 7)).toBe(false);
  });
  it('moves wall archers over active work columns and prepares before firing', () => {
    const state = createSiegeState(12);
    keepWei(state, ['wei-haozhao', 'wei-captain-1']);
    state.engines = [engine('earthCart', 7, 10)];
    const result = runDefenderTurn(state);
    expect(result.units.find((u) => u.id === 'wei-captain-1')).toMatchObject({
      x: 7,
      y: 7,
      level: 'wall',
    });
    expect(result.engines[0]!.durability).toBe(80);
    expect(result.preparations.braziers['7,7']).toEqual({ litDay: 1 });
    result.weatherByDay[2] = 'clear';
    expect(runDefenderTurn(endDay(result)).engines[0]!.durability).toBe(0);
  });

  it('covers an imminent climb and replaces a routed holder', () => {
    const state = createSiegeState(13);
    keepWei(state, ['wei-haozhao', 'wei-wangsheng']);
    state.engines = [engine('ladder', 7, 10)];
    expect(
      runDefenderTurn(state).units.some((u) => u.side === 'wei' && u.x === 7 && u.y === 7),
    ).toBe(true);
    state.engines = [];
    state.trenchFill['7,9'] = 3;
    state.trenchFill['7,8'] = 3;
    Object.assign(
      state.units.find((u) => u.id === 'wei-wangsheng')!,
      { x: 7, y: 6, level: 'ground', morale: 5, routed: true },
    );
    expect(runDefenderTurn(state).units.find((u) => u.id === 'wei-haozhao')).toMatchObject({
      x: 7,
      y: 7,
      level: 'wall',
    });
  });

  it('pursues city intruders before burning engines and keeps two courtyard guards', () => {
    const state = createSiegeState(14);
    const wei = state.units.filter((u) => u.side === 'wei');
    for (const [i, unit] of wei.entries()) Object.assign(unit, { x: 4 + i, y: 2, level: 'wall' });
    Object.assign(wei[0]!, COURTYARD[0]!, { level: 'ground' });
    Object.assign(wei[1]!, COURTYARD[1]!, { level: 'ground' });
    Object.assign(state.units[1]!, { x: 8, y: 5, level: 'ground' });
    Object.assign(wei[3]!, { x: 8, y: 6, level: 'ground', troopType: 'archer' });
    state.engines = [engine('earthCart', 9, 5)];
    const plan = planDefenderTurn(state);
    expect(plan.find((a) => a.type === 'attack')).toMatchObject({
      unitId: wei[3]!.id,
      targetId: state.units[1]!.id,
    });
    expect(
      plan.some((a) => a.type === 'move' && (a.unitId === wei[0]!.id || a.unitId === wei[1]!.id)),
    ).toBe(false);
    let next = endDay(runDefenderTurn(state));
    next.units = next.units.filter((u) => u.side === 'wei');
    next = runDefenderTurn(next);
    expect(
      next.units.filter(
        (u) => COURTYARD.some((c) => c.x === u.x && c.y === u.y) && u.level === 'ground',
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('continues sending two guards to the courtyard after the first intruder disappears', () => {
    const state = createSiegeState(15);
    keepWei(state, ['wei-haozhao', 'wei-wangsheng']);
    for (const [i, unit] of state.units.filter((u) => u.side === 'wei').entries())
      Object.assign(unit, { x: 7 + i, y: 6, level: 'ground' });
    Object.assign(state.units[1]!, { x: 7, y: 7, level: 'wall' });
    state.stats.firstWallDay = 1;
    Object.assign(state.units[1]!, { x: 6, y: 7, level: 'wall' });
    let next = runDefenderTurn(state);
    Object.assign(next.units[1]!, { x: 7, y: 10, level: 'ground' });
    for (let day = 0; day < 4; day++) next = runDefenderTurn(endDay(next));
    const guards = next.units.filter(
      (u) =>
        u.side === 'wei' &&
        u.level === 'ground' &&
        COURTYARD.some((c) => c.x === u.x && c.y === u.y),
    );
    expect(guards).toHaveLength(2);
  });

  it('plans a crowded mid-siege turn in under one second without mutating its input', () => {
    const state = createSiegeState(11);
    state.act = 2;
    state.day = 10;
    state.engines = [5, 7, 9, 11].map((x) =>
      engine('ladder', x, 10, { id: `ladder-${x}`, raisedAt: { x, y: 7 } }),
    );
    state.engines.push(engine('ram', 8, 8, { id: 'ram' }), engine('tower', 9, 10, { id: 'tower' }));
    for (const x of [5, 7, 9, 11]) {
      state.trenchFill[`${x},9`] = 3;
      state.trenchFill[`${x},8`] = 3;
    }
    state.units[1]!.x = 6;
    state.units[1]!.y = 7;
    state.units[1]!.level = 'wall';
    const before = structuredClone(state);
    const started = performance.now();
    const plan = planDefenderTurn(state);
    expect(performance.now() - started).toBeLessThan(1000);
    expect(plan.length).toBeGreaterThan(0);
    expect(state).toEqual(before);
    expect(planDefenderTurn(state)).toEqual(plan);
  });
});

it('chooses sortie, torches, repair, hold fast, then rally in cascade order', () => {
  const state = createSiegeState(228);
  state.units
    .filter((u) => u.side === 'wei' && u.id !== 'wei-haozhao')
    .forEach((u) => {
      u.acted = true;
    });
  state.engines = [
    engine('ram', 8, 10, { id: 'sortie-target' }),
    engine('ladder', 6, 10, { id: 'other' }),
  ];
  // Keep the order issuer on the tower: new ramp routes can otherwise move him away.
  state.units.find((u) => u.id === 'wei-haozhao')!.moved = true;
  state.units
    .filter((u) => u.side === 'shu')
    .forEach((u) => {
      u.y++;
    });
  state.gates.south.durability = 100;
  expect(planDefenderTurn(state).at(-1)).toMatchObject({ kind: 'sortie', target: 'sortie-target' });
  state.day = 3;
  state.engines.forEach((e) => {
    e.covered = true;
  });
  expect(planDefenderTurn(state).at(-1)).toMatchObject({ kind: 'torches' });
  state.engines = state.engines.slice(0, 1);
  expect(planDefenderTurn(state).at(-1)).toMatchObject({ kind: 'nightRepair' });
  state.gates.south.durability = 600;
  state.engines = [engine('ladder', 6, 10, { raisedAt: { x: 6, y: 7 }, covered: true })];
  expect(planDefenderTurn(state).at(-1)).toMatchObject({ kind: 'holdFast' });
  state.engines = [];
  expect(planDefenderTurn(state).at(-1)).toMatchObject({ kind: 'rally' });
});

it('skips a routed climber when selecting a boulder target', () => {
  const state = createSiegeState(228);
  state.day = 2;
  state.engines = [engine('ladder', 7, 10, { raisedAt: { x: 7, y: 7 } })];
  Object.assign(state.units[1]!, { x: 7, y: 10, routed: true, morale: 5 });
  Object.assign(
    state.units.find((u) => u.id === 'wei-haozhao')!,
    { x: 7, y: 7 },
  );
  state.preparations.boulders['7,7'] = { day: 1 };
  state.footholds['7,7'] = 1;
  const actions = planDefenderTurn(state);
  expect(actions.some((a) => a.type === 'dropBoulders')).toBe(false);
});

it('waits two nights after wasted torches, falls through the cascade, and ignores pending enemy orders', () => {
  const state = createSiegeState(228);
  state.day = 5;
  state.engines.forEach((e) => {
    e.covered = true;
  });
  state.log.push({ day: 4, code: 'torches', params: { assault: false } });
  state.gates.south.durability = 100;
  for (const day of [5, 6]) {
    state.day = day;
    expect(planDefenderTurn(state).at(-1)).toMatchObject({ kind: 'nightRepair' });
    const hidden = structuredClone(state);
    hidden.nightOrders.shu = { kind: 'nightAssault' };
    expect(planDefenderTurn(hidden)).toEqual(planDefenderTurn(state));
  }
  state.gates.south.durability = 600;
  expect(planDefenderTurn(state).at(-1)).toMatchObject({ kind: 'holdFast' });
  state.day = 7;
  expect(planDefenderTurn(state).at(-1)).toMatchObject({ kind: 'torches' });
  state.day = 5;
  state.log[0]!.params.assault = true;
  expect(planDefenderTurn(state).at(-1)).toMatchObject({ kind: 'torches' });
});
