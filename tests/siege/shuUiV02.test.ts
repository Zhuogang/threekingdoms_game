import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { predictSiegeClimb, predictSiegeAttack } from '../../src/siege/rules/combat';
import { scoreSiege } from '../../src/siege/rules/score';
import { siegeCommands, actionReason, standByAll } from '../../src/siege/ui/commands';
import { scoringScreen } from '../../src/siege/ui/scoring';
import { HOW_TO_RULES, howToSections } from '../../src/siege/ui/howToPlay';
import { Forecast, ClimbForecast } from '../../src/siege/ui/SiegeForecast';
import { morningReport } from '../../src/siege/ui/report';
import { SiegeMorningReport } from '../../src/siege/ui/SiegeMorningReport';
import { resolveSiegeDay } from '../../src/siege/ui/playback';
import { act } from './rulesFixtures';

describe('Shu v0.2 controls and scoring', () => {
  it('uses rule rejections for every new action and ends every remaining friendly actor', () => {
    const state = createSiegeState(228);
    const before = structuredClone(state);
    for (const id of ['shu-weiyan', 'shu-captain-3', state.engines[0]!.id])
      for (const c of siegeCommands(state, id).filter((c) =>
        ['suppress', 'coverEngine', 'pileEarth', 'climb'].includes(c.kind),
      ))
        expect(c.reason).toBe(actionReason(state, c.action!));
    const next = standByAll(state, 'shu');
    expect(next.units.filter((u) => u.side === 'shu').every((u) => u.moved && u.acted)).toBe(true);
    expect(next.engines.every((e) => e.moved && e.acted)).toBe(true);
    expect(next.units.filter((u) => u.side === 'wei').every((u) => !u.moved && !u.acted)).toBe(
      true,
    );
    expect(state).toEqual(before);
  });
  it('enables suppression for archers and towers, cover for infantry and earthwork for infantry and carts', () => {
    const state = createSiegeState(228);
    Object.assign(state.units[8]!, { x: 17, y: 19 });
    Object.assign(state.units[1]!, { x: 18, y: 20 });
    // Each mutable fixture stage represents a new immutable UI snapshot.
    const enabled = (id: string, kind: string) =>
      expect(
        siegeCommands(structuredClone(state), id).find((c) => c.kind === kind)?.reason,
      ).toBeNull();
    enabled('shu-captain-3', 'suppress');
    enabled('shu-weiyan', 'coverEngine');
    const tower = { ...state.engines[0]!, id: 'ui-tower', kind: 'tower' as const, x: 17, y: 19 };
    state.engines.push(tower);
    enabled(tower.id, 'suppress');
    state.trenchFill['18,17'] = T.trenchCapacity;
    state.trenchFill['18,18'] = T.trenchCapacity;
    Object.assign(state.units[1]!, { x: 18, y: 18 });
    enabled('shu-weiyan', 'pileEarth');
    const cart = state.engines.find((e) => e.kind === 'earthCart')!;
    Object.assign(cart, { x: 18, y: 18 });
    enabled(cart.id, 'pileEarth');
  });

  it('renders both empty-wall climb forecasts with losses and morale from the rules', () => {
    const state = createSiegeState(228);
    state.engines[0]!.raisedAt = { x: 18, y: 16 };
    Object.assign(state.units[1]!, { x: 18, y: 19 });
    const normal = predictSiegeClimb(state, 'shu-weiyan')!,
      assault = predictSiegeClimb(state, 'shu-weiyan', { assault: true })!;
    expect(normal).toMatchObject({ casualties: 0, footholdGain: T.climbFoothold });
    expect(assault.casualties).toBe(
      Math.floor(T.climbing.ladder.assaultFrontage * T.assaultClimbLoss),
    );
    const html = renderToStaticMarkup(
      createElement(ClimbForecast, {
        normal,
        assault,
        locale: 'en',
        reason: null,
        confirm: () => {},
        cancel: () => {},
        disabled: false,
        checked: false,
        toggle: () => {},
      }),
    );
    expect(html).toContain('Foothold +1 → 1/3');
    expect(html).toContain('Foothold +2 → 2/3');
    expect(html.match(/data-testid="forecast-assault-ownCasualties"[^>]*>([^<]*)/)?.[1]).toBe(
      String(assault.casualties),
    );
    expect(html).toContain('Morale after');
    Object.assign(state.units[12]!, { x: 18, y: 16 });
    const forecast = predictSiegeAttack(state, 'shu-weiyan', state.units[12]!.id)!,
      forced = predictSiegeAttack(state, 'shu-weiyan', state.units[12]!.id, { assault: true })!;
    const attack = renderToStaticMarkup(
      createElement(Forecast, {
        forecast,
        assaultForecast: forced,
        target: 'Wei',
        locale: 'en',
        reason: null,
        confirm: () => {},
        cancel: () => {},
        disabled: false,
        checked: true,
        toggle: () => {},
      }),
    );
    expect(attack).toContain(`uphill attack ×${T.climbingAttackMultiplier}`);
    expect(attack).toContain(`frontage ${forced.frontage}`);
    expect(attack.match(/data-testid="forecast-assault-ownCasualties"[^>]*>([^<]*)/)?.[1]).toBe(
      String(forced.counterattack.casualties),
    );
  });
  it('projects completed scores, exact parts, history and the extended summary for either player side', () => {
    const state = createSiegeState(228);
    state.outcome = 'historical';
    state.day = T.days;
    state.grain = 0;
    state.stats.assaults = 7;
    state.stats.nightClashes = 3;
    state.stats.moundsBuilt = 2;
    for (const side of ['shu', 'wei'] as const)
      for (const locale of ['en', 'zh'] as const) {
        const data = scoringScreen(state, locale, side),
          score = scoreSiege(state, side);
        expect(data.score).toBe(score.score);
        expect(data.parts.reduce((s, p) => s + p.value, 0)).toBe(score.score);
        expect(data.history).toContain(String(T.days));
        expect(data.summary.map((r) => r.value)).toEqual([7, 3, 2]);
        expect(data.tier).toBeTruthy();
      }
  });
  it('traces every new how-to number to the tuning view and has six counter lines in both languages', () => {
    expect(HOW_TO_RULES.tuning).toBe(T);
    for (const locale of ['en', 'zh'] as const) {
      const sections = howToSections(locale);
      const counters = sections.find((s) => s.title === 'howCounters')!;
      expect(counters.lines).toHaveLength(6);
      const changed = howToSections(locale, {
        ...HOW_TO_RULES,
        tuning: {
          ...T,
          coveredFireMultiplier: 0.123,
          millstoneDamage: 987,
          coveredMillstoneDamage: 654,
          moundBoulderMultiplier: 0.321,
          moundComplete: 98,
          assaultMoraleLoss: 76,
          assaultNeighbourLoss: 54,
          sortieRange: 32,
          climbFoothold: 21,
          assaultClimbFoothold: 22,
          assaultClimbLoss: 0.456,
          footholdComplete: 99,
          climbingAttackMultiplier: 0.789,
          climbing: { ...T.climbing, mound: { ...T.climbing.mound, foothold: 88 } },
        } as unknown as typeof T,
      });
      const lines = changed
        .filter((s) => ['howCounters', 'howFoothold'].includes(s.title))
        .flatMap((s) => s.lines)
        .join(' ');
      for (const n of [0.123, 987, 654, 0.321, 98, 76, 54, 32, 21, 22, 0.456, 99, 0.789, 88])
        expect(lines).toContain(String(n));
    }
  });
  it('drives the planned day-one actions through the real rules and produces multiple report items', () => {
    let state = createSiegeState(228);
    Object.assign(state.units[1]!, { x: 18, y: 20 });
    Object.assign(state.units[8]!, { x: 17, y: 20 });
    for (const e of state.engines.filter((e) => e.kind === 'ladder'))
      state = act(state, { type: 'raiseLadder', engineId: e.id });
    state = act(state, { type: 'move', unitId: 'shu-weiyan', x: 18, y: 19, level: 'ground' });
    state = act(state, { type: 'climb', unitId: 'shu-weiyan' });
    state = act(state, { type: 'move', unitId: 'shu-captain-3', x: 17, y: 19, level: 'ground' });
    state = act(state, {
      type: 'suppress',
      unitId: 'shu-captain-3',
      targetId: state.units[12]!.id,
    });
    const next = resolveSiegeDay(state).final;
    expect(next.day).toBe(2);
    const items = morningReport(next.log, next.preparations, next.day, 'en');
    expect(items.length).toBeGreaterThanOrEqual(3);
    const html = renderToStaticMarkup(
      createElement(SiegeMorningReport, { items, locale: 'en', close: () => {} }),
    );
    expect(html).toContain('Understood');
    expect(html).not.toContain('{');
  });
});
