import { describe, expect, it } from 'vitest';
import {
  CITY_GEOGRAPHY,
  ROUTE_DEFINITIONS,
  CITY_GEOGRAPHY_BY_ID,
  ROUTE_BY_ID,
  projectCampaignPoint,
  routeIdBetween,
  straightLineDistanceKm,
  validateGeographyData,
} from '../../src/v03/geography';
import {
  DAYS_PER_YEAR,
  addTimelineEvent,
  advanceTimeline,
  absoluteDayOf,
  advanceJourneyOneDay,
  advanceUntilEvent,
  beginJourneyReturn,
  beginDayResolution,
  calendarDateAt,
  chargeDailyFood,
  closeStrategicDay,
  completeBattleDay,
  completeMonthSettlement,
  createCargoLedger,
  createJourney,
  createStrategicTimeline,
  deliverCargo,
  dispatchCargo,
  estimateCampaignSupply,
  estimateTravel,
  progressJourneysForDay,
  reserveCargo,
  type StrategicTimeline,
} from '../../src/v03/calendar';

const foot = { troopTypes: ['infantry'] } as const;
const horse = { troopTypes: ['cavalry'] } as const;

describe('v0.3 historical geography and routes', () => {
  it('contains all 24 city anchors and all 42 current undirected routes', () => {
    expect(CITY_GEOGRAPHY).toHaveLength(24);
    expect(ROUTE_DEFINITIONS).toHaveLength(42);
    expect(validateGeographyData()).toEqual([]);
    expect(routeIdBetween('hanzhong', 'changan')).toBe('changan--hanzhong');
  });

  it('reproduces published great-circle examples within 5 km', () => {
    const chengdu = CITY_GEOGRAPHY_BY_ID.get('chengdu')!;
    const chongqing = CITY_GEOGRAPHY_BY_ID.get('jiangzhou')!;
    const hanzhong = CITY_GEOGRAPHY_BY_ID.get('hanzhong')!;
    const changan = CITY_GEOGRAPHY_BY_ID.get('changan')!;
    expect(straightLineDistanceKm(hanzhong, changan)).toBe(225);
    expect(straightLineDistanceKm(chengdu, chongqing)).toBe(270);
    expect(projectCampaignPoint(hanzhong.latitude, hanzhong.longitude).x).toBeLessThan(
      projectCampaignPoint(changan.latitude, changan.longitude).x,
    );
  });

  it('keeps the drawn point separate from travel distance and the route snapshot', () => {
    const route = ROUTE_BY_ID.get('changan--hanzhong')!;
    const estimate = estimateTravel(route, 'reverse', 0, foot);
    expect(estimate.estimatedDays).toBe(33);
    expect(estimate.estimatedArrivalDay).toBe(33);
    const movedLabelPoint = projectCampaignPoint(34, 108);
    expect(movedLabelPoint.x).not.toBe(estimate.roadKmNominal);
    const journey = createJourney({
      id: 'j-1',
      executionId: 'exec-1',
      ownerFactionId: 'test',
      route,
      sourceCityId: 'hanzhong',
      destinationCityId: 'changan',
      departureAbsoluteDay: 0,
      manifest: {
        officerIds: ['officer'],
        troopCount: 1000,
        composition: foot,
        carriedFood: 100,
        cargo: {},
      },
    });
    expect(journey.expectedArrivalDay).toBe(33);
    expect(advanceJourneyOneDay(journey).journey.segmentProgressKm).not.toEqual(
      journey.segmentProgressKm,
    );
  });

  it('derives Hanzhong to Chang’an ETA from road segments and rider composition', () => {
    const route = ROUTE_BY_ID.get('changan--hanzhong')!;
    const infantryEstimate = estimateTravel(route, 'reverse', 42, foot);
    const cavalryEstimate = estimateTravel(route, 'reverse', 42, horse);
    expect(infantryEstimate.estimatedDays).toBe(33);
    expect(cavalryEstimate.estimatedDays).toBe(30);
    expect(infantryEstimate.estimatedArrivalDay).toBe(75);
    expect(cavalryEstimate.estimatedArrivalDay).toBe(72);
  });

  it('uses the slowest member in a mixed group, then applies a heavy-train limit', () => {
    const route = ROUTE_BY_ID.get('changan--hanzhong')!;
    const mixed = estimateTravel(route, 'forward', 0, { troopTypes: ['cavalry', 'archer'] });
    const heavy = estimateTravel(route, 'forward', 0, {
      troopTypes: ['cavalry'],
      heavySupplyTrain: true,
    });
    expect(mixed.estimatedDays).toBe(33);
    expect(heavy.estimatedDays).toBeGreaterThan(mixed.estimatedDays);
  });

  it('matches the documented nominal day values for all 42 routes', () => {
    for (const route of ROUTE_DEFINITIONS) {
      const estimate = estimateTravel(route, 'forward', 0, foot);
      expect(estimate.estimatedDays, route.id).toBe(route.baselineDaysNominal);
      expect(
        straightLineDistanceKm(
          CITY_GEOGRAPHY_BY_ID.get(route.fromCityId)!,
          CITY_GEOGRAPHY_BY_ID.get(route.toCityId)!,
        ),
        `${route.id} straight distance`,
      ).toBe(route.straightLineKm);
    }
  });
});

