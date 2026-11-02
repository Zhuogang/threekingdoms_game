import { describe, expect, it } from 'vitest';
import { troopDamageMultiplier } from '../../src/v03/battle/experience';
import {
  damageEngine,
  damageGate,
  inflictCasualties,
  predictSiegeAttack,
  settleUnitRout,
  siegeBaseDamage,
} from '../../src/siege/rules/combat';
import { endDay } from '../../src/siege/rules/day';
import { pathTo } from '../../src/siege/rules/movement';
import { act, duel, engine, refused } from './rulesFixtures';

describe('siege combat frontage and modifiers', () => {
  it('counts 150 of 2,000 on a raised ladder and multiplies the counterattack by height and climbing', () => {
    const { state, shu, wei } = duel();
    state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
    const before = structuredClone(state);
    const forecast = predictSiegeAttack(state, shu.id, wei.id)!;
    expect(forecast).toMatchObject({
      inRange: true,
      kind: 'ladder',
      frontage: 150,
      countedTroops: 150,
      modifiers: { parapet: 1, height: 1, climbing: 1 },
      counterattack: { possible: true, modifiers: { height: 1.3, climbing: 1.5 } },
    });
    expect(forecast.casualties).toBe(Math.floor(siegeBaseDamage(state, shu, wei, 150)));
    const result = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
    expect(result.units[1]!.troops).toBe(wei.troops - forecast.casualties);
    expect(result.units[0]!.troops).toBe(shu.troops - forecast.counterattack.casualties);
    expect(result.units[0]!.climbing).toBe(true);
    expect(state).toEqual(before);
  });

  it('caps a ground archer volley at 600 and applies the parapet after the base floor', () => {
    const { state, shu, wei } = duel({ y: 18, troopType: 'archer' });
    const forecast = predictSiegeAttack(state, shu, wei)!;
    expect(forecast).toMatchObject({
      inRange: true,
      frontage: 600,
      countedTroops: 600,
      modifiers: { parapet: 0.3 },
    });
    expect(forecast.casualties).toBe(Math.floor(siegeBaseDamage(state, shu, wei, 600) * 0.3));
    shu.troops = 1;
    expect(predictSiegeAttack(state, shu, wei)!.casualties).toBe(6);
  });

  it('lets towers shoot range four at wall or city ground, with 300 frontage and no parapet', () => {
    const { state, wei } = duel();
    state.engines = [engine('tower', 20, 20)];
    const wall = predictSiegeAttack(state, 'engine', wei.id)!;
    expect(wall).toMatchObject({
      inRange: true,
      frontage: 300,
      countedTroops: 300,
      modifiers: { parapet: 1 },
      counterattack: { possible: false },
    });
    expect(
      act(state, { type: 'attack', engineId: 'engine', targetId: wei.id }).units[1]!.troops,
    ).toBe(wei.troops - wall.casualties);
    Object.assign(wei, { x: 24, y: 20, level: 'ground' });
    expect(predictSiegeAttack(state, 'engine', wei.id)!.inRange).toBe(true);
    wei.x++;
    expect(predictSiegeAttack(state, 'engine', wei.id)!.inRange).toBe(false);
  });

  it('uses 100 at a filled wall foot, 300 in a broken passage, and no cap on ordinary ground', () => {
    const { state, shu, wei } = duel({ y: 17 });
    state.trenchFill['20,17'] = 3;
    expect(predictSiegeAttack(state, shu, wei)).toMatchObject({
      inRange: true,
      kind: 'wallFoot',
      frontage: 100,
    });
    Object.assign(shu, { x: 23, y: 17 });
    Object.assign(wei, { x: 23, y: 16, level: 'ground' });
    state.gates.south.broken = true;
    expect(predictSiegeAttack(state, shu, wei)).toMatchObject({
      kind: 'gate',
      frontage: 300,
      countedTroops: 300,
    });
    Object.assign(wei, { y: 18 });
    expect(predictSiegeAttack(state, shu, wei)).toMatchObject({
      kind: 'field',
      frontage: null,
      countedTroops: 2000,
    });
  });

  it('mirrors field force, morale, matchup, terrain, experience and wounded bookkeeping', () => {
    const { state, shu, wei } = duel(
      { x: 5, y: 5, troopType: 'archer', morale: 35, troopExperience: 1000 },
      { x: 4, y: 5, level: 'ground', morale: 19, troops: 2000 },
    );
    const raw =
      2000 *
      0.3 *
      ((shu.force + 55) / (wei.force + 65)) *
      (0.65 + 35 / 170) *
      1.15 *
      0.8 *
      0.85 *
      1.2;
    expect(siegeBaseDamage(state, shu, wei)).toBeCloseTo(raw);
    const forecast = predictSiegeAttack(state, shu.id, wei.id)!;
    expect(forecast.casualties).toBe(Math.floor(raw * troopDamageMultiplier(1000, 0)));
    expect(forecast.counterattack.possible).toBe(false);
    const result = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
    expect(result.units[1]!.wounded).toBeGreaterThan(0);
    expect(result.units[1]!.morale).toBe(forecast.targetMoraleAfter);
    expect(result.units[1]!.troops + result.units[1]!.wounded).toBeLessThan(wei.troops);
  });

  it('keeps shared damage and retreat helpers pure', () => {
    const { state, wei } = duel({}, { morale: 20 });
    state.engines = [engine('ladder', 20, 19)];
    const before = structuredClone(state);
    expect(damageEngine(state, state.engines[0]!, 120).engines[0]!.wrecked).toBe(true);
    expect(damageGate(state, 'south', 800).gates.south.broken).toBe(true);
    expect(inflictCasualties(state, wei, 10).routed).toBe(true);
    expect(settleUnitRout(state, { ...wei, routed: true }).level).toBe('ground');
    expect(state).toEqual(before);
  });

  it('forecasts gate damage with the same experience multiplier used by the action', () => {
    const { state, shu, wei } = duel({ x: 23, y: 17, troopExperience: 1000 }, { x: 23 });
    const forecast = predictSiegeAttack(state, shu.id, 'south')!;
    expect(forecast).toMatchObject({
      inRange: true,
      frontage: null,
      casualties: 0,
      modifiers: { gate: 0.1 },
      counterattack: { possible: false },
    });
    expect(forecast.gateDamage).toBe(
      Math.floor(
        siegeBaseDamage(state, shu, { ...wei, level: 'ground' }) *
          troopDamageMultiplier(1000, 0) *
          0.1,
      ),
    );
    const result = act(state, { type: 'attack', unitId: shu.id, gateId: 'south' });
    expect(result.gates.south.durability).toBe(800 - forecast.gateDamage!);
    refused(result, { type: 'attack', unitId: shu.id, gateId: 'south' });
  });

  it('requires orthogonal infantry range and gives wall archers one extra range', () => {
    const { state, shu, wei } = duel({ x: 20, y: 19 }, { troopType: 'archer' });
    expect(predictSiegeAttack(state, wei, shu)).toMatchObject({
      inRange: true,
      modifiers: { height: 1.3 },
    });
    expect(predictSiegeAttack(state, shu, wei)!.inRange).toBe(false);
    Object.assign(wei, { x: 21, y: 20, level: 'ground', troopType: 'infantry' });
    expect(predictSiegeAttack(state, shu, wei)!.inRange).toBe(false);
    wei.x = 20;
    expect(predictSiegeAttack(state, shu, wei)!.inRange).toBe(true);
    expect(predictSiegeAttack(state, 'missing', wei.id)).toBeNull();
    refused(state, { type: 'attack', unitId: shu.id, targetId: shu.id });
  });
});

describe('vacating and climbing the wall', () => {
  it.each(['destroyed', 'routed'] as const)(
    'vacates a %s wall defender, allowing ascent on the next move',
    (condition) => {
      const { state, shu, wei } = duel(
        {},
        { troops: condition === 'destroyed' ? 1 : 300, morale: condition === 'routed' ? 20 : 80 },
      );
      state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
      const hit = act(state, { type: 'attack', unitId: shu.id, targetId: wei.id });
      expect(hit.units[1]).not.toMatchObject({ x: 20, y: 16, level: 'wall' });
      if (condition === 'routed')
        expect(hit.units[1]).toMatchObject({ level: 'ground', x: 20, y: 15, routed: true });
      // Keep another active defender so the next day can begin.
      hit.units.push({ ...wei, id: 'reserve', x: 30, y: 16, morale: 80, troops: 200 });
      const next = endDay(hit);
      expect(pathTo(next, shu.id, 20, 16, 'wall')).not.toBeNull();
      expect(
        act(next, { type: 'move', unitId: shu.id, x: 20, y: 16, level: 'wall' }).units[0]!.level,
      ).toBe('wall');
    },
  );
});
