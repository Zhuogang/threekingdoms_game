import { describe, expect, it } from 'vitest';
import {
  CITY_GEOGRAPHY,
  C_GRADE_ANCHOR_IDS,
  ROUTE_DEFINITIONS,
  CITY_GEOGRAPHY_BY_ID,
  ROUTE_BY_ID,
  projectCampaignPoint,
  findStrategicRoutePath,
  analyzeAnchorSensitivity,
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
  deliverCargoWithinCapacity,
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

  it('finds a reproducible friendly multi-leg route and never transits excluded cities', () => {
    const friendlyCities = new Set(
      CITY_GEOGRAPHY.map((city) => city.id).filter((cityId) => cityId !== 'hanzhong'),
    );
    const first = findStrategicRoutePath('xuchang', 'chengdu', {
      allowedCityIds: friendlyCities,
      departureAbsoluteDay: 12,
      composition: foot,
    });
    const repeated = findStrategicRoutePath('xuchang', 'chengdu', {
      allowedCityIds: friendlyCities,
      departureAbsoluteDay: 12,
      composition: foot,
    });

    expect(first).not.toBeNull();
    expect(repeated).toEqual(first);
    expect(first!.cityIds[0]).toBe('xuchang');
    expect(first!.cityIds.at(-1)).toBe('chengdu');
    expect(first!.cityIds.length).toBeGreaterThan(2);
    expect(first!.cityIds).not.toContain('hanzhong');
    expect(first!.legs).toHaveLength(first!.cityIds.length - 1);
    expect(first!.roadKmNominal).toBe(
      first!.legs.reduce((sum, leg) => sum + leg.route.roadKmNominal, 0),
    );
    expect(first!.estimatedDays).toBeGreaterThan(0);

    const noFriendlyCorridor = new Set(
      CITY_GEOGRAPHY.map((city) => city.id).filter(
        (cityId) => cityId !== 'hanzhong' && cityId !== 'jiangzhou',
      ),
    );
    expect(
      findStrategicRoutePath('xuchang', 'chengdu', { allowedCityIds: noFriendlyCorridor }),
    ).toBeNull();
  });

  it('reports ±20/40 km map-anchor sensitivity for every C-grade city without changing roads', () => {
    expect(C_GRADE_ANCHOR_IDS).toHaveLength(5);
    for (const cityId of C_GRADE_ANCHOR_IDS) {
      for (const radiusKm of [20, 40] as const) {
        const results = analyzeAnchorSensitivity(cityId, radiusKm);
        const adjacent = ROUTE_DEFINITIONS.filter(
          (route) => route.fromCityId === cityId || route.toCityId === cityId,
        );
        expect(results).toHaveLength(adjacent.length);
        for (const result of results) {
          expect(result.minimumStraightLineKm).toBeLessThanOrEqual(result.baselineStraightLineKm);
          expect(result.maximumStraightLineKm).toBeGreaterThanOrEqual(
            result.baselineStraightLineKm,
          );
          expect(
            ROUTE_BY_ID.get(result.routeId)?.roadKmNominal,
            `${cityId} ±${radiusKm} km ${result.routeId} nominal road km`,
          ).toBe(adjacent.find((route) => route.id === result.routeId)?.roadKmNominal);
        }
      }
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

  it('does not move a journey created or replaced by a battle until the next day', () => {
    const route = ROUTE_BY_ID.get('chenliu--xuchang')!;
    const arrivedJourney = {
      ...createJourney({
        id: 'return-trip',
        executionId: 'return-command',
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
      }),
      status: 'delivered' as const,
    };
    const initial = {
      ...createStrategicTimeline(190),
      absoluteDay: 5,
      journeys: [arrivedJourney],
    };
    const advanced = advanceTimeline(initial, 1, {
      battleIdsAtDaybreak: () => ['battle'],
      resolveBattleDay: (current) => {
        const returning = beginJourneyReturn(arrivedJourney, current.absoluteDay);
        return {
          timeline: { ...current, journeys: [returning] },
          completed: true,
        };
      },
    });
    const returning = advanced.timeline.journeys[0]!;
    expect(advanced.daysAdvanced).toBe(1);
    expect(returning.status).toBe('returning');
    expect(returning.elapsedDays).toBe(0);
    expect(returning.segmentProgressKm).toEqual([0]);
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

  it('refreshes events after settlement and stops at a newly created month report', () => {
    const initial = { ...createStrategicTimeline(190), absoluteDay: 29 };
    const advanced = advanceTimeline(initial, 10, {
      settleMonth: (timeline) => completeMonthSettlement(timeline),
      refreshTimeline: (timeline) =>
        timeline.absoluteDay === 30 && !timeline.events.some((event) => event.id === 'month-report')
          ? addTimelineEvent(timeline, {
              id: 'month-report',
              absoluteDay: timeline.absoluteDay,
              kind: 'monthly-report',
              pause: true,
              visibleToPlayer: true,
            })
          : timeline,
    });
    expect(advanced).toMatchObject({
      daysAdvanced: 1,
      stoppedFor: 'event',
      event: { id: 'month-report', absoluteDay: 30 },
      timeline: { absoluteDay: 30 },
    });
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

  it('charges cavalry twice the actual daily marching food of infantry', () => {
    const create = (cavalryTroops: number) =>
      createJourney({
        id: `rations-${cavalryTroops}`,
        executionId: 'ration-check',
        ownerFactionId: 'test',
        route: ROUTE_BY_ID.get('changan--hanzhong')!,
        sourceCityId: 'hanzhong',
        destinationCityId: 'changan',
        departureAbsoluteDay: 0,
        manifest: {
          officerIds: [],
          troopCount: 1000,
          composition: { troopTypes: cavalryTroops ? ['cavalry'] : ['infantry'], cavalryTroops },
          carriedFood: 100,
          cargo: {},
        },
      });
    const footDay = advanceJourneyOneDay(create(0)).journey;
    const horseDay = advanceJourneyOneDay(create(1000)).journey;
    const mixedDay = advanceJourneyOneDay(create(500)).journey;
    expect(footDay.consumedFood).toBe(8);
    expect(horseDay.consumedFood).toBe(16);
    expect(mixedDay.consumedFood).toBe(12);
  });

  it('carries fractional daily rations without reporting starvation when stock covers them', () => {
    const route = ROUTE_BY_ID.get('changan--hanzhong')!;
    let journey = createJourney({
      id: 'fractional-rations',
      executionId: 'fractional-rations-command',
      ownerFactionId: 'test',
      route,
      sourceCityId: 'hanzhong',
      destinationCityId: 'changan',
      departureAbsoluteDay: 0,
      manifest: {
        officerIds: [],
        troopCount: 101,
        composition: foot,
        carriedFood: 100,
        cargo: {},
      },
    });
    for (let day = 0; day < 10; day++) journey = advanceJourneyOneDay(journey).journey;
    expect(journey.consumedFood).toBe(8);
    expect(journey.manifest.carriedFood).toBe(92);
    expect(journey.supplyRemainderMicro).toBe(80_000);
    expect(journey.accumulatedFoodShortfall).toBe(0);

    const noStock = createJourney({
      id: 'fractional-shortfall',
      executionId: 'fractional-shortfall-command',
      ownerFactionId: 'test',
      route,
      sourceCityId: 'hanzhong',
      destinationCityId: 'changan',
      departureAbsoluteDay: 0,
      manifest: {
        officerIds: [],
        troopCount: 1,
        composition: foot,
        carriedFood: 0,
        cargo: {},
      },
    });
    const shortfallStep = advanceJourneyOneDay(noStock);
    expect(shortfallStep.foodShortfall).toBe(0.008);
    expect(shortfallStep.journey.supplyRemainderMicro).toBe(0);
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

  it('holds cargo at a full destination and delivers the exact remainder after capacity frees', () => {
    let ledger = createCargoLedger({ gold: 200, food: 0, reserve: 0 });
    ledger = reserveCargo(ledger, 'blocked-delivery', { gold: 200, food: 0, reserve: 0 });
    ledger = dispatchCargo(ledger, 'blocked-delivery');
    ledger = deliverCargoWithinCapacity(ledger, 'blocked-delivery', {
      gold: 0,
      food: 0,
      reserve: 0,
    });
    expect(ledger.executions['blocked-delivery']).toMatchObject({
      stage: 'waiting',
      remaining: { gold: 200, food: 0, reserve: 0 },
      delivered: { gold: 0, food: 0, reserve: 0 },
    });

    ledger = deliverCargoWithinCapacity(ledger, 'blocked-delivery', {
      gold: 150,
      food: 0,
      reserve: 0,
    });
    expect(ledger.executions['blocked-delivery']).toMatchObject({
      stage: 'waiting',
      remaining: { gold: 50, food: 0, reserve: 0 },
      delivered: { gold: 150, food: 0, reserve: 0 },
    });
    ledger = deliverCargoWithinCapacity(ledger, 'blocked-delivery', {
      gold: 50,
      food: 0,
      reserve: 0,
    });
    expect(ledger.executions['blocked-delivery']).toMatchObject({
      stage: 'delivered',
      remaining: { gold: 0, food: 0, reserve: 0 },
      delivered: { gold: 200, food: 0, reserve: 0 },
    });
  });
});
