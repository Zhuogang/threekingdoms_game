import { expect, test, type Page } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import { applySiegeAction } from '../../src/siege/rules/actions';
import { nextActor } from '../../src/siege/ui/actorTodo';
import { planDefenderTurn } from '../../src/siege/ai/defender';
import { COUNTER_KINDS } from '../../src/siege/ui/counters';
import { HINT_KINDS } from '../../src/siege/save';
import type { SiegeState } from '../../src/siege/rules/types';
import { clickCell, clickPlate, loadFixture, panToCell, selectActor, snapshot } from './helpers';

test.use({ viewport: { width: 1280, height: 720 }, reducedMotion: 'no-preference' });

async function mouseButton(page: Page, id: string) {
  const box = (await page.getByTestId(id).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
async function battle(page: Page, state: SiegeState) {
  await loadFixture(page, {
    state,
    phase: 'battle',
    playerSide: 'shu',
    facings: {},
    presentation: {
      openingStep: 6,
      bannersSeen: [1, 2],
      reportReadDay: state.day,
      dismissedHints: [...HINT_KINDS],
      dismissedCounters: [...COUNTER_KINDS],
      walkthrough: { status: 'skipped', step: 1, startDay: 1, logStart: 0 },
    },
  });
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-ready', 'true');
}
async function attackFixture(page: Page) {
  const state = createSiegeState(228),
    actor = state.units[1]!,
    other = state.units[2]!,
    third = state.units[3]!,
    target = state.units[10]!;
  Object.assign(actor, { x: 5, y: 10, moved: true, morale: 60 });
  Object.assign(other, { x: 11, y: 10 });
  Object.assign(third, { x: 12, y: 10 });
  Object.assign(target, { x: 6, y: 10, level: 'ground', morale: 20, troops: 3000 });
  state.units = [actor, other, third, target];
  state.engines = [];
  const result = applySiegeAction(state, { type: 'attack', unitId: actor.id, targetId: target.id });
  if (!result.ok) throw new Error(result.reason);
  const next = nextActor(result.state, actor.id, 'shu')!;
  expect(nextActor(result.state, next.id, 'shu')!.id).not.toBe(next.id);
  await battle(page, state);
  await selectActor(page, actor.id);
  await clickPlate(page, target.id);
  await expect(page.getByTestId('attack-forecast')).toBeVisible();
  return { actor, other, third, target, next };
}

test('a completed attack holds selection and camera for 900ms, shows logged losses, clears the strike within 1600ms and stays selected', async ({
  page,
}) => {
  const { actor, target } = await attackFixture(page);
  const map = page.getByTestId('siege-map'),
    camera = (await map.getAttribute('viewBox'))!;
  // Age the SVG document past both old SMIL durations before inserting the strike.
  await page.waitForFunction(
    () =>
      (document.querySelector('[data-testid="siege-map"]') as SVGSVGElement).getCurrentTime() > 1.2,
  );
  // Install before clicking: neither a Playwright poll nor a log read may miss the opening frames.
  const observation = await page.evaluateHandle(() => {
    const map = document.querySelector('[data-testid="siege-map"]')!;
    let clickedAt = 0;
    document.querySelector('[data-testid="attack-confirm"]')!.addEventListener(
      'pointerup',
      () => {
        clickedAt = performance.now();
      },
      { once: true },
    );
    const observed = new Promise<{
      samples: {
        elapsed: number;
        opacity: number;
        top: number;
        selected: string | null;
        camera: string | null;
        text: string;
      }[];
      impacts: { afterClick: number; opacity: number }[];
    }>((resolve, reject) => {
      const samples: {
        elapsed: number;
        opacity: number;
        top: number;
        selected: string | null;
        camera: string | null;
        text: string;
      }[] = [];
      const impacts: { afterClick: number; opacity: number }[] = [];
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Strike did not appear and finish within 3 seconds'));
      }, 3000);
      const observer = new MutationObserver(() => {
        const result = map.querySelector('[data-testid="strike-result"]');
        if (!result) return;
        observer.disconnect();
        const inner = result.querySelector('.siege-strike-result') ?? result.querySelector('g')!;
        const start = performance.now();
        const sample = () => {
          if (!inner.isConnected) {
            clearTimeout(timeout);
            resolve({ samples, impacts });
            return;
          }
          const now = performance.now();
          samples.push({
            elapsed: now - start,
            opacity: Number(getComputedStyle(inner).opacity),
            top: inner.getBoundingClientRect().top,
            selected: map.getAttribute('data-selected'),
            camera: map.getAttribute('viewBox'),
            text: result.textContent ?? '',
          });
          const impact = map.querySelector('image[href*="arrows-wall"]');
          if (impact)
            impacts.push({
              afterClick: now - clickedAt,
              opacity: Number(getComputedStyle(impact).opacity),
            });
          if (now - start < 2500) requestAnimationFrame(sample);
        };
        sample();
      });
      observer.observe(map, { childList: true, subtree: true });
    });
    return { observed };
  });
  const started = Date.now();
  await mouseButton(page, 'attack-confirm');
  const { samples, impacts } = await observation.evaluate(async ({ observed }) => observed);
  await observation.dispose();
  const combat = (await snapshot(page)).state.log
    .slice()
    .reverse()
    .find(
      (e) =>
        e.code === 'combat' && e.params.sourceId === actor.id && e.params.targetId === target.id,
    )!;
  const loss = `-${combat.params.casualties}`;
  expect(samples.length).toBeGreaterThan(1);
  expect(samples[0]!.elapsed).toBeLessThan(50);
  for (const sample of samples.filter((s) => s.elapsed <= 900)) {
    expect(sample.selected).toBe(actor.id);
    expect(sample.camera).toBe(camera);
    expect(sample.text).toContain(loss);
  }
  for (const sample of samples.filter((s) => s.elapsed <= 600))
    expect(sample.opacity, `opacity at ${sample.elapsed}ms`).toBeGreaterThanOrEqual(0.9);
  const last = samples.at(-1)!;
  expect(last.elapsed).toBeGreaterThanOrEqual(1000);
  expect(last.opacity).toBeLessThan(0.5);
  expect(last.top).toBeLessThan(samples[0]!.top);
  expect(impacts.some((sample) => sample.afterClick <= 300 && sample.opacity > 0.5)).toBe(true);
  await expect(page.getByTestId('strike-result')).toHaveCount(0, {
    timeout: Math.max(1, 1600 - (Date.now() - started)),
  });
  await expect(map).toHaveAttribute('data-selected', actor.id);
  await expect(map).toHaveAttribute('viewBox', camera);
  await page.waitForTimeout(500);
  await expect(map).toHaveAttribute('data-selected', actor.id);
  await expect(map).toHaveAttribute('viewBox', camera);
});

