import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../src/v03/initial-state';
import { executeV03Command } from '../../src/v03/commands';
import { createPersonnelDay } from '../../src/v03/campaign/personnel';
import { encodeV03Save, decodeV03Save, validateV03State } from '../../src/v03/platform/storage';
import type { V03GameState, V03Command } from '../../src/v03/types';

function order(state: V03GameState, input: V03Command) {
  const result = executeV03Command(state, input);
  expect(result.ok, result.error).toBe(true);
  return result.state;
}
function fixture() {
  const state = createV03Game('cao', 19);
  state.absoluteDay = 29;
  state.personnelDay = createPersonnelDay(state);
  return state;
}
function shorten(state: V03GameState) {
  const journey = state.journeys[0]!;
  journey.routeSnapshot.forEach((segment) => {
    segment.lengthKm = 1;
    segment.fixedDelayDays = 0;
  });
  journey.expectedArrivalDay = 30;
  state.events.forEach((event) => {
    event.acknowledged = true;
  });
  expect(validateV03State(state)).toBe(true);
  return decodeV03Save(encodeV03Save(state));
}

describe('month-boundary arrival delivery', () => {
  it('unloads an officer-free requisition at day 30 and never credits the cargo twice after reload', () => {
    let state = order(fixture(), {
      type: 'requestRequisition',
      sourceCityId: 'chenliu',
      targetCityId: 'xuchang',
      requested: { gold: 100, food: 0, troops: 0 },
      requestedByDay: null,
    });
    state = order(state, {
      type: 'answerRequisition',
      requisitionId: state.requisitions[0]!.id,
      answer: 'accept',
    });
    state = order(shorten(state), { type: 'advance', days: 1 });
    expect(state.absoluteDay).toBe(30);
    expect(state.journeys[0]).toMatchObject({
      status: 'delivered',
      deliveredCargo: { gold: 100, personnel: 1 },
    });
    expect(state.requisitions[0]!.status).toBe('delivered');
    expect(
      state.events.filter(
        (event) => event.kind === 'journeyArrival' && event.entityId === state.journeys[0]!.id,
      ),
    ).toHaveLength(1);
    expect(validateV03State(state)).toBe(true);
    const gold = state.cities.find((city) => city.id === 'xuchang')!.gold;
    state.events.forEach((event) => {
      event.acknowledged = true;
    });
    state = order(decodeV03Save(encodeV03Save(state)), { type: 'advance', days: 1 });
    expect(state.cities.find((city) => city.id === 'xuchang')!.gold).toBe(gold);
    expect(state.journeys[0]!.deliveredCargo.gold).toBe(100);
  });

  it('lands a troop-free new governor candidate at day 30, who takes office on arrival', () => {
    let state = order(fixture(), {
      type: 'appointGovernor',
      cityId: 'puyang',
      officerId: 'yuejin',
    });
    expect(state.journeys[0]!.manifest.troopCount).toBe(0);
    state = order(shorten(state), { type: 'advance', days: 1 });
    expect(state.absoluteDay).toBe(30);
    expect(state.officers.find((officer) => officer.id === 'yuejin')).toMatchObject({
      wounded: 0,
      location: { kind: 'city', cityId: 'puyang' },
      governorOfCityId: 'puyang',
    });
    expect(state.cities.find((city) => city.id === 'puyang')).toMatchObject({
      governorId: 'yuejin',
      governanceMode: 'governor',
      pendingAppointment: null,
    });
    expect(state.journeys[0]).toMatchObject({
      status: 'delivered',
      deliveredCargo: { personnel: 1 },
    });
    // Monthly autonomy may legitimately assign a first army after the zero-troop transfer lands.
    expect(state.journeys[0]!.manifest.troopCount).toBe(0);
    expect(validateV03State(state)).toBe(true);
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });
});
