import { describe, expect, it } from 'vitest';
import {
  canAppointGovernor,
  canDirectlyAdminister,
  estimateRequisition,
  getCityCapabilities,
} from '../../../src/v03/governance/authority';
import {
  applyGovernanceMonthBoundary,
  queueGovernorAppointment,
} from '../../../src/v03/governance/appointments';
import type { V03GameState } from '../../../src/v03/types';

function fixture(): V03GameState {
  return {
    version: 3,
    ruleset: 'hegemony-3',
    revision: 0,
    scenarioId: 'test',
    seed: 2,
    playerFactionId: 'player',
    startYear: 190,
    absoluteDay: 15,
    monthIndex: 0,
    rng: 2,
    alliances: [],
    coalitionInvitations: [],
    firedMonthlyEventIds: [],
    lastAllianceBreakMonthByFaction: {},
    hegemon: { factionId: null, months: 0 },
    nextId: 1,
    phase: 'planning',
    playerCapitalCityId: 'capital',
    factions: [],
    cities: [
      {
        id: 'capital',
        name: 'Capital',
        chinese: '都城',
        region: 'Central',
        factionId: 'player',
        population: 10000,
        farming: 100,
        commerce: 100,
        loyalty: 70,
        gold: 2000,
        food: 1500,
        reserve: 0,
        garrisonTroops: 3000,
        governorId: null,
        pendingAppointment: null,
        governanceMode: 'ruler',
      },
      {
        id: 'province',
        name: 'Province',
        chinese: '郡城',
        region: 'North',
        factionId: 'player',
        population: 5000,
        farming: 80,
        commerce: 40,
        loyalty: 60,
        gold: 400,
        food: 300,
        reserve: 0,
        garrisonTroops: 1000,
        governorId: 'officer-a',
        pendingAppointment: null,
        governanceMode: 'governor',
      },
      {
        id: 'enemy',
        name: 'Enemy',
        chinese: '敌城',
        region: 'East',
        factionId: 'enemy',
        population: 5000,
        farming: 80,
        commerce: 40,
        loyalty: 60,
        gold: 400,
        food: 300,
        reserve: 0,
        garrisonTroops: 1000,
        governorId: null,
        pendingAppointment: null,
        governanceMode: 'steward',
      },
    ],
    officers: [
      {
        id: 'officer-a',
        name: 'Governor',
        chinese: '太守甲',
        factionId: 'player',
        location: { kind: 'city', cityId: 'province' },
        force: 70,
        intellect: 80,
        loyalty: 80,
        age: 40,
        troops: 0,
        troopType: 'infantry',
        experience: 0,
        level: 0,
        governorOfCityId: 'province',
        alive: true,
      },
      {
        id: 'officer-b',
        name: 'Away',
        chinese: '外地乙',
        factionId: 'player',
        location: { kind: 'city', cityId: 'capital' },
        force: 60,
        intellect: 60,
        loyalty: 70,
        age: 35,
        troops: 0,
        troopType: 'archer',
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
}

describe('v0.3 authority boundaries', () => {
  it('keeps only the ruler capital directly manageable by the player', () => {
    const state = fixture();
    expect(canDirectlyAdminister(state, 'capital')).toBe(true);
    expect(canDirectlyAdminister(state, 'province')).toBe(false);
    expect(getCityCapabilities(state, 'province').requisitionResources).toBe(true);
    expect(getCityCapabilities(state, 'enemy').requisitionResources).toBe(false);
    expect(getCityCapabilities(state, 'capital').appointGovernor).toBe(false);
    expect(getCityCapabilities(state, 'province').appointGovernor).toBe(true);
    expect(getCityCapabilities(state, 'enemy').appointGovernor).toBe(false);
  });

  it('keeps the capital directly governed and permits a troop-free officer from another friendly city', () => {
    const state = fixture();
    expect(canAppointGovernor(state, 'capital', 'officer-a').ok).toBe(false);
    expect(canAppointGovernor(state, 'province', 'officer-b')).toMatchObject({ ok: true });
    state.officers.find((officer) => officer.id === 'officer-b')!.troops = 1;
    expect(canAppointGovernor(state, 'province', 'officer-b')).toMatchObject({
      ok: false,
      reason: 'An officer commanding troops cannot take office until relieved.',
    });
    expect(canAppointGovernor(state, 'province', 'officer-a')).toMatchObject({ ok: true });
  });

  it('reserves accepted order cargo and protects the minimum city garrison', () => {
    const state = fixture();
    state.requisitions.push({
      id: 'order-1',
      factionId: 'player',
      sourceCityId: 'capital',
      targetCityId: 'province',
      requested: { gold: 100, food: 300, troops: 100 },
      proposed: { gold: 100, food: 300, troops: 100 },
      createdDay: 15,
      requestedByDay: null,
      earliestDepartureDay: 15,
      estimatedArrivalDay: 20,
      status: 'accepted',
      journeyId: null,
      governanceRevision: 0,
      message: 'Ready to dispatch.',
    });
    const estimate = estimateRequisition(
      state,
      'capital',
      'province',
      { gold: 1800, food: 1100, troops: 1950 },
      5,
    );
    expect(estimate.executable).toEqual({ gold: 1800, food: 1100, troops: 1900 });
    expect(estimate.deficit).toEqual({ gold: 0, food: 0, troops: 50 });
    expect(estimate.ready).toBe(false);
    expect(estimate.requiresPlayerChoice).toBe(true);
    expect(state.requisitions).toHaveLength(1);
  });

  it('requires an explicit player choice when the governor cannot fulfill the full request', () => {
    const state = fixture();
    const estimate = estimateRequisition(
      state,
      'capital',
      'province',
      { gold: 2100, food: 1800, troops: 2400 },
      6,
    );
    expect(estimate.requiresPlayerChoice).toBe(true);
    expect(estimate.deficit.gold).toBe(100);
    expect(estimate.deficit.food).toBe(300);
    expect(estimate.deficit.troops).toBe(400);
    expect(estimate.earliestArrivalDay).toBeGreaterThan(state.absoluteDay + 6);
    expect(estimate.reasons).toHaveLength(3);
  });

  it('makes governor changes pending until the next monthly boundary', () => {
    const state = fixture();
    const queued = queueGovernorAppointment(state, 'province', null);
    expect(queued.ok).toBe(true);
    expect(queued.state.cities.find((city) => city.id === 'province')?.governanceMode).toBe(
      'governor',
    );
    expect(
      queued.state.cities.find((city) => city.id === 'province')?.pendingAppointment?.effectiveDay,
    ).toBe(30);
    expect(
      applyGovernanceMonthBoundary(queued.state, 29).cities.find((city) => city.id === 'province')
        ?.governanceMode,
    ).toBe('governor');
    const settled = applyGovernanceMonthBoundary(queued.state, 30);
    expect(settled.cities.find((city) => city.id === 'province')?.governanceMode).toBe('steward');
    expect(settled.cities.find((city) => city.id === 'province')?.pendingAppointment).toBeNull();
    expect(settled.events).toHaveLength(1);
  });
});
