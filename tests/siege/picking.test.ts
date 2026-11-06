import { describe, expect, it } from 'vitest';
import { pickMapPosition } from '../../src/siege/render/picking';
import { anchor, centre, hitRect, planeRect } from '../../src/siege/render/boardGeometry';
import { pickCandidates, pickCell, project } from '../../src/siege/render/scene';
import { FRAME } from '../../src/siege/render/assets';
import { createSiegeState } from '../../src/siege/rules/state';
import { resolveMapClick } from '../../src/siege/ui/mapClick';

describe('V2 picking has one answer independent of occupancy or armed action', () => {
  it.each([0.25, 0.5, 0.75])('visible row-six fraction %s always picks the yard', (fraction) => {
    const state = createSiegeState(228),
      p = { x: 7, y: 6, level: 'ground' as const },
      r = hitRect(p, state)!;
    const sx = (r[0] + r[2]) / 2,
      sy = r[1] + (r[3] - r[1]) * fraction;
    expect(pickMapPosition(state, sx, sy)).toEqual(p);
    const unit = state.units[1]!;
    state.units = [unit];
    Object.assign(unit, { x: 7, y: 7, level: 'wall' });
    expect(pickMapPosition(state, sx, sy)).toEqual(p);
    expect(resolveMapClick({ state, selected: unit.id, reachable: [p], mode: 'move' }, p)).toEqual({
      type: 'move',
      cell: p,
    });
  });
  it('the ramp stays on the ground plane and has its own distinct pick', () => {
    const state = createSiegeState(228),
      p = { x: 7, y: 6, level: 'ground' as const };
    expect(pickMapPosition(state, ...anchor(p))).toEqual(p);
    expect(planeRect(p)[1]).toBe(576);
  });
  it('wall face clicks belong to the wall even with a reachable occupied cell behind', () => {
    const state = createSiegeState(228),
      p = { x: 7, y: 7, level: 'wall' as const };
    expect(pickMapPosition(state, ...centre(hitRect(p, state)!))).toEqual(p);
    Object.assign(state.units[1]!, { x: 7, y: 6 });
    expect(pickMapPosition(state, ...centre(hitRect(p, state)!))).toEqual(p);
  });
  it('uses half-open edges and returns null for hidden trench and off-board', () => {
    const state = createSiegeState(228);
    expect(pickMapPosition(state, 1184, 696)).toEqual({ x: 6, y: 7, level: 'wall' });
    expect(pickMapPosition(state, 1184, 144)).toEqual({ x: 6, y: 2, level: 'wall' });
    expect(pickMapPosition(state, -1, -1)).toBeNull();
  });
  it('preserves fine art picking primitives for the crop preview', () => {
    const [sx, sy] = project(FRAME, 18.5, 15.25),
      c = pickCandidates(FRAME, sx, sy, [0, 3, 1, 3], () => true);
    expect(c.map((p) => p.h)).toEqual([3, 1, 0]);
    expect(pickCell(FRAME, sx, sy, [0, 3, 1, 3], () => true)).toEqual(c[0]);
    expect(pickCandidates(FRAME, sx, sy, [0, 3], () => false)).toEqual([]);
    expect(pickCell(FRAME, sx, sy, [0, 3], () => false)).toBeNull();
  });
});
