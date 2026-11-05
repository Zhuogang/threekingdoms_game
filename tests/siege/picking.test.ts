import { describe, expect, it } from 'vitest';
import { FRAME } from '../../src/siege/render/assets';
import { pickMapPosition } from '../../src/siege/render/picking';
import { pickCandidates, pickCell, project } from '../../src/siege/render/scene';
import { cellHeight, cellTerrain, isMapCell } from '../../src/siege/rules/map';
import { reachableCells } from '../../src/siege/rules/movement';
import { createSiegeState } from '../../src/siege/rules/state';
import { resolveMapClick } from '../../src/siege/ui/mapClick';

const ground = { x: 18, y: 15, level: 'ground' as const };
const wall = { x: 18, y: 16, level: 'wall' as const };
function fixture() {
  const state = createSiegeState(228);
  const unit = state.units.find((u) => u.id === 'shu-weiyan')!;
  Object.assign(unit, { x: 18, y: 16, level: 'wall' });
  state.units = [unit];
  state.engines = [];
  return { state, unit };
}

describe('S2 every standing plane participates in picking', () => {
  it.each([0.25, 0.5, 0.75])(
    'green y=15 cell wins at vertical fraction %s, including its exact rect centre',
    (fraction) => {
      const { state, unit } = fixture();
      const reachable = reachableCells(state, unit.id);
      expect(reachable).toEqual(expect.arrayContaining([expect.objectContaining(ground)]));
      const [sx, sy] = project(FRAME, 18.5, 15 + fraction);
      const candidates = pickCandidates(FRAME, sx, sy, [0, 1, 2, 3], (x, y, h) => {
        if (!isMapCell(x, y)) return false;
        const level = ['wall', 'gate'].includes(cellTerrain(state, x, y)) ? 'wall' : 'ground';
        return h === cellHeight(state, x, y, level);
      });
      expect(candidates).toContainEqual({ x: 18, y: 15, h: 0 });
      // The centre of the 46px green rect is exactly the plane-overlap boundary.
      if (fraction < 0.5) expect(candidates[0]).toEqual({ x: 18, y: 16, h: 3 });
      const picked = pickMapPosition(state, sx, sy, unit.id, reachable, 'shu', true);
      expect(picked).toEqual(ground);
      expect(
        resolveMapClick({ state, selected: unit.id, reachable, mode: 'move' }, picked),
      ).toEqual({ type: 'move', cell: ground });
    },
  );

  it('the room-to-move ramp rect centre wins when both it and the wall are green', () => {
    const { state, unit } = fixture();
    const ramp = { x: 20, y: 15, level: 'ground' as const };
    const reachable = reachableCells(state, unit.id);
    expect(reachable).toEqual(
      expect.arrayContaining([
        expect.objectContaining(ramp),
        expect.objectContaining({ x: 20, y: 16, level: 'wall' }),
      ]),
    );
    const [sx, sy] = project(FRAME, 20.5, 15.5, cellHeight(state, 20, 15, 'ground'));
    expect(pickMapPosition(state, sx, sy, unit.id, reachable)).toEqual(ramp);
  });

  it('a click on a visible unit selects it unless Move or Fill is pressed', () => {
    const { state, unit } = fixture();
    const other = { ...unit, id: 'shu-other', ...wall, x: 19 };
    Object.assign(unit, { x: 18 });
    state.units.push(other);
    const reachable = reachableCells(state, unit.id);
    const behind = { x: 19, y: 15, level: 'ground' as const };
    expect(reachable).toEqual(expect.arrayContaining([expect.objectContaining(behind)]));
    const [sx, sy] = project(FRAME, 19.5, 15.25);
    const picked = pickMapPosition(state, sx, sy, unit.id, reachable);
    expect(picked).toEqual({ x: 19, y: 16, level: 'wall' });
    expect(resolveMapClick({ state, selected: unit.id, reachable }, picked)).toEqual({
      type: 'select',
      id: other.id,
    });
    expect(pickMapPosition(state, sx, sy, unit.id, reachable, 'shu', true)).toEqual(behind);
  });

  it('prefers living occupancy, then green, then falls back to the highest plane', () => {
    const { state, unit } = fixture();
    Object.assign(unit, { x: 17 });
    const [sx, sy] = project(FRAME, 18.5, 15.25);
    expect(pickMapPosition(state, sx, sy)).toEqual(wall);
    const behind = { ...unit, id: 'behind', ...ground };
    state.units.push(behind);
    expect(pickMapPosition(state, sx, sy)).toEqual(ground);
    state.units.push({ ...unit, id: 'on-wall', ...wall });
    expect(pickMapPosition(state, sx, sy)).toEqual(wall);
    expect(pickMapPosition(state, sx, sy, unit.id, [ground])).toEqual(wall);
    expect(pickMapPosition(state, sx, sy, unit.id, [ground], 'shu', true)).toEqual(ground);
    behind.troops = 0;
    state.units.pop();
    expect(pickMapPosition(state, sx, sy)).toEqual(wall);
    // A stale reachable array has no priority without a living selected actor.
    expect(pickMapPosition(state, sx, sy, null, [ground])).toEqual(wall);
  });

  it('deduplicates planes, sorts highest first and preserves pickCell as the first candidate', () => {
    const [sx, sy] = project(FRAME, 18.5, 15.25);
    const candidates = pickCandidates(FRAME, sx, sy, [0, 3, 1, 3], () => true);
    expect(candidates.map((c) => c.h)).toEqual([3, 1, 0]);
    expect(pickCell(FRAME, sx, sy, [0, 3, 1, 3], () => true)).toEqual(candidates[0]);
    expect(pickCandidates(FRAME, sx, sy, [0, 3], () => false)).toEqual([]);
    expect(pickCell(FRAME, sx, sy, [0, 3], () => false)).toBeNull();
  });
});