test('a Shu player sees a newly running CSS impact during the enemy replay', async ({ page }) => {
  const state = createSiegeState(228),
    shu = state.units[1]!,
    wei = state.units[10]!;
  Object.assign(shu, {
    x: 7,
    y: 7,
    level: 'wall',
    morale: 80,
    troops: 5000,
    troopType: 'infantry',
  });
  Object.assign(wei, {
    x: 6,
    y: 7,
    level: 'wall',
    morale: 80,
    troops: 3000,
    troopType: 'infantry',
  });
  state.units = [shu, wei];
  state.engines = [];
  // Adjacent wall infantry, no engine or prepared weapon: Wei attacks this intruder
  // in its strike phase, before movement/preparation. Prove it with the real AI.
  expect(planDefenderTurn(state)[0]).toEqual({
    type: 'attack',
    unitId: wei.id,
    targetId: shu.id,
  });
  await battle(page, state);
  await selectActor(page, shu.id);
  await page.waitForFunction(
    () =>
      (document.querySelector('[data-testid="siege-map"]') as SVGSVGElement).getCurrentTime() > 1.2,
  );
  const observation = await page.evaluateHandle(() => {
    const map = document.querySelector('[data-testid="siege-map"]')!;
    const inserted = new Promise<
      {
        name: string | null;
        state: AnimationPlayState;
        duration: number;
        progress: number | null;
      }[]
    >((resolve, reject) => {
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error('No enemy impact inserted within 10 seconds'));
      }, 10000);
      const observer = new MutationObserver(() => {
        const impact = map.querySelector('image[href*="arrows-wall"]');
        if (!impact) return;
        // Read in the insertion callback, while the 130ms replay frame is still live.
        const animations = impact.getAnimations().map((animation) => ({
          name: animation instanceof CSSAnimation ? animation.animationName : null,
          state: animation.playState,
          duration: Number(animation.effect!.getComputedTiming().duration),
          progress: animation.effect!.getComputedTiming().progress ?? null,
        }));
        observer.disconnect();
        clearTimeout(timeout);
        resolve(animations);
      });
      observer.observe(map, { childList: true, subtree: true });
    });
    return { inserted };
  });
  await mouseButton(page, 'end-day');
  const animations = await observation.evaluate(async ({ inserted }) => inserted);
  await observation.dispose();
  expect(animations).toHaveLength(1);
  expect(animations[0]).toMatchObject({
    name: 'siege-battle-impact',
    state: 'running',
    duration: 500,
  });
  expect(animations[0]!.progress).not.toBeNull();
  expect(animations[0]!.progress!).toBeLessThan(1);
});

