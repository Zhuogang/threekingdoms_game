import { describe, expect, it } from 'vitest';
import { runShuScript } from '../../src/siege/ai/scripts';
import { createSiegeState } from '../../src/siege/rules/state';
import { CAMP_CELLS } from '../../src/siege/content/chencang';

describe('scripted Shu strategies', () => {
  for (const strategy of ['competent', 'brute'] as const) {
    it.each([1, 2, 3, 4, 5])(
      `${strategy} seed %i reaches an identical ending on replay within 21 days`,
      (seed) => {
        const play = () => {
          let state = createSiegeState(seed);
          for (let days = 0; days < 21 && !state.outcome; days++) {
            const before = structuredClone(state);
            const next = runShuScript(state, strategy);
            expect(state).toEqual(before);
            expect(next.day).toBeLessThanOrEqual(21);
            if (strategy === 'brute') {
              expect(next.engines).toEqual([]);
              expect(next.workshops.every((w) => w.queue === null)).toBe(true);
              expect(
                next.log.some((e) => e.code === 'queueEngine' || e.code === 'engineCompleted'),
              ).toBe(false);
            }
            state = next;
          }
          expect(['victory', 'historical', 'defeat']).toContain(state.outcome);
          return state;
        };
        expect(play()).toEqual(play());
      },
      30000,
    );
  }

  it('opens both workshops with a cart and ladder and supervises construction', () => {
    const state = runShuScript(createSiegeState(1), 'competent');
    expect(state.log.filter((e) => e.code === 'queueEngine')).toHaveLength(2);
    expect(state.log.some((e) => e.code === 'order' && e.params.kind === 'supervise')).toBe(true);
    expect(state.engines.map((e) => e.kind)).toContain('earthCart');
    expect(
      state.engines.some((e) => e.kind === 'ladder') ||
        state.workshops.some((w) => w.queue === 'ladder'),
    ).toBe(true);
  });

  it('rotates the most wounded formation before sending fresh troops forward', () => {
    const initial = createSiegeState(1);
    Object.assign(initial.units[1]!, { troops: 800, wounded: 1000 });
    Object.assign(initial.units[2]!, { troops: 900, wounded: 500 });
    const state = runShuScript(initial, 'competent');
    expect(state.log.some((e) => e.code === 'order' && e.params.kind === 'rotate')).toBe(true);
    expect(state.units[1]).toMatchObject({ troops: 1300, wounded: 500, level: 'ground' });
    expect(CAMP_CELLS.some((c) => c.x === state.units[1]!.x && c.y === state.units[1]!.y)).toBe(
      true,
    );
    expect(state.units[2]!.wounded).toBe(500);
  });

  it('fills multiple outer trench columns before their inner cells and uses act 2 towers', () => {
    let state = createSiegeState(2);
    for (let day = 0; day < 15 && !state.outcome; day++) {
      state = runShuScript(state, 'competent');
      for (const x of [20, 28]) {
        if (state.trenchFill[`${x},17`]! > 0) expect(state.trenchFill[`${x},18`]).toBe(3);
      }
    }
    expect([20, 28].filter((x) => state.trenchFill[`${x},18`]! > 0)).toHaveLength(2);
    expect(state.log.some((e) => e.code === 'engineCompleted' && e.params.kind === 'tower')).toBe(
      true,
    );
  });
});
