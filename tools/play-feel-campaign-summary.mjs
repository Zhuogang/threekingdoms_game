#!/usr/bin/env node
// Summarizes 12-month campaign-diagnostics shards (one JSON per scenario/faction/cohort,
// as written by `--only-run`) for the play-feel Phase 3 experiments: rival activity by
// ruler trait, raids, prisoners, and how far the leading house pulls ahead.
// Usage: node tools/play-feel-campaign-summary.mjs <shardDir> [<shardDir> ...]
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function loadRuns(directory) {
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  const runs = [];
  for (const file of files) {
    const report = JSON.parse(await readFile(resolve(directory, file), 'utf8'));
    if (report.status !== 'complete') throw new Error(`${file} is ${report.status}.`);
    runs.push(...report.results);
  }
  return runs;
}

async function rulerTraits() {
  const server = await createServer({
    configFile: false,
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false },
  });
  try {
    const { createV03Game } = await server.ssrLoadModule('/src/v03/initial-state.ts');
    const { traitsOf } = await server.ssrLoadModule('/src/v03/content/traits.ts');
    const traits = {};
    for (const [scenarioId, playerId] of [
      ['divided-realm-190', 'cao'],
      ['guandu-200', 'cao'],
    ]) {
      const state = createV03Game(playerId, 1, scenarioId);
      traits[scenarioId] = Object.fromEntries(
        state.factions.map((faction) => [faction.id, traitsOf(faction.leaderOfficerId)]),
      );
    }
    return traits;
  } finally {
    await server.close();
  }
}

function summarizeRuns(runs, traits) {
  const finals = runs.map((run) => ({
    run,
    checkpoint:
      run.checkpoints[String(run.completedMonths)] ?? Object.values(run.checkpoints).at(-1),
  }));
  const groups = {};
  const group = (name) =>
    (groups[name] ??= {
      factionRuns: 0,
      dispatched: 0,
      raids: 0,
      captures: 0,
      repulses: 0,
      citiesAtEnd: 0,
      prisonersHeld: 0,
      prisonerDecisions: {},
    });
  let dispatched = 0,
    captures = 0,
    repulses = 0,
    raids = 0;
  const leaderCities = [];
  for (const { run, checkpoint } of finals) {
    const rival = checkpoint.rivalCampaigns;
    dispatched += rival.dispatched;
    captures += rival.outcomes.capture;
    repulses += rival.outcomes.repulse;
    raids += rival.raw.filter((entry) => entry.intent === 'raid').length;
    const ownership = checkpoint.factionOwnership.factions;
    leaderCities.push(Math.max(...ownership.map((faction) => faction.ownedCities)));
    for (const faction of ownership) {
      if (faction.factionId === run.factionId) continue;
      const factionTraits = traits[run.scenarioId]?.[faction.factionId] ?? [];
      const names = factionTraits.filter((trait) => trait !== 'loyal');
      for (const name of names.length ? names : ['neutral']) {
        const entry = group(name);
        const activity = rival.byFaction.find((row) => row.factionId === faction.factionId);
        entry.factionRuns++;
        entry.dispatched += activity?.dispatched ?? 0;
        entry.raids +=
          activity?.raids ??
          rival.raw.filter((row) => row.factionId === faction.factionId && row.intent === 'raid')
            .length;
        entry.captures += activity?.capture ?? 0;
        entry.repulses += activity?.repulse ?? 0;
        entry.citiesAtEnd += faction.ownedCities;
        entry.prisonersHeld += checkpoint.prisoners?.held?.[faction.factionId] ?? 0;
        for (const [action, count] of Object.entries(
          checkpoint.prisoners?.decisions?.[faction.factionId] ?? {},
        ))
          entry.prisonerDecisions[action] = (entry.prisonerDecisions[action] ?? 0) + count;
      }
    }
  }
  for (const entry of Object.values(groups)) {
    entry.dispatchesPerFactionYear = Number((entry.dispatched / entry.factionRuns).toFixed(2));
    entry.raidsPerFactionYear = Number((entry.raids / entry.factionRuns).toFixed(2));
    entry.meanCitiesAtEnd = Number((entry.citiesAtEnd / entry.factionRuns).toFixed(2));
  }
  return {
    runs: runs.length,
    selectedEliminations: finals.filter(({ checkpoint }) => checkpoint.playerEliminated).length,
    selectedCities: Object.fromEntries(
      finals.map(({ run, checkpoint }) => [
        `${run.scenarioId}/${run.factionId}/${run.cohort}`,
        checkpoint.ownedCities,
      ]),
    ),
    npc: { dispatched, captures, repulses, raids },
    leaderCities: {
      median: median(leaderCities),
      max: Math.max(...leaderCities),
      min: Math.min(...leaderCities),
    },
    byRulerTrait: groups,
  };
}

const directories = process.argv.slice(2);
if (!directories.length) throw new Error('Pass one or more shard directories.');
const traits = await rulerTraits();
const summaries = {};
for (const directory of directories)
  summaries[directory] = summarizeRuns(await loadRuns(directory), traits);
console.log(JSON.stringify(summaries, null, 2));
