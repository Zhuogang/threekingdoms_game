import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { cpus, platform, release } from 'node:os';
import { simulationFingerprint } from './simulation-fingerprint.mjs';

const [
  runtime = '.',
  cohort = 'development',
  outputArg = `.artifacts/v04/tactical-${cohort}.json`,
  onlyCase,
] = process.argv.slice(2);
if (!['development', 'heldout'].includes(cohort)) throw new Error('Use development or heldout.');
const root = resolve(runtime),
  output = resolve(outputArg);
const seeds = cohort === 'development' ? [17, 31] : [101, 137];
const roster = (
  prefix,
  types = ['infantry', 'archer', 'cavalry'],
  troops = 1003,
  force = 70,
  intellect = 65,
) =>
  types.map((troopType, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    troopType,
    troops,
    force,
    intellect,
    troopExperience: [0, 600, 1200][index % 3],
  }));
const fixtures = [
  { id: 'mixed-experience', a: roster('a'), b: roster('b') },
  {
    id: 'high-intellect',
    a: roster('a', ['archer', 'infantry', 'archer'], 1003, 65, 100),
    b: roster('b', undefined, 1003, 80, 55),
  },
  { id: 'wounded-heavy', a: roster('a'), b: roster('b'), wounded: 400 },
  {
    id: 'cavalry-heavy',
    a: roster('a', ['cavalry', 'cavalry', 'cavalry']),
    b: roster('b', ['infantry', 'archer', 'archer']),
  },
  { id: 'low-supply', a: roster('a', undefined, 1003, 70, 95), b: roster('b'), supplyDays: 2 },
  {
    id: 'threatened-shooters',
    a: roster('a', ['archer', 'archer', 'infantry']),
    b: roster('b', ['cavalry', 'infantry', 'infantry']),
    contact: true,
  },
  { id: 'narrow-passage', a: roster('a'), b: roster('b'), choke: true },
  { id: 'river-crossing', a: roster('a'), b: roster('b'), canvas: 'bf03-yellow-river-ford' },
  {
    id: 'water-origin',
    a: roster('a', ['archer']),
    b: roster('b', ['infantry']),
    contact: true,
    water: 'a',
  },
  {
    id: 'water-target',
    a: roster('a', ['archer']),
    b: roster('b', ['infantry']),
    contact: true,
    water: 'b',
  },
].filter((fixture) => !onlyCase || fixture.id === onlyCase);
if (!fixtures.length) throw new Error(`Unknown fixture ${onlyCase}`);
const configuration = {
  cohort,
  seeds,
  fixtures,
  swapArmies: [false, true],
  controlSeats: ['attacker', 'defender'],
  warmupSeeds: [1, 2],
  runnerSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
  description:
    'Both armies use the runtime policy; each fixture swaps armies and control seat. Actual campaign ration charging follows each tactical day. Synthetic contact/choke/water fixtures are labelled; river-crossing uses the unchanged canvas map. Field retention excludes later capture and return settlement.',
  instrumentation:
    'A Vite-only transform exposes the existing ration charger and observes cloned pre-action states. Every measured day is rerun with observation, and the complete result including RNG must match. Timing uses the observer-disabled execution; existing performance gates remain separate.',
  metrics: {
    dominatedFire:
      'A Fire cast has a legal ordinary hit on the same target with no forecast counterattack and damage at least the maximum Fire forecast. Excludes an Inspired source because conserving its pending bonus may have value.',
    wastedSupport:
      'Rally on an already-inspired, full-morale target; Confuse on an already-confused target; or a zero-transfer supply raid. These are narrow proven-no-gain checks, not all strategic waste.',
    retaliation:
      'Sum of the shared ordinary-hit forecasts at actual primary attack decisions; distinct from actual casualties.',
    idle: 'An unresolved day without an attack or tactic. Stalled also has no movement and no confusion activation. Ending-only rout/retreat checks are excluded. These counts do not prove every hold was mistaken.',
    unnecessaryExposure: {
      status: 'not-attributable',
      reason:
        'No independent counterfactual search measures every equally useful safer move. Retaliation forecasts and controlled preservation fixtures are reported instead; missing exposure is not zero.',
    },
  },
};
const fingerprints = await simulationFingerprint(root, configuration);
const observerKey = '__v04TacticalComparisonObserver';
function insertObservation(code, name, anchor, action) {
  const start = code.indexOf(`function ${name}(`);
  if (start < 0) return { code, found: false };
  const end = code.indexOf('\n}', start) + 2;
  const body = code.slice(start, end);
  if (!body.includes(anchor)) throw new Error(`Observer anchor missing in ${name}`);
  const call = `globalThis.${observerKey}?.(structuredClone(state), { action: ${action}, sourceId: source.id, targetId: target.id });\n  `;
  return {
    code: code.slice(0, start) + body.replace(anchor, call + anchor) + code.slice(end),
    found: true,
  };
}
const server = await createServer({
  root,
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, ws: false },
  plugins: [
    {
      name: 'v04-observe-actual-tactical-actions',
      enforce: 'pre',
      transform(code, id) {
        if (
          id.endsWith('/src/v03/engine.ts') &&
          !code.includes('export function chargeBattleRations(')
        )
          return `${code}\nexport { chargeBattleRations };\n`;
        if (!id.endsWith('/src/v03/battle/engine.ts')) return null;
        let result = insertObservation(
          code,
          'performTactic',
          'state.tacticPoints[source.side] -= tacticCost(source, tactic);',
          'tactic',
        );
        if (!result.found) throw new Error('No tactic executor to observe.');
        result = insertObservation(
          result.code,
          'performAttack',
          'source.acted = true;',
          "'attack'",
        );
        if (!result.found) throw new Error('No ordinary executor to observe.');
        result = insertObservation(
          result.code,
          'performAttackForSide',
          'source.acted = true;',
          "'attack'",
        );
        return result.code;
      },
    },
  ],
});
const results = [],
  times = [];
