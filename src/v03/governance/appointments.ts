import { availableCityResources, canAppointGovernor } from './authority';
import { availableTroops, personnelCount } from '../campaign/personnel';
import { estimateCampaignSupply } from '../calendar';
import type { V03City, V03DomainEvent, V03GameState, V03Officer } from '../types';
import type { GovernanceOrderServices } from './orders';

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

/** Put the incoming office holder (or local stewardship) in charge and report it. */
function takeOffice(
  state: V03GameState,
  city: V03City,
  incoming: V03Officer | null,
  absoluteDay: number,
): void {
  const personalRule = Boolean(
    incoming &&
    incoming.id ===
      state.factions.find((faction) => faction.id === state.playerFactionId)?.leaderOfficerId,
  );
  if (personalRule) installPersonalRule(state, city);
  else installGovernor(state, city, incoming);
  const event: V03DomainEvent = {
    id: eventId(state, 'governorChanged'),
    absoluteDay,
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
    // The player ordered it; the inbox records it without asking for acknowledgement.
    tier: 'notice',
    acknowledged: false,
  };
  state.events.push(event);
  state.nextId += 1;
  state.governanceRevision += 1;
}

/**
 * Change a city's governance. An officer already in the city, the ruler governing where
 * they stand, or a return to local stewardship takes effect at once; a candidate from
 * another city travels with their contingent and takes office on arrival.
 */
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
      effectiveDay: journey.expectedArrivalDay,
      journeyId: journey.id,
    };
    next.governanceRevision += 1;
  } else {
    nextCity.pendingAppointment = null;
    const incoming = officerId
      ? (next.officers.find((entry) => entry.id === officerId) ?? null)
      : null;
    // Clearing a pending transfer leaves the office holder (or stewardship) as it was.
    if ((incoming?.id ?? null) !== nextCity.governorId)
      takeOffice(next, nextCity, incoming, state.absoluteDay);
    else next.governanceRevision += 1;
  }
  next.revision += 1;
  next.nextId += 1;
  return { ok: true, state: next };
}

/**
 * Settle one pending appointment: cancel it if it can no longer complete, leave it while the
 * candidate is still on the road, otherwise install the office. Returns whether it changed.
 */
function settlePendingAppointment(
  state: V03GameState,
  city: V03City,
  absoluteDay: number,
): boolean {
  const pending = city.pendingAppointment;
  if (!pending) return false;
  if (city.factionId !== state.playerFactionId) {
    cancelPendingAppointment(
      state,
      city.id,
      pending.governorId,
      'the city is no longer under your faction’s control',
      pending.journeyId,
    );
    return true;
  }
  if (pending.journeyId) {
    const journey = state.journeys.find((entry) => entry.id === pending.journeyId);
    if (!journey || journey.status === 'cancelled' || journey.status === 'returning') {
      cancelPendingAppointment(
        state,
        city.id,
        pending.governorId,
        'the transfer can no longer complete',
        pending.journeyId,
      );
      return true;
    }
    // The candidate takes office on arrival, whenever that is.
    if (journey.status !== 'delivered') return false;
  }
  const incoming =
    pending.governorId === null
      ? null
      : state.officers.find((officer) => officer.id === pending.governorId);
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
    cancelPendingAppointment(state, city.id, pending.governorId, reason, pending.journeyId);
    return true;
  }
  takeOffice(state, city, incoming ?? null, absoluteDay);
  return true;
}

/** A transferred candidate takes office the day their party reaches the city. */
export function takeOfficeOnArrival(state: V03GameState, city: V03City, journeyId: string): void {
  if (city.pendingAppointment?.journeyId !== journeyId) return;
  if (settlePendingAppointment(state, city, state.absoluteDay)) state.revision += 1;
}

/**
 * Month-boundary sweep for appointments still pending: saves from before immediate
 * appointments may hold a local one, and a transfer can fail on the road.
 */
export function applyGovernanceMonthBoundary(
  state: V03GameState,
  effectiveDay: number,
): V03GameState {
  const next = structuredClone(state);
  let changed = false;
  for (const city of next.cities)
    if (
      city.pendingAppointment !== null &&
      city.pendingAppointment.effectiveDay <= effectiveDay &&
      settlePendingAppointment(next, city, effectiveDay)
    )
      changed = true;
  next.revision += changed ? 1 : 0;
  return next;
}

function addAppointmentEvent(
  state: V03GameState,
  key: 'governor-appointment-cancelled',
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
