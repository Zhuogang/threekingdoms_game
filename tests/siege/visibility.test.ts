import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createRenderScene } from '../../src/siege/dev/renderScenes';
import { SiegeMapView } from '../../src/siege/render/SiegeMapView';
import { anchor, plateRect } from '../../src/siege/render/boardGeometry';
import { unitVisual } from '../../src/siege/render/stateArt';
import { SPRITE_CAP } from '../../src/siege/render/v02Art';

describe('V2 living units remain findable while figures retain depth', () => {
  it.each(['visible', 'worst'] as const)(
    '%s keeps original figures, masked silhouettes and one plate per unit in all selection/xray states',
    (name) => {
      const fixture = createRenderScene(name),
        counts = [];
      for (const selected of [undefined, 'shu-jiangwei', 'wei-wangsheng'])
        for (const xray of [false, true]) {
          const markup = renderToStaticMarkup(
            createElement(SiegeMapView, { ...fixture, locale: 'en', selected, xray }),
          );
          counts.push(Number(markup.match(/data-sprite-count="(\d+)"/)![1]));
          expect(counts.at(-1)).toBeLessThanOrEqual(SPRITE_CAP);
          for (const unit of fixture.state.units) {
            expect([...markup.matchAll(new RegExp(`data-unit="${unit.id}"`, 'g'))].length).toBe(1);
            expect(
              [...markup.matchAll(new RegExp(`data-nameplate="${unit.id}"`, 'g'))].length,
            ).toBe(1);
            const r = plateRect(unit),
              at = anchor(unit);
            expect(r[2] - r[0]).toBeCloseTo(92, 8);
            expect(r[3] - r[1]).toBe(26);
            expect(r[3]).toBeLessThan(at[1]);
            const block = markup.match(
              new RegExp(`<g[^>]*data-unit="${unit.id}"[\\s\\S]*?</g>`),
            )![0];
            expect(block.match(/<image /g)?.length ?? 0).toBe(
              unitVisual(fixture.state, unit).figures.length,
            );
            expect(block).toContain('<ellipse');
            expect(block).not.toContain('<rect');
          }
          expect(markup).toContain('data-covered-unit=');
          expect(markup).toContain('flood-color="#ffd23c"');
          expect(markup.indexOf('data-nameplate=')).toBeGreaterThan(
            markup.lastIndexOf('data-object='),
          );
        }
      expect(new Set(counts).size).toBe(1);
    },
  );
  it('a gate-top formation is in front of its roof without a yellow duplicate', () => {
    const fixture = createRenderScene('visible'),
      unit = fixture.state.units.find((u) => u.id === 'wei-haozhao')!;
    const markup = renderToStaticMarkup(createElement(SiegeMapView, { ...fixture, locale: 'en' }));
    const i = markup.indexOf(`data-unit="${unit.id}"`),
      roof = markup.lastIndexOf('data-object="gate-south"');
    expect(i).toBeGreaterThan(roof);
    expect(markup).not.toContain(`data-covered-unit="${unit.id}"`);
  });
  it('nameplates show independent move/action availability and wounded/low morale', () => {
    const fixture = createRenderScene('visible');
    Object.assign(fixture.state.units[1]!, { moved: true, acted: true, wounded: 50, morale: 20 });
    const markup = renderToStaticMarkup(createElement(SiegeMapView, { ...fixture, locale: 'en' }));
    expect(markup).toContain(
      `data-nameplate="${fixture.state.units[1]!.id}" data-moved="true" data-acted="true" data-todo="none" opacity="0.55"`,
    );
    expect(markup).toContain('#f1a76e');
    expect(markup).toContain(`${fixture.state.units[1]!.troops}+`);
  });
});

it('uses the existing officer portrait when present, otherwise the side badge', () => {
  const fixture = createRenderScene('visible');
  const markup = renderToStaticMarkup(createElement(SiegeMapView, { ...fixture, locale: 'en' }));
  for (const id of ['shu-zhugeliang', 'shu-weiyan', 'wei-haozhao']) {
    const start = markup.indexOf(`data-nameplate="${id}"`),
      end = markup.indexOf('data-nameplate=', start + 1);
    const plate = markup.slice(start, end < 0 ? undefined : end);
    expect(plate).toContain('<image');
    expect(plate).toContain(
      id === 'wei-haozhao' ? 'haozhao-small.webp' : `${id.slice(4)}-small.webp`,
    );
  }
  const captainStart = markup.indexOf('data-nameplate="shu-captain-1"'),
    captainEnd = markup.indexOf('data-nameplate=', captainStart + 1);
  expect(markup.slice(captainStart, captainEnd)).not.toContain('<image');
});
