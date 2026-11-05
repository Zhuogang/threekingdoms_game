import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHENCANG_ART_LAYOUT,
  CHENCANG_LAYOUT,
  CITY_BOUNDS,
  CAMP_CELLS,
  COURTYARD,
  DEPLOY_SHU,
  DEPLOY_WEI,
  GATES,
  INNER_WALL_SEGMENTS,
  SHU_ROSTER,
  SOUTH_TRENCH,
  WEI_ROSTER,
  WORKSHOPS,
  cellKey,
  layoutSymbol,
} from '../../src/siege/content/chencang';
import { OFFICER_CATALOG_BY_ID } from '../../src/v03/content/officer-catalog';
import {
  MIN_MORALE,
  ROUTED_MORALE,
  WAVERING_MORALE,
  advanceRandomState,
  tacticalSeed,
} from '../../src/siege/rules/constants';
import { createSiegeState, weatherFromRoll } from '../../src/siege/rules/state';
import type { SiegePosition } from '../../src/siege/rules/types';

const positionKey = (p: SiegePosition) => `${cellKey(p)},${p.level}`;

describe('Chencang layout and derived geometry', () => {
  it('preserves the authoritative art and exposes the new board dimensions', () => {
    expect(CHENCANG_ART_LAYOUT).toEqual(
      readFileSync('docs/siege/chencang/art/layout.txt', 'utf8').trimEnd().split('\n'),
    );
    expect(CHENCANG_ART_LAYOUT).toHaveLength(32);
    expect(CHENCANG_ART_LAYOUT.every((r) => r.length === 48)).toBe(true);
    expect(CHENCANG_LAYOUT).toHaveLength(14);
    expect(CHENCANG_LAYOUT.every((r) => r.length === 17)).toBe(true);
  });
  it('derives the singleton gates, durability and external bridges', () => {
    expect(CITY_BOUNDS).toEqual({ west: 4, east: 12, north: 2, south: 7 });
    expect(GATES).toEqual({
      south: {
        id: 'south',
        max: T.southGateDurability,
        cells: [{ x: 8, y: 7 }],
        approaches: [{ x: 8, y: 8 }],
      },
      north: {
        id: 'north',
        max: T.otherGateDurability,
        cells: [{ x: 8, y: 2 }],
        approaches: [{ x: 8, y: 1 }],
      },
      west: {
        id: 'west',
        max: T.otherGateDurability,
        cells: [{ x: 4, y: 5 }],
        approaches: [{ x: 3, y: 5 }],
      },
      east: {
        id: 'east',
        max: T.otherGateDurability,
        cells: [{ x: 12, y: 5 }],
        approaches: [{ x: 13, y: 5 }],
      },
    });
  });
  it('derives twenty trench cells and four row-major inner-wall indexes', () => {
    expect(SOUTH_TRENCH).toHaveLength(20);
    for (const y of [8, 9])
      expect(SOUTH_TRENCH.filter((c) => c.y === y).map((c) => c.x)).toEqual([
        3, 4, 5, 6, 7, 9, 10, 11, 12, 13,
      ]);
    expect(INNER_WALL_SEGMENTS).toEqual(
      [5, 7, 9, 11].map((x, index) => ({ index, cells: [{ x, y: 6 }], buildPoints: 4 })),
    );
  });
  it('keeps all K cells and inner-first workshop exits', () => {
    expect(COURTYARD).toEqual([
      { x: 9, y: 4 },
      { x: 10, y: 4 },
    ]);
    expect(WORKSHOPS.map((w) => w.cells)).toEqual([
      [
        { x: 5, y: 11 },
        { x: 6, y: 11 },
      ],
      [
        { x: 10, y: 11 },
        { x: 11, y: 11 },
      ],
    ]);
    expect(WORKSHOPS.map((w) => w.spawns)).toEqual([
      [
        { x: 6, y: 10 },
        { x: 5, y: 10 },
      ],
      [
        { x: 10, y: 10 },
        { x: 11, y: 10 },
      ],
    ]);
  });
  it('defines only open Shu approach/camp cells and Wei interior or tops', () => {
    expect(DEPLOY_SHU.length).toBeGreaterThan(10);
    for (const p of DEPLOY_SHU) {
      expect(p.level).toBe('ground');
      expect('.+=').toContain(layoutSymbol(p.x, p.y));
      expect([10, 11].includes(p.y) || CAMP_CELLS.some((c) => cellKey(c) === cellKey(p))).toBe(
        true,
      );
    }
    expect(DEPLOY_SHU).toContainEqual({ x: 8, y: 12, level: 'ground' });
    expect(DEPLOY_SHU).toContainEqual({ x: 5, y: 13, level: 'ground' });
    expect(DEPLOY_WEI).toContainEqual({ x: 8, y: 7, level: 'wall' });
    expect(DEPLOY_WEI).toContainEqual({ x: 9, y: 4, level: 'ground' });
    for (const p of DEPLOY_WEI) {
      if (p.level === 'wall') expect('WOG').toContain(layoutSymbol(p.x, p.y));
      else {
        expect(p.x).toBeGreaterThan(4);
        expect(p.x).toBeLessThan(12);
        expect(p.y).toBeGreaterThan(2);
        expect(p.y).toBeLessThan(7);
        expect('.+=XRK').toContain(layoutSymbol(p.x, p.y));
      }
    }
  });
});

