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
  Object.assign(own, ground(6, 10));
  Object.assign(enemy, ground(7, 10));
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
      if (playerSide === 'shu')
        expect(resolveMapClick(ctx, ground(6, 10))).toEqual({
          type: 'deploy',
          cell: ground(6, 10),
        });
      else
        expect(resolveMapClick(ctx, ground(6, 10))).toEqual({
          type: 'select',
          id: state.engines[0]!.id,
        });
    },
  );
  it('targets an enemy or gate in attack mode before green; enemies require an own actor', () => {
    const { state, own, enemy } = fixture();
    const ctx: MapClickContext = { state, selected: own.id, mode: 'attack', reachable: [enemy] };
    expect(resolveMapClick(ctx, enemy)).toEqual({ type: 'target', id: enemy.id });
    expect(resolveMapClick(ctx, { x: 8, y: 7, level: 'wall' })).toEqual({
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
      state.engines = [engine('ladder', 6, 8)];
      for (const cell of [enemy, ground(6, 8), own])
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
    state.engines = [engine('ram', 9, 10)];
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
    state.engines = [engine('earthCart', 6, 8)];
    expect(resolveMapClick({ state, selected: own.id }, own)).toEqual({ type: 'none' });
    expect(resolveMapClick({ state, selected: null }, ground(6, 8))).toEqual({
      type: 'select',
      id: state.engines[0]!.id,
    });
  });
  it('selects unraised ladders on their green logical cell, moves on other green cells', () => {
    const { state, own } = fixture();
    state.engines = [engine('ladder', 6, 8)];
    const ctx = { state, selected: own.id, reachable: [ground(6, 8), ground(6, 9)] };
    expect(resolveMapClick(ctx, ground(6, 8))).toEqual({ type: 'select', id: 'engine' });
    expect(resolveMapClick(ctx, ground(6, 9))).toEqual({ type: 'move', cell: ground(6, 9) });
    state.engines[0]!.raisedAt = { x: 6, y: 7 };
    expect(resolveMapClick(ctx, ground(6, 8))).toEqual({ type: 'move', cell: ground(6, 8) });
  });
  it('selects the frontmost engine, cycles all engines, then wraps; a lone selected engine does nothing', () => {
    const { state } = fixture();
    state.engines = [
      engine('earthCart', 9, 11, { id: 'rear' }),
      engine('earthCart', 9, 11, { id: 'front' }),
    ];
    const cell = ground(9, 11);
    for (const [selected, id] of [
      [null, 'front'],
      ['front', 'rear'],
      ['rear', 'front'],
    ])
      expect(resolveMapClick({ state, selected }, cell)).toEqual({ type: 'select', id });
    state.engines.pop();
    expect(resolveMapClick({ state, selected: 'rear' }, cell)).toEqual({ type: 'none' });
  });
  it('raised ladders expose exactly the base and wall top; the two cells retain their own occupants', () => {
    const { state, own, enemy } = fixture();
    Object.assign(own, ground(6, 8));
    Object.assign(enemy, { x: 6, y: 7, level: 'wall' });
    state.engines = [engine('ladder', 6, 8, { raisedAt: { x: 6, y: 7 } })];
    expect(resolveMapClick({ state }, own)).toEqual({ type: 'select', id: own.id });
    expect(resolveMapClick({ state, selected: own.id }, own)).toEqual({
      type: 'select',
      id: 'engine',
    });
    expect(resolveMapClick({ state, selected: 'engine' }, own)).toEqual({
      type: 'select',
      id: own.id,
    });
    expect(resolveMapClick({ state }, enemy)).toEqual({ type: 'select', id: enemy.id });
    expect(resolveMapClick({ state }, ground(6, 9))).toEqual({ type: 'cell', cell: ground(6, 9) });
  });
  it('an empty raised ladder top selects its engine and never aliases the base unit', () => {
    const { state, own } = fixture();
    Object.assign(own, ground(6, 8));
    state.engines = [engine('ladder', 6, 8, { raisedAt: { x: 6, y: 7 } })];
    expect(resolveMapClick({ state }, { x: 6, y: 7, level: 'wall' })).toEqual({
      type: 'select',
      id: 'engine',
    });
  });
  it('a raised ladder is clickable at its row-ten base and cycles with its operating unit', () => {
    const { state, own } = fixture();
    Object.assign(own, ground(6, 10));
    state.engines = [engine('ladder', 6, 10, { raisedAt: { x: 6, y: 7 } })];
    expect(resolveMapClick({ state }, ground(6, 8))).toEqual({ type: 'cell', cell: ground(6, 8) });
    const empty = { ...state, units: [] };
    expect(resolveMapClick({ state: empty }, ground(6, 10))).toEqual({
      type: 'select',
      id: 'engine',
    });
    expect(resolveMapClick({ state, selected: own.id }, own)).toEqual({
      type: 'select',
      id: 'engine',
    });
    expect(resolveMapClick({ state, selected: 'engine' }, own)).toEqual({
      type: 'select',
      id: own.id,
    });
    expect(resolveMapClick({ state }, ground(6, 9))).toEqual({ type: 'cell', cell: ground(6, 9) });
  });
  it('footprints respect level; terrain falls through and hints use the same result', () => {
    const { state, own, enemy } = fixture();
    state.engines = [engine('tower', 8, 10)];
    expect(resolveMapClick({ state }, ground(8, 10))).toEqual({ type: 'select', id: 'engine' });
    const cell = { x: 24, y: 21, level: 'wall' as const };
    expect(resolveMapClick({ state }, cell)).toEqual({ type: 'cell', cell });
    expect(mapClickColor(resolveMapClick({ state }, own))).toBe('#e7b84e');
    expect(mapClickColor(resolveMapClick({ state, selected: own.id }, enemy))).toBe('#b74e3c');
    expect(
      mapClickColor(
        resolveMapClick({ state, selected: own.id, reachable: [ground(6, 9)] }, ground(6, 9)),
      ),
    ).toBe('#609d80');
    expect(mapClickColor({ type: 'none' })).toBeNull();
    expect(mapClickColor({ type: 'cell', cell })).toBeNull();
  });
  it('plates resolve their owner cell; enemy plates forecast when an own actor is selected', () => {
    const { state, own, enemy } = fixture();
    const cell = ground(6, 9);
    for (const unit of [own, enemy])
      for (const selected of [null, own.id, enemy.id])
        expect(resolveMapClick({ state, selected, pickedUnitId: unit.id }, cell)).toEqual({
          type: unit === enemy && selected === own.id ? 'target' : 'select',
          id: unit.id,
        });
    expect(resolveMapClick({ state, pickedUnitId: own.id }, null)).toEqual({
      type: 'select',
      id: own.id,
    });
    expect(resolveMapClick({ state, blocked: true, pickedUnitId: own.id }, cell)).toEqual({
      type: 'none',
    });
    own.troops = 0;
    expect(resolveMapClick({ state, pickedUnitId: own.id }, cell)).toEqual({ type: 'cell', cell });
    expect(resolveMapClick({ state, pickedUnitId: 'missing' }, null)).toEqual({ type: 'none' });
  });
  it.each(['move', 'fillTrench', 'attack'] as const)(
    'armed %s treats a plate as its owner cell',
    (mode) => {
      const { state, own, enemy } = fixture(),
        under = ground(6, 9);
      expect(
        resolveMapClick({ state, selected: own.id, mode, pickedUnitId: enemy.id }, under),
      ).toEqual({ type: 'target', id: enemy.id });
      if (mode !== 'attack')
        expect(
          resolveMapClick(
            { state, selected: own.id, mode, reachable: [enemy], pickedUnitId: enemy.id },
            under,
          ),
        ).toEqual({ type: mode, cell: { x: enemy.x, y: enemy.y, level: enemy.level } });
    },
  );
  it('armed plate targeting follows the player side', () => {
    const { state, own, enemy } = fixture();
    expect(
      resolveMapClick(
        { state, playerSide: 'wei', selected: enemy.id, mode: 'attack', pickedUnitId: own.id },
        ground(6, 9),
      ),
    ).toEqual({ type: 'target', id: own.id });
  });
});

it('Move swaps a reachable fresh ally before the ordinary move/selection rows', () => {
  const state = createSiegeState(228);
  const own = state.units.find((u) => u.id === 'shu-weiyan')!;
  const ally = state.units.find((u) => u.id === 'shu-wangping')!;
  Object.assign(own, { x: 6, y: 7, level: 'wall' });
  Object.assign(ally, { x: 7, y: 7, level: 'wall' });
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
