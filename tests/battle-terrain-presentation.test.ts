import { describe, expect, it } from 'vitest';
import { battleTileVisual } from '../src/rendering/battleTerrainGeometry';
import { battleGeography } from '../src/rendering/battleGeography';
import { SCENARIOS } from '../src/content/scenario';
import type { Terrain } from '../src/game/types';

describe('battle terrain presentation respects the playable grid', () => {
  const board = (center: Terrain = 'plain') => ({
    width: 3,
    height: 3,
    terrain: [
      'plain',
      'water',
      'plain',
      'plain',
      center,
      'plain',
      'plain',
      'water',
      'plain',
    ] as Terrain[],
  });
  it('marks a dry crossing between opposite water banks without mutating terrain', () => {
    const map = board();
    const before = structuredClone(map);
    expect(battleTileVisual(map, 1, 1)).toMatchObject({ terrain: 'plain', ford: 'horizontal' });
    expect(map).toEqual(before);
    map.terrain = ['plain', 'plain', 'plain', 'water', 'plain', 'water', 'plain', 'plain', 'plain'];
    expect(battleTileVisual(map, 1, 1).ford).toBe('vertical');
  });
  it.each(['water', 'wall', 'gate', 'hill', 'forest', 'fort'] as const)(
    'never paints %s as a walkable crossing',
    (terrain) => {
      expect(battleTileVisual(board(terrain), 1, 1).ford).toBeNull();
    },
  );
  it('connects water only to orthogonal neighbors, without wrapping at map edges', () => {
    const map = { width: 2, height: 2, terrain: ['water', 'water', 'water', 'plain'] as Terrain[] };
    expect(battleTileVisual(map, 0, 0).water).toEqual([false, true, true, false]);
    expect(battleTileVisual(map, 1, 0).water).toEqual([false, false, false, true]);
    expect(battleTileVisual(map, 1, 1).ford).toBeNull();
  });
  it('covers both scenario rosters with bilingual regional settings', () => {
    for (const scenario of SCENARIOS)
      for (const city of scenario.cities) {
        expect(battleGeography(city.id).en).not.toBe('Fields and foothills');
        expect(battleGeography(city.id).zh).toMatch(/[\u4e00-\u9fff]/);
      }
    expect(battleGeography('chengdu').landscape).toBe('basin');
    expect(battleGeography('hanzhong').landscape).toBe('highland');
    expect(battleGeography('shouchun').en).toContain('Huai');
  });
});
