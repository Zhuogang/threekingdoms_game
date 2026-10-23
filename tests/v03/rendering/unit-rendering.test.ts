import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BattlefieldMapView } from '../../../src/v03/rendering/BattlefieldMapView';
import { BattlefieldMinimap } from '../../../src/v03/rendering/BattlefieldMinimap';
import { formatTroopCount, type BattleUnitVisual } from '../../../src/v03/rendering/presentation';

const map = { width: 2, height: 2, terrain: ['plain', 'water', 'forest', 'hill'] };
const units: BattleUnitVisual[] = [
  {
    id: 'living',
    troopType: 'infantry',
    position: { x: 0, y: 0 },
    faction: 'player',
    strength: 700,
    label: 'Living officer',
  },
  {
    id: 'fallen',
    troopType: 'archer',
    position: { x: 1, y: 0 },
    faction: 'opponent',
    strength: 0,
    label: 'Fallen officer',
    selected: true,
  },
];

describe('battlefield unit presentation', () => {
  it.each(['en', 'zh'] as const)('%s keeps exact small and large troop counts', (locale) => {
    expect([1, 500, 700, 1500, 100_000].map((count) => formatTroopCount(count, locale))).toEqual([
      '1',
      '500',
      '700',
      '1,500',
      '100,000',
    ]);
    const html = renderToStaticMarkup(createElement(BattlefieldMapView, { map, units, locale }));
    expect(html).toContain('>700</text>');
    expect(html).not.toContain('>0</text>');
  });

  it('shows the leader portrait over the troop glyph and marks the troop type', () => {
    const html = renderToStaticMarkup(
      createElement(BattlefieldMapView, {
        map,
        units: [{ ...units[0]!, portraitKey: 'guanyu' }],
      }),
    );
    expect(html).toContain('assets/portraits/guanyu-small.webp');
    expect(html).toContain('>步</text>');
    expect(html).toContain('url(#v03-terrain-map-water)');
  });

  it.each([BattlefieldMapView, BattlefieldMinimap])(
    '%s omits defeated units while retaining their supplied historical records',
    (View) => {
      const html = renderToStaticMarkup(createElement(View, { map, units }));
      expect(html).toContain('data-unit-id="living"');
      expect(html).not.toContain('data-unit-id="fallen"');
      expect(html).not.toContain('Fallen officer');
      expect(units).toHaveLength(2);
      expect(units[1]?.strength).toBe(0);
    },
  );
});
