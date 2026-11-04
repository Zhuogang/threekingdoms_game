import { describe, expect, it } from 'vitest';
import { RAMPS, cellKey } from '../../src/siege/content/chencang';
import { engineReachable, pathTo, reachableCells } from '../../src/siege/rules/movement';
import { createSiegeState } from '../../src/siege/rules/state';
import type {
  EngineKind,
  SiegeEngine,
  SiegeLevel,
  SiegePosition,
  SiegeSide,
  SiegeState,
} from '../../src/siege/rules/types';

function fixture(side: SiegeSide, x: number, y: number, level: SiegeLevel = 'ground') {
  const state = createSiegeState(42);
  const unit = state.units.find((u) => u.side === side)!;
  Object.assign(unit, { x, y, level });
  state.units = [unit];
  state.engines = [];
  return { state, unit };
}

function engine(
  kind: EngineKind,
  x: number,
  y: number,
  changes: Partial<SiegeEngine> = {},
): SiegeEngine {
  return {
    id: 'engine',
    kind,
    x,
    y,
    durability: 120,
    max: 120,
    burning: false,
    wrecked: false,
    ...changes,
  };
}

const ground = ({ x, y }: { x: number; y: number }): SiegePosition => ({ x, y, level: 'ground' });
const wall = ({ x, y }: { x: number; y: number }): SiegePosition => ({ x, y, level: 'wall' });
const key = (p: SiegePosition) => `${cellKey(p)},${p.level}`;
const withoutCost = ({ x, y, level }: SiegePosition): SiegePosition => ({ x, y, level });

describe('wall walkways and ramp connections', () => {
  it('can traverse the entire wall ring and gate tops over successive budget-limited moves', () => {
    const { state, unit } = fixture('wei', 22, 16, 'wall');
    expect(pathTo(state, unit.id, 25, 16, 'wall')).toEqual([
      wall({ x: 22, y: 16 }),
      wall({ x: 23, y: 16 }),
      wall({ x: 24, y: 16 }),
      wall({ x: 25, y: 16 }),
    ]);
    // Explore one-step wall moves so no inferred route can leave the wall.
    const queue: SiegePosition[] = [wall({ x: 22, y: 16 })];
    const seen = new Set(queue.map(key));
    for (let i = 0; i < queue.length; i++) {
      Object.assign(unit, queue[i]);
      for (const next of reachableCells(state, unit.id)) {
        if (next.level !== 'wall' || next.cost !== 1 || seen.has(key(next))) continue;
        const path = pathTo(state, unit.id, next.x, next.y, next.level)!;
        expect(path.every((p) => p.level === 'wall')).toBe(true);
        seen.add(key(next));
        queue.push(withoutCost(next));
      }
    }
    for (const p of [
      { x: 20, y: 4 },
      { x: 23, y: 4 },
      { x: 24, y: 4 },
      { x: 14, y: 10 },
      { x: 33, y: 10 },
    ]) {
      expect(seen.has(key(wall(p)))).toBe(true);
    }
    expect(seen.size).toBe(62);
  });

  it('cannot step off an ordinary wall cell onto the adjacent ground or switch gate levels', () => {
    const { state, unit } = fixture('wei', 18, 16, 'wall');
    expect(pathTo(state, unit.id, 18, 15, 'ground')).toBeNull();
    expect(
      reachableCells(state, unit.id)
        .filter((p) => p.cost === 1)
        .every((p) => p.level === 'wall'),
    ).toBe(true);
    Object.assign(unit, { x: 23, y: 16 });
    expect(pathTo(state, unit.id, 23, 16, 'ground')).toBeNull();
  });

  it.each(RAMPS)('uses only the high and low endpoint connections on $id', (ramp) => {
    const { state, unit } = fixture('wei', ramp.wall.x, ramp.wall.y, 'wall');
    const [low, middle, high] = ramp.cells;
    const oneStep = () =>
      reachableCells(state, unit.id)
        .filter((p) => p.cost === 1)
        .map(withoutCost);
    expect(oneStep().filter((p) => p.level === 'ground')).toEqual([ground(high!)]);

    Object.assign(unit, ground(high!));
    expect(oneStep()).toEqual(expect.arrayContaining([ground(middle!), wall(ramp.wall)]));
    expect(oneStep()).toHaveLength(2);

    Object.assign(unit, ground(middle!));
    expect(oneStep()).toEqual(expect.arrayContaining([ground(low!), ground(high!)]));
    expect(oneStep()).toHaveLength(2);

    Object.assign(unit, ground(low!));
    expect(oneStep()).toEqual(expect.arrayContaining([ground(middle!), ground(ramp.ground)]));
    expect(oneStep()).toHaveLength(2);

    Object.assign(unit, ground(ramp.ground));
    expect(pathTo(state, unit.id, low!.x, low!.y, 'ground')).toEqual([
      ground(ramp.ground),
      ground(low!),
    ]);
    expect(pathTo(state, unit.id, high!.x, high!.y, 'ground')).toHaveLength(4);
    expect(pathTo(state, unit.id, ramp.wall.x, ramp.wall.y, 'wall')).toBeNull();
  });

  it('does not let ground units enter a ramp sideways', () => {
    const { state, unit } = fixture('wei', 21, 14);
    expect(pathTo(state, unit.id, 21, 15, 'ground')).toBeNull();
    expect(pathTo(state, unit.id, 20, 15, 'ground')).toBeNull();
    Object.assign(unit, { x: 21, y: 16, level: 'wall' });
    const steps = reachableCells(state, unit.id).filter((p) => p.cost === 1);
    expect(steps.some((p) => p.x === 21 && p.y === 15)).toBe(false);
  });

  it('lets Shu on the wall use the same ramp to descend into the city', () => {
    const ramp = RAMPS.find((r) => r.wall.x === 20 && r.wall.y === 16)!;
    const { state, unit } = fixture('shu', 20, 16, 'wall');
    const low = ramp.cells[0]!;
    expect(pathTo(state, unit.id, low.x, low.y, 'ground')).toEqual([
      wall(ramp.wall),
      ...[...ramp.cells].reverse().map(ground),
    ]);
    Object.assign(unit, ground(low));
    expect(pathTo(state, unit.id, ramp.ground.x, ramp.ground.y, 'ground')).toEqual([
      ground(low),
      ground(ramp.ground),
    ]);
  });
});

