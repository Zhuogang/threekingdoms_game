import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { COURTYARD, SOUTH_TRENCH } from '../../src/siege/content/chencang';
import { siegeText } from '../../src/siege/i18n';
import { SIEGE_DAYS } from '../../src/siege/rules/constants';
import { ENGINE_RULES, endDay } from '../../src/siege/rules/day';
import { createSiegeState } from '../../src/siege/rules/state';
import { deserializeSiegeSave, serializeSiegeSave, type SiegeSave } from '../../src/siege/save';
import { actionReason } from '../../src/siege/ui/commands';
import { HOW_TO_RULES } from '../../src/siege/ui/howToPlay';
import { SiegeHowToPlay } from '../../src/siege/ui/SiegeHowToPlay';
import {
  advanceWalkthrough,
  startWalkthrough,
  settleWalkthrough,
} from '../../src/siege/ui/walkthrough';
import { act, engine } from './rulesFixtures';

const ui = { tab: 'commands', selected: 'shu-weiyan' };

describe('how to play', () => {
  it('renders both languages with the actual rule constants and follows an altered rules view', () => {
    const initial = createSiegeState(228);
    const before = structuredClone(initial);
    expect(HOW_TO_RULES.days).toBe(SIEGE_DAYS);
    expect(HOW_TO_RULES.engines).toBe(ENGINE_RULES);
    expect(HOW_TO_RULES.courtyardFirst).toBe(Math.min(...COURTYARD.map((c) => c.y)));
    expect(HOW_TO_RULES.courtyardLast).toBe(Math.max(...COURTYARD.map((c) => c.y)));
    for (const locale of ['zh', 'en'] as const) {
      const render = (rules = HOW_TO_RULES) =>
        renderToStaticMarkup(
          createElement(SiegeHowToPlay, { locale, rules, close: () => {}, replay: () => {} }),
        );
      const html = render();
      expect(html).toContain('role="dialog"');
      expect(html).toContain(siegeText(locale, 'howTitle'));
      expect(html).toContain(
        siegeText(locale, 'howGoalBody', {
          days: SIEGE_DAYS,
          first: HOW_TO_RULES.courtyardFirst,
          last: HOW_TO_RULES.courtyardLast,
        }),
      );
      for (const kind of ['ladder', 'ram', 'earthCart', 'tower'] as const) {
        expect(html).toContain(
          siegeText(locale, kind === 'tower' ? 'howTowerDays' : 'howBuildDays', {
            kind: siegeText(locale, kind === 'ram' ? 'ramEngine' : kind),
            days: ENGINE_RULES[kind].days,
          }),
        );
      }
      const changed = render({
        ...HOW_TO_RULES,
        days: 31,
        engines: { ...ENGINE_RULES, earthCart: { ...ENGINE_RULES.earthCart, days: 9 } },
      });
      expect(changed).toContain(
        siegeText(locale, 'howBuildDays', { kind: siegeText(locale, 'earthCart'), days: 9 }),
      );
      expect(changed).toContain(
        siegeText(locale, 'howGoalBody', {
          days: 31,
          first: HOW_TO_RULES.courtyardFirst,
          last: HOW_TO_RULES.courtyardLast,
        }),
      );
    }
    expect(initial).toEqual(before);
  });

  it('gets the cap, trench loads and supervision reduction from actual rule behavior', () => {
    const state = createSiegeState(1);
    const target = SOUTH_TRENCH.find((c) => c.y === HOW_TO_RULES.trenchOuter)!;
    state.engines = [engine('earthCart', target.x, HOW_TO_RULES.trenchSouth)];
    const filled = act(state, { type: 'fillTrench', engineId: 'engine', ...target });
    expect(HOW_TO_RULES.cartFill).toBe(filled.trenchFill[`${target.x},${target.y}`]);
    state.engines = [];
    const infantry = state.units.find((u) => u.side === 'shu' && u.troopType === 'infantry')!;
    Object.assign(infantry, { x: target.x, y: HOW_TO_RULES.trenchSouth });
    const manual = act(state, { type: 'fillTrench', unitId: infantry.id, ...target });
    expect(HOW_TO_RULES.infantryFill).toBe(manual.trenchFill[`${target.x},${target.y}`]);
    expect(HOW_TO_RULES.fillRatio).toBe(HOW_TO_RULES.cartFill / HOW_TO_RULES.infantryFill);
    state.engines = Array.from({ length: HOW_TO_RULES.engineCap }, (_, i) =>
      engine('earthCart', i, 20),
    );
    expect(
      actionReason(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'ladder' }),
    ).not.toBeNull();
    state.engines.pop();
    expect(
      actionReason(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'ladder' }),
    ).toBeNull();
    const queued = act(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'ladder' });
    const supervised = act(queued, {
      type: 'order',
      side: 'shu',
      kind: 'supervise',
      target: 'workshop-1',
    });
    expect(queued.workshops[0]!.daysRemaining - supervised.workshops[0]!.daysRemaining).toBe(
      HOW_TO_RULES.superviseDays,
    );
  });
});

