import { createV03Game } from '../../../src/v03/initial-state';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { describe, expect, it } from 'vitest';
import {
  decodeV03Save,
  encodeV03Save,
  loadV03Autosave,
  saveV03Autosave,
  V03_AUTOSAVE_KEY,
  V03_MAX_SAVE_BYTES,
} from '../../../src/v03/platform/storage';
import type { V03GameState } from '../../../src/v03/types';

function sampleState(): V03GameState {
  const state = createV03Game('cao', 19);
  Object.assign(state, {
    revision: 5,
    absoluteDay: 30,
    monthIndex: 1,
    rng: 99,
    nextId: 7,
    playerCapitalCityId: 'xuchang',
  });
  const cao = state.officers.find((officer) => officer.id === 'caocao')!;
  const yuan = state.officers.find((officer) => officer.id === 'yuanshao')!;
  cao.location = { kind: 'city', cityId: 'xuchang' };
  cao.troops = 0;
  yuan.troops = 0;
  state.officers = [
    cao,
    yuan,
    ...state.officers.filter((officer) => officer.id !== cao.id && officer.id !== yuan.id),
  ];
  const caoFaction = state.factions.find((faction) => faction.id === 'cao')!;
  const yuanFaction = state.factions.find((faction) => faction.id === 'yuan')!;
  caoFaction.capitalCityId = 'xuchang';
  state.factions = [
    caoFaction,
    yuanFaction,
    ...state.factions.filter((faction) => faction.id !== 'cao' && faction.id !== 'yuan'),
  ];
  const xuchang = state.cities.find((city) => city.id === 'xuchang')!;
  const ye = state.cities.find((city) => city.id === 'ye')!;
  Object.assign(xuchang, {
    population: 5000,
    farming: 60,
    commerce: 60,
    loyalty: 70,
    gold: 500,
    food: 700,
    reserve: 0,
    reservePools: createReservePools(0),
    garrisonTroops: 1000,
    governanceMode: 'ruler',
    governorId: null,
  });
  Object.assign(ye, {
    population: 6000,
    farming: 70,
    commerce: 60,
    loyalty: 70,
    gold: 600,
    food: 800,
    reserve: 0,
    reservePools: createReservePools(0),
    garrisonTroops: 1200,
  });
  state.cities.find((city) => city.id === 'chenliu')!.governanceMode = 'steward';
  state.officers.find((officer) => officer.id === 'caoren')!.governorOfCityId = null;
  state.cities = [
    xuchang,
    ye,
    ...state.cities.filter((city) => city.id !== 'xuchang' && city.id !== 'ye'),
  ];
  state.personnelDay = createPersonnelDay(state);
  return state;
}

function sampleJourney(): V03GameState['journeys'][number] {
  return {
    id: 'journey-1',
    kind: 'requisition',
    executionId: 'requisition-1',
    ownerFactionId: 'cao',
    sourceCityId: 'xuchang',
    destinationCityId: 'ye',
    routeId: 'xuchang--ye',
    routeVersion: 'v0.3-test',
    routeCityIds: ['xuchang', 'ye'],
    routeSnapshot: [
      {
        terrain: 'plain',
        lengthKm: 100,
        baseSpeedKmPerDay: 20,
        speedMultiplier: 1,
        fixedDelayDays: 0,
      },
    ],
    roadKmNominal: 100,
    departedAbsoluteDay: 30,
    expectedArrivalDay: 35,
    elapsedDays: 0,
    segmentProgressKm: [0],
    segmentWaitDays: [0],
    manifest: {
      officerIds: [],
      troopCount: 0,
      composition: { troopTypes: [] },
      carriedFood: 0,
      cargo: { gold: 10, food: 0, troops: 0 },
    },
    status: 'outbound',
    deliveredCargo: {},
    consumedFood: 0,
    supplyRemainderMicro: 0,
    accumulatedFoodShortfall: 0,
  };
}

