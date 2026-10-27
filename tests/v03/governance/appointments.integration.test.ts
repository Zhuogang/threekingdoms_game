import { describe, expect, it } from 'vitest';
import { executeV03Command } from '../../../src/v03/commands';
import { createV03Game } from '../../../src/v03/initial-state';
import {
  applyGovernanceMonthBoundary,
  cancelPendingGovernorAppointment,
} from '../../../src/v03/governance/appointments';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import type { V03GameState } from '../../../src/v03/types';

function setFixtureGovernor(state: V03GameState, cityId: string, officerId: string | null): void {
  const city = state.cities.find((city) => city.id === cityId)!;
  if (city.governorId && city.governorId !== officerId) {
    const prior = state.officers.find((officer) => officer.id === city.governorId);
    if (prior) prior.governorOfCityId = null;
  }
  city.governorId = officerId;
  if (officerId)
    state.officers.find((officer) => officer.id === officerId)!.governorOfCityId = cityId;
}

function acknowledgeEvents(state: V03GameState): V03GameState {
  let next = state;
  for (const event of next.events.filter((entry) => !entry.acknowledged)) {
    next = executeV03Command(next, { type: 'acknowledgeEvent', eventId: event.id }).state;
  }
  return next;
}

function advanceOneDay(state: V03GameState): V03GameState {
  const result = executeV03Command(acknowledgeEvents(state), { type: 'advance', days: 1 });
  expect(result.ok, result.error).toBe(true);
  return result.state;
}

