import { describe, expect, it } from 'vitest';
import {
  battleTerrainDefenseMultiplier,
  createBattleMap,
  fireWeatherMultiplier,
  fireTerrainMultiplier,
  terrainDefenseMultiplier,
  type BattleTerrain,
  type BattleWeather,
} from '../../src/v03/battle';

describe('v0.3 inspection uses the combat effect sources', () => {
  it.each<[BattleTerrain, number]>([
    ['plain', 1],
    ['forest', 0.82],
    ['hill', 0.8],
    ['water', 1],
    ['cliff', 1],
  ])('reports existing %s defense without a camp bonus', (terrain, expected) => {
    const map = createBattleMap({ regionId: 'xiapi', approachDirection: 'north', seed: 17 });
    const camp = map.objectives[0]!.position;
    map.terrain[camp.y * 24 + camp.x] = terrain;
    expect(terrainDefenseMultiplier(terrain)).toBe(expected);
    expect(battleTerrainDefenseMultiplier(map, camp)).toBe(expected);
    expect(fireTerrainMultiplier(terrain)).toBe(terrain === 'forest' ? 1.4 : 1);
  });

  it.each<[BattleWeather, number]>([
    ['clear', 1],
    ['rain', 0.4],
    ['wind', 1.25],
  ])('reports the unchanged %s fire multiplier', (weather, expected) => {
    expect(fireWeatherMultiplier(weather)).toBe(expected);
  });
});