describe('v0.3 save format and namespace', () => {
  it('round-trips a new campaign without changing its day or ruleset', () => {
    const original = sampleState();
    const restored = decodeV03Save(encodeV03Save(original));
    expect(restored).toEqual(original);
    expect(restored.absoluteDay).toBe(30);
    expect(restored.ruleset).toBe('hegemony-3');
  });

  it('round-trips fine arms and still accepts earlier v3 officers without equipment', () => {
    const state = sampleState();
    const originalOfficer = state.officers[0]!;
    originalOfficer.equipment = 'Fine arms';
    const restored = decodeV03Save(encodeV03Save(state));
    expect(restored.officers[0]?.equipment).toBe('Fine arms');

    delete restored.officers[1]!.equipment;
    expect(() => encodeV03Save(restored)).not.toThrow();
  });

  it('rejects a v0.2 save without trying a migration', () => {
    expect(() =>
      decodeV03Save({ format: 'baye.save', version: 2, ruleset: 'baye-atlas-2' }),
    ).toThrow('This save belongs to an older version.');
  });

  it.each([1, 2])('recognizes the actual Baye v%s envelope markers', (version) => {
    expect(() =>
      decodeV03Save({
        format: 'baye.save',
        formatVersion: version,
        scenario: 'divided-realm-190',
        state: { version, ruleset: `baye-atlas-${version}` },
      }),
    ).toThrow('older version');
  });

  it.each([
    {},
    { version: 2 },
    { format: 'hegemony.save', version: '4', ruleset: 'hegemony-4' },
    null,
  ])('classifies malformed imports as invalid rather than older saves: %j', (payload) => {
    expect(() => decodeV03Save(payload)).toThrow('not a valid hegemony.save');
  });

  it('distinguishes an unsupported future save and leaves the stored payload intact', () => {
    const payload = JSON.stringify({ format: 'hegemony.save', version: 4, ruleset: 'hegemony-4' });
    const storage = { getItem: () => payload };
    expect(() => loadV03Autosave(storage)).toThrow('unsupported newer version');
    expect(storage.getItem()).toBe(payload);
    expect(() =>
      decodeV03Save({ format: 'hegemony.save', version: 1, ruleset: 'hegemony-1' }),
    ).toThrow('older version');
  });

  it('rejects internally inconsistent references before returning state', () => {
    const state = sampleState();
    state.playerCapitalCityId = 'missing-city';
    expect(() => encodeV03Save(state)).toThrow('state is not valid');
  });

  it('rejects a pending governor appointment for an unknown officer', () => {
    const state = sampleState();
    state.cities[0]!.pendingAppointment = { governorId: 'missing-officer', effectiveDay: 60 };
    expect(() => encodeV03Save(state)).toThrow('state is not valid');
  });

  it('keeps pending and acknowledged reports in their original timeline order', () => {
    const state = sampleState();
    state.events = [
      {
        id: 'month-30',
        absoluteDay: 30,
        kind: 'monthBoundary',
        title: 'Month 1',
        detail: 'First report.',
        entityId: null,
        acknowledged: true,
      },
      {
        id: 'month-60',
        absoluteDay: 60,
        kind: 'monthBoundary',
        title: 'Month 2',
        detail: 'Second report.',
        entityId: null,
        acknowledged: false,
      },
      {
        id: 'month-90',
        absoluteDay: 90,
        kind: 'monthBoundary',
        title: 'Month 3',
        detail: 'Third report.',
        entityId: null,
        acknowledged: true,
      },
    ];

    const restored = decodeV03Save(encodeV03Save(state));
    expect(restored.events.map((event) => event.id)).toEqual(['month-30', 'month-60', 'month-90']);
  });

  it('rejects journeys whose waypoint count, endpoint, or progress exceeds the route snapshot', () => {
    const state = sampleState();
    state.journeys = [sampleJourney()];
    state.journeys[0]!.segmentProgressKm[0] = 101;
    expect(() => encodeV03Save(state)).toThrow('state is not valid');

    state.journeys[0]!.segmentProgressKm[0] = 0;
    state.journeys[0]!.routeCityIds = ['xuchang', 'ye', 'xuchang'];
    expect(() => encodeV03Save(state)).toThrow('state is not valid');
  });

  it('rejects duplicate officer membership in a journey manifest', () => {
    const state = sampleState();
    const journey = sampleJourney();
    journey.status = 'delivered';
    journey.manifest.officerIds = ['caocao', 'caocao'];
    state.journeys = [journey];

    expect(() => encodeV03Save(state)).toThrow('state is not valid');
  });

  it('requires active journey manifests to match officer locations and their source order', () => {
    const state = sampleState();
    const journey = sampleJourney();
    state.journeys = [journey];
    state.requisitions = [
      {
        id: journey.executionId,
        factionId: 'cao',
        sourceCityId: journey.sourceCityId,
        targetCityId: journey.destinationCityId,
        requested: { gold: 10, food: 0, troops: 0 },
        proposed: { gold: 10, food: 0, troops: 0 },
        createdDay: 30,
        requestedByDay: null,
        earliestDepartureDay: 30,
        estimatedArrivalDay: 35,
        status: 'dispatched',
        journeyId: journey.id,
        governanceRevision: 0,
        message: '',
      },
    ];
    expect(() => encodeV03Save(state)).not.toThrow();

    journey.manifest.officerIds = ['caocao'];
    expect(() => encodeV03Save(state)).toThrow('state is not valid');

    journey.manifest.officerIds = [];
    journey.executionId = 'missing-order';
    expect(() => encodeV03Save(state)).toThrow('state is not valid');
  });

  it('requires a pending remote appointment to reference its matching appointment journey', () => {
    const state = sampleState();
    const journey = sampleJourney();
    journey.status = 'delivered';
    journey.manifest.officerIds = ['caocao'];
    state.journeys = [journey];
    state.cities.find((entry) => entry.id === 'ye')!.pendingAppointment = {
      governorId: 'caocao',
      effectiveDay: 60,
      journeyId: journey.id,
    };

    expect(() => encodeV03Save(state)).toThrow('state is not valid');
  });

  it('checks order, officer, battle, event, and day-resolution references across entities', () => {
    const orderState = sampleState();
    const journey = sampleJourney();
    orderState.journeys = [journey];
    orderState.requisitions = [
      {
        id: 'requisition-1',
        factionId: 'cao',
        sourceCityId: 'xuchang',
        targetCityId: 'xuchang',
        requested: { gold: 0, food: 0, troops: 0 },
        proposed: { gold: 0, food: 0, troops: 0 },
        createdDay: 30,
        requestedByDay: null,
        earliestDepartureDay: 30,
        estimatedArrivalDay: 35,
        status: 'dispatched',
        journeyId: journey.id,
        governanceRevision: 0,
        message: '',
      },
    ];
    expect(() => encodeV03Save(orderState)).toThrow('state is not valid');

    const duplicatePlayer = sampleState();
    duplicatePlayer.factions[1]!.isPlayer = true;
    expect(() => encodeV03Save(duplicatePlayer)).toThrow('state is not valid');

    const danglingEvent = sampleState();
    danglingEvent.events.push({
      id: 'event-1',
      absoluteDay: 30,
      kind: 'battleReady',
      title: 'Battle',
      detail: 'Missing battle',
      entityId: 'missing-battle',
      acknowledged: false,
    });
    expect(() => encodeV03Save(danglingEvent)).toThrow('state is not valid');

    const impossibleBattlePhase = sampleState();
    impossibleBattlePhase.dayResolution = {
      processingAbsoluteDay: impossibleBattlePhase.absoluteDay,
      phase: 'battles',
      battleIds: [],
      completedBattleIds: [],
      daybreakJourneySignatures: {},
      arrivals: [],
    };
    expect(() => encodeV03Save(impossibleBattlePhase)).toThrow('state is not valid');
  });

  it('limits imported bytes before parsing and bounds old history in save snapshots', () => {
    const values = new Map<string, string>([[V03_AUTOSAVE_KEY, 'previous-good-save']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const tooLarge = ' '.repeat(V03_MAX_SAVE_BYTES + 1);
    expect(() => decodeV03Save(tooLarge)).toThrow('exceeds the v0.3 save limit');
    expect(() => decodeV03Save({ format: 'hegemony.save', data: tooLarge })).toThrow(
      'exceeds the v0.3 save limit',
    );

    const longCampaign = sampleState();
    longCampaign.log = Array.from({ length: 1_600 }, (_, index) => `report ${index}`);
    longCampaign.events = Array.from({ length: 1_601 }, (_, index) => ({
      id: `month-${index}`,
      absoluteDay: index,
      kind: 'monthBoundary' as const,
      title: 'Monthly settlement complete',
      detail: `Month ${index} settled.`,
      entityId: null,
      acknowledged: true,
    }));
    saveV03Autosave(longCampaign, storage);
    expect(longCampaign.log).toHaveLength(1_600);
    expect(longCampaign.events).toHaveLength(1_601);
    const restored = loadV03Autosave(storage)!;
    expect(restored.log).toHaveLength(1_000);
    expect(restored.events).toHaveLength(1_500);
    expect(restored.events.at(-1)?.id).toBe('month-1600');
  });

  it('keeps the previous autosave intact when storage rejects a write', () => {
    let stored = 'previous-good-save';
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, _value: string) => {
        throw new Error('Quota exceeded');
      },
    };
    expect(() => saveV03Autosave(sampleState(), storage)).toThrow('Quota exceeded');
    expect(stored).toBe('previous-good-save');
  });

  it('uses only the v0.3 autosave key and leaves a rejected old record untouched', () => {
    const oldRecord = JSON.stringify({ format: 'baye.save', version: 2, ruleset: 'baye-atlas-2' });
    const values = new Map<string, string>([[V03_AUTOSAVE_KEY, oldRecord]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(() => loadV03Autosave(storage)).toThrow('older version');
    expect(values.get(V03_AUTOSAVE_KEY)).toBe(oldRecord);
    saveV03Autosave(sampleState(), storage);
    expect(values.get(V03_AUTOSAVE_KEY)).toContain('hegemony-3');
  });
});
