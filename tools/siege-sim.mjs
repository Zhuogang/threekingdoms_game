import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createServer } from 'vite';

const methods = ['careful', 'anyPrice', 'brute'];
const args = process.argv.slice(2);
const tracing = args[0] === '--trace';
const traceMethod = args[1];
const traceSeed = Number(args[2]);
const games = tracing ? 1 : Number(args.find((a) => /^\d+$/.test(a)) ?? 200);
const strict = args.includes('--strict');
const outputIndex = args.indexOf('--output');
const output = resolve(outputIndex >= 0 ? args[outputIndex + 1] : '.artifacts/siege/sim-j.json');
if (
  !Number.isInteger(games) ||
  games < 1 ||
  (tracing &&
    (!methods.includes(traceMethod) ||
      !Number.isSafeInteger(traceSeed) ||
      traceSeed < 0 ||
      traceSeed > 0xffffffff))
) {
  throw new Error(
    'Use siege-sim.mjs [games=200] [--strict] [--output file] or --trace <careful|anyPrice|brute> <seed>.',
  );
}
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
const results = [];
const failures = [];
const times = { attacker: [], defender: [] };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const median = (xs) => {
  if (!xs.length) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  return (sorted[Math.floor((xs.length - 1) / 2)] + sorted[Math.floor(xs.length / 2)]) / 2;
};
try {
  const { createSiegeState } = await server.ssrLoadModule('/src/siege/rules/state.ts');
  const { runAttackerTurn } = await server.ssrLoadModule('/src/siege/ai/attacker.ts');
  const { runDefenderTurn } = await server.ssrLoadModule('/src/siege/ai/defender.ts');
  const { endDay } = await server.ssrLoadModule('/src/siege/rules/day.ts');
  for (const method of tracing ? [traceMethod] : methods) {
    for (const seed of tracing ? [traceSeed] : Array.from({ length: games }, (_, i) => i + 1)) {
      try {
        let state = createSiegeState(seed);
        const days = [];
        while (!state.outcome && days.length < 12) {
          const day = state.day;
          const weather = state.weather;
          const from = state.log.length;
          const preparations = structuredClone(state.preparations);
          let start = performance.now();
          state = runAttackerTurn(state, method);
          times.attacker.push(performance.now() - start);
          const shuOrder = structuredClone(
            state.nightOrders.shu ??
              state.log.slice(from).find((e) => e.code === 'order' && e.params.side === 'shu')
                ?.params ??
              null,
          );
          start = performance.now();
          state = runDefenderTurn(state);
          times.defender.push(performance.now() - start);
          const weiOrder = structuredClone(
            state.nightOrders.wei ??
              state.log.slice(from).find((e) => e.code === 'order' && e.params.side === 'wei')
                ?.params ??
              null,
          );
          state = endDay(state);
          const events = state.log.slice(from).filter((e) => e.day === day);
          const row = {
            day,
            weather,
            outcome: state.outcome,
            gate: state.gates.south.durability,
            preparations,
            counters: events.filter((e) =>
              ['covered', 'suppressed', 'earthPiled', 'moundFinished', 'assault'].includes(e.code),
            ),
            prepared: events.filter((e) =>
              ['brazierPrepared', 'millstonePrepared', 'bouldersPrepared'].includes(e.code),
            ),
            orders: { shu: shuOrder, wei: weiOrder },
            footholds: state.footholds,
            firstFootholdDay: state.stats.firstFootholdDay,
            firstWallDay: state.stats.firstWallDay,
            wall: state.units
              .filter((u) => u.side === 'shu' && u.troops > 0 && u.level === 'wall')
              .map((u) => ({ id: u.id, x: u.x, y: u.y })),
            shuLost: state.stats.shuLost,
            weiLost: state.stats.weiLost,
            assaults: state.stats.assaults,
            wallNights: state.stats.wallNights,
            mounds: state.mounds,
            engines: state.engines.map((e) => ({
              id: e.id,
              kind: e.kind,
              x: e.x,
              y: e.y,
              hp: e.durability,
              covered: !!e.covered,
            })),
            nightResults: state.stats.nightResults.filter((e) => e.day === day),
          };
          days.push(row);
          if (tracing) console.log(JSON.stringify(row));
        }
        if (!state.outcome) throw new Error('No outcome within 12 days.');
        results.push({
          method,
          seed,
          outcome: state.outcome,
          day: state.day,
          ...state.stats,
          days,
        });
        if (!tracing && seed % 50 === 0)
          console.error(`${method}: ${seed}/${games} games completed`);
      } catch (error) {
        failures.push({ method, seed, error: error.stack ?? String(error) });
      }
    }
  }
  const strategies = Object.fromEntries(
    methods.map((method) => {
      const rows = results.filter((r) => r.method === method);
      const wins = rows.filter((r) => r.outcome === 'victory');
      return [
        method,
        {
          completed: rows.length,
          wins: wins.length,
          winRate: wins.length / games,
          meanWinningDay: mean(wins.map((r) => r.day)),
          medianWinningLoss: median(wins.map((r) => r.shuLost)),
          footholdBy2:
            rows.filter((r) => r.firstFootholdDay !== null && r.firstFootholdDay <= 2).length /
            games,
          wallBy5:
            rows.filter((r) => r.firstWallDay !== null && r.firstWallDay <= 5).length / games,
          meanIdleDays: mean(rows.map((r) => r.idleDays)),
          distinctGames: new Set(rows.map((r) => `${r.outcome}/${r.day}/${r.shuLost}`)).size,
          perfectDefenseRate:
            rows.filter((r) => r.score.wei.tier === 'perfectDefense').length / games,
          meanLoss: mean(rows.map((r) => r.shuLost)),
        },
      ];
    }),
  );
  const c = strategies.careful,
    a = strategies.anyPrice,
    b = strategies.brute;
  const table = [];
  const add = (metric, actual, target, passes) =>
    table.push({ metric, actual, target, pass: actual !== null && passes });
  add('careful win rate', c.winRate, '25–40%', c.winRate >= 0.25 && c.winRate <= 0.4);
  add('anyPrice win rate', a.winRate, '≥85%', a.winRate >= 0.85);
  add('brute win rate', b.winRate, '≤15%', b.winRate <= 0.15);
  add('brute below careful win rate', b.winRate, '<careful win rate', b.winRate < c.winRate);
  add('careful foothold by day 2', c.footholdBy2, '≥90%', c.footholdBy2 >= 0.9);
  add('careful wall by day 5', c.wallBy5, '≥70%', c.wallBy5 >= 0.7);
  add(
    'careful mean winning day',
    c.meanWinningDay,
    '8–11',
    c.meanWinningDay >= 8 && c.meanWinningDay <= 11,
  );
  add(
    'anyPrice median winning Shu loss',
    a.medianWinningLoss,
    '≥3000',
    a.medianWinningLoss >= 3000,
  );
  add(
    'anyPrice / careful median winning loss',
    a.medianWinningLoss !== null && c.medianWinningLoss > 0
      ? a.medianWinningLoss / c.medianWinningLoss
      : null,
    '≥1.5×',
    a.medianWinningLoss >= 1.5 * c.medianWinningLoss,
  );
  add('careful mean idle days', c.meanIdleDays, '≤1.5', c.meanIdleDays <= 1.5);
  add('careful distinct games', c.distinctGames, '≥150 / 200', c.distinctGames >= 150);
  add(
    'max defender / attacker turn ms',
    Math.max(0, ...times.defender, ...times.attacker),
    '≤1000 ms',
    Math.max(0, ...times.defender, ...times.attacker) <= 1000,
  );
  add(
    'Wei perfect defense vs careful',
    c.perfectDefenseRate,
    '10–40%',
    c.perfectDefenseRate >= 0.1 && c.perfectDefenseRate <= 0.4,
  );
  const timing = Object.fromEntries(
    Object.entries(times).map(([side, values]) => [
      side,
      { turns: values.length, meanMs: mean(values), maxMs: Math.max(0, ...values) },
    ]),
  );
  const report = { gamesPerStrategy: games, strategies, timing, table, failures };
  if (!tracing) {
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify({ ...report, results }, null, 2) + '\n');
    console.log(JSON.stringify({ output, ...report }, null, 2));
    console.log('\n| Metric | Actual | Target | Result |\n| --- | ---: | --- | --- |');
    for (const row of table) {
      const percent = row.target.includes('%') || row.metric.includes('win rate');
      const actual =
        row.actual === null
          ? 'n/a'
          : percent
            ? `${(row.actual * 100).toFixed(2)}%`
            : row.actual.toFixed(3);
      console.log(`| ${row.metric} | ${actual} | ${row.target} | ${row.pass ? 'PASS' : 'FAIL'} |`);
    }
  } else
    console.log(JSON.stringify({ summary: results.map(({ days, ...r }) => r), timing, failures }));
  if (failures.length || (strict && table.some((r) => !r.pass))) process.exitCode = 1;
} finally {
  await server.close();
}
