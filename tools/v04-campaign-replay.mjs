import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { simulationFingerprint } from './simulation-fingerprint.mjs';
import { executeCampaignProbe, CAMPAIGN_PROBE_POLICIES } from './v04-campaign-probes.mjs';

const [
  runtime = '.',
  scenario = 'divided-realm-190',
  player = 'liu',
  seedText = '970302',
  output = '.artifacts/v04/liu-replay',
  policy = 'adjacent-legacy',
] = process.argv.slice(2);
const root = resolve(runtime),
  seed = Number(seedText),
  outputRoot = resolve(output);
if (!Number.isSafeInteger(seed) || !CAMPAIGN_PROBE_POLICIES.includes(policy))
  throw new Error('Invalid seed or policy.');
const configuration = {
  scenario,
  player,
  seed,
  days: 360,
  policy,
  note:
    policy === 'adjacent-legacy'
      ? 'Exact reproduction of the existing diagnostic driver, including its omitted selected-side ration remainder. Actual campaign commands still charge real rations. No parameter tuning.'
      : 'Small scripted player policy using actual capital work, legal orders and actual battle ration remainders. Not a human-play simulation. Passive defense stays home; economy-first waits three months and requires a 1.25 troop ratio and 3000 food left; border attack attempts one ready expedition after day 30.',
  runnerSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
  driverSha256: createHash('sha256')
    .update(await readFile(new URL('./v04-campaign-probes.mjs', import.meta.url)))
    .digest('hex'),
  adjacentDriverSha256: createHash('sha256')
    .update(await readFile(new URL('./v03-campaign-bot.mjs', import.meta.url)))
    .digest('hex'),
};
const fingerprint = await simulationFingerprint(root, configuration);
const server = await createServer({
  root,
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false },
});
await mkdir(outputRoot, { recursive: true });
try {
  const { createV03Game } = await server.ssrLoadModule('/src/v03/initial-state.ts');
  const { executeV03Command } = await server.ssrLoadModule('/src/v03/commands.ts');
  const { runBattleAiTurn } = await server.ssrLoadModule('/src/v03/battle/engine.ts');
  const { ROUTE_DEFINITIONS } = await server.ssrLoadModule('/src/v03/geography/index.ts');
  const { encodeV03Save } = await server.ssrLoadModule('/src/v03/platform/storage.ts');
  const { getV03CityActionAvailability } = await server.ssrLoadModule(
    '/src/v03/governance/city-actions.ts',
  );
  const { availableReserveTroops } = await server.ssrLoadModule('/src/v03/campaign/personnel.ts');
  const { previewCampaignDirective } = await server.ssrLoadModule('/src/v03/governance/orders.ts');
  const { createV03OrderServices } = await server.ssrLoadModule('/src/v03/governance/services.ts');
  const api = {
    executeV03Command,
    ROUTE_DEFINITIONS,
    getV03CityActionAvailability,
    availableReserveTroops,
    previewCampaignDirective,
    services: createV03OrderServices(),
  };
  const events = [],
    snapshots = new Set(),
    battleStarts = new Set(),
    resolutions = new Set();
  let state = createV03Game(player, seed, scenario),
    steps = 0;
  let ownership = new Map(state.cities.map((city) => [city.id, city.factionId]));
  const snapshot = async (name) => {
    if (snapshots.has(name)) return;
    snapshots.add(name);
    await writeFile(join(outputRoot, `${name}.json`), encodeV03Save(state));
  };
  const retained = (battle, side) =>
    battle.battleData.units
      .filter((unit) => unit.side === side)
      .reduce(
        (total, unit) => ({
          healthy: total.healthy + unit.troops,
          wounded: total.wounded + unit.wounded,
        }),
        { healthy: 0, wounded: 0 },
      );
  const record = async () => {
    for (const city of state.cities)
      if (city.factionId !== ownership.get(city.id)) {
        events.push({
          day: state.absoluteDay,
          kind: 'ownership',
          city: city.id,
          from: ownership.get(city.id),
          to: city.factionId,
        });
        ownership.set(city.id, city.factionId);
      }
    for (const battle of state.battles) {
      if (battle.attackerFactionId !== player && battle.defenderFactionId !== player) continue;
      const journey = state.journeys.find((j) => j.id === battle.attackerJourneyId);
      if (!battleStarts.has(battle.id)) {
        battleStarts.add(battle.id);
        events.push({
          day: state.absoluteDay,
          kind: 'battle-start',
          id: battle.id,
          attacker: battle.attackerFactionId,
          defender: battle.defenderFactionId,
          source: journey?.sourceCityId,
          target: journey?.destinationCityId,
          attackerTroops: battle.battleData.units
            .filter((u) => u.side === 'attacker')
            .reduce((n, u) => n + u.initialTroops, 0),
          defenderTroops: battle.battleData.units
            .filter((u) => u.side === 'defender')
            .reduce((n, u) => n + u.initialTroops, 0),
        });
        await snapshot(`day-${state.absoluteDay}-${battle.id}-start`);
      }
      if (battle.resolved && !resolutions.has(battle.id)) {
        resolutions.add(battle.id);
        events.push({
          day: state.absoluteDay,
          kind: 'battle-end',
          id: battle.id,
          outcome: battle.outcome,
          reason: battle.battleData.outcome?.reason,
          attacker: retained(battle, 'attacker'),
          defender: retained(battle, 'defender'),
        });
      }
    }
    if (state.absoluteDay % 30 === 0) await snapshot(`day-${state.absoluteDay}`);
  };
  await record();
  while (state.absoluteDay < 360 && state.phase !== 'finished') {
    for (const event of state.events.filter(
      (event) => !event.acknowledged && event.absoluteDay <= state.absoluteDay,
    )) {
      const result = executeV03Command(state, { type: 'acknowledgeEvent', eventId: event.id });
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    if (state.phase === 'planning') {
      const action = executeCampaignProbe(state, policy, api);
      state = action.state;
      for (const command of action.actions)
        events.push({ day: state.absoluteDay, kind: 'player-work', ...command });
      if (action.dispatched)
        events.push({ day: state.absoluteDay, kind: 'bot-departure', ...action.selected });
    }
    const battles = state.battles.filter(
      (b) => b.active && (b.attackerFactionId === player || b.defenderFactionId === player),
    );
    for (const battle of battles) {
      const side = battle.attackerFactionId === player ? 'attacker' : 'defender';
      battle.battleData = runBattleAiTurn(
        battle.battleData,
        side,
        policy === 'adjacent-legacy'
          ? undefined
          : {
              attacker: battle.attackerFoodRemainderMicro,
              defender: battle.defenderFoodRemainderMicro,
            },
      );
      battle.attackerFood = battle.battleData.supplies.attacker;
      battle.defenderFood = battle.battleData.supplies.defender;
    }
    if (battles.length) {
      for (const battle of battles) {
        const result = executeV03Command(state, { type: 'completeBattleDay', battleId: battle.id });
        if (!result.ok) throw new Error(result.error);
        state = result.state;
      }
    } else {
      const result = executeV03Command(state, { type: 'advance', days: 1 });
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
    await record();
    if (++steps > 3600) throw new Error('Replay stalled.');
  }
  await snapshot('final');
  const after = await simulationFingerprint(root, configuration);
  if (fingerprint.sourceSha256 !== after.sourceSha256)
    throw new Error('Source changed during replay.');
  const report = {
    configuration,
    fingerprint,
    day: state.absoluteDay,
    phase: state.phase,
    winner: state.winnerFactionId,
    owned: state.cities.filter((c) => c.factionId === player).map((c) => c.id),
    events,
    snapshots: [...snapshots],
  };
  await writeFile(join(outputRoot, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      outputRoot,
      day: report.day,
      phase: report.phase,
      owned: report.owned,
      snapshots: snapshots.size,
    }),
  );
} finally {
  await server.close();
}
