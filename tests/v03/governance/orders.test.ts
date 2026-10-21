import { describe, expect, it } from 'vitest';
import type { TravelComposition } from '../../../src/v03/calendar';
import {
  answerCampaignDirective,
  answerRequisition,
  previewCampaignDirective,
  previewRequisition,
  refreshWaitingRequisitions,
  requestCampaignDirective,
  requestRequisition,
  type GovernanceOrderServices,
  type JourneyCreationInput,
} from '../../../src/v03/governance/orders';
import type { V03GameState, V03Journey } from '../../../src/v03/types';

function fixture(): V03GameState {
  const state: V03GameState = {
    version: 3,
    ruleset: 'hegemony-3',
    revision: 0,
    scenarioId: 'orders-test',
    seed: 1,
    playerFactionId: 'player',
    startYear: 190,
    absoluteDay: 12,
    monthIndex: 0,
    rng: 1,
    nextId: 1,
    phase: 'planning',
    playerCapitalCityId: 'source',
    factions: [],
    cities: [
      {
        id: 'source',
        name: 'Source',
        chinese: '来源',
        region: 'A',
        factionId: 'player',
        population: 5000,
        farming: 100,
        commerce: 100,
        loyalty: 70,
        gold: 1000,
        food: 5000,
        reserve: 0,
        garrisonTroops: 3000,
        governorId: null,
        pendingAppointment: null,
        governanceMode: 'ruler',
      },
      {
        id: 'friend',
        name: 'Friend',
        chinese: '友城',
        region: 'B',
        factionId: 'player',
        population: 4000,
        farming: 80,
        commerce: 70,
        loyalty: 60,
        gold: 500,
        food: 600,
        reserve: 0,
        garrisonTroops: 0,
        governorId: null,
        pendingAppointment: null,
        governanceMode: 'governor',
      },
      {
        id: 'enemy',
        name: 'Enemy',
        chinese: '敌城',
        region: 'C',
        factionId: 'enemy',
        population: 4000,
        farming: 80,
        commerce: 70,
        loyalty: 60,
        gold: 500,
        food: 600,
        reserve: 0,
        garrisonTroops: 0,
        governorId: null,
        pendingAppointment: null,
        governanceMode: 'steward',
      },
    ],
    officers: [
      {
        id: 'infantry-a',
        name: 'A',
        chinese: '甲',
        factionId: 'player',
        location: { kind: 'city', cityId: 'source' },
        force: 70,
        intellect: 60,
        loyalty: 80,
        age: 30,
        troops: 1000,
        troopType: 'infantry',
        experience: 0,
        level: 0,
        governorOfCityId: null,
        alive: true,
      },
      {
        id: 'archer-b',
        name: 'B',
        chinese: '乙',
        factionId: 'player',
        location: { kind: 'city', cityId: 'source' },
        force: 60,
        intellect: 70,
        loyalty: 80,
        age: 31,
        troops: 900,
        troopType: 'archer',
        experience: 0,
        level: 0,
        governorOfCityId: null,
        alive: true,
      },
      {
        id: 'cavalry-c',
        name: 'C',
        chinese: '丙',
        factionId: 'player',
        location: { kind: 'city', cityId: 'source' },
        force: 80,
        intellect: 50,
        loyalty: 75,
        age: 32,
        troops: 1100,
        troopType: 'cavalry',
        experience: 0,
        level: 0,
        governorOfCityId: null,
        alive: true,
      },
    ],
    journeys: [],
    requisitions: [],
    directives: [],
    battles: [],
    dayResolution: null,
    events: [],
    log: [],
    winnerFactionId: null,
    governanceRevision: 0,
  };
  return state;
}