describe('v0.3 governor appointment journeys', () => {
  it('transfers a troop-free officer by route and appoints them only after arrival and a month boundary', () => {
    let state = createV03Game('cao', 21);
    const officer = state.officers.find((entry) => entry.id === 'caohong')!;
    officer.troops = 0;
    officer.location = { kind: 'city', cityId: 'chenliu' };
    const source = state.cities.find((entry) => entry.id === 'chenliu')!;
    const previousSourceGovernor = state.officers.find((entry) => entry.id === source.governorId);
    if (previousSourceGovernor) previousSourceGovernor.governorOfCityId = null;
    source.governorId = officer.id;
    source.governanceMode = 'governor';
    officer.governorOfCityId = source.id;
    const target = state.cities.find((entry) => entry.id === 'xuchang')!;
    setFixtureGovernor(state, target.id, null);
    target.governanceMode = 'steward';

    const issued = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: target.id,
      officerId: officer.id,
    });
    expect(issued.ok, issued.error).toBe(true);
    state = issued.state;
    const journey = state.journeys[0]!;
    expect(journey).toMatchObject({
      kind: 'appointment',
      sourceCityId: 'chenliu',
      destinationCityId: 'xuchang',
      status: 'outbound',
    });
    expect(journey.manifest).toMatchObject({ officerIds: [officer.id], troopCount: 0 });
    expect(state.officers.find((entry) => entry.id === officer.id)?.location).toEqual({
      kind: 'journey',
      journeyId: journey.id,
    });
    expect(state.cities.find((entry) => entry.id === source.id)).toMatchObject({
      governorId: officer.id,
      governanceMode: 'governor',
    });
    expect(state.officers.find((entry) => entry.id === officer.id)?.governorOfCityId).toBe(
      source.id,
    );
    expect(validateV03State(state)).toBe(true);
    expect(state.cities.find((entry) => entry.id === target.id)?.pendingAppointment).toMatchObject({
      governorId: officer.id,
      journeyId: journey.id,
      effectiveDay: 30,
    });
    expect(state.cities.find((entry) => entry.id === target.id)?.governanceMode).toBe('steward');

    const repeated = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: target.id,
      officerId: officer.id,
    });
    expect(repeated.ok).toBe(true);
    expect(repeated.state.journeys).toHaveLength(1);

    while (state.journeys.find((entry) => entry.id === journey.id)?.status === 'outbound') {
      state = advanceOneDay(state);
    }
    expect(state.journeys.find((entry) => entry.id === journey.id)?.status).toBe('delivered');
    expect(state.officers.find((entry) => entry.id === officer.id)?.location).toEqual({
      kind: 'city',
      cityId: target.id,
    });
    expect(state.cities.find((entry) => entry.id === source.id)).toMatchObject({
      governorId: officer.id,
      governanceMode: 'governor',
    });
    expect(state.officers.find((entry) => entry.id === officer.id)?.governorOfCityId).toBe(
      source.id,
    );
    expect(state.cities.find((entry) => entry.id === target.id)?.governanceMode).toBe('steward');
    const effectiveDay = state.cities.find((entry) => entry.id === target.id)!.pendingAppointment!
      .effectiveDay;
    expect(effectiveDay).toBeGreaterThan(state.absoluteDay);

    while (state.absoluteDay < effectiveDay) state = advanceOneDay(state);
    expect(state.cities.find((entry) => entry.id === target.id)).toMatchObject({
      governorId: officer.id,
      governanceMode: 'governor',
      pendingAppointment: null,
    });
    expect(state.cities.find((entry) => entry.id === source.id)).toMatchObject({
      governorId: null,
      governanceMode: 'steward',
    });
    expect(state.officers.find((entry) => entry.id === officer.id)?.governorOfCityId).toBe(
      target.id,
    );
    expect(validateV03State(state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });

  it('replaces an outbound transfer without teleporting the former candidate or vacating its source early', () => {
    let state = createV03Game('cao', 24);
    const former = state.officers.find((entry) => entry.id === 'caohong')!;
    former.troops = 0;
    former.location = { kind: 'city', cityId: 'chenliu' };
    for (const city of state.cities) {
      if (city.governorId === former.id) {
        city.governorId = null;
        city.governanceMode = 'steward';
      }
    }
    const source = state.cities.find((entry) => entry.id === 'chenliu')!;
    const formerGovernor = state.officers.find((entry) => entry.id === source.governorId);
    if (formerGovernor) formerGovernor.governorOfCityId = null;
    source.governorId = former.id;
    source.governanceMode = 'governor';
    former.governorOfCityId = source.id;
    const target = state.cities.find((entry) => entry.id === 'xuchang')!;
    const currentTargetGovernor = state.officers.find((entry) => entry.id === target.governorId);
    if (currentTargetGovernor) currentTargetGovernor.governorOfCityId = null;
    setFixtureGovernor(state, target.id, null);
    target.governanceMode = 'steward';
    const replacement = state.officers.find((entry) => entry.id === 'yuejin')!;
    for (const city of state.cities) {
      if (city.governorId === replacement.id) {
        city.governorId = null;
        city.governanceMode = 'steward';
      }
    }
    replacement.governorOfCityId = null;
    replacement.location = { kind: 'city', cityId: target.id };
    replacement.troops = 0;

    const first = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: target.id,
      officerId: former.id,
    });
    expect(first.ok, first.error).toBe(true);
    state = first.state;
    const originalJourney = state.cities.find((entry) => entry.id === target.id)!
      .pendingAppointment!.journeyId!;

    const replaced = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: target.id,
      officerId: replacement.id,
    });
    expect(replaced.ok, replaced.error).toBe(true);
    state = replaced.state;
    expect(state.journeys.find((entry) => entry.id === originalJourney)?.returnRequested).toBe(
      true,
    );
    expect(state.cities.find((entry) => entry.id === target.id)?.pendingAppointment).toEqual({
      governorId: replacement.id,
      effectiveDay: 30,
    });
    expect(state.cities.find((entry) => entry.id === source.id)).toMatchObject({
      governorId: former.id,
      governanceMode: 'governor',
    });
    expect(state.officers.find((entry) => entry.id === former.id)?.governorOfCityId).toBe(
      source.id,
    );
    expect(validateV03State(state)).toBe(true);

    let returnDays = 0;
    while (returnDays < 120) {
      const location = state.officers.find((entry) => entry.id === former.id)!.location;
      if (location.kind === 'city' && location.cityId === source.id) break;
      state = advanceOneDay(state);
      returnDays++;
    }
    expect(state.officers.find((entry) => entry.id === former.id)?.location).toEqual({
      kind: 'city',
      cityId: source.id,
    });
    expect(state.cities.find((entry) => entry.id === source.id)?.governorId).toBe(former.id);
    expect(state.cities.filter((entry) => entry.governorId === former.id)).toHaveLength(1);
    expect(validateV03State(state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });

  it('starts a route-based return when a delivered candidate is replaced before the boundary', () => {
    let state = createV03Game('cao', 27);
    const former = state.officers.find((entry) => entry.id === 'caohong')!;
    former.troops = 0;
    former.location = { kind: 'city', cityId: 'chenliu' };
    for (const city of state.cities) {
      if (city.governorId === former.id) {
        city.governorId = null;
        city.governanceMode = 'steward';
      }
    }
    const source = state.cities.find((entry) => entry.id === 'chenliu')!;
    const previousGovernor = state.officers.find((entry) => entry.id === source.governorId);
    if (previousGovernor) previousGovernor.governorOfCityId = null;
    source.governorId = former.id;
    source.governanceMode = 'governor';
    former.governorOfCityId = source.id;
    const target = state.cities.find((entry) => entry.id === 'xuchang')!;
    const currentTargetGovernor = state.officers.find((entry) => entry.id === target.governorId);
    if (currentTargetGovernor) currentTargetGovernor.governorOfCityId = null;
    setFixtureGovernor(state, target.id, null);
    target.governanceMode = 'steward';
    const issued = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: target.id,
      officerId: former.id,
    });
    expect(issued.ok, issued.error).toBe(true);
    state = issued.state;
    const outbound = state.journeys[0]!;
    outbound.status = 'delivered';
    state.officers.find((entry) => entry.id === former.id)!.location = {
      kind: 'city',
      cityId: target.id,
    };
    const replacement = state.officers.find((entry) => entry.id === 'yuejin')!;
    for (const city of state.cities) {
      if (city.governorId === replacement.id) {
        city.governorId = null;
        city.governanceMode = 'steward';
      }
    }
    replacement.governorOfCityId = null;
    replacement.location = { kind: 'city', cityId: target.id };
    replacement.troops = 0;

    const replaced = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: target.id,
      officerId: replacement.id,
    });
    expect(replaced.ok, replaced.error).toBe(true);
    state = replaced.state;
    expect(state.officers.find((entry) => entry.id === former.id)?.location).toEqual({
      kind: 'city',
      cityId: target.id,
    });
    expect(state.journeys.find((entry) => entry.id === outbound.id)).toMatchObject({
      status: 'delivered',
      returnRequested: true,
    });

    state = advanceOneDay(state);
    expect(state.journeys.find((entry) => entry.id === outbound.id)?.status).toBe('cancelled');
    const returnJourney = state.journeys.find(
      (entry) => entry.kind === 'return' && entry.manifest.officerIds.includes(former.id),
    );
    expect(returnJourney).toMatchObject({
      sourceCityId: target.id,
      destinationCityId: source.id,
      status: 'returning',
    });
    expect(state.officers.find((entry) => entry.id === former.id)?.location).toEqual({
      kind: 'journey',
      journeyId: returnJourney!.id,
    });
    expect(state.cities.find((entry) => entry.id === source.id)?.governorId).toBe(former.id);
    expect(validateV03State(state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });

  it('retries a late arrival next month and explains the delay without changing current governance', () => {
    const state = createV03Game('cao', 25);
    const officer = state.officers.find((entry) => entry.id === 'caohong')!;
    officer.troops = 0;
    officer.location = { kind: 'city', cityId: 'chenliu' };
    for (const city of state.cities) {
      if (city.governorId === officer.id) {
        city.governorId = null;
        city.governanceMode = 'steward';
      }
    }
    const source = state.cities.find((entry) => entry.id === 'chenliu')!;
    const previousGovernor = state.officers.find((entry) => entry.id === source.governorId);
    if (previousGovernor) previousGovernor.governorOfCityId = null;
    source.governorId = officer.id;
    source.governanceMode = 'governor';
    officer.governorOfCityId = source.id;
    const target = state.cities.find((entry) => entry.id === 'xuchang')!;
    setFixtureGovernor(state, target.id, null);
    target.governanceMode = 'steward';
    const issued = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: target.id,
      officerId: officer.id,
    });
    expect(issued.ok, issued.error).toBe(true);

    const settled = applyGovernanceMonthBoundary(issued.state, 30);
    expect(settled.cities.find((entry) => entry.id === target.id)).toMatchObject({
      governorId: null,
      governanceMode: 'steward',
      pendingAppointment: { governorId: officer.id, effectiveDay: 60 },
    });
    expect(settled.cities.find((entry) => entry.id === source.id)).toMatchObject({
      governorId: officer.id,
      governanceMode: 'governor',
    });
    expect(settled.events.some((event) => event.title === 'governor-appointment-delayed')).toBe(
      true,
    );
    expect(validateV03State(settled)).toBe(true);
  });

  it('clears a captured candidate and preserves the city’s current governance so another can be chosen', () => {
    const state = createV03Game('cao', 26);
    const target = state.cities.find((entry) => entry.id === 'xuchang')!;
    const candidate = state.officers.find((entry) => entry.id === 'caohong')!;
    const incumbent = state.officers.find(
      (entry) =>
        entry.id !== candidate.id && entry.factionId === state.playerFactionId && entry.alive,
    )!;
    for (const city of state.cities) {
      if (city.governorId === candidate.id || city.governorId === incumbent.id) {
        city.governorId = null;
        city.governanceMode = 'steward';
      }
    }
    candidate.governorOfCityId = null;
    incumbent.governorOfCityId = target.id;
    incumbent.location = { kind: 'city', cityId: target.id };
    incumbent.troops = 0;
    setFixtureGovernor(state, target.id, incumbent.id);
    target.governanceMode = 'governor';
    candidate.troops = 0;
    candidate.location = { kind: 'city', cityId: target.id };
    const queued = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: target.id,
      officerId: candidate.id,
    });
    expect(queued.ok, queued.error).toBe(true);
    const captured = structuredClone(queued.state);
    const capturedCandidate = captured.officers.find((entry) => entry.id === candidate.id)!;
    capturedCandidate.location = { kind: 'captured', cityId: target.id };

    const settled = applyGovernanceMonthBoundary(captured, 30);
    expect(settled.cities.find((entry) => entry.id === target.id)).toMatchObject({
      governorId: incumbent.id,
      governanceMode: 'governor',
      pendingAppointment: null,
    });
    expect(settled.officers.find((entry) => entry.id === incumbent.id)?.governorOfCityId).toBe(
      target.id,
    );
    expect(settled.events.some((event) => event.title === 'governor-appointment-cancelled')).toBe(
      true,
    );
    expect(validateV03State(settled)).toBe(true);
    expect(decodeV03Save(encodeV03Save(settled))).toEqual(settled);
  });

  it('cancels a pending appointment when its candidate dies before the month boundary', () => {
    const state = createV03Game('cao', 28);
    const target = state.cities.find((entry) => entry.id === 'xuchang')!;
    const incumbentId = target.governorId;
    const candidate = state.officers.find((entry) => entry.id === 'yuejin')!;
    for (const city of state.cities) {
      if (city.governorId !== candidate.id) continue;
      city.governorId = null;
      city.governanceMode = 'steward';
    }
    candidate.governorOfCityId = null;
    candidate.location = { kind: 'city', cityId: target.id };
    candidate.troops = 0;
    const queued = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: target.id,
      officerId: candidate.id,
    });
    expect(queued.ok, queued.error).toBe(true);
    const deceased = structuredClone(queued.state);
    deceased.officers.find((entry) => entry.id === candidate.id)!.alive = false;

    const settled = applyGovernanceMonthBoundary(deceased, 30);
    expect(settled.cities.find((entry) => entry.id === target.id)).toMatchObject({
      governorId: incumbentId,
      pendingAppointment: null,
    });
    expect(
      settled.officers.find((entry) => entry.id === candidate.id)?.governorOfCityId,
    ).toBeNull();
    expect(settled.events.some((event) => event.title === 'governor-appointment-cancelled')).toBe(
      true,
    );
    expect(validateV03State(settled)).toBe(true);
    expect(decodeV03Save(encodeV03Save(settled))).toEqual(settled);
  });

  it('requests a safe return when an appointed city is captured before the candidate arrives', () => {
    let state = createV03Game('cao', 27);
    const candidate = state.officers.find((entry) => entry.id === 'caohong')!;
    for (const city of state.cities) {
      if (city.governorId !== candidate.id) continue;
      city.governorId = null;
      city.governanceMode = 'steward';
    }
    candidate.governorOfCityId = null;
    candidate.location = { kind: 'city', cityId: 'chenliu' };
    candidate.troops = 0;
    const target = state.cities.find((entry) => entry.id === 'xuchang')!;
    const formerGovernor = state.officers.find((entry) => entry.id === target.governorId);
    if (formerGovernor) formerGovernor.governorOfCityId = null;
    setFixtureGovernor(state, target.id, null);
    target.governanceMode = 'steward';

    const appointed = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: target.id,
      officerId: candidate.id,
    });
    expect(appointed.ok, appointed.error).toBe(true);
    state = structuredClone(appointed.state);
    const appointmentJourneyId = state.cities.find((entry) => entry.id === target.id)!
      .pendingAppointment!.journeyId!;
    const capturedCity = state.cities.find((entry) => entry.id === target.id)!;
    capturedCity.factionId = 'yuan';
    capturedCity.governorId = null;
    capturedCity.governanceMode = 'steward';
    cancelPendingGovernorAppointment(
      state,
      target.id,
      'the city was captured before the candidate took office',
    );

    expect(capturedCity.pendingAppointment).toBeNull();
    expect(state.journeys.find((entry) => entry.id === appointmentJourneyId)?.returnRequested).toBe(
      true,
    );
    expect(validateV03State(state)).toBe(true);
    while (state.journeys.find((entry) => entry.id === appointmentJourneyId)?.status === 'outbound')
      state = advanceOneDay(state);
    expect(
      state.journeys.some(
        (entry) =>
          entry.kind === 'return' &&
          entry.manifest.officerIds.includes(candidate.id) &&
          entry.status === 'returning',
      ),
    ).toBe(true);
    expect(validateV03State(state)).toBe(true);
  });

  it('keeps a local appointment pending until settlement without creating a journey', () => {
    let state = createV03Game('cao', 22);
    const officer = state.officers.find((entry) => entry.id === 'yuejin')!;
    officer.troops = 0;
    officer.governorOfCityId = null;
    const target = state.cities.find((entry) => entry.id === 'puyang')!;
    officer.location = { kind: 'city', cityId: target.id };
    setFixtureGovernor(state, target.id, null);
    target.governanceMode = 'steward';

    const result = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: target.id,
      officerId: officer.id,
    });
    expect(result.ok, result.error).toBe(true);
    state = result.state;
    expect(state.journeys).toHaveLength(0);
    expect(state.cities.find((entry) => entry.id === target.id)?.pendingAppointment).toEqual({
      governorId: officer.id,
      effectiveDay: 30,
    });
    expect(state.cities.find((entry) => entry.id === target.id)?.governanceMode).toBe('steward');

    while (state.absoluteDay < 30) state = advanceOneDay(state);
    expect(state.cities.find((entry) => entry.id === target.id)).toMatchObject({
      governorId: officer.id,
      governanceMode: 'governor',
      pendingAppointment: null,
    });
  });

  it('rejects a transfer for an officer with troops without changing the command state', () => {
    const state = createV03Game('cao', 23);
    const officer = state.officers.find((entry) => entry.id === 'caohong')!;
    officer.location = { kind: 'city', cityId: 'chenliu' };
    officer.troops = 400;
    const result = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: 'xuchang',
      officerId: officer.id,
    });
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(result.state.journeys).toHaveLength(0);
    expect(
      result.state.cities.find((entry) => entry.id === 'xuchang')?.pendingAppointment,
    ).toBeNull();
    expect(result.state.governanceRevision).toBe(state.governanceRevision);
    expect(result.state.nextId).toBe(state.nextId);
  });
});
