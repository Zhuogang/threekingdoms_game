import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deepStrictEqual } from 'node:assert';
import { FACTIONS } from '../src/content/scenario';
import { createGame, dispatch, validateState } from '../src/game/campaign';
import {
  RIVAL_AGGRESSIONS,
  ATTACK_MULTIPLIERS,
  attackSafeguards,
  attackWilling,
  type CampaignObserver,
} from '../src/game/aiPolicy';
import type { GameCommand, GameState } from '../src/game/types';

const baseline = process.env.DIAGNOSTIC_BASELINE === '1';
const outputDir = process.env.DIAGNOSTIC_OUTPUT ?? '.artifacts/ai-diagnostics';
const months = Number(process.env.DIAGNOSTIC_MONTHS ?? 24);
if (!Number.isInteger(months) || months < 1 || months > 24)
  throw new Error('DIAGNOSTIC_MONTHS must be an integer between 1 and 24.');
const seeds = Array.from({ length: 10 }, (_, index) => 1001 + index);
const presets = baseline ? (['balanced'] as const) : RIVAL_AGGRESSIONS;
const results: Record<string, unknown>[] = [];

for (const faction of FACTIONS) {
  for (const preset of presets) {
    for (const seed of seeds) {
      let state = createGame(faction.id, seed, preset);
      const initialRivals = FACTIONS.filter(
        (rival) =>
          rival.id !== faction.id && state.cities.some((city) => city.factionId === rival.id),
      ).map((rival) => rival.id);
      let firstWar: number | null = null;
      let firstYearAttacks = 0;
      let firstYearFactionMonths = 0;
      const counters = {
        attacks: 0,
        factionMonths: 0,
        captures: 0,
        holds: 0,
        cityUpkeeps: 0,
        shortages: 0,
        willingDecisions: 0,
        reserveBlocks: 0,
        foodBlocks: 0,
        overlapBlocks: 0,
        frozenCandidates: 0,
        frozenCautious: 0,
        frozenBalanced: 0,
        frozenAggressive: 0,
      };
      const checkpoints: Record<number, { eliminated: number; observed: boolean }> = {};
      const observer: CampaignObserver = {
        aiFactionMonth: () => {
          counters.factionMonths++;
          if (state.turn < 12) firstYearFactionMonths++;
        },
        aiCandidate: (candidate) => {
          counters.frozenCandidates++;
          if (attackWilling(candidate, 'cautious')) counters.frozenCautious++;
          if (attackWilling(candidate, 'balanced')) counters.frozenBalanced++;
          if (attackWilling(candidate, 'aggressive')) counters.frozenAggressive++;
        },
        aiDecision: (candidate) => {
          counters.willingDecisions++;
          const safeguard = attackSafeguards(candidate);
          if (!safeguard.reserves) counters.reserveBlocks++;
          if (!safeguard.food) counters.foodBlocks++;
          if (!safeguard.reserves && !safeguard.food) counters.overlapBlocks++;
        },
        aiMarch: () => {
          counters.attacks++;
          if (state.turn < 12) firstYearAttacks++;
          firstWar ??= state.turn;
        },
        aiUpkeep: ({ shortage }) => {
          counters.cityUpkeeps++;
          if (shortage) counters.shortages++;
        },
        battleResult: ({ attackerId, captured }) => {
          if (attackerId !== faction.id) {
            if (captured) counters.captures++;
            else counters.holds++;
          }
        },
      };
      const apply = (command: GameCommand) => {
        const unobserved = dispatch(state, command);
        const result = dispatch(state, command, observer);
        deepStrictEqual(result, unobserved, 'Diagnostic observation changed gameplay.');
        if (!result.ok) throw new Error(`${faction.id}/${preset}/${seed}: ${result.error}`);
        state = result.state;
        const error = validateState(state);
        if (error) throw new Error(`${faction.id}/${preset}/${seed}, turn ${state.turn}: ${error}`);
      };
      for (let month = 0; month < months && state.phase !== 'finished'; month++) {
        apply({ type: 'endMonth' });
        for (let guard = 0; state.phase === 'battle'; guard++) {
          if (guard >= 60) throw new Error('Unbounded monthly battle resolution.');
          apply({ type: 'battleAuto' });
        }
        if ([6, 12, 24].includes(state.turn)) {
          const eliminated = initialRivals.filter(
            (id) => !state.cities.some((city) => city.factionId === id),
          ).length;
          checkpoints[state.turn] = { eliminated, observed: true };
        }
      }
      results.push({
        faction: faction.id,
        preset,
        seed,
        monthsObserved: state.turn,
        finished: state.phase === 'finished',
        firstWar,
        initialRivals: initialRivals.length,
        firstYearAttacks,
        firstYearFactionMonths,
        checkpoints,
        stoodDownOrCancelled: counters.attacks - counters.captures - counters.holds,
        ...counters,
      });
    }
  }
}
const summaries = presets.map((preset) => {
  const runs = results.filter((result) => result.preset === preset);
  const sum = (key: string) => runs.reduce((total, run) => total + Number(run[key]), 0);
  const rate = (numerator: string, denominator: string) =>
    sum(denominator) ? (sum(numerator) * 100) / sum(denominator) : null;
  const firstWars = runs
    .map((run) => run.firstWar)
    .filter((turn): turn is number => turn !== null)
    .sort((a, b) => a - b);
  return {
    preset,
    runs: runs.length,
    endedRuns: runs.filter((run) => run.finished).length,
    attackRate: rate('attacks', 'factionMonths'),
    firstYearAttackRate: rate('firstYearAttacks', 'firstYearFactionMonths'),
    shortageRate: rate('shortages', 'cityUpkeeps'),
    firstWarMedian: firstWars.length ? firstWars[Math.floor(firstWars.length / 2)] : null,
    noAttackRuns: runs.length - firstWars.length,
    captures: sum('captures'),
    holds: sum('holds'),
    stoodDownOrCancelled: sum('stoodDownOrCancelled'),
    factionMonths: sum('factionMonths'),
    cityUpkeeps: sum('cityUpkeeps'),
    shortages: sum('shortages'),
    willingDecisions: sum('willingDecisions'),
    reserveBlocks: sum('reserveBlocks'),
    foodBlocks: sum('foodBlocks'),
    overlapBlocks: sum('overlapBlocks'),
    frozenCandidates: sum('frozenCandidates'),
    frozenCautious: sum('frozenCautious'),
    frozenBalanced: sum('frozenBalanced'),
    frozenAggressive: sum('frozenAggressive'),
    eliminations: [6, 12, 24].map((month) => {
      const observed = runs.filter((run) => (run.checkpoints as Record<number, unknown>)[month]);
      return {
        month,
        observedRuns: observed.length,
        eliminated: observed.reduce(
          (total, run) =>
            total + (run.checkpoints as Record<number, { eliminated: number }>)[month]!.eliminated,
          0,
        ),
        initiallyActiveRivals: observed.reduce(
          (total, run) => total + Number(run.initialRivals),
          0,
        ),
      };
    }),
  };
});
mkdirSync(outputDir, { recursive: true });
const output = join(outputDir, baseline ? 'baseline.json' : 'current.json');
writeFileSync(
  output,
  JSON.stringify(
    {
      baseline,
      configuredMultipliers: ATTACK_MULTIPLIERS,
      months,
      playerPolicy: 'End Month; auto-resolve every player battle',
      seeds,
      summaries,
      results,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ output, summaries }, null, 2));
