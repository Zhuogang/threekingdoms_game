import { mkdirSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FRAME, MAP } from '../../src/siege/render/assets';
import { engineFootprint, engineSprite, unitVisual } from '../../src/siege/render/stateArt';
import { SiegeMapView } from '../../src/siege/render/SiegeMapView';
import { pickCell } from '../../src/siege/render/scene';
import { cellHeight, cellTerrain, isMapCell } from '../../src/siege/rules/map';
import { reachableCells } from '../../src/siege/rules/movement';
import { createSiegeState } from '../../src/siege/rules/state';
import { resolveMapClick } from '../../src/siege/ui/mapClick';
import { playScriptDays } from '../../src/siege/ui/devPlaythrough';
import { siegeCommands, actionContext } from '../../src/siege/ui/commands';
import { nextGoalGuide, nextGoalGuideText } from '../../src/siege/ui/nextGoalGuide';
import { climbGuide } from '../../src/siege/ui/climbGuide';
import { siegeText } from '../../src/siege/i18n';
import { act, engine } from './rulesFixtures';

describe('R engine footprints, figure registration and layer order', () => {
  it.each(['ladder', 'earthCart', 'ram', 'tower'] as const)(
    '%s footprints retain all relevant covered, burning and wreck states',
    (kind) => {
      const expected = [
        [20, 19],
        [20, 20],
        ...(kind === 'ram' ? [[20, 21]] : []),
        ...(kind === 'tower'
          ? [
              [21, 19],
              [21, 20],
            ]
          : []),
      ];
      for (const flags of [
        {},
        { covered: true },
        { burning: true },
        { wrecked: true },
        { acted: true },
      ]) {
        const e = engine(kind, 20, 19, flags);
        expect(engineFootprint(e).map((c) => [c.x, c.y])).toEqual(expected);
        const sprite = engineSprite(e);
        // Each clickable ground cell intersects the registered sprite box (partial coverage counts).
        for (const [x, y] of expected) {
          expect((x! + 1) * FRAME.cw).toBeGreaterThanOrEqual(sprite.rect[0]);
          expect(x! * FRAME.cw).toBeLessThanOrEqual(sprite.rect[2]);
          expect((y! + 1) * FRAME.cd).toBeGreaterThanOrEqual(sprite.rect[1]);
          expect(y! * FRAME.cd).toBeLessThanOrEqual(sprite.rect[3]);
        }
      }
    },
  );
  it('raised ladders include both trench rows, south cell and base; raised wrecks revert to carts', () => {
    for (const covered of [false, true]) {
      const e = engine('ladder', 18, 19, { raisedAt: { x: 18, y: 16 }, covered });
      expect(engineFootprint(e).map((c) => `${c.x},${c.y}`)).toEqual([
        '18,19',
        '18,20',
        '18,17',
        '18,18',
      ]);
      e.wrecked = true;
      expect(engineFootprint(e)).toHaveLength(2);
    }
  });
  it.each([1, 2, 3] as const)(
    'foothold %i only draws followers climbing at 1 and 2',
    (progress) => {
      const state = createSiegeState(228);
      const unit = state.units[1]!;
      Object.assign(unit, { x: 18, y: 19 });
      state.engines[0]!.raisedAt = { x: 18, y: 16 };
      state.footholds['18,16'] = progress;
      const visual = unitVisual(state, unit);
      expect(visual.climbing).toBe(progress < 3);
      expect(visual.figures.some((f) => f.name.includes('climb'))).toBe(progress < 3);
      if (progress === 3) expect(visual.foot[1]).toBeCloseTo(19.92 * FRAME.cd);
    },
  );
  it('every normal formation fits 72×50 and its rect centre picks its own ground/walkway/gate cell', () => {
    const state = createSiegeState(228);
    const places = [
      { x: 20, y: 21, level: 'ground' as const },
      { x: 18, y: 16, level: 'wall' as const },
      ...MAP.objects
        .filter((o) => o.kind === 'gate-tower')
        .flatMap((o) =>
          Array.from({ length: o.cells[3] - o.cells[1] + 1 }, (_, i) => ({
            x: o.cells[0],
            y: o.cells[1] + i,
            level: 'wall' as const,
          })),
        ),
    ];
    let checks = 0,
      maxWidth = 0,
      maxHeight = 0;
    for (const unit of state.units)
      for (const p of places)
        for (const troops of [800, 2000, 3000])
          for (const facing of ['north', 'south', 'east', 'west'] as const)
            for (const activity of [undefined, 'move', 'attack', 'fillTrench']) {
              Object.assign(unit, p, { troops });
              const { rect } = unitVisual(state, unit, facing, activity);
              maxWidth = Math.max(maxWidth, rect[2] - rect[0]);
              maxHeight = Math.max(maxHeight, rect[3] - rect[1]);
              expect(rect[2] - rect[0]).toBeLessThanOrEqual(72);
              expect(rect[3] - rect[1]).toBeLessThanOrEqual(50);
              const picked = pickCell(
                FRAME,
                (rect[0] + rect[2]) / 2,
                (rect[1] + rect[3]) / 2,
                [0, 1, 2, 3],
                (x, y, h) =>
                  isMapCell(x, y) &&
                  h ===
                    cellHeight(
                      state,
                      x,
                      y,
                      ['wall', 'gate'].includes(cellTerrain(state, x, y)) ? 'wall' : 'ground',
                    ),
              );
              expect(picked, JSON.stringify({ p, rect, facing, id: unit.id })).toMatchObject({
                x: p.x,
                y: p.y,
              });
              checks++;
            }
    mkdirSync('.artifacts/siege', { recursive: true });
    writeFileSync(
      '.artifacts/siege/r-geometry.json',
      JSON.stringify(
        {
          checks,
          maxWidth,
          maxHeight,
          engines: ['ladder', 'earthCart', 'ram', 'tower'].map((kind) => {
            const e = engine(kind as 'ladder', 20, 19);
            return { kind, rect: engineSprite(e).rect, footprint: engineFootprint(e) };
          }),
        },
        null,
        2,
      ) + '\n',
    );
  });
  it('rect-centre picks resolve every living unit in a crowd, on gate tops, and on scripted day 9', () => {
    const start = createSiegeState(228);
    const crowd = structuredClone(start);
    Object.assign(crowd.units[1]!, { x: 18, y: 19 });
    crowd.engines[0]!.raisedAt = { x: 18, y: 16 };
    crowd.footholds['18,16'] = 2;
    const walkway = structuredClone(start);
    Object.assign(walkway.units[1]!, { x: 18, y: 16, level: 'wall' });
    Object.assign(walkway.units[2]!, { x: 24, y: 16, level: 'wall' });
    const day9 = playScriptDays(start, 'careful', 8);
    expect(day9.day).toBe(9);
    for (const state of [start, crowd, walkway, day9])
      for (const unit of state.units.filter((u) => u.troops > 0 && isMapCell(u.x, u.y))) {
        const { rect } = unitVisual(state, unit);
        const picked = pickCell(
          FRAME,
          (rect[0] + rect[2]) / 2,
          (rect[1] + rect[3]) / 2,
          [0, 1, 2, 3],
          (x, y, h) =>
            isMapCell(x, y) &&
            h ===
              cellHeight(
                state,
                x,
                y,
                ['wall', 'gate'].includes(cellTerrain(state, x, y)) ? 'wall' : 'ground',
              ),
        );
        const cell = picked && {
          x: picked.x,
          y: picked.y,
          level: (['wall', 'gate'].includes(cellTerrain(state, picked.x, picked.y))
            ? 'wall'
            : 'ground') as 'wall' | 'ground',
        };
        const selected = state.units.find(
          (u) => u.side === 'shu' && u.id !== unit.id && u.troops > 0,
        )!.id;
        expect(
          resolveMapClick({ state, selected, unitAtPoint: unit.id }, cell),
          JSON.stringify({ day: state.day, unit: unit.id, rect, cell }),
        ).toEqual({ type: unit.side === 'shu' ? 'select' : 'target', id: unit.id });
      }
    for (const state of [start, crowd, walkway, day9])
      for (const e of state.engines) {
        if (
          state.units.some(
            (u) => u.troops > 0 && u.level === 'ground' && u.x === e.x && u.y === e.y,
          )
        )
          continue;
        const selected = state.units.find(
          (u) =>
            u.side === 'shu' &&
            u.troops > 0 &&
            !reachableCells(state, u.id).some(
              (c) => c.x === e.x && c.y === e.y && c.level === 'ground',
            ),
        )!.id;
        expect(
          resolveMapClick(
            { state, selected, reachable: reachableCells(state, selected) },
            { x: e.x, y: e.y, level: 'ground' },
          ),
          `${state.day}/${e.id}`,
        ).toEqual({ type: 'select', id: e.id });
      }
  });
  it.each(['ladder', 'earthCart', 'ram', 'tower'] as const)(
    'units on every %s footprint cell paint after all its slices',
    (kind) => {
      for (const raised of kind === 'ladder' ? [false, true] : [false]) {
        const state = createSiegeState(228);
        const e = engine(kind, 18, 19, { raisedAt: raised ? { x: 18, y: 16 } : undefined });
        state.engines = [e];
        for (const cell of engineFootprint(e)) {
          const unit = state.units[1]!;
          Object.assign(unit, cell);
          const markup = renderToStaticMarkup(createElement(SiegeMapView, { state, locale: 'en' }));
          expect(markup.indexOf(`data-unit="${unit.id}"`)).toBeGreaterThan(
            markup.lastIndexOf('data-piece="engine"'),
          );
        }
      }
    },
  );
  it('the unit Raise ladder entry acts on the ladder, then offers Climb without changing rules', () => {
    let state = createSiegeState(228);
    const id = state.units[1]!.id;
    Object.assign(state.units[1]!, { x: 18, y: 19 });
    const command = siegeCommands(state, id).find((c) => c.kind === 'raiseLadder')!;
    expect(command).toMatchObject({
      reason: null,
      action: { type: 'raiseLadder', engineId: state.engines[0]!.id },
    });
    for (const locale of ['zh', 'en'] as const)
      expect(actionContext(state, id, locale)).toBe(siegeText(locale, 'climbRaiseAtBase'));
    state = act(state, command.action!);
    expect(siegeCommands(state, id).some((c) => c.kind === 'raiseLadder')).toBe(false);
    expect(siegeCommands(state, id).find((c) => c.kind === 'climb')?.reason).toBeNull();
  });
  it('Shu inside or on the wall gets next-goal guidance; boxed-in Wei keeps its context', () => {
    const state = createSiegeState(228);
    const shu = state.units[1]!,
      wei = state.units.find((u) => u.side === 'wei')!;
    Object.assign(shu, { x: 20, y: 15 });
    expect(climbGuide(state, shu.id)).toBeNull();
    for (const locale of ['zh', 'en'] as const)
      expect(actionContext(state, shu.id, locale)).toBe(
        nextGoalGuideText(nextGoalGuide(state, shu.id)!, locale, (id) => {
          const other = state.units.find((u) => u.id === id)!;
          return locale === 'zh' ? other.officer.chinese : other.officer.name;
        }),
      );
    for (const unit of [shu, wei]) {
      const s = structuredClone(state);
      const wallUnit = s.units.find((u) => u.id === unit.id)!;
      Object.assign(wallUnit, { x: 18, y: 16, level: 'wall', moved: false });
      s.units.push({
        ...wallUnit,
        id: 'inside-blocker',
        side: unit.side === 'shu' ? 'wei' : 'shu',
        y: 15,
        level: 'ground',
      });
      const others = s.units.filter((u) => u.id !== unit.id);
      Object.assign(others[0]!, {
        x: 17,
        y: 16,
        level: 'wall',
        side: unit.side === 'shu' ? 'wei' : 'shu',
      });
      Object.assign(others[1]!, {
        x: 19,
        y: 16,
        level: 'wall',
        side: unit.side === 'shu' ? 'wei' : 'shu',
      });
      for (const locale of ['zh', 'en'] as const)
        expect(actionContext(s, unit.id, locale)).toBe(siegeText(locale, 'contextWallBlocked'));
    }
  });
});
