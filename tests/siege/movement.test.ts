import { describe, expect, it } from 'vitest';
import {
  CHENCANG_LAYOUT,
  GATES,
  MAP_WIDTH,
  RAMPS,
  cellKey,
} from '../../src/siege/content/chencang';
import { SOUTH_WALL_ROW, ROAD_COL, APPROACH_ROW } from '../../src/siege/content/coarseGrid';
import { engineReachable, pathTo, reachableCells } from '../../src/siege/rules/movement';
import { createSiegeState } from '../../src/siege/rules/state';
import type { EngineKind, SiegePosition, SiegeState } from '../../src/siege/rules/types';
import {
  engine,
  isolatedUnit,
  approach,
  southWall,
  southInside,
  innerTrench,
  outerTrench,
  ground,
  wall,
} from './rulesFixtures';
const key = (p: SiegePosition) => `${cellKey(p)},${p.level}`;
const at = (state: SiegeState, id: string, p: SiegePosition) =>
  pathTo(state, id, p.x, p.y, p.level);

describe('wall walkways and ramp connections', () => {
  it('traverses the entire wall ring and gate tops over ordinary moves', () => {
    const { state, unit } = isolatedUnit('wei', southWall(7));
    expect(at(state, unit.id, southWall(9))).toEqual([southWall(7), southWall(8), southWall(9)]);
    const queue = [southWall(7)],
      seen = new Set(queue.map(key));
    for (let i = 0; i < queue.length; i++) {
      Object.assign(unit, queue[i]);
      for (const p of reachableCells(state, unit.id)) {
        if (p.level !== 'wall' || p.cost !== 1 || seen.has(key(p))) continue;
        expect(at(state, unit.id, p)!.every((c) => c.level === 'wall')).toBe(true);
        seen.add(key(p));
        queue.push(wall(p));
      }
    }
    const all = CHENCANG_LAYOUT.flatMap((r, y) =>
      [...r].flatMap((s, x) => ('WOG'.includes(s) ? [wall({ x, y })] : [])),
    );
    expect(seen).toEqual(new Set(all.map(key)));
    expect(seen.size).toBe(26);
    for (const gate of Object.values(GATES)) expect(seen.has(key(wall(gate.cells[0]!)))).toBe(true);
  });
  it('steps down inside but cannot switch gate levels in place', () => {
    const { state, unit } = isolatedUnit('wei', southWall(7));
    expect(at(state, unit.id, southInside(7))).toEqual([southWall(7), southInside(7)]);
    Object.assign(unit, southWall(8));
    expect(at(state, unit.id, ground(unit))).toEqual([southWall(8), southInside(8), ground(unit)]);
  });
  it.each(RAMPS)('$id admits entry, ascent, descent and side exits', (ramp) => {
    const { state, unit } = isolatedUnit('wei', wall(ramp.wall));
    expect(at(state, unit.id, ground(ramp.ground))).toEqual([wall(ramp.wall), ground(ramp.ground)]);
    Object.assign(unit, ground(ramp.ground));
    expect(at(state, unit.id, wall(ramp.wall))).toEqual([ground(ramp.ground), wall(ramp.wall)]);
    const exits = reachableCells(state, unit.id).filter(
      (p) => p.cost === 1 && p.level === 'ground',
    );
    expect(exits.length).toBeGreaterThanOrEqual(1);
    for (const exit of exits) {
      expect(Math.abs(exit.x - unit.x) + Math.abs(exit.y - unit.y)).toBe(1);
      Object.assign(unit, exit);
      expect(at(state, unit.id, ground(ramp.ground))).toEqual([ground(exit), ground(ramp.ground)]);
      Object.assign(unit, ground(ramp.ground));
    }
  });
  it('lets ground units enter a ramp sideways and wall units step down', () => {
    const { state, unit } = isolatedUnit('wei', southInside(8));
    expect(at(state, unit.id, southInside(7))).toEqual([southInside(8), southInside(7)]);
    Object.assign(unit, southWall(7));
    expect(at(state, unit.id, southInside(7))).toHaveLength(2);
  });
  it('lets Shu descend by the same ramp onto the interior road', () => {
    const { state, unit } = isolatedUnit('shu', southWall(7));
    expect(at(state, unit.id, southInside(8))).toEqual([
      southWall(7),
      southInside(7),
      southInside(8),
    ]);
  });
});
describe('Shu approaches, climbing and gates', () => {
  it('cannot enter unfilled trench or walk up the wall', () => {
    const { state, unit } = isolatedUnit('shu', approach());
    expect(at(state, unit.id, outerTrench())).toBeNull();
    expect(at(state, unit.id, southWall())).toBeNull();
    expect(
      reachableCells(state, unit.id).every(
        (p) => (p.y >= APPROACH_ROW || p.x === ROAD_COL) && p.level === 'ground',
      ),
    ).toBe(true);
  });
  it('crosses filled trenches and walks up only a complete mound', () => {
    const { state, unit } = isolatedUnit('shu', approach());
    state.trenchFill[cellKey(outerTrench())] = 3;
    state.trenchFill[cellKey(innerTrench())] = 2;
    expect(at(state, unit.id, innerTrench())).toBeNull();
    state.trenchFill[cellKey(innerTrench())] = 3;
    expect(at(state, unit.id, innerTrench())).toEqual([approach(), outerTrench(), innerTrench()]);
    expect(at(state, unit.id, southWall())).toBeNull();
    state.mounds[cellKey(innerTrench())] = 6;
    expect(at(state, unit.id, southWall())).toEqual([
      approach(),
      outerTrench(),
      innerTrench(),
      southWall(),
    ]);
    state.units.push({ ...unit, id: 'enemy', side: 'wei', ...southWall() });
    expect(at(state, unit.id, southWall())).toBeNull();
  });
  it('admits troops to a raised ladder base but requires a climb action', () => {
    const { state, unit } = isolatedUnit('shu', approach(5));
    state.engines = [engine('ladder', 6, APPROACH_ROW, { raisedAt: southWall() })];
    expect(at(state, unit.id, approach())).toEqual([approach(5), approach()]);
    expect(at(state, unit.id, southWall())).toBeNull();
    Object.assign(unit, approach());
    expect(at(state, unit.id, southWall())).toBeNull();
    state.units.push({ ...unit, id: 'enemy', side: 'wei', ...southWall() });
    expect(at(state, unit.id, southWall())).toBeNull();
  });
  it.each(['unraised', 'wrecked', 'destroyed'] as const)(
    'cannot climb a %s ladder',
    (condition) => {
      const { state, unit } = isolatedUnit('shu', approach(5));
      state.engines = [
        engine('ladder', 6, APPROACH_ROW, {
          ...(condition !== 'unraised' ? { raisedAt: southWall() } : {}),
          ...(condition === 'wrecked' ? { wrecked: true } : {}),
          ...(condition === 'destroyed' ? { durability: 0 } : {}),
        }),
      ];
      expect(at(state, unit.id, approach())).toEqual([approach(5), approach()]);
      expect(at(state, unit.id, southWall())).toBeNull();
    },
  );
  it.each(['ram', 'earthCart', 'tower'] as const)('%s blocks troops', (kind) => {
    const { state, unit } = isolatedUnit('shu', approach(5));
    state.engines = [engine(kind, 6, APPROACH_ROW)];
    expect(at(state, unit.id, approach())).toBeNull();
  });
  it('admits Shu through a broken gate and Wei through an intact passage', () => {
    const { state, unit } = isolatedUnit('shu', innerTrench(ROAD_COL));
    expect(at(state, unit.id, ground(southWall(ROAD_COL)))).toBeNull();
    state.gates.south = { durability: 0, max: 800, broken: true };
    expect(at(state, unit.id, southInside())).toEqual([
      innerTrench(ROAD_COL),
      ground(southWall(ROAD_COL)),
      southInside(),
    ]);
    state.gates.south = { durability: 800, max: 800, broken: false };
    unit.side = 'wei';
    expect(at(state, unit.id, southInside())).toHaveLength(3);
  });
  it('does not let Wei climb a filled exterior wall foot', () => {
    const { state, unit } = isolatedUnit('wei', innerTrench());
    state.trenchFill[cellKey(innerTrench())] = 3;
    expect(at(state, unit.id, southWall())).toBeNull();
  });
});
describe('budgets, obstacles and deterministic paths', () => {
  it.each([
    [1, 2, 0, 2],
    [1, 4, 0, 4],
    [2, 11, 2, 12],
  ])('charges two to enter hill or wood from %i,%i', (x, y, tx, ty) => {
    const { state, unit } = isolatedUnit('shu', ground({ x, y }));
    expect(reachableCells(state, unit.id).find((p) => p.x === tx && p.y === ty)?.cost).toBe(2);
  });
  it('charges one for courtyard and construction ramps and replaces completed ramp planes', () => {
    const { state, unit } = isolatedUnit('wei', ground({ x: 8, y: 4 }));
    expect(reachableCells(state, unit.id)).toContainEqual({ x: 9, y: 4, level: 'ground', cost: 1 });
    expect(at(state, unit.id, ground({ x: 6, y: 4 }))).toBeNull();
    Object.assign(unit, southInside());
    state.innerWall[1] = 2;
    expect(reachableCells(state, unit.id)).toContainEqual({ ...southInside(7), cost: 1 });
    state.innerWall[1] = 4;
    expect(at(state, unit.id, southInside(7))).toBeNull();
    state.innerWall[0] = 4;
    Object.assign(unit, wall({ x: 4, y: 6 }));
    expect(at(state, unit.id, wall({ x: 5, y: 6 }))).toEqual([
      wall({ x: 4, y: 6 }),
      wall({ x: 5, y: 6 }),
    ]);
    expect(at(state, unit.id, ground({ x: 5, y: 6 }))).toBeNull();
  });
  it.each(['unit', 'engine'] as const)('cannot enter or pass through a blocking %s', (obstacle) => {
    const { state, unit } = isolatedUnit('shu', approach());
    if (obstacle === 'unit')
      state.units.push({ ...unit, id: 'enemy', side: 'wei', ...approach(7) });
    else state.engines.push(engine('earthCart', 7, APPROACH_ROW, {}));
    expect(at(state, unit.id, approach(7))).toBeNull();
    expect(at(state, unit.id, approach(8))).toBeNull();
  });
  it('shares gate occupancy across top and passage', () => {
    const { state, unit } = isolatedUnit('wei', southWall(7));
    state.units.push({ ...unit, id: 'below', ...ground(southWall(8)) });
    expect(at(state, unit.id, southWall(8))).toBeNull();
    state.units[1]!.level = 'wall';
    expect(at(state, unit.id, southWall(8))).toBeNull();
  });
  it('uses unchanged three-point budgets, deterministic paths and immutable input', () => {
    const { state, unit } = isolatedUnit('shu', approach(4));
    const original = JSON.stringify(state);
    expect(at(state, unit.id, approach(7))).toEqual([
      approach(4),
      approach(5),
      approach(6),
      approach(7),
    ]);
    expect(at(state, unit.id, approach(8))).toBeNull();
    expect(at(state, unit.id, approach(4))).toEqual([approach(4)]);
    expect(reachableCells(state, unit.id).every((p) => p.cost <= 3 && p.cost > 0)).toBe(true);
    expect(reachableCells(state, unit.id)).toEqual(reachableCells(state, unit.id));
    expect(pathTo(state, unit.id, -1, APPROACH_ROW, 'ground')).toBeNull();
    expect(JSON.stringify(state)).toBe(original);
    unit.troopType = 'archer';
    expect(at(state, unit.id, approach(8))).toBeNull();
  });
  it('rejects unavailable units and off-board water', () => {
    const { state, unit } = isolatedUnit('shu', ground({ x: 7, y: 0 }));
    expect(pathTo(state, unit.id, 7, -1, 'ground')).toBeNull();
    expect(reachableCells(state, 'missing')).toEqual([]);
    for (const changes of [
      { moved: true },
      { routed: true },
      { troops: 0 },
      { x: MAP_WIDTH },
      { y: -1 },
    ]) {
      const modified = structuredClone(state);
      Object.assign(modified.units[0]!, changes);
      expect(reachableCells(modified, unit.id)).toEqual([]);
    }
  });
});
describe('engine movement', () => {
  const fixture = (kind: EngineKind, x = 6, y = APPROACH_ROW) => {
    const state = createSiegeState(10);
    state.units = [];
    state.engines = [engine(kind, x, y)];
    return state;
  };
  it('allows rams on plain and bridges with three points', () => {
    const state = fixture('ram', 8),
      cells = engineReachable(state, 'engine');
    expect(cells).toContainEqual({ ...innerTrench(8), cost: 2 });
    expect(cells).toContainEqual({ ...approach(7), cost: 1 });
    expect(cells.every((p) => p.level === 'ground' && p.cost <= 3)).toBe(true);
    expect(cells.some((p) => p.y === SOUTH_WALL_ROW)).toBe(false);
  });
  it('lets rams leave north workshop exits but never use filled trench', () => {
    const state = fixture('ram');
    expect(engineReachable(state, 'engine')).toContainEqual({ ...approach(7), cost: 1 });
    state.trenchFill[cellKey(outerTrench())] = 3;
    state.trenchFill[cellKey(innerTrench())] = 3;
    expect(engineReachable(state, 'engine').some((p) => p.x === 6 && p.y < APPROACH_ROW)).toBe(
      false,
    );
  });
  it('admits rams to a broken gate and its interior floor', () => {
    const state = fixture('ram', 8, 8);
    expect(engineReachable(state, 'engine').some((p) => p.y === SOUTH_WALL_ROW)).toBe(false);
    state.gates.south = { durability: 0, max: 800, broken: true };
    expect(engineReachable(state, 'engine')).toContainEqual({ ...ground(southWall(8)), cost: 1 });
    expect(engineReachable(state, 'engine')).toContainEqual({ ...southInside(), cost: 2 });
    expect(engineReachable(state, 'engine').every((p) => p.level === 'ground')).toBe(true);
  });
  it.each(['ladder', 'earthCart', 'tower'] as const)(
    '%s only uses plain including filled trench',
    (kind) => {
      const state = fixture(kind);
      expect(engineReachable(state, 'engine').some((p) => p.x === 6 && p.y === 9)).toBe(false);
      state.trenchFill[cellKey(outerTrench())] = 3;
      expect(engineReachable(state, 'engine')).toContainEqual({ ...outerTrench(), cost: 1 });
      Object.assign(state.engines[0]!, { x: 1, y: 2 });
      expect(engineReachable(state, 'engine').some((p) => p.x === 0 && p.y === 2)).toBe(false);
      Object.assign(state.engines[0]!, { x: 8, y: 4 });
      expect(engineReachable(state, 'engine').some((p) => p.x === 6 && p.y === 4)).toBe(false);
      Object.assign(state.engines[0]!, southInside());
      expect(engineReachable(state, 'engine').some((p) => p.x === 7 && p.y === 6)).toBe(false);
    },
  );
  it('limits towers to two points and other engines to three', () => {
    for (const kind of ['ladder', 'earthCart', 'tower'] as const) {
      const cells = engineReachable(fixture(kind), 'engine');
      expect(Math.max(...cells.map((p) => p.cost))).toBe(kind === 'tower' ? 2 : 3);
      expect(cells).toContainEqual({ ...approach(8), cost: 2 });
    }
  });
  it('blocks engines with units, permits wrecks and never mutates input', () => {
    const state = fixture('earthCart');
    state.engines.push(
      engine('ram', 7, APPROACH_ROW, { id: 'wreck', wrecked: true, durability: 0 }),
    );
    state.units = [{ ...createSiegeState(1).units[0]!, ...approach(5) }];
    const original = JSON.stringify(state),
      cells = engineReachable(state, 'engine');
    expect(cells.some((p) => p.y === APPROACH_ROW && p.x === 5)).toBe(false);
    for (const x of [7, 8]) expect(cells.some((p) => p.y === APPROACH_ROW && p.x === x)).toBe(true);
    expect(JSON.stringify(state)).toBe(original);
    expect(engineReachable(state, 'wreck')).toEqual([]);
    expect(engineReachable(state, 'missing')).toEqual([]);
    state.engines[0]!.durability = 0;
    expect(engineReachable(state, 'engine')).toEqual([]);
  });
});
