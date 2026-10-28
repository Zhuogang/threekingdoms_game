import type { V03Command, V03GameState } from '../src/v03/types';
import type { RouteDefinition } from '../src/v03/geography';

export interface AdjacentCampaignCandidate {
  sourceCityId: string;
  targetCityId: string;
  requestedTroops: number;
  defenderTroops: number;
  estimatedDays: number;
  routeId: string;
}

export interface CampaignBotAction {
  state: V03GameState;
  candidatesTried: number;
  commandsRejected: number;
  dispatched: boolean;
  reducedAndDispatched: boolean;
  cancelledAfterShortfall: number;
  selected: AdjacentCampaignCandidate | null;
}

export function listAdjacentCampaignCandidates(
  state: V03GameState,
  routeDefinitions: readonly RouteDefinition[],
): AdjacentCampaignCandidate[];
export function chooseAdjacentCampaignOrder(
  state: V03GameState,
  routeDefinitions: readonly RouteDefinition[],
): AdjacentCampaignCandidate | null;
export function executeNextAdjacentCampaignOrder(
  state: V03GameState,
  routeDefinitions: readonly RouteDefinition[],
  executeCommand: (
    state: V03GameState,
    command: V03Command,
  ) => {
    ok: boolean;
    state: V03GameState;
    orderId?: string;
    preview?: unknown;
  },
): CampaignBotAction;
