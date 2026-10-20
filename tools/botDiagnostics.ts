import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deepStrictEqual } from 'node:assert';
import { scenarioById } from '../src/content/scenario';
import { createGame, dispatch, validateState } from '../src/game/campaign';
import { defaultTruceMonths } from '../src/game/difficulty';
import type { CampaignObserver } from '../src/game/aiPolicy';
import type {
  BattleSkill,
  BattleState,
  BattleUnit,
  GameCommand,
  GameState,
} from '../src/game/types';
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
const scenarioIds = (process.env.DIAGNOSTIC_SCENARIOS ?? 'divided-realm-190').split(',');
const tacticalAi = (process.env.DIAGNOSTIC_TACTICAL_AI ?? 'v2') as 'v1' | 'v2';
const seeds = Array.from({ length: seedCount }, (_, index) => 2001 + index);
/** Survival is also reported at this horizon, the one the H1 acceptance criterion uses. */
const SURVIVAL_HORIZON = 48;
/** Tactics whose use is divided by the situations in which they could be cast. */
const SITUATIONAL: BattleSkill[] = ['ambush', 'rockfall'];

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

const { battleConfig, getTacticTargets } = await import('../src/game/battle');
battleConfig.tacticalAi = tacticalAi;

const battles: BattleRecord[] = [];
const campaigns: Record<string, unknown>[] = [];
const autoResolveMs: number[] = [];
let aiUpkeeps = 0;
let aiShortages = 0;
const aiActions: Record<string, number> = {};
const tacticCasts: Record<string, number> = {};
let aiMarches = 0;
// Tactical-AI unit turns that began able to cast a situational tactic in place, and
// how many of those turns cast it. Rockfall cast after moving onto a hill is not eligible
// in place, so castsTotal can exceed castsWhenEligible.
const eligibility = Object.fromEntries(
  SITUATIONAL.map((skill) => [skill, { eligibleTurns: 0, castsWhenEligible: 0, castsTotal: 0 }]),
) as Record<BattleSkill, { eligibleTurns: number; castsWhenEligible: number; castsTotal: number }>;
let eligibleNow = new Set<BattleSkill>();
// Raids by every faction: a raid either finds no soldiers (unopposed) or becomes a battle.
const raidTotals = { battles: 0, battlesWon: 0, unopposed: 0 };

/** The `observer?.aiUnitTurn` hook added by tools/ai-diagnostics.mjs in `--bot` mode. */
type DiagnosticObserver = CampaignObserver & {
  aiUnitTurn?(battle: BattleState, unit: BattleUnit): void;
};

