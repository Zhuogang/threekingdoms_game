import { availableCityResources, canAppointGovernor } from './authority';
import { availableTroops, personnelCount } from '../campaign/personnel';
import { estimateCampaignSupply } from '../calendar';
import type { V03City, V03DomainEvent, V03GameState, V03Officer } from '../types';
import type { GovernanceOrderServices } from './orders';

function nextMonthBoundary(absoluteDay: number) {
  return Math.ceil((absoluteDay + 1) / 30) * 30;
}

function eventId(state: V03GameState, kind: V03DomainEvent['kind']) {
  return `${state.scenarioId}:${kind}:${state.absoluteDay}:${state.nextId}`;
}

/** A transfer carries the officer's existing contingent, including wounded and restrictions. */
export function previewGovernorTransfer(
  state: V03GameState,
  cityId: string,
  officerId: string | null,
  services: GovernanceOrderServices,
) {
  const eligibility = canAppointGovernor(state, cityId, officerId);
  const officer = eligibility.officer;
  if (!eligibility.ok) return { ok: false as const, reason: eligibility.reason! };
  if (!officer || officer.location.kind !== 'city' || officer.location.cityId === cityId)
    return { ok: true as const, transfer: null };
  const sourceCityId = officer.location.cityId;
  const total = personnelCount(officer);
  const party = {
    officerIds: [officer.id],
    troopCount: total,
    composition: {
      troopTypes: total ? [officer.troopType] : [],
      cavalryTroops: officer.troopType === 'cavalry' ? total : 0,
      woundedTroops: officer.wounded,
    },
  };
  const route = services.planRoute({
    state,
    sourceCityId,
    targetCityId: cityId,
    departureDay: state.absoluteDay,
    troopCount: total,
    kind: 'appointment',
    composition: party.composition,
  });
  if (!route)
    return {
      ok: false as const,
      reason: 'No usable route connects the officer’s current city to the appointment city.',
    };
  const food = estimateCampaignSupply({
    troopCount: total,
    cavalryTroops: party.composition.cavalryTroops,
    outboundDays: route.estimatedDays,
    battleDays: 0,
    returnDays: route.estimatedDays,
  }).totalFood;
  if (availableCityResources(state, sourceCityId).food < food)
    return {
      ok: false as const,
      reason:
        'The source city needs enough unreserved food for the contingent’s transfer and possible return.',
    };
  return { ok: true as const, transfer: { sourceCityId, party, route, food } };
}

/** Change offices without moving, stripping or recreating anyone's personnel. */
export function installGovernor(
  state: V03GameState,
  city: V03City,
  incoming: V03Officer | null,
): void {
  const previous = state.officers.find((officer) => officer.id === city.governorId);
  if (previous?.governorOfCityId === city.id) previous.governorOfCityId = null;
  if (incoming) {
    for (const source of state.cities) {
      if (source.id === city.id || source.governorId !== incoming.id) continue;
      source.governorId = null;
      if (source.governanceMode === 'governor') source.governanceMode = 'steward';
    }
    incoming.governorOfCityId = city.id;
  }
  city.governorId = incoming?.id ?? null;
  city.governanceMode = incoming ? 'governor' : 'steward';
  city.pendingAppointment = null;
}

/** A ruler taking office changes the capital, without moving personnel or city stock. */
export function installPersonalRule(state: V03GameState, city: V03City): void {
  const faction = state.factions.find((entry) => entry.id === state.playerFactionId)!;
  const ruler = state.officers.find((entry) => entry.id === faction.leaderOfficerId)!;
  const oldCapital = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  installGovernor(state, city, null);
  for (const source of state.cities) {
    if (source.governorId === ruler.id) installGovernor(state, source, null);
  }
  ruler.governorOfCityId = null;
  oldCapital.governanceMode = oldCapital.governorId ? 'governor' : 'steward';
  city.governanceMode = 'ruler';
  faction.capitalCityId = city.id;
  state.playerCapitalCityId = city.id;
}

