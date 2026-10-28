import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { executeV03Command } from '../../../src/v03/commands';
import { advanceV03 } from '../../../src/v03/engine';
import { availableTroops, createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { estimateCampaignSupply } from '../../../src/v03/calendar';
import { previewOfficerTransfer } from '../../../src/v03/governance/officer-transfer';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import { reviewBattleState } from '../../e2e-v03/playability-fixtures';
import type { V03GameState } from '../../../src/v03/types';

const sourceId = 'chenliu',
  targetId = 'puyang';
const ids = ['xiahoudun', 'yuejin'];
const command = {
  type: 'transferOfficers' as const,
  sourceCityId: sourceId,
  targetCityId: targetId,
  officerIds: ids,
};
const reload = (state: V03GameState) => decodeV03Save(encodeV03Save(state));
function fixture() {
  const state = createV03Game('cao', 42);
  const source = state.cities.find((city) => city.id === sourceId)!;
  source.food = 100_000;
  source.workPointsUsed = 2;
  source.workMonthIndex = 0;
  source.workPeriodIndex = 0;
  for (const [index, id] of ids.entries()) {
    const officer = state.officers.find((entry) => entry.id === id)!;
    source.garrisonTroops -= availableTroops(officer);
    Object.assign(officer, {
      troops: 200 + index * 100,
      wounded: 20 + index * 10,
      troopExperience: 340,
      reorganizationDays: 0,
    });
    source.garrisonTroops += availableTroops(officer);
  }
  state.personnelDay = createPersonnelDay(state);
  state.alliances = state.factions.flatMap((a, index) =>
    state.factions.slice(index + 1).map((b) => ({ a: a.id, b: b.id, expiresMonthIndex: 6 })),
  );
  return state;
}
function advance(state: V03GameState) {
  state.events.forEach((event) => (event.acknowledged = true));
  const result = advanceV03(state, 1);
  expect(result.error).toBeUndefined();
  expect(validateV03State(result.state)).toBe(true);
  return result.state;
}
function arrive(state: V03GameState, journeyId: string) {
  for (let day = 0; day < 100; day++) {
    if (state.journeys.find((journey) => journey.id === journeyId)?.status === 'delivered')
      return state;
    state = advance(state);
  }
  throw new Error('Transfer did not arrive.');
}

describe('ordinary officer transfers', () => {
  it('bounds each party to the saved journey roster limit', () => {
    const state = fixture();
    const result = executeV03Command(state, {
      ...command,
      officerIds: Array.from({ length: 101 }, (_, index) => `officer-${index}`),
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Select up to 100 officers per transfer.');
    expect(result.state).toBe(state);
  });
  it('keeps a valid empty garrison after all ready soldiers leave', () => {
    const state = fixture();
    const source = state.cities.find((city) => city.id === sourceId)!;
    source.garrisonTroops = 500;
    source.garrisonExperience = 250;
    const result = executeV03Command(state, command);
    expect(result.ok, result.error).toBe(true);
    expect(result.state.cities.find((city) => city.id === sourceId)).toMatchObject({
      garrisonTroops: 0,
      garrisonExperience: 0,
    });
    expect(validateV03State(result.state)).toBe(true);
  });
  it('moves exactly the selected whole contingents, debits provisions once and leaves all offices, work and unselected officers intact', () => {
    const state = fixture();
    const before = structuredClone(state);
    const preview = previewOfficerTransfer(state, sourceId, targetId, ids);
    expect(preview.ok).toBe(true);
    if (!preview.ok) throw new Error(preview.reason);
    expect(preview.party.troopCount).toBe(550);
    expect(preview.party.composition).toMatchObject({ cavalryTroops: 220, woundedTroops: 50 });
    expect(preview.food).toBe(
      estimateCampaignSupply({
        troopCount: 550,
        cavalryTroops: 220,
        outboundDays: preview.route.estimatedDays,
        battleDays: 0,
        returnDays: preview.route.estimatedDays,
      }).totalFood,
    );
    const result = executeV03Command(state, command);
    expect(result.ok, result.error).toBe(true);
    expect(state).toEqual(before);
    const journey = result.state.journeys.at(-1)!;
    expect(journey.kind).toBe('transfer');
    expect(journey.manifest.carriedFood).toBe(preview.food);
    expect(result.state.cities.find((city) => city.id === sourceId)).toEqual({
      ...state.cities.find((city) => city.id === sourceId)!,
      food: 100_000 - preview.food,
      garrisonTroops: state.cities.find((city) => city.id === sourceId)!.garrisonTroops - 500,
    });
    expect(result.state.cities.find((city) => city.id === targetId)).toEqual(
      state.cities.find((city) => city.id === targetId),
    );
    expect(result.state.playerCapitalCityId).toBe(state.playerCapitalCityId);
    for (const officer of state.officers)
      expect(result.state.officers.find((entry) => entry.id === officer.id)).toEqual(
        ids.includes(officer.id)
          ? { ...officer, location: { kind: 'journey', journeyId: journey.id } }
          : officer,
      );
    expect(reload(result.state)).toEqual(result.state);
    expect(executeV03Command(result.state, command).ok).toBe(false);
  });

  it('saves and resumes travel, pauses healing and reorganization, then stations the contingent immediately without appointment', () => {
    const state = fixture();
    const officer = state.officers.find((entry) => entry.id === ids[0])!;
    state.cities.find((city) => city.id === sourceId)!.garrisonTroops -= officer.troops;
    officer.reorganizationDays = 7;
    const result = executeV03Command(state, command);
    expect(result.ok, result.error).toBe(true);
    const journey = result.state.journeys.at(-1)!;
    let travelling = advance(reload(result.state));
    expect(travelling.officers.find((entry) => entry.id === officer.id)).toMatchObject({
      troops: 200,
      wounded: 20,
      troopExperience: 340,
      reorganizationDays: 7,
      location: { kind: 'journey', journeyId: journey.id },
    });
    const arrived = arrive(reload(travelling), journey.id);
    expect(arrived.absoluteDay % 30).not.toBe(0);
    expect(arrived.officers.find((entry) => entry.id === officer.id)).toEqual({
      ...officer,
      location: { kind: 'city', cityId: targetId },
    });
    expect(arrived.officers.find((entry) => entry.id === ids[1])).toEqual({
      ...state.officers.find((entry) => entry.id === ids[1])!,
      location: { kind: 'city', cityId: targetId },
    });
    expect(arrived.cities.find((city) => city.id === targetId)).toMatchObject({
      governorId: 'xiahouyuan',
      pendingAppointment: null,
    });
    expect(reload(arrived)).toEqual(arrived);
  });

  it('permits a zero-troop officer and transfers from an autonomous city without work points', () => {
    const state = fixture();
    const officer = state.officers.find((entry) => entry.id === 'caoren')!;
    const source = state.cities.find((city) => city.id === 'xuchang')!;
    officer.governorOfCityId = null;
    source.governorId = null;
    source.governanceMode = 'steward';
    source.garrisonTroops -= availableTroops(officer);
    Object.assign(officer, { troops: 0, wounded: 0, troopExperience: 0 });
    const result = executeV03Command(state, {
      ...command,
      sourceCityId: source.id,
      targetCityId: sourceId,
      officerIds: [officer.id],
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.state.journeys.at(-1)!.manifest).toMatchObject({
      troopCount: 0,
      carriedFood: 0,
      composition: { soloOfficer: true },
    });
    expect(validateV03State(result.state)).toBe(true);
  });

  it.each([
    'empty',
    'duplicate',
    'sparse',
    'missing',
    'foreign',
    'away',
    'dead',
    'ruler',
    'governor',
    'pending',
    'reserved',
    'same-city',
    'enemy-target',
    'enemy-source',
    'no-food',
    'reserved-food',
    'reserved-troops',
    'no-route',
  ])('rejects %s atomically', (kind) => {
    const state = fixture();
    const draft = { ...command, officerIds: [...ids] };
    const source = state.cities.find((city) => city.id === sourceId)!;
    if (kind === 'empty') draft.officerIds = [];
    if (kind === 'duplicate') draft.officerIds = [ids[0]!, ids[0]!];
    if (kind === 'sparse') draft.officerIds = new Array<string>(1);
    if (kind === 'missing') draft.officerIds[1] = 'missing';
    if (kind === 'foreign') draft.officerIds[1] = 'yuanshao';
    if (kind === 'away' || kind === 'governor') draft.officerIds[1] = 'xiahouyuan';
    if (kind === 'governor') {
      draft.sourceCityId = targetId;
      draft.targetCityId = sourceId;
      draft.officerIds = ['xiahouyuan'];
    }
    if (kind === 'dead') state.officers.find((officer) => officer.id === ids[1])!.alive = false;
    if (kind === 'ruler') draft.officerIds[1] = 'caocao';
    if (kind === 'pending')
      state.cities.find((city) => city.id === targetId)!.pendingAppointment = {
        governorId: ids[1]!,
        effectiveDay: 30,
      };
    if (kind === 'same-city') draft.targetCityId = sourceId;
    if (kind === 'enemy-target') draft.targetCityId = 'ye';
    if (kind === 'enemy-source') draft.sourceCityId = 'ye';
    if (kind === 'no-food') source.food = 0;
    if (kind === 'reserved' || kind === 'reserved-troops')
      state.directives.push({
        id: 'reserved-command',
        factionId: 'cao',
        sourceCityId: sourceId,
        targetCityId: 'xiapi',
        intent: 'conquer',
        requestedTroops: source.garrisonTroops,
        proposedTroops: kind === 'reserved' ? 1 : source.garrisonTroops,
        officerIds: kind === 'reserved' ? [ids[1]!] : undefined,
        requestedByDay: null,
        earliestDepartureDay: 0,
        estimatedArrivalDay: 20,
        status: 'reserved',
        journeyId: null,
        governanceRevision: 0,
        message: '',
      });
    if (kind === 'reserved-food')
      state.requisitions.push({
        id: 'reserved-food',
        factionId: 'cao',
        sourceCityId: sourceId,
        targetCityId: targetId,
        requested: { gold: 0, food: source.food, troops: 0 },
        proposed: { gold: 0, food: source.food, troops: 0 },
        createdDay: 0,
        requestedByDay: null,
        earliestDepartureDay: 0,
        estimatedArrivalDay: 20,
        status: 'reserved',
        journeyId: null,
        governanceRevision: 0,
        message: '',
      });
    if (kind === 'no-route') {
      state.cities.find((city) => city.id === 'chengdu')!.factionId = 'cao';
      draft.targetCityId = 'chengdu';
    }
    const before = structuredClone(state);
    const result = executeV03Command(state, draft);
    expect(result.ok, kind).toBe(false);
    expect(result.state).toBe(state);
    expect(state).toEqual(before);
  });

  it('blocks departure when the source or destination is fighting', () => {
    for (const source of [true, false]) {
      const state = reviewBattleState();
      const journey = state.journeys.find(
        (entry) => entry.id === state.battles.find((battle) => battle.active)!.attackerJourneyId,
      )!;
      state.cities.find((city) => city.id === journey.destinationCityId)!.factionId = 'cao';
      const result = executeV03Command(state, {
        ...command,
        sourceCityId: source ? journey.destinationCityId : sourceId,
        targetCityId: source ? sourceId : journey.destinationCityId,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('This city is committed to an active battle.');
    }
  });

  it('redirects to friendly refuge if the destination is lost, preserving the party through reload', () => {
    const initial = executeV03Command(fixture(), command).state;
    const journeyId = initial.journeys.at(-1)!.id;
    initial.cities.find((city) => city.id === targetId)!.factionId = 'yuan';
    // Model a valid ownership change without assigning a foreign governor to the city.
    initial.cities.find((city) => city.id === targetId)!.governorId = null;
    initial.cities.find((city) => city.id === targetId)!.governanceMode = 'steward';
    initial.officers.find((officer) => officer.id === 'xiahouyuan')!.governorOfCityId = null;
    let state = initial;
    for (let day = 0; day < 100; day++) {
      state = advance(state);
      if (
        ids.every(
          (id) => state.officers.find((officer) => officer.id === id)!.location.kind === 'city',
        )
      )
        break;
    }
    expect(state.journeys.find((journey) => journey.id === journeyId)?.status).toBe('cancelled');
    expect(
      state.journeys.some(
        (journey) =>
          journey.kind === 'return' &&
          journey.destinationCityId === sourceId &&
          journey.manifest.officerIds.join(',') === ids.join(','),
      ),
    ).toBe(true);
    for (const id of ids)
      expect(state.officers.find((officer) => officer.id === id)!.location).toEqual({
        kind: 'city',
        cityId: sourceId,
      });
    expect(reload(state)).toEqual(state);
  });
});
