import type { V03DomainEvent, V03GameState } from '../types';

export function eventTier(
  state: V03GameState,
  event: V03DomainEvent,
): 'critical' | 'notice' | 'chronicle' {
  if (event.tier) return event.tier;
  if (event.kind === 'battleReady' || event.kind === 'battleResolved') {
    const battle = state.battles.find((entry) => entry.id === event.entityId);
    return battle &&
      (battle.attackerFactionId === state.playerFactionId ||
        battle.defenderFactionId === state.playerFactionId)
      ? 'critical'
      : 'chronicle';
  }
  if (event.kind === 'monthBoundary') return 'notice';
  if (event.kind === 'journeyArrival') {
    return state.journeys.find((entry) => entry.id === event.entityId)?.ownerFactionId ===
      state.playerFactionId
      ? 'notice'
      : 'chronicle';
  }
  return 'critical';
}

export function isCriticalReport(state: V03GameState, event: V03DomainEvent): boolean {
  return (
    !event.acknowledged &&
    event.absoluteDay <= state.absoluteDay &&
    eventTier(state, event) === 'critical'
  );
}

/** A battle the player commands by hand is in progress. */
export function playerCommandsBattle(state: V03GameState): boolean {
  return state.battles.some(
    (battle) =>
      battle.active &&
      !battle.autoCommand &&
      (battle.attackerFactionId === state.playerFactionId ||
        battle.defenderFactionId === state.playerFactionId),
  );
}

/**
 * While the player commands a battle, only battle reports (a new or handed-back battle, a
 * result) stop the battle day. Other reports wait in the inbox until the field is quiet.
 */
export function stopsBattleDay(state: V03GameState, event: V03DomainEvent): boolean {
  return (
    isCriticalReport(state, event) &&
    (event.kind === 'battleReady' || event.kind === 'battleResolved')
  );
}

/** Reports the player must acknowledge before time moves on, given what is happening now. */
export function reportBlocksAdvance(state: V03GameState, event: V03DomainEvent): boolean {
  return playerCommandsBattle(state)
    ? stopsBattleDay(state, event)
    : isCriticalReport(state, event);
}

export function recordEvent(
  state: V03GameState,
  event: Omit<V03DomainEvent, 'id' | 'absoluteDay' | 'acknowledged'>,
): V03DomainEvent {
  const record: V03DomainEvent = {
    ...event,
    id: `${state.scenarioId}:${event.kind}:${state.nextId++}`,
    absoluteDay: state.absoluteDay,
    acknowledged: false,
  };
  state.events.push(record);
  return record;
}
