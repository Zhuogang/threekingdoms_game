import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { executeV03Command } from '../../../src/v03/commands';
import { advanceV03 } from '../../../src/v03/engine';
import { availableTroops, createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { canDirectlyAdminister } from '../../../src/v03/governance/authority';
import { pendingCityGovernance } from '../../../src/v03/governance/conquest';
import { previewGovernorTransfer } from '../../../src/v03/governance/appointments';
import { createV03OrderServices } from '../../../src/v03/governance/services';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import { reviewBattleState } from '../../e2e-v03/playability-fixtures';
import type { V03GameState } from '../../../src/v03/types';

const reload = (state: V03GameState) => decodeV03Save(encodeV03Save(state));
function day(state: V03GameState) {
  state.events.forEach((event) => (event.acknowledged = true));
  const next = advanceV03(state, 1);
  expect(next.error).toBeUndefined();
  expect(next.daysAdvanced).toBe(1);
  expect(validateV03State(next.state)).toBe(true);
  return next.state;
}
/**
 * Saves from before arrival-time appointments can hold a candidate who has arrived and is
 * still waiting for the month boundary. Reproduce one by landing the party without the
 * pending appointment, then restoring it.
 */
function arriveAsOlderSave(state: V03GameState, journeyId: string) {
  const cityId = state.cities.find((city) => city.pendingAppointment?.journeyId === journeyId)!.id;
  const pending = state.cities.find((city) => city.id === cityId)!.pendingAppointment;
  state.cities.find((city) => city.id === cityId)!.pendingAppointment = null;
  while (state.journeys.find((journey) => journey.id === journeyId)!.status === 'outbound')
    state = day(reload(state));
  state.cities.find((city) => city.id === cityId)!.pendingAppointment = pending;
  return state;
}
function peace(state: V03GameState) {
  state.alliances = state.factions.flatMap((a, i) =>
    state.factions
      .slice(i + 1)
      .map((b) => ({ a: a.id, b: b.id, expiresMonthIndex: state.monthIndex + 6 })),
  );
}
function conquered(
  intent: 'conquer' | 'raid' | 'sack' = 'conquer',
  winner: 'attacker' | 'defender' = 'attacker',
) {
  const state = reviewBattleState();
  const battle = state.battles.find((entry) => entry.active)!;
  battle.intent = intent;
  battle.battleData.outcome = { winner, reason: 'dayLimit' };
  battle.playerDayComplete = true;
  const resolved = advanceV03(state, 1).state;
  expect(validateV03State(resolved)).toBe(true);
  return resolved;
}
function factionPersonnel(state: V03GameState) {
  return (
    state.officers
      .filter((officer) => officer.factionId === 'cao')
      .reduce((sum, officer) => sum + officer.troops + officer.wounded, 0) +
    state.cities
      .filter((city) => city.factionId === 'cao')
      .reduce((sum, city) => sum + city.reserve, 0) +
    state.troopSources
      .filter((source) => source.factionId === 'cao')
      .reduce((sum, source) => sum + source.troops + source.wounded, 0)
  );
}
function foodInWorld(state: V03GameState) {
  return (
    state.cities.reduce((sum, city) => sum + city.food, 0) +
    state.journeys
      .filter((journey) => ['outbound', 'waiting', 'returning'].includes(journey.status))
      .reduce((sum, journey) => sum + journey.manifest.carriedFood, 0)
  );
}

const residents = (state: V03GameState) =>
  state.cities
    .filter((city) => city.factionId === 'cao')
    .reduce((sum, city) => sum + city.population, 0);
function unledGarrison(state: V03GameState, cityId: string) {
  const city = state.cities.find((entry) => entry.id === cityId)!;
  return (
    city.garrisonTroops -
    state.officers
      .filter(
        (officer) =>
          officer.alive &&
          officer.factionId === city.factionId &&
          officer.location.kind === 'city' &&
          officer.location.cityId === cityId,
      )
      .reduce((sum, officer) => sum + availableTroops(officer), 0)
  );
}

describe('conquest governance and retained contingents', () => {
  it.each(['conquer', 'sack'] as const)(
    'persists one pending governance decision after %s, independent of battle report acknowledgement',
    (intent) => {
      let state = conquered(intent);
      const pending = pendingCityGovernance(state);
      expect(pending).toHaveLength(1);
      state = executeV03Command(state, { type: 'acknowledgeEvent', eventId: pending[0]!.id }).state;
      expect(pendingCityGovernance(reload(state))).toHaveLength(1);
    },
  );

  it.each([
    ['raid', 'attacker'],
    ['conquer', 'defender'],
  ] as const)('does not ask for governance after %s / %s', (intent, winner) => {
    expect(pendingCityGovernance(conquered(intent, winner))).toHaveLength(0);
  });

  it('keeps an acknowledged but undecided conquest through history compaction', () => {
    const state = conquered();
    const pending = pendingCityGovernance(state)[0]!;
    pending.acknowledged = true;
    for (let i = 0; i < 2000; i++)
      state.events.push({
        id: `history-${i}`,
        absoluteDay: state.absoluteDay,
        kind: 'campaignEvent',
        entityId: null,
        title: 'History',
        detail: '',
        acknowledged: true,
      });
    const restored = reload(state);
    expect(restored.events.length).toBeLessThan(state.events.length);
    expect(pendingCityGovernance(restored).map((event) => event.id)).toEqual([pending.id]);
  });

  it('appoints a local victorious officer immediately with their whole contingent and spent work intact', () => {
    const state = conquered();
    const report = pendingCityGovernance(state)[0]!;
    const city = state.cities.find((entry) => entry.id === report.battleOutcome!.cityId)!;
    const officer = state.officers.find(
      (entry) =>
        entry.location.kind === 'city' &&
        entry.location.cityId === city.id &&
        entry.factionId === 'cao',
    )!;
    expect(officer.troops).toBeGreaterThan(0);
    city.workMonthIndex = state.monthIndex;
    city.workPointsUsed = 2;
    const before = structuredClone(officer);
    const result = executeV03Command(state, {
      type: 'resolveCityGovernance',
      eventId: report.id,
      choice: 'governor',
      officerId: officer.id,
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.state.officers.find((entry) => entry.id === officer.id)).toEqual({
      ...before,
      governorOfCityId: city.id,
    });
    expect(result.state.cities.find((entry) => entry.id === city.id)).toMatchObject({
      governorId: officer.id,
      governanceMode: 'governor',
      pendingAppointment: null,
      workPointsUsed: 2,
      garrisonTroops: city.garrisonTroops,
      gold: city.gold,
      food: city.food,
    });
    expect(pendingCityGovernance(reload(result.state))).toHaveLength(0);
    const repeated = executeV03Command(result.state, {
      type: 'resolveCityGovernance',
      eventId: report.id,
      choice: 'governor',
      officerId: officer.id,
    });
    expect(repeated.state).toBe(result.state);
  });

  it('moves only governance authority to the captured city when the ruler is present, preserving both cities and all personnel', () => {
    const state = conquered();
    const report = pendingCityGovernance(state)[0]!;
    const city = state.cities.find((entry) => entry.id === report.battleOutcome!.cityId)!;
    const old = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
    const ruler = state.officers.find((entry) => entry.id === 'caocao')!;
    old.garrisonTroops -= availableTroops(ruler);
    ruler.location = { kind: 'city', cityId: city.id };
    city.garrisonTroops += availableTroops(ruler);
    old.workPointsUsed = 3;
    city.workMonthIndex = state.monthIndex;
    city.workPointsUsed = 2;
    const beforeOld = structuredClone(old),
      beforeCity = structuredClone(city);
    const population = factionPersonnel(state);
    const result = executeV03Command(state, {
      type: 'resolveCityGovernance',
      eventId: report.id,
      choice: 'self',
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.state.playerCapitalCityId).toBe(city.id);
    expect(result.state.factions.find((faction) => faction.id === 'cao')!.capitalCityId).toBe(
      city.id,
    );
    expect(canDirectlyAdminister(result.state, old.id)).toBe(false);
    expect(canDirectlyAdminister(result.state, city.id)).toBe(true);
    expect(result.state.cities.find((entry) => entry.id === old.id)).toEqual({
      ...beforeOld,
      governanceMode: 'steward',
    });
    expect(result.state.cities.find((entry) => entry.id === city.id)).toEqual({
      ...beforeCity,
      governanceMode: 'ruler',
    });
    expect(factionPersonnel(result.state)).toBe(population);
    expect(reload(result.state)).toEqual(result.state);
  });

  it('rejects personal rule while the ruler is elsewhere and discards decisions for a city no longer friendly', () => {
    const state = conquered();
    const report = pendingCityGovernance(state)[0]!;
    const result = executeV03Command(state, {
      type: 'resolveCityGovernance',
      eventId: report.id,
      choice: 'self',
    });
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    state.cities.find((city) => city.id === report.battleOutcome!.cityId)!.factionId = null;
    expect(pendingCityGovernance(state)).toHaveLength(0);
    expect(
      executeV03Command(state, {
        type: 'resolveCityGovernance',
        eventId: report.id,
        choice: 'governor',
        officerId: 'yuejin',
      }).ok,
    ).toBe(false);
  });

  it.each([0, 4])(
    'transfers healthy and wounded personnel with XP and reorganization %s; healing waits until arrival',
    (reorganizationDays) => {
      let state = createV03Game('cao', 1);
      peace(state);
      const officer = state.officers.find((entry) => entry.id === 'caoren')!;
      const source = state.cities.find((entry) => entry.id === 'xuchang')!;
      const target = state.cities.find((entry) => entry.id === 'puyang')!;
      if (reorganizationDays) source.garrisonTroops -= officer.troops;
      Object.assign(officer, { wounded: 100, troopExperience: 1200, reorganizationDays });
      state.personnelDay = createPersonnelDay(state);
      const people = factionPersonnel(state) + residents(state);
      const preview = previewGovernorTransfer(
        state,
        target.id,
        officer.id,
        createV03OrderServices(),
      );
      expect(preview.ok && preview.transfer?.party.troopCount).toBe(1100);
      const result = executeV03Command(state, {
        type: 'appointGovernor',
        cityId: target.id,
        officerId: officer.id,
      });
      expect(result.ok, result.error).toBe(true);
      state = reload(result.state);
      const journeyId = state.cities.find((entry) => entry.id === target.id)!.pendingAppointment!
        .journeyId!;
      expect(state.cities.find((entry) => entry.id === source.id)!.garrisonTroops).toBe(
        source.garrisonTroops - availableTroops(officer),
      );
      expect(state.cities.find((entry) => entry.id === source.id)!.food).toBe(
        source.food - (preview.ok ? preview.transfer!.food : 0),
      );
      state = day(state);
      expect(state.officers.find((entry) => entry.id === officer.id)).toMatchObject({
        troops: 1000,
        wounded: 100,
        troopExperience: 1200,
        reorganizationDays,
      });
      while (state.journeys.find((entry) => entry.id === journeyId)!.status === 'outbound')
        state = day(reload(state));
      expect(state.officers.find((entry) => entry.id === officer.id)).toMatchObject({
        location: { kind: 'city', cityId: target.id },
        troops: 1000,
        wounded: 100,
        reorganizationDays,
      });
      // Recruitment during a ten-day settlement converts residents, without creating people.
      expect(factionPersonnel(state) + residents(state)).toBe(people);
      // The candidate takes office on arrival.
      expect(state.absoluteDay).toBeLessThan(30);
      expect(state.cities.find((entry) => entry.id === target.id)!.governorId).toBe(officer.id);
      expect(state.cities.find((entry) => entry.id === source.id)!.governorId).toBeNull();
      expect(state.officers.find((entry) => entry.id === officer.id)!.troopExperience).toBe(1200);
      expect(reload(state)).toEqual(state);
    },
  );

  it.each([false, true])(
    'returns an intact contingent without duplicating troops or deposited food when cancelled after arrival: %s',
    (afterArrival) => {
      let state = createV03Game('cao', 1);
      peace(state);
      const initial = structuredClone(state);
      const target = 'puyang',
        officerId = 'caocao';
      const result = executeV03Command(state, {
        type: 'appointGovernor',
        cityId: target,
        officerId,
      });
      expect(result.ok, result.error).toBe(true);
      state = result.state;
      const journeyId = state.journeys[0]!.id;
      if (afterArrival) state = arriveAsOlderSave(state, journeyId);
      state = executeV03Command(state, {
        type: 'appointGovernor',
        cityId: target,
        officerId: null,
      }).state;
      while (
        state.officers.find((officer) => officer.id === officerId)!.location.kind === 'journey' ||
        state.journeys.find((journey) => journey.id === journeyId)!.returnRequested
      )
        state = day(reload(state));
      expect(state.absoluteDay).toBeLessThan(30);
      expect(state.officers.find((officer) => officer.id === officerId)!.location).toEqual({
        kind: 'city',
        cityId: initial.playerCapitalCityId,
      });
      expect(factionPersonnel(state) + residents(state)).toBe(
        factionPersonnel(initial) + residents(initial),
      );
      const originalOfficer = initial.officers.find((officer) => officer.id === officerId)!;
      expect(state.officers.find((officer) => officer.id === officerId)).toMatchObject({
        troops: originalOfficer.troops,
        wounded: originalOfficer.wounded,
        troopExperience: originalOfficer.troopExperience,
      });
      for (const id of [target, initial.playerCapitalCityId])
        expect(unledGarrison(state, id)).toBe(unledGarrison(initial, id));
      expect(foodInWorld(state)).toBe(
        foodInWorld(initial) -
          state.journeys.reduce((sum, journey) => sum + journey.consumedFood, 0) +
          state.log.reduce(
            (sum, entry) =>
              sum +
              (entry.includes(' autonomy: buy-food (')
                ? 800
                : entry.includes(' autonomy: sell-food (')
                  ? -800
                  : entry.includes(' autonomy: relieve (')
                    ? -600
                    : 0),
            0,
          ),
      );
    },
  );

  it('rejects an unfunded transfer atomically and keeps voluntary disbanding available', () => {
    const state = createV03Game('cao', 1);
    const source = state.cities.find((city) => city.id === state.playerCapitalCityId)!;
    source.food = 0;
    const result = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: 'puyang',
      officerId: 'caocao',
    });
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    const disband = executeV03Command(state, {
      type: 'disband',
      cityId: source.id,
      recordId: 'officer:caocao',
      troops: 1,
      wounded: 0,
    });
    expect(disband.ok, disband.error).toBe(true);
    expect(disband.state.officers.find((officer) => officer.id === 'caocao')!.troops).toBe(699);
  });

  it('can transfer a wounded-only contingent without clearing its experience or restrictions', () => {
    const state = createV03Game('cao', 1);
    const officer = state.officers.find((entry) => entry.id === 'caoren')!;
    const source = state.cities.find((city) => city.id === 'xuchang')!;
    source.garrisonTroops -= officer.troops;
    Object.assign(officer, {
      troops: 0,
      wounded: 500,
      troopExperience: 1200,
      reorganizationDays: 2,
    });
    state.personnelDay = createPersonnelDay(state);
    const result = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: 'puyang',
      officerId: officer.id,
    });
    expect(result.ok, result.error).toBe(true);
    const restored = reload(result.state);
    expect(restored.journeys[0]!.manifest).toMatchObject({
      troopCount: 500,
      composition: { woundedTroops: 500 },
    });
    expect(restored.officers.find((entry) => entry.id === officer.id)).toMatchObject({
      troops: 0,
      wounded: 500,
      troopExperience: 1200,
      reorganizationDays: 2,
    });
    expect(restored.cities.find((city) => city.id === source.id)!.garrisonTroops).toBe(
      source.garrisonTroops,
    );
  });

  it('protects approved troop reservations when transferring a contingent', () => {
    const state = createV03Game('cao', 1);
    state.requisitions.push({
      id: 'reserved-stock',
      factionId: 'cao',
      sourceCityId: 'chenliu',
      targetCityId: 'puyang',
      requested: { gold: 0, food: 0, troops: 1000 },
      proposed: { gold: 0, food: 0, troops: 1000 },
      createdDay: 0,
      requestedByDay: null,
      earliestDepartureDay: 0,
      estimatedArrivalDay: null,
      status: 'reserved',
      journeyId: null,
      governanceRevision: 0,
      message: '',
    });
    const result = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: 'puyang',
      officerId: 'caocao',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('reserved');
    expect(result.state).toBe(state);
  });

  it('does not let an obsolete appointment return steal a contingent already assigned to a later journey', () => {
    let state = createV03Game('cao', 1);
    peace(state);
    state = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: 'puyang',
      officerId: 'caocao',
    }).state;
    const oldJourneyId = state.journeys[0]!.id;
    state = arriveAsOlderSave(state, oldJourneyId);
    const later = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: 'xuchang',
      officerId: 'caocao',
    });
    expect(later.ok, later.error).toBe(true);
    state = later.state;
    const location = state.officers.find((officer) => officer.id === 'caocao')!.location;
    state = executeV03Command(state, {
      type: 'appointGovernor',
      cityId: 'puyang',
      officerId: null,
    }).state;
    state = day(state);
    expect(state.officers.find((officer) => officer.id === 'caocao')!.location).toEqual(location);
    expect(state.journeys.find((journey) => journey.id === oldJourneyId)).toMatchObject({
      status: 'delivered',
      returnRequested: false,
    });
    expect(reload(state)).toEqual(state);
  });
});
