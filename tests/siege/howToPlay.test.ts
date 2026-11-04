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
  WALKTHROUGH_CELLS,
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
  it('advances all eight steps only on the relevant UI or successful rule changes', () => {
    let state = createSiegeState(228);
    state.engines = []; // Isolated legacy eight-step workshop tutorial.
    let progress = startWalkthrough(state);
    const observe = (view = ui) => {
      const before = structuredClone(state);
      progress = advanceWalkthrough(progress, state, view)!;
      expect(state).toEqual(before);
      return progress.step;
    };
    expect(observe()).toBe(1);
    expect(observe({ ...ui, tab: 'defence' })).toBe(1);
    expect(observe({ ...ui, tab: 'workshop' })).toBe(2);
    expect(observe()).toBe(2);
    state = act(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'earthCart' });
    expect(observe()).toBe(3);
    expect(progress.cartWorkshopId).toBe('workshop-1');
    const sameWorkshop = structuredClone(state);
    sameWorkshop.workshops[0]!.queue = 'ladder';
    expect(advanceWalkthrough(progress, sameWorkshop, ui)?.step).toBe(3);
    state = act(state, { type: 'queueEngine', workshopId: 'workshop-2', kind: 'ladder' });
    expect(observe()).toBe(4);
    const rallied = act(state, { type: 'order', side: 'shu', kind: 'rally', target: ui.selected });
    expect(advanceWalkthrough(progress, rallied, ui)?.step).toBe(4);
    state = act(state, { type: 'order', side: 'shu', kind: 'supervise', target: 'workshop-2' });
    expect(observe()).toBe(5);
    expect(observe()).toBe(5);
    state = endDay(state);
    expect(observe()).toBe(6);
    expect(observe({ ...ui, tab: 'workshop' })).toBe(6);
    const cart = state.engines.find((e) => e.kind === 'earthCart')!;
    const selectedCart = { ...ui, selected: cart.id };
    expect(observe(selectedCart)).toBe(7);
    expect(progress.cartId).toBe(cart.id);
    const target = WALKTHROUGH_CELLS[0]!;
    Object.assign(cart, target);
    expect(observe(selectedCart)).toBe(7); // A position alone is not a movement.
    cart.y++;
    state = act(state, { type: 'moveEngine', engineId: cart.id, x: target.x, y: target.y });
    expect(observe(selectedCart)).toBe(8);
    const other = structuredClone(state);
    other.engines.push(engine('earthCart', target.x + 1, target.y, { id: 'another-cart' }));
    const otherFilled = act(other, {
      type: 'fillTrench',
      engineId: 'another-cart',
      x: target.x + 1,
      y: target.y - 1,
    });
    expect(advanceWalkthrough(progress, otherFilled, selectedCart)?.status).toBe('active');
    state = act(state, { type: 'fillTrench', engineId: cart.id, x: target.x, y: target.y - 1 });
    expect(observe(selectedCart)).toBe(8);
    expect(progress.status).toBe('done');
    expect(advanceWalkthrough(progress, state, ui)).toBe(progress);
  });

  it('waits for the cart, ignores old orders on replay, and preserves terminal progress', () => {
    const state = createSiegeState(228);
    const waiting = { ...startWalkthrough(state), step: 6 };
    expect(advanceWalkthrough(waiting, state, ui)).toBe(waiting);
    state.log.push({ day: 1, code: 'order', params: { side: 'shu', kind: 'supervise' } });
    const replay = { ...startWalkthrough(state), step: 4 };
    expect(advanceWalkthrough(replay, state, ui)).toBe(replay);
    const skipped = { ...replay, status: 'skipped' as const };
    expect(advanceWalkthrough(skipped, state, ui)).toBe(skipped);
    expect(advanceWalkthrough(undefined, state, ui)).toBeUndefined();
    expect(startWalkthrough(state)).toMatchObject({ step: 1, status: 'active' });
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
    save.presentation!.walkthrough!.step = 9;
    expect(() => serializeSiegeSave(save)).toThrow();
  });
});
