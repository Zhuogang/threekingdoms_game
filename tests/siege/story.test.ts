import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSiegeState } from '../../src/siege/rules/state';
import { predictSiegeAttack } from '../../src/siege/rules/combat';
import { runAttackerTurn } from '../../src/siege/ai/attacker';
import { runDefenderTurn } from '../../src/siege/ai/defender';
import { endDay } from '../../src/siege/rules/day';
import { siegeText } from '../../src/siege/i18n';
import { encounteredHints, OPENING, siegeSummary } from '../../src/siege/ui/story';
import { playScriptDays } from '../../src/siege/ui/devPlaythrough';
import {
  SiegeActBanner,
  SiegeEnding,
  SiegeOpening,
  SiegeSummary,
} from '../../src/siege/ui/SiegeStory';
import { engine } from './rulesFixtures';

describe('Chencang story and summary', () => {
  it('uses the selected runtime art and portraits for two scenes of three dialogue lines in both languages', () => {
    expect(OPENING.filter((line) => line.scene === 2)).toHaveLength(3);
    expect(OPENING.filter((line) => line.scene === 3)).toHaveLength(3);
    expect(OPENING.filter((line) => line.text.startsWith('openingCall'))).toHaveLength(2);
    expect(OPENING.filter((line) => line.text.startsWith('openingRefusal'))).toHaveLength(2);
    for (const locale of ['zh', 'en'] as const) {
      OPENING.forEach((line, step) => {
        const html = renderToStaticMarkup(
          createElement(SiegeOpening, { locale, step, next: () => {}, skip: () => {} }),
        );
        expect(html).toContain(`s7-0${line.scene}-opening-`);
        expect(html).toContain('pieces/dialog.png');
        expect(html).toContain('pieces/plaque.png');
        expect(html).toContain(siegeText(locale, line.text));
        expect(html).toContain(
          line.speaker === 'zhugeliang'
            ? 'data-portrait-id="zhugeliang"'
            : `${line.speaker}-small.webp`,
        );
      });
      for (const act of [1, 2] as const) {
        const html = renderToStaticMarkup(
          createElement(SiegeActBanner, { act, locale, close: () => {} }),
        );
        for (const piece of ['scroll-left', 'scroll-middle', 'scroll-right'])
          expect(html).toContain(`${piece}.png`);
        expect(html).toContain(siegeText(locale, act === 1 ? 'act1Title' : 'act2Title'));
      }
    }
  });
  it('finds hints at the actual trench, ladder, limited forecast and inner-wall encounters', () => {
    const state = createSiegeState(2);
    expect(encounteredHints(state, 'shu-weiyan', null)).toEqual(['wall']);
    Object.assign(state.units[1]!, { x: 20, y: 19 });
    state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
    const target = state.units.find((u) => u.id === 'wei-wangsheng')!;
    Object.assign(target, { x: 20, y: 16 });
    state.innerWall[0] = 1;
    const forecast = predictSiegeAttack(state, 'shu-weiyan', target.id)!;
    expect(forecast.frontage).toBe(150);
    expect(encounteredHints(state, 'shu-weiyan', forecast)).toEqual([
      'wall',
      'trench',
      'ladder',
      'frontage',
      'innerWall',
    ]);
    state.engines[0]!.wrecked = true;
    expect(encounteredHints(state, null, null)).toEqual(['wall', 'innerWall']);
  });
  it('counts losses after recovery and distinguishes destroyed engines from spent carts', () => {
    const state = createSiegeState(2);
    state.units[1]!.troops -= 100;
    state.units[1]!.wounded = 60;
    state.log = ['cart-spent', 'cart-wreck', 'ladder'].map((id) => ({
      day: 1,
      code: 'engineCompleted',
      params: { kind: id === 'ladder' ? 'ladder' : 'earthCart', engineId: id },
    }));
    state.engines = [
      engine('earthCart', 20, 19, { id: 'cart-wreck', wrecked: true }),
      engine('ladder', 21, 19, { id: 'ladder' }),
    ];
    state.trenchFill['20,18'] = 3;
    state.trenchFill['21,18'] = 1.5;
    const result = siegeSummary(state);
    expect(result.shu).toEqual({ total: 100, dead: 40, wounded: 60 });
    expect(result.engines.find((e) => e.kind === 'earthCart')).toEqual({
      kind: 'earthCart',
      built: 2,
      destroyed: 1,
    });
    expect(result.trench).toMatchObject({ partial: 1, filled: 1 });
    state.units[1]!.troops += 30;
    state.units[1]!.wounded -= 30;
    expect(siegeSummary(state).shu).toEqual({ total: 70, dead: 40, wounded: 30 });
  });
  it.each(['victory', 'historical', 'defeat'] as const)(
    'renders the %s ending and a complete bilingual summary',
    (outcome) => {
      const state = createSiegeState(2);
      state.outcome = outcome;
      for (const locale of ['zh', 'en'] as const) {
        const html = renderToStaticMarkup(
          createElement(SiegeEnding, {
            state,
            locale,
            summary: false,
            onSummary: () => {},
            onExit: () => {},
          }),
        );
        expect(html).toContain(
          `s7-0${outcome === 'victory' ? 5 : outcome === 'historical' ? 6 : 7}-ending-`,
        );
        expect(html).toContain('data-testid="ending-narration"');
        const summary = renderToStaticMarkup(
          createElement(SiegeSummary, { state, locale, onEnding: () => {}, onExit: () => {} }),
        );
        expect(summary).toContain(siegeText(locale, 'historyParagraph'));
        for (const key of ['losses', 'engineSummary', 'gates', 'trenchSummary'] as const) {
          expect(summary).toContain(siegeText(locale, key, { ...siegeSummary(state).trench }));
        }
      }
      state.withdrawn = true;
      if (outcome === 'historical') {
        const html = renderToStaticMarkup(
          createElement(SiegeEnding, {
            state,
            locale: 'en',
            summary: false,
            onSummary: () => {},
            onExit: () => {},
          }),
        );
        expect(html).toContain('Lower rating: Voluntary withdrawal');
        expect(html).toContain('early withdrawal');
      }
    },
  );
  it.each([
    [1, 'victory', 12],
    [8, 'historical', 12],
    [11, 'historical', 12],
  ] as const)(
    'plays seed %i to %s using the real simulation strategy',
    (seed, outcome, day) => {
      const initial = createSiegeState(seed);
      const firstDay = playScriptDays(initial, 'careful', 1);
      expect(firstDay).toEqual(endDay(runDefenderTurn(runAttackerTurn(initial, 'careful'))));
      const final = playScriptDays(firstDay, 'careful');
      expect(final.outcome).toBe(outcome);
      expect(final.day).toBe(day);
      expect(initial.day).toBe(1);
      expect(() => playScriptDays(initial, 'careful', 0)).toThrow();
    },
    30000,
  );
});