describe('Shu approaches, climbing and gates', () => {
  it('cannot enter an unfilled trench or climb the wall from south of the trench', () => {
    const { state, unit } = fixture('shu', 20, 19);
    expect(pathTo(state, unit.id, 20, 18, 'ground')).toBeNull();
    expect(pathTo(state, unit.id, 20, 16, 'wall')).toBeNull();
    expect(reachableCells(state, unit.id).every((p) => p.y >= 19 && p.level === 'ground')).toBe(
      true,
    );
  });

  it('crosses a filled trench pair but steps onto the wall only from a finished mound', () => {
    const { state, unit } = fixture('shu', 20, 19);
    state.trenchFill['20,18'] = 3;
    state.trenchFill['20,17'] = 2;
    expect(pathTo(state, unit.id, 20, 17, 'ground')).toBeNull();
    state.trenchFill['20,17'] = 3;
    expect(pathTo(state, unit.id, 20, 17, 'ground')).toEqual([
      ground({ x: 20, y: 19 }),
      ground({ x: 20, y: 18 }),
      ground({ x: 20, y: 17 }),
    ]);
    expect(pathTo(state, unit.id, 20, 16, 'wall')).toBeNull();
    state.mounds['20,17'] = 6;
    expect(pathTo(state, unit.id, 20, 16, 'wall')).toEqual([
      ground({ x: 20, y: 19 }),
      ground({ x: 20, y: 18 }),
      ground({ x: 20, y: 17 }),
      wall({ x: 20, y: 16 }),
    ]);
    state.units.push({
      ...unit,
      officer: { ...unit.officer },
      id: 'defender',
      side: 'wei',
      x: 20,
      y: 16,
      level: 'wall',
    });
    expect(pathTo(state, unit.id, 20, 16, 'wall')).toBeNull();
  });

  it('admits troops to a raised ladder base but requires the climb action', () => {
    const { state, unit } = fixture('shu', 20, 20);
    state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
    expect(pathTo(state, unit.id, 20, 19, 'ground')).toEqual([
      ground(unit),
      ground({ x: 20, y: 19 }),
    ]);
    expect(pathTo(state, unit.id, 20, 16, 'wall')).toBeNull();
    Object.assign(unit, { x: 20, y: 19 });
    expect(pathTo(state, unit.id, 20, 16, 'wall')).toBeNull();
    state.units.push({ ...unit, id: 'defender', side: 'wei', x: 20, y: 16, level: 'wall' });
    expect(pathTo(state, unit.id, 20, 16, 'wall')).toBeNull();
  });

  it.each(['unraised', 'wrecked', 'destroyed'] as const)(
    'cannot climb a %s ladder',
    (condition) => {
      const { state, unit } = fixture('shu', 20, 20);
      state.engines = [
        engine('ladder', 20, 19, {
          ...(condition !== 'unraised' ? { raisedAt: { x: 20, y: 16 } } : {}),
          ...(condition === 'wrecked' ? { wrecked: true } : {}),
          ...(condition === 'destroyed' ? { durability: 0 } : {}),
        }),
      ];
      if (condition === 'unraised')
        expect(pathTo(state, unit.id, 20, 19, 'ground')).toEqual([
          ground(unit),
          ground({ x: 20, y: 19 }),
        ]);
      else expect(pathTo(state, unit.id, 20, 19, 'ground')).toBeNull();
      expect(pathTo(state, unit.id, 20, 16, 'wall')).toBeNull();
    },
  );

  it.each(['ram', 'earthCart', 'tower'] as const)('a %s still blocks troops', (kind) => {
    const { state, unit } = fixture('shu', 20, 20);
    state.engines = [engine(kind, 20, 19)];
    expect(pathTo(state, unit.id, 20, 19, 'ground')).toBeNull();
  });

  it('opens the ground-level south gate to Shu only after it breaks; Wei can use the intact passage', () => {
    const { state, unit } = fixture('shu', 23, 17);
    expect(pathTo(state, unit.id, 23, 16, 'ground')).toBeNull();
    state.gates.south = { durability: 0, max: 800, broken: true };
    expect(pathTo(state, unit.id, 23, 15, 'ground')).toEqual([
      ground({ x: 23, y: 17 }),
      ground({ x: 23, y: 16 }),
      ground({ x: 23, y: 15 }),
    ]);
    state.gates.south = { durability: 800, max: 800, broken: false };
    unit.side = 'wei';
    expect(pathTo(state, unit.id, 23, 15, 'ground')).not.toBeNull();
  });

  it('does not let Wei climb from a filled wall foot', () => {
    const { state, unit } = fixture('wei', 18, 17);
    state.trenchFill['18,17'] = 3;
    expect(pathTo(state, unit.id, 18, 16, 'wall')).toBeNull();
  });
});

