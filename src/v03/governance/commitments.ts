import type { V03GameState } from '../types';

/** The global phase is a save cursor, not authority over unrelated resources. */
export function isCityCommitted(
  state: Pick<V03GameState, 'battles' | 'journeys'>,
  cityId: string,
): boolean {
  return state.battles.some(
    (battle) =>
      battle.active &&
      state.journeys.some(
        (journey) =>
          journey.id === battle.attackerJourneyId && journey.destinationCityId === cityId,
      ),
  );
}

export function isOfficerCommitted(
  state: Pick<V03GameState, 'officers' | 'battles' | 'journeys'>,
  officerId: string,
): boolean {
  const officer = state.officers.find((entry) => entry.id === officerId);
  if (!officer) return false;
  if (officer.location.kind === 'battle')
    return state.battles.some(
      (battle) =>
        battle.active &&
        officer.location.kind === 'battle' &&
        battle.id === officer.location.battleId,
    );
  return officer.location.kind === 'city' && isCityCommitted(state, officer.location.cityId);
}

export const CITY_COMMITTED_REASON = 'This city is committed to an active battle.';
export const OFFICER_COMMITTED_REASON = 'This officer is committed to an active battle.';
