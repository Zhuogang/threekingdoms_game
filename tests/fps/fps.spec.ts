import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { createGame, dispatch } from '../../src/game/campaign';
import type { GameCommand, GameState } from '../../src/game/types';
import { importState, startCampaign } from '../e2e/improvement-helpers';

/** The plan's P1-9 target: at least 30 frames per second. */
const FRAME_BUDGET_MS = 1000 / 30;
/** A frame this much over budget counts as slow; fewer than 10% may be slow. */
const SLOW_MARGIN_MS = 5;
const SLOW_SHARE = 0.1;
const SAMPLE_MS = 3000;

function apply(state: GameState, command: GameCommand): GameState {
  const result = dispatch(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** Every Cao officer (7) marching on a Xiapi held by nine officers and a big garrison. */
function fullBattle(): GameState {
  let state = createGame('cao', 16);
  const xiapi = state.cities.find((c) => c.id === 'xiapi')!;
  xiapi.factionId = 'yuan';
  xiapi.reserve = 6000;
  const caoArmy = state.officers.filter((o) => o.factionId === 'cao');
  for (const o of caoArmy) Object.assign(o, { cityId: 'puyang', troops: 2000, busy: false });
  state.officers
    .filter((o) => o.factionId && o.factionId !== 'cao' && o.fate === 'active' && !o.captive)
    .slice(0, 9)
    .forEach((o) => Object.assign(o, { factionId: 'yuan', cityId: 'xiapi', troops: 1500 }));
  for (const city of state.cities) city.governorId = null;
  state = apply(state, {
    type: 'march',
    sourceId: 'puyang',
    targetId: 'xiapi',
    officerIds: caoArmy.map((o) => o.id).slice(0, 10),
  });
  return apply(state, { type: 'endMonth' });
}

/** Frame intervals over `SAMPLE_MS`, while `during` runs (e.g. a map pan). */
async function sampleFrames(page: Page, during?: () => Promise<void>): Promise<number[]> {
  const sampling = page.evaluate(
    (duration) =>
      new Promise<number[]>((resolve) => {
        const times: number[] = [];
        const tick = (now: number) => {
          times.push(now);
          if (now - times[0]! < duration) requestAnimationFrame(tick);
          else resolve(times.slice(1).map((t, i) => t - times[i]!));
        };
        requestAnimationFrame(tick);
      }),
    SAMPLE_MS,
  );
  if (during) await during();
  return sampling;
}

function summarise(intervals: number[]) {
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? Infinity;
  const slow = sorted.filter((ms) => ms > FRAME_BUDGET_MS + SLOW_MARGIN_MS).length / sorted.length;
  return { frames: sorted.length, medianMs: Math.round(median * 10) / 10, slowShare: slow };
}

test('the battle map and the campaign map stay above 30 fps', async ({ page }, testInfo) => {
  const { cpuThrottle, enforce } = testInfo.project.metadata as {
    cpuThrottle: number;
    enforce: boolean;
  };
  await startCampaign(page);
  const state = fullBattle();
  expect(state.phase).toBe('battle');
  expect(state.battle!.units.filter((u) => u.troops > 0).length).toBeGreaterThanOrEqual(14);
  await importState(page, state);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  await page.getByRole('button', { name: 'Show enemy reach' }).click();
  await page.waitForTimeout(1000);
  const battle = summarise(await sampleFrames(page));

  // The campaign map, panned by dragging across it while frames are sampled.
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await importState(page, createGame('cao', 16));
  await session.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  const pan = summarise(
    await sampleFrames(page, async () => {
      const y = box.y + box.height / 2;
      for (let round = 0; round < 3; round++) {
        await page.mouse.move(box.x + box.width * 0.7, y);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.3, y, { steps: 20 });
        await page.mouse.up();
      }
    }),
  );
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const result = { project: testInfo.project.name, cpuThrottle, battle, pan };
  await mkdir('.artifacts/perf', { recursive: true });
  await writeFile(
    `.artifacts/perf/fps-${testInfo.project.name}.json`,
    JSON.stringify(result, null, 2) + '\n',
  );
  console.info(JSON.stringify(result));
  if (!enforce) return;
  for (const sample of [battle, pan]) {
    expect(sample.medianMs).toBeLessThanOrEqual(FRAME_BUDGET_MS);
    expect(sample.slowShare).toBeLessThan(SLOW_SHARE);
  }
});
