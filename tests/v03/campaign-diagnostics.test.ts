import { describe, expect, it } from 'vitest';
import { aggregateResults, summarize } from '../../tools/v03-campaign-diagnostics-helpers.mjs';

describe('v0.3 campaign diagnostic outcome reporting', () => {
  it('reports a Hegemon claim and victory separately from true city unification', () => {
    const state = {
      absoluteDay: 3_600,
      phase: 'finished',
      winnerFactionId: 'cao',
      hegemon: { factionId: 'cao', months: 12 },
      factions: [{ id: 'cao', eliminated: false }],
      cities: Array.from({ length: 24 }, (_, index) => ({
        id: index === 0 ? 'luoyang' : `city-${index}`,
        factionId: index < 16 ? 'cao' : 'liu',
        gold: 1_000,
        food: 2_000,
      })),
      battles: [],
      directives: [],
      journeys: [],
      requisitions: [],
    };

    expect(summarize(state, 'cao', 120)).toMatchObject({
      trueUnification: false,
      hegemon: {
        claimantFactionId: 'cao',
        consecutiveMonths: 12,
        victoryDeclared: true,
      },
      stateWinnerFactionId: 'cao',
    });
  });

  it('reports faction-wide ownership and resolves each rival campaign dispatch', () => {
    const state = {
      playerFactionId: 'player',
      absoluteDay: 60,
      monthIndex: 2,
      phase: 'planning',
      winnerFactionId: null,
      hegemon: { factionId: null, months: 0 },
      factions: [
        { id: 'player', isPlayer: true, eliminated: false, capitalCityId: 'p-city' },
        { id: 'cao', isPlayer: false, eliminated: false, capitalCityId: 'cao-city' },
        { id: 'liu', isPlayer: false, eliminated: false, capitalCityId: 'liu-city' },
        { id: 'gone', isPlayer: false, eliminated: true, capitalCityId: 'lost-city' },
      ],
      cities: [
        { id: 'p-city', factionId: 'player', gold: 0, food: 0 },
        { id: 'cao-city', factionId: 'cao', gold: 0, food: 0 },
        { id: 'liu-city', factionId: 'liu', gold: 0, food: 0 },
        { id: 'neutral-city', factionId: null, gold: 0, food: 0 },
      ],
      officers: [],
      battles: [
        {
          id: 'battle-capture',
          active: false,
          attackerJourneyId: 'journey-capture',
          resolved: true,
          outcome: 'attacker',
          battleData: { outcome: { reason: 'elimination' } },
        },
        {
          id: 'battle-repulse',
          active: false,
          attackerJourneyId: 'journey-repulse',
          resolved: true,
          outcome: 'defender',
          battleData: { outcome: { reason: 'elimination' } },
        },
        {
          id: 'battle-active',
          active: true,
          attackerJourneyId: 'journey-unknown',
          resolved: false,
          outcome: null,
          battleData: { outcome: null },
        },
        {
          id: 'battle-draw',
          active: false,
          attackerJourneyId: 'journey-draw',
          resolved: true,
          outcome: 'draw',
          battleData: { outcome: { reason: 'dayLimit' } },
        },
      ],
      directives: [
        {
          id: 'directive-capture',
          factionId: 'cao',
          sourceCityId: 'cao-city',
          targetCityId: 'neutral-city',
          proposedTroops: 900,
          status: 'delivered',
          journeyId: 'journey-capture',
        },
        {
          id: 'directive-repulse',
          factionId: 'liu',
          sourceCityId: 'liu-city',
          targetCityId: 'cao-city',
          proposedTroops: 800,
          status: 'delivered',
          journeyId: 'journey-repulse',
        },
        {
          id: 'directive-unknown',
          factionId: 'liu',
          sourceCityId: 'liu-city',
          targetCityId: 'neutral-city',
          proposedTroops: 700,
          status: 'dispatched',
          journeyId: 'journey-unknown',
        },
        {
          id: 'directive-draw',
          factionId: 'cao',
          sourceCityId: 'cao-city',
          targetCityId: 'liu-city',
          proposedTroops: 650,
          status: 'delivered',
          journeyId: 'journey-draw',
        },
        {
          id: 'directive-player',
          factionId: 'player',
          sourceCityId: 'p-city',
          targetCityId: 'cao-city',
          proposedTroops: 600,
          status: 'dispatched',
          journeyId: 'journey-player',
        },
      ],
      journeys: [
        {
          id: 'journey-capture',
          executionId: 'directive-capture',
          ownerFactionId: 'cao',
          kind: 'campaign',
          status: 'cancelled',
        },
        {
          id: 'journey-repulse',
          executionId: 'directive-repulse',
          ownerFactionId: 'liu',
          kind: 'campaign',
          status: 'cancelled',
        },
        {
          id: 'journey-unknown',
          executionId: 'directive-unknown',
          ownerFactionId: 'liu',
          kind: 'campaign',
          status: 'outbound',
        },
        {
          id: 'journey-draw',
          executionId: 'directive-draw',
          ownerFactionId: 'cao',
          kind: 'campaign',
          status: 'cancelled',
        },
        {
          id: 'journey-player',
          executionId: 'directive-player',
          ownerFactionId: 'player',
          kind: 'campaign',
          status: 'outbound',
        },
      ],
      requisitions: [],
    };

    const result = summarize(state, 'player', 2, []);
    expect(result.factionOwnership).toMatchObject({
      totalCities: 4,
      independentCities: 1,
      factions: [
        { factionId: 'player', ownedCities: 1, eliminated: false },
        { factionId: 'cao', ownedCities: 1, eliminated: false },
        { factionId: 'liu', ownedCities: 1, eliminated: false },
        { factionId: 'gone', ownedCities: 0, eliminated: true },
      ],
    });
    expect(result.rivalCampaigns).toMatchObject({
      dispatched: 4,
      outcomes: { capture: 1, repulse: 1, draw: 1, unknown: 1 },
    });
    expect(result.rivalCampaigns.raw.map((entry) => entry.outcome)).toEqual([
      'capture',
      'repulse',
      'unknown',
      'draw',
    ]);
  });

  it('does not count another faction’s Hegemon win as player elimination', () => {
    const aggregate = aggregateResults([
      {
        completedMonths: 96,
        checkpoints: {
          '96': {
            month: 96,
            playerEliminated: false,
            trueUnification: false,
            hegemon: {
              claimantFactionId: 'cao',
              consecutiveMonths: 12,
              victoryDeclared: true,
            },
          },
        },
      },
      {
        completedMonths: 96,
        checkpoints: {
          '96': {
            month: 96,
            playerEliminated: true,
            trueUnification: false,
            hegemon: {
              claimantFactionId: null,
              consecutiveMonths: 0,
              victoryDeclared: false,
            },
          },
        },
      },
    ]);

    expect(aggregate).toEqual({
      trueUnificationsAtFinal: 0,
      playerEliminations: 1,
      hegemon: { status: 'implemented', claimsAtFinal: 1, victoriesAtFinal: 1 },
    });
  });

  it('retains per-battle strength, duration, supply, autonomy, and delivery metrics', () => {
    const state = {
      absoluteDay: 60,
      monthIndex: 2,
      phase: 'planning',
      winnerFactionId: null,
      hegemon: { factionId: null, months: 0 },
      factions: [{ id: 'cao', eliminated: false }],
      cities: [
        {
          id: 'city-a',
          factionId: 'cao',
          gold: 100,
          food: 200,
          governanceMode: 'governor',
          workMonthIndex: 2,
          workPointsUsed: 2,
        },
      ],
      battles: [
        {
          id: 'battle-a',
          attackerFactionId: 'cao',
          defenderFactionId: 'liu',
          active: false,
          resolved: true,
          outcome: 'attacker',
          foodShortfallDays: 2,
          battleData: {
            day: 3,
            outcome: { winner: 'attacker', reason: 'elimination' },
            units: [
              { side: 'attacker', initialTroops: 1_000, troops: 600 },
              { side: 'defender', initialTroops: 1_000, troops: 550 },
            ],
          },
        },
      ],
      directives: [],
      journeys: [
        {
          ownerFactionId: 'cao',
          kind: 'campaign',
          status: 'delivered',
          routeCityIds: ['city-a', 'city-b', 'city-c'],
          roadKmNominal: 500,
          accumulatedFoodShortfall: 1.5,
        },
      ],
      requisitions: [
        { factionId: 'cao', status: 'delivered' },
        { factionId: 'cao', status: 'failed' },
      ],
    };

    const result = summarize(state, 'cao', 2, ['city-a', 'city-missing']);
    expect(result.independentCities).toEqual({
      initialCount: 1,
      ownedBySelectedFaction: 1,
      remainingIndependent: 0,
    });
    expect(result.battles).toMatchObject({
      resolved: 1,
      durationDays: { median: 3 },
      closeOutcomes: { decidedBattles: 1, closeBattles: 1 },
      foodShortfallDays: 2,
      waterCasualties: { status: 'not-attributable' },
    });
    expect(result.battles.durationDays.raw[0]).toMatchObject({
      initialTroops: { attacker: 1_000, defender: 1_000 },
      survivingTroops: { attacker: 600, defender: 550 },
    });
    expect(result.logistics).toMatchObject({
      requisitions: { requested: 2, delivered: 1, failed: 1, closedDeliveryRate: 0.5 },
      travelFoodShortfall: 1.5,
      campaignParticipation: { started: 1, multiLegJourneys: 1, nominalRoadKm: 500 },
      cityFoodShortageDays: { status: 'not-attributable' },
    });
    expect(result.autonomy).toMatchObject({
      autonomousCities: 1,
      observedForLastSettlement: 1,
      workedCities: 1,
      idleCities: 0,
      completedWorkPoints: 2,
    });
  });
});