describe('v0.3 calendar and journey progression', () => {
  it('uses 30-day months and a 360-day year without leap days', () => {
    expect(calendarDateAt(190, 0)).toEqual({ year: 190, month: 1, dayOfMonth: 1, absoluteDay: 0 });
    expect(calendarDateAt(190, 29)).toMatchObject({ year: 190, month: 1, dayOfMonth: 30 });
    expect(calendarDateAt(190, 30)).toMatchObject({ year: 190, month: 2, dayOfMonth: 1 });
    expect(calendarDateAt(190, DAYS_PER_YEAR)).toMatchObject({
      year: 191,
      month: 1,
      dayOfMonth: 1,
    });
    expect(absoluteDayOf(190, 191, 1, 1)).toBe(360);
  });

  it('stops at the next visible event and stays bounded when none is available', () => {
    const next = advanceUntilEvent(0, [
      { id: 'hidden', absoluteDay: 1, kind: 'battle', pause: true, visibleToPlayer: false },
      { id: 'arrival', absoluteDay: 5, kind: 'arrival', pause: true, visibleToPlayer: true },
      { id: 'later', absoluteDay: 10, kind: 'decision', pause: true, visibleToPlayer: true },
    ]);
    expect(next).toMatchObject({
      daysAdvanced: 5,
      toDay: 5,
      event: { id: 'arrival' },
      hitStepLimit: false,
    });
    expect(advanceUntilEvent(5, [], 12)).toMatchObject({
      daysAdvanced: 12,
      toDay: 17,
      event: null,
      hitStepLimit: true,
    });
    const withEvent = addTimelineEvent(createStrategicTimeline(190), {
      id: 'visible',
      absoluteDay: 5,
      kind: 'arrival',
      pause: true,
      visibleToPlayer: true,
    });
    expect(advanceTimeline(withEvent, 'next-event')).toMatchObject({
      daysAdvanced: 5,
      stoppedFor: 'event',
      event: { id: 'visible' },
    });
    expect(
      advanceTimeline(createStrategicTimeline(190), 'next-event', {
        maxDaysWithoutEvent: 10,
      }),
    ).toMatchObject({ daysAdvanced: 10, stoppedFor: 'step-limit' });
  });

  it('resolves a daybreak battle set once before journeys and the date move', () => {
    let timeline = createStrategicTimeline(190);
    timeline = beginDayResolution(timeline, ['battle-b', 'battle-a', 'battle-a']);
    expect(timeline.dayResolution?.battleIds).toEqual(['battle-a', 'battle-b']);
    timeline = completeBattleDay(timeline, 'battle-a');
    expect(timeline.dayResolution?.phase).toBe('battles');
    timeline = completeBattleDay(timeline, 'battle-b');
    expect(timeline.dayResolution?.phase).toBe('journeys');
    timeline = progressJourneysForDay(timeline);
    timeline = closeStrategicDay(timeline);
    expect(timeline.absoluteDay).toBe(1);
    expect(timeline.dayResolution).toBeNull();
    const blocked = advanceTimeline(createStrategicTimeline(190), 1, {
      battleIdsAtDaybreak: () => ['manual-battle'],
      resolveBattleDay: (state) => ({ timeline: state, completed: false }),
    });
    expect(blocked).toMatchObject({
      daysAdvanced: 0,
      stoppedFor: 'manual-battle',
      timeline: { absoluteDay: 0, dayResolution: { phase: 'battles' } },
    });
  });

  it('settles at the 30-day boundary and allows saveable month-boundary state', () => {
    let timeline = createStrategicTimeline(190);
    timeline.absoluteDay = 29;
    timeline = beginDayResolution(timeline, []);
    timeline = progressJourneysForDay(timeline);
    timeline = closeStrategicDay(timeline);
    expect(timeline.absoluteDay).toBe(30);
    expect(timeline.dayResolution).toMatchObject({
      phase: 'month-settlement',
      settledMonth: { year: 190, month: 1 },
    });
    timeline = completeMonthSettlement(timeline);
    expect(timeline.dayResolution).toBeNull();
  });

  it('gives identical travel progress from one-day and ten-day stepping', () => {
    const route = ROUTE_BY_ID.get('changan--hanzhong')!;
    const journey = createJourney({
      id: 'long-trip',
      executionId: 'long-trip-exec',
      ownerFactionId: 'test',
      route,
      sourceCityId: 'hanzhong',
      destinationCityId: 'changan',
      departureAbsoluteDay: 0,
      manifest: {
        officerIds: ['marshal'],
        troopCount: 1000,
        composition: foot,
        carriedFood: 2000,
        cargo: { food: 100 },
      },
    });
    const stepDay = (state: StrategicTimeline): StrategicTimeline => {
      let next = beginDayResolution(state, []);
      next = progressJourneysForDay(next);
      return closeStrategicDay(next);
    };
    const initial = { ...createStrategicTimeline(190), journeys: [journey] };
    let oneAtTime = initial;
    for (let i = 0; i < 10; i++) oneAtTime = advanceTimeline(oneAtTime, 1).timeline;
    const tenAtTime = advanceTimeline(initial, 10).timeline;
    expect(tenAtTime).toEqual(oneAtTime);
    expect(oneAtTime.absoluteDay).toBe(10);
    expect(stepDay(initial)).toEqual(advanceTimeline(initial, 1).timeline);
  });

  it('charges en-route rations, records shortfalls, and returns over real road days', () => {
    const route = ROUTE_BY_ID.get('chenliu--xuchang')!;
    const journey = createJourney({
      id: 'round-trip',
      executionId: 'round-trip-command',
      ownerFactionId: 'test',
      route,
      sourceCityId: 'chenliu',
      destinationCityId: 'xuchang',
      departureAbsoluteDay: 0,
      manifest: {
        officerIds: ['captain'],
        troopCount: 1000,
        composition: foot,
        carriedFood: 100,
        cargo: {},
      },
    });
    let arrived = journey;
    for (let i = 0; i < 6; i++) arrived = advanceJourneyOneDay(arrived).journey;
    expect(arrived.status).toBe('delivered');
    expect(arrived.consumedFood).toBe(48);
    const returning = beginJourneyReturn(arrived, 6, {
      ...arrived.manifest,
      carriedFood: 100,
    });
    expect(returning.sourceCityId).toBe('xuchang');
    expect(returning.destinationCityId).toBe('chenliu');
    expect(returning.expectedArrivalDay).toBe(12);
    let returned = returning;
    for (let i = 0; i < 6; i++) returned = advanceJourneyOneDay(returned).journey;
    expect(returned.status).toBe('delivered');
    expect(returned.expectedArrivalDay).toBe(12);

    const hungry = createJourney({
      id: 'hungry',
      executionId: 'hungry-command',
      ownerFactionId: 'test',
      route,
      sourceCityId: 'chenliu',
      destinationCityId: 'xuchang',
      departureAbsoluteDay: 0,
      manifest: { officerIds: [], troopCount: 1000, composition: foot, carriedFood: 1, cargo: {} },
    });
    const hungryStep = advanceJourneyOneDay(hungry);
    expect(hungryStep.foodShortfall).toBe(7);
    expect(hungryStep.journey.accumulatedFoodShortfall).toBe(7);
  });

  it('estimates round-trip food, battle reserve, and integer commitment explicitly', () => {
    const estimate = estimateCampaignSupply({
      troopCount: 1000,
      outboundDays: 33,
      battleDays: 10,
      returnDays: 33,
    });
    expect(estimate.outboundFood).toBeCloseTo(264);
    expect(estimate.battleReserveFood).toBeCloseTo(400);
    expect(estimate.returnFood).toBeCloseTo(264);
    expect(estimate.totalFood).toBe(928);
    expect(estimate.reserveFood).toBe(928);
  });

  it('accumulates fixed-point rations without a troop-splitting rounding tax', () => {
    let whole = { resourceFood: 10, remainderMicro: 0, totalChargedMicro: 0 };
    whole = chargeDailyFood({ account: whole, troopCount: 101, dailyRatePerTroop: 0.004 });
    let split = { resourceFood: 10, remainderMicro: 0, totalChargedMicro: 0 };
    split = chargeDailyFood({ account: split, troopCount: 50, dailyRatePerTroop: 0.004 });
    split = chargeDailyFood({ account: split, troopCount: 51, dailyRatePerTroop: 0.004 });
    expect(split).toEqual(whole);
  });

  it('keeps the cargo ledger idempotent and conserves available, reserved, transit, delivery', () => {
    let ledger = createCargoLedger({ gold: 500, food: 1000, reserve: 200 });
    ledger = reserveCargo(ledger, 'order-1', { gold: 50, food: 200, reserve: 25 });
    expect(ledger.available).toEqual({ gold: 450, food: 800, reserve: 175 });
    ledger = dispatchCargo(ledger, 'order-1');
    ledger = deliverCargo(ledger, 'order-1');
    expect(ledger.executions['order-1']).toMatchObject({
      stage: 'delivered',
      remaining: { gold: 0, food: 0, reserve: 0 },
      delivered: { gold: 50, food: 200, reserve: 25 },
    });
    expect(() => dispatchCargo(ledger, 'order-1')).toThrow();
    expect(() => reserveCargo(ledger, 'order-1', { gold: 1, food: 0, reserve: 0 })).toThrow();
  });
});
