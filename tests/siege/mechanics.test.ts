import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { describe, expect, it } from 'vitest';
import { INNER_WALL_SEGMENTS, WORKSHOPS } from '../../src/siege/content/chencang';
import { siegeBaseDamage } from '../../src/siege/rules/combat';
import { ENGINE_RULES, endDay } from '../../src/siege/rules/day';
import { cellTerrain } from '../../src/siege/rules/map';
import { pathTo } from '../../src/siege/rules/movement';
import { createSiegeState } from '../../src/siege/rules/state';
import { act, duel, engine, refused } from './rulesFixtures';

describe('gates and rams', () => {
  it('breaks the south gate after the tuned number of daily ram hits and opens the passage with a single morale shock', () => {
    let state = createSiegeState(3);
    state.engines = [engine('ram', 23, 17)];
    const hits = Math.ceil(T.southGateDurability / T.ramDamage);
    for (let day = 1; day <= hits; day++) {
      state = act(state, { type: 'ram', engineId: 'engine', gateId: 'south' });
      expect(state.gates.south.durability).toBe(
        Math.max(0, T.southGateDurability - day * T.ramDamage),
      );
      expect(state.gates.south.damaged).toBe(
        state.gates.south.durability < T.southGateDurability / 2,
      );
      if (day < hits) {
        refused(state, { type: 'ram', engineId: 'engine', gateId: 'south' });
        state = endDay(state);
      }
    }
    expect(state.gates.south.broken).toBe(true);
    expect(state.units.filter((unit) => unit.side === 'wei').map((unit) => unit.morale)).toEqual(
      Array(6).fill(70),
    );
    state.engines = [];
    const unit = state.units[1]!;
    Object.assign(unit, { x: 23, y: 17 });
    expect(pathTo(state, unit.id, 23, 15, 'ground')).not.toBeNull();
    refused(state, { type: 'ram', engineId: 'engine', gateId: 'south' });
  });

  it('deals a tenth of a 100-troop hit to a gate and rejects distant/wall attacks', () => {
    const { state, shu, wei } = duel({ x: 23, y: 17 }, { x: 23 });
    const normal = siegeBaseDamage(state, shu, { ...wei, level: 'ground' }, 100);
    const hit = act(state, { type: 'attack', unitId: shu.id, gateId: 'south' });
    expect(hit.gates.south.durability).toBe(T.southGateDurability - Math.floor(normal * 0.1));
    shu.y = 19;
    refused(state, { type: 'attack', unitId: shu.id, gateId: 'south' });
    Object.assign(shu, { x: 22, y: 16, level: 'wall' });
    refused(state, { type: 'attack', unitId: shu.id, gateId: 'south' });
  });
});

