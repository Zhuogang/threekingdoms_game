import {
  acceptV03CoalitionInvitation,
  createV03Alliance,
  isV03AllianceActive,
} from './monthly-systems';
import { ROUTE_DEFINITIONS } from '../geography';
import { rulerTemperament } from '../ai/temperament';
import type { V03GameState } from '../types';

const clone = (state: V03GameState): V03GameState => structuredClone(state);

function nextRandom(state: V03GameState, max: number): number {
  let value = state.rng || 190;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rng = value >>> 0;
  return state.rng % max;
}

function addDiplomacyEvent(state: V03GameState, factionId: string, title: string, detail: string) {
  const id = `${state.scenarioId}:diplomacy:${state.absoluteDay}:${state.nextId}`;
  state.events.push({
    id,
    absoluteDay: state.absoluteDay,
    kind: 'diplomacy',
    title,
    detail,
    entityId: factionId,
    acknowledged: false,
  });
  state.nextId++;
}

function borders(state: V03GameState, a: string, b: string): boolean {
  const ownedByA = new Set(
    state.cities.filter((city) => city.factionId === a).map((city) => city.id),
  );
  const ownedByB = new Set(
    state.cities.filter((city) => city.factionId === b).map((city) => city.id),
  );
  return ROUTE_DEFINITIONS.some(
    (route) =>
      (ownedByA.has(route.fromCityId) && ownedByB.has(route.toCityId)) ||
      (ownedByA.has(route.toCityId) && ownedByB.has(route.fromCityId)),
  );
}

function strongestFaction(state: V03GameState): string | null {
  return (
    [...state.factions]
      .filter((faction) => !faction.eliminated)
      .map((faction) => ({
        id: faction.id,
        count: state.cities.filter((city) => city.factionId === faction.id).length,
      }))
      .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))[0]?.id ?? null
  );
}

/** A broken treaty weighs on every later proposal for this many months. */
export const V03_TREATY_BREAK_MONTHS = 24;
/** Armies this close to their target when a treaty is signed press on and fight. */
export const V03_ALLIANCE_RECALL_MIN_DAYS = 5;

export type V03AllianceFactorCode =
  | 'base'
  | 'common-enemy'
  | 'target-strongest'
  | 'player-strongest'
  | 'army-marching'
  | 'treaty-broken'
  | 'benevolent-ruler'
  | 'fierce-ruler'
  | 'small-house';

/** Each term of an alliance offer's acceptance chance, in display order. */
export function getV03AllianceFactors(
  state: V03GameState,
  targetFactionId: string,
): { code: V03AllianceFactorCode; points: number }[] {
  const leader = state.officers.find(
    (officer) =>
      officer.id ===
      state.factions.find((faction) => faction.id === state.playerFactionId)?.leaderOfficerId,
  );
  const factors: { code: V03AllianceFactorCode; points: number }[] = [
    { code: 'base', points: 40 + Math.floor((leader?.intellect ?? 0) / 2) },
  ];
  const strongest = strongestFaction(state);
  if (
    strongest &&
    state.playerFactionId !== strongest &&
    targetFactionId !== strongest &&
    borders(state, state.playerFactionId, strongest) &&
    borders(state, targetFactionId, strongest)
  )
    factors.push({ code: 'common-enemy', points: 20 });
  if (targetFactionId === strongest) factors.push({ code: 'target-strongest', points: -30 });
  const cities = (factionId: string) =>
    state.cities.filter((city) => city.factionId === factionId).length;
  const playerCities = cities(state.playerFactionId);
  if (
    state.factions.every(
      (faction) =>
        faction.id === state.playerFactionId ||
        faction.eliminated ||
        cities(faction.id) < playerCities,
    )
  )
    factors.push({ code: 'player-strongest', points: -30 });
  if (
    state.journeys.some(
      (journey) =>
        journey.kind === 'campaign' &&
        journey.ownerFactionId === targetFactionId &&
        ['outbound', 'waiting'].includes(journey.status) &&
        !journey.returnRequested &&
        state.cities.find((city) => city.id === journey.destinationCityId)?.factionId ===
          state.playerFactionId,
    )
  )
    factors.push({ code: 'army-marching', points: -30 });
  const brokeMonth = state.lastAllianceBreakMonthByFaction[state.playerFactionId];
  if (brokeMonth !== undefined && state.monthIndex - brokeMonth < V03_TREATY_BREAK_MONTHS)
    factors.push({ code: 'treaty-broken', points: -30 });
  const temperament = rulerTemperament(state, targetFactionId);
  if (temperament.traits.includes('benevolent'))
    factors.push({ code: 'benevolent-ruler', points: 10 });
  if (temperament.traits.includes('fierce')) factors.push({ code: 'fierce-ruler', points: -10 });
  if (playerCities <= 2) factors.push({ code: 'small-house', points: 15 });
  return factors;
}

export function getV03AllianceChance(state: V03GameState, targetFactionId: string): number {
  const chance = getV03AllianceFactors(state, targetFactionId).reduce(
    (sum, factor) => sum + factor.points,
    0,
  );
  return Math.max(5, Math.min(90, chance));
}

/**
 * A new treaty turns back campaigns between the two houses that are still more than five
 * days from their target; closer armies press on, so a treaty is no instant shield.
 */
function recallCampaignsForTreaty(
  state: V03GameState,
  isTreatyPair: (attackerFactionId: string, defenderFactionId: string) => boolean,
): void {
  for (const journey of state.journeys) {
    if (journey.kind !== 'campaign' || !['outbound', 'waiting'].includes(journey.status)) continue;
    const destination = state.cities.find((city) => city.id === journey.destinationCityId);
    if (!destination?.factionId || !isTreatyPair(journey.ownerFactionId, destination.factionId))
      continue;
    if (journey.expectedArrivalDay - state.absoluteDay <= V03_ALLIANCE_RECALL_MIN_DAYS)
      journey.pressesThroughTreaty = true;
    else journey.returnRequested = true;
  }
}