describe('budgets, obstacles and deterministic paths', () => {
  it.each([
    [5, 5, 4, 5],
    [5, 6, 4, 6],
    [9, 27, 10, 27],
  ])('charges two to enter hill or wood from (%i,%i)', (x, y, tx, ty) => {
    const { state, unit } = fixture('shu', x, y);
    expect(reachableCells(state, unit.id).find((p) => p.x === tx && p.y === ty)?.cost).toBe(2);
  });

  it('charges one for courtyard and works, and blocks hall buildings and completed inner walls', () => {
    const { state, unit } = fixture('wei', 24, 7);
    expect(reachableCells(state, unit.id)).toContainEqual({
      x: 25,
      y: 7,
      level: 'ground',
      cost: 1,
    });
    expect(pathTo(state, unit.id, 25, 6, 'ground')).toBeNull();
    Object.assign(unit, { x: 17, y: 15 });
    state.innerWall[1] = 2;
    expect(reachableCells(state, unit.id)).toContainEqual({
      x: 17,
      y: 14,
      level: 'ground',
      cost: 1,
    });
    state.innerWall[1] = 4;
    expect(pathTo(state, unit.id, 17, 14, 'ground')).toBeNull();
    expect(pathTo(state, unit.id, 17, 14, 'wall')).toBeNull();
    state.innerWall[0] = 4;
    Object.assign(unit, { x: 14, y: 14, level: 'wall' });
    expect(pathTo(state, unit.id, 15, 14, 'wall')).toEqual([
      wall({ x: 14, y: 14 }),
      wall({ x: 15, y: 14 }),
    ]);
    expect(pathTo(state, unit.id, 16, 14, 'ground')).toBeNull();
  });

  it.each(['unit', 'engine', 'wreck'] as const)(
    'cannot enter or pass through an occupied %s cell',
    (obstacle) => {
      const { state, unit } = fixture('shu', 20, 20);
      if (obstacle === 'unit') state.units.push({ ...unit, id: 'blocker', x: 21, y: 20 });
      else state.engines.push(engine('earthCart', 21, 20, { wrecked: obstacle === 'wreck' }));
      expect(pathTo(state, unit.id, 21, 20, 'ground')).toBeNull();
      expect(pathTo(state, unit.id, 22, 20, 'ground')).toBeNull();
    },
  );

  it('keeps gate-top and passage occupancy on separate levels', () => {
    const { state, unit } = fixture('wei', 22, 16, 'wall');
    state.units.push({ ...unit, id: 'below', x: 23, y: 16, level: 'ground' });
    expect(pathTo(state, unit.id, 23, 16, 'wall')).not.toBeNull();
    Object.assign(state.units[1]!, { level: 'wall' });
    expect(pathTo(state, unit.id, 23, 16, 'wall')).toBeNull();
  });

  it('limits paths to the reused infantry/archer budget and never mutates its input', () => {
    const { state, unit } = fixture('shu', 20, 20);
    const original = JSON.stringify(state);
    expect(pathTo(state, unit.id, 23, 20, 'ground')).toHaveLength(4);
    expect(pathTo(state, unit.id, 24, 20, 'ground')).toBeNull();
    expect(pathTo(state, unit.id, 20, 20, 'ground')).toEqual([ground({ x: 20, y: 20 })]);
    expect(reachableCells(state, unit.id).every((p) => p.cost <= 3 && p.cost > 0)).toBe(true);
    expect(reachableCells(state, unit.id)).toEqual(reachableCells(state, unit.id));
    expect(pathTo(state, unit.id, -1, 20, 'ground')).toBeNull();
    expect(JSON.stringify(state)).toBe(original);
    unit.troopType = 'archer';
    expect(pathTo(state, unit.id, 24, 20, 'ground')).toBeNull();
  });

  it('rejects unavailable units, out-of-map cells and water', () => {
    const { state, unit } = fixture('shu', 20, 1);
    expect(pathTo(state, unit.id, 20, 0, 'ground')).toBeNull();
    expect(reachableCells(state, 'missing')).toEqual([]);
    for (const changes of [
      { moved: true },
      { routed: true },
      { troops: 0 },
      { x: 48 },
      { y: -1 },
    ]) {
      const modified = structuredClone(state);
      Object.assign(modified.units[0]!, changes);
      expect(reachableCells(modified, unit.id)).toEqual([]);
    }
  });
});

