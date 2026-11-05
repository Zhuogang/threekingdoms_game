import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSiegeState } from '../../src/siege/rules/state';
import { morningReport, rememberReport, REPORT_PAGE_SIZE } from '../../src/siege/ui/report';
import { SiegeMorningReport } from '../../src/siege/ui/SiegeMorningReport';
import { siegeText, SIEGE_COPY, type SiegeTextKey } from '../../src/siege/i18n';
import { serializeSiegeSave, deserializeSiegeSave } from '../../src/siege/save';
import type { SiegeLogEntry } from '../../src/siege/rules/types';
const event = (code: string, params: SiegeLogEntry['params'], day = 1): SiegeLogEntry => ({
  day,
  code,
  params,
});

describe('O morning report acceptance', () => {
  it('reports two unusable preparations once by run, persists notice history, and retains stores', () => {
    const state = createSiegeState(1);
    state.day = 2;
    state.units = state.units.filter((u) => u.side === 'shu');
    state.preparations.boulders = { '5,7': { day: 1 }, '6,7': { day: 1 } };
    const items = morningReport([], state.preparations, 2, 'zh', [], state);
    expect(items).toHaveLength(1);
    expect(items[0]!.text).toContain('南墙西段备有2处礌石');
    const reportSeen = rememberReport(items, {}, 2);
    const save = deserializeSiegeSave(
      serializeSiegeSave({
        state,
        phase: 'battle',
        playerSide: 'shu',
        facings: {},
        presentation: { openingStep: 6, bannersSeen: [1], dismissedHints: [], reportSeen },
      }),
    );
    expect(
      morningReport(
        [],
        state.preparations,
        2,
        'zh',
        [],
        state,
        'shu',
        save.presentation!.reportSeen,
      ),
    ).toEqual(items);
    state.day = 3;
    expect(morningReport([], state.preparations, 3, 'zh', [], state, 'shu', reportSeen)).toEqual(
      [],
    );
    expect(Object.keys(state.preparations.boulders)).toHaveLength(2);
    // A newly prepared pile is a new warning, even on a previously reported cell.
    state.preparations.boulders['6,7'] = { day: 2 };
    expect(
      morningReport([], state.preparations, 3, 'en', [], state, 'shu', reportSeen),
    ).toHaveLength(1);
  });
  it('keeps an old preparation which has a ready operator in the daily threat list', () => {
    const state = createSiegeState(1);
    state.day = 8;
    Object.assign(
      state.units.find((u) => u.id === 'wei-wangsheng')!,
      { x: 6, y: 7 },
    );
    state.preparations.boulders['6,7'] = { day: 1 };
    const items = morningReport([], state.preparations, 8, 'en', [], state);
    expect(items).toHaveLength(1);
    expect(items[0]!.priority).toBe(0);
    expect(items[0]!.text).toContain('threatening climbers');
  });
  it.each(['zh', 'en'] as const)(
    'chains a burning engine loss into one line and a loss counter (%s)',
    (locale) => {
      const state = createSiegeState(1);
      const id = state.engines.find((e) => e.kind === 'earthCart')!.id;
      const log = [
        event('fireArrowHit', { engineId: id, before: 80, after: 11 }),
        event('engineLost', { engineId: id, kind: 'earthCart' }),
        event('engineBurning', { engineId: id, before: 11, after: 0 }),
      ];
      const items = morningReport(log, state.preparations, 2, locale, [], state);
      expect(items).toHaveLength(1);
      expect(items[0]!.text).toContain('80 → 0');
      expect(items[0]!.text).toContain(locale === 'zh' ? '土车被火箭烧毁' : 'destroyed');
      expect(items[0]!.counter).toBe(siegeText(locale, 'counterEngineLoss'));
    },
  );
  it.each([1, 2])(
    'snow is one item per run regardless of when a brazier was lit (lit day %s)',
    (litDay) => {
      const state = createSiegeState(1);
      state.engines = [];
      const log = [
        event('brazierPrepared', { cell: '5,7' }, litDay),
        event('brazierPrepared', { cell: '6,7' }, litDay),
        event('brazierDoused', { cell: '5,7' }, 3),
        event('brazierDoused', { cell: '6,7' }, 3),
      ];
      for (const side of ['shu', 'wei'] as const) {
        const items = morningReport(log, state.preparations, 3, 'zh', [], state, side);
        expect(items).toHaveLength(1);
        expect(items[0]!.code).toBe('brazierDoused');
        expect(items[0]!.text).toContain('2处火盆');
      }
    },
  );
  it('groups Wei ladders and covers by kind across both runs, without repeating counters', () => {
    const state = createSiegeState(1);
    state.day = 2;
    const ladders = state.engines.filter((e) => e.kind === 'ladder');
    const log = ladders.flatMap((e) => [
      event('raiseLadder', { engineId: e.id }, 2),
      event('covered', { engineId: e.id }, 2),
    ]);
    const items = morningReport(log, state.preparations, 2, 'zh', [], state, 'wei');
    expect(items.filter((i) => i.code === 'raiseLadder')).toHaveLength(1);
    expect(items.find((i) => i.code === 'raiseLadder')!.text).toContain('南墙东西两段');
    expect(items.find((i) => i.code === 'raiseLadder')!.text).toContain('2架云梯');
    expect(items.filter((i) => i.code === 'covered')).toHaveLength(1);
    const seen = rememberReport(items, {}, 2);
    expect(morningReport([], state.preparations, 3, 'zh', [], state, 'wei', seen)).toEqual([]);
  });
  it('limits the visible panel to five items and exposes the exact remaining count', () => {
    const items = Array.from({ length: 13 }, (_, i) => ({
      code: String(i),
      icon: 'brazier' as const,
      text: `Event ${i}`,
      counter: 'One shared counter',
      place: null,
      priority: i,
    }));
    const html = renderToStaticMarkup(
      createElement(SiegeMorningReport, { items, locale: 'en', close: () => {} }),
    );
    expect(html.match(/data-testid="report-item"/g) ?? []).toHaveLength(REPORT_PAGE_SIZE);
    expect(html).toContain('More (8 remaining)');
    expect(html.match(/One shared counter/g) ?? []).toHaveLength(1);
    expect(html).not.toContain('Event 5');
  });
  it('has no spaces next to CJK characters in any Chinese report template after interpolation', () => {
    const params = {
      cell: '南墙西段',
      engine: '土车',
      unit: '王平',
      gate: '南门',
      preparation: '礌石',
      cause: '被火箭烧',
      before: 80,
      after: 0,
      count: 2,
      n: 8,
      casualties: 30,
      loss: 2,
      segment: 1,
      max: 6,
    };
    for (const key of Object.keys(SIEGE_COPY.zh).filter((k) =>
      k.startsWith('report'),
    ) as SiegeTextKey[]) {
      expect(siegeText('zh', key, params), key).not.toMatch(/[\u3400-\u9fff]\s|\s[\u3400-\u9fff]/u);
    }
    expect(siegeText('zh', 'reportThrown', params)).toBe('王平因士气过低被打下城，退到城下。');
  });
});

