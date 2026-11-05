import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SiegeApp from '../../src/siege/ui/SiegeApp';
import { SiegeMapView } from '../../src/siege/render/SiegeMapView';
import { SiegeCampaignCard } from '../../src/siege/ui/SiegeCampaignCard';
import { createSiegeState } from '../../src/siege/rules/state';
import { deployUnit } from '../../src/siege/ui/commands';
import { predictSiegeAttack } from '../../src/siege/rules/combat';
import { resolveSiegeDay } from '../../src/siege/ui/playback';
import { act, engine } from './rulesFixtures';

describe('siege screen integration without browser APIs', () => {
  it('renders the opening and the start card in both languages through the supplied v03 locale', () => {
    for (const locale of ['en', 'zh'] as const) {
      const app = renderToStaticMarkup(
        createElement(SiegeApp, { locale, setLocale: () => {}, onExit: () => {} }),
      );
      expect(app.includes('data-phase="opening"')).toBe(true);
      expect(app.includes(locale === 'en' ? 'Skip opening' : '跳过开场')).toBe(true);
      expect(app.includes('data-testid="opening-1"')).toBe(true);
      const card = renderToStaticMarkup(createElement(SiegeCampaignCard, { locale }));
      expect(card.includes(locale === 'en' ? 'The Siege of Chencang' : '陈仓之战')).toBe(true);
    }
  });
  it('resolves all map art with ten Shu, six Wei and six engines, including mixed fortifications', () => {
    const state = createSiegeState(228);
    state.engines = [
      engine('ladder', 7, 10, { id: 'ladder', raisedAt: { x: 7, y: 7 } }),
      engine('ram', 8, 8, { id: 'ram', wrecked: true }),
      engine('tower', 10, 10, { id: 'burning', burning: true }),
      engine('earthCart', 5, 10, { id: 'cart' }),
      engine('tower', 12, 10, { id: 'tower' }),
      engine('ladder', 9, 10, { id: 'moving' }),
    ];
    state.gates.south.durability = 300;
    state.innerWall[0] = 4;
    state.innerWall[1] = 2;
    state.trenchFill['7,9'] = 1.5;
    state.trenchFill['7,9'] = 3;
    const markup = renderToStaticMarkup(
      createElement(SiegeMapView, {
        state,
        locale: 'en',
        selected: 'shu-weiyan',
        facings: { moving: 'west' },
      }),
    );
    const tokens = [...markup.matchAll(/data-unit="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(tokens).size).toBe(16);
    const images = markup.match(/<image\b[^>]*>/g)!;
    expect(images.length).toBeGreaterThan(100);
    expect(images.every((tag) => tag.includes('href="') && !tag.includes('href="undefined"'))).toBe(
      true,
    );
    expect(markup.includes('inner-0')).toBe(true);
  });
  it('executes the browser playthrough deployment, wall forecast, cart queue and next day through real rules', () => {
    let state = createSiegeState(228);
    state = deployUnit(state, 'shu-captain-3', { x: 9, y: 10, level: 'ground' });
    const ram = state.engines.find((e) => e.kind === 'ram')!;
    state = act(state, { type: 'moveEngine', engineId: ram.id, x: 8, y: 8 });
    state = act(state, { type: 'move', unitId: 'shu-captain-3', x: 8, y: 9, level: 'ground' });
    const forecast = predictSiegeAttack(state, 'shu-captain-3', 'wei-haozhao');
    expect(forecast).toMatchObject({ inRange: true, frontage: 600, modifiers: { parapet: 0.3 } });
    state = act(state, { type: 'attack', unitId: 'shu-captain-3', targetId: 'wei-haozhao' });
    state = act(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'earthCart' });
    const next = resolveSiegeDay(state).final;
    expect(next.day).toBe(2);
    expect(next.engines.some((e) => e.kind === 'earthCart')).toBe(true);
  });
});
