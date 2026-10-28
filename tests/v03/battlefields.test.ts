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
  selectCampaignBattlefield,
  validateBattleMap,
  type BattleMap,
  type BattlePosition,
  type BattleTroopType,
} from '../../src/v03/battle';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../src/v03/platform/storage';
import { reviewBattleState } from '../e2e-v03/playability-fixtures';
import { ROUTE_DEFINITIONS } from '../../src/v03/geography';

const troopTypes: BattleTroopType[] = ['infantry', 'cavalry', 'archer'];

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
      expect(map).not.toHaveProperty('objectives');
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
      expect(battle.units).toHaveLength(troopTypes.length * 2);
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
        { ...map.defenderDeployment[5]!, offset: 1 },
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

  it('saves and restores campaign battles on canvases and rejects 24×20 battles', () => {
    const selected = reviewBattleState();
    const moved = reviewBattleState('bf03-yellow-river-ford');
    for (const state of [selected, moved]) {
      expect(validateV03State(state)).toBe(true);
      expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
    }
    const map = (state: typeof selected) =>
      state.battles.find((battle) => battle.active)!.battleData.map;
    // Puyang → Xiapi is a direction special case: Xiapi is ringed by the Si and Yi rivers.
    expect(map(selected).battlefieldId).toBe('bf04-wetland-north');
    expect(map(moved).width).toBe(48);
    // Earlier saves fought on the 24×20 regional templates are not accepted.
    const legacy = reviewBattleState();
    const battle = legacy.battles.find((entry) => entry.active)!;
    battle.battleData.map = createBattleMap({ regionId: 'xiapi', seed: battle.seed });
    Object.assign(battle, { mapId: battle.battleData.map.mapId, mapVersion: 'v0.3.1' });
    expect(validateV03State(legacy)).toBe(false);
  });
});

