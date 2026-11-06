import { describe, expect, it } from 'vitest';
import { contains, positionAt } from '../../src/siege/render/boardGeometry';
import { pickFigureArt } from '../../src/siege/render/picking';
import { engineSprite, unitVisual } from '../../src/siege/render/stateArt';
import { createSiegeState } from '../../src/siege/rules/state';
import { actorTargets } from '../../src/siege/ui/commands';
import { resolveMapClick, type MapClickContext } from '../../src/siege/ui/mapClick';

function fixture(kind: 'ladder' | 'ram' | 'tower' | 'earthCart' = 'ram') {
  const state = createSiegeState(228);
  state.units = [];
  state.engines = [{ ...state.engines[0]!, kind, x: 8, y: 8 }];
  const sprite = engineSprite(state.engines[0]!);
  const point = { x: (sprite.rect[0] + sprite.rect[2]) / 2, y: sprite.rect[1] + 1 };
  const cell = positionAt(state, point.x, point.y);
  const pick = (context: Partial<MapClickContext> = {}) =>
    pickFigureArt({ state, ...context }, point, cell, [], [sprite]);
  return { state, sprite, point, cell, pick };
}

describe('row (e): usable engine bodies', () => {
  it.each(['ram', 'tower', 'earthCart', 'ladder'] as const)(
    '%s selects through its sprite rect',
    (kind) => {
      const { state, sprite, cell, pick } = fixture(kind);
      expect(pick()).toEqual({ pickedEngineId: sprite.id });
      expect(resolveMapClick({ state, ...pick() }, cell)).toEqual({
        type: 'select',
        id: sprite.id,
      });
      expect(resolveMapClick({ state, ...pick() }, null)).toEqual({
        type: 'select',
        id: sprite.id,
      });
      expect(pick({ reachable: cell ? [cell] : [] })).toEqual({});
      expect(pick({ deploy: true })).toEqual({});
      for (const mode of ['attack', 'move', 'fillTrench'] as const) {
        expect(pick({ mode })).toEqual({});
        expect(resolveMapClick({ state, pickedEngineId: sprite.id, mode }, null)).toEqual({
          type: 'none',
        });
      }
      expect(resolveMapClick({ state, pickedEngineId: sprite.id, deploy: true }, null)).toEqual({
        type: 'none',
      });
    },
  );

  it('uses frontmost engine depth, then the last painted entry on ties', () => {
    const { state, sprite, point, cell } = fixture();
    const front = { ...sprite, id: 'front', cells: [...sprite.cells] as typeof sprite.cells };
    front.cells[3]++;
    const pick = () => pickFigureArt({ state }, point, cell, [], [front, sprite]);
    expect(pick()).toEqual({ pickedEngineId: front.id });
    front.cells[3] = sprite.cells[3];
    front.height = sprite.height + 1;
    expect(pick()).toEqual({ pickedEngineId: front.id });
    front.height = sprite.height;
    expect(pick()).toEqual({ pickedEngineId: sprite.id });
  });

  it('row (d) ordinary figures beat the engine body even off its logical cell', () => {
    const { state, sprite, point, cell } = fixture();
    const unit = createSiegeState(228).units.find((u) => u.id === 'shu-weiyan')!;
    Object.assign(unit, { x: 5, y: 10 });
    state.units = [unit];
    const visual = unitVisual(state, unit);
    visual.figureRects = [[point.x - 1, point.y - 1, point.x + 1, point.y + 1]];
    expect(visual.displaced).toBe(false);
    expect(pickFigureArt({ state }, point, cell, [{ unit, visual }], [sprite])).toEqual({
      pickedUnitId: unit.id,
    });
  });

  it.each(['wrecked', 'zero durability'] as const)('%s stays cell-only', (condition) => {
    const { state, sprite, cell, pick } = fixture();
    if (condition === 'wrecked') sprite.engine.wrecked = true;
    else sprite.engine.durability = 0;
    expect(pick()).toEqual({});
    expect(resolveMapClick({ state, pickedEngineId: sprite.id }, cell)).toEqual(
      cell ? { type: 'cell', cell } : { type: 'none' },
    );
    expect(resolveMapClick({ state }, { ...sprite.engine, level: 'ground' })).toEqual({
      type: 'select',
      id: sprite.id,
    });
  });

  it('a legal ground gate target wins through a ram; unavailable actions and wall cells do not', () => {
    const { state, sprite } = fixture();
    const unit = createSiegeState(228).units.find((u) => u.id === 'shu-weiyan')!;
    Object.assign(unit, { x: 8, y: 8, moved: true });
    state.units = [unit];
    const gateCell = { x: 8, y: 7, level: 'ground' as const };
    let point: { x: number; y: number } | undefined;
    for (let y = sprite.rect[1] + 1; y < sprite.rect[3] && !point; y += 2)
      for (let x = sprite.rect[0] + 1; x < sprite.rect[2]; x += 2) {
        const cell = positionAt(state, x, y);
        if (
          cell?.x === 8 &&
          cell.y === 7 &&
          cell.level === 'ground' &&
          !unitVisual(state, unit).figureRects.some((r) => contains(r, x, y))
        ) {
          point = { x, y };
          break;
        }
      }
    expect(point).toBeDefined();
    expect(actorTargets(state, unit.id, 'shu').find((t) => t.id === 'south')?.action.type).toBe(
      'attack',
    );
    const pick = (context: MapClickContext, cell = gateCell) =>
      pickFigureArt(context, point!, cell, [], [sprite]);
    expect(pick({ state, selected: unit.id })).toEqual({});
    expect(resolveMapClick({ state, selected: unit.id }, gateCell)).toEqual({
      type: 'target',
      id: 'south',
    });
    expect(pick({ state })).toEqual({ pickedEngineId: sprite.id });
    expect(pick({ state, selected: unit.id, playerSide: 'wei' })).toEqual({
      pickedEngineId: sprite.id,
    });
    expect(
      pickFigureArt(
        { state, selected: unit.id },
        point!,
        { ...gateCell, level: 'wall' },
        [],
        [sprite],
      ),
    ).toEqual({ pickedEngineId: sprite.id });
    const spent = structuredClone(state);
    spent.units[0]!.acted = true;
    expect(actorTargets(spent, unit.id, 'shu')).toEqual([]);
    expect(pick({ state: spent, selected: unit.id })).toEqual({ pickedEngineId: sprite.id });
    const broken = structuredClone(state);
    broken.gates.south.broken = true;
    broken.gates.south.durability = 0;
    expect(pick({ state: broken, selected: unit.id })).toEqual({ pickedEngineId: sprite.id });
  });
});
