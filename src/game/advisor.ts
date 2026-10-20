import { INITIAL_OFFICERS, activateScenario } from '../content/scenario';
import { hasTrait } from '../content/traits';
import { isActiveOfficer, isRuler } from './officers';
import type { GameState } from './types';
import {
  HEGEMON_CAPITAL,
  allied,
  factionName,
  getRivalHegemon,
  monthlyHarvest,
  serving,
  strength,
} from './world';

/**
 * A pure, RNG-free monthly adviser: it only reads the state, so asking never changes a game.
 * Suggestions are ranked by urgency and capped at three.
 */
export type AdviceKind =
  'rivalHegemon' | 'openingBorder' | 'food' | 'atRisk' | 'weakBorder' | 'idle';
export interface Advice {
  kind: AdviceKind;
  cityId: string;
  officerId?: string;
  /** Larger is more urgent. */
  urgency: number;
  /** Numbers and names for the message template. */
  params: Record<string, string | number>;
}
export const ADVICE_LIMIT = 3;
const FOOD_MONTHS = 2;
const ATRISK_LOYALTY = 40;
const BORDER_RATIO = 1.5;
const IDLE_RESERVE = 300;
/** Beats every other advice: a rival is about to end the campaign. */
const RIVAL_HEGEMON_URGENCY = 5;
/** In the first month a neighbour that can already beat a city is the most urgent thing to know. */
const OPENING_BORDER_URGENCY = 5;
export const GOAL_MONTHS = 6;

export function getAdvice(state: GameState): Advice[] {
  activateScenario(state.scenarioId);
  const advice: Advice[] = [];
  const rival = getRivalHegemon(state);
  if (rival)
    advice.push({
      kind: 'rivalHegemon',
      cityId: HEGEMON_CAPITAL,
      urgency: RIVAL_HEGEMON_URGENCY,
      params: { faction: factionName(rival.factionId), months: rival.monthsLeft },
    });
  const mine = state.cities.filter((c) => c.factionId === state.playerFactionId);
  // The harvest due when this month ends counts: a city about to be fed is not in want.
  const nextMonth = (state.month % 12) + 1;
  for (const city of mine) {
    const upkeep = Math.ceil(strength(state, city) * 0.12);
    if (city.food + monthlyHarvest(city, nextMonth) < upkeep * FOOD_MONTHS)
      advice.push({
        kind: 'food',
        cityId: city.id,
        urgency: city.food < upkeep ? 4 : 3,
        params: { city: city.name, food: city.food, upkeep },
      });
    const own = strength(state, city);
    const threat = city.neighbors
      .map((id) => state.cities.find((c) => c.id === id)!)
      .filter(
        (c) =>
          c.factionId !== null &&
          c.factionId !== state.playerFactionId &&
          !allied(state, state.playerFactionId, c.factionId),
      )
      .sort((a, b) => strength(state, b) - strength(state, a) || a.id.localeCompare(b.id))[0];
    if (threat && strength(state, threat) > BORDER_RATIO * Math.max(1, own))
      advice.push({
        kind: state.turn === 0 ? 'openingBorder' : 'weakBorder',
        cityId: city.id,
        urgency: state.turn === 0 ? OPENING_BORDER_URGENCY : 2,
        params: {
          city: city.name,
          enemy: threat.name,
          troops: strength(state, threat),
          // Rivals march from month 2, or from the month after the opening truce ends.
          month: Math.max(1, state.truceUntilTurn) + 1,
        },
      });
    const idle = serving(state, city)
      .filter((o) => !o.busy && o.troops === 0)
      .sort((a, b) => b.force - a.force || a.id.localeCompare(b.id))[0];
    if (idle && city.reserve >= IDLE_RESERVE)
      advice.push({
        kind: 'idle',
        cityId: city.id,
        officerId: idle.id,
        urgency: 1,
        params: { officer: idle.name, city: city.name, reserve: city.reserve },
      });
  }
  for (const officer of state.officers) {
    if (
      officer.factionId !== state.playerFactionId ||
      officer.captive ||
      !isActiveOfficer(officer) ||
      isRuler(officer) ||
      hasTrait(officer.id, 'loyal') ||
      officer.loyalty >= ATRISK_LOYALTY
    )
      continue;
    advice.push({
      kind: 'atRisk',
      cityId: officer.cityId,
      officerId: officer.id,
      urgency: 3,
      params: { officer: officer.name, loyalty: officer.loyalty },
    });
  }
  return advice
    .sort((a, b) => b.urgency - a.urgency || a.cityId.localeCompare(b.cityId))
    .slice(0, ADVICE_LIMIT);
}

export const GOAL_IDS = ['develop', 'muster', 'recruit', 'capture', 'supply'] as const;
export type GoalId = (typeof GOAL_IDS)[number];
export interface Goal {
  id: GoalId;
  done: boolean;
}

/** Which first-campaign goals are done right now, whatever the month (pure; no RNG). */
export function goalStatus(state: GameState): Goal[] {
  activateScenario(state.scenarioId);
  const mine = state.cities.filter((c) => c.factionId === state.playerFactionId);
  const officers = state.officers.filter(
    (o) => o.factionId === state.playerFactionId && !o.captive && isActiveOfficer(o),
  );
  const started = INITIAL_OFFICERS.filter((o) => o.factionId === state.playerFactionId).length;
  const supplied = mine.every(
    (city) => city.food >= Math.ceil(strength(state, city) * 0.12) * FOOD_MONTHS,
  );
  return [
    { id: 'develop', done: state.stats.commandsIssued >= 3 },
    { id: 'muster', done: officers.some((o) => o.troops >= 1500) },
    { id: 'recruit', done: officers.length > started },
    { id: 'capture', done: state.stats.citiesCaptured >= 1 },
    { id: 'supply', done: supplied },
  ];
}

/** Optional first-campaign goals: tracked for the first six months only (otherwise null). */
export function getGoals(state: GameState): Goal[] | null {
  return state.turn >= GOAL_MONTHS ? null : goalStatus(state);
}
