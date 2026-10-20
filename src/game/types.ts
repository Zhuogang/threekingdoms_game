import type { RivalAggression } from './aiPolicy';
import type { MonthlyReports } from './reports';
export type { RivalAggression } from './aiPolicy';
export type { MonthlyReport, MonthlyReportEvent, MonthlyReports } from './reports';
export type TroopType = 'infantry' | 'cavalry' | 'archer' | 'naval' | 'elite' | 'guard';
export type Terrain = 'plain' | 'forest' | 'hill' | 'water' | 'fort';
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
  | 'appoint';
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
}
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
  equipment: string | null;
}
export interface AttackOrder {
  id: string;
  factionId: string;
  sourceId: string;
  targetId: string;
  officerIds: string[];
  food: number;
}
export interface BattleUnit {
  id: string;
  officerId: string;
  name: string;
  side: 'attacker' | 'defender';
  x: number;
  y: number;
  troops: number;
  initialTroops: number;
  force: number;
  intellect: number;
  troopType: TroopType;
  moved: boolean;
  acted: boolean;
  morale: number;
  status: 'normal' | 'confused' | 'inspired';
}
export interface BattleState {
  id: string;
  order: AttackOrder;
  attackerId: string;
  defenderId: string | null;
  playerSide: 'attacker' | 'defender';
  width: number;
  height: number;
  terrain: Terrain[];
  units: BattleUnit[];
  day: number;
  weather: 'clear' | 'rain' | 'wind';
  attackerFood: number;
  defenderFood: number;
  log: string[];
  outcome: 'attacker' | 'defender' | null;
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
export interface GameState {
  version: 1;
  ruleset: 'baye-atlas-1';
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
}
export type GameCommand =
  | { type: 'setRivalAggression'; value: RivalAggression }
  | { type: 'action'; action: Action; cityId: string; officerId: string; targetId?: string }
  | { type: 'march'; sourceId: string; targetId: string; officerIds: string[] }
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
  | { type: 'endMonth' }
  | { type: 'battleMove'; unitId: string; x: number; y: number }
  | { type: 'battleAttack'; unitId: string; targetId: string }
  | { type: 'battleSkill'; unitId: string; skill: 'fire' | 'rally' | 'confuse'; targetId?: string }
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
