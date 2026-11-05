import { describe, expect, it } from 'vitest';
import { CITY_BOUNDS, RAMPS } from '../../src/siege/content/chencang';
import { applySiegeAction } from '../../src/siege/rules/actions';
import { predictSiegeAttack, predictSiegeClimb } from '../../src/siege/rules/combat';
import { endDay } from '../../src/siege/rules/day';
import { cellTerrain } from '../../src/siege/rules/map';
import { pathTo, reachableCells, swapTargets } from '../../src/siege/rules/movement';
import { createSiegeState } from '../../src/siege/rules/state';
import { scoreSiege } from '../../src/siege/rules/score';
import type { SiegePosition, SiegeSide } from '../../src/siege/rules/types';
import { deserializeSiegeSave, serializeSiegeSave } from '../../src/siege/save';
import { planAttackerTurn } from '../../src/siege/ai/attacker';
import { morningReport } from '../../src/siege/ui/report';
import { act, engine, refused } from './rulesFixtures';

function fixture(position: SiegePosition, side: SiegeSide = 'shu') {
  const state = createSiegeState(228);
  const unit = state.units.find((u) => u.id === (side === 'shu' ? 'shu-weiyan' : 'wei-haozhao'))!;
  Object.assign(unit, position);
  const ally = { ...unit, id: 'ally' };
  const enemy = {
    ...unit,
    id: 'enemy',
    side: side === 'shu' ? ('wei' as const) : ('shu' as const),
  };
  state.units = [unit];
  state.engines = [];
  return { state, unit, ally, enemy };
}
const wall = (x: number, y = 16): SiegePosition => ({ x, y, level: 'wall' });
const ground = (x: number, y: number): SiegePosition => ({ x, y, level: 'ground' });
const has = (state: ReturnType<typeof createSiegeState>, id: string, p: SiegePosition) =>
  reachableCells(state, id).some((c) => c.x === p.x && c.y === p.y && c.level === p.level);

