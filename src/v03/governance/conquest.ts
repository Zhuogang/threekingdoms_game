import { canAppointGovernor } from './authority';
import {
  cancelPendingGovernorAppointment,
  installGovernor,
  installPersonalRule,
  queueGovernorAppointment,
} from './appointments';
import { isCityCommitted } from './commitments';
import { recordEvent } from '../campaign/reports';
import type { GovernanceOrderServices } from './orders';
import type { V03Command, V03GameState } from '../types';

export function pendingCityGovernance(state: V03GameState) {
  if (state.phase === 'finished') return [];
  return state.events.filter(
    (event) =>
      event.params?.governancePending === true &&
      event.battleOutcome?.cityCaptured &&
      event.battleOutcome.cityId !== state.playerCapitalCityId &&
      state.cities.some(
        (city) =>
          city.id === event.battleOutcome!.cityId && city.factionId === state.playerFactionId,
      ),
  );
}

export function personalRuleReason(state: V03GameState, cityId: string): string | null {
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city || city.factionId !== state.playerFactionId)
    return 'You can appoint a governor only to one of your own cities.';
  if (isCityCommitted(state, cityId)) return 'This city is committed to an active battle.';
  const ruler = state.officers.find(
    (officer) =>
      officer.id ===
      state.factions.find((faction) => faction.id === state.playerFactionId)?.leaderOfficerId,
  );
  if (!ruler?.alive || ruler.location.kind !== 'city' || ruler.location.cityId !== cityId)
    return 'The ruler must arrive in this city before governing it personally.';
  return null;
}

export function resolveCityGovernance(
  state: V03GameState,
  command: Extract<V03Command, { type: 'resolveCityGovernance' }>,
  services: GovernanceOrderServices,
) {
  const fail = (error: string) => ({ ok: false, state, error });
  const event = state.events.find((entry) => entry.id === command.eventId);
  if (!event?.battleOutcome?.cityCaptured)
    return fail('This city governance decision is no longer available.');
  if (event.params?.governancePending !== true) return { ok: true, state };
  if (!pendingCityGovernance(state).some((entry) => entry.id === event.id))
    return fail('This city governance decision is no longer available.');
  const cityId = event.battleOutcome.cityId;
  const rulerId = state.factions.find(
    (faction) => faction.id === state.playerFactionId,
  )!.leaderOfficerId;
  let next: V03GameState;
  if (command.choice === 'self') {
    const reason = personalRuleReason(state, cityId);
    if (reason) return fail(reason);
    next = structuredClone(state);
    const city = next.cities.find((entry) => entry.id === cityId)!;
    cancelPendingGovernorAppointment(next, cityId, 'the ruler chose to govern the city personally');
    installPersonalRule(next, city);
    next.revision++;
    next.governanceRevision++;
  } else {
    if (command.choice !== 'governor' || !command.officerId || command.officerId === rulerId)
      return fail('Choose another officer; use personal rule for the ruler.');
    const eligibility = canAppointGovernor(state, cityId, command.officerId);
    if (!eligibility.ok || !eligibility.officer)
      return fail(eligibility.reason ?? 'Appointment is not allowed.');
    if (
      eligibility.officer.location.kind === 'city' &&
      eligibility.officer.location.cityId === cityId
    ) {
      next = structuredClone(state);
      cancelPendingGovernorAppointment(
        next,
        cityId,
        'a governor was chosen for the newly captured city',
      );
      installGovernor(
        next,
        next.cities.find((city) => city.id === cityId)!,
        next.officers.find((officer) => officer.id === command.officerId)!,
      );
      next.revision++;
      next.governanceRevision++;
    } else {
      const queued = queueGovernorAppointment(state, cityId, command.officerId, services);
      if (!queued.ok) return queued;
      next = queued.state;
    }
  }
  next.events.find((entry) => entry.id === event.id)!.params!.governancePending = false;
  recordEvent(next, {
    kind: 'governorChanged',
    code: 'city.governance',
    params: {
      cityId,
      choice: command.choice,
      officerId: command.choice === 'self' ? rulerId : command.officerId!,
    },
    tier: 'notice',
    title: 'City governance decided',
    detail: '',
    entityId: cityId,
  });
  return { ok: true, state: next };
}
