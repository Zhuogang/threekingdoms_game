import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deepStrictEqual } from 'node:assert';
import { FACTIONS } from '../src/content/scenario';
import { createGame, dispatch, validateState } from '../src/game/campaign';
import type { CampaignObserver } from '../src/game/aiPolicy';
import type { GameCommand, GameState } from '../src/game/types';
import { botMonth, newBotStats } from './playerBot';

/**
 * Bot-driven balance diagnostics (`npm run diagnostics:ai -- --bot`). A scripted
 * competent player plays each campaign and every §6 metric of the gameplay plan
 * is measured. Observers never change gameplay: each command is run with and
 * without an observer and the results must be identical.
 */
const outputDir = process.env.DIAGNOSTIC_OUTPUT ?? '.artifacts/ai-diagnostics';
const months = Number(process.env.DIAGNOSTIC_MONTHS ?? 72);
const seedCount = Number(process.env.DIAGNOSTIC_SEEDS ?? 3);
const presets = (process.env.DIAGNOSTIC_PRESETS ?? 'balanced').split(',') as (
  'cautious' | 'balanced' | 'aggressive'
)[];
const tacticalAi = (process.env.DIAGNOSTIC_TACTICAL_AI ?? 'v2') as 'v1' | 'v2';
const seeds = Array.from({ length: seedCount }, (_, index) => 2001 + index);

interface BattleRecord {
  days: number;
  reason: string;
  winner: 'attacker' | 'defender';
  attackerStart: number;
  defenderStart: number;
  attackerEnd: number;
  defenderEnd: number;
  shortage: boolean;
  intent: string;
  actions: Record<string, number>;
}
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null;
};
const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! : null;
};
const pct = (n: number, d: number) => (d ? Math.round((n * 1000) / d) / 10 : null);

const { battleConfig } = await import('../src/game/battle');
battleConfig.tacticalAi = tacticalAi;

const battles: BattleRecord[] = [];
const campaigns: Record<string, unknown>[] = [];
const autoResolveMs: number[] = [];
let aiUpkeeps = 0;
let aiShortages = 0;
const aiActions: Record<string, number> = {};
let aiMarches = 0;

for (const faction of FACTIONS) {
  for (const preset of presets) {
    for (const seed of seeds) {
      let state: GameState = createGame(faction.id, seed, preset);
      const stats = newBotStats();
      let current: Partial<BattleRecord> & { actions: Record<string, number> } = { actions: {} };
      let shortage = false;
      let captures = 0;
      let coalitions = 0;
      let rawPlunders = 0;
      let raidBattles = 0;
      let fought = 0;
      let unopposed = 0;
      const observer: CampaignObserver = {
        aiMarch: () => aiMarches++,
        aiUpkeep: ({ shortage: s }) => {
          aiUpkeeps++;
          if (s) aiShortages++;
        },
        aiStatecraft: ({ kind }) => {
          aiActions[kind] = (aiActions[kind] ?? 0) + 1;
        },
        battleAction: ({ kind }) => {
          current.actions[kind] = (current.actions[kind] ?? 0) + 1;
        },
        battleShortage: () => {
          shortage = true;
        },
        battleEnded: (event) => {
          current.days = event.day;
          current.reason = event.reason;
          current.winner = event.winner;
        },
        battleResult: (event) => {
          if (event.intent === 'raid') raidBattles++;
          battles.push({
            days: current.days ?? event.days ?? 0,
            reason: current.reason ?? 'unknown',
            winner: current.winner ?? (event.captured ? 'attacker' : 'defender'),
            attackerStart: event.attackerStart ?? 0,
            defenderStart: event.defenderStart ?? 0,
            attackerEnd: event.attackerEnd ?? 0,
            defenderEnd: event.defenderEnd ?? 0,
            shortage,
            intent: event.intent ?? 'conquer',
            actions: current.actions,
          });
          current = { actions: {} };
          shortage = false;
        },
        capture: ({ byFactionId }) => {
          if (byFactionId === faction.id) captures++;
        },
        plunder: (event) => {
          rawPlunders++;
          if (event.form === 'raid') {
            if (event.fought) fought++;
            else unopposed++;
          }
        },
        coalition: () => {
          coalitions++;
        },
      };
      const apply = (command: GameCommand, record = false): boolean => {
        const unobserved = dispatch(state, command);
        const started = performance.now();
        const result = dispatch(state, command, observer);
        if (record) autoResolveMs.push(performance.now() - started);
        deepStrictEqual(result, unobserved, 'Diagnostic observation changed gameplay.');
        if (!result.ok) return false;
        state = result.state;
        const error = validateState(state);
        if (error) throw new Error(`${faction.id}/${preset}/${seed}, turn ${state.turn}: ${error}`);
        return true;
      };
      let unified: number | null = null;
      let peakCities = 0;
      for (let month = 0; month < months && state.phase !== 'finished'; month++) {
        botMonth(
          () => state,
          (command) => apply(command),
          stats,
        );
        apply({ type: 'endMonth' });
        for (let guard = 0; state.phase === 'battle'; guard++) {
          if (guard >= 60) throw new Error('Unbounded monthly battle resolution.');
          apply({ type: 'battleAuto' }, true);
        }
        for (const rival of FACTIONS)
          peakCities = Math.max(
            peakCities,
            state.cities.filter((c) => c.factionId === rival.id).length,
          );
      }
      if (state.phase === 'finished' && state.winner === faction.id) unified = state.turn;
      campaigns.push({
        faction: faction.id,
        preset,
        seed,
        months: state.turn,
        finished: state.phase === 'finished',
        won: state.winner === faction.id,
        unified,
        cities: state.cities.filter((c) => c.factionId === faction.id).length,
        captures,
        coalitions,
        peakCities,
        plunders: rawPlunders,
        raidBattles,
        unopposedRaids: unopposed,
        winningRaids: fought,
        bot: stats,
      });
    }
  }
}

