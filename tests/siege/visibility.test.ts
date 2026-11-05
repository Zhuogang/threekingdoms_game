import { mkdirSync, writeFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createRenderScene } from '../../src/siege/dev/renderScenes';
import { FRAME, MAP } from '../../src/siege/render/assets';
import { SiegeMapView } from '../../src/siege/render/SiegeMapView';
import { rectsOverlap, sliceObject } from '../../src/siege/render/scene';
import { engineSprite, unitVisual } from '../../src/siege/render/stateArt';
import { pickMapPosition } from '../../src/siege/render/picking';
import { resolveMapClick } from '../../src/siege/ui/mapClick';
import { SPRITE_CAP } from '../../src/siege/render/v02Art';

const render = (name: 'visible' | 'worst', selected?: string, xray = false) => {
  const fixture = createRenderScene(name);
  const markup = renderToStaticMarkup(
    createElement(SiegeMapView, { ...fixture, locale: 'en', selected, xray }),
  );
  return { ...fixture, markup };
};

describe('S2 every living formation remains visible', () => {
  it.each(['visible', 'worst'] as const)(
    '%s draws each full formation once, independently of selection and budget',
    (name) => {
      const counts = [];
      for (const selected of [undefined, 'shu-jiangwei', 'wei-wangsheng'])
        for (const xray of [false, true]) {
          const { state, markup } = render(name, selected, xray);
          const count = Number(markup.match(/data-sprite-count="(\d+)"/)![1]);
          expect(count).toBeLessThanOrEqual(SPRITE_CAP);
          counts.push(count);
          let figures = 0;
          for (const unit of state.units.filter((u) => u.troops > 0)) {
            const visual = unitVisual(state, unit);
            expect(
              [...markup.matchAll(new RegExp(`data-unit="${unit.id}"`, 'g'))].length,
              unit.id,
            ).toBe(1);
            const block = markup.match(
              new RegExp(`<g[^>]*data-unit="${unit.id}"[\\s\\S]*?</g>`),
            )![0];
            expect(block.match(/<image /g)?.length ?? 0, unit.id).toBe(visual.figures.length);
            expect(block).toContain('<ellipse');
            expect(block.match(/<rect /g)).toHaveLength(2);
            expect(block).not.toContain('filter=');
            for (const figure of visual.figures)
              expect(block).toContain(`href="${figure.pose.href}"`);
            figures += visual.figures.length;
          }
          if (name === 'worst') expect(figures).toBe(80);
          const silhouettes = [...markup.matchAll(/<g[^>]*data-silhouette="[^"]+"[^>]*>/g)].map(
            (m) => m[0],
          );
          expect(silhouettes.length).toBeGreaterThan(0);
          for (const node of silhouettes) {
            expect(node).toContain('opacity="0.85"');
            expect(node).not.toContain('mask=');
          }
        }
      expect(new Set(counts).size).toBe(1);
      mkdirSync('.artifacts/siege', { recursive: true });
      writeFileSync(
        `.artifacts/siege/s2-visibility-${name}.json`,
        JSON.stringify(
          {
            scene: name,
            images: counts[0],
            cap: SPRITE_CAP,
            selectionXrayCombinations: counts.length,
            units: 16,
            figures: name === 'worst' ? 80 : undefined,
          },
          null,
          2,
        ) + '\n',
      );
      console.info(`S2 ${name}: ${counts[0]}/${SPRITE_CAP} images, 6 selection/xray combinations`);
    },
  );

  it('all overlapping wall, parapet and tower slices paint before each living figure', () => {
    for (const name of ['visible', 'worst'] as const) {
      const { state, markup } = render(name);
      for (const unit of state.units.filter((u) => u.troops > 0)) {
        const visual = unitVisual(state, unit);
        const position = markup.indexOf(`data-unit="${unit.id}"`);
        for (const object of MAP.objects.filter((o) => /wall|parapet|tower/.test(o.kind)))
          for (const slice of sliceObject(FRAME, object)) {
            if (!rectsOverlap(visual.rect, slice.rect)) continue;
            const node = markup.match(
              new RegExp(`data-selection-layer="[^"]*-${object.id}-${slice.row}"`),
            );
            expect(node, object.id).not.toBeNull();
            expect(position, `${name}/${unit.id}/${object.id}/${slice.row}`).toBeGreaterThan(
              node!.index!,
            );
          }
      }
    }
  });

  it('all 16 unselected unit rect centres choose and select their own cell in the look-probe fixture', () => {
    const { state } = createRenderScene('visible');
    for (const unit of state.units) {
      const { rect } = unitVisual(state, unit);
      const picked = pickMapPosition(state, (rect[0] + rect[2]) / 2, (rect[1] + rect[3]) / 2);
      expect(picked, unit.id).toEqual({ x: unit.x, y: unit.y, level: unit.level });
      expect(resolveMapClick({ state }, picked), unit.id).toEqual({ type: 'select', id: unit.id });
    }
  });

  it('the unit behind the raised ladder clears its top, with its disc and health bar', () => {
    const { state, markup } = render('visible');
    const unit = state.units.find((u) => u.id === 'shu-jiangwei')!;
    const ladder = engineSprite(state.engines[0]!);
    expect(rectsOverlap(unitVisual(state, unit).rect, ladder.rect)).toBe(true);
    expect(markup.indexOf(`data-unit="${unit.id}"`)).toBeGreaterThan(
      markup.lastIndexOf(`data-piece="${ladder.id}"`),
    );
  });
});