/** Queue a governance change. Authority only changes when its next month boundary is settled. */
export function queueGovernorAppointment(
  state: V03GameState,
  cityId: string,
  officerId: string | null,
  services?: GovernanceOrderServices,
): { ok: boolean; state: V03GameState; error?: string } {
  if (state.phase === 'finished')
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
  if (city.governorId === officerId && city.pendingAppointment === null) return { ok: true, state };

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
    const preview = previewGovernorTransfer(state, cityId, officerId, services);
    if (!preview.ok) return { ok: false, state, error: preview.reason };
    if (!preview.transfer)
      return {
        ok: false,
        state,
        error: 'The officer’s travel plan could not be created; no appointment was changed.',
      };
    const { sourceCityId, route, party, food } = preview.transfer;
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
        party,
        cargo: { gold: 0, food: 0, troops: 0 },
        carriedFood: food,
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
  const previousJourneyId = nextCity.pendingAppointment?.journeyId;
  if (previousJourneyId) {
    const previousJourney = next.journeys.find((entry) => entry.id === previousJourneyId);
    if (previousJourney && ['outbound', 'waiting', 'delivered'].includes(previousJourney.status)) {
      // The former candidate stays in the journey until a safe return can start.
      // For an outbound transfer, the engine turns the party around at arrival.
      previousJourney.returnRequested = true;
    }
  }
  if (journey) {
    const officer = next.officers.find((entry) => entry.id === result.officer!.id)!;
    const source = next.cities.find((entry) => entry.id === journey!.sourceCityId)!;
    source.garrisonTroops -= availableTroops(officer);
    source.food -= journey.manifest.carriedFood;
    // The source office remains in force until this appointment takes effect at
    // the month boundary. Local staff can govern autonomously while the officer
    // is away, and the boundary transition moves the office atomically.
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
    if (city.factionId !== next.playerFactionId) {
      cancelPendingAppointment(
        next,
        city.id,
        pending.governorId,
        'the city is no longer under your faction’s control',
        pending.journeyId,
      );
      continue;
    }
    if (pending.journeyId) {
      const journey = next.journeys.find((entry) => entry.id === pending.journeyId);
      if (!journey || journey.status === 'cancelled' || journey.status === 'returning') {
        cancelPendingAppointment(
          next,
          city.id,
          pending.governorId,
          'the transfer can no longer complete',
          pending.journeyId,
        );
        continue;
      }
      if (journey.status !== 'delivered') {
        city.pendingAppointment = { ...pending, effectiveDay: effectiveDay + 30 };
        addAppointmentEvent(
          next,
          'governor-appointment-delayed',
          city.id,
          pending.governorId,
          `The appointment at ${city.name} is delayed because the candidate has not arrived. Current governance remains unchanged; it will be checked again next month.`,
          effectiveDay,
        );
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
      const reason =
        incoming.location.kind === 'captured'
          ? 'the candidate has been captured'
          : !incoming.alive
            ? 'the candidate is no longer available'
            : incoming.factionId !== city.factionId
              ? 'the candidate no longer serves this faction'
              : 'the candidate is no longer available in this city';
      cancelPendingAppointment(next, city.id, pending.governorId, reason, pending.journeyId);
      continue;
    }
    const personalRule = Boolean(
      incoming &&
      incoming.id ===
        next.factions.find((faction) => faction.id === next.playerFactionId)?.leaderOfficerId,
    );
    if (personalRule) installPersonalRule(next, city);
    else installGovernor(next, city, incoming ?? null);
    const event: V03DomainEvent = {
      id: eventId(next, 'governorChanged'),
      absoluteDay: effectiveDay,
      kind: 'governorChanged',
      ...(personalRule
        ? {
            code: 'city.governance',
            params: { cityId: city.id, choice: 'self', officerId: incoming!.id },
          }
        : {}),
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

function addAppointmentEvent(
  state: V03GameState,
  key: 'governor-appointment-delayed' | 'governor-appointment-cancelled',
  cityId: string,
  officerId: string | null,
  detail: string,
  absoluteDay: number,
): void {
  const event: V03DomainEvent = {
    id: eventId(state, 'campaignEvent'),
    absoluteDay,
    kind: 'campaignEvent',
    title: key,
    detail: JSON.stringify({
      key,
      entityIds: officerId ? [cityId, officerId] : [cityId],
      message: detail,
    }),
    entityId: null,
    acknowledged: false,
  };
  state.events.push(event);
  state.nextId += 1;
}

function cancelPendingAppointment(
  state: V03GameState,
  cityId: string,
  officerId: string | null,
  reason: string,
  journeyId?: string,
): void {
  const city = state.cities.find((entry) => entry.id === cityId);
  if (!city) return;
  if (journeyId) {
    const journey = state.journeys.find((entry) => entry.id === journeyId);
    const candidate = officerId
      ? state.officers.find((entry) => entry.id === officerId)
      : undefined;
    if (
      journey &&
      candidate?.alive &&
      candidate.location.kind !== 'captured' &&
      ['outbound', 'waiting', 'delivered'].includes(journey.status)
    )
      journey.returnRequested = true;
  }
  city.pendingAppointment = null;
  addAppointmentEvent(
    state,
    'governor-appointment-cancelled',
    cityId,
    officerId,
    `The appointment at ${city.name} was cancelled because ${reason}. Current governance remains unchanged; you may choose another candidate.`,
    state.absoluteDay,
  );
}

/** Cancel a pending appointment as soon as its city stops being a valid target. */
export function cancelPendingGovernorAppointment(
  state: V03GameState,
  cityId: string,
  reason: string,
): void {
  const city = state.cities.find((entry) => entry.id === cityId);
  const pending = city?.pendingAppointment;
  if (!pending) return;
  cancelPendingAppointment(state, cityId, pending.governorId, reason, pending.journeyId);
}