export function hasProposedV03AllianceThisMonth(
  state: V03GameState,
  targetFactionId: string,
): boolean {
  return state.lastAllianceProposalMonthByTarget?.[targetFactionId] === state.monthIndex;
}

export function proposeV03Alliance(
  state: V03GameState,
  targetFactionId: string,
): { ok: boolean; state: V03GameState; message?: string; error?: string; chance?: number } {
  const target = state.factions.find((faction) => faction.id === targetFactionId);
  if (state.phase === 'finished')
    return { ok: false, state, error: 'Diplomacy can only be changed during campaign planning.' };
  if (!target || target.eliminated || targetFactionId === state.playerFactionId)
    return { ok: false, state, error: 'Choose another active faction.' };
  if (
    isV03AllianceActive(state.alliances, state.playerFactionId, targetFactionId, state.monthIndex)
  )
    return { ok: false, state, error: 'An alliance with this ruler is already active.' };
  if (hasProposedV03AllianceThisMonth(state, targetFactionId))
    return {
      ok: false,
      state,
      error: 'You can propose an alliance to this faction again next month.',
    };

  const next = clone(state);
  (next.lastAllianceProposalMonthByTarget ??= {})[targetFactionId] = next.monthIndex;
  const chance = getV03AllianceChance(next, targetFactionId);
  const accepted = nextRandom(next, 100) < chance;
  if (accepted) {
    const result = createV03Alliance(
      next.alliances,
      next.playerFactionId,
      targetFactionId,
      next.monthIndex,
      next.factions.map((faction) => faction.id),
    );
    if (!result.ok) return { ok: false, state, error: 'This alliance cannot be formed.' };
    next.alliances = result.alliances;
    recallCampaignsForTreaty(
      next,
      (attacker, defender) =>
        (attacker === next.playerFactionId && defender === targetFactionId) ||
        (attacker === targetFactionId && defender === next.playerFactionId),
    );
    for (const directive of next.directives) {
      if (!['requested', 'proposed', 'waiting', 'accepted', 'reserved'].includes(directive.status))
        continue;
      const destination = next.cities.find((city) => city.id === directive.targetCityId);
      if (
        (directive.factionId === next.playerFactionId &&
          destination?.factionId === targetFactionId) ||
        (directive.factionId === targetFactionId && destination?.factionId === next.playerFactionId)
      ) {
        directive.status = 'cancelled';
        directive.message = 'The directive was cancelled when a six-month alliance took effect.';
      }
    }
  }
  addDiplomacyEvent(
    next,
    targetFactionId,
    accepted ? 'Alliance accepted' : 'Alliance declined',
    `${accepted ? 'accepted' : 'declined'}:${chance}`,
  );
  next.revision++;
  return {
    ok: true,
    state: next,
    chance,
    message: accepted
      ? 'A six-month alliance was formed.'
      : `The alliance offer was declined (${chance}% chance).`,
  };
}

export function breakV03Alliance(
  state: V03GameState,
  targetFactionId: string,
): { ok: boolean; state: V03GameState; message?: string; error?: string } {
  if (state.phase === 'finished')
    return { ok: false, state, error: 'Diplomacy can only be changed during campaign planning.' };
  if (
    !isV03AllianceActive(state.alliances, state.playerFactionId, targetFactionId, state.monthIndex)
  )
    return { ok: false, state, error: 'There is no active alliance with this faction.' };
  const next = clone(state);
  next.alliances = next.alliances.filter(
    (alliance) =>
      !(
        (alliance.a === next.playerFactionId && alliance.b === targetFactionId) ||
        (alliance.b === next.playerFactionId && alliance.a === targetFactionId)
      ),
  );
  next.lastAllianceBreakMonthByFaction[next.playerFactionId] = next.monthIndex;
  (next.lastAllianceProposalMonthByTarget ??= {})[targetFactionId] = next.monthIndex;
  addDiplomacyEvent(next, targetFactionId, 'Alliance broken', 'broken');
  next.revision++;
  return { ok: true, state: next, message: 'The alliance has ended.' };
}

export function acceptV03Invitation(
  state: V03GameState,
  invitationId: string,
): { ok: boolean; state: V03GameState; message?: string; error?: string } {
  if (state.phase === 'finished')
    return { ok: false, state, error: 'Diplomacy can only be changed during campaign planning.' };
  const invitation = state.coalitionInvitations.find((entry) => entry.id === invitationId);
  if (!invitation || invitation.expiresMonthIndex <= state.monthIndex)
    return { ok: false, state, error: 'This coalition invitation has expired.' };
  if (invitation.targetFactionId === state.playerFactionId)
    return { ok: false, state, error: 'This invitation is addressed to another faction.' };
  const next = clone(state);
  next.alliances = acceptV03CoalitionInvitation(
    invitation,
    next.alliances,
    next.playerFactionId,
    next.monthIndex,
    next.factions.filter((faction) => !faction.eliminated).map((faction) => faction.id),
  );
  recallCampaignsForTreaty(next, (attacker, defender) =>
    isV03AllianceActive(next.alliances, attacker, defender, next.monthIndex),
  );
  next.coalitionInvitations = next.coalitionInvitations.filter(
    (entry) => entry.id !== invitation.id,
  );
  addDiplomacyEvent(next, next.playerFactionId, 'Coalition joined', 'joined');
  next.revision++;
  return { ok: true, state: next, message: 'The coalition alliance is active for six months.' };
}
