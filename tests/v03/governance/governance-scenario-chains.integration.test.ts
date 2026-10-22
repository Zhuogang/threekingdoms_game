import { describe, expect, it } from 'vitest';
import { executeV03Command } from '../../../src/v03/commands';
import { createV03Game } from '../../../src/v03/initial-state';
import { createV03OrderServices } from '../../../src/v03/governance/services';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import type { V03GameState } from '../../../src/v03/types';

function saveValidationMessage(state: V03GameState): string {
  try {
    encodeV03Save(state);
    return 'State is valid for v0.3 save.';
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
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

describe.each([
  {
    scenarioId: 'divided-realm-190',
    officerId: 'xiahoudun',
    targetCityId: 'xuchang',
  },
  {
    scenarioId: 'guandu-200',
    officerId: 'xunyu',
    targetCityId: 'chenliu',
  },
])('governance and recruitment chain in $scenarioId', ({ scenarioId, officerId, targetCityId }) => {
  it('recruits a reserve, releases troops for a governor transfer, appoints on arrival and saves cleanly', () => {
    let state = createV03Game('cao', 4403, scenarioId);
    const capitalId = state.playerCapitalCityId;
    const capital = state.cities.find((city) => city.id === capitalId)!;
    const candidate = state.officers.find((officer) => officer.id === officerId)!;
    expect(candidate.location).toEqual({ kind: 'city', cityId: capitalId });
    expect(candidate.troops).toBeGreaterThan(0);

    const recruit = executeV03Command(state, {
      type: 'cityAction',
      cityId: capitalId,
      action: 'recruit',
    });
    expect(recruit.ok, recruit.error).toBe(true);
    state = recruit.state;
    const afterRecruit = state.cities.find((city) => city.id === capitalId)!;
    expect(afterRecruit.reserve).toBeGreaterThan(capital.reserve);
    expect(afterRecruit.population).toBeLessThan(capital.population);

    const candidateTroops = state.officers.find((officer) => officer.id === officerId)!.troops;
    const release = executeV03Command(state, {
      type: 'cityAction',
      cityId: capitalId,
      action: 'assign-troops',
      officerId,
      amount: 0,
    });
    expect(release.ok, release.error).toBe(true);
    state = release.state;
    expect(state.officers.find((officer) => officer.id === officerId)?.troops).toBe(0);
    expect(state.cities.find((city) => city.id === capitalId)?.reserve).toBe(
      afterRecruit.reserve + candidateTroops,
    );

    const route = createV03OrderServices().planRoute({
      state,
      sourceCityId: capitalId,
      targetCityId,
      departureDay: state.absoluteDay,
      troopCount: 0,
      kind: 'appointment',
      composition: { troopTypes: [] },
    });
    expect(route).not.toBeNull();
    expect(route!.estimatedDays).toBeLessThan(30);

    const appointment = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: targetCityId,
      officerId,
    });
    expect(appointment.ok, appointment.error).toBe(true);
    state = appointment.state;
    expect(state.cities.find((city) => city.id === targetCityId)?.pendingAppointment).toMatchObject(
      {
        governorId: officerId,
        journeyId: expect.any(String),
        effectiveDay: 30,
      },
    );
    expect(validateV03State(state), saveValidationMessage(state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);

    for (
      let day = 0;
      day < 30 && state.cities.find((city) => city.id === targetCityId)?.governorId !== officerId;
      day++
    )
      state = advanceOneDay(state);

    expect(state.absoluteDay).toBe(30);
    expect(state.cities.find((city) => city.id === targetCityId)).toMatchObject({
      governorId: officerId,
      governanceMode: 'governor',
      pendingAppointment: null,
    });
    expect(state.officers.find((officer) => officer.id === officerId)).toMatchObject({
      factionId: 'cao',
      location: { kind: 'city', cityId: targetCityId },
      governorOfCityId: targetCityId,
      troops: 0,
    });
    expect(validateV03State(state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });
});
