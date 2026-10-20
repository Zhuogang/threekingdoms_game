import type { RivalAggression } from './aiPolicy';
import type { MonthlyReports } from './reports';
export type { RivalAggression } from './aiPolicy';
export type { MonthlyReport, MonthlyReportEvent, MonthlyReports } from './reports';
export type TroopType = 'infantry' | 'cavalry' | 'archer' | 'naval' | 'elite' | 'guard';
export type Terrain = 'plain' | 'forest' | 'hill' | 'water' | 'fort' | 'wall' | 'gate';
export type Action =
  | 'farm'
  | 'commerce'
  | 'govern'
  | 'search'
  | 'recruit'
  | 'train'
  | 'reward'
  | 'feast'
  | 'buyFood'
  | 'sellFood'
  | 'relieve'
  | 'scout'
  | 'persuade'
  | 'subvert'
  | 'alliance'
  | 'equip'
  | 'confiscate'
  | 'banish'
  | 'appoint'
  | 'plunder';
export interface Faction {
  id: string;
  name: string;
  chinese: string;
  leader: string;
  color: string;
  motto: string;
  description: string;
  difficulty: string;
}
export type BattlefieldProfile = 'plains' | 'river' | 'mountain' | 'forest';
export interface City {
  id: string;
  name: string;
  chinese: string;
  region: string;
  x: number;
  y: number;
  neighbors: string[];
  factionId: string | null;
  population: number;
  farming: number;
  commerce: number;
  defense: number;
  loyalty: number;
  gold: number;
  food: number;
  reserve: number;
  governorId: string | null;
  /** Plunder, raid and sack are rejected while `turn < plunderCooldownUntil`. */
  plunderCooldownUntil: number;
}
export type OfficerFate = 'active' | 'executed';
export interface Officer {
  id: string;
  name: string;
  chinese: string;
  factionId: string | null;
  cityId: string;
  force: number;
  intellect: number;
  loyalty: number;
  stamina: number;
  age: number;
  troops: number;
  troopType: TroopType;
  busy: boolean;
  captive: boolean;
  experience: number;
  /** min(5, floor(experience / 100)); rising levels grant stats once. */
  level: number;
  equipment: string | null;
  fate: OfficerFate;
}
export type AttackIntent = 'conquer' | 'raid' | 'sack';
export interface AttackOrder {
  id: string;
  factionId: string;
  sourceId: string;
  targetId: string;
  officerIds: string[];
  food: number;
  intent: AttackIntent;
}
export type BattleSide = 'attacker' | 'defender';
export type BattleSkill = 'fire' | 'rally' | 'confuse' | 'raidSupply' | 'ambush' | 'rockfall';
export interface BattleUnit {
  id: string;
  officerId: string;
  name: string;
  side: BattleSide;
  x: number;
  y: number;
  troops: number;
  initialTroops: number;
  force: number;
  intellect: number;
  troopType: TroopType;
  level: number;
  moved: boolean;
  acted: boolean;
  /** True when the unit took damage today; undamaged units recover morale at day end. */
  hurt: boolean;
  morale: number;
  status: 'normal' | 'confused' | 'inspired';
  /** Set when the officer was captured by this side in the battle. */
  capturedBy?: BattleSide;
}
export type Weather = 'clear' | 'rain' | 'wind';
export interface BattleState {
  id: string;
  order: AttackOrder;
  attackerId: string;
  defenderId: string | null;
  playerSide: BattleSide;
  width: number;
  height: number;
  terrain: Terrain[];
  units: BattleUnit[];
  day: number;
  /** The siege ends in a defender win once this many days have passed. */
  dayLimit: number;
  weather: Weather;
  nextWeather: Weather;
  attackerFood: number;
  defenderFood: number;
  tacticPoints: { attacker: number; defender: number };
  log: string[];
  outcome: BattleSide | null;
}
export interface GameLog {
  id: number;
  turn: number;
  text: string;
  kind: 'economy' | 'military' | 'diplomacy' | 'event' | 'good' | 'bad';
}
export interface Alliance {
  a: string;
  b: string;
  untilTurn: number;
}
export interface BattleSummary {
  orderId: string;
  targetId: string;
  attackerId: string;
  defenderId: string | null;
  outcome: 'captured' | 'held' | 'raided';
  days: number;
  intent: AttackIntent;
  casualties: { attacker: number; defender: number };
  captured: string[];
}
export interface Reputation {
  brokeAllianceTurn: number;
}
export interface GameState {
  version: 2;
  ruleset: 'baye-atlas-2';
  revision: number;
  playerFactionId: string;
  rivalAggression: RivalAggression;
  reports: MonthlyReports;
  year: number;
  month: number;
  turn: number;
  rng: number;
  nextId: number;
  cities: City[];
  officers: Officer[];
  alliances: Alliance[];
  phase: 'planning' | 'battle' | 'finished';
  battle: BattleState | null;
  orders: AttackOrder[];
  resolution: { queue: AttackOrder[]; index: number; stage: 'orders' | 'upkeep' } | null;
  log: GameLog[];
  winner: string | null;
  stats: { battlesWon: number; commandsIssued: number; citiesCaptured: number };
  /** AI factions make no marches while `turn < truceUntilTurn`. */
  truceUntilTurn: number;
  /** The most recent completed battle, for the summary modal. */
  lastBattle: BattleSummary | null;
  reputation: Record<string, Reputation>;
}
export type SupplyDays = 10 | 20 | 30;
export type PrisonerDecision = 'release' | 'execute';
export type GameCommand =
  | { type: 'setRivalAggression'; value: RivalAggression }
  | { type: 'action'; action: Action; cityId: string; officerId: string; targetId?: string }
  | {
      type: 'march';
      sourceId: string;
      targetId: string;
      officerIds: string[];
      intent?: AttackIntent;
      supplyDays?: SupplyDays;
    }
  | {
      type: 'transfer';
      sourceId: string;
      targetId: string;
      officerId: string;
      gold: number;
      food: number;
      troops: number;
    }
  | { type: 'assignTroops'; cityId: string; officerId: string; amount: number }
  | { type: 'prisoner'; cityId: string; prisonerId: string; decision: PrisonerDecision }
  | { type: 'breakAlliance'; factionId: string }
  | { type: 'endMonth' }
  | { type: 'battleMove'; unitId: string; x: number; y: number }
  | { type: 'battleAttack'; unitId: string; targetId: string }
  | { type: 'battleSkill'; unitId: string; skill: BattleSkill; targetId?: string }
  | { type: 'battleWait'; unitId: string }
  | { type: 'battleEndDay' }
  | { type: 'battleRetreat' }
  | { type: 'battleAuto' };
export interface CommandResult {
  ok: boolean;
  state: GameState;
  error?: string;
}
export interface ActionInfo {
  label: string;
  description: string;
  gold: number;
  stamina: number;
  reason: string | null;
}