test('selecting another actor during a strike clears the strike and keeps that selection', async ({
  page,
}) => {
  const { actor, third } = await attackFixture(page);
  await mouseButton(page, 'attack-confirm');
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', actor.id);
  await clickPlate(page, third.id);
  await expect(page.getByTestId('strike-result')).toHaveCount(0);
  await page.waitForTimeout(1300);
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', third.id);
});

test('Next during a strike clears the strike and selects the next actor immediately, only once', async ({
  page,
}) => {
  const { next } = await attackFixture(page);
  await mouseButton(page, 'attack-confirm');
  await mouseButton(page, 'next-actor');
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', next.id, {
    timeout: 250,
  });
  await expect(page.getByTestId('strike-result')).toHaveCount(0);
  await page.waitForTimeout(1300);
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', next.id);
});

test('walk through the broken south gate into its mouth and pick the ordinary figure', async ({
  page,
}) => {
  const state = createSiegeState(228),
    actor = state.units[1]!,
    other = state.units[2]!;
  Object.assign(actor, { x: 8, y: 8, level: 'ground' });
  Object.assign(other, { x: 7, y: 6, level: 'ground', moved: true });
  state.units = [actor, other];
  state.engines = [];
  Object.assign(state.gates.south, { broken: true, durability: 0 });
  await battle(page, state);
  await selectActor(page, actor.id);
  await mouseButton(page, 'command-move');
  await clickCell(page, 'reachable', '8,7,ground');
  expect((await snapshot(page)).state.units[0]).toMatchObject({ x: 8, y: 7, level: 'ground' });
  await expect(page.locator(`[data-covered-unit="${actor.id}"]`)).toHaveCount(0);
  await selectActor(page, other.id);
  await panToCell(page, { x: 8, y: 7, level: 'ground' });
  const point = await page.evaluate(async (id) => {
    const modulePath = '/src/siege/render/stateArt.ts';
    const { unitVisual } = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof import('../../src/siege/render/stateArt');
    const game = window.__siegeDev!.snapshot(),
      state = game.state,
      unit = state.units.find((u) => u.id === id)!;
    const r = unitVisual(state, unit, game.facings[id], 'move').figureRects[0]!;
    const p = new DOMPoint((r[0] + r[2]) / 2, (r[1] + r[3]) / 2).matrixTransform(
      (document.querySelector('[data-testid="siege-map"]') as SVGSVGElement).getScreenCTM()!,
    );
    return { x: p.x, y: p.y };
  }, actor.id);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', actor.id);
  await expect(page.getByTestId('attack-forecast')).toHaveCount(0);
});

test('a counterattack that ends the battle still finishes its strike presentation', async ({
  page,
}) => {
  const state = createSiegeState(228),
    actor = state.units[1]!,
    target = state.units[10]!;
  Object.assign(actor, { x: 5, y: 10, moved: true, troops: 100, morale: 20 });
  Object.assign(target, { x: 6, y: 10, level: 'ground', troops: 5000, morale: 100 });
  state.units = [actor, target];
  state.engines = [];
  await battle(page, state);
  await selectActor(page, actor.id);
  await clickPlate(page, target.id);
  // Time it inside the page: Playwright's own round trips can eat the whole hold under load.
  const timing = page.evaluate(async () => {
    const start = performance.now();
    let strikeAt: number | null = null,
      endingAt: number | null = null,
      text = '';
    while (performance.now() - start < 15000 && endingAt === null) {
      const strike = document.querySelector('[data-testid="strike-result"]');
      if (strike && strikeAt === null) {
        strikeAt = performance.now();
        text = strike.textContent ?? '';
      }
      if (document.querySelector('.siege-app')?.getAttribute('data-phase') === 'ending')
        endingAt = performance.now();
      await new Promise(requestAnimationFrame);
    }
    return { strikeAt, endingAt, text };
  });
  await mouseButton(page, 'attack-confirm');
  const { strikeAt, endingAt, text } = await timing;
  expect((await snapshot(page)).state.outcome).toBe('defeat');
  expect(text).toContain('-100');
  expect(strikeAt).not.toBeNull();
  expect(endingAt).not.toBeNull();
  expect(endingAt! - strikeAt!).toBeGreaterThan(900);
  await expect(page.getByTestId('strike-result')).toHaveCount(0);
});
