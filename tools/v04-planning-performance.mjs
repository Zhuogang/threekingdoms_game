import { createServer } from 'vite';
import { performance } from 'node:perf_hooks';
import { cpus, platform, release } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { simulationFingerprint } from './simulation-fingerprint.mjs';

const root = resolve(process.argv[2] ?? process.cwd());
const output = resolve(process.argv[3] ?? '.artifacts/v04/planning-performance.json');
const configuration = {
  scenarios: ['divided-realm-190', 'guandu-200'],
  players: ['cao', 'sun'],
  seeds: Array.from({ length: 10 }, (_, index) => 101 + index),
  warmupSeeds: [1, 2, 3],
  description:
    'One actual monthly boundary, including governance execution and campaign planning/dispatch. Opening snapshots moved to day 29; this is not a simulated first month or a mature campaign benchmark.',
  runnerSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
};
const fingerprints = await simulationFingerprint(root, configuration);
const server = await createServer({
  root,
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false },
});
const results = [];
try {
  const { createV03Game } = await server.ssrLoadModule('/src/v03/initial-state.ts');
  const { advanceV03 } = await server.ssrLoadModule('/src/v03/engine.ts');
  const { createPersonnelDay } = await server.ssrLoadModule('/src/v03/campaign/personnel.ts');
  const { validateV03State } = await server.ssrLoadModule('/src/v03/platform/storage.ts');
  for (const scenario of configuration.scenarios)
    for (const player of configuration.players) {
      const run = (seed) => {
        const state = createV03Game(player, seed, scenario);
        state.absoluteDay = 29;
        state.personnelDay = createPersonnelDay(state);
        const started = performance.now();
        const result = advanceV03(state, 1);
        const ms = performance.now() - started;
        if (result.error || result.daysAdvanced !== 1 || !validateV03State(result.state))
          throw new Error(`Invalid boundary: ${scenario}/${player}/${seed}`);
        return {
          scenario,
          player,
          seed,
          ms,
          campaignJourneys: result.state.journeys.filter((j) => j.kind === 'campaign').length,
        };
      };
      for (const seed of configuration.warmupSeeds) run(seed);
      for (const seed of configuration.seeds) results.push(run(seed));
    }
  const finalFingerprint = await simulationFingerprint(root, configuration);
  if (finalFingerprint.sourceSha256 !== fingerprints.sourceSha256)
    throw new Error('Source changed during measurement.');
  const groups = configuration.scenarios.flatMap((scenario) =>
    configuration.players.map((player) => {
      const times = results
        .filter((row) => row.scenario === scenario && row.player === player)
        .map((row) => row.ms)
        .sort((a, b) => a - b);
      return {
        scenario,
        player,
        samples: times.length,
        p50Ms: times[Math.ceil(times.length * 0.5) - 1],
        p95Ms: times[Math.ceil(times.length * 0.95) - 1],
        maxMs: times.at(-1),
      };
    }),
  );
  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    environment: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      logicalCpus: cpus().length,
    },
    fingerprints,
    configuration,
    groups,
    results,
  };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, sourceSha256: fingerprints.sourceSha256, groups }));
} finally {
  await server.close();
}
