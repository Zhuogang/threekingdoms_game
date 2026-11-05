import { deployUnit } from '../../src/siege/ui/commands';
import { createSiegeState } from '../../src/siege/rules/state';
import { describe, expect, it } from 'vitest';
import {
  CHENCANG_ART_LAYOUT,
  CHENCANG_LAYOUT,
  RAMPS,
  cellKey,
} from '../../src/siege/content/chencang';
import {
  COL_SPANS,
  ROW_SPANS,
  fineCellsOf,
  fineSpanOf,
  ROAD_COL,
} from '../../src/siege/content/coarseGrid';
import { cellHeight } from '../../src/siege/rules/map';
import { groundPassable, isWalkway, pathTo, reachableCells } from '../../src/siege/rules/movement';
import { act, refused, isolatedUnit, southWall, southInside, ground } from './rulesFixtures';

describe('coarse board contract', () => {
  it('covers each fine coordinate exactly once in order', () => {
    for (const [spans, length] of [
      [COL_SPANS, 48],
      [ROW_SPANS, 32],
    ] as const)
      expect(
        spans.flatMap(([lo, hi]) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)),
      ).toEqual(Array.from({ length }, (_, i) => i));
    expect(fineSpanOf({ x: 6, y: 10 })).toEqual({ west: 17, east: 19, north: 19, south: 21 });
    expect(fineCellsOf({ x: 6, y: 10 })).toHaveLength(9);
    expect(() => fineSpanOf({ x: 17, y: 0 })).toThrow(RangeError);
  });
  it('preserves the supplied rows and sits on wall/gate and trench/bridge art', () => {
    expect(CHENCANG_LAYOUT.map((r) => r.length)).toEqual(Array(14).fill(17));
    const mixed: string[] = [];
    for (const [y, row] of CHENCANG_LAYOUT.entries())
      for (const [x, symbol] of [...row].entries()) {
        if (!'WOG-='.includes(symbol)) continue;
        const art = fineCellsOf({ x, y }).map((c) => CHENCANG_ART_LAYOUT[c.y]![c.x]!);
        expect(art).toContain(symbol);
        if (art.some((s) => s !== symbol)) {
          mixed.push(cellKey({ x, y }));
          // Side gates/bridges span fine rows 9–11: W/G/W and -/=/- in the supplied brief.
          expect(y).toBe(5);
          expect([3, 4, 12, 13]).toContain(x);
          expect(new Set(art)).toEqual(new Set(symbol === 'G' ? ['W', 'G'] : ['-', '=']));
        } else expect(art.every((s) => s === symbol)).toBe(true);
      }
    expect(mixed).toEqual(['3,5', '4,5', '12,5', '13,5']);
  });
  it.each(RAMPS)('$id connects passable height-two ground to its adjacent walkway', (ramp) => {
    const { state, unit } = isolatedUnit('wei', ground(ramp.ground));
    expect(RAMPS).toHaveLength(8);
    expect(groundPassable(state, 'wei', ramp.ground)).toBe(true);
    expect(isWalkway(state, ramp.wall)).toBe(true);
    expect(Math.abs(ramp.ground.x - ramp.wall.x) + Math.abs(ramp.ground.y - ramp.wall.y)).toBe(1);
    expect(cellHeight(state, ramp.ground.x, ramp.ground.y, 'ground')).toBe(2);
    expect(pathTo(state, unit.id, ramp.wall.x, ramp.wall.y, 'wall')).toHaveLength(2);
  });
  it.each(['shu', 'wei'] as const)(
    'blocks a %s move onto the other level of an occupied gate',
    (side) => {
      const { state, unit } = isolatedUnit(side, southWall(ROAD_COL - 1));
      state.units.push({
        ...unit,
        id: 'passage-occupant',
        ...southWall(ROAD_COL),
        level: 'ground',
      });
      expect(reachableCells(state, unit.id).some((p) => p.x === ROAD_COL && p.y === unit.y)).toBe(
        false,
      );
      refused(state, { type: 'move', unitId: unit.id, ...southWall(ROAD_COL) });
      state.units[1]!.side = side === 'shu' ? 'wei' : 'shu';
      expect(pathTo(state, unit.id, ROAD_COL + 1, unit.y, 'wall')).toBeNull();
      state.units[1]!.troops = 0;
      expect(pathTo(state, unit.id, ROAD_COL, unit.y, 'wall')).toHaveLength(2);
    },
  );
  it.each(['shu', 'wei'] as const)(
    'blocks a %s passage move when the gate top is occupied',
    (side) => {
      const { state, unit } = isolatedUnit(side, ground({ x: ROAD_COL, y: 8 }));
      state.gates.south.broken = true;
      state.units.push({ ...unit, id: 'tower-occupant', ...southWall(ROAD_COL) });
      refused(state, { type: 'move', unitId: unit.id, ...ground(southWall(ROAD_COL)) });
      expect(pathTo(state, unit.id, ROAD_COL, 6, 'ground')).toHaveLength(3);
      state.units[1]!.side = side === 'shu' ? 'wei' : 'shu';
      expect(pathTo(state, unit.id, ROAD_COL, 6, 'ground')).toBeNull();
      state.units[1]!.troops = 0;
      expect(pathTo(state, unit.id, ROAD_COL, 6, 'ground')).toHaveLength(3);
    },
  );
  it.each(['ladder', 'ram', 'earthCart', 'tower'] as const)(
    'deployment shares an engine cell only with a usable ladder (%s)',
    (kind) => {
      const state = createSiegeState(42),
        unit = state.units[1]!,
        engine = state.engines[0]!;
      engine.kind = kind;
      const destination = ground(engine);
      const placed = deployUnit(state, unit.id, destination);
      if (kind === 'ladder') {
        expect(placed.units[1]).toMatchObject(destination);
        expect(placed.engines[0]).toMatchObject({ x: destination.x, y: destination.y });
        engine.wrecked = true;
        expect(deployUnit(state, unit.id, destination)).toBe(state);
      } else expect(placed).toBe(state);
      expect(unit).toMatchObject({ x: 7, y: 11 });
    },
  );
  it('steps down and opens an unbroken south gate from inside within two ordinary days', () => {
    const { state, unit } = isolatedUnit('shu', southWall(6));
    state.units.push({ ...unit, id: 'reserve', side: 'wei', x: 4, y: 2, level: 'wall' });
    expect(pathTo(state, unit.id, 7, 6, 'ground')).toEqual([
      southWall(6),
      southWall(7),
      southInside(7),
    ]);
    let next = act(state, { type: 'move', unitId: unit.id, ...southInside(7) });
    expect(next.units[0]).toMatchObject({ ...southInside(7), moved: true, acted: false });
    next = act(next, { type: 'endDay' });
    next = act(next, { type: 'move', unitId: unit.id, ...southInside() });
    next = act(next, { type: 'openGate', unitId: unit.id, gateId: 'south' });
    expect(next.day).toBe(2);
    expect(next.gates.south).toMatchObject({ opened: true, broken: true, durability: 0 });
    expect(next.units[0]).toMatchObject({ moved: true, acted: true });
  });
});
