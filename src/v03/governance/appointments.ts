import { canAppointGovernor } from './authority';
import type { V03DomainEvent, V03GameState } from '../types';
import type { GovernanceOrderServices } from './orders';

function nextMonthBoundary(absoluteDay: number) {
  return Math.ceil((absoluteDay + 1) / 30) * 30;
}

function eventId(state: V03GameState, kind: V03DomainEvent['kind']) {
  return `${state.scenarioId}:${kind}:${state.absoluteDay}:${state.nextId}`;
}

/** Queue a governance change. Authority only changes when its next month boundary is settled. */
export function queueGovernorAppointment(
  state: V03GameState,
  cityId: string,
  officerId: string | null,
  services?: GovernanceOrderServices,
): { ok: boolean; state: V03GameState; error?: string } {
  if (state.phase !== 'planning')
    return {
      ok: false,
      state,
      error: 'Governor appointments can only be issued during campaign planning.',
    };
  const existingTarget = state.cities.find((entry) => entry.id === cityId);
  if (
    existingTarget?.factionId === state.playerFactionId &&
    existingTarget.pendingAppointment?.governorId === officerId
  )
    return { ok: true, state };
  const result = canAppointGovernor(state, cityId, officerId);
  if (!result.ok || !result.city)
    return { ok: false, state, error: result.reason ?? 'Appointment is not allowed.' };
  const city = result.city;
  if (result.officer?.governorOfCityId && result.officer.governorOfCityId !== cityId)
    return {
      ok: false,
      state,
      error: 'The officer must be relieved from the other city before taking office.',
    };
  if (city.governorId === officerId && city.pendingAppointment === null) return { ok: true, state };
  if (city.pendingAppointment?.journeyId) {
    const pendingJourney = state.journeys.find(
      (journey) => journey.id === city.pendingAppointment?.journeyId,
    );
    if (
      pendingJourney &&
      pendingJourney.status !== 'delivered' &&
      pendingJourney.status !== 'cancelled'
    ) {
      return {
        ok: false,
        state,
        error:
          'A governor transfer is already in transit. Wait for it to arrive before changing the pending appointment.',
      };
    }
  }

  let journey: ReturnType<GovernanceOrderServices['createJourney']> | null = null;
  if (
    result.officer &&
    result.officer.location.kind === 'city' &&
    result.officer.location.cityId !== cityId
  ) {
    if (!services)
      return {
        ok: false,
        state,
        error: 'A route service is required to transfer an officer between cities.',
      };
    const sourceCityId = result.officer.location.cityId;
    const route = services.planRoute({
      state,
      sourceCityId,
      targetCityId: cityId,
      departureDay: state.absoluteDay,
      troopCount: 0,
      kind: 'appointment',
      composition: { troopTypes: [] },
    });
    if (!route)
      return {
        ok: false,
        state,
        error: 'No usable route connects the officer’s current city to the appointment city.',
      };
    const id = `${state.scenarioId}:appointment:${state.nextId}`;
    try {
      journey = services.createJourney({
        id,
        executionId: `${state.scenarioId}:governor-transfer:${cityId}:${state.nextId}`,
        ownerFactionId: state.playerFactionId,
        kind: 'appointment',
        sourceCityId,
        targetCityId: cityId,
        departureDay: state.absoluteDay,
        arrivalDay: state.absoluteDay + route.estimatedDays,
        route,
        party: {
          officerIds: [result.officer.id],
          troopCount: 0,
          composition: { troopTypes: [] },
        },
        cargo: { gold: 0, food: 0, troops: 0 },
        carriedFood: 0,
      });
    } catch {
      return {
        ok: false,
        state,
        error: 'The officer’s travel plan could not be created; no appointment was changed.',
      };
    }
  }

  const next = structuredClone(state);
  const nextCity = next.cities.find((entry) => entry.id === cityId)!;
  if (journey) {
    const officer = next.officers.find((entry) => entry.id === result.officer!.id)!;
    officer.location = { kind: 'journey', journeyId: journey.id };
    next.journeys.push(journey);
    nextCity.pendingAppointment = {
      governorId: officerId,
      effectiveDay: nextMonthBoundary(state.absoluteDay),
      journeyId: journey.id,
    };
  } else {
    nextCity.pendingAppointment = {
      governorId: officerId,
      effectiveDay: nextMonthBoundary(state.absoluteDay),
    };
  }
  next.governanceRevision += 1;
  next.revision += 1;
  next.nextId += 1;
  return { ok: true, state: next };
}

/** Apply pending appointments after the previous month has been settled. */
export function applyGovernanceMonthBoundary(
  state: V03GameState,
  effectiveDay: number,
): V03GameState {
  const next = structuredClone(state);
  const due = next.cities.filter(
    (city) =>
      city.pendingAppointment !== null && city.pendingAppointment.effectiveDay <= effectiveDay,
  );
  for (const city of due) {
    const pending = city.pendingAppointment!;
    if (pending.journeyId) {
      const journey = next.journeys.find((entry) => entry.id === pending.journeyId);
      if (!journey || journey.status !== 'delivered') {
        city.pendingAppointment = { ...pending, effectiveDay: effectiveDay + 30 };
        continue;
      }
    }
    const incoming =
      pending.governorId === null
        ? null
        : next.officers.find((officer) => officer.id === pending.governorId);
    if (
      incoming &&
      (!incoming.alive ||
        incoming.factionId !== city.factionId ||
        incoming.location.kind !== 'city' ||
        incoming.location.cityId !== city.id)
    ) {
      city.pendingAppointment = { ...pending, effectiveDay: effectiveDay + 30 };
      continue;
    }
    if (city.governorId) {
      const previous = next.officers.find((officer) => officer.id === city.governorId);
      if (previous) previous.governorOfCityId = null;
    }
    city.governorId = incoming?.id ?? null;
    city.governanceMode = incoming ? 'governor' : 'steward';
    city.pendingAppointment = null;
    if (incoming) incoming.governorOfCityId = city.id;
    const event: V03DomainEvent = {
      id: eventId(next, 'governorChanged'),
      absoluteDay: effectiveDay,
      kind: 'governorChanged',
      title: incoming ? 'A new governor takes office' : 'A city returns to local stewardship',
      detail: incoming
        ? `${incoming.name} now governs ${city.name}.`
        : `${city.name} has no formal governor.`,
      entityId: city.id,
      acknowledged: false,
    };
    next.events.push(event);
    next.nextId += 1;
    next.governanceRevision += 1;
  }
  next.revision += due.length > 0 ? 1 : 0;
  return next;
}
