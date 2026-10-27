#!/usr/bin/env node
/** R5: controlled roster workflows plus unchanged-opening, fixed-seed campaign replays. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { executeNextAdjacentCampaignOrder } from './v03-campaign-bot.mjs';

const directory = process.argv[2] ?? 'docs/v0.3/evidence/officer-roster-review-2026-10-26';
const reportPath = `${directory}/integration-matrix.json`;
const reportFormat = { ...(await resolveConfig(reportPath)), parser: 'json' };
const days = 90;
const started = performance.now();
try {
  // Bundle one module graph so cyclic engine/command imports share a single instance.
  const modules = {
    flows: 'tests/v03/helpers/roster-regression.ts',
    initial: 'src/v03/initial-state.ts',
    commands: 'src/v03/commands.ts',
    storage: 'src/v03/platform/storage.ts',
    battleEngine: 'src/v03/battle/engine.ts',
    geography: 'src/v03/geography/index.ts',
    catalog: 'src/v03/content/officer-catalog.ts',
    cityActions: 'src/v03/governance/city-actions.ts',
  };
  await mkdir('.artifacts', { recursive: true });
  const runtime = resolve('.artifacts/r5-runtime.mjs');
  await build({
    stdin: {
      contents: Object.entries(modules)
        .map(([name, path]) => `export * as ${name} from './${path}';`)
        .join('\n'),
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: runtime,
  });
  const { flows, initial, commands, storage, battleEngine, geography, catalog, cityActions } =
    await import(pathToFileURL(runtime).href);
  const report = {
    phase: 'R5-review',
    status: 'running',
    generatedAt: new Date().toISOString(),
    methodology: {
      controlled:
        '12 actual scenario/player-faction combinations × 3 casualty outcomes, with contemporary new identities, controlled resources and adjacent defenders, shortened route segments, real commands and save validation at every stage. Two controlled year-end snapshots × two seeds per combination; skipped days are not simulated.',
      natural:
        '24 unchanged-opening campaigns × 90 days. Two fixed seeds per combination, real routes, resources, NPC autonomy and tactical AI. Player policy searches and assigns affordable typed reserves in its capital, then uses the existing adjacent-city campaign bot. Every step is saved, decoded and compared.',
      limitations:
        'Implementation regression, not campaign balance acceptance or human playtesting. Controlled recruitment relocates an existing contemporary new officer; natural replays retain historical placement. No save migration.',
    },
    controlledFlows: [],
    annualBoundaries: [],
    naturalReplays: [],
    sourceHashes: {},
  };
  const persist = async () => {
    report.wallClockMs = Math.round(performance.now() - started);
    await mkdir(directory, { recursive: true });
    await writeFile(reportPath, await format(JSON.stringify(report), reportFormat));
  };
  for (const { scenarioId, factionId } of flows.ROSTER_MATRIX) {
    for (const mode of flows.FLOW_MODES)
      report.controlledFlows.push(flows.runRosterFlow(scenarioId, factionId, mode));
    for (const seed of [19, 971])
      report.annualBoundaries.push(flows.runRosterYearBoundary(scenarioId, factionId, seed));
    console.log(`Controlled ${scenarioId}/${factionId}: 3 flows, 2 chronology seeds passed`);
  }
  await persist();
  const newIds = new Set(
    catalog.OFFICER_CATALOG.filter((entry) => entry.isNew).map((entry) => entry.id),
  );
  for (const [index, { scenarioId, factionId }] of flows.ROSTER_MATRIX.entries()) {
    for (const seed of [610301 + index, 970301 + index]) {
      let state = initial.createV03Game(factionId, seed, scenarioId);
      const initiallyFree = new Set(
        state.officers
          .filter((entry) => entry.factionId === null && newIds.has(entry.id))
          .map((entry) => entry.id),
      );
      const recruited = new Set(),
        armed = new Set(),
        marched = new Set();
      let steps = 0,
        saveChecks = 0,
        searches = 0,
        assignments = 0;
      const check = (stage) => {
        if (!storage.validateV03State(state))
          writeFileSync('.artifacts/r5-invalid-state.json', JSON.stringify(state, null, 2));
        assert(
          storage.validateV03State(state),
          `${scenarioId}/${factionId}/${seed} invalid ${stage} day ${state.absoluteDay}`,
        );
        const loaded = storage.decodeV03Save(storage.encodeV03Save(state));
        assert.deepEqual(loaded, state);
        state = loaded;
        saveChecks++;
        for (const officer of state.officers) {
          if (!newIds.has(officer.id)) continue;
          if (initiallyFree.has(officer.id) && officer.factionId !== null)
            recruited.add(officer.id);
          if (officer.troops > 0) armed.add(officer.id);
          if (officer.location.kind === 'journey' || officer.location.kind === 'battle')
            marched.add(officer.id);
        }
      };
      check('opening');
      while (state.absoluteDay < days && state.phase !== 'finished') {
        for (const event of state.events.filter(
          (entry) => !entry.acknowledged && entry.absoluteDay <= state.absoluteDay,
        )) {
          const result = commands.executeV03Command(state, {
            type: 'acknowledgeEvent',
            eventId: event.id,
          });
          assert(result.ok, result.error);
          state = result.state;
        }
        if (state.phase === 'planning') {
          const cityId = state.playerCapitalCityId;
          const search = { cityId, action: 'search' };
          if (cityActions.getV03CityActionAvailability(state, search).ok) {
            const result = commands.executeV03Command(state, { type: 'cityAction', ...search });
            assert(result.ok, result.error);
            state = result.state;
            searches++;
          }
          const city = state.cities.find((entry) => entry.id === cityId);
          const zero = state.officers
            .filter(
              (entry) =>
                entry.alive &&
                entry.factionId === factionId &&
                entry.troops + entry.wounded === 0 &&
                entry.reorganizationDays === 0 &&
                entry.location.kind === 'city' &&
                entry.location.cityId === cityId,
            )
            .sort(
              (a, b) => b.force + b.intellect - a.force - a.intellect || a.id.localeCompare(b.id),
            );
          for (const officer of zero) {
            const amount = Math.min(500, city.reservePools[officer.troopType].troops);
            if (amount < 100) continue;
            const input = { cityId, action: 'assign-troops', officerId: officer.id, amount };
            if (!cityActions.getV03CityActionAvailability(state, input).ok) continue;
            const result = commands.executeV03Command(state, { type: 'cityAction', ...input });
            assert(result.ok, result.error);
            state = result.state;
            assignments++;
          }
          state = executeNextAdjacentCampaignOrder(
            state,
            geography.ROUTE_DEFINITIONS,
            commands.executeV03Command,
          ).state;
          check('orders');
        }
        const before = state.absoluteDay;
        const playerBattles = state.battles.filter(
          (entry) =>
            entry.active &&
            (entry.attackerFactionId === factionId || entry.defenderFactionId === factionId),
        );
        for (const entry of playerBattles) {
          const side = entry.attackerFactionId === factionId ? 'attacker' : 'defender';
          entry.battleData = battleEngine.runBattleAiTurn(entry.battleData, side);
          entry.attackerFood = entry.battleData.supplies.attacker;
          entry.defenderFood = entry.battleData.supplies.defender;
        }
        if (playerBattles.length) {
          for (const entry of playerBattles) {
            const result = commands.executeV03Command(state, {
              type: 'completeBattleDay',
              battleId: entry.id,
            });
            assert(result.ok, result.error);
            state = result.state;
          }
        } else {
          const result = commands.executeV03Command(state, { type: 'advance', days: 1 });
          assert(result.ok, result.error);
          state = result.state;
        }
        check('day/battle');
        assert(
          state.absoluteDay > before ||
            state.events.some((entry) => !entry.acknowledged) ||
            state.dayResolution,
          `${scenarioId}/${factionId} stalled day ${before}`,
        );
        assert(++steps < days * 10, 'Replay exceeded step limit');
      }
      report.naturalReplays.push({
        scenarioId,
        factionId,
        seed,
        completedDay: state.absoluteDay,
        phase: state.phase,
        steps,
        saveChecks,
        searches,
        assignments,
        newRecruitedIds: [...recruited].sort(),
        newArmedIds: [...armed].sort(),
        newMarchedIds: [...marched].sort(),
        battles: state.battles.length,
        finalRosterCount: state.officers.length,
      });
      await persist();
      console.log(
        `Replay ${scenarioId}/${factionId}/${seed}: day ${state.absoluteDay}, ${saveChecks} saves, ${recruited.size} new recruits, ${marched.size} new commanders marched`,
      );
    }
  }
  const sourcePaths = [
    'tests/v03/helpers/roster-regression.ts',
    'tests/v03/officer-expansion.regression.test.ts',
    'tools/v03-roster-regression.mjs',
    'tools/v03-campaign-bot.mjs',
    'src/v03/engine.ts',
    'src/v03/commands.ts',
    'src/v03/initial-state.ts',
    'src/v03/platform/storage.ts',
    'src/v03/campaign/battle-aftermath.ts',
    'src/v03/campaign/prisoners.ts',
    'src/v03/campaign/personnel.ts',
    'src/v03/campaign/personnel-recovery.ts',
    'src/v03/campaign/officer-lifecycle.ts',
    'src/v03/governance/city-actions.ts',
    'src/v03/governance/autonomy.ts',
    'src/v03/battle/engine.ts',
    'src/v03/calendar/day-resolution.ts',
  ];
  for (const path of sourcePaths)
    report.sourceHashes[path] = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
  report.status = 'complete';
  await persist();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
