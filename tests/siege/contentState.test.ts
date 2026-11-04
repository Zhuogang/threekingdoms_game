import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHENCANG_LAYOUT,
  COURTYARD,
  DEPLOY_SHU,
  DEPLOY_WEI,
  GATES,
  INNER_WALL_SEGMENTS,
  RAMPS,
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
  it('matches the authoritative 48 by 32 layout exactly', () => {
    const layout = readFileSync('docs/siege/chencang/art/layout.txt', 'utf8').trimEnd().split('\n');
    expect(CHENCANG_LAYOUT).toEqual(layout);
    expect(CHENCANG_LAYOUT).toHaveLength(32);
    expect(CHENCANG_LAYOUT.every((row) => row.length === 48)).toBe(true);
  });

  it('derives all gate cells, durability and outside bridge approaches', () => {
    expect(GATES).toEqual({
      south: {
        id: 'south',
        max: T.southGateDurability,
        cells: [
          { x: 23, y: 16 },
          { x: 24, y: 16 },
        ],
        approaches: [
          { x: 23, y: 17 },
          { x: 24, y: 17 },
        ],
      },
      north: {
        id: 'north',
        max: 400,
        cells: [
          { x: 23, y: 4 },
          { x: 24, y: 4 },
        ],
        approaches: [
          { x: 23, y: 3 },
          { x: 24, y: 3 },
        ],
      },
      west: {
        id: 'west',
        max: 400,
        cells: [{ x: 14, y: 10 }],
        approaches: [{ x: 13, y: 10 }],
      },
      east: {
        id: 'east',
        max: 400,
        cells: [{ x: 33, y: 10 }],
        approaches: [{ x: 34, y: 10 }],
      },
    });
  });

  it('orders each of the eight ramps from its gate-side low end to its wall-side high end', () => {
    expect(RAMPS.map(({ cells, ground, wall }) => ({ cells, ground, wall }))).toEqual([
      {
        cells: [
          { x: 22, y: 5 },
          { x: 21, y: 5 },
          { x: 20, y: 5 },
        ],
        ground: { x: 23, y: 5 },
        wall: { x: 20, y: 4 },
      },
      {
        cells: [
          { x: 25, y: 5 },
          { x: 26, y: 5 },
          { x: 27, y: 5 },
        ],
        ground: { x: 24, y: 5 },
        wall: { x: 27, y: 4 },
      },
      {
        cells: [
          { x: 15, y: 8 },
          { x: 15, y: 7 },
          { x: 15, y: 6 },
        ],
        ground: { x: 15, y: 9 },
        wall: { x: 14, y: 6 },
      },
      {
        cells: [
          { x: 32, y: 8 },
          { x: 32, y: 7 },
          { x: 32, y: 6 },
        ],
        ground: { x: 32, y: 9 },
        wall: { x: 33, y: 6 },
      },
      {
        cells: [
          { x: 15, y: 11 },
          { x: 15, y: 12 },
          { x: 15, y: 13 },
        ],
        ground: { x: 15, y: 10 },
        wall: { x: 14, y: 13 },
      },
      {
        cells: [
          { x: 32, y: 11 },
          { x: 32, y: 12 },
          { x: 32, y: 13 },
        ],
        ground: { x: 32, y: 10 },
        wall: { x: 33, y: 13 },
      },
      {
        cells: [
          { x: 22, y: 15 },
          { x: 21, y: 15 },
          { x: 20, y: 15 },
        ],
        ground: { x: 23, y: 15 },
        wall: { x: 20, y: 16 },
      },
      {
        cells: [
          { x: 25, y: 15 },
          { x: 26, y: 15 },
          { x: 27, y: 15 },
        ],
        ground: { x: 24, y: 15 },
        wall: { x: 27, y: 16 },
      },
    ]);
    expect(RAMPS.flatMap((ramp) => ramp.cells).every((c) => layoutSymbol(c.x, c.y) === 'M')).toBe(
      true,
    );
  });

  it('derives the fillable south trench and four gapped inner-wall segments', () => {
    expect(SOUTH_TRENCH).toHaveLength(44);
    for (const y of [17, 18]) {
      expect(SOUTH_TRENCH.filter((c) => c.y === y).map((c) => c.x)).toEqual(
        Array.from({ length: 24 }, (_, i) => i + 12).filter((x) => x !== 23 && x !== 24),
      );
    }
    expect(INNER_WALL_SEGMENTS.map((segment) => segment.cells.map((c) => c.x))).toEqual([
      [15],
      [17, 18, 19, 20, 21, 22],
      [25, 26, 27, 28, 29, 30],
      [32],
    ]);
    expect(
      INNER_WALL_SEGMENTS.every((s) => s.buildPoints === 4 && s.cells.every((c) => c.y === 14)),
    ).toBe(true);
  });

  it('derives the objective courtyard and both workshop blocks and spawn cells', () => {
    expect(COURTYARD).toHaveLength(8);
    expect(COURTYARD.every((c) => [7, 8].includes(c.y) && layoutSymbol(c.x, c.y) === 'K')).toBe(
      true,
    );
    expect(WORKSHOPS.map((w) => w.spawn)).toEqual([
      { x: 16, y: 25 },
      { x: 30, y: 25 },
    ]);
    for (const [i, workshop] of WORKSHOPS.entries()) {
      expect(workshop.cells).toHaveLength(8);
      expect(workshop.cells.map((c) => cellKey(c)).sort()).toEqual(
        [23, 24]
          .flatMap((y) => Array.from({ length: 4 }, (_, x) => `${x + (i ? 29 : 15)},${y}`))
          .sort(),
      );
      expect(layoutSymbol(workshop.spawn.x, workshop.spawn.y)).toBe('.');
    }
  });

  it('defines only open deployment cells, plus Wei wall and gate tops', () => {
    expect(DEPLOY_SHU.length).toBeGreaterThan(10);
    for (const p of DEPLOY_SHU) {
      expect(p.level).toBe('ground');
      expect('.+=X').toContain(layoutSymbol(p.x, p.y));
      expect((p.y >= 21 && p.y <= 25) || (p.y >= 27 && p.x >= 11 && p.x <= 36)).toBe(true);
    }
    expect(DEPLOY_SHU).toContainEqual({ x: 20, y: 23, level: 'ground' });
    expect(DEPLOY_SHU).toContainEqual({ x: 11, y: 31, level: 'ground' });
    expect(DEPLOY_WEI).toContainEqual({ x: 23, y: 16, level: 'wall' });
    expect(DEPLOY_WEI).toContainEqual({ x: 25, y: 7, level: 'ground' });
    expect(DEPLOY_WEI).toContainEqual({ x: 17, y: 14, level: 'ground' });
    for (const p of DEPLOY_WEI) {
      if (p.level === 'wall') expect('WOG').toContain(layoutSymbol(p.x, p.y));
      else {
        expect(p.x).toBeGreaterThan(14);
        expect(p.x).toBeLessThan(33);
        expect(p.y).toBeGreaterThan(4);
        expect(p.y).toBeLessThan(16);
        expect('.+=XRK').toContain(layoutSymbol(p.x, p.y));
        expect(!(layoutSymbol(p.x, p.y) === 'K' && p.y === 6)).toBe(true);
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
      x: 23,
      y: 16,
      level: 'wall',
    });
    expect(state.units[0]).toMatchObject({ x: 23, y: 25, level: 'ground' });
    expect(state.units.slice(1, 10).every((u) => u.y >= 21 && u.y <= 23)).toBe(true);
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
          expect(unit).toMatchObject({ y: 16, level: 'wall' });
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
    a.trenchFill['20,17'] = 3;
    expect(createSiegeState(100)).not.toEqual(a);
    expect(SHU_ROSTER[0]!.officer.name).toBe('Zhuge Liang');
  });

  it('initializes the twelve-day siege, empty workshop queues and construction progress', () => {
    const state = createSiegeState(9);
    expect(state).toMatchObject({
      version: 'siege_v0.2',
      day: 1,
      act: 1,
      grain: 12,
      zhangheDistance: 14,

      log: [],
      outcome: null,
    });
    expect(state.engines.map(({ kind, x, y }) => ({ kind, x, y }))).toEqual([
      { kind: 'ladder', x: 18, y: 19 },
      { kind: 'ladder', x: 29, y: 19 },
      { kind: 'ram', x: 24, y: 21 },
      { kind: 'earthCart', x: 21, y: 20 },
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
    expect(Object.values(state.trenchFill)).toEqual(Array(44).fill(0));
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
