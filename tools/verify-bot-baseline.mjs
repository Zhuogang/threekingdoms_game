import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Verify the retained baseline policy against the committed pre-improvement bot,
// using the same current engine for both so rule tuning is not mistaken for bot drift.
const directory = resolve('.artifacts/bot-baseline-check');
mkdirSync(directory, { recursive: true });
const revision = execFileSync('git', ['rev-parse', '077556c^{commit}'], {
  encoding: 'utf8',
}).trim();
const historical = execFileSync('git', ['show', `${revision}:tools/playerBot.ts`], {
  encoding: 'utf8',
});
writeFileSync(join(directory, 'historical.ts'), historical.replaceAll('../src/', '../../src/'));
writeFileSync(
  join(directory, 'check.ts'),
  `
import { deepStrictEqual } from 'node:assert';
import { writeFileSync } from 'node:fs';
import { createGame, dispatch } from '../../src/game/campaign';
import { scenarioById } from '../../src/content/scenario';
import { defaultTruceMonths } from '../../src/game/difficulty';
import { botMonth, newBotStats } from '../../tools/playerBot';
import { botMonth as historicalMonth, newBotStats as historicalStats } from './historical';
import type { GameCommand, GameState } from '../../src/game/types';
let comparedMonths = 0;
for (const scenarioId of ['divided-realm-190', 'guandu-200'])
  for (const faction of scenarioById(scenarioId)!.factions)
    for (const seed of [2001, 2002, 2003]) {
      let before = createGame(faction.id, seed, 'balanced', { scenarioId, truceMonths: defaultTruceMonths('standard', faction.difficulty) });
      let after = structuredClone(before);
      const oldStats = historicalStats();
      const newStats = newBotStats();
      for (let month = 0; month < 12 && before.phase !== 'finished'; month++) {
        const oldCommands: GameCommand[] = [], newCommands: GameCommand[] = [];
        historicalMonth(() => before, (command) => { oldCommands.push(command); const result = dispatch(before, command); before = result.state; return result.ok; }, oldStats);
        botMonth(() => after, (command) => { newCommands.push(command); const result = dispatch(after, command); after = result.state; return result.ok; }, newStats, 'normal', 'baseline');
        deepStrictEqual(newCommands, oldCommands, scenarioId + '/' + faction.id + '/' + seed + ': command sequence changed');
        deepStrictEqual(after, before, 'Baseline bot changed monthly state');
        const finish = (state: GameState) => {
          state = dispatch(state, { type: 'endMonth' }).state;
          for (let guard = 0; state.phase === 'battle'; guard++) {
            if (guard > 60) throw new Error('Unbounded month');
            state = dispatch(state, { type: 'battleAuto' }).state;
          }
          return state;
        };
        before = finish(before); after = finish(after);
        deepStrictEqual(after, before, 'Baseline bot changed continuation');
        comparedMonths++;
      }
    }
const report = { referenceRevision: ${JSON.stringify(revision)}, campaigns: 36, maxMonths: 12, comparedMonths, commandSequencesEqual: true, statesEqual: true };
writeFileSync(new URL('./report.json', import.meta.url), JSON.stringify(report, null, 2) + '\\n');
console.log(JSON.stringify(report));
`,
);
const outfile = join(directory, 'check.mjs');
await build({
  entryPoints: [join(directory, 'check.ts')],
  outfile,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  bundle: true,
});
await import(pathToFileURL(outfile).href);
