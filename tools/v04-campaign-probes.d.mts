import type { V03GameState, V03Command } from '../src/v03/types';
import type { executeV03Command } from '../src/v03/commands';
import type { ROUTE_DEFINITIONS } from '../src/v03/geography';
import type { availableReserveTroops } from '../src/v03/campaign/personnel';
import type { getV03CityActionAvailability } from '../src/v03/governance/city-actions';
import type {
  previewCampaignDirective,
  GovernanceOrderServices,
} from '../src/v03/governance/orders';

export type CampaignProbePolicy =
  'adjacent-legacy' | 'passive-defense' | 'economy-first' | 'border-attack';
export const CAMPAIGN_PROBE_POLICIES: CampaignProbePolicy[];
export interface CampaignProbeApi {
  executeV03Command: typeof executeV03Command;
  ROUTE_DEFINITIONS: typeof ROUTE_DEFINITIONS;
  availableReserveTroops: typeof availableReserveTroops;
  getV03CityActionAvailability: typeof getV03CityActionAvailability;
  previewCampaignDirective: typeof previewCampaignDirective;
  services: GovernanceOrderServices;
}
export function prepareProbeCapital(
  state: V03GameState,
  api: CampaignProbeApi,
): {
  state: V03GameState;
  actions: V03Command[];
};
export function executeCampaignProbe(
  state: V03GameState,
  policy: CampaignProbePolicy,
  api: CampaignProbeApi,
): {
  state: V03GameState;
  actions: V03Command[];
  dispatched: boolean;
};
