import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../../src/game/campaign';
import { importState, startCampaign } from '../e2e/improvement-helpers';
import { fullBattle } from '../e2e/rendering-fixtures';

const FRAME_BUDGET_MS = 1000 / 30;
const SLOW_MARGIN_MS = 5;
const SLOW_SHARE = 0.1;
const SAMPLE_MS = 3000;

interface RenderSample {
  at: number;
  renderMs: number;
  latencyMs: number;
}

function summarise(intervals: number[]) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? null;
  return {
    samples: sorted.length,
    medianMs: median === null ? null : Math.round(median * 10) / 10,
    p95Ms: sorted.length
      ? Math.round(sorted[Math.floor((sorted.length - 1) * 0.95)]! * 10) / 10
      : null,
    slowShare: sorted.length
      ? sorted.filter((ms) => ms > FRAME_BUDGET_MS + SLOW_MARGIN_MS).length / sorted.length
      : null,
  };
}

/** RAF responsiveness and actual Pixi draws are separate measurements; idle has no render FPS. */
async function sample(page: Page, pan: boolean, duration = SAMPLE_MS) {
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  const origin = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  if (pan) {
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
  }
  const raw = await page.evaluate(
    ({ duration, pan, origin, amplitude }) =>
      new Promise<{
        raf: number[];
        renders: RenderSample[];
      }>((resolve) => {
        const times: number[] = [];
        const renders: RenderSample[] = [];
        const canvas = document.querySelector('canvas')!;
        const observe = (event: Event) => renders.push((event as CustomEvent<RenderSample>).detail);
        document.addEventListener('map-render', observe);
        const tick = (now: number) => {
          times.push(now);
          const elapsed = now - times[0]!;
          if (pan)
            canvas.dispatchEvent(
              new PointerEvent('pointermove', {
                clientX: origin.x + Math.sin(elapsed / 350) * amplitude,
                clientY: origin.y,
                pointerId: 1,
                buttons: 1,
                bubbles: true,
              }),
            );
          if (elapsed < duration) requestAnimationFrame(tick);
          else {
            document.removeEventListener('map-render', observe);
            resolve({ raf: times.slice(1).map((time, index) => time - times[index]!), renders });
          }
        };
        requestAnimationFrame(tick);
      }),
    { duration, pan, origin, amplitude: box.width * 0.18 },
  );
  if (pan) {
    // Finish at a deliberate native pointer position: releasing a captured synthetic pan
    // can otherwise restore the real pointer's unchanged starting position before the screenshot.
    await page.mouse.move(origin.x - box.width * 0.18, origin.y);
    await page.mouse.up();
  }
  return {
    browserRaf: summarise(raw.raf),
    actualRenders: raw.renders.length,
    renderIntervals: summarise(
      raw.renders.slice(1).map((frame, index) => frame.at - raw.renders[index]!.at),
    ),
    // app.render submission only; invalidation latency also includes any scene rebuilding.
    drawSubmissionMs: summarise(raw.renders.map((frame) => frame.renderMs)),
    invalidationToRenderMs: summarise(raw.renders.map((frame) => frame.latencyMs)),
  };
}

test('idle maps stop rendering and active maximum battles and campaign pans remain responsive', async ({
  page,
}, testInfo) => {
  const { cpuThrottle, enforce } = testInfo.project.metadata as {
    cpuThrottle: number;
    enforce: boolean;
  };
  await startCampaign(page);
  const state = fullBattle();
  for (const side of ['attacker', 'defender'])
    expect(
      state.battle!.units.filter((unit) => unit.side === side && unit.troops > 0),
    ).toHaveLength(10);
  await importState(page, state);
  await page.getByRole('button', { name: 'Show enemy reach' }).click();
  await expect(page.locator('.game-map')).toHaveAttribute('data-render-threat', 'true');
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  await page.waitForTimeout(1200);
  const idle = await sample(page, false, 600);
  expect(idle.actualRenders).toBe(0);
  const beforeBattle = await page.locator('canvas').screenshot();
  const battlePan = await sample(page, true);
  expect(battlePan.actualRenders).toBeGreaterThan(10);
  expect((await page.locator('canvas').screenshot()).equals(beforeBattle)).toBe(false);

  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await importState(page, createGame('cao', 16));
  await expect(page.locator('.game-map')).toHaveAttribute('data-render-mode', 'campaign');
  await session.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  const beforeCampaign = await page.locator('canvas').screenshot();
  const campaignPan = await sample(page, true);
  expect(campaignPan.actualRenders).toBeGreaterThan(10);
  expect((await page.locator('canvas').screenshot()).equals(beforeCampaign)).toBe(false);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const result = {
    project: testInfo.project.name,
    cpuThrottle,
    userAgent: await page.evaluate(() => navigator.userAgent),
    viewport: page.viewportSize(),
    devicePixelRatio: await page.evaluate(() => devicePixelRatio),
    renderResolution: Number(
      await page.locator('.game-map').getAttribute('data-render-resolution'),
    ),
    unitsPerSide: 10,
    idle,
    battlePan,
    campaignPan,
  };
  await mkdir('.artifacts/perf', { recursive: true });
  const suffix = (process.env.FPS_REPORT_SUFFIX || '').replace(/[^a-zA-Z0-9_-]/g, '');
  await writeFile(
    `.artifacts/perf/fps-${testInfo.project.name}${suffix ? '-' + suffix : ''}.json`,
    JSON.stringify(result, null, 2) + '\n',
  );
  console.info(JSON.stringify(result));
  if (!enforce) return;
  for (const active of [battlePan, campaignPan]) {
    for (const cadence of [active.browserRaf, active.renderIntervals]) {
      expect(cadence.medianMs).not.toBeNull();
      expect(cadence.medianMs!).toBeLessThanOrEqual(FRAME_BUDGET_MS);
      expect(cadence.slowShare!).toBeLessThan(SLOW_SHARE);
    }
    expect(active.invalidationToRenderMs.p95Ms!).toBeLessThanOrEqual(100);
  }
});
