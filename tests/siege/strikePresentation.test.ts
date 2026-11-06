import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applySiegeAction } from '../../src/siege/rules/actions';
import { predictSiegeAttack } from '../../src/siege/rules/combat';
import { strikePresentation } from '../../src/siege/ui/strikePresentation';
import { Forecast } from '../../src/siege/ui/SiegeForecast';
import { HOW_TO_RULES, howToSections } from '../../src/siege/ui/howToPlay';
import { SiegeMapView } from '../../src/siege/render/SiegeMapView';
import { duel, engine } from './rulesFixtures';
import type { SiegeAction, SiegeState } from '../../src/siege/rules/types';

function strike(state: SiegeState, action: SiegeAction) {
  const result = applySiegeAction(state, action);
  if (!result.ok) throw new Error(result.reason);
  return { result, strike: strikePresentation(state, action, result)! };
}

describe('strike presentation uses the actual resolved action', () => {
  it('keeps a retreating target at the blow location and reports real losses and morale', () => {
    const { state, shu, wei } = duel({ level: 'wall', y: 7 }, { x: 6, troops: 3000, morale: 20 });
    const { result, strike: shown } = strike(state, {
      type: 'attack',
      unitId: shu.id,
      targetId: wei.id,
    });
    const combat = result.events.find((e) => e.code === 'combat')!;
    expect(shown.effect.to).toEqual({ x: 6, y: 7, level: 'wall' });
    expect(result.state.units[1]!.x).not.toBe(wei.x);
    expect(shown.results[0]).toMatchObject({
      position: shown.effect.to,
      loss: combat.params.casualties,
      routed: true,
    });
    expect(shown.results[1]).toMatchObject({ moraleGain: 10 });
    const html = renderToStaticMarkup(
      createElement(SiegeMapView, {
        state: result.state,
        locale: 'zh',
        effectAction: shown.effect,
        strikeResults: shown.results,
        strikeHoldMs: 1100,
      }),
    );
    expect(html).toContain('data-testid="strike-result" pointer-events="none"');
    expect(html).toContain(`-${combat.params.casualties}`);
    expect(html).toContain('溃散');
    expect(html).toContain('士气 +10');
    expect(html.match(/class="siege-battle-impact"/g)).toHaveLength(1);
    expect(html.match(/class="siege-battle-line"/g)).toHaveLength(1);
    expect(
      html.match(/class="siege-strike-result" style="animation-duration:1100ms"/g),
    ).toHaveLength(shown.results.length);
  });
  it('StrikeResults and BattleEffect contain no SMIL animation elements', () => {
    const source = readFileSync(
      new URL('../../src/siege/render/SiegeMapView.tsx', import.meta.url),
      'utf8',
    );
    const battleEffect = source.slice(
      source.indexOf('function BattleEffect('),
      source.indexOf('const Nameplates'),
    );
    const strikeResults = source.slice(source.indexOf('function StrikeResults('));
    for (const component of [battleEffect, strikeResults]) {
      expect(component.length).toBeGreaterThan(0);
      expect(component).not.toMatch(/<(?:animate|animateTransform)\b/);
    }
  });
  it('shows counterattack losses at the original attacker position', () => {
    const { state, shu, wei } = duel(
      { x: 6, y: 10 },
      { x: 7, y: 10, level: 'ground', troops: 5000 },
    );
    const { result, strike: shown } = strike(state, {
      type: 'attack',
      unitId: shu.id,
      targetId: wei.id,
    });
    expect(shown.results.find((r) => r.position.x === shu.x)!.loss).toBe(
      shu.troops - result.state.units[0]!.troops,
    );
    expect(shown.results.find((r) => r.position.x === shu.x)!.loss).toBeGreaterThan(0);
  });
  it.each(['ram', 'attack'] as const)('%s shows actual gate durability loss', (type) => {
    const { state, shu } = duel({ x: 8, y: 8 });
    state.engines = [engine('ram', 8, 8)];
    const action: SiegeAction =
      type === 'ram'
        ? { type, engineId: 'engine', gateId: 'south' }
        : { type, unitId: shu.id, gateId: 'south' };
    const { result, strike: shown } = strike(state, action);
    expect(shown.effect).toMatchObject({ to: { x: 8, y: 7, level: 'ground' }, type });
    expect(shown.results[0]!.loss).toBe(
      state.gates.south.durability - result.state.gates.south.durability,
    );
  });
  it.each(['attack', 'suppress'] as const)(
    '%s supports an engine actor and a routed wall target',
    (type) => {
      const { state, wei } = duel({}, { morale: 20 });
      state.engines = [engine('tower', 7, 10)];
      const action: SiegeAction =
        type === 'attack'
          ? { type: 'attack', engineId: 'engine', targetId: wei.id }
          : { type: 'suppress', engineId: 'engine', targetId: wei.id };
      const { strike: shown } = strike(state, action);
      expect(shown.effect.from).toEqual({ x: 7, y: 10, level: 'ground' });
      expect(shown.results[0]!.routed).toBe(true);
      expect(shown.results.every((r) => r.moraleGain === 0)).toBe(true);
    },
  );
  it.each(['fireArrows', 'dropMillstone'] as const)(
    '%s reports the actual clamped engine durability loss',
    (type) => {
      const { state, wei } = duel(
        {},
        { x: 8, y: 7, troopType: type === 'fireArrows' ? 'archer' : 'infantry' },
      );
      state.day = 2;
      state.engines = [engine('ram', 8, 8, { durability: 10 })];
      state.preparations.braziers['8,7'] = { litDay: 1 };
      state.preparations.millstones['8,7'] = { day: 1, hoisted: true };
      const { strike: shown } = strike(state, { type, unitId: wei.id, engineId: 'engine' });
      expect(shown.results[0]!.loss).toBe(10);
      expect(shown.effect.to).toEqual({ x: 8, y: 8, level: 'ground' });
    },
  );
  it('dropBoulders reports personnel loss at the target, without recomputing damage', () => {
    const { state, shu, wei } = duel();
    state.day = 2;
    state.engines = [engine('ladder', 7, 10, { raisedAt: { x: 7, y: 7 } })];
    state.preparations.boulders['7,7'] = { day: 1 };
    const { result, strike: shown } = strike(state, {
      type: 'dropBoulders',
      unitId: wei.id,
      targetId: shu.id,
    });
    expect(shown.results[0]!.loss).toBe(
      result.events.find((e) => e.code === 'bouldersHit')!.params.casualties,
    );
  });
  it('forecast copy shows actual source gain, omitting gain for an engine', () => {
    const { state, shu, wei } = duel({ level: 'wall', y: 7, morale: 95 }, { x: 6, morale: 20 });
    for (const engineActor of [false, true]) {
      state.engines = engineActor ? [engine('tower', 6, 10)] : [];
      const forecast = predictSiegeAttack(state, engineActor ? 'engine' : shu.id, wei.id)!;
      expect(forecast.routsTarget).toBe(true);
      const html = renderToStaticMarkup(
        createElement(Forecast, {
          forecast,
          assaultForecast: null,
          target: 'target',
          locale: 'en',
          reason: null,
          confirm() {},
          cancel() {},
          disabled: false,
          checked: false,
          toggle() {},
        }),
      );
      expect(html).toContain(engineActor ? '>Routs target<' : '>Routs target, morale +5<');
    }
  });
  it('both sides’ how-to rules interpolate altered morale tuning numbers in both locales', () => {
    const rules = structuredClone(HOW_TO_RULES);
    Object.assign(rules.tuning, { routMoraleSource: 17, routMoraleNearby: 8, routMoraleRadius: 3 });
    for (const locale of ['zh', 'en'] as const)
      for (const side of ['shu', 'wei'] as const) {
        const text = howToSections(locale, rules, side)
          .flatMap((s) => s.lines)
          .join('\n');
        expect(text).toContain('+17');
        expect(text).toContain('+8');
        expect(text).toContain('3');
      }
  });
});