function partyFor(state: Readonly<V03GameState>, sourceCityId: string, maxTroops: number) {
  const chosen = state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === state.playerFactionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === sourceCityId &&
        officer.troops > 0,
    )
    .sort((a, b) => b.troops - a.troops);
  const picked: typeof chosen = [];
  let troopCount = 0;
  for (const officer of chosen) {
    if (troopCount + officer.troops <= maxTroops) {
      picked.push(officer);
      troopCount += officer.troops;
    }
  }
  if (!troopCount) return null;
  return {
    officerIds: picked.map((officer) => officer.id),
    troopCount,
    composition: {
      troopTypes: [
        ...new Set(picked.map((officer) => officer.troopType)),
      ] as TravelComposition['troopTypes'][number][],
    },
  };
}

function services(
  options: { noRoute?: boolean; failCreate?: boolean } = {},
): GovernanceOrderServices {
  return {
    planRoute: () =>
      options.noRoute
        ? null
        : {
            routeId: 'source--target',
            routeVersion: 'test-1',
            roadKmNominal: 100,
            estimatedDays: 5,
            routeSnapshot: [
              {
                terrain: 'plain',
                lengthKm: 100,
                baseSpeedKmPerDay: 20,
                speedMultiplier: 1,
                fixedDelayDays: 0,
              },
            ],
          },
    planParty: ({ state, sourceCityId, maxTroops }) => partyFor(state, sourceCityId, maxTroops),
    createJourney: (input) => {
      if (options.failCreate) throw new Error('injected factory failure');
      return makeJourney(input);
    },
  };
}

function makeJourney(input: JourneyCreationInput): V03Journey {
  return {
    id: input.id,
    executionId: input.executionId,
    ownerFactionId: input.ownerFactionId,
    kind: input.kind,
    ...(input.intent ? { intent: input.intent } : {}),
    sourceCityId: input.sourceCityId,
    destinationCityId: input.targetCityId,
    routeId: input.route.routeId,
    routeVersion: input.route.routeVersion,
    routeSnapshot: [...input.route.routeSnapshot],
    roadKmNominal: input.route.roadKmNominal,
    departedAbsoluteDay: input.departureDay,
    expectedArrivalDay: input.arrivalDay,
    elapsedDays: 0,
    segmentProgressKm: input.route.routeSnapshot.map(() => 0),
    segmentWaitDays: input.route.routeSnapshot.map((segment) => segment.fixedDelayDays),
    manifest: {
      officerIds: [...input.party.officerIds],
      troopCount: input.party.troopCount,
      composition: input.party.composition,
      carriedFood: input.carriedFood,
      cargo: { gold: input.cargo.gold, food: input.cargo.food, troops: input.cargo.troops },
    },
    status: 'outbound',
    deliveredCargo: {},
    consumedFood: 0,
    supplyRemainderMicro: 0,
    accumulatedFoodShortfall: 0,
  };
}

