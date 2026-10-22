#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { aggregateResults, summarize } from './v03-campaign-diagnostics-helpers.mjs';
import { executeNextAdjacentCampaignOrder } from './v03-campaign-bot.mjs';

const ROOT = process.cwd();
const DEFAULT_OUTPUT = 'docs/v0.3/evidence/v03-campaign-bot-diagnostics-96m.json';
const FACTION_IDS = ['cao', 'liu', 'sun', 'yuan', 'dong', 'yan', 'ma'];
const SCENARIO_IDS = ['divided-realm-190', 'guandu-200'];
const RUNS = [
  { cohort: 'development', seedBase: 610301 },
  { cohort: 'held-out', seedBase: 970301 },
];
const SOURCE_FILES = [
  'src/v03/engine.ts',
  'src/v03/commands.ts',
  'src/v03/initial-state.ts',
  'src/v03/strategic-ai.ts',
  'src/v03/calendar/index.ts',
  'src/v03/calendar/day-resolution.ts',
  'src/v03/battle/engine.ts',
  'src/v03/battle/maps.ts',
  'src/v03/geography/index.ts',
  'src/v03/governance/autonomy.ts',
  'src/v03/governance/city-actions.ts',
  'src/v03/governance/appointments.ts',
  'src/v03/governance/authority.ts',
  'src/v03/governance/orders.ts',
  'src/v03/governance/services.ts',
  'src/v03/campaign/monthly-systems.ts',
  'tools/v03-campaign-bot.mjs',
  'tools/v03-campaign-diagnostics.mjs',
  'tools/v03-campaign-diagnostics-helpers.mjs',
];

