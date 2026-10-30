import { availableReserveTroops } from '../campaign/personnel';
import { applyV03CityAction } from './city-actions';
import { isOfficerReservedForOrder } from './commitments';
import type { V03GameState } from '../types';

const OFFICER_CAPACITY = 10_000;

/**
 * Free convenience over the ordinary assignment rule: move matching reserve soldiers to the
 * stationed officers, strongest commanders first, each up to the 10,000 healthy-plus-wounded
 * limit. Every step is the normal `assign-troops` action, so its checks and costs still apply.
 */
export function fillOfficersFromReserve(
  state: V03GameState,
  cityId: string,
): { ok: boolean; state: V03GameState; assigned: number; error?: string } {
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city || city.factionId !== state.playerFactionId)
    return { ok: false, state, assigned: 0, error: 'Choose one of your cities.' };
  const officers = state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === city.factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === cityId &&
        officer.reorganizationDays === 0 &&
        !isOfficerReservedForOrder(state, officer.id),
    )
    .sort((a, b) => b.force - a.force || a.id.localeCompare(b.id));
  let current = state;
  let assigned = 0;
  for (const { id } of officers) {
    const officer = current.officers.find((entry) => entry.id === id)!;
    const room = OFFICER_CAPACITY - officer.troops - officer.wounded;
    const add = Math.min(room, availableReserveTroops(current, cityId, officer.troopType));
    if (add <= 0) continue;
    const result = applyV03CityAction(current, {
      cityId,
      action: 'assign-troops',
      officerId: id,
      amount: officer.troops + add,
    });
    if (!result.ok) continue;
    current = result.state;
    assigned += add;
  }
  return assigned > 0
    ? { ok: true, state: current, assigned }
    : {
        ok: false,
        state,
        assigned: 0,
        error: 'No reserve soldiers match the officers stationed here.',
      };
}
