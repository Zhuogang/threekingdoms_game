import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const baseline = process.argv.includes('--baseline');
const bot = process.argv.includes('--bot');
const artifactDir = resolve('.artifacts/ai-diagnostics');
mkdirSync(artifactDir, { recursive: true });
const plugins = [];
if (baseline) {
  // Instrument the preserved M0 source observationally. Every replacement is
  // asserted and retains the original policy, resource use, and execution order.
  const original = resolve('.artifacts/baseline-engine');
  const instrumented = join(artifactDir, 'baseline-engine');
  cpSync(original, instrumented, { recursive: true });
  const campaignPath = join(instrumented, 'game/campaign.ts');
  let code = readFileSync(campaignPath, 'utf8');
  const replace = (from, to, expected = 1) => {
    const count = code.split(from).length - 1;
    if (count !== expected)
      throw new Error(
        `Baseline instrumentation expected ${expected} matches, got ${count}: ${from}`,
      );
    code = code.replaceAll(from, to);
  };
  replace(
    'function planAi(state: GameState): void {',
    'function planAi(state: GameState, observer?: any): void {',
  );
  replace(
    '    for (const city of cities) {',
    '    if (cities.length) observer?.aiFactionMonth?.(faction.id);\n    for (const city of cities) {',
  );
  replace(
    '      const target = enemies.find((c) => power > strength(state, c) * 1.35 + c.defense * 7 + 300);',
    `      if (army.length && state.turn > 0) for (const c of enemies) observer?.aiCandidate?.({turn:state.turn,factionId:faction.id,sourceId:city.id,targetId:c.id,attackingPower:power,defendingTroops:strength(state,c),defense:c.defense,attackingTroops:army.reduce((n,o)=>n+o.troops,0),sourceTroops:strength(state,city),reserve:city.reserve,food:city.food});
      const target = enemies.find((c) => power > strength(state, c) * 1.35 + c.defense * 7 + 300);`,
  );
  replace(
    '      if (target && army.length && state.turn > 0)\n        march(',
    '      if (target && army.length && state.turn > 0) {\n        const error = march(',
  );
  replace(
    '      for (const officer of officers.filter((o) => !o.busy)) {',
    '        if (!error) observer?.aiMarch?.(state.orders[state.orders.length-1]);\n      }\n      for (const officer of officers.filter((o) => !o.busy)) {',
  );
  replace(
    'function applyBattleAftermath(state: GameState): void {',
    'function applyBattleAftermath(state: GameState, observer?: any): void {',
  );
  replace(
    '  state.battle = null;',
    '  observer?.battleResult?.({attackerId:battle.attackerId,defenderId:formerOwner,captured:target.factionId!==formerOwner});\n  state.battle = null;',
  );
  replace(
    'function finishMonth(state: GameState): void {',
    'function finishMonth(state: GameState, observer?: any): void {',
  );
  replace(
    '    if (city.food < upkeep) {',
    '    if (city.factionId!==state.playerFactionId) observer?.aiUpkeep?.({cityId:city.id,factionId:city.factionId,shortage:city.food<upkeep});\n    if (city.food < upkeep) {',
  );
  replace(
    'function resolveOrders(state: GameState): void {',
    'function resolveOrders(state: GameState, observer?: any): void {',
  );
  replace('applyBattleAftermath(state);', 'applyBattleAftermath(state, observer);', 2);
  replace('  finishMonth(state);', '  finishMonth(state, observer);');
  replace(
    'export function dispatch(state: GameState, command: GameCommand): CommandResult {',
    'export function dispatch(state: GameState, command: GameCommand, observer?: any): CommandResult {',
  );
  replace('applyBattleAftermath(draft);', 'applyBattleAftermath(draft, observer);');
  replace('resolveOrders(draft);', 'resolveOrders(draft, observer);', 2);
  replace('planAi(draft);', 'planAi(draft, observer);');
  writeFileSync(campaignPath, code);
  plugins.push({
    name: 'frozen-baseline',
    setup(builder) {
      builder.onResolve({ filter: /^\.\.\/src\/game\/campaign$/ }, () => ({ path: campaignPath }));
    },
  });
}
const outfile = join(
  artifactDir,
  bot ? 'bot-runner.mjs' : baseline ? 'baseline-runner.mjs' : 'current-runner.mjs',
);
await build({
  // `--bot` plays a scripted competent player and writes the gameplay-plan metrics.
  entryPoints: [bot ? 'tools/botDiagnostics.ts' : 'tools/aiDiagnostics.ts'],
  // Top-level await in the bot runner needs a modern target.
  target: 'node22',
  outfile,
  platform: 'node',
  format: 'esm',
  bundle: true,
  plugins,
});
process.env.DIAGNOSTIC_BASELINE = baseline ? '1' : '0';
await import(pathToFileURL(outfile).href);