describe('trench filling and ladders', () => {
  it('refuses inner-first work and adds half a point from adjacent infantry', () => {
    const { state, shu } = duel({ x: 23, y: 17 });
    refused(state, { type: 'fillTrench', unitId: shu.id, x: 22, y: 17 }, /outer/);
    state.trenchFill['22,18'] = 3;
    const next = act(state, { type: 'fillTrench', unitId: shu.id, x: 22, y: 17 });
    expect(next.trenchFill['22,17']).toBe(0.5);
    refused(next, { type: 'fillTrench', unitId: shu.id, x: 22, y: 17 });
    refused(state, { type: 'fillTrench', unitId: shu.id, x: 21, y: 17 });
    shu.troopType = 'archer';
    refused(state, { type: 'fillTrench', unitId: shu.id, x: 22, y: 17 });
  });

  it('fills a cell in two cart loads and a second half cell with the last load, without wrecking', () => {
    let state = createSiegeState(4);
    state.engines = [engine('earthCart', 20, 19)];
    for (let count = 1; count <= 2; count++) {
      state = act(state, { type: 'fillTrench', engineId: 'engine', x: 20, y: 18 });
      expect(state.trenchFill['20,18']).toBe(count * 1.5);
      expect(state.engines[0]!.uses).toBe(3 - count);
      refused(state, { type: 'fillTrench', engineId: 'engine', x: 20, y: 18 });
      state = endDay(state);
    }
    expect(cellTerrain(state, 20, 18)).toBe('plain');
    state = act(state, { type: 'moveEngine', engineId: 'engine', x: 21, y: 19 });
    state = act(state, { type: 'fillTrench', engineId: 'engine', x: 21, y: 18 });
    expect(state.trenchFill['21,18']).toBe(1.5);
    expect(state.engines).toEqual([]);
    expect(state.enginesLostAct1 ?? 0).toBe(0);
  });

  it('takes six infantry actions to fill a cell and clamps mixed cart/infantry work at three', () => {
    let { state, shu } = duel();
    for (let day = 1; day <= 6; day++) {
      state = act(state, { type: 'fillTrench', unitId: shu.id, x: 20, y: 18 });
      expect(state.trenchFill['20,18']).toBe(day * 0.5);
      if (day < 6) state = endDay(state);
    }
    refused(state, { type: 'fillTrench', unitId: shu.id, x: 20, y: 18 });
    state = endDay(state);
    state.trenchFill['21,18'] = 2.5;
    state.engines = [engine('earthCart', 21, 19)];
    state = act(state, { type: 'fillTrench', engineId: 'engine', x: 21, y: 18 });
    expect(state.trenchFill['21,18']).toBe(3);
    expect(state.engines[0]!.uses).toBe(2);
  });

  it.each([0, 3] as const)(
    'raises a ladder over outer trench progress %i without moving its base',
    (progress) => {
      const { state, shu } = duel({ y: 20 });
      state.engines = [engine('ladder', 20, 19)];
      state.trenchFill['20,18'] = progress;
      const next = act(state, { type: 'raiseLadder', engineId: 'engine' });
      expect(next.engines[0]).toMatchObject({ x: 20, y: 19, raisedAt: { x: 20, y: 16 } });
      expect(pathTo(next, shu.id, 20, 19, 'ground')).not.toBeNull();
      refused(next, { type: 'moveEngine', engineId: 'engine', x: 21, y: 19 });
      state.trenchFill['20,18'] = 0.5;
      refused(state, { type: 'raiseLadder', engineId: 'engine' });
    },
  );
});

describe('workshops and engine movement', () => {
  it.each(['ladder', 'ram', 'earthCart', 'tower'] as const)(
    'builds a %s with the specified time and durability',
    (kind) => {
      let state = createSiegeState(5);
      state.act = 2;
      state.engines = [];
      state = act(state, { type: 'queueEngine', workshopId: 'workshop-1', kind });
      refused(state, { type: 'queueEngine', workshopId: 'workshop-1', kind });
      for (let day = 0; day < ENGINE_RULES[kind].days; day++) {
        expect(state.engines).toHaveLength(0);
        state = endDay(state);
      }
      expect(state.engines).toHaveLength(1);
      expect(state.engines[0]).toMatchObject({
        ...WORKSHOPS[0]!.spawn,
        kind,
        durability: ENGINE_RULES[kind].durability,
        max: ENGINE_RULES[kind].durability,
      });
      expect(state.workshops[0]!.queue).toBeNull();
      if (kind === 'earthCart') expect(state.engines[0]!.uses).toBe(3);
    },
  );

  it('spawns at the nearest free cell if the exit is occupied', () => {
    let state = createSiegeState(6);
    state.engines = [];
    Object.assign(state.units[1]!, WORKSHOPS[0]!.spawn);
    state = act(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'earthCart' });
    state = endDay(state);
    expect(state.engines[0]).toMatchObject({ x: 15, y: 25 });
  });

  it('caps map engines at eight even when two workshops finish together; wrecks retain their cells', () => {
    let state = createSiegeState(7);
    state.engines = Array.from({ length: 7 }, (_, x) =>
      engine('ladder', x, 25, { id: `old-${x}` }),
    );
    state = act(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'earthCart' });
    state = act(state, { type: 'queueEngine', workshopId: 'workshop-2', kind: 'earthCart' });
    state = endDay(state);
    expect(state.engines).toHaveLength(8);
    expect(state.workshops[1]).toMatchObject({ queue: 'earthCart', daysRemaining: 0 });
    refused(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'ladder' });
    Object.assign(state.engines[0]!, { durability: 0, wrecked: true });
    state = endDay(state);
    expect(state.engines).toHaveLength(9);
    expect(state.engines.filter((entry) => !entry.wrecked)).toHaveLength(8);
    expect(state.engines[0]).toMatchObject({ x: 0, y: 25, wrecked: true });
  });

  it('unlocks towers in act 2 and enforces move-once then act, including engines', () => {
    let state = createSiegeState(8);
    refused(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'tower' });
    const unitId = state.units[1]!.id;
    state = act(state, { type: 'move', unitId, x: 20, y: 20, level: 'ground' });
    refused(state, { type: 'move', unitId, x: 21, y: 20, level: 'ground' });
    state.engines = [engine('earthCart', 19, 19)];
    state = act(state, { type: 'moveEngine', engineId: 'engine', x: 20, y: 19 });
    state = act(state, { type: 'fillTrench', engineId: 'engine', x: 20, y: 18 });
    refused(state, { type: 'moveEngine', engineId: 'engine', x: 21, y: 19 });
    state = endDay(state);
    state = act(state, { type: 'move', unitId, x: 21, y: 19, level: 'ground' });
    state = act(state, { type: 'fillTrench', unitId, x: 21, y: 18 });
    refused(state, { type: 'move', unitId, x: 22, y: 19, level: 'ground' });
  });
});

