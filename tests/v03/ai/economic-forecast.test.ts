import { describe, expect, it } from 'vitest';
import { forecastCityEconomy, nextEconomicBoundary } from '../../../src/v03/campaign/economy';
import { advanceV03 } from '../../../src/v03/engine';
import { executeV03Command } from '../../../src/v03/commands';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import type { V03GameState, V03Command } from '../../../src/v03/types';
import { createV03Game } from '../../../src/v03/initial-state';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { planGovernorMonthlyWork } from '../../../src/v03/governance/autonomy';

function emptyCity(day = 220) {
  const state = createV03Game('cao', 17);
  state.absoluteDay = day;
  state.monthIndex = Math.floor(day / 30);
  const city = state.cities.find((entry) => entry.id === 'chenliu')!;
  for (const officer of state.officers)
    if (officer.location.kind === 'city' && officer.location.cityId === city.id)
      Object.assign(officer, { troops: 0, wounded: 0, troopExperience: 0 });
  Object.assign(city, {
    food: 1000,
    gold: 1000,
    farming: 100,
    population: 8000,
    garrisonTroops: 0,
    reserve: 0,
    reservePools: createReservePools(),
    troopServiceDaysThisMonth: 0,
    cavalryServiceDaysThisMonth: 0,
    prisonerServiceDaysThisMonth: 0,
    prisonerCavalryDaysThisMonth: 0,
  });
  state.personnelDay = createPersonnelDay(state);
  return { state, city };
}

describe('V04-02 economic deadlines', () => {
  it('uses the August bill for an August ten-day decision, independent of the legacy month hint', () => {
    const { state, city } = emptyCity();
    const plan = planGovernorMonthlyWork(state, city.id, 8);
    expect(plan.projectedNextMonthFood).toBe(1320);
    expect(planGovernorMonthlyWork(state, city.id, 7).projectedNextMonthFood).toBe(1320);
  });
});

function command(state: V03GameState, input: V03Command) {
  const result = executeV03Command(state, input);
  expect(result.ok, result.error).toBe(true);
  return result.state;
}