describe('v0.3 governor orders', () => {
  it('previews a requisition shortfall and requires a player choice before reserving or dispatching', () => {
    const state = fixture();
    const preview = previewRequisition(
      state,
      {
        sourceCityId: 'source',
        targetCityId: 'friend',
        requested: { gold: 1300, food: 0, troops: 0 },
        requestedByDay: null,
      },
      services(),
    );
    expect(preview.ready).toBe(false);
    expect(preview.requiresPlayerChoice).toBe(true);
    expect(preview.executable).toEqual({ gold: 1000, food: 0, troops: 0 });
    expect(preview.earliestDepartureDay).toBeGreaterThan(state.absoluteDay);
    expect(preview.estimatedArrivalDay).toBeGreaterThan(preview.earliestDepartureDay!);
    const result = requestRequisition(
      state,
      {
        sourceCityId: 'source',
        targetCityId: 'friend',
        requested: { gold: 1300, food: 0, troops: 0 },
        requestedByDay: null,
      },
      services(),
    );
    expect(result.ok).toBe(true);
    expect(result.order?.status).toBe('proposed');
    expect(result.state.cities[0]?.gold).toBe(1000);
    expect(result.state.journeys).toHaveLength(0);
  });

  it('atomically dispatches an accepted reduced requisition and makes repeat confirmation idempotent', () => {
    const api = services();
    const requested = requestRequisition(
      fixture(),
      {
        sourceCityId: 'source',
        targetCityId: 'friend',
        requested: { gold: 1300, food: 0, troops: 0 },
        requestedByDay: null,
      },
      api,
    );
    const orderId = requested.order!.id;
    const accepted = answerRequisition(requested.state, orderId, 'reduce', api, {
      gold: 800,
      food: 0,
      troops: 0,
    });
    expect(accepted.ok).toBe(true);
    expect(accepted.order?.status).toBe('dispatched');
    expect(accepted.state.cities.find((city) => city.id === 'source')?.gold).toBe(200);
    expect(accepted.state.journeys).toHaveLength(1);
    const repeated = answerRequisition(accepted.state, orderId, 'accept', api);
    expect(repeated.ok).toBe(true);
    expect(repeated.state).toBe(accepted.state);
    expect(repeated.state.journeys).toHaveLength(1);
    expect(repeated.state.cities.find((city) => city.id === 'source')?.gold).toBe(200);
  });

  it('refreshes a waiting order when stock becomes sufficient and dispatches only after confirmation', () => {
    const api = services();
    const requested = requestRequisition(
      fixture(),
      {
        sourceCityId: 'source',
        targetCityId: 'friend',
        requested: { gold: 1500, food: 0, troops: 0 },
        requestedByDay: null,
      },
      api,
    );
    const waiting = answerRequisition(requested.state, requested.order!.id, 'wait', api);
    expect(waiting.order?.status).toBe('waiting');
    const funded = structuredClone(waiting.state);
    funded.absoluteDay += 30;
    funded.cities.find((city) => city.id === 'source')!.gold = 2000;
    const refreshed = refreshWaitingRequisitions(funded, api);
    expect(refreshed.requisitions[0]?.status).toBe('proposed');
    expect(refreshed.journeys).toHaveLength(0);
    const accepted = answerRequisition(refreshed, requested.order!.id, 'accept', api);
    expect(accepted.order?.status).toBe('dispatched');
    expect(accepted.state.journeys).toHaveLength(1);
  });

  it('cancels a pending requisition atomically and makes repeated cancellation idempotent', () => {
    const api = services();
    const requested = requestRequisition(
      fixture(),
      {
        sourceCityId: 'source',
        targetCityId: 'friend',
        requested: { gold: 1300, food: 0, troops: 0 },
        requestedByDay: null,
      },
      api,
    );
    const beforeCancel = structuredClone(requested.state);
    const cancelled = answerRequisition(requested.state, requested.order!.id, 'cancel', api);

    expect(cancelled.ok).toBe(true);
    expect(cancelled.order?.status).toBe('cancelled');
    expect(cancelled.state.cities).toEqual(beforeCancel.cities);
    expect(cancelled.state.journeys).toEqual([]);

    const repeated = answerRequisition(cancelled.state, requested.order!.id, 'cancel', api);
    expect(repeated.ok).toBe(true);
    expect(repeated.state).toBe(cancelled.state);
    expect(repeated.state.journeys).toEqual([]);
  });

  it('revalidates a stale proposal after governance changes without applying it silently', () => {
    const api = services();
    const requested = requestRequisition(
      fixture(),
      {
        sourceCityId: 'source',
        targetCityId: 'friend',
        requested: { gold: 1200, food: 0, troops: 0 },
        requestedByDay: null,
      },
      api,
    );
    const updated = structuredClone(requested.state);
    updated.governanceRevision += 1;
    updated.cities.find((city) => city.id === 'source')!.gold = 1400;
    const first = answerRequisition(updated, requested.order!.id, 'accept', api);
    expect(first.order?.status).toBe('proposed');
    expect(first.reasonCode).toBe('order.stale-proposal');
    expect(first.state.journeys).toHaveLength(0);
    const second = answerRequisition(first.state, requested.order!.id, 'accept', api);
    expect(second.order?.status).toBe('dispatched');
    expect(second.state.cities.find((city) => city.id === 'source')?.gold).toBe(200);
  });

  it('leaves state untouched when a shipment factory fails or the route is unavailable', () => {
    const state = fixture();
    const failed = requestRequisition(
      state,
      {
        sourceCityId: 'source',
        targetCityId: 'friend',
        requested: { gold: 100, food: 0, troops: 0 },
        requestedByDay: null,
      },
      services({ failCreate: true }),
    );
    expect(failed.ok).toBe(false);
    expect(failed.reasonCode).toBe('order.dispatch-failed');
    expect(failed.state).toBe(state);
    expect(state.cities.find((city) => city.id === 'source')?.gold).toBe(1000);
    const noRoute = requestRequisition(
      state,
      {
        sourceCityId: 'source',
        targetCityId: 'friend',
        requested: { gold: 100, food: 0, troops: 0 },
        requestedByDay: null,
      },
      services({ noRoute: true }),
    );
    expect(noRoute.ok).toBe(false);
    expect(noRoute.reasonCode).toBe('order.route-unavailable');
    expect(noRoute.state).toBe(state);
  });

  it('rejects requisitions outside the player faction', () => {
    const state = fixture();
    const result = requestRequisition(
      state,
      {
        sourceCityId: 'source',
        targetCityId: 'enemy',
        requested: { gold: 100, food: 0, troops: 0 },
        requestedByDay: null,
      },
      services(),
    );
    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe('order.target-not-friendly');
    expect(result.state).toBe(state);
  });

  it('uses the protected garrison floor, campaign provisions, and one active directive per source', () => {
    const state = fixture();
    const api = services();
    const preview = previewCampaignDirective(
      state,
      {
        sourceCityId: 'source',
        targetCityId: 'enemy',
        intent: 'conquer',
        requestedTroops: 2500,
        requestedByDay: null,
      },
      api,
    );
    expect(preview.ready).toBe(false);
    expect(preview.executableTroops).toBeLessThan(2500);
    expect(preview.reasonCodes).toContain('order.minimum-garrison');
    const proposal = requestCampaignDirective(
      state,
      {
        sourceCityId: 'source',
        targetCityId: 'enemy',
        intent: 'conquer',
        requestedTroops: 2500,
        requestedByDay: null,
      },
      api,
    );
    expect(proposal.order?.status).toBe('proposed');
    const reduced = answerCampaignDirective(
      proposal.state,
      proposal.order!.id,
      'reduce',
      api,
      1000,
    );
    expect(reduced.order?.status).toBe('dispatched');
    expect(reduced.state.cities.find((city) => city.id === 'source')?.garrisonTroops).toBe(2000);
    expect(reduced.state.cities.find((city) => city.id === 'source')?.food).toBeLessThan(5000);
    expect(reduced.state.journeys[0]?.manifest.troopCount).toBe(1000);
    const dispatchedOfficer = reduced.state.officers.find((officer) => officer.id === 'infantry-a');
    expect(dispatchedOfficer?.location).toEqual({
      kind: 'journey',
      journeyId: reduced.state.journeys[0]?.id,
    });
    expect(dispatchedOfficer?.troops).toBe(1000);
    const second = requestCampaignDirective(
      reduced.state,
      {
        sourceCityId: 'source',
        targetCityId: 'enemy',
        intent: 'raid',
        requestedTroops: 500,
        requestedByDay: null,
      },
      api,
    );
    expect(second.ok).toBe(false);
    expect(second.reasonCode).toBe('order.active-directive');
  });

  it('rejects a campaign directive aimed at a friendly city', () => {
    const state = fixture();
    const result = requestCampaignDirective(
      state,
      {
        sourceCityId: 'source',
        targetCityId: 'friend',
        intent: 'conquer',
        requestedTroops: 1000,
        requestedByDay: null,
      },
      services(),
    );
    expect(result.ok).toBe(false);
    expect(result.reasonCode).toBe('order.target-is-friendly');
    expect(result.state).toBe(state);
  });
});
