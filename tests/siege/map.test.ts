import { describe, expect, it } from 'vitest';
import { INNER_WALL_SEGMENTS, RAMPS, cellKey } from '../../src/siege/content/chencang';
import { cellHeight, cellTerrain, isWallFoot } from '../../src/siege/rules/map';
import { createSiegeState } from '../../src/siege/rules/state';
import { innerTrench, outerTrench } from './rulesFixtures';

describe('siege terrain and heights', () => {
  it('maps coarse symbols, all K cells and off-board water', () => {
    const state = createSiegeState(1);
    for (const [x, y, terrain] of [
      [6, 10, 'plain'],
      [8, 10, 'plain'],
      [8, 8, 'plain'],
      [0, 2, 'hill'],
      [0, 4, 'wood'],
      [2, 12, 'wood'],
      [-1, 0, 'water'],
      [7, 8, 'trench'],
      [7, 2, 'wall'],
      [4, 2, 'wall'],
      [8, 7, 'gate'],
      [6, 4, 'building'],
      [5, 11, 'building'],
      [3, 13, 'building'],
      [9, 13, 'building'],
      [9, 4, 'courtyard'],
      [10, 4, 'courtyard'],
      [7, 6, 'ramp'],
    ] as const)
      expect(cellTerrain(state, x, y), `${x},${y}`).toBe(terrain);
    expect(cellHeight(state, 8, 7, 'ground')).toBe(0);
    expect(cellHeight(state, 8, 7, 'wall')).toBe(3);
    expect(cellHeight(state, 7, 7, 'wall')).toBe(3);
    expect(cellHeight(state, 9, 4, 'ground')).toBe(0);
  });
  it('fills only south trench and recognizes the inner wall foot', () => {
    const state = createSiegeState(1),
      inner = innerTrench(),
      outer = outerTrench();
    expect(isWallFoot(state, inner.x, inner.y)).toBe(false);
    state.trenchFill[cellKey(inner)] = 2;
    expect(cellTerrain(state, inner.x, inner.y)).toBe('trench');
    state.trenchFill[cellKey(inner)] = 3;
    state.trenchFill[cellKey(outer)] = 3;
    state.trenchFill['3,1'] = 3;
    expect(cellTerrain(state, inner.x, inner.y)).toBe('plain');
    expect(cellTerrain(state, outer.x, outer.y)).toBe('plain');
    expect(cellTerrain(state, 3, 1)).toBe('trench');
    expect(isWallFoot(state, inner.x, inner.y)).toBe(true);
    expect(isWallFoot(state, outer.x, outer.y)).toBe(false);
    expect(isWallFoot(state, 8, 8)).toBe(false);
    state.trenchFill['3,8'] = 3;
    expect(isWallFoot(state, 3, 8)).toBe(false);
    state.trenchFill['4,8'] = 3;
    expect(isWallFoot(state, 4, 8)).toBe(true);
  });
  it('replaces four ramp sites with height-two wall only when complete', () => {
    const state = createSiegeState(1);
    for (const segment of INNER_WALL_SEGMENTS)
      for (const progress of [0, 1, 2, 3, 4] as const) {
        state.innerWall[segment.index] = progress;
        for (const c of segment.cells) {
          expect(cellTerrain(state, c.x, c.y)).toBe(progress === 4 ? 'wall' : 'ramp');
          expect(cellHeight(state, c.x, c.y, progress === 4 ? 'wall' : 'ground')).toBe(2);
        }
      }
    expect(cellTerrain(state, 8, 6)).toBe('plain');
    for (const x of [6, 10]) expect(cellTerrain(state, x, 6)).toBe('building');
  });
  it.each(RAMPS)('$id is a single height-two cell next to a height-three wall', (ramp) => {
    const state = createSiegeState(1);
    expect(ramp.cells).toEqual([ramp.ground]);
    expect(cellHeight(state, ramp.ground.x, ramp.ground.y, 'ground')).toBe(2);
    expect(cellHeight(state, ramp.wall.x, ramp.wall.y, 'wall')).toBe(3);
  });
});
