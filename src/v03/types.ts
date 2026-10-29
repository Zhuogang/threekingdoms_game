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
export type V03JourneyKind = 'requisition' | 'campaign' | 'appointment' | 'transfer' | 'return';
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

export type V03ObjectiveReason =
  | 'incoming-army'
  | 'active-defense'
  | 'ready'
  | 'force-shortfall'
  | 'food-shortfall'
  | 'no-opportunity'
  | 'campaign-active'
  | 'campaign-resolved'
  | 'ownership-changed'
  | 'alliance-changed'
  | 'commander-unavailable'
  | 'route-unavailable'
  | 'budget-impossible'
  | 'preparation-expired'
  | 'opportunity-changed';

/** Advisory NPC memory. Targets reserve nothing; only existing orders move stock. */
export interface V03FactionObjective {
  factionId: string;
  mode: 'defend' | 'recover' | 'prepare-conquest' | 'conquer';
  sourceCityId: string | null;
  targetCityId: string | null;
  commanderOfficerId: string | null;
  startedDay: number;
  reviewDay: number;
  forceTarget: number;
  foodTarget: number;
  forceDeficit: number;
  foodDeficit: number;
  reason: V03ObjectiveReason;
  cancellationReason: V03ObjectiveReason | null;
  /** At most one support requisition and one campaign directive. */
  orderIds: string[];
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
  /** Monthly automatic talent counters; work points use an independent ten-day period. */
  workMonthIndex?: number;
  workPeriodIndex?: number;
  workPointsUsed?: number;
  autoSearchesThisMonth?: number;
  autoAssignmentsThisMonth?: number;
  /** Troop-days spent stationed in this city since the last monthly settlement. */
  troopServiceDaysThisMonth?: number;
  cavalryServiceDaysThisMonth?: number;
  prisonerServiceDaysThisMonth?: number;
  prisonerCavalryDaysThisMonth?: number;
  /** Absolute month boundary until which raid/sack actions are unavailable. */
  plunderCooldownUntilDay?: number;
}

export type V03OfficerLocation =
  | { kind: 'city'; cityId: string }
  | { kind: 'journey'; journeyId: string }
  | { kind: 'battle'; battleId: string }
  | {
      kind: 'captured';
      cityId: string | null;
      /** Explicit in transit; city custody can derive this from the city owner. */
      holderFactionId?: string;
      journeyId?: string;
    };

export interface V03Officer {
  id: string;
  name: string;
  chinese: string;
  factionId: string | null;
  location: V03OfficerLocation;
  force: number;
  intellect: number;
  loyalty: number;
  age: number | null;
  troops: number;
  wounded: number;
  reorganizationDays: number;
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
  /** Ruler identity for this captivity; null prevents reuse after release or defection. */
  capturedRulerFactionId?: string | null;
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
  woundedTroops: number;
  returned: string[];
  captured: string[];
  killed: string[];
  troopGrowth: V03TroopGrowthReport[];
}

/** Immutable per-contingent aftermath; later reinforcement cannot rewrite this report. */
export interface V03TroopGrowthReport {
  officerId: string | null;
  troopType: TroopType;
  survivingTroops: number;
  woundedTroops: number;
  beforeExperience: number;
  afterExperience: number;
  participated: boolean;
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
  lastRationDay?: number;
  foodOverflow?: number;
  populationOutflow?: number;
  rearDispersed?: number;
  attackerFormationOfficerIds: Record<string, string[]>;
  defenderFormationOfficerIds: Record<string, string[]>;
  autoCommand?: boolean;
}

export type V03DayResolution = CalendarDayResolution;

export interface V03GameState {
  version: 3;
  ruleset: 'hegemony-3';
  /** Personnel/save contract; independent of the public game version. */
  personnelSchema: 1;
  /** Binds both roster data and chronology; older rosters require a new campaign. */
  officerRosterVersion: 1;
  /** Last year whose growth and scheduled appearances committed together. */
  lastOfficerDebutYear: number;
  troopSources: V03TroopSource[];
  personnelDay: V03PersonnelDay;
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
  /** Player proposals (and treaty breaks) consume the target's monthly attempt. Optional for older saves. */
  lastAllianceProposalMonthByTarget?: Record<string, number>;
  hegemon: { factionId: string | null; months: number };
  nextId: number;
  phase: V03GamePhase;
  playerCapitalCityId: string;
  factions: V03Faction[];
  /** Absent in compatible v3 saves until the first normal planning boundary. */
  factionObjectives?: V03FactionObjective[];
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

/** Actual city-held personnel, never a second copy of an officer or reserve pool. */
export interface V03TroopSource {
  id: string;
  cityId: string;
  factionId: string | null;
  sourceOfficerId: string | null;
  autoReturn: boolean;
  troopType: TroopType;
  troops: number;
  wounded: number;
  troopExperience: number;
  reorganizationDays: number;
}

export interface V03PersonnelDayEntry {
  recordId: string;
  cityId: string;
  factionId: string | null;
  holderFactionId: string | null;
  troopType: TroopType;
  troops: number;
  wounded: number;
  reorganizationDays: number;
  foodAvailable: boolean;
}

/** Daybreak eligibility is independent of the interactive advance cursor. */
export interface V03PersonnelDay {
  absoluteDay: number;
  completed: boolean;
  entries: V03PersonnelDayEntry[];
  rations: Array<{ recordId: string; troops: number; wounded: number }>;
}

export type V03Command =
  | { type: 'transferOfficers'; sourceCityId: string; targetCityId: string; officerIds: string[] }
  | {
      type: 'resolveCityGovernance';
      eventId: string;
      choice: 'self' | 'governor';
      officerId?: string;
    }
  | { type: 'returnTroops'; cityId: string; officerId: string }
  | { type: 'disband'; cityId: string; recordId: string; troops: number; wounded: number }
  | { type: 'advance'; days: 1 | 10 | 'nextEvent' }
  | { type: 'appointGovernor'; cityId: string; officerId: string | null }
  | {
      type: 'cityAction';
      cityId: string;
      action: V03CityAction;
      troopType?: TroopType;
      officerId?: string;
      officerIds?: string[];
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
