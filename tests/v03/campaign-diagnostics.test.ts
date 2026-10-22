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
            outcome: { winner: 'attacker', reason: 'camp' },
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
