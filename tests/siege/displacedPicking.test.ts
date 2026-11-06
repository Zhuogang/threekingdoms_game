import { describe, expect, it } from 'vitest';
import {
  centre,
  layoutNameplates,
  contains,
  planeRect,
  positionAt,
} from '../../src/siege/render/boardGeometry';
import { pickFigureArt, pickMapHit } from '../../src/siege/render/picking';
import { engineSprite, unitVisual } from '../../src/siege/render/stateArt';
import { stormingSprite } from '../../src/siege/render/v02Art';
import { resolveMapClick, type MapClickContext } from '../../src/siege/ui/mapClick';
import { createSiegeState } from '../../src/siege/rules/state';
import { playScriptDays } from '../../src/siege/ui/devPlaythrough';
import { engineReachable } from '../../src/siege/rules/movement';
import { usableEngine } from '../../src/siege/rules/combat';
import { compareDepth } from '../../src/siege/render/scene';
import { actorTargets } from '../../src/siege/ui/commands';
import { targetIconRects } from '../../src/siege/render/TargetIcons';
import type { SiegePosition } from '../../src/siege/rules/types';

function fixture() {
  const state = createSiegeState(228),
    unit = state.units[1]!,
    other = state.units[2]!;
  Object.assign(unit, { x: 10, y: 10 });
  Object.assign(other, { x: 9, y: 7, level: 'wall' });
  state.units = [unit, other];
  state.engines = [{ ...state.engines[1]!, raisedAt: { x: 10, y: 7 } }];
  state.footholds['10,7'] = 2;
  const visual = unitVisual(state, unit);
  const units = [{ unit, visual }],
    engines = state.engines.map((e) => engineSprite(e));
  const pick = (
    context: Partial<MapClickContext>,
    point = centre(visual.figureRects[1]!),
    cell = positionAt(state, ...point),
  ) => pickFigureArt({ state, ...context }, { x: point[0], y: point[1] }, cell, units, engines);
  return { state, unit, other, visual, units, engines, pick };
}