describe('walkthrough observations', () => {
  it('advances nine steps on selection, ladder, move, foothold, suppression, night, report and cover', () => {
    let state = createSiegeState(228);
    const ladder = state.engines[0]!;
    Object.assign(state.units[1]!, { x: 18, y: 20 });
    Object.assign(state.units[8]!, { x: 17, y: 19 });
    let progress = startWalkthrough(state);
    const observe = (selected: string | null = null, reportReadDay?: number) => {
      const before = structuredClone(state);
      progress = advanceWalkthrough(progress, state, { tab: 'commands', selected, reportReadDay })!;
      expect(state).toEqual(before);
      return progress.step;
    };
    expect(observe()).toBe(1);
    expect(observe(ladder.id)).toBe(2);
    expect(observe()).toBe(2);
    state = act(state, { type: 'raiseLadder', engineId: ladder.id });
    expect(observe()).toBe(3);
    state = act(state, { type: 'move', unitId: 'shu-weiyan', x: 18, y: 19, level: 'ground' });
    expect(observe()).toBe(4);
    state = act(state, { type: 'climb', unitId: 'shu-weiyan' });
    expect(observe()).toBe(5);
    expect(observe('shu-captain-3')).toBe(6);
    state = act(state, {
      type: 'suppress',
      unitId: 'shu-captain-3',
      targetId: state.units[12]!.id,
    });
    expect(observe()).toBe(7);
    expect(observe()).toBe(7);
    state = endDay(state);
    expect(observe()).toBe(8);
    expect(observe()).toBe(8);
    expect(observe(null, state.day)).toBe(9);
    state = act(state, { type: 'coverEngine', unitId: 'shu-weiyan', engineId: ladder.id });
    observe();
    expect(progress.status).toBe('done');
    expect(advanceWalkthrough(progress, state, ui)).toBe(progress);
  });

  it('ignores previous actions on replay and retains skipped progress', () => {
    const state = createSiegeState(228);
    state.log.push({ day: 1, code: 'covered', params: { engineId: state.engines[0]!.id } });
    const replay = { ...startWalkthrough(state), step: 9 };
    expect(advanceWalkthrough(replay, state, ui)).toBe(replay);
    const skipped = { ...replay, status: 'skipped' as const };
    expect(advanceWalkthrough(skipped, state, ui)).toBe(skipped);
    expect(advanceWalkthrough(undefined, state, ui)).toBeUndefined();
  });

  it('does not count an end day or cover that happened before the current step', () => {
    const state = createSiegeState(228),
      ladder = state.engines[0]!;
    ladder.raisedAt = { x: 18, y: 16 };
    state.log = [
      { day: 1, code: 'daySupplies', params: {} },
      { day: 1, code: 'covered', params: { engineId: ladder.id } },
      { day: 1, code: 'suppressed', params: { sourceId: 'shu-captain-3', cell: '17,16' } },
    ];
    const progress = {
      status: 'active' as const,
      step: 6,
      startDay: 1,
      logStart: 0,
      ladderId: ladder.id,
      archerId: 'shu-captain-3',
    };
    const advanced = advanceWalkthrough(progress, state, ui)!;
    expect(advanced.step).toBe(7);
    expect(advanceWalkthrough(advanced, state, ui)).toBe(advanced);
    const cover = { ...progress, step: 9, logCursor: state.log.length };
    expect(advanceWalkthrough(cover, state, ui)).toBe(cover);
  });

  it('settles pending-replay progress before save and restores it identically', () => {
    const state = createSiegeState(228),
      progress = { ...startWalkthrough(state), step: 7 };
    const final = endDay(state),
      walkthrough = settleWalkthrough(progress, final, ui)!;
    expect(walkthrough.step).toBe(8);
    const save: SiegeSave = {
      state: final,
      playerSide: 'shu',
      phase: 'battle',
      facings: {},
      presentation: {
        openingStep: 6,
        bannersSeen: [1],
        dismissedHints: [],
        reportReadDay: 1,
        walkthrough,
      },
    };
    const loaded = deserializeSiegeSave(serializeSiegeSave(save));
    expect(loaded).toEqual(save);
    expect(
      settleWalkthrough(loaded.presentation!.walkthrough, loaded.state, {
        ...ui,
        reportReadDay: 1,
      }),
    ).toEqual(walkthrough);
  });

  it('serializes active, done and skipped progress and accepts older presentation data', () => {
    const state = createSiegeState(228);
    const save: SiegeSave = {
      playerSide: 'shu',
      state,
      phase: 'battle',
      facings: {},
      presentation: { openingStep: 6, bannersSeen: [1], dismissedHints: [] },
    };
    expect(
      deserializeSiegeSave(serializeSiegeSave(save)).presentation?.walkthrough,
    ).toBeUndefined();
    for (const status of ['active', 'done', 'skipped'] as const) {
      save.presentation!.walkthrough = {
        ...startWalkthrough(state),
        step: 7,
        status,
        cartId: 'cart',
        cartWorkshopId: 'workshop-1',
      };
      expect(deserializeSiegeSave(serializeSiegeSave(save))).toEqual(save);
    }
    save.presentation!.walkthrough!.step = 10;
    expect(() => serializeSiegeSave(save)).toThrow();
  });
});