describe('campaign battlefield selection', () => {
  const cities = (id: string) => id.split('--');
  const label = (to: string, from: string) => `${to}<-${from}`;
  // Plan §8.
  const expected: Record<string, string> = {
    'tianshui<-changan': 'bf06-valley-north',
    'tianshui<-hanzhong': 'bf09-gorge',
    'changan<-tianshui': 'bf06-valley-north',
    'changan<-luoyang': 'bf10-mountain-pass',
    'changan<-hanzhong': 'bf06-valley-north',
    'luoyang<-changan': 'bf10-mountain-pass',
    'luoyang<-chenliu': 'bf10-mountain-pass',
    'luoyang<-wancheng': 'bf10-mountain-pass',
    'luoyang<-ye': 'bf03-yellow-river-ford',
    'luoyang<-jinyang': 'bf03-yellow-river-ford',
    'jinyang<-luoyang': 'bf07-taihang',
    'jinyang<-ye': 'bf07-taihang',
    'ye<-beiping': 'bf01-north-plain',
    'ye<-pingyuan': 'bf01-north-plain',
    'ye<-puyang': 'bf03-yellow-river-ford',
    'ye<-luoyang': 'bf03-yellow-river-ford',
    'ye<-jinyang': 'bf07-taihang',
    'beiping<-pingyuan': 'bf01-north-plain',
    'beiping<-ye': 'bf01-north-plain',
    'pingyuan<-beihai': 'bf01-north-plain',
    'pingyuan<-beiping': 'bf01-north-plain',
    'pingyuan<-ye': 'bf01-north-plain',
    'pingyuan<-puyang': 'bf03-yellow-river-ford',
    'beihai<-pingyuan': 'bf01-north-plain',
    'beihai<-xiapi': 'bf07-rolling-hills',
    'puyang<-chenliu': 'bf02-central-farmland',
    'puyang<-xiapi': 'bf02-central-farmland',
    'puyang<-pingyuan': 'bf03-yellow-river-ford',
    'puyang<-ye': 'bf03-yellow-river-ford',
    'chenliu<-puyang': 'bf02-central-farmland',
    'chenliu<-shouchun': 'bf02-central-farmland',
    'chenliu<-xuchang': 'bf02-central-farmland',
    'chenliu<-luoyang': 'bf10-mountain-pass',
    'xuchang<-chenliu': 'bf02-central-farmland',
    'xuchang<-shouchun': 'bf02-central-farmland',
    'xuchang<-wancheng': 'bf07-rolling-hills',
    'xuchang<-jiangxia': 'bf10-mountain-pass',
    'xiapi<-shouchun': 'bf04-wetland-north',
    'xiapi<-jianye': 'bf04-wetland-north',
    'xiapi<-puyang': 'bf04-wetland-north',
    'xiapi<-beihai': 'bf04-wetland-north',
    'shouchun<-xiapi': 'bf04-wetland-north',
    'shouchun<-chenliu': 'bf04-wetland-north',
    'shouchun<-xuchang': 'bf04-wetland-north',
    'shouchun<-jianye': 'bf05-yangtze-crossing',
    'shouchun<-jiangxia': 'bf08-south-hills',
    'jianye<-wu': 'bf04-wetland-south',
    'jianye<-chaisang': 'bf05-yangtze-bank',
    'jianye<-shouchun': 'bf05-yangtze-crossing',
    'jianye<-xiapi': 'bf05-yangtze-crossing',
    'wu<-jianye': 'bf04-wetland-south',
    'wu<-chaisang': 'bf08-south-hills',
    'chaisang<-jiangling': 'bf05-yangtze-bank',
    'chaisang<-jiangxia': 'bf05-yangtze-bank',
    'chaisang<-jianye': 'bf05-yangtze-bank',
    'chaisang<-wu': 'bf08-south-hills',
    'jiangxia<-chaisang': 'bf05-yangtze-bank',
    'jiangxia<-jiangling': 'bf05-yangtze-bank',
    'jiangxia<-xiangyang': 'bf06-valley-south',
    'jiangxia<-shouchun': 'bf08-south-hills',
    'jiangxia<-xuchang': 'bf10-mountain-pass',
    'xiangyang<-jiangxia': 'bf06-valley-south',
    'xiangyang<-wancheng': 'bf06-valley-south',
    'xiangyang<-jiangling': 'bf08-south-hills',
    'xiangyang<-hanzhong': 'bf09-gorge',
    'wancheng<-xiangyang': 'bf06-valley-south',
    'wancheng<-xuchang': 'bf07-rolling-hills',
    'wancheng<-luoyang': 'bf10-mountain-pass',
    'hanzhong<-changan': 'bf09-gorge',
    'hanzhong<-tianshui': 'bf09-gorge',
    'hanzhong<-xiangyang': 'bf09-gorge',
    'hanzhong<-zitong': 'bf10-mountain-pass',
    'zitong<-chengdu': 'bf08-south-hills',
    'zitong<-jiangzhou': 'bf08-south-hills',
    'zitong<-hanzhong': 'bf10-mountain-pass',
    'chengdu<-jiangzhou': 'bf08-south-hills',
    'chengdu<-zitong': 'bf08-south-hills',
    'jiangzhou<-chengdu': 'bf08-south-hills',
    'jiangzhou<-zitong': 'bf08-south-hills',
    'jiangzhou<-jiangling': 'bf09-three-gorges',
    'jiangling<-chaisang': 'bf05-yangtze-bank',
    'jiangling<-jiangxia': 'bf05-yangtze-bank',
    'jiangling<-xiangyang': 'bf08-south-hills',
    'jiangling<-jiangzhou': 'bf09-three-gorges',
  };

  it('picks the planned battlefield for all 84 route directions', () => {
    const cases = ROUTE_DEFINITIONS.flatMap((route) => {
      const [a, b] = cities(route.id) as [string, string];
      return [
        [b, a],
        [a, b],
      ] as const;
    });
    expect(cases).toHaveLength(84);
    expect(Object.keys(expected)).toHaveLength(84);
    for (const [to, from] of cases)
      expect(selectCampaignBattlefield([from, to]), label(to, from)).toBe(
        expected[label(to, from)],
      );
  });

  it('uses only the last leg of a multi-city march', () => {
    expect(selectCampaignBattlefield(['beiping', 'ye', 'puyang', 'xiapi'])).toBe(
      'bf04-wetland-north',
    );
    expect(selectCampaignBattlefield(['chengdu', 'zitong', 'hanzhong', 'changan'])).toBe(
      'bf06-valley-north',
    );
  });
});
