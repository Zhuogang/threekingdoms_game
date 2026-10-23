/** Logical battlefield contracts for the independent v0.3 ruleset. */
/** Size of the four legacy regional templates. */
export const BATTLE_WIDTH = 24;
export const BATTLE_HEIGHT = 20;
export const BATTLE_TILE_COUNT = BATTLE_WIDTH * BATTLE_HEIGHT;
/** Size of the painted canvas battlefields (docs/v0.3/08-battlefield-canvas-plan.md). */
export const CANVAS_BATTLE_WIDTH = 48;
export const CANVAS_BATTLE_HEIGHT = 32;
/** Every map carries its own size; these are the only sizes a map or save may use. */
export const BATTLE_MAP_SIZES: readonly (readonly [width: number, height: number])[] = [
  [BATTLE_WIDTH, BATTLE_HEIGHT],
  [CANVAS_BATTLE_WIDTH, CANVAS_BATTLE_HEIGHT],
];
export const MAX_UNITS_PER_SIDE = 10;
export const BATTLE_MAP_TEMPLATE_VERSION = 'v0.3.1';
/** Canvas battlefields built from a character layout. */
export const CANVAS_BATTLE_MAP_VERSION = 'v0.3.2';
export type BattleMapVersion =
  typeof BATTLE_MAP_TEMPLATE_VERSION | typeof CANVAS_BATTLE_MAP_VERSION;

export type BattleTerrain = 'plain' | 'forest' | 'hill' | 'water' | 'cliff';
export type BattleRegion = 'hanzhong' | 'shouchun' | 'xiapi' | 'chengdu';
export type ApproachDirection = 'north' | 'east' | 'south' | 'west';
export type BattleSide = 'attacker' | 'defender';
export type BattleWeather = 'clear' | 'rain' | 'wind';

/** v0.3 retains the current roster, while removing any water privilege. */
export type BattleTroopType = 'infantry' | 'cavalry' | 'archer' | 'naval' | 'elite' | 'guard';

export interface BattlePosition {
  x: number;
  y: number;
}

export interface BattleObjective {
  id: string;
  kind: 'camp';
  owner: BattleSide;
  position: BattlePosition;
}

export interface BattleLandmark {
  id: string;
  kind: 'river' | 'ridge' | 'road' | 'irrigation';
  label: string;
  /** Informational control line only; terrain remains the rules source. */
  positions: BattlePosition[];
}

/** Terrain is row-major: index = y * width + x. */
export interface BattleMap {
  mapId: string;
  templateVersion: BattleMapVersion;
  regionId: BattleRegion;
  /** Canvas battlefield id (e.g. `bf01-north-plain`); absent on legacy regional templates. */
  battlefieldId?: string;
  approachDirection: ApproachDirection;
  seed: number;
  width: number;
  height: number;
  terrain: BattleTerrain[];
  attackerDeployment: BattlePosition[];
  defenderDeployment: BattlePosition[];
  objectives: BattleObjective[];
  landmarks: BattleLandmark[];
}

export interface BattleMapOptions {
  regionId: BattleRegion;
  approachDirection?: ApproachDirection;
  seed?: number;
}

export interface BattleUnitPosition {
  id: string;
  side: BattleSide;
  troopType: BattleTroopType;
  x: number;
  y: number;
  troops?: number;
}

export interface WaterCombatModifiers {
  sourceOnWater: boolean;
  targetOnWater: boolean;
  attackMultiplier: number;
  incomingDamageMultiplier: number;
  combinedMultiplier: number;
}

export type BattleTimeoutPolicy = 'survivor-count' | 'field-control' | 'defender-holds' | 'draw';

export interface BattleRosterEntry {
  id: string;
  name: string;
  troopType: BattleTroopType;
  troops: number;
  force: number;
  /** Officer-derived combat attributes; omitted only by isolated rules tests. */
  intellect?: number;
  level?: number;
  isMilitia?: boolean;
  cunning?: boolean;
  /** Defaults to one tile, except archers (three tiles). */
  attackRange?: number;
}

export interface TacticalBattleUnit extends Omit<BattleUnitPosition, 'troops'> {
  name: string;
  troops: number;
  initialTroops: number;
  force: number;
  intellect: number;
  level: number;
  isMilitia: boolean;
  cunning: boolean;
  attackRange: number;
  morale: number;
  status: 'normal' | 'confused' | 'inspired';
  moved: boolean;
  acted: boolean;
}

export type BattleTactic = 'fire' | 'rally' | 'confuse' | 'raidSupply' | 'ambush' | 'rockfall';

export interface BattleTacticAvailability {
  tactic: BattleTactic;
  allowed: boolean;
  reason: string | null;
  range: number;
  cost: number;
}

export interface BattleTacticForecast {
  sourceId: string;
  targetId: string;
  tactic: BattleTactic;
  inRange: boolean;
  minCasualties: number;
  maxCasualties: number;
  chance: number;
  moraleChange: number;
  endsConfusion: boolean;
  suppliesTransferred: number;
  sourceOnWater: boolean;
  targetOnWater: boolean;
  attackMultiplier: number;
  incomingDamageMultiplier: number;
}

export interface BattleOutcome {
  winner: BattleSide | null;
  reason: 'elimination' | 'camp' | 'dayLimit' | 'retreat' | 'rout';
}

/** Plain JSON-safe battle state; no functions, Maps or rendering objects are stored. */
export interface V03BattleLogEntry {
  day: number;
  index: number;
  code: string;
  params: Record<string, string | number | boolean | null>;
}
export interface V03TacticalBattleState {
  schemaVersion: 1;
  id: string;
  map: BattleMap;
  playerSide: BattleSide;
  day: number;
  dayLimit: number;
  /** The approved day-limit rule awards control by surviving troop count; ties favor the defender. */
  timeoutPolicy: BattleTimeoutPolicy;
  tacticPoints: Record<BattleSide, number>;
  /** Raw food balances, shared with campaign logistics after each tactical action/day. */
  supplies: Record<BattleSide, number>;
  /** Deterministic tactical random stream, persisted so chance-based actions replay after load. */
  rngState: number;
  weather: BattleWeather;
  nextWeather: BattleWeather;
  units: TacticalBattleUnit[];
  log: string[];
  logEntries?: V03BattleLogEntry[];
  outcome: BattleOutcome | null;
}

export interface CreateBattleStateOptions {
  id: string;
  map: BattleMap;
  attackerUnits: readonly BattleRosterEntry[];
  defenderUnits: readonly BattleRosterEntry[];
  playerSide?: BattleSide;
  dayLimit?: number;
  timeoutPolicy?: BattleTimeoutPolicy;
  supplies?: Partial<Record<BattleSide, number>>;
  seed?: number;
}

export type BattleAction =
  | { type: 'retreat'; unitId: string }
  | { type: 'tactic'; unitId: string; tactic: BattleTactic; targetId: string }
  | { type: 'move'; unitId: string; x: number; y: number }
  | { type: 'attack'; unitId: string; targetId: string }
  | { type: 'wait'; unitId: string };

export type BattleActionResult =
  | { ok: true; state: V03TacticalBattleState }
  | { ok: false; state: V03TacticalBattleState; error: string };
