import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2),
  baseline = args.includes('--baseline'),
  // Canvas battlefields only (the campaign no longer creates legacy 24×20 battles).
  canvasOnly = args.includes('--canvas-only'),
  dayLimitArg = args.find((arg) => arg.startsWith('--day-limit='))?.slice('--day-limit='.length),
  positional = args.filter((arg) => !arg.startsWith('--'));
const output = positional[0] ?? 'docs/v0.3/evidence/battle-pacing.json';
const count = Number(positional[1] ?? 200);
if (!Number.isSafeInteger(count) || count < 1)
  throw new Error('Battle count must be a positive integer.');
// 30 is the conquest limit; raids use the campaign's shorter limit.
const dayLimit = Number(dayLimitArg ?? 30);
if (!Number.isSafeInteger(dayLimit) || dayLimit < 1)
  throw new Error('Day limit must be a positive integer.');
let entry = '/src/v03/battle/index.ts',
  enginePath = 'src/v03/battle/engine.ts';
if (baseline) {
  const dir = '.artifacts/battle-pacing-baseline';
  await mkdir(dir, { recursive: true });
  const files = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', 'v0.2-final', 'src/v03/battle'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n');
  for (const file of files)
    await writeFile(
      `${dir}/${basename(file)}`,
      execFileSync('git', ['show', `v0.2-final:${file}`]),
    );
  entry = `/${dir}/index.ts`;
  enginePath = `${dir}/engine.ts`;
}
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false },
});
const percentile = (values, p) =>
  values.slice().sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] ?? null;