it('reports an archer operating an existing boulder pile as ready, matching the command rules', () => {
  const state = createSiegeState(1);
  state.day = 3;
  state.units = state.units.filter((u) => u.side === 'shu' || u.id === 'wei-captain-1');
  Object.assign(
    state.units.find((u) => u.id === 'wei-captain-1')!,
    { x: 6, y: 7 },
  );
  state.preparations.boulders['6,7'] = { day: 1 };
  const items = morningReport([], state.preparations, 3, 'en', [], state);
  expect(items[0]!.priority).toBe(0);
  expect(items[0]!.text).toContain('threatening climbers');
});

it('keeps yesterday’s daytime Shu actions out of today’s Wei report', () => {
  const state = createSiegeState(1);
  state.engines = [];
  const items = morningReport(
    [
      event('raiseLadder', { cell: '6,7' }),
      event('covered', { cell: '6,7' }),
      event('nightAssault', { result: 'advanced' }),
    ],
    state.preparations,
    2,
    'en',
    [],
    state,
    'wei',
  );
  expect(items.map((i) => i.code)).toEqual(['nightAssault']);
});

it('counts identical losses of distinct engines instead of silently dropping the second loss', () => {
  const state = createSiegeState(1);
  const log = state.engines
    .filter((e) => e.kind === 'ladder')
    .flatMap((e) => [
      event('fireArrowHit', { engineId: e.id, before: 80, after: 0 }),
      event('engineLost', { engineId: e.id, kind: 'ladder' }),
    ]);
  const items = morningReport(log, state.preparations, 2, 'zh', [], state);
  expect(items).toHaveLength(1);
  expect(items[0]!.text).toContain('2件云梯被火箭烧毁');
});
