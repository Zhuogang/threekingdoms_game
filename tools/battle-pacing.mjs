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
  rosterKind = args.find((arg) => arg.startsWith('--roster='))?.slice('--roster='.length) ?? '3v3',
  label = args.find((arg) => arg.startsWith('--label='))?.slice('--label='.length),
  // --compact drops the per-battle records so committed evidence stays small.
  compact = args.includes('--compact'),
  positional = args.filter((arg) => !arg.startsWith('--'));
if (!['3v3', '8v8'].includes(rosterKind)) throw new Error('--roster must be 3v3 or 8v8.');
const output =
  positional[0] ??
  (label
    ? `docs/v0.5/evidence/battle-pacing-${label}.json`
    : 'docs/v0.3/evidence/battle-pacing.json');
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
// Fixed 8v8 table: infantry 0-2, cavalry 3-4, archers 5-7; Fire needs intellect 60, Confuse 70.
const ROSTER_8V8 = {
  types: ['infantry', 'infantry', 'infantry', 'cavalry', 'cavalry', 'archer', 'archer', 'archer'],
  force: [85, 70, 62, 80, 74, 55, 66, 60],
  intellect: [45, 60, 72, 50, 65, 80, 70, 62],
};
const buildRoster = (prefix, seed) =>
  rosterKind === '8v8'
    ? ROSTER_8V8.types.map((troopType, index) => ({
        id: `${prefix}-${index}`,
        name: `${prefix} ${index}`,
        troopType,
        troops: 800 + ((seed * 37 + index * 211) % 9) * 100,
        force: ROSTER_8V8.force[index],
        intellect: ROSTER_8V8.intellect[index],
        ...(index === 0 ? { fierce: true } : {}),
        ...(index === 5 ? { cunning: true } : {}),
      }))
    : Array.from({ length: 3 }, (_, index) => ({
        id: `${prefix}-${index}`,
        name: `${prefix} ${index}`,
        troopType: ['infantry', 'cavalry', 'archer'][index],
        troops: 1200 + (seed % 5) * 100,
        force: 70,
        intellect: 65,
      }));
const bump = (record, key, by = 1) => {
  record[key] = (record[key] ?? 0) + by;
};
const mergeCounts = (into, from) => {
  for (const [key, value] of Object.entries(from ?? {})) bump(into, key, value);
  return into;
};
const percentile = (values, p) =>
  values.slice().sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] ?? null;
function appended(before, after) {
  for (let overlap = Math.min(before.length, after.length); overlap >= 0; overlap--) {
    if (before.slice(before.length - overlap).every((line, index) => line === after[index]))
      return after.slice(overlap);
  }
  return after;
}
function extras(runs) {
  const out = {};
  const causes = runs.reduce((t, r) => (r.cause === undefined ? t : (bump(t, r.cause), t)), {});
  if (Object.keys(causes).length) out.causes = causes;
  const baggage = runs.reduce((sum, run) => sum + (run.baggageCaptures ?? 0), 0);
  if (baggage) out.baggageCaptures = baggage;
  const duels = runs.reduce((sum, run) => sum + (run.duels ?? 0), 0);
  if (duels) out.duels = duels;
  const cards = runs.reduce((t, r) => mergeCounts(t, r.cards), {});
  if (Object.keys(cards).length) out.cards = cards;
  const orders = runs.reduce((t, r) => mergeCounts(t, r.orders), {});
  if (Object.keys(orders).length) out.orders = orders;
  return out;
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
      let battle = createTacticalBattle({
        id: `pacing-${seed}`,
        seed,
        map: templateMap(seed),
        attackerUnits: buildRoster('a', seed),
        defenderUnits: buildRoster('d', seed),
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
      // Feature-detected extras: only reported when the engine's state carries them.
      const cards = {},
        orders = {};
      let baggageCaptures = 0,
        duels = 0;
      for (const entry of battle.logEntries ?? []) {
        if (entry.code === 'log.baggageCaptured') baggageCaptures++;
        else if (entry.code === 'log.duelResult') duels++;
        else if (entry.code === 'log.card') bump(cards, String(entry.params?.card));
        else if (entry.code === 'log.order' || entry.code === 'log.orderExecuted')
          bump(orders, String(entry.params?.order ?? entry.params?.kind ?? 'unknown'));
      }
      const living = battle.units.filter((unit) => unit.troops > 0);
      const healthy = (side) =>
        Math.round(
          living.filter((unit) => unit.side === side).reduce((sum, unit) => sum + unit.troops, 0) /
            100,
        ) * 100;
      const routedLiving = living.filter((unit) => unit.morale < 20).length;
      const cause = battle.outcome?.cause;
      runs.push({
        outcomeKey: JSON.stringify([
          battle.outcome?.winner ?? null,
          battle.outcome?.reason ?? null,
          battle.day,
          healthy('attacker'),
          healthy('defender'),
          routedLiving,
        ]),
        attackerWon: battle.outcome?.winner === 'attacker',
        routed: battle.outcome?.reason === 'rout',
        ...(cause === undefined
          ? {}
          : { cause: typeof cause === 'string' ? cause : JSON.stringify(cause) }),
        ...(baggageCaptures ? { baggageCaptures } : {}),
        ...(duels ? { duels } : {}),
        ...(Object.keys(cards).length ? { cards } : {}),
        ...(Object.keys(orders).length ? { orders } : {}),
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
      attackerWinRate: runs.filter((run) => run.attackerWon).length / runs.length,
      routShare: runs.filter((run) => run.routed).length / runs.length,
      distinctOutcomes: new Set(runs.map((run) => run.outcomeKey)).size,
      ...extras(runs),
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
    roster: rosterKind,
    attackerWinRate: allRuns.filter((run) => run.attackerWon).length / allRuns.length,
    routShare: allRuns.filter((run) => run.routed).length / allRuns.length,
    distinctOutcomesMedian: percentile(
      Object.values(distributions).map((distribution) => distribution.distinctOutcomes),
      0.5,
    ),
    ...extras(allRuns),
  };
  const cardPlays = Object.values(summary.cards ?? {}).reduce((sum, value) => sum + value, 0);
  summary.rallyAllShare =
    casts + cardPlays
      ? ((tactics.rally ?? 0) + (summary.cards?.rallyAll ?? 0)) / (casts + cardPlays)
      : null;
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
        roster: rosterKind,
        dayLimit,
        summary,
        source: {
          ref: baseline ? 'v0.2-final' : 'working-tree',
          enginePath: baseline ? 'src/v03/battle/engine.ts' : enginePath,
          sha256,
        },
        measurement:
          'Separate exchange samples count primary hits, counterattacks and damaging tactics. Side-turn totals are retained separately.',
        distributions: compact
          ? Object.fromEntries(
              Object.entries(distributions).map(([id, { runs: _runs, ...rest }]) => [id, rest]),
            )
          : distributions,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await server.close();
}
