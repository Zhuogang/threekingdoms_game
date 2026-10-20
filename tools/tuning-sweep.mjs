import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Each experiment gets its own generated runner, log, summary and battle details.
// Jobs stay sequential so both timings and module-level tuning remain comparable.
const root = resolve(process.env.SWEEP_OUTPUT ?? '.artifacts/tuning');
const months = process.env.DIAGNOSTIC_MONTHS ?? '48';
const seeds = process.env.DIAGNOSTIC_SEEDS ?? '3';
const scenarios = process.env.DIAGNOSTIC_SCENARIOS ?? 'divided-realm-190,guandu-200';
const defaults = [
  { id: 'baseline', tuning: {} },
  ...[2, 4].map((radius) => ({ id: `radius-${radius}`, tuning: { holdNearCampRadius: radius } })),
  ...[1.2, 1.1].map((margin) => ({
    id: `attack-${margin}`,
    tuning: { attackMultipliers: { balanced: margin } },
  })),
  ...[0.21, 0.18, 0.15].map((damage) => ({
    id: `damage-${damage}`,
    tuning: {
      normalDamageRate: damage,
      fireDamageRate: (0.22 * damage) / 0.25,
      rockfallDamageRate: (0.18 * damage) / 0.25,
    },
  })),
  ...[
    [0.6, 0.8],
    [0.7, 0.9],
  ].map(([counter, guard]) => ({
    id: `counter-${counter}`,
    tuning: { counterRate: counter, guardCounterRate: guard },
  })),
];
const cases = process.env.SWEEP_CONFIG
  ? JSON.parse(readFileSync(process.env.SWEEP_CONFIG, 'utf8'))
  : defaults;
const selected = process.argv
  .find((arg) => arg.startsWith('--cases='))
  ?.slice(8)
  .split(',');
const experiments = cases.filter((experiment) => !selected || selected.includes(experiment.id));
if (!experiments.length) throw new Error('No tuning experiments selected.');
if (experiments.some(({ id }) => !/^[a-z0-9][a-z0-9.-]*$/.test(id)))
  throw new Error('Experiment IDs must be simple safe path segments.');
if (new Set(experiments.map(({ id }) => id)).size !== experiments.length)
  throw new Error('Experiment IDs must be unique.');
mkdirSync(root, { recursive: true });

const passes = (value, low, high, inclusiveHigh = true) =>
  typeof value === 'number' && value >= low && (inclusiveHigh ? value <= high : value < high);