for (const scenarioId of scenarioIds) {
  const scenario = scenarioById(scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);
  for (const faction of scenario.factions) {
    for (const preset of presets) {
      for (const seed of seeds) {
        let state: GameState = createGame(faction.id, seed, preset, {
          scenarioId,
          // Standard difficulty protects Challenging houses with a short opening truce.
          truceMonths:
            preset === 'balanced' ? defaultTruceMonths('standard', faction.difficulty) : 0,
        });
        const stats = newBotStats();
        let current: Partial<BattleRecord> & { actions: Record<string, number> } = {
          actions: {},
        };
        let shortage = false;
        let captures = 0;
        let coalitions = 0;
        let rawPlunders = 0;
        // The bot's own raids, by how they resolved.
        const raids = { battles: 0, battlesWon: 0, unopposed: 0 };
        const observer: DiagnosticObserver = {
          aiMarch: () => aiMarches++,
          aiUpkeep: ({ shortage: s }) => {
            aiUpkeeps++;
            if (s) aiShortages++;
          },
          aiStatecraft: ({ kind }) => {
            aiActions[kind] = (aiActions[kind] ?? 0) + 1;
          },
          aiUnitTurn: (battle, unit) => {
            eligibleNow = new Set(
              SITUATIONAL.filter((skill) => getTacticTargets(battle, unit.id, skill).length > 0),
            );
            for (const skill of eligibleNow) eligibility[skill].eligibleTurns++;
          },
          battleAction: ({ kind, skill }) => {
            current.actions[kind] = (current.actions[kind] ?? 0) + 1;
            if (skill) tacticCasts[skill] = (tacticCasts[skill] ?? 0) + 1;
            if (skill && skill in eligibility) {
              eligibility[skill].castsTotal++;
              if (eligibleNow.has(skill)) eligibility[skill].castsWhenEligible++;
            }
            // A unit's turn ends with its action; moving first keeps its eligibility.
            if (kind !== 'move') eligibleNow = new Set();
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
            if (event.intent === 'raid') {
              if (event.attackerId === faction.id) raids.battles++;
              raidTotals.battles++;
            }
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
            // A raid that fought and still plundered is a raid battle the raiders won.
            const mine = event.factionId === faction.id;
            if (event.form === 'raid' && event.fought) {
              if (mine) raids.battlesWon++;
              raidTotals.battlesWon++;
            } else if (event.form === 'raid') {
              if (mine) raids.unopposed++;
              raidTotals.unopposed++;
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
          if (error)
            throw new Error(
              `${scenarioId}/${faction.id}/${preset}/${seed}, turn ${state.turn}: ${error}`,
            );
          return true;
        };
        let unified: number | null = null;
        let eliminated: number | null = null;
        let peakCities = 0;
        let maxAiCaptives = 0;
        const held = () => state.cities.filter((c) => c.factionId === faction.id).length;
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
          if (eliminated === null && held() === 0) eliminated = state.turn;
          // Captives held by AI houses (the player's own prisoners are the player's to decide).
          const aiCaptives = state.officers.filter((o) => {
            if (!o.captive || o.fate !== 'active') return false;
            const holder = state.cities.find((c) => c.id === o.cityId)?.factionId;
            return holder !== null && holder !== undefined && holder !== faction.id;
          }).length;
          maxAiCaptives = Math.max(maxAiCaptives, aiCaptives);
          for (const rival of scenario.factions)
            peakCities = Math.max(
              peakCities,
              state.cities.filter((c) => c.factionId === rival.id).length,
            );
        }
        if (state.phase === 'finished' && state.winner === faction.id) unified = state.turn;
        const { lastOwnPlunder: _memory, ...bot } = stats;
        campaigns.push({
          scenario: scenarioId,
          faction: faction.id,
          rating: faction.difficulty,
          preset,
          seed,
          months: state.turn,
          finished: state.phase === 'finished',
          won: state.winner === faction.id,
          // Another house won (unification or Hegemon) while the player still held cities.
          lostToRival: state.phase === 'finished' && state.winner !== faction.id && held() > 0,
          unified,
          eliminated,
          cities: held(),
          captures,
          coalitions,
          peakCities,
          maxAiCaptives,
          plunders: rawPlunders,
          raids,
          bot,
        });
      }
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
const mixTotal = (actionTotals.attack ?? 0) + (actionTotals.tactic ?? 0) + (actionTotals.wait ?? 0);
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
type Campaign = Record<string, unknown>;
/** Survival, elimination and unification for one group of campaigns. */
const outcomes = (group: Campaign[]) => {
  const eliminatedBy = (turn: number) =>
    group.filter((c) => c.eliminated !== null && Number(c.eliminated) <= turn).length;
  const unifiedTurns = group.filter((c) => c.unified !== null).map((c) => Number(c.unified));
  return {
    runs: group.length,
    [`survival${SURVIVAL_HORIZON}Percent`]: pct(
      group.length - eliminatedBy(SURVIVAL_HORIZON),
      group.length,
    ),
    survivalPercent: pct(group.length - eliminatedBy(months), group.length),
    medianEliminationTurn: median(
      group.filter((c) => c.eliminated !== null).map((c) => Number(c.eliminated)),
    ),
    lostToRival: group.filter((c) => c.lostToRival).length,
    medianFinalCities: median(group.map((c) => Number(c.cities))),
    unifiedRuns: unifiedTurns.length,
    // Over winners only, so always read it beside unifiedRuns.
    monthsToUnifyMedian: median(unifiedTurns),
  };
};
const groupBy = (key: (c: Campaign) => string) => {
  const groups: Record<string, Campaign[]> = {};
  for (const c of campaigns) (groups[key(c)] ??= []).push(c);
  return Object.fromEntries(Object.entries(groups).map(([k, group]) => [k, outcomes(group)]));
};
const raidResolved = raidTotals.battles + raidTotals.unopposed;
const botRaid = (key: 'battles' | 'battlesWon' | 'unopposed') =>
  sum((c) => (c.raids as Record<string, number>)[key]!);
const summary = {
  tacticalAi,
  scenarios: scenarioIds,
  campaigns: campaigns.length,
  survival: {
    overall: outcomes(campaigns),
    byRating: groupBy((c) => `${c.scenario}/${c.rating}`),
    byFaction: groupBy((c) => `${c.scenario}/${c.faction}`),
  },
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
  // Raids by every faction. A raid on a city with soldiers becomes a battle (raidBattles);
  // one on an empty city is plundered unopposed. Raid battles the raiders won also plunder.
  raids: {
    resolved: raidResolved,
    raidBattles: raidTotals.battles,
    raidBattlesWon: raidTotals.battlesWon,
    unopposed: raidTotals.unopposed,
    raidBattlePercent: pct(raidTotals.battles, raidResolved),
    raidBattleWinPercent: pct(raidTotals.battlesWon, raidTotals.battles),
    botRaidBattles: botRaid('battles'),
    botRaidBattlesWon: botRaid('battlesWon'),
    botUnopposed: botRaid('unopposed'),
  },
  // Per tactical-AI unit turn that could cast the tactic where it stood.
  situationalTactics: Object.fromEntries(
    SITUATIONAL.map((skill) => [
      skill,
      {
        ...eligibility[skill],
        usedWhenEligiblePercent: pct(
          eligibility[skill].castsWhenEligible,
          eligibility[skill].eligibleTurns,
        ),
      },
    ]),
  ),
  aiProvisionShortagePercent: pct(aiShortages, aiUpkeeps),
  aiMarches,
  aiStatecraft: aiActions,
  // Share of all tactic casts per tactic, to confirm every tactic is actually used.
  tacticMixPercent: Object.fromEntries(
    Object.entries(tacticCasts).map(([skill, count]) => [
      skill,
      pct(
        count,
        Object.values(tacticCasts).reduce((a, b) => a + b, 0),
      ),
    ]),
  ),
  coalitionRuns: pct(campaigns.filter((c) => Number(c.coalitions) > 0).length, campaigns.length),
  // Runs in which someone actually reached the coalition threshold of ten cities.
  coalitionInRunsWithLeader: pct(
    campaigns.filter((c) => Number(c.peakCities) >= 10 && Number(c.coalitions) > 0).length,
    campaigns.filter((c) => Number(c.peakCities) >= 10).length,
  ),
  // The highest number of prisoners any AI house held at a month end (bounded by the AI policy).
  maxAiCaptives: Math.max(0, ...campaigns.map((c) => Number(c.maxAiCaptives))),
  playerCapturesPerCampaign:
    Math.round((sum((c) => Number(c.captures)) * 10) / campaigns.length) / 10,
  autoResolveMs: { median: median(autoResolveMs), p95: percentile(autoResolveMs, 0.95) },
};
mkdirSync(outputDir, { recursive: true });
const output = join(outputDir, process.env.DIAGNOSTIC_FILE ?? 'bot.json');
writeFileSync(
  output,
  JSON.stringify({ months, seeds, presets, scenarios: scenarioIds, summary, campaigns }, null, 2) +
    '\n',
);
if (process.env.DIAGNOSTIC_BATTLES === '1')
  writeFileSync(join(outputDir, 'bot-battles.json'), JSON.stringify(battles) + '\n');
console.log(JSON.stringify({ output, summary }, null, 2));
