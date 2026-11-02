import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

const games = Number(process.argv[2] ?? 200);
if (!Number.isSafeInteger(games) || games < 1) throw new Error('games must be a positive integer.');
const output = process.argv[3] ?? '.artifacts/siege/sim.json';
const kinds = ['ladder', 'ram', 'earthCart', 'tower'];
const failures = [];
const results = [];
const timings = { competent: [], brute: [] };
const percentile = (sorted, fraction) =>
  sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
const turnTimes = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    turns: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1) ?? null,
  };
};
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
});
try {
  const { createSiegeState } = await server.ssrLoadModule('/src/siege/rules/state.ts');
  const { runDefenderTurn } = await server.ssrLoadModule('/src/siege/ai/defender.ts');
  const { runShuScript } = await server.ssrLoadModule('/src/siege/ai/scripts.ts');
  for (const strategy of ['competent', 'brute']) {
    for (let seed = 1; seed <= games; seed++) {
      try {
        let state = createSiegeState(seed);
        const timedDefender = (draft) => {
          const started = performance.now();
          try {
            return runDefenderTurn(draft);
          } finally {
            timings[strategy].push(performance.now() - started);
          }
        };
        for (let days = 0; days < 21 && !state.outcome && state.day <= 21; days++)
          state = runShuScript(state, strategy, timedDefender);
        if (!state.outcome) throw new Error('No outcome within the 21-day cap.');
        const engines = Object.fromEntries(
          kinds.map((kind) => {
            const built = state.log.filter(
              (e) => e.code === 'engineCompleted' && e.params.kind === kind,
            ).length;
            const destroyed = state.engines.filter(
              (e) => e.kind === kind && (e.wrecked || e.durability <= 0),
            ).length;
            const surviving = state.engines.filter(
              (e) => e.kind === kind && !e.wrecked && e.durability > 0,
            ).length;
            return [kind, { built, destroyed, surviving, consumed: built - destroyed - surviving }];
          }),
        );
        results.push({
          strategy,
          seed,
          outcome: state.outcome,
          day: state.day,
          lostEngineAct1: (state.enginesLostAct1 ?? 0) > 0,
          engines,
        });
      } catch (error) {
        failures.push({
          strategy,
          seed,
          error: error instanceof Error ? (error.stack ?? error.message) : String(error),
        });
      }
    }
  }
  const strategies = Object.fromEntries(
    ['competent', 'brute'].map((strategy) => {
      const rows = results.filter((r) => r.strategy === strategy);
      const wins = rows.filter((r) => r.outcome === 'victory');
      const winningDays = {};
      for (const win of wins) winningDays[win.day] = (winningDays[win.day] ?? 0) + 1;
      return [
        strategy,
        {
          games,
          completed: rows.length,
          winRate: wins.length / games,
          historicalRate: rows.filter((r) => r.outcome === 'historical').length / games,
          defeatRate: rows.filter((r) => r.outcome === 'defeat').length / games,
          meanWinningDay: wins.length
            ? wins.reduce((sum, r) => sum + r.day, 0) / wins.length
            : null,
          winningDays,
          engines: Object.fromEntries(
            kinds.map((kind) => {
              const totals = rows.reduce(
                (sum, r) =>
                  Object.fromEntries(
                    Object.keys(sum).map((key) => [key, sum[key] + r.engines[kind][key]]),
                  ),
                { built: 0, destroyed: 0, surviving: 0, consumed: 0 },
              );
              return [
                kind,
                { ...totals, survivalRate: totals.built ? totals.surviving / totals.built : null },
              ];
            }),
          ),
          lostEngineByEndOfAct1Share: rows.filter((r) => r.lostEngineAct1).length / games,
          weiTurnMs: turnTimes(timings[strategy]),
        },
      ];
    }),
  );
  const report = {
    gamesPerStrategy: games,
    strategies,
    weiTurnMs: turnTimes(Object.values(timings).flat()),
    failures,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ ...report, results }, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...report }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await server.close();
}
