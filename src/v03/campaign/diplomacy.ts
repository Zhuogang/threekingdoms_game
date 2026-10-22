import {
  acceptV03CoalitionInvitation,
  createV03Alliance,
  isV03AllianceActive,
} from './monthly-systems';
import { ROUTE_DEFINITIONS } from '../geography';
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

export function getV03AllianceChance(state: V03GameState, targetFactionId: string): number {
  const leader = state.officers.find(
    (officer) =>
      officer.id ===
      state.factions.find((faction) => faction.id === state.playerFactionId)?.leaderOfficerId,
  );
  const intellect = leader?.intellect ?? 0;
  const strongest = strongestFaction(state);
  let chance = 40 + Math.floor(intellect / 2);
  if (
    strongest &&
    state.playerFactionId !== strongest &&
    targetFactionId !== strongest &&
    borders(state, state.playerFactionId, strongest) &&
    borders(state, targetFactionId, strongest)
  )
    chance += 20;
  if (targetFactionId === strongest) chance -= 30;
  const brokeMonth = state.lastAllianceBreakMonthByFaction[state.playerFactionId];
  if (brokeMonth !== undefined && state.monthIndex - brokeMonth < 12) chance -= 20;
  return Math.max(5, Math.min(90, chance));
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

  const next = clone(state);
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
    for (const journey of next.journeys) {
      if (journey.kind !== 'campaign' || !['outbound', 'waiting'].includes(journey.status))
        continue;
      const destination = next.cities.find((city) => city.id === journey.destinationCityId);
      if (
        (journey.ownerFactionId === next.playerFactionId &&
          destination?.factionId === targetFactionId) ||
        (journey.ownerFactionId === targetFactionId &&
          destination?.factionId === next.playerFactionId)
      )
        journey.returnRequested = true;
    }
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
  for (const journey of next.journeys) {
    if (journey.kind !== 'campaign' || !['outbound', 'waiting'].includes(journey.status)) continue;
    const destination = next.cities.find((city) => city.id === journey.destinationCityId);
    if (
      destination?.factionId &&
      isV03AllianceActive(
        next.alliances,
        journey.ownerFactionId,
        destination.factionId,
        next.monthIndex,
      )
    )
      journey.returnRequested = true;
  }
  next.coalitionInvitations = next.coalitionInvitations.filter(
    (entry) => entry.id !== invitation.id,
  );
  addDiplomacyEvent(next, next.playerFactionId, 'Coalition joined', 'joined');
  next.revision++;
  return { ok: true, state: next, message: 'The coalition alliance is active for six months.' };
}
