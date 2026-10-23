import { describe, expect, it } from 'vitest';
import {
  CANVAS_BATTLE_HEIGHT,
  CANVAS_BATTLE_WIDTH,
  CANVAS_CELL_TERRAIN,
  battleStepCost,
  canvasBattlefieldIds,
  canvasBattlefieldLayout,
  createBattleMap,
  createCanvasBattleMap,
  createTacticalBattle,
  getBattleRouteDistanceField,
  parseCanvasLayout,
  validateBattleMap,
  type BattleMap,
  type BattlePosition,
  type BattleTroopType,
} from '../../src/v03/battle';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../src/v03/platform/storage';
import { reviewBattleState } from '../e2e-v03/playability-fixtures';

const troopTypes: BattleTroopType[] = ['infantry', 'cavalry', 'archer', 'naval', 'elite', 'guard'];

/** Plain reference Dijkstra built only on battleStepCost, for comparison. */
function referenceField(
  map: BattleMap,
  troopType: BattleTroopType,
  goals: readonly (BattlePosition & { offset?: number })[],
  blockers: readonly BattlePosition[],
): number[] {
  const unit = { troopType };
  const distances = map.terrain.map(() => Number.POSITIVE_INFINITY);
  const blocked = new Set(blockers.map((b) => b.y * map.width + b.x));
  for (const goal of goals) {
    if (map.terrain[goal.y * map.width + goal.x] === 'cliff') continue;
    const index = goal.y * map.width + goal.x;
    blocked.delete(index);
    distances[index] = Math.min(distances[index]!, goal.offset ?? 0);
  }
  const done = new Set<number>();
  for (;;) {
    let current = -1;
    for (let i = 0; i < distances.length; i++)
      if (
        !done.has(i) &&
        Number.isFinite(distances[i]) &&
        (current < 0 || distances[i]! < distances[current]!)
      )
        current = i;
    if (current < 0) return distances;
    done.add(current);
    const to = { x: current % map.width, y: Math.floor(current / map.width) };
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const from = { x: to.x + dx, y: to.y + dy };
      if (from.x < 0 || from.y < 0 || from.x >= map.width || from.y >= map.height) continue;
      const index = from.y * map.width + from.x;
      if (blocked.has(index)) continue;
      const candidate = distances[current]! + battleStepCost(map, unit, from, to);
      if (candidate < distances[index]!) distances[index] = candidate;
    }
  }
}

describe('48×32 canvas battlefields', () => {
  it('builds every generated layout into a valid map with ten land deployment cells per side', () => {
    expect(canvasBattlefieldIds()).toHaveLength(15);
    for (const id of canvasBattlefieldIds()) {
      const map = createCanvasBattleMap(id, { seed: 3 });
      expect(validateBattleMap(map), id).toEqual([]);
      expect([map.width, map.height]).toEqual([CANVAS_BATTLE_WIDTH, CANVAS_BATTLE_HEIGHT]);
      expect(map.terrain).toHaveLength(48 * 32);
      expect(map.battlefieldId).toBe(id);
      // The two middle columns of each zone fill first; outer columns only after them.
      for (const [cells, middle] of [
        [map.attackerDeployment, [12, 13]],
        [map.defenderDeployment, [34, 35]],
      ] as const) {
        const firstOuter = cells.findIndex((cell) => !middle.includes(cell.x as never));
        const lastMiddle = cells.map((cell) => middle.includes(cell.x as never)).lastIndexOf(true);
        expect(firstOuter < 0 || firstOuter > lastMiddle, id).toBe(true);
      }
      const battle = createTacticalBattle({
        id: `canvas-${id}`,
        map,
        attackerUnits: troopTypes.map((troopType, i) => ({
          id: `a${i}`,
          name: `a${i}`,
          troopType,
          troops: 500,
          force: 60,
        })),
        defenderUnits: troopTypes.map((troopType, i) => ({
          id: `d${i}`,
          name: `d${i}`,
          troopType,
          troops: 500,
          force: 60,
        })),
      });
      expect(battle.units).toHaveLength(12);
    }
  });

  it('maps every layout symbol to exactly one rules terrain and rejects malformed layouts', () => {
    const symbols = new Set(
      canvasBattlefieldIds().flatMap((id) => [...canvasBattlefieldLayout(id)!.rows.join('')]),
    );
    for (const symbol of symbols) expect(CANVAS_CELL_TERRAIN[symbol], symbol).toBeDefined();
    const rows = canvasBattlefieldLayout('bf01-north-plain')!.rows;
    expect(() => parseCanvasLayout(rows.slice(1))).toThrow(/32 rows/);
    expect(() => parseCanvasLayout([rows[0]!.slice(1), ...rows.slice(1)])).toThrow(/not 48/);
    expect(() => parseCanvasLayout([`?${rows[0]!.slice(1)}`, ...rows.slice(1)])).toThrow(/Unknown/);
    expect(parseCanvasLayout(rows)[15 * 48 + 25]).toBe('plain'); // the bridge on the main road
  });

  it('keeps the fast route distance field identical to a plain Dijkstra on every canvas', () => {
    for (const [mapIndex, id] of canvasBattlefieldIds().entries()) {
      const map = createCanvasBattleMap(id);
      const troopType = troopTypes[mapIndex % troopTypes.length]!;
      const goals = [
        ...map.defenderDeployment.slice(0, 4),
        { ...map.objectives[1]!.position, offset: 1 },
      ];
      const blockers = map.attackerDeployment.slice(4, 9);
      const expected = referenceField(map, troopType, goals, blockers);
      expect(getBattleRouteDistanceField(map, { troopType }, goals, blockers), id).toEqual(
        expected,
      );
      // Stopping early leaves the requested cells exact.
      const settle = map.attackerDeployment.slice(0, 3);
      const partial = getBattleRouteDistanceField(map, { troopType }, goals, blockers, settle);
      for (const cell of settle)
        expect(partial[cell.y * 48 + cell.x]).toBe(expected[cell.y * 48 + cell.x]);
    }
    const legacy = createBattleMap({ regionId: 'hanzhong', seed: 2 });
    const goals = legacy.defenderDeployment.slice(0, 3);
    expect(getBattleRouteDistanceField(legacy, { troopType: 'cavalry' }, goals)).toEqual(
      referenceField(legacy, 'cavalry', goals, []),
    );
  });

  it('saves and restores a campaign battle on a 48×32 canvas, and still accepts 24×20', () => {
    for (const state of [
      reviewBattleState('xiapi', 'bf01-north-plain'),
      reviewBattleState('xiapi'),
    ]) {
      expect(validateV03State(state)).toBe(true);
      expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
    }
    const canvas = reviewBattleState('xiapi', 'bf01-north-plain');
    expect(canvas.battles.find((battle) => battle.active)!.battleData.map.width).toBe(48);
    // A unit outside its map's own bounds is rejected even though 48×32 saves allow x up to 47.
    const legacy = reviewBattleState('xiapi');
    legacy.battles.find((battle) => battle.active)!.battleData.units[0]!.x = 30;
    expect(validateV03State(legacy)).toBe(false);
  });
});
