import { describe, expect, it } from 'vitest';
import { INNER_WALL_SEGMENTS, RAMPS, cellKey } from '../../src/siege/content/chencang';
import { cellHeight, cellTerrain, isWallFoot } from '../../src/siege/rules/map';
import { createSiegeState } from '../../src/siege/rules/state';

describe('siege terrain and heights', () => {
  it('maps snow, roads, bridges, hills, trees, palisades, buildings, gates and courtyards', () => {
    const state = createSiegeState(1);
    for (const [x, y, expected] of [
      [20, 20, 'plain'],
      [23, 20, 'plain'],
      [23, 17, 'plain'],
      [20, 23, 'plain'],
      [0, 4, 'hill'],
      [3, 6, 'wood'],
      [10, 27, 'wood'],
      [20, 0, 'water'],
      [20, 17, 'trench'],
      [20, 4, 'wall'],
      [14, 4, 'wall'],
      [23, 16, 'gate'],
      [25, 6, 'building'],
      [18, 6, 'building'],
      [15, 23, 'building'],
      [12, 27, 'building'],
      [27, 28, 'building'],
      [25, 7, 'courtyard'],
      [28, 8, 'courtyard'],
      [20, 15, 'ramp'],
      [17, 14, 'plain'],
    ] as const) {
      expect(cellTerrain(state, x, y), `${x},${y}`).toBe(expected);
    }
    expect(cellHeight(state, 23, 16, 'ground')).toBe(0);
    expect(cellHeight(state, 23, 16, 'wall')).toBe(3);
    expect(cellHeight(state, 20, 16, 'wall')).toBe(3);
    expect(cellHeight(state, 25, 7, 'ground')).toBe(0);
  });

  it('fills only south trench cells, and identifies wall feet only in the inner row under walls', () => {
    const state = createSiegeState(1);
    expect(isWallFoot(state, 20, 17)).toBe(false);
    state.trenchFill['20,17'] = 2;
    expect(cellTerrain(state, 20, 17)).toBe('trench');
    state.trenchFill['20,17'] = 3;
    state.trenchFill['20,18'] = 3;
    state.trenchFill['12,3'] = 3;
    expect(cellTerrain(state, 20, 17)).toBe('plain');
    expect(cellTerrain(state, 20, 18)).toBe('plain');
    expect(cellTerrain(state, 12, 3)).toBe('trench');
    expect(isWallFoot(state, 20, 17)).toBe(true);
    expect(isWallFoot(state, 20, 18)).toBe(false);
    expect(isWallFoot(state, 23, 17)).toBe(false);
    state.trenchFill['12,17'] = 3;
    expect(isWallFoot(state, 12, 17)).toBe(false);
    state.trenchFill['14,17'] = 3;
    expect(isWallFoot(state, 14, 17)).toBe(true);
  });

  it('turns each inner-wall segment into height-two wall at exactly four build points, keeping gaps', () => {
    const state = createSiegeState(1);
    for (const segment of INNER_WALL_SEGMENTS) {
      for (const progress of [0, 1, 2, 3, 4] as const) {
        state.innerWall[segment.index] = progress;
        for (const cell of segment.cells) {
          expect(cellTerrain(state, cell.x, cell.y)).toBe(
            progress === 4 ? 'wall' : progress > 0 ? 'works' : 'plain',
          );
          expect(cellHeight(state, cell.x, cell.y, 'wall')).toBe(progress === 4 ? 2 : 0);
        }
      }
    }
    for (const x of [16, 23, 24, 31]) expect(cellTerrain(state, x, 14)).toBe('plain');
  });

  it.each(RAMPS)('interpolates $id from height one to height three', (ramp) => {
    const state = createSiegeState(1);
    expect(ramp.cells.map((c) => cellHeight(state, c.x, c.y, 'ground'))).toEqual([1, 2, 3]);
    expect(ramp.cells.map((c) => cellKey(c))).toHaveLength(3);
    expect(cellHeight(state, ramp.ground.x, ramp.ground.y, 'ground')).toBe(0);
    expect(cellHeight(state, ramp.wall.x, ramp.wall.y, 'wall')).toBe(3);
  });
});