const percentile = (values, p) =>
  values.length ? values.slice().sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;
try {
  const engine = await server.ssrLoadModule('/src/v03/battle/index.ts');
  const { chargeBattleRations } = await server.ssrLoadModule('/src/v03/engine.ts');
  const { PILOT_LOGISTICS_RATES } = await server.ssrLoadModule('/src/v03/calendar/index.ts');
  function create(fixture, seed, swapped, playerSide) {
    const map = fixture.canvas
      ? engine.createCanvasBattleMap(fixture.canvas, { seed })
      : engine.createBattleMap({ regionId: 'xiapi', seed });
    if (!fixture.canvas) map.terrain.fill('plain');
    if (fixture.choke)
      for (let y = 0; y < map.height; y++)
        if (y !== 9) map.terrain[y * map.width + (swapped ? map.width - 13 : 12)] = 'cliff';
    const data = engine.createTacticalBattle({
      id: `${fixture.id}-${seed}-${swapped}-${playerSide}`,
      map,
      seed,
      playerSide,
      dayLimit: 30,
      attackerUnits: swapped ? fixture.b : fixture.a,
      defenderUnits: swapped ? fixture.a : fixture.b,
    });
    for (const unit of data.units) {
      const army = unit.id[0],
        index = Number(unit.id.split('-')[1]);
      if (fixture.wounded && army === 'a') {
        unit.troops -= fixture.wounded;
        unit.wounded = fixture.wounded;
      }
      if (fixture.contact || fixture.choke) {
        const x = army === 'a' ? 8 : fixture.choke ? 16 : 10;
        unit.x = swapped ? map.width - 1 - x : x;
        unit.y = 8 + index * 2;
        if (fixture.choke) unit.y = 8 + index;
      }
      if (fixture.water === army) data.map.terrain[unit.y * map.width + unit.x] = 'water';
    }
    data.retreatAllowed = { attacker: true, defender: true };
    for (const side of ['attacker', 'defender']) {
      const mouths = data.units
        .filter((unit) => unit.side === side)
        .reduce(
          (sum, unit) =>
            sum + (unit.troops + unit.wounded) * (unit.troopType === 'cavalry' ? 2 : 1),
          0,
        );
      data.supplies[side] = Math.ceil(
        mouths * PILOT_LOGISTICS_RATES.battleFoodPerTroopDay * (fixture.supplyDays ?? 30),
      );
    }
    return {
      battleData: data,
      lastRationDay: -1,
      attackerFood: data.supplies.attacker,
      defenderFood: data.supplies.defender,
      attackerFoodRemainderMicro: 250000,
      defenderFoodRemainderMicro: 250000,
      foodShortfallDays: 0,
    };
  }
  function advance(wrapper, day) {
    const fractions = {
      attacker: wrapper.attackerFoodRemainderMicro,
      defender: wrapper.defenderFoodRemainderMicro,
    };
    wrapper.battleData = engine.advanceBattleDay(
      engine.runBattleAiTurn(wrapper.battleData, wrapper.battleData.playerSide, fractions),
      fractions,
    );
    chargeBattleRations(wrapper, day);
  }
  function run(fixture, seed, swapped, playerSide, measure) {
    let wrapper = create(fixture, seed, swapped, playerSide),
      elapsedDays = 0;
    const opening = structuredClone(wrapper.battleData.units);
    const metrics = {
      primaryActions: 0,
      tacticPointsSpent: 0,
      dominatedFire: 0,
      wastedSupport: 0,
      forecastRetaliation: 0,
      moves: 0,
      holds: 0,
      confusedActivations: 0,
      idleDays: 0,
      stalledDays: 0,
      tactics: {},
    };
    const samples = [];
    while (!wrapper.battleData.outcome && elapsedDays < 30) {
      const prior = structuredClone(wrapper),
        logLength = wrapper.battleData.logEntries.length;
      const started = performance.now();
      advance(wrapper, elapsedDays);
      const ms = performance.now() - started;
      if (measure) {
        times.push(ms);
        samples.push(ms);
      }
      globalThis[observerKey] = (state, action) => {
        metrics.primaryActions++;
        const source = state.units.find((unit) => unit.id === action.sourceId),
          target = state.units.find((unit) => unit.id === action.targetId);
        const normal = engine.predictBattleAttack(state, source.id, target.id);
        if (action.action === 'attack') {
          metrics.forecastRetaliation += normal?.counterattack.estimatedCasualties ?? 0;
          return;
        }
        const tactic = engine.predictBattleTactic(state, source.id, action.action, target.id);
        if (!tactic?.inRange) throw new Error('Observed tactic lacks its actual legal forecast.');
        metrics.tacticPointsSpent += engine
          .getAvailableBattleTactics(state, source.id)
          .find((entry) => entry.tactic === action.action).cost;
        if (
          action.action === 'fire' &&
          source.status !== 'inspired' &&
          normal?.inRange &&
          !normal.counterattack.possible &&
          normal.estimatedCasualties >= tactic.maxCasualties
        )
          metrics.dominatedFire++;
        if (
          (action.action === 'rally' && target.status === 'inspired' && target.morale === 100) ||
          (action.action === 'confuse' && target.status === 'confused') ||
          (action.action === 'raidSupply' && tactic.suppliesTransferred === 0)
        )
          metrics.wastedSupport++;
      };
      try {
        advance(prior, elapsedDays);
      } finally {
        delete globalThis[observerKey];
      }
      if (!isDeepStrictEqual(prior, wrapper))
        throw new Error(`Observation changed ${fixture.id}/${seed}/${elapsedDays}`);
      const logs = wrapper.battleData.logEntries.slice(logLength);
      metrics.moves += logs.filter((entry) => entry.code === 'log.move').length;
      metrics.holds += logs.filter((entry) => entry.code === 'log.wait').length;
      metrics.confusedActivations += logs.filter((entry) => entry.code === 'log.confused').length;
      if (
        !wrapper.battleData.outcome &&
        !logs.some((entry) => ['log.attack', 'log.tactic'].includes(entry.code))
      ) {
        metrics.idleDays++;
        if (!logs.some((entry) => ['log.move', 'log.confused'].includes(entry.code)))
          metrics.stalledDays++;
      }
      for (const entry of logs.filter((entry) => entry.code === 'log.tactic')) {
        const m = (metrics.tactics[entry.params.tactic] ??= {
          casts: 0,
          successes: 0,
          casualties: 0,
          moraleGain: 0,
          foodTaken: 0,
        });
        m.casts++;
        m.successes += Number(entry.params.success);
        m.casualties += entry.params.casualties;
        m.moraleGain += Math.max(0, entry.params.morale);
        m.foodTaken += entry.params.food;
      }
      elapsedDays++;
    }
    if (!wrapper.battleData.outcome) throw new Error(`Unresolved fixture ${fixture.id}`);
    const retained = (army) =>
      wrapper.battleData.units
        .filter((unit) => unit.id.startsWith(army + '-'))
        .reduce(
          (total, unit) => ({
            healthy: total.healthy + unit.troops,
            wounded: total.wounded + unit.wounded,
            healthyExperience: total.healthyExperience + unit.troops * unit.troopExperience,
          }),
          { healthy: 0, wounded: 0, healthyExperience: 0 },
        );
    return {
      case: fixture.id,
      seed,
      swapped,
      playerSide,
      outcome: wrapper.battleData.outcome,
      elapsedDays,
      a: retained('a'),
      b: retained('b'),
      opening,
      foodShortfallDays: wrapper.foodShortfallDays,
      metrics,
      timing: { p50Ms: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95), samples },
      observationParity: true,
    };
  }
  for (const fixture of fixtures) {
    for (const seed of configuration.warmupSeeds) run(fixture, seed, false, 'attacker', false);
    for (const seed of seeds)
      for (const swapped of [false, true])
        for (const playerSide of ['attacker', 'defender'])
          results.push(run(fixture, seed, swapped, playerSide, true));
    console.log(
      `${fixture.id}: ${results.filter((row) => row.case === fixture.id).length} paired runs`,
    );
  }
  const after = await simulationFingerprint(root, configuration);
  if (after.sourceSha256 !== fingerprints.sourceSha256)
    throw new Error('Source changed during comparison.');
  const aggregate = fixtures.map(({ id }) => {
    const rows = results.filter((row) => row.case === id),
      sum = (fn) => rows.reduce((total, row) => total + fn(row), 0);
    return {
      case: id,
      runs: rows.length,
      aWins: sum((row) => Number(row.outcome.winner === (row.swapped ? 'defender' : 'attacker'))),
      meanDays: sum((row) => row.elapsedDays) / rows.length,
      meanRetainedA: sum((row) => row.a.healthy) / rows.length,
      meanRetainedB: sum((row) => row.b.healthy) / rows.length,
      dominatedFire: sum((row) => row.metrics.dominatedFire),
      wastedSupport: sum((row) => row.metrics.wastedSupport),
      tacticPointsSpent: sum((row) => row.metrics.tacticPointsSpent),
      stalledDays: sum((row) => row.metrics.stalledDays),
      foodShortfallDays: sum((row) => row.foodShortfallDays),
    };
  });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        status: 'complete',
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
        aggregate,
        timing: { p50Ms: percentile(times, 0.5), p95Ms: percentile(times, 0.95) },
        results,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ output, runs: results.length, aggregate }));
} finally {
  delete globalThis[observerKey];
  await server.close();
}
