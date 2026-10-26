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

  it('draws the plan §4 token parts and states', () => {
    const html = renderToStaticMarkup(
      createElement(BattlefieldMapView, {
        map,
        attackableCells: [{ x: 0, y: 0 }],
        units: [
          {
            ...units[0]!,
            strength: 350,
            maxStrength: 700,
            formationSize: 3,
            acted: true,
            routed: true,
            condition: 'confused',
          },
        ],
      }),
    );
    expect(html).toContain('>×3</text>');
    expect(html).toContain('width="20"'); // strength bar at 350/700 of 40 units
    expect(html).toContain('grayscale(0.9)');
    expect(html).toContain('opacity:0.3825'); // routed 0.45 × acted 0.85
    expect(html).toContain('fill="#6d4a91"'); // confusion icon
    expect(html).toContain('stroke="#c2412f"'); // attackable ring
    expect(html).toContain('data-detail="portrait"'); // full detail until the view is measured
    const single = renderToStaticMarkup(
      createElement(BattlefieldMapView, { map, units: [{ ...units[0]!, formationSize: 1 }] }),
    );
    expect(single).not.toContain('×');
    expect(single).not.toContain('grayscale');
  });

  it('hides the grid lines when asked', () => {
    const shown = renderToStaticMarkup(createElement(BattlefieldMapView, { map }));
    const hidden = renderToStaticMarkup(
      createElement(BattlefieldMapView, { map, showGrid: false }),
    );
    expect(shown).not.toContain('display="none"');
    expect(hidden).toContain('display="none"');
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
