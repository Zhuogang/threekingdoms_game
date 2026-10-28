import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const args = process.argv.slice(2),
  baseline = args.includes('--baseline'),
  positional = args.filter((arg) => arg !== '--baseline');
const output = positional[0] ?? 'docs/v0.3/evidence/battle-pacing.json';
const count = Number(positional[1] ?? 200);
if (!Number.isSafeInteger(count) || count < 1)
  throw new Error('Battle count must be a positive integer.');
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
    ...['xiapi', 'hanzhong', 'shouchun', 'chengdu'].map((regionId) => ({
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
      });
      let firstContact = null;
      const sideTurns = [],
        exchanges = [];
      for (let day = 0; day < 30 && !battle.outcome; day++) {
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
      runs.push({
        seed,
        firstContact,
        days: battle.day,
        outcome: battle.outcome,
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
    };
    console.log(
      regionId,
      distributions[regionId].firstContactMedian,
      distributions[regionId].lengthMedian,
      distributions[regionId].lengthP90,
      runs.filter((run) => !run.outcome || run.outcome.reason === 'dayLimit').length,
    );
  }
  await mkdir(dirname(output), { recursive: true });
  const sha256 = createHash('sha256')
    .update(await readFile(enginePath))
    .digest('hex');
  await writeFile(
    output,
    JSON.stringify(
      {
        countPerTemplate: count,
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