describe('V04-02 forecast and real settlement parity', () => {
  it.each([10, 20, 220, 230, 250, 260, 350, 359, 360])(
    'finds the actual closing month on day %s',
    (day) => {
      const { state, city } = emptyCity(day);
      const forecast = forecastCityEconomy(state, city.id);
      expect(forecast.boundary.absoluteDay).toBe((Math.floor(day / 30) + 1) * 30);
      expect(forecast.boundary.harvestMonth).toBe((Math.floor(day / 30) % 12) + 1);
      expect(forecast.production.food).toBe(day >= 240 && day < 270 ? 500 : 320);
    },
  );

  it.each([10, 20])(
    'includes accrued service and only the unpaid part of today on day %s',
    (day) => {
      const { state, city } = emptyCity(day);
      const officer = state.officers.find((entry) => entry.id === 'caocao')!;
      officer.troops = 125;
      city.garrisonTroops = 125;
      city.troopServiceDaysThisMonth = 125 * day;
      city.cavalryServiceDaysThisMonth = officer.troopType === 'cavalry' ? 125 * day : 0;
      state.personnelDay = createPersonnelDay(state);
      state.personnelDay.rations.push({ recordId: 'officer:caocao', troops: 125, wounded: 0 });
      // Fixed personnel, no commands, and treaties keep this fixture out of battle.
      for (const faction of state.factions)
        if (faction.id !== 'cao')
          state.alliances.push({ a: 'cao', b: faction.id, expiresMonthIndex: 6 });
      const forecast = forecastCityEconomy(state, city.id);
      const weight = officer.troopType === 'cavalry' ? 2 : 1;
      expect(forecast.upkeep.food).toBe(Math.ceil(125 * weight * 29 * 0.004));
      let next = decodeV03Save(encodeV03Save(state));
      while (next.absoluteDay < 30) {
        next.events.forEach((event) => (event.acknowledged = true));
        const result = advanceV03(next, 1);
        expect(result.daysAdvanced).toBe(1);
        next = result.state;
      }
      // A random monthly festival is not part of the forecast; account for one that fired here.
      const festivalGold = next.events
        .filter((event) => event.kind === 'campaignEvent')
        .map((event) => JSON.parse(event.detail) as { key?: string; entityIds?: string[] })
        .filter((detail) => detail.key === 'festival' && detail.entityIds?.includes(city.id))
        .reduce((sum) => sum + 150, 0);
      expect(next.cities.find((entry) => entry.id === city.id)!.food).toBe(forecast.projectedFood);
      expect(next.cities.find((entry) => entry.id === city.id)!.gold).toBe(
        forecast.projectedGold - festivalGold,
      );
    },
  );

  it('forecasts an unsettled saved month cursor, then the following bill after settlement', () => {
    const { state, city } = emptyCity(270);
    state.dayResolution = {
      processingAbsoluteDay: 269,
      phase: 'month-settlement',
      battleIds: [],
      completedBattleIds: [],
      daybreakJourneySignatures: {},
      arrivals: [],
      cityServiceAccounted: true,
      settledMonth: { year: state.startYear, month: 9 },
    };
    city.troopServiceDaysThisMonth = 12501;
    expect(validateV03State(state)).toBe(true);
    const preview = forecastCityEconomy(state, city.id);
    expect(preview).toMatchObject({
      boundary: { absoluteDay: 270, harvestMonth: 9, remainingServiceDays: 0 },
      upkeep: { food: 51 },
      projectedFood: 1449,
    });
    expect(forecastCityEconomy(decodeV03Save(encodeV03Save(state)), city.id)).toEqual(preview);
    state.events.forEach((event) => (event.acknowledged = true));
    const settled = advanceV03(state, 1).state;
    expect(settled.cities.find((entry) => entry.id === city.id)!.food).toBe(preview.projectedFood);
    expect(nextEconomicBoundary(settled)).toMatchObject({ absoluteDay: 300, harvestMonth: 10 });
  });

  it.each([false, true])(
    'matches actual food/gold for mixed personnel and prepaid rations: %s',
    (paid) => {
      const { state, city } = emptyCity(29);
      const cavalry = state.officers.find((entry) => entry.id === 'caocao')!;
      const infantry = state.officers.find((entry) => entry.id === 'xiahoudun')!;
      Object.assign(cavalry, {
        troops: 101,
        wounded: 37,
        troopExperience: 500,
      });
      Object.assign(infantry, {
        troops: 80,
        wounded: 17,
        troopExperience: 500,
      });
      city.garrisonTroops = 181;
      city.reservePools = createReservePools(75, 11, 29);
      city.reserve = 115;
      const prisoner = state.officers.find(
        (entry) =>
          entry.alive &&
          entry.factionId === 'yuan' &&
          entry.troopType === 'cavalry' &&
          entry.id !== 'yuanshao',
      )!;
      Object.assign(prisoner, {
        troops: 11,
        wounded: 13,
        governorOfCityId: null,
        location: { kind: 'captured', cityId: city.id },
      });
      for (const other of state.cities)
        if (other.governorId === prisoner.id) {
          other.governorId = null;
          other.governanceMode = 'steward';
        }
      state.troopSources.push({
        id: 'forecast-wounded',
        cityId: city.id,
        factionId: city.factionId,
        sourceOfficerId: null,
        autoReturn: false,
        troopType: 'cavalry',
        troops: 23,
        wounded: 31,
        troopExperience: 100,
        reorganizationDays: 0,
      });
      Object.assign(city, {
        troopServiceDaysThisMonth: 10001,
        cavalryServiceDaysThisMonth: 4011,
        prisonerServiceDaysThisMonth: 100,
        prisonerCavalryDaysThisMonth: 100,
      });
      state.personnelDay = createPersonnelDay(state);
      if (paid)
        state.personnelDay.rations.push(
          { recordId: 'officer:caocao', troops: 101, wounded: 37 },
          { recordId: `officer:${prisoner.id}`, troops: 11, wounded: 13 },
        );
      expect(validateV03State(state)).toBe(true);
      const before = structuredClone(state);
      const forecast = forecastCityEconomy(state, city.id);
      expect(state).toEqual(before);
      expect(forecastCityEconomy(decodeV03Save(encodeV03Save(state)), city.id)).toEqual(forecast);
      state.events.forEach((event) => (event.acknowledged = true));
      const next = advanceV03(state, 1).state;
      const actual = next.cities.find((entry) => entry.id === city.id)!;
      expect(actual.food).toBe(forecast.projectedFood);
      expect(actual.gold).toBe(forecast.projectedGold);
      expect(validateV03State(next)).toBe(true);
    },
  );

  it('distinguishes raw, reserved and post-action stock without spending anything in preview', () => {
    const { state, city } = emptyCity(20);
    const template = command(state, {
      type: 'requestRequisition',
      sourceCityId: city.id,
      targetCityId: 'xuchang',
      requested: { gold: 100, food: 500, troops: 0 },
      requestedByDay: null,
    });
    // Preserve the genuine order shape at its accepted, undispatched stage.
    const requested = structuredClone(state);
    requested.requisitions.push({ ...template.requisitions[0]!, journeyId: null });
    requested.nextId = template.nextId;
    const order = requested.requisitions[0]!;
    Object.assign(order, { status: 'accepted', proposed: { gold: 100, food: 500, troops: 0 } });
    const before = structuredClone(requested);
    const preview = forecastCityEconomy(requested, city.id);
    expect(preview.stock.food).toBe(1000);
    expect(preview.available.food).toBe(500);
    expect(preview.projectedAvailable.food).toBe(preview.projectedFood - 500);
    expect(requested).toEqual(before);
    const bought = command(requested, { type: 'cityAction', cityId: city.id, action: 'buy-food' });
    expect(forecastCityEconomy(bought, city.id).projectedFood).toBe(preview.projectedFood + 2000);
    expect(forecastCityEconomy(bought, city.id).projectedGold).toBe(preview.projectedGold - 200);
  });

  it.each([1, 2])(
    'counts an arriving food convoy only by the bill deadline (%s days left)',
    (travelDays) => {
      const { state, city } = emptyCity(29);
      state.cities.find((entry) => entry.id === 'xuchang')!.food = 10000;
      let next = command(state, {
        type: 'requestRequisition',
        sourceCityId: 'xuchang',
        targetCityId: city.id,
        requested: { gold: 0, food: 500, troops: 0 },
        requestedByDay: null,
      });
      next = command(next, {
        type: 'answerRequisition',
        requisitionId: next.requisitions[0]!.id,
        answer: 'accept',
      });
      const journey = next.journeys[0]!;
      journey.routeSnapshot.forEach((segment, i) => {
        segment.lengthKm = 1;
        segment.fixedDelayDays = i === 0 ? travelDays - 1 : 0;
      });
      journey.segmentProgressKm.fill(0);
      journey.segmentWaitDays = journey.routeSnapshot.map((segment) => segment.fixedDelayDays);
      journey.expectedArrivalDay = 29 + travelDays;
      const forecast = forecastCityEconomy(next, city.id);
      expect(forecast.arrivals).toHaveLength(travelDays === 1 ? 1 : 0);
      const before = structuredClone(next);
      expect(forecastCityEconomy(next, city.id)).toEqual(forecast);
      expect(next).toEqual(before);
      expect(forecastCityEconomy(decodeV03Save(encodeV03Save(next)), city.id)).toEqual(forecast);
      next.events.forEach((event) => (event.acknowledged = true));
      next = advanceV03(next, 1).state;
      expect(next.cities.find((entry) => entry.id === city.id)!.food).toBe(forecast.projectedFood);
      expect(next.journeys[0]!.status).toBe(travelDays === 1 ? 'delivered' : 'outbound');
    },
  );
});