function summarize(id, report) {
  const s = report.summary;
  const contested = s.byForceRatio['contested (< 1.6x)'];
  const cohorts = Object.entries(s.survival.byRating).filter(([rating]) =>
    /Approachable|Balanced/.test(rating),
  );
  const survival = Math.min(...cohorts.map(([, result]) => result.survival48Percent));
  const guards = {
    timeout: passes(s.timeoutPercent, 0, 10, false),
    campByDay3: passes(s.campRushDay3Percent, 0, 10, false),
    contestedUpsets: passes(s.contested.upsetPercent, 15, 30),
    supply: passes(s.supplyRunOutPercent, 5, 20),
    raids: passes(s.raids.raidBattlePercent, 40, 80),
    survival: passes(survival, 80, 100),
    autoResolve: passes(s.autoResolveMs.p95, 0, 50, false),
  };
  return {
    id,
    tuning: s.tuning,
    overall: {
      medianDays: s.medianBattleDays,
      closePercent: s.closeBattlePercent,
      moveOnlyPercent: s.actionMixPercent.moveOnly,
      maxActionPercent: Math.max(
        s.actionMixPercent.attack,
        s.actionMixPercent.tactic,
        s.actionMixPercent.moveOnly,
      ),
    },
    contested: {
      medianDays: contested.medianBattleDays,
      closePercent: contested.closeBattlePercent,
      moveOnlyPercent: contested.moveOnlyPercent,
      maxActionPercent: Math.max(
        contested.attackPercent,
        contested.tacticPercent,
        contested.moveOnlyPercent,
      ),
    },
    timeoutPercent: s.timeoutPercent,
    campByDay3Percent: s.campRushDay3Percent,
    contestedUpsetPercent: s.contested.upsetPercent,
    supplyPercent: s.supplyRunOutPercent,
    raidBattlePercent: s.raids.raidBattlePercent,
    minimumCohortSurvival48Percent: survival,
    autoResolveP95Ms: s.autoResolveMs.p95,
    guards,
    guardrailsPass: Object.values(guards).every(Boolean),
    // Mirrored strength/duration tests are a separate required gate, never inferred here.
    mirroredTests: 'not run by sweep',
    elapsedMs: report.metadata.elapsedMs,
    sourceSha256: report.metadata.sourceSha256,
  };
}
const rows = [];
const persist = () => {
  writeFileSync(
    join(root, 'summary.json'),
    JSON.stringify(
      { months: Number(months), seeds: Number(seeds), scenarios: scenarios.split(','), rows },
      null,
      2,
    ) + '\n',
  );
  const header =
    '| Experiment | Overall days / close / max action % | Contested days / close / max action % | Timeout % | Camp ≤3 % | Upset % | Supply % | Raids % | Survival48 min % | p95 ms | Failed guards |';
  const line = (r) =>
    `| ${r.id} | ${r.overall.medianDays} / ${r.overall.closePercent} / ${r.overall.maxActionPercent} | ${r.contested.medianDays} / ${r.contested.closePercent} / ${r.contested.maxActionPercent} | ${r.timeoutPercent} | ${r.campByDay3Percent} | ${r.contestedUpsetPercent} | ${r.supplyPercent} | ${r.raidBattlePercent} | ${r.minimumCohortSurvival48Percent} | ${r.autoResolveP95Ms.toFixed(1)} | ${
      Object.entries(r.guards)
        .filter(([, pass]) => !pass)
        .map(([guard]) => guard)
        .join(', ') || 'none'
    } |`;
  writeFileSync(
    join(root, 'summary.md'),
    `# Controlled battle tuning\n\n${months} months; ${seeds} seeds; ${scenarios}. Sequential jobs. Mirrored tests remain a separate gate.\n\n${header}\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.map(line).join('\n')}\n`,
  );
};
for (const experiment of experiments) {
  const outputDir = join(root, experiment.id);
  mkdirSync(outputDir, { recursive: true });
  const output = join(outputDir, 'bot.json');
  console.log(`Starting ${experiment.id}: ${JSON.stringify(experiment.tuning)}`);
  if (!(process.argv.includes('--resume') && existsSync(output))) {
    const result = spawnSync(
      process.execPath,
      ['tools/ai-diagnostics.mjs', '--bot', `--scenario=${scenarios}`],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          DIAGNOSTIC_OUTPUT: outputDir,
          DIAGNOSTIC_FILE: 'bot.json',
          DIAGNOSTIC_MONTHS: months,
          DIAGNOSTIC_SEEDS: seeds,
          DIAGNOSTIC_TUNING: JSON.stringify(experiment.tuning),
        },
      },
    );
    writeFileSync(join(outputDir, 'run.log'), (result.stdout ?? '') + (result.stderr ?? ''));
    if (result.status !== 0)
      throw new Error(
        `${experiment.id} failed: ${result.error?.message ?? result.stderr}; see ${outputDir}/run.log`,
      );
  }
  const report = JSON.parse(readFileSync(output, 'utf8'));
  if (
    report.months !== Number(months) ||
    report.seeds.length !== Number(seeds) ||
    report.scenarios.join(',') !== scenarios
  )
    throw new Error(`Cannot resume ${experiment.id}: measurement configuration differs.`);
  if (process.argv.includes('--resume')) {
    const requiredInputs = [
      'src/game/battle.ts',
      'src/game/campaign.ts',
      'src/game/world.ts',
      'src/game/difficulty.ts',
      'src/game/supply.ts',
      'src/content/traits.ts',
      'tools/playerBot.ts',
      'tools/playerBotStrategy.ts',
      'tools/botDiagnostics.ts',
      'tools/diagnosticMetrics.ts',
      'tools/ai-diagnostics.mjs',
      'tools/tuning-sweep.mjs',
      'package.json',
      'package-lock.json',
    ];
    if (
      report.metadata?.schemaVersion !== 3 ||
      !report.metadata.runnerSha256 ||
      !requiredInputs.every((path) => Object.hasOwn(report.metadata.sourceSha256 ?? {}, path))
    )
      throw new Error(`Cannot resume ${experiment.id}: incomplete or obsolete source provenance.`);
    const canonical = (value) =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, item]) => [key, canonical(item)]),
          )
        : value;
    const expectedSeeds = Array.from(
      { length: Number(seeds) },
      (_, index) => Number(process.env.DIAGNOSTIC_SEED_START ?? 2001) + index,
    );
    const mismatch =
      JSON.stringify(canonical(report.metadata.requestedTuning)) !==
        JSON.stringify(canonical(experiment.tuning)) ||
      report.seeds.join(',') !== expectedSeeds.join(',') ||
      report.presets.join(',') !== (process.env.DIAGNOSTIC_PRESETS ?? 'balanced') ||
      report.summary.tacticalAi !== (process.env.DIAGNOSTIC_TACTICAL_AI ?? 'v2') ||
      report.summary.botMode !== (process.env.DIAGNOSTIC_BOT ?? 'normal') ||
      report.summary.botPolicy !== (process.env.DIAGNOSTIC_BOT_POLICY ?? 'frontier') ||
      Object.entries(experiment.tuning).some(([key, value]) =>
        key === 'attackMultipliers'
          ? Object.entries(value).some(
              ([preset, multiplier]) =>
                report.summary.tuning.attackMultipliers[preset] !== multiplier,
            )
          : report.summary.tuning[key] !== value,
      ) ||
      Object.entries(report.metadata.sourceSha256).some(
        ([path, hash]) => createHash('sha256').update(readFileSync(path)).digest('hex') !== hash,
      );
    if (mismatch)
      throw new Error(
        `Cannot resume ${experiment.id}: seeds, policies, tuning or source fingerprints differ. Use a fresh output directory.`,
      );
  }
  const row = summarize(experiment.id, report);
  rows.push(row);
  persist();
  console.log(
    `Finished ${experiment.id}: overall ${JSON.stringify(row.overall)}; contested ${JSON.stringify(row.contested)}; failed guards ${
      Object.entries(row.guards)
        .filter(([, pass]) => !pass)
        .map(([key]) => key)
        .join(', ') || 'none'
    }`,
  );
}
