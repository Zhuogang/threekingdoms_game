import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { createSiegeState } from '../../src/siege/rules/state';
import { runAttackerTurn } from '../../src/siege/ai/attacker';
import { runDefenderTurn } from '../../src/siege/ai/defender';
import { endDay } from '../../src/siege/rules/day';
import {
  resolveAttackerPhase,
  resolveAttackerPhaseAsync,
  resolveSiegeDay,
  resolveSiegeDayAsync,
  yieldSiegeTask,
} from '../../src/siege/ui/playback';

const metrics: Array<{ method: string; resolutions: number; yields: number }> = [];
afterAll(() => {
  mkdirSync('.artifacts/siege', { recursive: true });
  writeFileSync('.artifacts/siege/q-yield-metrics.json', JSON.stringify(metrics, null, 2) + '\n');
});

for (const method of ['careful', 'anyPrice', 'brute'] as const)
  it(`${method}: yielding preserves every frame, action, RNG and final state on both player sides`, async () => {
    let state = createSiegeState(228);
    let resolutions = 0;
    let yields = 0;
    const yieldTask = async () => {
      yields++;
    };
    for (let day = 1; day <= 9 && !state.outcome; day++) {
      if ([1, 4, 9].includes(day)) {
        for (const side of ['shu', 'wei'] as const) {
          const before = structuredClone(state);
          const sync = resolveSiegeDay(state, side);
          const asyncResult = await resolveSiegeDayAsync(state, side, yieldTask);
          expect(asyncResult).toEqual(sync);
          expect(state).toEqual(before);
          resolutions++;
        }
        const hidden = structuredClone(state);
        hidden.nightOrders.wei = { kind: 'torches' };
        const attacker = await resolveAttackerPhaseAsync(hidden, yieldTask);
        expect(attacker).toEqual(resolveAttackerPhase(hidden));
        expect(attacker.final.nightOrders.wei).toEqual(hidden.nightOrders.wei);
        expect(attacker.frames.every((f) => f.state.nightOrders.wei === undefined)).toBe(true);
        resolutions++;
      }
      state = endDay(runDefenderTurn(runAttackerTurn(state, method)));
    }
    expect(yields).toBeGreaterThan(0);
    metrics.push({ method, resolutions, yields });
    console.info('Q yielding equivalence', JSON.stringify({ method, resolutions, yields }));
  }, 30000);

it('MessageChannel yields complete and close their ports', async () => {
  await yieldSiegeTask();
  await yieldSiegeTask();
});