const sum = (key: (c: Record<string, unknown>) => number) =>
  campaigns.reduce((total, c) => total + key(c), 0);
const botSum = (key: keyof ReturnType<typeof newBotStats>) =>
  sum((c) => Number((c.bot as Record<string, unknown>)[key]));
const decisive = battles.filter((b) => b.reason !== 'retreat');
const actionTotals: Record<string, number> = {};
for (const battle of decisive)
  for (const [kind, count] of Object.entries(battle.actions))
    actionTotals[kind] = (actionTotals[kind] ?? 0) + count;
// Count unit-turns by outcome: a unit that only moves or holds ends its turn with wait.
const mixTotal =
  (actionTotals.attack ?? 0) + (actionTotals.tactic ?? 0) + (actionTotals.wait ?? 0);
const upsets = decisive.filter((b) => {
  const winnerStart = b.winner === 'attacker' ? b.attackerStart : b.defenderStart;
  const loserStart = b.winner === 'attacker' ? b.defenderStart : b.attackerStart;
  return winnerStart < loserStart;
});
const close = decisive.filter((b) => {
  const start = b.winner === 'attacker' ? b.attackerStart : b.defenderStart;
  const end = b.winner === 'attacker' ? b.attackerEnd : b.defenderEnd;
  return start > 0 && end / start < 0.5;
});
// Contested fights (within 1.6x of each other) are where tactics decide the result.
const contested = decisive.filter((b) => {
  const ratio = b.attackerStart / Math.max(1, b.defenderStart);
  return ratio >= 0.6 && ratio <= 1.6;
});
const upsetIn = (set: BattleRecord[]) =>
  set.filter((b) => {
    const winnerStart = b.winner === 'attacker' ? b.attackerStart : b.defenderStart;
    const loserStart = b.winner === 'attacker' ? b.defenderStart : b.attackerStart;
    return winnerStart < loserStart;
  }).length;
const closeIn = (set: BattleRecord[]) =>
  set.filter((b) => {
    const start = b.winner === 'attacker' ? b.attackerStart : b.defenderStart;
    const end = b.winner === 'attacker' ? b.attackerEnd : b.defenderEnd;
    return start > 0 && end / start < 0.5;
  }).length;