function appended(before, after) {
  for (let overlap = Math.min(before.length, after.length); overlap >= 0; overlap--) {
    if (before.slice(before.length - overlap).every((line, index) => line === after[index]))
      return after.slice(overlap);
  }
  return after;
}
try {
  const {
    createBattleMap,
    createTacticalBattle,
    runBattleAiTurn,
    advanceBattleDay,
    canvasBattlefieldIds,
    createCanvasBattleMap,
  } = await server.ssrLoadModule(entry);
  const distributions = {};
  // Legacy regional templates, then the 48×32 canvas battlefields when the source has them.
  const templates = [
    ...(canvasOnly ? [] : ['xiapi', 'hanzhong', 'shouchun', 'chengdu']).map((regionId) => ({
      id: regionId,
      map: (seed) => createBattleMap({ regionId, seed }),
    })),
    ...(canvasBattlefieldIds?.() ?? []).map((id) => ({
      id,
      map: (seed) => createCanvasBattleMap(id, { seed }),
    })),
  ];
  for (const { id: regionId, map: templateMap } of templates) {
    const runs = [];
    for (let seed = 0; seed < count; seed++) {
      const roster = (prefix) =>
        Array.from({ length: 3 }, (_, index) => ({
          id: `${prefix}-${index}`,
          name: `${prefix} ${index}`,
          troopType: ['infantry', 'cavalry', 'archer'][index],
          troops: 1200 + (seed % 5) * 100,
          force: 70,
          intellect: 65,
        }));
      let battle = createTacticalBattle({
        id: `pacing-${seed}`,
        seed,
        map: templateMap(seed),
        attackerUnits: roster('a'),
        defenderUnits: roster('d'),
        supplies: { attacker: 100000, defender: 100000 },
        dayLimit,
      });
      let firstContact = null;
      const sideTurns = [],
        exchanges = [];
      for (let day = 0; day < dayLimit && !battle.outcome; day++) {
        for (const side of ['attacker', 'defender']) {
          const before = battle.units.reduce((sum, unit) => sum + unit.troops, 0),
            priorLog = battle.log.slice();
          battle = runBattleAiTurn(battle, side);
          const lost = before - battle.units.reduce((sum, unit) => sum + unit.troops, 0);
          if (lost > 0) {
            firstContact ??= battle.day;
            sideTurns.push(lost);
          }
          // Benchmark-only compatibility reader: every primary hit, counterattack and damaging tactic is a separate exchange sample.
          for (const line of appended(priorLog, battle.log)) {
            const match = line.match(/: (\d+) casualties/);
            if (match) exchanges.push(Number(match[1]));
          }
          if (battle.outcome) break;
        }
        if (!battle.outcome) battle = advanceBattleDay(battle);
      }
      // Structured entries survive log trimming better than message text; older engines lack them.
      const tactics = {};
      for (const entry of battle.logEntries ?? [])
        if (entry.code === 'log.tactic')
          tactics[entry.params.tactic] = (tactics[entry.params.tactic] ?? 0) + 1;
      runs.push({
        seed,
        firstContact,
        days: battle.day,
        outcome: battle.outcome,
        tactics,
        casualtiesPerSideTurn: sideTurns,
        casualtiesPerExchange: exchanges,
        survivingTroops: battle.units.reduce((sum, unit) => sum + unit.troops, 0),
      });
    }
    distributions[regionId] = {
      runs,
      firstContactMedian: percentile(
        runs.flatMap((run) => (run.firstContact === null ? [] : [run.firstContact])),
        0.5,
      ),
      lengthMedian: percentile(
        runs.map((run) => run.days),
        0.5,
      ),
      lengthP90: percentile(
        runs.map((run) => run.days),
        0.9,
      ),
      casualtiesPerExchangeMedian: percentile(
        runs.flatMap((run) => run.casualtiesPerExchange),
        0.5,
      ),
      timeouts: runs.filter((run) => !run.outcome || run.outcome.reason === 'dayLimit').length,
      outcomes: Object.fromEntries(
        ['elimination', 'rout', 'retreat', 'dayLimit'].map((reason) => [
          reason,
          runs.filter((run) => run.outcome?.reason === reason).length,
        ]),
      ),
      tactics: runs.reduce((total, run) => {
        for (const [tactic, casts] of Object.entries(run.tactics))
          total[tactic] = (total[tactic] ?? 0) + casts;
        return total;
      }, {}),
    };
    console.log(
      regionId,
      distributions[regionId].firstContactMedian,
      distributions[regionId].lengthMedian,
      distributions[regionId].lengthP90,
      distributions[regionId].timeouts,
      JSON.stringify(distributions[regionId].tactics),
    );
  }
  // Pooled over every template, the figures the play-feel plan's targets use.
  const allRuns = Object.values(distributions).flatMap((distribution) => distribution.runs);
  const tactics = Object.values(distributions).reduce((total, distribution) => {
    for (const [tactic, casts] of Object.entries(distribution.tactics))
      total[tactic] = (total[tactic] ?? 0) + casts;
    return total;
  }, {});
  const casts = Object.values(tactics).reduce((sum, value) => sum + value, 0);
  const summary = {
    battles: allRuns.length,
    dayLimit,
    firstContactMedian: percentile(
      allRuns.flatMap((run) => (run.firstContact === null ? [] : [run.firstContact])),
      0.5,
    ),
    lengthMedian: percentile(
      allRuns.map((run) => run.days),
      0.5,
    ),
    timeoutShare:
      allRuns.filter((run) => !run.outcome || run.outcome.reason === 'dayLimit').length /
      allRuns.length,
    outcomes: Object.fromEntries(
      ['elimination', 'rout', 'retreat', 'dayLimit'].map((reason) => [
        reason,
        allRuns.filter((run) => run.outcome?.reason === reason).length,
      ]),
    ),
    tactics,
    rallyShare: casts ? (tactics.rally ?? 0) / casts : null,
  };
  console.log('summary', JSON.stringify(summary));
  await mkdir(dirname(output), { recursive: true });
  const sha256 = createHash('sha256')
    .update(await readFile(enginePath))
    .digest('hex');
  await writeFile(
    output,
    JSON.stringify(
      {
        countPerTemplate: count,
        dayLimit,
        summary,
        source: {
          ref: baseline ? 'v0.2-final' : 'working-tree',
          enginePath: baseline ? 'src/v03/battle/engine.ts' : enginePath,
          sha256,
        },
        measurement:
          'Separate exchange samples count primary hits, counterattacks and damaging tactics. Side-turn totals are retained separately.',
        distributions,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await server.close();
}