describe('figure and ladder picking before the cell fallback', () => {
  it('selects each climbing figure directly, with or without another selected unit', () => {
    const { state, unit, other, visual, pick } = fixture();
    for (const rect of visual.figureRects)
      for (const selected of [null, other.id]) {
        const point = centre(rect),
          cell = positionAt(state, ...point),
          picked = pick({ selected }, point);
        expect(picked).toEqual({ pickedUnitId: unit.id });
        expect(resolveMapClick({ state, selected, ...picked }, cell)).toEqual({
          type: 'select',
          id: unit.id,
        });
      }
  });
  it('uses frontmost depth, breaking ties in paint order, before considering ladder bodies', () => {
    const { state, unit, visual, units, engines } = fixture(),
      point = centre(visual.figureRects[0]!);
    const front = {
      unit: { ...unit, id: 'front' },
      visual: { ...visual, depth: { ...visual.depth, row: visual.depth.row + 1 } },
    };
    const ctx = { state };
    const pick = () =>
      pickFigureArt(
        ctx,
        { x: point[0], y: point[1] },
        positionAt(state, ...point),
        [front, ...units],
        engines,
      );
    expect(pick()).toEqual({ pickedUnitId: 'front' });
    front.visual.depth = visual.depth;
    expect(pick()).toEqual({ pickedUnitId: unit.id });
    unit.troops = 0;
    expect(pick()).toEqual({ pickedUnitId: 'front' });
  });
  it('(a) an occupant figure beats overlapping displaced art, but its whole walkway does not', () => {
    const { state, other, visual, units, engines, unit } = fixture();
    Object.assign(other, { x: 10, y: 7, side: 'wei' });
    const upper = centre(visual.figureRects[1]!),
      cell = positionAt(state, ...upper)!;
    expect(cell).toEqual({ x: 10, y: 7, level: 'wall' });
    const occupant = { unit: other, visual: unitVisual(state, other) };
    units.push(occupant);
    const pick = (p: [number, number]) =>
      pickFigureArt({ state }, { x: p[0], y: p[1] }, cell, units, engines);
    // The real upper climber's centre is on the walkway, outside the enemy's boxes.
    expect(contains(planeRect(other), ...upper)).toBe(true);
    expect(occupant.visual.figureRects.some((r) => contains(r, ...upper))).toBe(false);
    expect(pick(upper)).toEqual({ pickedUnitId: unit.id });
    // Force overlap to isolate (a) beating (b), including the enemy target path.
    occupant.visual.figureRects.push(visual.figureRects[1]!);
    expect(pick(upper)).toEqual({});
    expect(resolveMapClick({ state, selected: unit.id, ...pick(upper) }, cell)).toEqual({
      type: 'target',
      id: other.id,
    });
    other.troops = 0;
    expect(pick(upper)).toEqual({ pickedUnitId: unit.id });
  });
  it('(b) displaced art beats ordinary art and an occupied cell outside its figure boxes', () => {
    const { state, unit, other, visual, units, engines } = fixture();
    const point = centre(visual.figureRects[1]!),
      cell = positionAt(state, ...point)!;
    Object.assign(other, cell);
    const ordinary = { unit: other, visual: unitVisual(state, other) };
    ordinary.visual.figureRects = [[0, 0, 1, 1]];
    const offCell = {
      unit: { ...other, id: 'ordinary', x: 0 },
      visual: {
        ...ordinary.visual,
        figureRects: visual.figureRects,
        depth: { row: 999, height: 0 },
      },
    };
    expect(
      pickFigureArt(
        { state },
        { x: point[0], y: point[1] },
        cell,
        [...units, ordinary, offCell],
        engines,
      ),
    ).toEqual({ pickedUnitId: unit.id });
  });
  it('(c) a living occupant beats ordinary art elsewhere in its cell, at either level', () => {
    const { state, unit, other } = fixture();
    state.engines = [];
    Object.assign(unit, { x: 0, y: 10 });
    const visual = unitVisual(state, { ...unit, x: 0, y: 10 });
    expect(visual.displaced).toBe(false);
    for (const level of ['ground', 'wall'] as const) {
      Object.assign(other, { x: 10, y: level === 'wall' ? 7 : 10, level });
      const point = centre(planeRect(other));
      visual.figureRects = [[point[0] - 1, point[1] - 1, point[0] + 1, point[1] + 1]];
      const pick = () =>
        pickFigureArt({ state }, { x: point[0], y: point[1] }, other, [{ unit, visual }], []);
      expect(pick()).toEqual({});
      other.troops = 0;
      expect(pick()).toEqual({ pickedUnitId: unit.id });
      other.troops = 100;
    }
  });
  it('(d) ordinary figures over the ram cell select their owner, with depth and paint-order ties', () => {
    const state = createSiegeState(228),
      unit = state.units.find((u) => u.id === 'shu-weiyan')!;
    Object.assign(unit, { x: 8, y: 9 });
    state.units = [unit];
    state.engines = [{ ...state.engines[0]!, kind: 'ram', x: 8, y: 8 }];
    const visual = unitVisual(state, unit),
      point = centre(visual.figureRects[0]!),
      cell = positionAt(state, ...point)!;
    expect(cell).toEqual({ x: 8, y: 8, level: 'ground' });
    const front = {
      unit: { ...unit, id: 'front' },
      visual: {
        ...visual,
        depth: { ...visual.depth, row: visual.depth.row + 1 },
      },
    };
    const units = [front, { unit, visual }],
      engines = state.engines.map((e) => engineSprite(e));
    const pick = () => pickFigureArt({ state }, { x: point[0], y: point[1] }, cell, units, engines);
    expect(pick()).toEqual({ pickedUnitId: 'front' });
    front.visual.depth = visual.depth;
    expect(pick()).toEqual({ pickedUnitId: unit.id });
    expect(resolveMapClick({ state, ...pick() }, cell)).toEqual({ type: 'select', id: unit.id });
    unit.troops = 0;
    expect(pick()).toEqual({ pickedUnitId: 'front' });
  });
  it('(f) empty art falls through to the underlying cell, including null off-map', () => {
    const { state, pick } = fixture();
    const cell = positionAt(state, 32, 32);
    expect(pick({}, [32, 32])).toEqual({});
    expect(resolveMapClick({ state }, cell)).toEqual({ type: 'cell', cell });
    expect(pick({}, [-10, -10])).toEqual({});
    expect(resolveMapClick({ state }, null)).toEqual({ type: 'none' });
  });
  it('preserves reachable moves and mounts through figures and ladders', () => {
    const { state, other, visual, pick } = fixture();
    const point = centre(visual.figureRects[1]!),
      cell = positionAt(state, ...point)!;
    expect(pick({ selected: other.id, reachable: [cell] }, point)).toEqual({});
    expect(resolveMapClick({ state, selected: other.id, reachable: [cell] }, cell)).toEqual({
      type: 'move',
      cell,
    });
    const wall: SiegePosition = { x: 10, y: 7, level: 'wall' };
    expect(pick({ reachable: [wall] }, point, wall)).toEqual({});
  });
  it.each(['attack', 'move', 'fillTrench'] as const)(
    'armed %s and deploy always use cells instead of displaced art',
    (mode) => {
      const { state, unit, other, visual, pick } = fixture(),
        point = centre(visual.figureRects[1]!);
      Object.assign(other, { x: 10, y: 7, side: 'wei' });
      expect(pick({ mode }, point)).toEqual({});
      expect(pick({ deploy: true }, point)).toEqual({});
      const wall: SiegePosition = { x: 10, y: 7, level: 'wall' };
      expect(
        resolveMapClick(
          { state, selected: unit.id, mode, reachable: [wall], ...pick({ mode }, point, wall) },
          wall,
        ),
      ).toEqual(mode === 'attack' ? { type: 'target', id: other.id } : { type: mode, cell: wall });
    },
  );
  it('(e) selects a usable raised ladder over empty moat, preserving occupancy, moves, modes and footprint', () => {
    const { state, unit, other, engines } = fixture(),
      ladder = engines[0]!;
    const cell: SiegePosition = { x: 10, y: 9, level: 'ground' },
      p = centre(planeRect(cell));
    p[0] = centre(ladder.rect)[0];
    expect(contains(ladder.rect, ...p)).toBe(true);
    const pick = (context: Partial<MapClickContext> = {}) =>
      pickFigureArt({ state, ...context }, { x: p[0], y: p[1] }, cell, [], engines);
    expect(pick()).toEqual({ pickedEngineId: ladder.id });
    expect(resolveMapClick({ state, ...pick() }, cell)).toEqual({ type: 'select', id: ladder.id });
    expect(pick({ reachable: [cell] })).toEqual({});
    Object.assign(other, cell);
    expect(pick()).toEqual({});
    other.troops = 0;
    expect(pick()).toEqual({ pickedEngineId: ladder.id });
    for (const mode of ['attack', 'move', 'fillTrench'] as const) {
      expect(pick({ mode })).toEqual({});
      expect(
        resolveMapClick(
          { state, selected: unit.id, mode, pickedEngineId: ladder.id, reachable: [cell] },
          cell,
        ).type,
      ).not.toBe('select');
    }
    expect(pick({ deploy: true })).toEqual({});
    ladder.engine.wrecked = true;
    expect(pick()).toEqual({});
    ladder.engine.wrecked = false;
    ladder.engine.durability = 0;
    expect(pick()).toEqual({});
    ladder.engine.durability = 100;
    delete ladder.engine.raisedAt;
    // Unraised carts now own their sprite rectangle too.
    expect(pick()).toEqual({ pickedEngineId: ladder.id });
  });
  it('provides every figure box and distinguishes displaced art, including flipped poses', () => {
    const { state, unit } = fixture();
    for (const facing of ['north', 'west'] as const) {
      const visual = unitVisual(state, unit, facing);
      expect(visual.figureRects).toHaveLength(2);
      for (const [i, f] of visual.figures.entries()) {
        const x =
          visual.foot[0] +
          (visual.flip ? -1 : 1) * (f.offset[0] - f.pose.anchor[0] + f.pose.size[0] / 2);
        const y = visual.foot[1] + f.offset[1] - f.pose.anchor[1] + f.pose.size[1] / 2;
        expect(centre(visual.figureRects[i]!)).toEqual([x, y]);
      }
    }
    unit.assaultedDay = state.day;
    for (const facing of ['north', 'west'] as const) {
      const storm = unitVisual(state, unit, facing);
      expect(storm.displaced).toBe(true);
      expect(storm.figureRects).toEqual([stormingSprite(state, unit)!.rect]);
      expect(storm.rect).toEqual(storm.figureRects[0]);
    }
    delete unit.assaultedDay;
    state.engines = [];
    state.mounds['10,8'] = 6;
    Object.assign(unit, { y: 8 });
    expect(unitVisual(state, unit).figureRects.length).toBe(unitVisual(state, unit).figures.length);
    Object.assign(unit, { y: 10 });
    const ordinary = unitVisual(state, unit);
    expect(ordinary.displaced).toBe(false);
    expect(ordinary.figureRects).toHaveLength(ordinary.figures.length);
    expect(ordinary.figureRects.length).toBeGreaterThan(0);
  });
  it('ordinary figure boxes honour pose sizes, offsets and mirroring in every facing', () => {
    const state = createSiegeState(228);
    let boxes = 0;
    for (const unit of state.units.filter((u) => u.x >= 0))
      for (const facing of ['north', 'south', 'east', 'west'] as const) {
        const visual = unitVisual(state, unit, facing);
        expect(visual.displaced).toBe(false);
        expect(visual.figureRects).toHaveLength(visual.figures.length);
        for (const [i, f] of visual.figures.entries()) {
          const box = visual.figureRects[i]!;
          expect(box[2] - box[0]).toBeCloseTo(f.pose.size[0], 8);
          expect(box[3] - box[1]).toBeCloseTo(f.pose.size[1], 8);
          expect(centre(box)[0]).toBeCloseTo(
            visual.foot[0] +
              (visual.flip ? -1 : 1) * (f.offset[0] - f.pose.anchor[0] + f.pose.size[0] / 2),
            8,
          );
          expect(centre(box)[1]).toBeCloseTo(
            visual.foot[1] + f.offset[1] - f.pose.anchor[1] + f.pose.size[1] / 2,
            8,
          );
          boxes++;
        }
      }
    expect(boxes).toBeGreaterThan(0);
  });
  it('ordinary art also yields to reachable cells, every armed mode and deployment', () => {
    const state = createSiegeState(228),
      unit = state.units[1]!;
    Object.assign(unit, { x: 8, y: 9 });
    state.units = [unit];
    state.engines = [];
    const visual = unitVisual(state, unit),
      point = centre(visual.figureRects[0]!),
      cell = positionAt(state, ...point)!,
      units = [{ unit, visual }];
    const pick = (context: Partial<MapClickContext>) =>
      pickFigureArt({ state, ...context }, { x: point[0], y: point[1] }, cell, units, []);
    expect(pick({})).toEqual({ pickedUnitId: unit.id });
    expect(pick({ reachable: [cell] })).toEqual({});
    expect(pick({ deploy: true })).toEqual({});
    for (const mode of ['attack', 'move', 'fillTrench'] as const)
      expect(pick({ mode })).toEqual({});
  });
});

