import type { TroopType } from '../game/types';
import type { BattleAction, V03TacticalBattleState } from './battle';
import type { Journey as CalendarJourney } from './calendar';
import type { DayResolution as CalendarDayResolution } from './calendar/day-resolution';

export type { TroopType };

export type V03GovernanceMode = 'ruler' | 'governor' | 'steward';
export type V03GamePhase = 'planning' | 'battle' | 'finished';
export type V03JourneyKind = 'requisition' | 'campaign' | 'appointment' | 'return';
export type V03JourneyStatus = CalendarJourney['status'];
export type V03BattleIntent = 'conquer' | 'raid' | 'sack';

export interface V03Faction {
  id: string;
  name: string;
  chinese: string;
  leaderOfficerId: string;
  color: string;
  capitalCityId: string;
  /** The source scenario's narrative stays content; these fields drive rules. */
  isPlayer: boolean;
  eliminated: boolean;
}

export interface V03PendingAppointment {
  governorId: string | null;
  effectiveDay: number;
  journeyId?: string;
}

export interface V03City {
  id: string;
  name: string;
  chinese: string;
  region: string;
  factionId: string | null;
  population: number;
  farming: number;
  commerce: number;
  loyalty: number;
  gold: number;
  food: number;
  reserve: number;
  garrisonTroops: number;
  governorId: string | null;
  pendingAppointment: V03PendingAppointment | null;
  governanceMode: V03GovernanceMode;
  /** Absolute month boundary until which raid/sack actions are unavailable. */
  plunderCooldownUntilDay?: number;
}

export type V03OfficerLocation =
  | { kind: 'city'; cityId: string }
  | { kind: 'journey'; journeyId: string }
  | { kind: 'battle'; battleId: string }
  | { kind: 'captured'; cityId: string | null };

export interface V03Officer {
  id: string;
  name: string;
  chinese: string;
  factionId: string | null;
  location: V03OfficerLocation;
  force: number;
  intellect: number;
  loyalty: number;
  age: number;
  troops: number;
  troopType: TroopType;
  experience: number;
  level: number;
  governorOfCityId: string | null;
  alive: boolean;
}

export interface V03JourneyCargo {
  gold: number;
  food: number;
  troops: number;
}

export interface V03Journey extends CalendarJourney {
  kind: V03JourneyKind;
  intent?: V03BattleIntent;
}

export type V03OrderStatus =
  | 'requested'
  | 'proposed'
  | 'waiting'
  | 'accepted'
  | 'reserved'
  | 'dispatched'
  | 'delivered'
  | 'rejected'
  | 'cancelled'
  | 'failed';

export interface V03Requisition {
  id: string;
  factionId: string;
  sourceCityId: string;
  targetCityId: string;
  requested: V03JourneyCargo;
  proposed: V03JourneyCargo;
  createdDay: number;
  requestedByDay: number | null;
  earliestDepartureDay: number | null;
  estimatedArrivalDay: number | null;
  status: V03OrderStatus;
  journeyId: string | null;
  governanceRevision: number;
  message: string;
}

export interface V03CampaignDirective {
  id: string;
  factionId: string;
  sourceCityId: string;
  targetCityId: string;
  intent: V03BattleIntent;
  requestedTroops: number;
  proposedTroops: number;
  requestedByDay: number | null;
  earliestDepartureDay: number | null;
  estimatedArrivalDay: number | null;
  status: V03OrderStatus;
  journeyId: string | null;
  governanceRevision: number;
  message: string;
}

export type V03DomainEventKind =
  | 'journeyArrival'
  | 'battleReady'
  | 'battleResolved'
  | 'requisitionResponse'
  | 'governorChanged'
  | 'monthBoundary'
  | 'factionEliminated'
  | 'victory';

export interface V03DomainEvent {
  id: string;
  absoluteDay: number;
  kind: V03DomainEventKind;
  title: string;
  detail: string;
  entityId: string | null;
  acknowledged: boolean;
}

export interface V03BattleState {
  id: string;
  mapId: string;
  mapVersion: string;
  seed: number;
  absoluteDay: number;
  attackerFactionId: string;
  defenderFactionId: string | null;
  attackerJourneyId: string;
  defenderJourneyId: string | null;
  intent: V03BattleIntent;
  active: boolean;
  resolved: boolean;
  outcome: 'attacker' | 'defender' | 'draw' | null;
  loot: { gold: number; food: number } | null;
  /** Plain serializable tactical state owned by the battle rules module. */
  battleData: V03TacticalBattleState;
  attackerFood: number;
  defenderFood: number;
  attackerFoodRemainderMicro: number;
  defenderFoodRemainderMicro: number;
  foodShortfallDays: number;
  attackerFormationOfficerIds: Record<string, string[]>;
  defenderFormationOfficerIds: Record<string, string[]>;
}

export type V03DayResolution = CalendarDayResolution;

export interface V03GameState {
  version: 3;
  ruleset: 'hegemony-3';
  revision: number;
  scenarioId: string;
  seed: number;
  playerFactionId: string;
  startYear: number;
  absoluteDay: number;
  monthIndex: number;
  rng: number;
  nextId: number;
  phase: V03GamePhase;
  playerCapitalCityId: string;
  factions: V03Faction[];
  cities: V03City[];
  officers: V03Officer[];
  journeys: V03Journey[];
  requisitions: V03Requisition[];
  directives: V03CampaignDirective[];
  battles: V03BattleState[];
  dayResolution: V03DayResolution | null;
  events: V03DomainEvent[];
  log: string[];
  winnerFactionId: string | null;
  governanceRevision: number;
}

export type V03Command =
  | { type: 'advance'; days: 1 | 10 | 'nextEvent' }
  | { type: 'appointGovernor'; cityId: string; officerId: string | null }
  | { type: 'developCapital'; field: 'farming' | 'commerce' }
  | {
      type: 'requestRequisition';
      sourceCityId: string;
      targetCityId: string;
      requested: V03JourneyCargo;
      requestedByDay: number | null;
    }
  | {
      type: 'answerRequisition';
      requisitionId: string;
      answer: 'accept' | 'reduce' | 'wait' | 'cancel';
      reduced?: V03JourneyCargo;
    }
  | {
      type: 'issueCampaignDirective';
      sourceCityId: string;
      targetCityId: string;
      intent: V03BattleIntent;
      requestedTroops: number;
      requestedByDay: number | null;
    }
  | {
      type: 'answerCampaignDirective';
      directiveId: string;
      answer: 'accept' | 'reduce' | 'wait' | 'cancel';
      reducedTroops?: number;
    }
  | { type: 'battleAction'; battleId: string; action: BattleAction }
  | { type: 'acknowledgeEvent'; eventId: string };

export interface V03CommandResult {
  ok: boolean;
  state: V03GameState;
  error?: string;
}

export function gameDate(state: Pick<V03GameState, 'startYear' | 'absoluteDay'>) {
  const monthNumber = Math.floor(state.absoluteDay / 30);
  return {
    year: state.startYear + Math.floor(monthNumber / 12),
    month: (monthNumber % 12) + 1,
    day: (state.absoluteDay % 30) + 1,
  };
}
