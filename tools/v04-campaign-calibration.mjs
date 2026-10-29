import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { simulationFingerprint } from './simulation-fingerprint.mjs';

const cohort = process.argv[2] ?? 'development';
if (!['development', 'heldout'].includes(cohort)) throw new Error('Use development or heldout.');
const output = process.argv[3] ?? `.artifacts/v04/campaign-strength-${cohort}.json`;
const seeds = cohort === 'development' ? [17, 31] : [101, 137];
const routes = [
  ['ye', 'pingyuan'],
  ['ye', 'jinyang'],
  ['jianye', 'shouchun'],
];
const roster = (prefix, types, troops, force = 70, intellect = 60, troopExperience = 0) =>
  types.map((troopType, index) => ({
    id: `${prefix}-${index}`,
    name: `${prefix} ${index}`,
    troopType,
    troops,
    force,
    intellect,
    troopExperience,
  }));
const militia = (troops) => [
  {
    id: 'd-militia',
    name: 'Militia',
    troopType: 'infantry',
    troops,
    force: 45,
    intellect: 40,
    isMilitia: true,
  },
];
const mixed = ['infantry', 'cavalry', 'archer'];
const cases = [
  { id: 'empty', attacker: roster('a', ['infantry'], 1000), defender: [] },
  {
    id: 'hopeless-1-to-10',
    attacker: roster('a', [...mixed, 'infantry', 'cavalry'], 1000),
    defender: militia(50_000),
  },
  { id: 'favorable-militia', attacker: roster('a', mixed, 1000), defender: militia(1000) },
  { id: 'peer-mixed', attacker: roster('a', mixed, 1000), defender: roster('d', mixed, 1000) },
  {
    id: 'quality-outnumbered',
    attacker: roster('a', ['infantry', 'archer'], 1000, 95, 95, 1200),
    defender: roster('d', mixed, 1000, 50, 40),
  },
  {
    id: 'cavalry-vs-archers',
    attacker: roster('a', ['cavalry', 'cavalry', 'cavalry'], 1000),
    defender: roster('d', ['archer', 'archer', 'archer'], 1000),
  },
];
const configuration = {
  cohort,
  seeds,
  routes,
  cases,
  seats: ['attacker', 'defender'],
  description:
    'Static capability estimate vs resolved auto battles; actual post-action ration charging; 30-day starting provisions; legal returns for both sides. Field survivors exclude later campaign capture/return settlement.',
};
const fingerprints = await simulationFingerprint(process.cwd(), configuration);
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false },
});
const started = performance.now();
const results = [];
await mkdir(dirname(output), { recursive: true });
try {
  const battle = await server.ssrLoadModule('/src/v03/battle/index.ts');
  const { estimateCampaignMatchup } = await server.ssrLoadModule(
    '/src/v03/ai/campaign-strength.ts',
  );
  const { forecastBattleRations } = await server.ssrLoadModule('/src/v03/battle/supply.ts');
  const { chargeBattleRations } = await server.ssrLoadModule('/src/v03/engine.ts');
  for (const fixture of cases)
    for (const route of routes)
      for (const seed of seeds)
        for (const playerSide of ['attacker', 'defender']) {
          const prediction = estimateCampaignMatchup(fixture.attacker, fixture.defender, route);
          const map = battle.createCanvasBattleMap(prediction.battlefieldId, { seed });
          const data = battle.createTacticalBattle({
            id: `calibration-${fixture.id}-${seed}-${playerSide}`,
            map,
            seed,
            attackerUnits: fixture.attacker,
            defenderUnits: fixture.defender,
            playerSide,
            dayLimit: 30,
          });
          data.retreatAllowed = { attacker: true, defender: true };
          for (const side of ['attacker', 'defender'])
            data.supplies[side] = Math.ceil(forecastBattleRations(data, side).dailyFood * 30);
          // These are exactly the fields read/written by the campaign ration charger.
          const wrapper = {
            battleData: data,
            lastRationDay: -1,
            attackerFood: data.supplies.attacker,
            defenderFood: data.supplies.defender,
            attackerFoodRemainderMicro: 0,
            defenderFoodRemainderMicro: 0,
            foodShortfallDays: 0,
          };
          let elapsedDays = 0;
          while (!wrapper.battleData.outcome && elapsedDays < 30) {
            const remainders = {
              attacker: wrapper.attackerFoodRemainderMicro,
              defender: wrapper.defenderFoodRemainderMicro,
            };
            const first = battle.runBattleAiTurn(wrapper.battleData, playerSide, remainders);
            wrapper.battleData = battle.advanceBattleDay(first, remainders);
            chargeBattleRations(wrapper, elapsedDays++);
          }
          if (!wrapper.battleData.outcome)
            throw new Error('A calibration battle failed to resolve.');
          const retained = (side) =>
            wrapper.battleData.units
              .filter((unit) => unit.side === side)
              .reduce(
                (sum, unit) => ({
                  healthy: sum.healthy + unit.troops,
                  wounded: sum.wounded + unit.wounded,
                }),
                { healthy: 0, wounded: 0 },
              );
          const attacker = retained('attacker'),
            defender = retained('defender');
          results.push({
            case: fixture.id,
            route,
            seed,
            playerSide,
            prediction,
            admitted: prediction.ratio >= 0.8,
            outcome: wrapper.battleData.outcome,
            elapsedDays,
            attacker,
            defender,
            actualUnavailableAttackers: prediction.attackerTroops - attacker.healthy,
            foodShortfallDays: wrapper.foodShortfallDays,
          });
        }
  const after = await simulationFingerprint(process.cwd(), configuration);
  if (after.sourceSha256 !== fingerprints.sourceSha256)
    throw new Error('Source changed during calibration.');
  const aggregate = Object.fromEntries(
    cases.map(({ id }) => {
      const rows = results.filter((result) => result.case === id);
      return [
        id,
        {
          runs: rows.length,
          admitted: rows.filter((row) => row.admitted).length,
          attackerWins: rows.filter((row) => row.outcome.winner === 'attacker').length,
          rejectedAttackerWins: rows.filter(
            (row) => !row.admitted && row.outcome.winner === 'attacker',
          ).length,
          admittedAttackerLosses: rows.filter(
            (row) => row.admitted && row.outcome.winner !== 'attacker',
          ).length,
          meanEstimatedLosses:
            rows.reduce((sum, row) => sum + row.prediction.expectedLosses, 0) / rows.length,
          meanActualUnavailable:
            rows.reduce((sum, row) => sum + row.actualUnavailableAttackers, 0) / rows.length,
        },
      ];
    }),
  );
  await writeFile(
    output,
    JSON.stringify(
      {
        schemaVersion: 1,
        status: 'complete',
        generatedAt: new Date().toISOString(),
        node: process.version,
        elapsedMs: performance.now() - started,
        fingerprints,
        configuration,
        aggregate,
        results,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(JSON.stringify({ output, runs: results.length, aggregate }));
} finally {
  await server.close();
}
