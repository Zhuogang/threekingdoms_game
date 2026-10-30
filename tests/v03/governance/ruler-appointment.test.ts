import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { executeV03Command } from '../../../src/v03/commands';
import { advanceV03, reconcileV03Rulers } from '../../../src/v03/engine';
import { availableTroops } from '../../../src/v03/campaign/personnel';
import { applyGovernanceMonthBoundary } from '../../../src/v03/governance/appointments';
import { canDirectlyAdminister } from '../../../src/v03/governance/authority';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import type { V03GameState } from '../../../src/v03/types';

const reload = (state: V03GameState) => decodeV03Save(encodeV03Save(state));
function fixture(local = true) {
  const state = createV03Game('liu', 1);
  const city = state.cities.find((entry) => entry.id === 'beiping')!;
  expect(city.factionId).toBeNull();
  city.factionId = 'liu';
  city.governanceMode = 'steward';
  city.workMonthIndex = state.monthIndex;
  city.workPointsUsed = 2;
  const old = state.cities.find((entry) => entry.id === 'pingyuan')!;
  old.workPointsUsed = 3;
  const ruler = state.officers.find((entry) => entry.id === 'liubei')!;
  if (local) {
    old.garrisonTroops -= availableTroops(ruler);
    ruler.location = { kind: 'city', cityId: city.id };
    city.garrisonTroops += availableTroops(ruler);
  }
  expect(validateV03State(state)).toBe(true);
  return { state, city, old, ruler };
}
function expectCapital(state: V03GameState, cityId: string) {
  expect(state.playerCapitalCityId).toBe(cityId);
  expect(state.factions.find((entry) => entry.id === 'liu')!.capitalCityId).toBe(cityId);
  expect(canDirectlyAdminister(state, cityId)).toBe(true);
  expect(
    state.cities
      .filter((entry) => entry.factionId === 'liu' && entry.governanceMode === 'ruler')
      .map((entry) => entry.id),
  ).toEqual([cityId]);
  expect(validateV03State(state)).toBe(true);
}

describe('ruler appointments and capital consistency', () => {
  it('starts personal rule at once where the ruler stands, moving both capital fields without resetting stock, personnel or work', () => {
    const { state, city, old, ruler } = fixture();
    const previous = state.officers.find((entry) => entry.id === 'guanyu')!;
    city.governorId = previous.id;
    city.governanceMode = 'governor';
    previous.governorOfCityId = city.id;
    const queued = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: city.id,
      officerId: ruler.id,
    });
    expect(queued.ok, queued.error).toBe(true);
    const next = queued.state;
    expect(next.absoluteDay).toBe(state.absoluteDay);
    expectCapital(next, city.id);
    expect(next.cities.find((entry) => entry.id === old.id)).toEqual({
      ...old,
      governanceMode: 'steward',
    });
    expect(next.cities.find((entry) => entry.id === city.id)).toEqual({
      ...city,
      governorId: null,
      governanceMode: 'ruler',
      pendingAppointment: null,
    });
    expect(next.officers.find((entry) => entry.id === ruler.id)).toEqual(ruler);
    expect(next.officers.find((entry) => entry.id === previous.id)!.governorOfCityId).toBeNull();
    expect(next.events.at(-1)).toMatchObject({
      code: 'city.governance',
      params: { choice: 'self', cityId: city.id },
    });
    expect(reload(next)).toEqual(next);
  });

  it('does not move the capital while the ruler is travelling; personal rule starts the day they arrive', () => {
    const { state, city, old, ruler } = fixture(false);
    state.alliances = state.factions.flatMap((a, i) =>
      state.factions.slice(i + 1).map((b) => ({ a: a.id, b: b.id, expiresMonthIndex: 6 })),
    );
    const queued = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: city.id,
      officerId: ruler.id,
    });
    expect(queued.ok, queued.error).toBe(true);
    let next = reload(queued.state);
    expectCapital(next, old.id);
    // A month boundary before arrival leaves the old capital and the appointment as they are.
    const pending = next.cities.find((entry) => entry.id === city.id)!.pendingAppointment;
    const boundary = applyGovernanceMonthBoundary(next, 30);
    expectCapital(boundary, old.id);
    expect(boundary.cities.find((entry) => entry.id === city.id)!.pendingAppointment).toEqual(
      pending,
    );
    const journeyId = pending!.journeyId!;
    for (
      let i = 0;
      i < 120 && next.journeys.find((entry) => entry.id === journeyId)!.status === 'outbound';
      i++
    ) {
      next.events.forEach((event) => (event.acknowledged = true));
      const result = advanceV03(next, 1);
      expect(result.error).toBeUndefined();
      expect(result.daysAdvanced).toBe(1);
      next = reload(result.state);
      if (next.cities.find((entry) => entry.id === city.id)!.pendingAppointment)
        expectCapital(next, old.id);
    }
    expect(next.journeys.find((entry) => entry.id === journeyId)!.status).toBe('delivered');
    expect(next.officers.find((entry) => entry.id === ruler.id)!.location).toEqual({
      kind: 'city',
      cityId: city.id,
    });
    expect(next.cities.find((entry) => entry.id === city.id)!.pendingAppointment).toBeNull();
    expectCapital(next, city.id);
    expect(next.officers.find((entry) => entry.id === ruler.id)!.governorOfCityId).toBeNull();
    expect(reload(next)).toEqual(next);
  });

  it.each([false, true])(
    'repairs an already effective Liu Bei governor office on load, even when the ruler is away: %s',
    (local) => {
      const { state, city, old, ruler } = fixture(local);
      city.governorId = ruler.id;
      city.governanceMode = 'governor';
      ruler.governorOfCityId = city.id;
      expect(validateV03State(state)).toBe(true);
      const next = reload(state);
      expectCapital(next, city.id);
      expect(next.cities.find((entry) => entry.id === old.id)).toEqual({
        ...old,
        governanceMode: 'steward',
      });
      expect(next.cities.find((entry) => entry.id === city.id)).toEqual({
        ...city,
        governorId: null,
        governanceMode: 'ruler',
      });
      expect(next.officers.find((entry) => entry.id === ruler.id)).toEqual({
        ...ruler,
        governorOfCityId: null,
      });
      expect(next.absoluteDay).toBe(state.absoluteDay);
      expect(next.rng).toBe(state.rng);
      expect(reconcileV03Rulers(next)).toBe(next);
      expect(reload(next)).toEqual(next);
      expect(state.playerCapitalCityId).toBe(old.id);
    },
  );
});
