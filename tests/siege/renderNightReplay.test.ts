import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { runDefenderTurn } from '../../src/siege/ai/defender';
import { createSiegeState } from '../../src/siege/rules/state';
import { endDay } from '../../src/siege/rules/day';
import { nightReplay, REPLAY_STEP_MS, sortieRoute } from '../../src/siege/render/nightReplay';
import { SiegeMapView } from '../../src/siege/render/SiegeMapView';
import { NIGHT_COLOR, NIGHT_OPACITY } from '../../src/siege/render/v02Art';
import { resolveSiegeDay } from '../../src/siege/ui/playback';
import { layoutSymbol } from '../../src/siege/content/chencang';
import { engine } from './rulesFixtures';

function nightState() {
  const state = createSiegeState(228);
  state.day = 3;
  state.weather = 'clear';
  state.units
    .filter((u) => u.side === 'shu')
    .forEach((u) => {
      u.y = 13;
    });
  state.engines = [engine('ram', 9, 10, { id: 'target' })];
  return state;
}
describe('log-driven night replay', () => {
  it('replays engine movement then ladder raising from endDay logs at twice v0.1 speed', () => {
    const before = nightState();
    before.engines = [engine('ladder', 6, 11, { id: 'ladder' })];
    before.trenchFill['6,9'] = 0;
    before.nightOrders = { shu: { kind: 'nightAssault' } };
    const snapshot = structuredClone(before),
      final = endDay(before),
      frames = nightReplay(before, final);
    const advance = frames.filter((f) => f.night.kind === 'advance');
    expect(advance).toHaveLength(2);
    expect(advance[0]!.state.engines[0]!.y).toBe(10);
    expect(advance[0]!.state.engines[0]!.raisedAt).toBeUndefined();
    expect(advance[1]!.state.engines[0]!.raisedAt).toEqual({ x: 6, y: 7 });
    expect(REPLAY_STEP_MS).toBe(260 / 2);
    expect(frames.every((f) => f.night.duration === 130)).toBe(true);
    const markup = renderToStaticMarkup(
      createElement(SiegeMapView, {
        state: advance[1]!.state,
        night: advance[1]!.night,
        locale: 'en',
      }),
    );
    expect(markup).toContain('data-testid="ladder-lowered"');
    expect(markup).toContain('data-testid="ladder-raised"');
    expect(before).toEqual(snapshot);
  });
  it('flares torches, stops the advance and reads the actual fireArrowHit entries', () => {
    const before = nightState();
    before.engines[0]!.x = 7;
    before.engines[0]!.y = 8;
    const archer = before.units.find((u) => u.side === 'wei' && u.troopType === 'archer')!;
    Object.assign(archer, { x: 7, y: 7, troops: 100 });
    before.preparations.braziers['7,7'] = { litDay: 1 };
    before.nightOrders = { shu: { kind: 'nightAssault' }, wei: { kind: 'torches' } };
    const final = endDay(before),
      frames = nightReplay(before, final);
    expect(frames.some((f) => f.night.kind === 'torches')).toBe(true);
    expect(frames.some((f) => f.night.kind === 'advance')).toBe(false);
    expect(frames.some((f) => f.night.event?.code === 'fireArrowHit')).toBe(true);
    const torch = frames.find((f) => f.night.kind === 'torches')!;
    const markup = renderToStaticMarkup(createElement(SiegeMapView, { ...torch, locale: 'en' }));
    expect(markup).toContain(`fill="${NIGHT_COLOR}" opacity="${NIGHT_OPACITY}"`);
    expect(markup).toContain('radialGradient');
    expect(markup).not.toContain('vignette');
  });
  it.each(['hit', 'guard', 'nightAssault'] as const)(
    'shows the sortie route, target interaction and return for %s',
    (outcome) => {
      const before = nightState(),
        raider = before.units.find((u) => u.side === 'wei')!;
      Object.assign(raider, { x: 8, y: 7, level: 'wall' });
      before.nightOrders = {
        wei: { kind: 'sortie', target: 'target', unitId: raider.id },
        ...(outcome === 'nightAssault' ? { shu: { kind: 'nightAssault' as const } } : {}),
      };
      if (outcome === 'guard') Object.assign(before.units[1]!, { x: 10, y: 10 });
      const final = endDay(before),
        frames = nightReplay(before, final);
      const parties = frames.flatMap((f) => (f.night.party ? [f.night.party] : []));
      expect(parties.length).toBeGreaterThan(2);
      expect(parties.at(-1)!.to).toEqual(sortieRoute(before.engines[0]!)[0]);
      expect(parties.some((p) => p.returning)).toBe(true);
      if (outcome === 'hit') {
        expect(parties.some((p) => p.kindle)).toBe(true);
        expect(frames.some((f) => f.state.engines[0]!.burning)).toBe(true);
      } else {
        expect(parties.some((p) => p.pose === 'south-repulsed')).toBe(true);
        expect(parties.some((p) => p.kindle)).toBe(false);
      }
    },
  );
  it('keeps each sortie step adjacent and on the road until the dry final spur', () => {
    const route = sortieRoute({ x: 11, y: 10 });
    expect(route.length).toBeGreaterThan(2);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!,
        b = route[i]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
      expect(['+', '=', '.']).toContain(layoutSymbol(b.x, b.y));
    }
    expect(
      route.filter((c) => ['+', '='].includes(layoutSymbol(c.x, c.y)!)).length,
    ).toBeGreaterThanOrEqual(1);
  });
  it('keeps final resolution identical to the rules regardless of replay frames or immediate skip', () => {
    const state = createSiegeState(228),
      before = structuredClone(state);
    const result = resolveSiegeDay(state);
    expect(result.final).toEqual(endDay(runDefenderTurn(state)));
    expect(result.frames.some((f) => f.night)).toBe(true);
    const stored = structuredClone(result.final);
    result.frames.forEach((frame) => {
      frame.state.grain = 0;
    });
    expect(result.final).toEqual(stored);
    expect(state).toEqual(before);
  });
});
