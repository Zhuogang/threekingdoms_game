import { FACTIONS } from '../content/scenario';
import { isActiveOfficer } from './officers';
import { PLUNDER_COOLDOWN_MONTHS, plunderOutcome, type PlunderOutcome } from './plunder';
import type { City, GameState, Officer } from './types';

/** Small, pure-ish helpers shared by the campaign rules, the events and the advisor. */
export const MAX_TROOPS = 5000;
export const RESOURCE_CAP = 9999999;
export const bounded = (n: number, max: number, min = 0) =>
  Math.max(min, Math.min(max, Math.floor(n)));
export const factionName = (id: string | null) =>
  FACTIONS.find((f) => f.id === id)?.name ?? 'Independent cities';
export const owns = (city: City | undefined, factionId: string): city is City =>
  !!city && city.factionId === factionId;
export const serving = (state: GameState, city: City) =>
  state.officers.filter(
    (o) =>
      o.cityId === city.id && o.factionId === city.factionId && !o.captive && isActiveOfficer(o),
  );
export const strength = (state: GameState, city: City) =>
  serving(state, city).reduce((total, o) => total + o.troops, city.reserve);
export const allied = (state: GameState, a: string, b: string | null) =>
  b !== null &&
  state.alliances.some(
    (p) => p.untilTurn > state.turn && ((p.a === a && p.b === b) || (p.b === a && p.a === b)),
  );
export function chooseGovernor(state: GameState, city: City): void {
  if (city.factionId === null) {
    city.governorId = null;
    return;
  }
  const current = state.officers.find((o) => o.id === city.governorId);
  if (
    !current ||
    current.cityId !== city.id ||
    current.factionId !== city.factionId ||
    current.captive
  ) {
    city.governorId =
      serving(state, city).sort((a, b) => b.intellect - a.intellect || a.id.localeCompare(b.id))[0]
        ?.id ?? null;
  }
}
export const bordersFaction = (state: GameState, a: string, b: string): boolean =>
  state.cities.some(
    (city) =>
      city.factionId === a &&
      city.neighbors.some((id) => state.cities.find((c) => c.id === id)?.factionId === b),
  );
/** The faction with the most cities (ties break by id), or null when nothing is held. */
export function strongestFaction(state: GameState): string | null {
  const counts = FACTIONS.map((f) => ({
    id: f.id,
    cities: state.cities.filter((c) => c.factionId === f.id).length,
  })).sort((a, b) => b.cities - a.cities || a.id.localeCompare(b.id));
  return counts[0] && counts[0].cities > 0 ? counts[0].id : null;
}

/**
 * Ruin `target` and deliver the loot to `destination` (the same city for plunder
 * and sack; the raiders' home for a raid). Sets the target's plunder cooldown.
 */
export function applyPlunder(
  state: Pick<GameState, 'turn'>,
  target: City,
  destination: City,
  leader: Pick<Officer, 'intellect' | 'force'> & { id?: string },
): PlunderOutcome {
  const outcome = plunderOutcome(target, leader);
  destination.gold = bounded(destination.gold + outcome.gold, RESOURCE_CAP);
  destination.food = bounded(destination.food + outcome.food, RESOURCE_CAP);
  Object.assign(target, outcome.after);
  target.plunderCooldownUntil = state.turn + PLUNDER_COOLDOWN_MONTHS;
  return outcome;
}
