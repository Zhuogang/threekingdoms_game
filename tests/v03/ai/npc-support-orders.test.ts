import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { advanceV03 } from '../../../src/v03/engine';
import { supportFactionObjectives } from '../../../src/v03/ai/faction-objectives';
import { executeV03Command } from '../../../src/v03/commands';
import { createV03OrderServices } from '../../../src/v03/governance/services';
import {
  previewNpcRequisition,
  requestNpcRequisition,
  previewRequisition,
  answerRequisition,
} from '../../../src/v03/governance/orders';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';

const services = createV03OrderServices();
function fixture() {
  const state = createV03Game('cao', 37, 'guandu-200');
  const source = state.cities.find((c) => c.id === 'jianye')!,
    target = state.cities.find((c) => c.id === 'wu')!;
  Object.assign(source, { food: 10_000, gold: 10_000 });
  target.food = 100;
  const input = {
    sourceCityId: source.id,
    targetCityId: target.id,
    requested: { food: 500, gold: 50, troops: 0 },
    requestedByDay: null,
  };
  return { state, source, target, input };
}

describe('V04-08 NPC support authority and accounting', () => {
  it.each(['officer', 'cargo'] as const)(
    'rejects a journey factory that injects foreign %s data',
    (forged) => {
      const { state, input } = fixture();
      const before = structuredClone(state);
      const injected = {
        ...services,
        createJourney: (args: Parameters<typeof services.createJourney>[0]) => {
          const journey = services.createJourney(args);
          if (forged === 'officer') journey.manifest.officerIds = ['caocao'];
          else
            journey.manifest.cargo = {
              ...journey.manifest.cargo,
              food: (journey.manifest.cargo.food ?? 0) + 1,
            };
          return journey;
        },
      };
      expect(requestNpcRequisition(state, 'sun', input, injected).ok).toBe(false);
      expect(state).toEqual(before);
    },
  );

  it('moves the exact healthy NPC contingent and provisions while leaving wounded in the source', () => {
    const { state, source, input } = fixture();
    const locals = state.officers.filter(
      (o) =>
        o.alive &&
        o.factionId === 'sun' &&
        o.location.kind === 'city' &&
        o.location.cityId === source.id,
    );
    const commander = locals[0]!;
    for (const officer of locals)
      Object.assign(officer, {
        troops: officer === commander ? 1000 : 0,
        wounded: officer === commander ? 100 : 0,
        reorganizationDays: 0,
        troopExperience: 0,
      });
    source.garrisonTroops = 5000;
    input.requested.troops = 1000;
    state.personnelDay = createPersonnelDay(state);
    const before = structuredClone(state);
    const preview = previewNpcRequisition(state, 'sun', input, services);
    expect(preview.ready).toBe(true);
    expect(preview.party!.officerIds).toEqual([commander.id]);
    const result = requestNpcRequisition(state, 'sun', input, services);
    expect(result.ok).toBe(true);
    expect(state).toEqual(before);
    const journey = result.state.journeys.find((j) => j.id === result.order!.journeyId)!;
    expect(journey.manifest).toMatchObject({
      officerIds: [commander.id],
      troopCount: 1000,
      carriedFood: preview.travelFood,
    });
    expect(result.state.cities.find((c) => c.id === source.id)).toMatchObject({
      garrisonTroops: 4000,
      food: source.food - 500 - preview.travelFood,
    });
    expect(result.state.officers.find((o) => o.id === commander.id)).toMatchObject({
      troops: 1000,
      wounded: 0,
      location: { kind: 'journey', journeyId: journey.id },
    });
    expect(
      result.state.troopSources.find((pool) => pool.sourceOfficerId === commander.id),
    ).toMatchObject({ troops: 0, wounded: 100, cityId: source.id });
    expect(validateV03State(result.state)).toBe(true);
  });

  it('previews a real NPC shipment without changing the player identity, resources, RNG or IDs', () => {
    const { state, input } = fixture();
    const before = structuredClone(state);
    const preview = previewNpcRequisition(state, 'sun', input, services);
    expect(preview.ready).toBe(true);
    expect(preview.executable).toEqual(input.requested);
    expect(preview.party!.officerIds).toEqual([]);
    expect(state).toEqual(before);
    expect(previewRequisition(state, input, services).ready).toBe(false);
  });

  it('dispatches and delivers once through an actual journey, with deterministic reload', () => {
    const { state, source, target, input } = fixture();
    const before = structuredClone(state);
    const dispatched = requestNpcRequisition(state, 'sun', input, services);
    expect(dispatched.ok).toBe(true);
    expect(dispatched.order).toMatchObject({ factionId: 'sun', status: 'dispatched' });
    expect(state).toEqual(before);
    let next = dispatched.state;
    expect(next.playerFactionId).toBe('cao');
    expect(next.cities.find((c) => c.id === source.id)!.food).toBe(source.food - 500);
    expect(next.cities.find((c) => c.id === source.id)!.gold).toBe(source.gold - 50);
    expect(next.cities.find((c) => c.id === target.id)!.food).toBe(100);
    expect(next.rng).toBe(state.rng);
    expect(validateV03State(next)).toBe(true);
    const journey = next.journeys.find((j) => j.id === dispatched.order!.journeyId)!;
    journey.routeSnapshot = journey.routeSnapshot.map((segment) => ({
      ...segment,
      lengthKm: 1,
      fixedDelayDays: 0,
    }));
    journey.segmentProgressKm = journey.routeSnapshot.map(() => 0);
    journey.segmentWaitDays = journey.routeSnapshot.map(() => 0);
    journey.expectedArrivalDay = 1;
    next.events.forEach((event) => (event.acknowledged = true));
    const loaded = decodeV03Save(encodeV03Save(next));
    const arrived = advanceV03(next, 1).state;
    expect(advanceV03(loaded, 1).state).toEqual(arrived);
    expect(arrived.cities.find((c) => c.id === target.id)!.food).toBe(600);
    expect(arrived.journeys.find((j) => j.id === journey.id)!.status).toBe('delivered');
    const again = advanceV03(decodeV03Save(encodeV03Save(arrived)), 1).state;
    expect(again.cities.find((c) => c.id === target.id)!.food).toBe(600);
  });

  it.each(['cao', 'yuan', 'missing'])(
    'rejects actor %s at both preview and commit without mutation',
    (actor) => {
      const { state, input } = fixture();
      const before = structuredClone(state);
      expect(previewNpcRequisition(state, actor, input, services).ready).toBe(false);
      expect(requestNpcRequisition(state, actor, input, services).ok).toBe(false);
      expect(state).toEqual(before);
    },
  );

  it('returns NPC support cargo through the existing refuge journey after the receiver falls', () => {
    const { state, source, target, input } = fixture();
    const sent = requestNpcRequisition(state, 'sun', input, services);
    const next = sent.state;
    const lost = next.cities.find((city) => city.id === target.id)!;
    if (lost.governorId)
      next.officers.find((officer) => officer.id === lost.governorId)!.governorOfCityId = null;
    Object.assign(lost, { factionId: 'cao', governorId: null, governanceMode: 'steward' });
    const oneDay = (journey: (typeof next.journeys)[number]) => {
      journey.routeSnapshot = journey.routeSnapshot.map((segment) => ({
        ...segment,
        lengthKm: 1,
        fixedDelayDays: 0,
      }));
      journey.segmentProgressKm = journey.routeSnapshot.map(() => 0);
      journey.segmentWaitDays = journey.routeSnapshot.map(() => 0);
      journey.expectedArrivalDay = next.absoluteDay + 1;
    };
    const outbound = next.journeys.find((journey) => journey.id === sent.order!.journeyId)!;
    oneDay(outbound);
    next.events.forEach((event) => (event.acknowledged = true));
    const loaded = decodeV03Save(encodeV03Save(next));
    const redirected = advanceV03(next, 1).state;
    expect(advanceV03(loaded, 1).state).toEqual(redirected);
    expect(redirected.requisitions.find((order) => order.id === sent.order!.id)!.status).toBe(
      'failed',
    );
    const returning = redirected.journeys.find((journey) => journey.kind === 'return')!;
    expect(returning).toMatchObject({
      destinationCityId: source.id,
      manifest: { cargo: { food: 500, gold: 50 } },
    });
    expect(redirected.cities.find((city) => city.id === target.id)!.food).toBe(target.food);
    // Even after the dispatch cooldown, the failed order's real return party
    // still occupies the faction's one support operation.
    const held = structuredClone(redirected);
    held.absoluteDay = 31;
    held.monthIndex = 1;
    held.personnelDay = createPersonnelDay(held);
    Object.assign(
      held.cities.find((city) => city.id === 'shouchun')!,
      {
        food: 100_000,
        gold: 10_000,
      },
    );
    held.factionObjectives = [
      {
        factionId: 'sun',
        mode: 'recover',
        sourceCityId: source.id,
        targetCityId: null,
        commanderOfficerId: null,
        startedDay: 31,
        reviewDay: 61,
        forceTarget: 0,
        forceDeficit: 0,
        foodTarget: 20_000,
        foodDeficit: 10_500,
        reason: 'food-shortfall',
        cancellationReason: null,
        orderIds: [sent.order!.id],
      },
    ];
    const before = structuredClone(held);
    supportFactionObjectives(held);
    expect(held).toEqual(before);
    const noActiveReturn = structuredClone(held);
    noActiveReturn.journeys.find((journey) => journey.id === returning.id)!.status = 'delivered';
    supportFactionObjectives(noActiveReturn);
    expect(noActiveReturn.requisitions).toHaveLength(held.requisitions.length + 1);
    oneDay(returning);
    redirected.events.forEach((event) => (event.acknowledged = true));
    const arrived = advanceV03(decodeV03Save(encodeV03Save(redirected)), 1).state;
    expect(arrived.cities.find((city) => city.id === source.id)).toMatchObject({
      food: source.food,
      gold: source.gold,
    });
    expect(arrived.journeys.find((journey) => journey.id === returning.id)!.status).toBe(
      'delivered',
    );
    expect(validateV03State(arrived)).toBe(true);
  });

  it.each(['source', 'destination', 'eliminated'] as const)(
    'revalidates changed %s authority at commit',
    (change) => {
      const { state, input, source, target } = fixture();
      expect(previewNpcRequisition(state, 'sun', input, services).ready).toBe(true);
      if (change === 'source') source.factionId = 'yuan';
      else if (change === 'destination') target.factionId = 'yuan';
      else state.factions.find((f) => f.id === 'sun')!.eliminated = true;
      const before = structuredClone(state);
      expect(requestNpcRequisition(state, 'sun', input, services).ok).toBe(false);
      expect(state).toEqual(before);
    },
  );

  it('leaves a shortage advisory: an unready NPC request allocates no order or reservation', () => {
    const { state, input, source } = fixture();
    source.food = 0;
    const before = structuredClone(state);
    expect(requestNpcRequisition(state, 'sun', input, services).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('rejects actor overrides in public commands and access to NPC order answers', () => {
    const { state, input } = fixture();
    const forged = {
      type: 'requestRequisition',
      ...input,
      factionId: 'sun',
      actorFactionId: 'sun',
    };
    expect(executeV03Command(state, forged as never).ok).toBe(false);
    const dispatched = requestNpcRequisition(state, 'sun', input, services);
    const result = answerRequisition(dispatched.state, dispatched.order!.id, 'cancel', services);
    expect(result.ok).toBe(false);
    expect(result.order).toBeUndefined();
    expect(result.state).toBe(dispatched.state);
  });

  it('validates actual owned and ready officers even if a party service proposes a foreign one', () => {
    const { state, input, source } = fixture();
    source.garrisonTroops = 5000;
    input.requested.troops = 1000;
    const foreign = state.officers.find((o) => o.id === 'caocao')!;
    Object.assign(foreign, { troops: 1000, location: { kind: 'city', cityId: source.id } });
    state.personnelDay = createPersonnelDay(state);
    const forgedServices = {
      ...services,
      planParty: () => ({
        officerIds: [foreign.id],
        troopCount: 1000,
        composition: { troopTypes: [foreign.troopType], cavalryTroops: 1000 },
      }),
    };
    const before = structuredClone(state);
    expect(previewNpcRequisition(state, 'sun', input, forgedServices).ready).toBe(false);
    expect(requestNpcRequisition(state, 'sun', input, forgedServices).ok).toBe(false);
    expect(state).toEqual(before);
  });
});