const marchTotal = botSum('marches');
const nonDefault = Object.entries(
  campaigns.reduce(
    (acc, c) => {
      for (const [days, n] of Object.entries(
        (c.bot as { marchesBySupplyDays: Record<string, number> }).marchesBySupplyDays,
      ))
        acc[days] = (acc[days] ?? 0) + n;
      return acc;
    },
    {} as Record<string, number>,
  ),
).reduce((total, [days, n]) => total + (days === '20' ? 0 : n), 0);
const raids = botSum('raids');
const summary = {
  tacticalAi,
  campaigns: campaigns.length,
  battles: battles.length,
  medianBattleDays: median(decisive.map((b) => b.days)),
  timeoutPercent: pct(decisive.filter((b) => b.reason === 'timeout').length, decisive.length),
  campRushDay3Percent: pct(
    decisive.filter((b) => b.reason === 'camp' && b.days <= 3).length,
    decisive.length,
  ),
  actionMixPercent: {
    attack: pct(actionTotals.attack ?? 0, mixTotal),
    tactic: pct(actionTotals.tactic ?? 0, mixTotal),
    moveOnly: pct(actionTotals.wait ?? 0, mixTotal),
    counters: actionTotals.counter ?? 0,
  },
  contested: {
    battles: contested.length,
    medianBattleDays: median(contested.map((b) => b.days)),
    timeoutPercent: pct(contested.filter((b) => b.reason === 'timeout').length, contested.length),
    attackerWinPercent: pct(
      contested.filter((b) => b.winner === 'attacker').length,
      contested.length,
    ),
    upsetPercent: pct(upsetIn(contested), contested.length),
    closeBattlePercent: pct(closeIn(contested), contested.length),
  },
  upsetPercent: pct(upsets.length, decisive.length),
  closeBattlePercent: pct(close.length, decisive.length),
  supplyRunOutPercent: pct(decisive.filter((b) => b.shortage).length, decisive.length),
  botMarches: marchTotal,
  botNonDefaultSupplyPercent: pct(nonDefault, marchTotal),
  botRaids: raids,
  botSacks: botSum('sacks'),
  botOwnPlunders: botSum('ownPlunders'),
  botPlunderPerCityMonthPercent: pct(
    raids + botSum('sacks') + botSum('ownPlunders'),
    botSum('eligibleCityMonths'),
  ),
  raidsThatFought: pct(
    sum((c) => Number(c.raidBattles)),
    sum((c) => Number(c.raidBattles)) + sum((c) => Number(c.unopposedRaids)),
  ),
  aiProvisionShortagePercent: pct(aiShortages, aiUpkeeps),
  aiMarches,
  aiStatecraft: aiActions,
  unifiedRuns: campaigns.filter((c) => c.unified !== null).length,
  monthsToUnifyMedian: median(
    campaigns.filter((c) => c.unified !== null).map((c) => Number(c.unified)),
  ),
  coalitionRuns: pct(campaigns.filter((c) => Number(c.coalitions) > 0).length, campaigns.length),
  // Runs in which someone actually reached the coalition threshold of ten cities.
  coalitionInRunsWithLeader: pct(
    campaigns.filter((c) => Number(c.peakCities) >= 10 && Number(c.coalitions) > 0).length,
    campaigns.filter((c) => Number(c.peakCities) >= 10).length,
  ),
  playerCapturesPerCampaign:
    Math.round((sum((c) => Number(c.captures)) * 10) / campaigns.length) / 10,
  autoResolveMs: { median: median(autoResolveMs), p95: percentile(autoResolveMs, 0.95) },
};
mkdirSync(outputDir, { recursive: true });
const output = join(outputDir, process.env.DIAGNOSTIC_FILE ?? 'bot.json');
writeFileSync(
  output,
  JSON.stringify({ months, seeds, presets, summary, campaigns }, null, 2) + '\n',
);
if (process.env.DIAGNOSTIC_BATTLES === '1')
  writeFileSync(join(outputDir, 'bot-battles.json'), JSON.stringify(battles) + '\n');
console.log(JSON.stringify({ output, summary }, null, 2));