function optionsFromArgs(args) {
  const options = {
    months: 96,
    scenarios: [...SCENARIO_IDS],
    factions: [...FACTION_IDS],
    output: DEFAULT_OUTPUT,
    quick: false,
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--quick') options.quick = true;
    else if (arg === '--months') options.months = Number(args[++index]);
    else if (arg === '--scenario') options.scenarios = [args[++index]];
    else if (arg === '--factions') options.factions = args[++index].split(',');
    else if (arg === '--output') options.output = args[++index];
    else if (arg === '--help') {
      console.log(
        'Usage: node tools/v03-campaign-diagnostics.mjs [--months 96] [--scenario divided-realm-190|guandu-200] [--factions cao,liu,sun,yuan,dong,yan,ma] [--output path] [--quick]',
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (options.quick) {
    options.months = 1;
    options.scenarios = [SCENARIO_IDS[0]];
    options.factions = [FACTION_IDS[0]];
  }
  if (!Number.isInteger(options.months) || options.months < 1 || options.months > 120)
    throw new Error('--months must be an integer from 1 to 120.');
  for (const scenario of options.scenarios)
    if (!SCENARIO_IDS.includes(scenario)) throw new Error(`Unknown scenario: ${scenario}`);
  for (const faction of options.factions)
    if (!FACTION_IDS.includes(faction)) throw new Error(`Unknown faction: ${faction}`);
  return options;
}

function hashBuffers(parts) {
  const hash = createHash('sha256');
  for (const [name, data] of parts) {
    hash.update(name);
    hash.update('\0');
    hash.update(data);
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function fingerprint(files) {
  const content = await Promise.all(
    files.map(async (file) => [file, await readFile(resolve(ROOT, file))]),
  );
  return hashBuffers(content);
}

async function main() {
  const options = optionsFromArgs(process.argv.slice(2));
  const sourceFingerprint = await fingerprint(SOURCE_FILES);
  const configFingerprint = await fingerprint([
    'src/content/scenario.ts',
    'src/content/guandu.ts',
    'src/v03/geography/index.ts',
    'src/v03/battle/maps.ts',
    'src/v03/calendar/index.ts',
  ]);
  const server = await createServer({
    configFile: false,
    root: ROOT,
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
  });
  const startedAt = performance.now();
  try {
    const [
      { createV03Game },
      { executeV03Command },
      { runBattleAiTurn },
      { scenarioById },
      { ROUTE_DEFINITIONS },
    ] = await Promise.all([
      server.ssrLoadModule('/src/v03/initial-state.ts'),
      server.ssrLoadModule('/src/v03/commands.ts'),
      server.ssrLoadModule('/src/v03/battle/engine.ts'),
      server.ssrLoadModule('/src/content/scenario.ts'),
      server.ssrLoadModule('/src/v03/geography/index.ts'),
    ]);
    const checkpoints = [...new Set([Math.min(48, options.months), options.months])];
    const results = [];
    const unavailableFactions = {};
    const outputPath = resolve(ROOT, options.output);
    const saveReport = async (complete = false) => {
      const output = {
        generatedAt: new Date().toISOString(),
        status: complete ? 'complete' : 'running',
        command: process.argv.slice(2),
        nodeVersion: process.version,
        wallClockMs: Math.round(performance.now() - startedAt),
        model: {
          description:
            'Deterministic in-memory adjacent-city campaign bot. It attacks one adjacent enemy city at a time per campaign day using campaign commands, preserves the protected source garrison, accepts a command-proposed reduced force when executable, and drives its side in battles with the deterministic tactical AI.',
          policy: 'deterministic-adjacent-campaign-bot-v1',
          decisionRules: [
            'Select directly connected cities owned by a non-allied, non-eliminated enemy faction or independent cities; skip targets with active campaigns or battles.',
            'Rank available attacks by defender-to-dispatched-force ratio, then nominal route days, source city ID, and target city ID.',
            'Retain the existing 35%/1,000 protected source garrison rule and ten-officer campaign party cap.',
            'Issue and answer campaign directives through executeV03Command; command route, alliance, food, officer, and resource checks remain authoritative.',
            'Acknowledge due events before policy actions. Resolve the selected faction’s tactical turns with the deterministic battle AI and submit battle-day completion through the command boundary.',
          ],
          metricDefinitions: {
            battleDuration:
              'Tactical battle day number at the checkpoint; raw per-battle values are retained.',
            closeBattle:
              'Resolved battle with an absolute surviving-troop difference no greater than 10% of combined initial troops.',
            relativeStrength:
              'Initial attacker/defender troop counts and ratio; weaker-side wins are counted separately.',
            longDistance:
              'Campaign route is multi-leg when the route snapshot includes an intermediate city; raw nominal route kilometres are retained.',
            governorIdle:
              'Count only autonomous cities whose workMonthIndex matches the latest completed month; unobserved cities are kept separate.',
            npcCampaigns:
              'Counts engine-created rival campaign journeys; capture, repulse, draw, and unresolved outcomes are separate.',
          },
          victoryDefinitions: {
            trueUnification: 'Every campaign city is controlled by the selected faction.',
            hegemon:
              'The engine declares victory after one faction controls Luoyang and at least 16 cities for 12 consecutive month boundaries, when no battle remains active. Reported separately from true city unification.',
          },
          limitations: [
            'This is a narrow heuristic policy, not a human-like strategic agent: it does not prioritize economy, diplomacy, defense, raids/sacks, governance actions, long-term supply planning, or multi-front coordination.',
            'It considers only direct adjacent enemy or independent cities and uses a simple force-to-garrison ratio with nominal route time. Tactical battle outcomes are AI-driven, not human-play results.',
            'It is an implementation diagnostic, not by itself a balance acceptance run; its policy biases the selected faction toward expansion and affects outcome distributions.',
            'True unification, Hegemon claim/streak/win, player elimination, and the state winner are reported as distinct outcomes; this diagnostic does not establish feature completeness or gameplay quality.',
            'It does not replace human campaign/battle playtests or a real low-end-device check.',
          ],
        },
        matrix: {
          scenarios: options.scenarios,
          factions: options.factions,
          unavailableFactions,
          cohorts: RUNS.map(({ cohort }) => cohort),
          months: options.months,
          campaignCount: results.length,
        },
        fingerprints: {
          sourceFiles: SOURCE_FILES,
          sourceSha256: sourceFingerprint,
          configFiles: [
            'src/content/scenario.ts',
            'src/content/guandu.ts',
            'src/v03/geography/index.ts',
            'src/v03/battle/maps.ts',
            'src/v03/calendar/index.ts',
          ],
          configSha256: configFingerprint,
        },
        aggregate: aggregateResults(results),
        results,
      };
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
    };
    for (const scenarioId of options.scenarios) {
      const scenario = scenarioById(scenarioId);
      if (!scenario) throw new Error(`Scenario disappeared during diagnostics: ${scenarioId}`);
      const availableFactionIds = scenario.factions.map((faction) => faction.id);
      unavailableFactions[scenarioId] = options.factions.filter(
        (factionId) => !availableFactionIds.includes(factionId),
      );
      const eligibleFactions = options.factions.filter((factionId) =>
        availableFactionIds.includes(factionId),
      );
      for (let factionIndex = 0; factionIndex < eligibleFactions.length; factionIndex++) {
        const factionId = eligibleFactions[factionIndex];
        for (const cohort of RUNS) {
          let state = createV03Game(factionId, cohort.seedBase + factionIndex, scenarioId);
          const initialIndependentCityIds = state.cities
            .filter((city) => city.factionId === null)
            .map((city) => city.id);
          const months = {};
          const bot = {
            campaignCandidatesTried: 0,
            campaignCommandsRejected: 0,
            campaignsDispatched: 0,
            campaignsReducedAndDispatched: 0,
            campaignsCancelledAfterShortfall: 0,
            tacticalBattleDays: 0,
          };
          const targetDays = options.months * 30;
          let steps = 0;
          while (state.absoluteDay < targetDays && state.phase !== 'finished') {
            for (const event of state.events.filter(
              (entry) => !entry.acknowledged && entry.absoluteDay <= state.absoluteDay,
            )) {
              const acknowledged = executeV03Command(state, {
                type: 'acknowledgeEvent',
                eventId: event.id,
              });
              if (!acknowledged.ok)
                throw new Error(
                  `${scenarioId}/${factionId}: failed to acknowledge event ${event.id}.`,
                );
              state = acknowledged.state;
            }

            if (state.phase === 'planning') {
              const action = executeNextAdjacentCampaignOrder(
                state,
                ROUTE_DEFINITIONS,
                executeV03Command,
              );
              state = action.state;
              bot.campaignCandidatesTried += action.candidatesTried;
              bot.campaignCommandsRejected += action.commandsRejected;
              bot.campaignsDispatched += Number(action.dispatched);
              bot.campaignsReducedAndDispatched += Number(action.reducedAndDispatched);
              bot.campaignsCancelledAfterShortfall += action.cancelledAfterShortfall;
            }

            const playerBattles = state.battles.filter(
              (battle) =>
                battle.active &&
                (battle.attackerFactionId === factionId || battle.defenderFactionId === factionId),
            );
            const battleIds = playerBattles.map((battle) => battle.id);
            for (const battle of playerBattles) {
              const side = battle.attackerFactionId === factionId ? 'attacker' : 'defender';
              const tactical = runBattleAiTurn(battle.battleData, side);
              battle.battleData = tactical;
              battle.attackerFood = tactical.supplies.attacker;
              battle.defenderFood = tactical.supplies.defender;
              bot.tacticalBattleDays++;
            }
            if (battleIds.length > 0) {
              for (const battleId of battleIds) {
                const completed = executeV03Command(state, { type: 'completeBattleDay', battleId });
                if (!completed.ok)
                  throw new Error(
                    `${scenarioId}/${factionId}: battle day completion failed: ${completed.error}`,
                  );
                state = completed.state;
              }
            } else {
              const advanced = executeV03Command(state, { type: 'advance', days: 1 });
              if (!advanced.ok) throw new Error(`${scenarioId}/${factionId}: ${advanced.error}`);
              if (advanced.state.absoluteDay === state.absoluteDay) {
                const pending = advanced.state.events.filter(
                  (event) => !event.acknowledged && event.absoluteDay <= advanced.state.absoluteDay,
                );
                if (!pending.length) {
                  const dueJourneys = advanced.state.journeys
                    .filter(
                      (journey) =>
                        (journey.status === 'outbound' || journey.status === 'returning') &&
                        journey.expectedArrivalDay <= advanced.state.absoluteDay,
                    )
                    .map(
                      (journey) =>
                        `${journey.id}:${journey.kind}:${journey.status}:${journey.sourceCityId}->${journey.destinationCityId}:${journey.elapsedDays}/${journey.expectedArrivalDay - journey.departedAbsoluteDay}:progress=${journey.segmentProgressKm.map((value, index) => `${value.toFixed(3)}/${journey.routeSnapshot[index]?.lengthKm}`).join('|')}`,
                    );
                  throw new Error(
                    `${scenarioId}/${factionId} stalled on day ${state.absoluteDay} without a pending event (command event=${advanced.orderId ?? 'none'}, phase=${advanced.state.phase}, activeBattles=${advanced.state.battles.filter((battle) => battle.active).length}, dayCursor=${advanced.state.dayResolution?.phase ?? 'none'}, dueJourneys=${dueJourneys.join(',') || 'none'}).`,
                  );
                }
              }
              state = advanced.state;
            }
            steps++;
            const month = Math.floor(state.absoluteDay / 30);
            if (checkpoints.includes(month) && !months[month])
              months[month] = summarize(state, factionId, month, initialIndependentCityIds);
            if (steps > targetDays * 10)
              throw new Error(
                `${scenarioId}/${factionId} exceeded the daily progress safety limit.`,
              );
          }
          const finalMonth = Math.min(options.months, Math.floor(state.absoluteDay / 30));
          if (!months[finalMonth])
            months[finalMonth] = summarize(state, factionId, finalMonth, initialIndependentCityIds);
          results.push({
            scenarioId,
            factionId,
            cohort: cohort.cohort,
            seed: cohort.seedBase + factionIndex,
            requestedMonths: options.months,
            completedMonths: Math.floor(state.absoluteDay / 30),
            stoppedEarly: state.phase === 'finished',
            finalPhase: state.phase,
            bot,
            checkpoints: months,
          });
          console.log(
            `${scenarioId} ${factionId} ${cohort.cohort}: ${Math.floor(state.absoluteDay / 30)} months, ${state.battles.length} battles, ${state.phase}`,
          );
          await saveReport();
        }
      }
    }
    await saveReport(true);
    console.log(`Wrote ${outputPath}`);
  } finally {
    await server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exitCode = 1;
  });
}
