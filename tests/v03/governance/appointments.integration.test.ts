import { describe, expect, it } from 'vitest';
import { executeV03Command } from '../../../src/v03/commands';
import { createV03Game } from '../../../src/v03/initial-state';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import type { V03GameState } from '../../../src/v03/types';

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
    const officer = state.officers.find((entry) => entry.id === 'xunyu')!;
    officer.troops = 0;
    officer.governorOfCityId = null;
    officer.location = { kind: 'city', cityId: 'chenliu' };
    const target = state.cities.find((entry) => entry.id === 'xuchang')!;
    target.governorId = null;
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
    expect(state.officers.find((entry) => entry.id === officer.id)?.governorOfCityId).toBe(
      target.id,
    );
    expect(validateV03State(state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });

  it('keeps a local appointment pending until settlement without creating a journey', () => {
    let state = createV03Game('cao', 22);
    const officer = state.officers.find((entry) => entry.id === 'chengyu')!;
    officer.troops = 0;
    officer.governorOfCityId = null;
    const target = state.cities.find((entry) => entry.id === 'puyang')!;
    target.governorId = null;
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
    const officer = state.officers.find((entry) => entry.id === 'xunyu')!;
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
