import { describe, expect, it } from 'vitest';
import { autoResolveBattle, createBattle } from '../../src/game/battle';
import { game, officer, order } from '../fixtures';

/** The P2-9 budget: one 10-versus-10 auto-resolve must stay under this at the 95th percentile. */
const AUTO_RESOLVE_BUDGET_MS = 50;
const TRIALS = 30;
const WARMUP = 3;

function tenVersusTen(seed: number) {
  const state = game();
  state.rng = seed * 97;
  state.officers = Array.from({ length: 10 }, (_, i) => [
    {
      ...officer(`a-${i}`, 'home', 'blue'),
      troops: 2000,
      intellect: 40 + i * 5,
      troopType: (['infantry', 'archer', 'cavalry', 'elite', 'guard'] as const)[i % 5]!,
    },
    {
      ...officer(`b-${i}`, 'target', 'red'),
      troops: 2000,
      intellect: 85 - i * 5,
      troopType: (['guard', 'archer', 'infantry', 'naval', 'cavalry'] as const)[i % 5]!,
    },
  ]).flat();
  const army = {
    ...order,
    officerIds: state.officers.filter((o) => o.factionId === 'blue').map((o) => o.id),
  };
  state.battle = createBattle(state, army);
  return state;
}

describe('auto-resolve performance', () => {
  it('keeps the 95th percentile of 10-versus-10 battles under the budget', () => {
    for (let i = 0; i < WARMUP; i++) autoResolveBattle(tenVersusTen(1000 + i));
    const times: number[] = [];
    for (let seed = 1; seed <= TRIALS; seed++) {
      const state = tenVersusTen(seed);
      const start = performance.now();
      autoResolveBattle(state);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    process.stderr.write(
      `auto-resolve p50=${times[15]!.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${times[times.length - 1]!.toFixed(1)}ms\n`,
    );
    expect(p95).toBeLessThan(AUTO_RESOLVE_BUDGET_MS);
  });
});
