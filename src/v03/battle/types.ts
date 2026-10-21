/** Logical battlefield contracts for the independent v0.3 ruleset. */
export const BATTLE_WIDTH = 24;
export const BATTLE_HEIGHT = 20;
export const BATTLE_TILE_COUNT = BATTLE_WIDTH * BATTLE_HEIGHT;
export const MAX_UNITS_PER_SIDE = 10;
export const BATTLE_MAP_TEMPLATE_VERSION = 'v0.3.1';

export type BattleTerrain = 'plain' | 'forest' | 'hill' | 'water' | 'cliff';
export type BattleRegion = 'hanzhong' | 'shouchun' | 'xiapi' | 'chengdu';
export type ApproachDirection = 'north' | 'east' | 'south' | 'west';
export type BattleSide = 'attacker' | 'defender';

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
  templateVersion: typeof BATTLE_MAP_TEMPLATE_VERSION;
  regionId: BattleRegion;
  approachDirection: ApproachDirection;
  seed: number;
  width: typeof BATTLE_WIDTH;
  height: typeof BATTLE_HEIGHT;
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
  /** Defaults to one tile, except archers (three tiles). */
  attackRange?: number;
}

export interface TacticalBattleUnit extends Omit<BattleUnitPosition, 'troops'> {
  name: string;
  troops: number;
  initialTroops: number;
  force: number;
  attackRange: number;
  morale: number;
  moved: boolean;
  acted: boolean;
}

export interface BattleOutcome {
  winner: BattleSide | null;
  reason: 'elimination' | 'camp' | 'dayLimit';
}

/** Plain JSON-safe battle state; no functions, Maps or rendering objects are stored. */
export interface V03TacticalBattleState {
  schemaVersion: 1;
  id: string;
  map: BattleMap;
  playerSide: BattleSide;
  day: number;
  dayLimit: number;
  /** The approved day-limit rule awards control by surviving troop count; ties favor the defender. */
  timeoutPolicy: BattleTimeoutPolicy;
  units: TacticalBattleUnit[];
  log: string[];
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
}

export type BattleAction =
  | { type: 'move'; unitId: string; x: number; y: number }
  | { type: 'attack'; unitId: string; targetId: string }
  | { type: 'wait'; unitId: string };

export type BattleActionResult =
  | { ok: true; state: V03TacticalBattleState }
  | { ok: false; state: V03TacticalBattleState; error: string };
