import { describe, expect, it } from 'vitest';
import { DEPLOY_SHU, DEPLOY_WEI } from '../../src/siege/content/chencang';
import { createSiegeState } from '../../src/siege/rules/state';
import { resolveMapClick, mapClickColor, type MapClickContext } from '../../src/siege/ui/mapClick';
import { deployUnit } from '../../src/siege/ui/commands';
import { engine } from './rulesFixtures';

const ground = (x: number, y: number) => ({ x, y, level: 'ground' as const });
function fixture() {
  const state = createSiegeState(228);
  const own = state.units.find((u) => u.id === 'shu-weiyan')!;
  const enemy = state.units.find((u) => u.side === 'wei')!;
  Object.assign(own, ground(18, 20));
  Object.assign(enemy, ground(19, 20));
  state.units = [own, enemy];
  state.engines = [];
  return { state, own, enemy };
}

describe('R cell click priority, first match wins', () => {
  it.each(['modal', 'replay', 'opening'])('ignores %s and null picks', () => {
    const { state, own } = fixture();
    expect(resolveMapClick({ state, blocked: true }, own)).toEqual({ type: 'none' });
    expect(resolveMapClick({ state }, null)).toEqual({ type: 'none' });
  });
  it.each(['shu', 'wei'] as const)(
    'keeps %s deployment selection, swap, empty-cell deployment and outside feedback',
    (playerSide) => {
      const state = createSiegeState(228);
      const units = state.units.filter((u) => u.side === playerSide);
      const [first, other] = units;
      const ctx: MapClickContext = { state, deploy: true, playerSide, selected: first!.id };
      expect(resolveMapClick({ ...ctx, selected: null }, first!)).toEqual({
        type: 'select',
        id: first!.id,
      });
      expect(resolveMapClick(ctx, other!)).toEqual({ type: 'deploy', cell: other! });
      const swapped = deployUnit(state, first!.id, other!, playerSide);
      expect(swapped.units.find((u) => u.id === first!.id)).toMatchObject({
        x: other!.x,
        y: other!.y,
      });
      expect(swapped.units.find((u) => u.id === other!.id)).toMatchObject({
        x: first!.x,
        y: first!.y,
      });
      const cells = playerSide === 'shu' ? DEPLOY_SHU : DEPLOY_WEI;
      const empty = cells.find(
        (c) => !units.some((u) => u.x === c.x && u.y === c.y && u.level === c.level),
      )!;
      expect(resolveMapClick(ctx, empty)).toEqual({ type: 'deploy', cell: empty });
      expect(resolveMapClick(ctx, ground(0, 0))).toEqual({ type: 'cell', cell: ground(0, 0) });
      expect(
        resolveMapClick(ctx, state.engines[0]! && ground(state.engines[0]!.x, state.engines[0]!.y)),
      ).toEqual({ type: 'select', id: state.engines[0]!.id });
    },
  );
  it('targets an enemy or gate in attack mode before green; enemies require an own actor', () => {
    const { state, own, enemy } = fixture();
    const ctx: MapClickContext = { state, selected: own.id, mode: 'attack', reachable: [enemy] };
    expect(resolveMapClick(ctx, enemy)).toEqual({ type: 'target', id: enemy.id });
    expect(resolveMapClick(ctx, { x: 23, y: 16, level: 'wall' })).toEqual({
      type: 'target',
      id: 'south',
    });
    expect(resolveMapClick({ ...ctx, selected: null }, enemy)).toEqual({
      type: 'select',
      id: enemy.id,
    });
  });
  it.each(['move', 'fillTrench'] as const)(
    'explicit %s on green precedes units and ladders',
    (mode) => {
      const { state, own, enemy } = fixture();
      state.engines = [engine('ladder', 18, 19)];
      for (const cell of [enemy, ground(18, 19), own])
        expect(resolveMapClick({ state, selected: own.id, mode, reachable: [cell] }, cell)).toEqual(
          { type: mode, cell },
        );
      expect(resolveMapClick({ state, selected: own.id, mode }, enemy)).toEqual({
        type: 'target',
        id: enemy.id,
      });
    },
  );
  it('targets enemies with own units or engines selected; otherwise selects enemies', () => {
    const { state, own, enemy } = fixture();
    state.engines = [engine('ram', 22, 20)];
    for (const selected of [own.id, 'engine'])
      expect(resolveMapClick({ state, selected }, enemy)).toEqual({ type: 'target', id: enemy.id });
    for (const selected of [null, enemy.id, 'missing'])
      expect(resolveMapClick({ state, selected }, enemy)).toEqual({ type: 'select', id: enemy.id });
  });
  it('selects own units before green and double-clicking never moves', () => {
    const { state, own } = fixture();
    const before = structuredClone(state);
    const first = resolveMapClick({ state, reachable: [own] }, own);
    expect(first).toEqual({ type: 'select', id: own.id });
    expect(resolveMapClick({ state, selected: own.id, reachable: [own] }, own)).toEqual({
      type: 'none',
    });
    expect(state).toEqual(before);
  });
  it('cycles unit → ladder → unit, including double-clicks, without moving', () => {
    const { state, own } = fixture();
    state.engines = [engine('ladder', own.x, own.y)];
    let selected: string | null = null;
    for (const id of [own.id, 'engine', own.id, 'engine']) {
      const result = resolveMapClick({ state, selected, reachable: [own] }, own);
      expect(result).toEqual({ type: 'select', id });
      selected = id;
    }
  });
  it('does not cycle a selected unit to a cart whose rear is merely drawn over its cell', () => {
    const { state, own } = fixture();
    state.engines = [engine('earthCart', 18, 19)];
    expect(resolveMapClick({ state, selected: own.id }, own)).toEqual({ type: 'none' });
    expect(resolveMapClick({ state, selected: null }, ground(18, 19))).toEqual({
      type: 'select',
      id: state.engines[0]!.id,
    });
  });
  it('selects unraised ladders on their green logical cell, moves on other green cells', () => {
    const { state, own } = fixture();
    state.engines = [engine('ladder', 18, 19)];
    const ctx = { state, selected: own.id, reachable: [ground(18, 19), ground(18, 21)] };
    expect(resolveMapClick(ctx, ground(18, 19))).toEqual({ type: 'select', id: 'engine' });
    expect(resolveMapClick(ctx, ground(18, 21))).toEqual({ type: 'move', cell: ground(18, 21) });
    state.engines[0]!.raisedAt = { x: 18, y: 16 };
    expect(resolveMapClick(ctx, ground(18, 19))).toEqual({ type: 'move', cell: ground(18, 19) });
  });
  it('selects the frontmost engine, cycles all engines, then wraps; a lone selected engine does nothing', () => {
    const { state } = fixture();
    state.engines = [
      engine('earthCart', 21, 21, { id: 'rear' }),
      engine('earthCart', 21, 21, { id: 'front' }),
    ];
    const cell = ground(21, 21);
    for (const [selected, id] of [
      [null, 'front'],
      ['front', 'rear'],
      ['rear', 'front'],
    ])
      expect(resolveMapClick({ state, selected }, cell)).toEqual({ type: 'select', id });
    state.engines.pop();
    expect(resolveMapClick({ state, selected: 'rear' }, cell)).toEqual({ type: 'none' });
  });
  it('a ladder-base unit occupies the entire raised footprint before its ladder', () => {
    const { state, own } = fixture();
    Object.assign(own, ground(18, 19));
    state.engines = [engine('ladder', 18, 19, { raisedAt: { x: 18, y: 16 } })];
    for (const y of [17, 18, 19, 20]) {
      const cell = ground(18, y);
      expect(resolveMapClick({ state }, cell)).toEqual({ type: 'select', id: own.id });
      expect(resolveMapClick({ state, selected: own.id }, cell)).toEqual({
        type: 'select',
        id: 'engine',
      });
      expect(resolveMapClick({ state, selected: 'engine' }, cell)).toEqual({
        type: 'select',
        id: own.id,
      });
    }
    own.routed = true;
    expect(resolveMapClick({ state }, ground(18, 18))).toEqual({ type: 'select', id: own.id });
    own.troops = 0;
    expect(resolveMapClick({ state }, ground(18, 18))).toEqual({ type: 'select', id: 'engine' });
  });
  it('cycles a standing unit, an aliased ladder-base unit and the engine in occupant order', () => {
    const { state, own } = fixture();
    Object.assign(own, ground(18, 19));
    const standing = { ...own, id: 'standing', y: 20 };
    state.units.push(standing);
    state.engines = [engine('ladder', 18, 19, { raisedAt: { x: 18, y: 16 } })];
    for (const [selected, id] of [
      [null, 'standing'],
      ['standing', own.id],
      [own.id, 'engine'],
      ['engine', 'standing'],
    ])
      expect(resolveMapClick({ state, selected }, ground(18, 20))).toEqual({ type: 'select', id });
  });
  it('footprints respect level; terrain falls through and hints use the same result', () => {
    const { state, own, enemy } = fixture();
    state.engines = [engine('tower', 23, 20)];
    expect(resolveMapClick({ state }, ground(24, 21))).toEqual({ type: 'select', id: 'engine' });
    const cell = { x: 24, y: 21, level: 'wall' as const };
    expect(resolveMapClick({ state }, cell)).toEqual({ type: 'cell', cell });
    expect(mapClickColor(resolveMapClick({ state }, own))).toBe('#e7b84e');
    expect(mapClickColor(resolveMapClick({ state, selected: own.id }, enemy))).toBe('#b74e3c');
    expect(
      mapClickColor(
        resolveMapClick({ state, selected: own.id, reachable: [ground(18, 21)] }, ground(18, 21)),
      ),
    ).toBe('#609d80');
    expect(mapClickColor({ type: 'none' })).toBeNull();
    expect(mapClickColor({ type: 'cell', cell })).toBeNull();
  });
  it('selects living figures over empty cells, targets enemies with an own actor, and never moves on a second click', () => {
    const { state, own, enemy } = fixture();
    const cell = ground(18, 21);
    const before = structuredClone(state);
    expect(resolveMapClick({ state, unitAtPoint: own.id }, cell)).toEqual({
      type: 'select',
      id: own.id,
    });
    expect(resolveMapClick({ state, unitAtPoint: own.id, selected: own.id }, cell)).toEqual({
      type: 'none',
    });
    state.engines = [engine('ram', 22, 20)];
    for (const selected of [own.id, 'engine']) {
      const result = resolveMapClick({ state, selected, unitAtPoint: enemy.id }, cell);
      expect(result).toEqual({ type: 'target', id: enemy.id });
      expect(mapClickColor(result)).toBe('#b74e3c');
    }
    for (const selected of [null, enemy.id, 'missing'])
      expect(resolveMapClick({ state, selected, unitAtPoint: enemy.id }, cell)).toEqual({
        type: 'select',
        id: enemy.id,
      });
    expect(mapClickColor(resolveMapClick({ state, unitAtPoint: own.id }, cell))).toBe('#e7b84e');
    state.engines = [];
    expect(state).toEqual(before);
    own.troops = 0;
    expect(resolveMapClick({ state, unitAtPoint: own.id }, cell)).toEqual({ type: 'cell', cell });
    expect(resolveMapClick({ state, unitAtPoint: 'missing' }, cell)).toEqual({
      type: 'cell',
      cell,
    });
  });
  it('figure fallback handles null terrain picks and yields to blocking, deployment, green cells and every cell occupant', () => {
    const { state, own, enemy } = fixture();
    const cell = ground(18, 21);
    const ctx: MapClickContext = { state, selected: own.id, unitAtPoint: enemy.id };
    expect(resolveMapClick({ ...ctx, blocked: true }, cell)).toEqual({ type: 'none' });
    expect(resolveMapClick(ctx, null)).toEqual({ type: 'target', id: enemy.id });
    expect(resolveMapClick({ ...ctx, unitAtPoint: null }, null)).toEqual({ type: 'none' });
    expect(resolveMapClick({ ...ctx, deploy: true }, ground(0, 0))).toEqual({
      type: 'cell',
      cell: ground(0, 0),
    });
    for (const mode of [null, 'move', 'fillTrench'] as const)
      expect(resolveMapClick({ ...ctx, mode, reachable: [cell] }, cell)).toEqual({
        type: mode ?? 'move',
        cell,
      });
    expect(resolveMapClick({ ...ctx, unitAtPoint: enemy.id }, own)).toEqual({ type: 'none' });
    expect(resolveMapClick({ ...ctx, selected: null }, own)).toEqual({
      type: 'select',
      id: own.id,
    });
    expect(resolveMapClick({ ...ctx, unitAtPoint: own.id }, enemy)).toEqual({
      type: 'target',
      id: enemy.id,
    });
    state.engines = [engine('ladder', cell.x, cell.y)];
    expect(resolveMapClick(ctx, cell)).toEqual({ type: 'select', id: 'engine' });
    expect(resolveMapClick({ ...ctx, reachable: [cell] }, cell)).toEqual({
      type: 'select',
      id: 'engine',
    });
    expect(resolveMapClick({ ...ctx, selected: 'engine' }, cell)).toEqual({ type: 'none' });
    Object.assign(own, { x: cell.x, y: cell.y });
    expect(resolveMapClick({ ...ctx, selected: null }, ground(cell.x, cell.y + 1))).toEqual({
      type: 'select',
      id: own.id,
    });
  });
  it('figure targeting follows the player side', () => {
    const { state, own, enemy } = fixture();
    const cell = ground(18, 21);
    expect(
      resolveMapClick({ state, playerSide: 'wei', selected: enemy.id, unitAtPoint: own.id }, cell),
    ).toEqual({ type: 'target', id: own.id });
    expect(resolveMapClick({ state, playerSide: 'wei', unitAtPoint: enemy.id }, cell)).toEqual({
      type: 'select',
      id: enemy.id,
    });
  });
});

it('Move swaps a reachable fresh ally before the ordinary move/selection rows', () => {
  const state = createSiegeState(228);
  const own = state.units.find((u) => u.id === 'shu-weiyan')!;
  const ally = state.units.find((u) => u.id === 'shu-wangping')!;
  Object.assign(own, { x: 18, y: 16, level: 'wall' });
  Object.assign(ally, { x: 20, y: 16, level: 'wall' });
  state.units = [own, ally];
  state.engines = [];
  const context = { state, selected: own.id, mode: 'move' as const };
  expect(resolveMapClick(context, ally)).toEqual({ type: 'swap', id: ally.id });
  expect(mapClickColor(resolveMapClick(context, ally))).toBe('#518bc4');
  expect(resolveMapClick({ ...context, mode: null }, ally)).toEqual({
    type: 'select',
    id: ally.id,
  });
  ally.moved = true;
  expect(resolveMapClick(context, ally)).toEqual({ type: 'select', id: ally.id });
});