describe('siege rosters and deterministic initial state', () => {
  it('uses 20,000 Shu in ten infantry and crossbow units with catalog attributes', () => {
    expect(SHU_ROSTER).toHaveLength(10);
    expect(SHU_ROSTER.reduce((total, unit) => total + unit.troops, 0)).toBe(20000);
    expect(SHU_ROSTER[0]).toMatchObject({
      officer: { id: 'zhugeliang' },
      troops: 1000,
      troopType: 'infantry',
    });
    expect(SHU_ROSTER.find((u) => u.officer.id === 'jiangwei')?.troopType).toBe('infantry');
    for (const unit of SHU_ROSTER.slice(0, 6)) {
      const officer = OFFICER_CATALOG_BY_ID.get(unit.officer.id)!;
      expect(unit.force).toBe(officer.adultForce);
      expect(unit.intellect).toBe(officer.adultIntellect);
      expect(['infantry', 'archer']).toContain(unit.troopType);
    }
    expect(SHU_ROSTER.slice(1).every((u) => u.troops >= 1500 && u.troops <= 3000)).toBe(true);
    for (const id of ['weiyan', 'jiangwei', 'wangping', 'wuyi', 'liaohua']) {
      expect(SHU_ROSTER.some((u) => u.officer.id === id)).toBe(true);
    }
  });

  it('replaces absent officers with two infantry and two archer captains', () => {
    const captains = SHU_ROSTER.slice(6);
    expect(captains.map((u) => u.troopType)).toEqual(['infantry', 'infantry', 'archer', 'archer']);
    captains.forEach((unit, index) => {
      expect(unit.id).toBe(`shu-captain-${index + 1}`);
      expect(unit.officer.chinese).toBe(`蜀军校尉${index + 1}`);
      expect(unit.officer.portraitId).toBeNull();
      expect(unit.force).toBeGreaterThanOrEqual(55);
      expect(unit.force).toBeLessThanOrEqual(62);
      expect(unit.intellect).toBeGreaterThanOrEqual(40);
      expect(unit.intellect).toBeLessThanOrEqual(50);
    });
    expect(
      SHU_ROSTER.some((u) => ['zhaoyun', 'yanyan', 'jiangwan', 'feiyi'].includes(u.officer.id)),
    ).toBe(false);
  });

  it('uses fixed opening positions and the weighted weather schedule without deployment RNG', () => {
    const state = createSiegeState(42);
    expect(state.units.find((u) => u.officer.id === 'haozhao')).toMatchObject({
      x: 8,
      y: 7,
      level: 'wall',
    });
    expect(state.units[0]).toMatchObject({ x: 8, y: 12, level: 'ground' });
    expect(state.units.slice(1, 10).every((u) => u.y >= 10 && u.y <= 11)).toBe(true);
    let rng = tacticalSeed('chencang', 42);
    for (let day = 1; day <= 12; day++) {
      rng = advanceRandomState(rng);
      expect(state.weatherByDay[day]).toBe(weatherFromRoll(rng / 0x100000000));
    }
    expect(state.rngState).toBe(rng);
    expect([0, 0.59999, 0.6, 0.89999, 0.9, 0.99999].map(weatherFromRoll)).toEqual([
      'clear',
      'clear',
      'snow',
      'snow',
      'wind',
      'wind',
    ]);
  });

  it('uses 1,300 Wei in six units, including the new officers and four portraitless captains', () => {
    expect(WEI_ROSTER).toHaveLength(6);
    expect(WEI_ROSTER.reduce((total, unit) => total + unit.troops, 0)).toBe(1300);
    expect(WEI_ROSTER[0]).toMatchObject({ officer: { chinese: '郝昭' }, force: 76, intellect: 74 });
    expect(WEI_ROSTER[1]).toMatchObject({ officer: { chinese: '王生' }, force: 64, intellect: 52 });
    expect(
      WEI_ROSTER.every(
        (u) => u.troops >= 150 && u.troops <= 300 && ['infantry', 'archer'].includes(u.troopType),
      ),
    ).toBe(true);
    for (const captain of WEI_ROSTER.slice(2)) {
      expect(captain.officer.portraitId).toBeNull();
      expect(captain.force).toBeGreaterThanOrEqual(50);
      expect(captain.force).toBeLessThanOrEqual(58);
      expect(captain.intellect).toBeGreaterThanOrEqual(35);
      expect(captain.intellect).toBeLessThanOrEqual(45);
    }
  });

  it.each([0, 1, 19, 12345, 0xffffffff])(
    'places all units legally without overlap for seed %i',
    (seed) => {
      const state = createSiegeState(seed);
      expect(state.units).toHaveLength(16);
      expect(new Set(state.units.map(cellKey)).size).toBe(16);
      for (const unit of state.units) {
        const zone = unit.side === 'shu' ? DEPLOY_SHU : DEPLOY_WEI;
        expect(zone.some((p) => positionKey(p) === positionKey(unit))).toBe(true);
        if (unit.side === 'wei' && unit.troopType === 'archer') {
          expect(unit).toMatchObject({ y: 7, level: 'wall' });
          expect(layoutSymbol(unit.x, unit.y)).toBe('W');
        }
      }
    },
  );

  it('is reproducible JSON and keeps fixed deployments and varies only seed, RNG and weather across seeds', () => {
    const a = createSiegeState(100);
    const b = createSiegeState(101);
    expect(a).toEqual(createSiegeState(100));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.units.map(positionKey)).toEqual(b.units.map(positionKey));
    const fixed = (state: typeof a) => {
      const {
        seed: _seed,
        rngState: _rng,
        weather: _weather,
        weatherByDay: _weatherByDay,
        units,
        ...rest
      } = state;
      return { ...rest, units: units.map(({ x: _x, y: _y, level: _level, ...unit }) => unit) };
    };
    expect(fixed(a)).toEqual(fixed(b));
    a.units[0]!.officer.name = 'Changed';
    a.trenchFill['7,8'] = 3;
    expect(createSiegeState(100)).not.toEqual(a);
    expect(SHU_ROSTER[0]!.officer.name).toBe('Zhuge Liang');
  });

  it('initializes the twelve-day siege, empty workshop queues and construction progress', () => {
    const state = createSiegeState(9);
    expect(state).toMatchObject({
      version: 'siege_v0.3',
      day: 1,
      act: 1,
      grain: 12,
      zhangheDistance: 14,

      log: [],
      outcome: null,
    });
    expect(state.engines.map(({ kind, x, y }) => ({ kind, x, y }))).toEqual([
      { kind: 'ladder', x: 6, y: 10 },
      { kind: 'ladder', x: 10, y: 10 },
      { kind: 'ram', x: 8, y: 10 },
      { kind: 'earthCart', x: 7, y: 10 },
    ]);
    expect(state.weather).toBe(state.weatherByDay[1]);
    expect(Object.keys(state.weatherByDay)).toHaveLength(12);
    expect(
      Object.values(state.weatherByDay).every((w) => ['clear', 'snow', 'wind'].includes(w)),
    ).toBe(true);
    expect(state.ordersUsed).toEqual({ shu: { 1: false }, wei: { 1: false } });
    expect(state.workshops).toEqual(
      WORKSHOPS.map(({ id }) => ({ id, queue: null, daysRemaining: 0 })),
    );
    expect(Object.values(state.trenchFill)).toEqual(Array(20).fill(0));
    expect(state.innerWall).toEqual({ 0: 0, 1: 0, 2: 0, 3: 0 });
    for (const gate of Object.values(GATES)) {
      expect(state.gates[gate.id]).toEqual({
        durability: gate.max,
        max: gate.max,
        broken: false,
        damaged: false,
      });
    }
    expect(
      state.units.every(
        (u) => u.morale === 80 && u.wounded === 0 && !u.moved && !u.acted && !u.routed,
      ),
    ).toBe(true);
  });

  it('preserves the field engine morale constants and deterministic LCG/FNV algorithms', () => {
    expect([WAVERING_MORALE, ROUTED_MORALE, MIN_MORALE]).toEqual([40, 20, 5]);
    expect(advanceRandomState(0)).toBe(1013904223);
    expect(advanceRandomState(1)).toBe(1015568748);
    expect(tacticalSeed('', 0)).toBe(2166136261);
    expect(tacticalSeed('a', 0)).toBe(0xe40c292c);
    expect(tacticalSeed('chencang', 1)).not.toBe(tacticalSeed('chencang', 2));
  });
});
