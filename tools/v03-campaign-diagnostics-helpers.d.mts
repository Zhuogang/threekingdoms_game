export interface CampaignDiagnosticCheckpoint {
  month: number;
  ownedCities?: number;
  totalCities?: number;
  independentCities?: {
    initialCount: number;
    ownedBySelectedFaction: number;
    remainingIndependent: number;
  };
  playerEliminated: boolean;
  trueUnification: boolean;
  hegemon?: {
    claimantFactionId: string | null;
    consecutiveMonths: number;
    victoryDeclared: boolean;
  };
}

export interface CampaignDiagnosticRun {
  completedMonths: number;
  checkpoints: Record<string, CampaignDiagnosticCheckpoint>;
}

export interface CampaignDiagnosticSummary extends CampaignDiagnosticCheckpoint {
  battles: {
    started: number;
    active: number;
    resolved: number;
    durationDays: {
      unit: string;
      median: number | null;
      maximum: number | null;
      raw: Array<Record<string, unknown>>;
    };
    closeOutcomes: {
      definition: string;
      decidedBattles: number;
      closeBattles: number;
      weakerSideWins: number;
    };
    waterCasualties: { status: string; reason: string };
    foodShortfallDays: number;
  };
  logistics: {
    requisitions: Record<string, number | null>;
    travelFoodShortfall: number;
    campaignParticipation: Record<string, number | string>;
    cityFoodShortageDays: { status: string; reason: string };
  };
  autonomy: {
    autonomousCities: number;
    workMonthIndexExpected: number;
    observedForLastSettlement: number;
    workedCities: number;
    idleCities: number;
    unobservedCities: number;
    completedWorkPoints: number;
    coverageNote: string;
  };
}

export function summarize(
  state: {
    cities: Array<{
      id: string;
      factionId: string | null;
      gold: number;
      food: number;
      governanceMode?: string;
      workMonthIndex?: number;
      workPointsUsed?: number;
    }>;
    factions: Array<{ id: string; eliminated?: boolean }>;
    battles: Array<{
      id?: string;
      active: boolean;
      resolved: boolean;
      attackerFactionId?: string;
      defenderFactionId?: string | null;
      outcome?: string | null;
      foodShortfallDays?: number;
      battleData?: {
        day?: number;
        outcome?: { winner?: string | null; reason?: string } | null;
        units?: Array<{
          side: string;
          initialTroops: number;
          troops: number;
        }>;
      };
    }>;
    directives: Array<{ status: string }>;
    journeys: Array<{
      status: string;
      ownerFactionId?: string;
      kind?: string;
      routeCityIds?: string[];
      roadKmNominal?: number;
      accumulatedFoodShortfall?: number;
    }>;
    requisitions?: Array<{ factionId: string; status: string }>;
    hegemon: { factionId: string | null; months: number };
    phase: string;
    absoluteDay: number;
    monthIndex?: number;
    winnerFactionId: string | null;
  },
  factionId: string,
  month: number,
  initialIndependentCityIds?: string[],
): CampaignDiagnosticSummary;

export function aggregateResults(results: CampaignDiagnosticRun[]): {
  trueUnificationsAtFinal: number;
  playerEliminations: number;
  hegemon: {
    status: 'implemented';
    claimsAtFinal: number;
    victoriesAtFinal: number;
  };
};