describe('engine movement', () => {
  const engineState = (kind: EngineKind, x: number, y: number): SiegeState => {
    const state = createSiegeState(10);
    state.units = [];
    state.engines = [engine(kind, x, y)];
    return state;
  };

  it('allows rams on plain ground and bridges with three movement points', () => {
    const state = engineState('ram', 23, 19);
    const cells = engineReachable(state, 'engine');
    expect(cells).toContainEqual({ x: 23, y: 17, level: 'ground', cost: 2 });
    expect(cells).toContainEqual({ x: 22, y: 19, level: 'ground', cost: 1 });
    expect(cells.every((p) => p.level === 'ground' && p.cost <= 3)).toBe(true);
    expect(cells.some((p) => p.x === 23 && p.y === 16)).toBe(false);
  });

  it('lets newly built rams leave workshop exits but never use a filled trench', () => {
    const state = engineState('ram', 16, 25);
    expect(engineReachable(state, 'engine')).toContainEqual({
      x: 17,
      y: 25,
      level: 'ground',
      cost: 1,
    });
    Object.assign(state.engines[0]!, { x: 20, y: 19 });
    state.trenchFill['20,18'] = 3;
    state.trenchFill['20,17'] = 3;
    expect(engineReachable(state, 'engine').some((p) => p.y < 19)).toBe(false);
  });

  it('admits rams into a broken gate but cannot enter an intact gate or its wall level', () => {
    const state = engineState('ram', 23, 17);
    expect(engineReachable(state, 'engine').some((p) => p.y === 16)).toBe(false);
    state.gates.south = { durability: 0, max: 800, broken: true };
    expect(engineReachable(state, 'engine')).toContainEqual({
      x: 23,
      y: 16,
      level: 'ground',
      cost: 1,
    });
    expect(engineReachable(state, 'engine')).toContainEqual({
      x: 23,
      y: 15,
      level: 'ground',
      cost: 2,
    });
    expect(engineReachable(state, 'engine').every((p) => p.level === 'ground')).toBe(true);
  });

  it.each(['ladder', 'earthCart', 'tower'] as const)(
    'allows a %s on plain terrain only, including filled trenches',
    (kind) => {
      const state = engineState(kind, 20, 19);
      expect(engineReachable(state, 'engine').some((p) => p.y === 18)).toBe(false);
      state.trenchFill['20,18'] = 3;
      expect(engineReachable(state, 'engine')).toContainEqual({
        x: 20,
        y: 18,
        level: 'ground',
        cost: 1,
      });
      state.engines[0]!.x = 5;
      state.engines[0]!.y = 5;
      expect(engineReachable(state, 'engine').some((p) => p.x === 4 && p.y === 5)).toBe(false);
      state.engines[0]!.x = 24;
      state.engines[0]!.y = 7;
      expect(engineReachable(state, 'engine').some((p) => p.x === 25 && p.y === 7)).toBe(false);
      state.engines[0]!.x = 23;
      state.engines[0]!.y = 15;
      expect(engineReachable(state, 'engine').some((p) => p.x === 22 && p.y === 15)).toBe(false);
    },
  );

  it('limits towers to two points and other engines to three', () => {
    for (const kind of ['ladder', 'earthCart', 'tower'] as const) {
      const state = engineState(kind, 20, 20);
      const cells = engineReachable(state, 'engine');
      const budget = kind === 'tower' ? 2 : 3;
      expect(Math.max(...cells.map((p) => p.cost))).toBe(budget);
      expect(cells.some((p) => p.x === 22 && p.y === 20)).toBe(true);
    }
  });

  it('blocks engines with units and wrecks, and does not move destroyed engines', () => {
    const state = engineState('earthCart', 20, 20);
    state.engines.push(engine('ram', 21, 20, { id: 'wreck', wrecked: true, durability: 0 }));
    const blocker = createSiegeState(1).units[0]!;
    state.units.push({ ...blocker, x: 19, y: 20, level: 'ground' });
    const original = JSON.stringify(state);
    const cells = engineReachable(state, 'engine');
    expect(cells.some((p) => p.y === 20 && [19, 21, 22].includes(p.x))).toBe(false);
    expect(JSON.stringify(state)).toBe(original);
    expect(engineReachable(state, 'wreck')).toEqual([]);
    expect(engineReachable(state, 'missing')).toEqual([]);
    state.engines[0]!.durability = 0;
    expect(engineReachable(state, 'engine')).toEqual([]);
  });
});
