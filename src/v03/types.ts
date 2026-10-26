import type { TroopType } from './content/types';
import type { ReservePools } from './campaign/troop-experience';
import type { BattleAction, V03TacticalBattleState } from './battle';
import type { V03CoalitionInvitation, V03TimedAlliance } from './campaign/monthly-systems';
import type { Journey as CalendarJourney } from './calendar';
import type { DayResolution as CalendarDayResolution } from './calendar/day-resolution';

export type { TroopType };
export type { V03CoalitionInvitation, V03TimedAlliance };

export type V03GovernanceMode = 'ruler' | 'governor' | 'steward';
export type V03GamePhase = 'planning' | 'battle' | 'finished';
export type V03JourneyKind = 'requisition' | 'campaign' | 'appointment' | 'return';
export type V03JourneyStatus = CalendarJourney['status'];
export type V03BattleIntent = 'conquer' | 'raid' | 'sack';
export type V03CityAction =
  | 'restore-loyalty'
  | 'develop-farming'
  | 'develop-commerce'
  | 'search'
  | 'recruit'
  | 'train'
  | 'security'
  | 'feast'
  | 'buy-food'
  | 'sell-food'
  | 'reward'
  | 'relieve'
  | 'equip'
  | 'assign-troops';

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
  /** Typed unassigned soldier pools, including veterans returned by officers. */
  reservePools: ReservePools;
  garrisonTroops: number;
  /** Average experience of unled garrison soldiers only; officer troops are excluded. */
  garrisonExperience: number;
  governorId: string | null;
  pendingAppointment: V03PendingAppointment | null;
  governanceMode: V03GovernanceMode;
  /** Work slots spent by direct ruler-city orders in the active campaign month. */
  workMonthIndex?: number;
  workPointsUsed?: number;
  /** Troop-days spent stationed in this city since the last monthly settlement. */
  troopServiceDaysThisMonth?: number;
  cavalryServiceDaysThisMonth?: number;
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
  /** Soldier experience; never use the officer's personal experience/level for this. */
  troopExperience: number;
  troopType: TroopType;
  /** Fine arms add a persistent +5 force bonus; omitted is accepted in earlier v3 saves. */
  equipment?: 'Fine arms' | null;
  experience: number;
  level: number;
  governorOfCityId: string | null;
  alive: boolean;
  /** At most one holder decision per prisoner per campaign month. */
  prisonerActionMonth?: number;
}

export interface V03JourneyCargo {
  gold: number;
  food: number;
  troops: number;
}

export interface V03Journey extends CalendarJourney {
  kind: V03JourneyKind;
  intent?: V03BattleIntent;
  /** Requested return at the next safe route decision point; no cargo is discarded. */
  returnRequested?: boolean;
  /** Ordered city waypoints for multi-leg land journeys; road segment snapshots remain authoritative. */
  routeCityIds?: string[];
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
  food?: number;
  officerIds?: string[];
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
  | 'succession'
  | 'prisonerAction'
  | 'journeyArrival'
  | 'battleReady'
  | 'battleResolved'
  | 'requisitionResponse'
  | 'governorChanged'
  | 'monthBoundary'
  | 'campaignEvent'
  | 'hegemonWarning'
  | 'diplomacy'
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
  code?: string;
  params?: Record<string, string | number | boolean | null>;
  tier?: 'critical' | 'notice' | 'chronicle';
  battleOutcome?: V03BattleOutcomeReport;
  monthlySummary?: V03MonthlyCitySummary[];
}

export interface V03BattleSideReport {
  startingTroops: number;
  survivingTroops: number;
  returned: string[];
  captured: string[];
  killed: string[];
}

export interface V03BattleOutcomeReport {
  cityId: string;
  cityCaptured: boolean;
  winner: 'attacker' | 'defender' | 'draw';
  attacker: V03BattleSideReport;
  defender: V03BattleSideReport;
  loot: { gold: number; food: number };
  returnArrivalDay: number | null;
}

export interface V03MonthlyCitySummary {
  cityId: string;
  gold: number;
  food: number;
  troops: number;
  governorActions: string[];
  shortage: boolean;
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
  /** A player may submit this battle's day while other manual battles remain active. */
  playerDayComplete: boolean;
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
  autoCommand?: boolean;
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
  alliances: V03TimedAlliance[];
  coalitionInvitations: V03CoalitionInvitation[];
  firedMonthlyEventIds: string[];
  lastAllianceBreakMonthByFaction: Record<string, number>;
  hegemon: { factionId: string | null; months: number };
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
  | {
      type: 'cityAction';
      cityId: string;
      action: V03CityAction;
      troopType?: TroopType;
      officerId?: string;
      amount?: number;
    }
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
  | { type: 'recallJourney'; journeyId: string }
  | { type: 'proposeAlliance'; targetFactionId: string }
  | { type: 'breakAlliance'; targetFactionId: string }
  | { type: 'acceptCoalitionInvitation'; invitationId: string }
  | { type: 'battleAction'; battleId: string; action: BattleAction }
  | { type: 'setBattleAutoCommand'; battleId: string; enabled: boolean }
  | {
      type: 'marchArmy';
      sourceCityId: string;
      targetCityId: string;
      officerIds: string[];
      food?: number;
      intent: V03BattleIntent;
    }
  | {
      type: 'prisonerAction';
      officerId: string;
      action: 'release' | 'recruit' | 'exchange' | 'execute';
      exchangeOfficerId?: string;
    }
  | { type: 'completeBattleDay'; battleId: string }
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