function readyCounters(state: ReturnType<typeof createSiegeState>) {
  state.day = 2;
  for (const unit of state.units.filter(
    (entry) => entry.side === 'wei' && entry.level === 'wall',
  )) {
    const cell = `${unit.x},${unit.y}`;
    state.preparations.braziers[cell] = { litDay: 1 };
    state.preparations.millstones[cell] = { hoisted: true, day: 1 };
    state.preparations.boulders[cell] = { day: 1 };
  }
}

describe('Wei countermeasures', () => {
  it.each([
    ['clear', 1],
    ['wind', T.windFireMultiplier],
    ['snow', T.snowFireMultiplier],
  ] as const)(
    'applies %s fire-arrow damage and then burns for twenty at day end',
    (weather, weatherMultiplier) => {
      const damage = Math.floor(200 * T.fireArrowCoefficient * weatherMultiplier);
      const { state, wei } = duel({}, { troopType: 'archer', troops: 200 });
      readyCounters(state);
      state.weather = weather;
      state.engines = [engine('tower', 20, 19)];
      const shot = act(state, { type: 'fireArrows', unitId: wei.id, engineId: 'engine' });
      expect(shot.engines[0]).toMatchObject({ durability: 250 - damage, burning: true });
      expect(endDay(shot).engines[0]!.durability).toBe(230 - damage);
      refused(shot, { type: 'fireArrows', unitId: wei.id, engineId: 'engine' });
      state.engines[0]!.y = 20;
      refused(state, { type: 'fireArrows', unitId: wei.id, engineId: 'engine' });
    },
  );

  it('floors the fire-arrow formula before changing durability', () => {
    const { state, wei } = duel({}, { troopType: 'archer', troops: 251 });
    readyCounters(state);
    state.weather = 'snow';
    state.engines = [engine('tower', 20, 19)];
    expect(
      act(state, { type: 'fireArrows', unitId: wei.id, engineId: 'engine' }).engines[0]!.durability,
    ).toBe(250 - Math.floor(251 * T.fireArrowCoefficient * T.snowFireMultiplier));
  });

  it('recognizes boulder exposure from an attack earlier in the day, including wall-foot attacks', () => {
    const { state, shu, wei } = duel({ y: 17, attackedFromBelowDay: 2 });
    readyCounters(state);
    state.trenchFill['20,17'] = 3;
    expect(
      act(state, { type: 'dropBoulders', unitId: wei.id, targetId: shu.id }).units[0]!.troops,
    ).toBe(2000 - Math.floor(300 * T.boulderCoefficient * T.climbingBoulderMultiplier));
    shu.attackedFromBelowDay = 0;
    expect(
      act(state, { type: 'dropBoulders', unitId: wei.id, targetId: shu.id }).units[0]!.troops,
    ).toBe(2000 - Math.floor(300 * T.boulderCoefficient));
  });

  it('turns destroyed engines into blocking wrecks and schedules act 2 after two losses', () => {
    const { state, wei } = duel({}, { troopType: 'archer', troops: 300 });
    readyCounters(state);
    state.engines = [
      engine('ladder', 20, 19, { durability: 100 }),
      engine('ladder', 21, 19, { id: 'second', durability: 10, burning: true }),
    ];
    const shot = act(state, { type: 'fireArrows', unitId: wei.id, engineId: 'engine' });
    expect(shot.engines[0]).toMatchObject({ durability: 0, wrecked: true, burning: false });
    const next = endDay(shot);
    expect(next.act).toBe(2);
    expect(next.day).toBe(3);
    expect(next.enginesLostAct1).toBe(2);
    Object.assign(next.units[0]!, { x: 20, y: 20 });
    expect(pathTo(next, next.units[0]!.id, 20, 19, 'ground')).toBeNull();
    refused(next, { type: 'moveEngine', engineId: 'engine', x: 19, y: 19 });
  });

  it('consumes a hoisted millstone and requires a fresh hoist on an intervening day', () => {
    const { state, wei } = duel({}, { x: 23 });
    readyCounters(state);
    state.engines = [engine('ram', 23, 17)];
    let next = act(state, { type: 'dropMillstone', unitId: wei.id, engineId: 'engine' });
    expect(next.engines[0]!.durability).toBe(100);
    next = endDay(next);
    refused(next, { type: 'dropMillstone', unitId: wei.id, engineId: 'engine' });
    next = act(next, { type: 'hoistMillstone', unitId: wei.id });
    next = endDay(next);
    next = act(next, { type: 'dropMillstone', unitId: wei.id, engineId: 'engine' });
    expect(next.engines[0]).toMatchObject({ durability: 0, wrecked: true });
    expect(next.preparations.millstones['23,16']!.hoisted).toBe(false);
  });

  it.each([false, true])(
    'drops boulders with the climbing multiplier when climbing=%s',
    (climbing) => {
      const { state, shu, wei } = duel({ climbing });
      readyCounters(state);
      state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
      const hit = act(state, { type: 'dropBoulders', unitId: wei.id, targetId: shu.id });
      expect(hit.units[0]!.troops).toBe(
        2000 -
          Math.floor(300 * T.boulderCoefficient * (climbing ? T.climbingBoulderMultiplier : 1)),
      );
      refused(hit, { type: 'dropBoulders', unitId: wei.id, targetId: shu.id });
    },
  );

  it('completes an inner-wall segment in four daily actions and lifts its builders onto the walkway', () => {
    const { state, wei } = duel({}, { x: 17, y: 14, level: 'ground' });
    refused(state, { type: 'buildWall', unitId: wei.id });
    let next = structuredClone(state);
    next.act = 2;
    for (let progress = 1; progress <= 4; progress++) {
      next = act(next, { type: 'buildWall', unitId: wei.id });
      expect(next.innerWall[1]).toBe(progress);
      if (progress < 4) next = endDay(next);
    }
    expect(
      INNER_WALL_SEGMENTS[1]!.cells.every((cell) => cellTerrain(next, cell.x, cell.y) === 'wall'),
    ).toBe(true);
    expect(next.units[1]!.level).toBe('wall');
    Object.assign(next.units[0]!, { x: 17, y: 13 });
    expect(pathTo(next, next.units[0]!.id, 18, 14, 'ground')).toBeNull();
  });
});
