import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

const tracing = process.argv[2] === '--trace';
const traceStrategy = process.argv[3];
const traceSeed = Number(process.argv[4]);
if (
  tracing &&
  (!['competent', 'brute'].includes(traceStrategy) ||
    !Number.isSafeInteger(traceSeed) ||
    traceSeed < 0 ||
    traceSeed > 0xffffffff)
)
  throw new Error('usage: --trace <competent|brute> <uint32 seed>');
const games = tracing ? 1 : Number(process.argv[2] ?? 200);
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
  const { CITY_BOUNDS } = await server.ssrLoadModule('/src/siege/content/chencang.ts');
  const { createSiegeState } = await server.ssrLoadModule('/src/siege/rules/state.ts');
  const { runDefenderTurn } = await server.ssrLoadModule('/src/siege/ai/defender.ts');
  const { runShuScript } = await server.ssrLoadModule('/src/siege/ai/scripts.ts');
  for (const strategy of tracing ? [traceStrategy] : ['competent', 'brute']) {
    for (const seed of tracing ? [traceSeed] : Array.from({ length: games }, (_, i) => i + 1)) {
      try {
        let state = createSiegeState(seed);
        let mainBodyMinimumDistance = Infinity;
        const inspectMainBody = (draft) => {
          const main = draft.units.find((u) => u.id === 'shu-zhugeliang');
          for (const unit of draft.units.filter((u) => u.side === 'wei' && u.troops > 0))
            mainBodyMinimumDistance = Math.min(
              mainBodyMinimumDistance,
              Math.abs(main.x - unit.x) + Math.abs(main.y - unit.y),
            );
          return main;
        };
        const timedDefender = (draft) => {
          inspectMainBody(draft);
          const started = performance.now();
          try {
            const defended = runDefenderTurn(draft);
            inspectMainBody(defended);
            return defended;
          } finally {
            timings[strategy].push(performance.now() - started);
          }
        };
        for (let days = 0; days < 21 && !state.outcome && state.day <= 21; days++) {
          const day = state.day;
          state = runShuScript(state, strategy, timedDefender);
          inspectMainBody(state);
          if (tracing) {
            const shu = state.units.filter((u) => u.side === 'shu' && u.troops > 0);
            const wei = state.units.filter((u) => u.side === 'wei');
            const position = (u) => ({ id: u.id, x: u.x, y: u.y, level: u.level });
            console.log(
              JSON.stringify({
                day,
                outcome: state.outcome,
                southGate: state.gates.south.durability,
                mainBody: {
                  ...position(inspectMainBody(state)),
                  troops: inspectMainBody(state).troops,
                  morale: inspectMainBody(state).morale,
                  routed: inspectMainBody(state).routed,
                  minimumWeiDistance: mainBodyMinimumDistance,
                },
                shuTroops: shu.reduce((sum, u) => sum + u.troops, 0),
                weiTroops: wei.reduce((sum, u) => sum + u.troops, 0),
                shuOnWall: shu.filter((u) => u.level === 'wall').map(position),
                shuInside: shu
                  .filter(
                    (u) =>
                      u.level === 'ground' &&
                      u.x > CITY_BOUNDS.west &&
                      u.x < CITY_BOUNDS.east &&
                      u.y > CITY_BOUNDS.north &&
                      u.y < CITY_BOUNDS.south,
                  )
                  .map(position),
                liveEngines: state.engines
                  .filter((e) => !e.wrecked && e.durability > 0)
                  .map((e) => ({
                    id: e.id,
                    kind: e.kind,
                    x: e.x,
                    y: e.y,
                    durability: e.durability,
                    target: [...state.log]
                      .reverse()
                      .find(
                        (entry) =>
                          entry.code === 'shuEngineChoice' && entry.params.engineId === e.id,
                      )?.params,
                    firstArrivalDay:
                      state.log.find(
                        (entry) =>
                          entry.code === 'shuEngineArrived' && entry.params.engineId === e.id,
                      )?.day ?? null,
                  })),
                fullTrench: Object.entries(state.trenchFill)
                  .filter(([, fill]) => fill === 3)
                  .map(([cell]) => cell),
                wei: wei.map((u) => ({ ...position(u), troops: u.troops, morale: u.morale })),
              }),
            );
          }
        }
        if (!state.outcome) throw new Error('No outcome within the 21-day cap.');
        const engines = Object.fromEntries(
          kinds.map((kind) => {
            const built =
              createSiegeState(seed).engines.filter((e) => e.kind === kind).length +
              state.log.filter((e) => e.code === 'engineCompleted' && e.params.kind === kind)
                .length;
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
          mainBodyDefeat:
            state.outcome === 'defeat' &&
            (state.units.find((u) => u.id === 'shu-zhugeliang').routed ||
              state.units.find((u) => u.id === 'shu-zhugeliang').troops <= 0),
          mainBodyMinimumDistance,
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
          mainBodyDefeats: rows.filter((r) => r.mainBodyDefeat).length,
          mainBodyMinimumDistance: Math.min(...rows.map((r) => r.mainBodyMinimumDistance)),
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
  if (!tracing) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify({ ...report, results }, null, 2) + '\n');
    console.log(JSON.stringify({ output, ...report }, null, 2));
  }
  if (failures.length) {
    if (tracing) console.error(JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
} finally {
  await server.close();
}
