import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GATES } from '../../src/siege/content/chencang';
import { FRAME, MAP } from '../../src/siege/render/assets';
import {
  anchor,
  centre,
  contains,
  depthOf,
  gateTowerAt,
  hitRect,
  positionAt,
} from '../../src/siege/render/boardGeometry';
import { compareDepth, rectsOverlap, sliceObject } from '../../src/siege/render/scene';
import { unitVisual } from '../../src/siege/render/stateArt';
import { pickMapHit } from '../../src/siege/render/picking';
import { resolveMapClick } from '../../src/siege/ui/mapClick';
import { SiegeMapView } from '../../src/siege/render/SiegeMapView';
import { createSiegeState } from '../../src/siege/rules/state';
import { createRenderScene } from '../../src/siege/dev/renderScenes';

const positions = Object.values(GATES).flatMap((gate) =>
  (['wall', 'ground'] as const).map((level) => ({ ...gate.cells[0]!, level })),
);

describe('gatehouse figures', () => {
  it.each(positions)(
    '$x,$y,$level sorts ahead of every tower/parapet slice, intact and broken',
    (position) => {
      for (const broken of [false, true]) {
        const state = createSiegeState(228),
          unit = state.units[1]!;
        state.units = [unit];
        state.engines = [];
        Object.assign(unit, position);
        for (const gate of Object.values(state.gates))
          Object.assign(gate, { broken, durability: broken ? 0 : gate.max });
        const visual = unitVisual(state, unit),
          tower = gateTowerAt(unit)!;
        expect(visual.depth.row).toBeGreaterThanOrEqual(tower.cells[3]!);
        expect(visual.depth.height).toBeGreaterThan(tower.height);
        const objects = MAP.objects.filter((o) => o.id.startsWith(tower.id));
        expect(objects.length).toBeGreaterThan(0);
        for (const object of objects)
          for (const slice of sliceObject(FRAME, object))
            expect(compareDepth(visual.depth, slice)).toBeGreaterThan(0);
        const south = { ...position, y: position.y + 1, level: 'ground' as const };
        expect(compareDepth(depthOf(south), visual.depth)).toBeGreaterThan(0);
        const html = renderToStaticMarkup(createElement(SiegeMapView, { state, locale: 'en' }));
        expect(html).not.toContain(`data-covered-unit="${unit.id}"`);
        expect(html.indexOf(`data-unit="${unit.id}"`)).toBeGreaterThan(
          html.lastIndexOf(`data-object="${tower.id}"`),
        );
      }
    },
  );
  it.each([...positions, { x: 8, y: 6, level: 'ground' as const }])(
    '$x,$y,$level remains pickable at every figure centre',
    (position) => {
      const state = createSiegeState(228),
        unit = state.units[1]!;
      state.units = [unit];
      state.engines = [];
      Object.assign(unit, position, { moved: true });
      const visual = unitVisual(state, unit);
      for (const rect of visual.figureRects) {
        const [x, y] = centre(rect);
        const hit = pickMapHit(
          { state, selected: null },
          { x, y },
          [{ unit, visual }],
          [],
          new Map(),
        );
        expect(resolveMapClick({ state, selected: null, ...hit }, hit.cell)).toEqual({
          type: 'select',
          id: unit.id,
        });
      }
      const at = anchor(unit, state),
        r = hitRect(unit, state)!;
      expect(contains(r, ...at)).toBe(true);
      expect(positionAt(state, ...centre(r))).toEqual(position);
    },
  );
  it('places the inner-yard foot north of the ridge without overlapping the formation at (8,5)', () => {
    const state = createSiegeState(228),
      unit = state.units[1]!;
    Object.assign(unit, { x: 8, y: 6, level: 'ground' });
    const yard = unitVisual(state, unit),
      north = unitVisual(state, { ...unit, y: 5 });
    expect(yard.foot).toEqual([1536, 588]);
    expect(rectsOverlap(yard.rect, north.rect)).toBe(false);
    expect(yard.foot[1]).toBeLessThan(591);
  });
  it.each(['gates', 'gatesGround'] as const)(
    '%s contains exactly the review formations and gate states',
    (name) => {
      const { state } = createRenderScene(name);
      expect(state.units).toHaveLength(name === 'gates' ? 4 : 5);
      expect(Object.values(state.gates).every((g) => g.broken === (name === 'gatesGround'))).toBe(
        true,
      );
    },
  );
});
