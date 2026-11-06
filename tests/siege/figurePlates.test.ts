import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { layoutNameplates, plateRect } from '../../src/siege/render/boardGeometry';
import { SiegeMapView } from '../../src/siege/render/SiegeMapView';
import { rectsOverlap, type ScreenRect } from '../../src/siege/render/scene';
import { engineSprite, unitVisual } from '../../src/siege/render/stateArt';
import { createSiegeState } from '../../src/siege/rules/state';

it.each([1, 2, 'storm'] as const)(
  '%s ladder plates sit at foot + 10, clear of durability bars and enemy figures',
  (progress) => {
    for (const x of [6, 10]) {
      const state = createSiegeState(228),
        unit = state.units[1]!,
        enemy = state.units.find((u) => u.id === 'wei-wangsheng')!;
      Object.assign(unit, {
        x,
        y: 10,
        ...(progress === 'storm' ? { assaultedDay: state.day } : {}),
      });
      Object.assign(enemy, { x, y: 7 });
      state.units = [unit, enemy];
      state.engines = [{ ...state.engines[0]!, x, raisedAt: { x, y: 7 } }];
      state.footholds[`${x},7`] = progress === 'storm' ? 0 : progress;
      const units = state.units.map((unit) => ({ unit, visual: unitVisual(state, unit) }));
      const plates = layoutNameplates(
        units.map(({ unit, visual }) => ({
          id: unit.id,
          position: unit,
          foot: visual.foot,
          rect: visual.rect,
          belowFoot: visual.climbing || visual.storming,
        })),
      );
      const visual = units[0]!.visual,
        r = plates.get(unit.id)!,
        sprite = engineSprite(state.engines[0]!);
      expect(r[1]).toBe(visual.foot[1] + 10);
      expect((r[0] + r[2]) / 2).toBe(visual.foot[0]);
      const bar: ScreenRect = [
        sprite.rect[0],
        sprite.rect[3] + 3,
        sprite.rect[0] + 50,
        sprite.rect[3] + 7,
      ];
      expect(rectsOverlap(r, bar)).toBe(false);
      for (const box of units[1]!.visual.figureRects) expect(rectsOverlap(r, box)).toBe(false);
      expect(rectsOverlap(r, plates.get(enemy.id)!)).toBe(false);
      // Check the view actually passes the foot-placement flag to the layout.
      const markup = renderToStaticMarkup(createElement(SiegeMapView, { state, locale: 'en' }));
      const plateTag = markup.match(new RegExp(`<g data-nameplate="${unit.id}"[^>]*>`))?.[0];
      expect(plateTag).toContain(`transform="translate(${r[0]} ${r[1]})"`);
    }
  },
);

it('a foot plate meeting its neighbour spreads upward and skips the durability bar', () => {
  const position = { x: 6, y: 10, level: 'ground' as const };
  const formations = [100, 164].map((x, i) => ({
    id: `climber-${i}`,
    position,
    foot: [x, 900] as [number, number],
    rect: [x - 10, 700, x + 10, 900] as ScreenRect,
    belowFoot: true,
  }));
  const plates = layoutNameplates(formations),
    a = plates.get('climber-0')!,
    b = plates.get('climber-1')!;
  expect(a).toEqual([54, 910, 146, 936]);
  expect(b).toEqual([118, 873, 210, 899]);
  expect(rectsOverlap(a, b)).toBe(false);
  expect(b[3]).toBeLessThanOrEqual(903);
  expect(b[1]).toBeGreaterThan(formations[1]!.rect[1]);
});

it('mound plates retain their position above the figures', () => {
  const state = createSiegeState(228),
    unit = state.units[1]!;
  Object.assign(unit, { x: 6, y: 8 });
  state.mounds['6,8'] = 6;
  const visual = unitVisual(state, unit);
  expect(visual.displaced).toBe(true);
  expect(visual.climbing || visual.storming).toBe(false);
  const r = plateRect(unit, visual.foot, visual.rect[1], visual.climbing || visual.storming);
  expect(r[3]).toBeLessThanOrEqual(visual.rect[1] - 4);
});

it('preferred plates stay on the map at all four edges', () => {
  const position = { x: 0, y: 0, level: 'ground' as const };
  for (const x of [0, 3072])
    for (const y of [0, 1536])
      for (const belowFoot of [false, true]) {
        const r = plateRect(position, [x, y], y - 100, belowFoot);
        expect(r[0]).toBeGreaterThanOrEqual(2);
        expect(r[1]).toBeGreaterThanOrEqual(2);
        expect(r[2]).toBeLessThanOrEqual(3070);
        expect(r[3]).toBeLessThanOrEqual(1534);
        expect(r[2] - r[0]).toBe(92);
        expect(r[3] - r[1]).toBe(26);
      }
});