describe('room to move', () => {
  for (const side of ['shu', 'wei'] as const) {
    it.each(['walkway', 'ramp', 'field'] as const)(
      `${side} passes through allies on %s without stopping on them; enemies block`,
      (place) => {
        const from =
          place === 'walkway' ? wall(18) : place === 'ramp' ? ground(19, 15) : ground(18, 20);
        const { state, unit, ally, enemy } = fixture(from, side);
        Object.assign(ally, from, { x: 20 });
        state.units.push(ally);
        const to = { ...from, x: 21 };
        expect(has(state, unit.id, to)).toBe(true);
        expect(pathTo(state, unit.id, ally.x, ally.y, ally.level)).toBeNull();
        expect(has(state, unit.id, ally)).toBe(false);
        expect(act(state, { type: 'move', unitId: unit.id, ...to }).units[0]).toMatchObject(to);
        Object.assign(enemy, ally);
        enemy.id = 'enemy';
        enemy.side = side === 'shu' ? 'wei' : 'shu';
        state.units = [unit, enemy];
        expect(has(state, unit.id, to)).toBe(false);
        expect(pathTo(state, unit.id, enemy.x, enemy.y, enemy.level)).toBeNull();
      },
    );
    it(`${side} steps down inside from every passable south-wall edge and never outside`, () => {
      for (let x = CITY_BOUNDS.west; x <= CITY_BOUNDS.east; x++) {
        const { state, unit } = fixture(wall(x), side);
        if (!['wall', 'gate'].includes(cellTerrain(state, x, 16))) continue;
        const inside = reachableCells(state, unit.id).find(
          (p) => p.x === x && p.y === 15 && p.level === 'ground',
        );
        const passable = x > CITY_BOUNDS.west && x < CITY_BOUNDS.east;
        expect(Boolean(inside)).toBe(passable);
        if (inside) expect(inside.cost).toBe(1);
        expect(
          reachableCells(state, unit.id).some(
            (p) => p.x === x && p.y === 17 && p.level === 'ground' && p.cost === 1,
          ),
        ).toBe(false);
      }
    });
    it(`${side} cannot step down into buildings or climb up an ordinary edge`, () => {
      const { state, unit } = fixture(wall(18, 14), side);
      state.innerWall[1] = 4;
      expect(has(state, unit.id, ground(18, 13))).toBe(false);
      Object.assign(unit, ground(18, 15));
      expect(has(state, unit.id, wall(18))).toBe(false);
    });
    it(`${side} enters a ramp from its side and reaches its wall connection`, () => {
      const ramp = RAMPS.find((r) => r.wall.y === 16)!;
      const high = ramp.cells.at(-1)!;
      const { state, unit } = fixture(ground(high.x, high.y - 1), side);
      const to = { ...high, level: 'ground' as const };
      expect(reachableCells(state, unit.id)).toContainEqual({ ...to, cost: 1 });
      expect(has(state, unit.id, { ...ramp.wall, level: 'wall' })).toBe(true);
    });
    it.each(['down', 'up'] as const)(
      `${side} infantry attacks %s across the inner wall edge`,
      (direction) => {
        const { state, unit, enemy } = fixture(
          direction === 'down' ? wall(18) : ground(18, 15),
          side,
        );
        Object.assign(enemy, direction === 'down' ? ground(18, 15) : wall(18));
        state.units.push(enemy);
        const forecast = predictSiegeAttack(state, unit.id, enemy.id)!;
        expect(forecast.inRange).toBe(true);
        expect(forecast.frontage).toBe(200);
        expect(forecast.modifiers.height).toBe(direction === 'down' ? 1.3 : 1);
        const next = act(state, { type: 'attack', unitId: unit.id, targetId: enemy.id });
        expect(next.units[1]!.troops).toBeLessThan(enemy.troops);
      },
    );
  }

  it.each(['top', 'inside'] as const)(
    'opens a gate from %s, clears the road, records loss and survives repair',
    (place) => {
      const { state, unit } = fixture(place === 'top' ? wall(23) : ground(23, 15));
      const before = scoreSiege({ ...state, outcome: 'historical' }, 'wei');
      const next = act(state, { type: 'openGate', unitId: unit.id, gateId: 'south' });
      expect(next.gates.south).toMatchObject({ broken: true, durability: 0, opened: true });
      expect(next.stats.gateEverBroken).toBe(true);
      expect(next.units[0]!.acted).toBe(true);
      expect(next.log.filter((e) => e.code === 'gateOpened')).toHaveLength(1);
      expect(next.log.some((e) => e.code === 'gateBroken')).toBe(false);
      expect(scoreSiege({ ...next, outcome: 'historical' }, 'wei').parts.gate).toBeLessThan(
        before.parts.gate!,
      );
      const outsider = { ...unit, ...ground(24, 17), id: 'outside' };
      next.units.push(outsider);
      expect(has(next, outsider.id, ground(24, 15))).toBe(true);
      const through = act(next, { type: 'move', unitId: outsider.id, ...ground(24, 15) });
      expect(through.units[1]).toMatchObject(ground(24, 15));
      refused(next, { type: 'order', side: 'wei', kind: 'nightRepair', target: 'south' });
      expect(endDay(next).gates.south.opened).toBe(true);
      for (const locale of ['zh', 'en'] as const) {
        const row = morningReport(next.log, next.preparations, 1, locale, [], next, 'wei').find(
          (r) => r.code === 'gateOpened',
        )!;
        expect(row.priority).toBe(0);
        expect(row.text).toContain(
          locale === 'zh' ? '从里面打开了南门' : 'opened South gate from inside',
        );
        expect(row.text).not.toMatch(/\d+,\d+/);
      }
      const save = {
        playerSide: 'shu' as const,
        state: next,
        phase: 'battle' as const,
        facings: {},
      };
      expect(deserializeSiegeSave(serializeSiegeSave(save))).toEqual(save);
    },
  );

  it.each(['guarded', 'archer', 'acted', 'broken', 'wei', 'outside'] as const)(
    'rejects gate opening when %s',
    (condition) => {
      const { state, unit, enemy } = fixture(ground(23, 15));
      if (condition === 'guarded') {
        Object.assign(enemy, wall(24), { routed: true });
        state.units.push(enemy);
      }
      if (condition === 'archer') unit.troopType = 'archer';
      if (condition === 'acted') unit.acted = true;
      if (condition === 'broken') state.gates.south.broken = true;
      if (condition === 'wei') unit.side = 'wei';
      if (condition === 'outside') unit.y = 17;
      refused(state, { type: 'openGate', unitId: unit.id, gateId: 'south' });
    },
  );

  it('attacker opens the south gate before moving or attacking', () => {
    const { state, unit } = fixture(ground(23, 15));
    for (const method of ['careful', 'anyPrice', 'brute'] as const) {
      const plan = planAttackerTurn(state, method);
      expect(plan.filter((a) => 'unitId' in a && a.unitId === unit.id)[0]).toEqual({
        type: 'openGate',
        unitId: unit.id,
        gateId: 'south',
      });
    }
  });

  for (const route of ['ladder', 'wallFoot'] as const) {
    function breach() {
      const f = fixture(ground(20, route === 'ladder' ? 19 : 17));
      if (route === 'ladder') f.state.engines = [engine('ladder', 20, 19, { raisedAt: wall(20) })];
      else {
        f.state.trenchFill['20,17'] = 3;
        f.state.trenchFill['20,18'] = 3;
      }
      f.state.footholds['20,16'] = 3;
      return f;
    }
    it(`${route}: breach arrival leaves an attack, first mount spends it`, () => {
      const { state, unit, enemy } = breach();
      Object.assign(enemy, ground(20, 15));
      state.units.push(enemy);
      const arrived = act(state, { type: 'climb', unitId: unit.id });
      expect(arrived.units[0]).toMatchObject({ ...wall(20), moved: true, acted: false });
      expect(
        applySiegeAction(arrived, { type: 'attack', unitId: unit.id, targetId: enemy.id }).ok,
      ).toBe(true);
      state.footholds['20,16'] = 2;
      expect(act(state, { type: 'climb', unitId: unit.id }).units[0]).toMatchObject({
        moved: true,
        acted: true,
      });
    });
    it(`${route}: make-way passes allies, chooses nearest free cell toward the gate, and permits one follower`, () => {
      const { state, unit, ally } = breach();
      Object.assign(ally, wall(20), { acted: true });
      state.units.push(
        ally,
        { ...ally, ...wall(19), id: 'left' },
        { ...ally, ...wall(21), id: 'right' },
      );
      const forecast = predictSiegeClimb(state, unit.id)!;
      expect(forecast.makeWay).toEqual({ unitId: ally.id, to: wall(22) });
      const next = act(state, { type: 'climb', unitId: unit.id });
      expect(next.units[1]).toMatchObject({ ...wall(22), moved: true, acted: true });
      expect(next.log.some((e) => e.code === 'allyMadeWay')).toBe(true);
      const follower = { ...unit, id: 'follower' };
      next.units.push(follower);
      refused(next, { type: 'climb', unitId: follower.id });
      expect(next.units[0]).toMatchObject({ ...wall(20), acted: false });
    });
    it.each(['moved', 'boxed'] as const)(`${route}: make-way is illegal when %s`, (condition) => {
      const { state, unit, ally, enemy } = breach();
      Object.assign(ally, wall(20));
      state.units.push(ally);
      if (condition === 'moved') ally.moved = true;
      else
        state.units.push(
          { ...enemy, ...wall(19), id: 'left' },
          { ...enemy, ...wall(21), id: 'right' },
        );
      expect(predictSiegeClimb(state, unit.id)).toBeNull();
      refused(state, { type: 'climb', unitId: unit.id });
    });
    it(`${route}: any Shu walking onto the top opens it; Wei seals it`, () => {
      const { state, unit, enemy } = breach();
      state.footholds['20,16'] = 0;
      Object.assign(unit, wall(18));
      let next = act(state, { type: 'move', unitId: unit.id, ...wall(20) });
      expect(next.footholds['20,16']).toBe(3);
      next.units[0]!.x = 18;
      Object.assign(enemy, wall(21));
      next.units.push(enemy);
      next = act(next, { type: 'move', unitId: enemy.id, ...wall(20) });
      expect(next.footholds['20,16']).toBe(0);
    });
  }

  it.each(['ground', 'acrossLevels'] as const)(
    'swaps %s positions and flags without adding occupied reachable cells',
    (kind) => {
      const { state, unit, ally } = fixture(kind === 'ground' ? ground(18, 20) : wall(18));
      Object.assign(ally, kind === 'ground' ? ground(20, 20) : ground(18, 15));
      state.units.push(ally);
      const original = { x: unit.x, y: unit.y, level: unit.level };
      expect(swapTargets(state, unit.id).map((u) => u.id)).toEqual([ally.id]);
      expect(has(state, unit.id, ally)).toBe(false);
      const next = act(state, { type: 'swap', unitId: unit.id, withUnitId: ally.id });
      expect(next.units[0]).toMatchObject({
        x: ally.x,
        y: ally.y,
        level: ally.level,
        moved: true,
        acted: false,
      });
      expect(next.units[1]).toMatchObject({ ...original, moved: true, acted: false });
      for (const flag of ['moved', 'acted'] as const) {
        ally[flag] = true;
        refused(state, { type: 'swap', unitId: unit.id, withUnitId: ally.id });
        ally[flag] = false;
      }
    },
  );
});