it('target icons and nameplates win before displaced figures and ladders', () => {
  const { state, unit, other, visual, units, engines } = fixture();
  const box = visual.figureRects[1]!,
    p = centre(box),
    point = { x: p[0], y: p[1] };
  const plates = new Map([[other.id, box]]);
  const actors = [...units, { unit: other, visual: unitVisual(state, other) }];
  const plate = pickMapHit({ state }, point, actors, engines, plates);
  expect(plate.pickedUnitId).toBe(other.id);
  const target = {
    id: other.id,
    icon: 'sword' as const,
    action: { type: 'attack' as const, unitId: unit.id, targetId: other.id },
  };
  const icon = pickMapHit({ state }, point, actors, engines, plates, [
    { position: other, rect: box, target },
  ]);
  expect(icon).toEqual({ cell: other, actorTarget: target });
});

it.each([2, 4, 6, 8])(
  'careful %i-day geometry audit requires every ordinary and displaced figure to select',
  (days) => {
    const state = playScriptDays(createSiegeState(days === 8 ? 1 : 228), 'careful', days);
    expect(state.day).toBe(days + 1);
    const units = state.units
      .filter((u) => u.troops > 0 && u.x >= 0)
      .map((unit) => ({ unit, visual: unitVisual(state, unit) }));
    const engines = state.engines.map((e) => engineSprite(e));
    const plates = layoutNameplates(
      units.map(({ unit, visual }) => ({
        id: unit.id,
        position: unit,
        foot: visual.foot,
        rect: visual.rect,
        belowFoot: visual.climbing || visual.storming,
      })),
    );
    const selected = state.engines[0]!.id;
    const context = { state, selected, reachable: engineReachable(state, selected) };
    const icons = targetIconRects(state, actorTargets(state, selected, 'shu'), plates);
    expect(context.reachable).toEqual([]);
    const exceptions: string[] = [];
    let displaced = 0,
      ordinary = 0;
    for (const { unit, visual } of units.filter(({ unit }) => unit.side === 'shu')) {
      for (const [i, box] of visual.figureRects.entries()) {
        const p = centre(box),
          hit = pickMapHit(context, { x: p[0], y: p[1] }, units, engines, plates, icons);
        const occupant = units.find(
          ({ unit: u, visual: v }) =>
            hit.cell &&
            u.x === hit.cell.x &&
            u.y === hit.cell.y &&
            u.level === hit.cell.level &&
            v.figureRects.some((r) => contains(r, ...p)),
        );
        const expected = occupant?.unit ?? unit;
        const result = resolveMapClick({ ...context, ...hit }, hit.cell);
        const label = `${unit.id}[${i}] centre (${p[0]},${p[1]}) -> ${JSON.stringify(result)}`;
        expect(hit.actorTarget, label).toBeUndefined();
        // A selected ladder cannot attack: an enemy occupant is still a target,
        // but it opens no forecast. Check the actual click result, not a forecast.
        expect(result, label).toEqual({
          type: expected.side === 'shu' ? 'select' : 'target',
          id: expected.id,
        });
        if (expected.id !== unit.id) exceptions.push(`${label}: occupant box ${expected.id}`);
        if (visual.displaced) displaced++;
        else ordinary++;
      }
    }
    const usable = engines
      .filter((e) => usableEngine(e.engine))
      .sort((a, b) =>
        compareDepth({ row: a.cells[3], height: a.height }, { row: b.cells[3], height: b.height }),
      )
      .reverse();
    const bodyPoints: { id: string; x: number; y: number }[] = [];
    for (const engine of usable) {
      let point: { x: number; y: number } | undefined;
      for (let y = engine.rect[1] + 1; y < engine.rect[3] - 1 && !point; y += 2)
        for (let x = engine.rect[0] + 1; x < engine.rect[2] - 1; x += 2) {
          if (
            units.some(({ visual }) => visual.figureRects.some((r) => contains(r, x, y))) ||
            [...plates.values(), ...icons.map((i) => i.rect)].some((r) => contains(r, x, y))
          )
            continue;
          if (usable.find((e) => contains(e.rect, x, y))?.id !== engine.id) continue;
          const cell = positionAt(state, x, y);
          if (
            cell &&
            units.some(
              ({ unit }) => unit.x === cell.x && unit.y === cell.y && unit.level === cell.level,
            )
          )
            continue;
          point = { x, y };
          break;
        }
      expect(point, `${engine.id} day ${state.day}: no free body point`).toBeDefined();
      const hit = pickMapHit(context, point!, units, engines, plates, icons);
      expect(hit.pickedEngineId, `${engine.id}: ${JSON.stringify(point)}`).toBe(engine.id);
      expect(resolveMapClick({ ...context, ...hit }, hit.cell)).toEqual({
        type: 'select',
        id: engine.id,
      });
      bodyPoints.push({ id: engine.id, ...point! });
    }
    console.info(
      JSON.stringify({
        days,
        displaced,
        ordinary,
        engineBodies: bodyPoints.length,
        bodyPoints,
        misses: 0,
        occupantBoxExceptions: exceptions,
      }),
    );
  },
);
