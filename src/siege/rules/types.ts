export type SiegeSide = 'shu' | 'wei';
export type SiegeLevel = 'ground' | 'wall';
export type SiegeTroopType = 'infantry' | 'archer';
export type SiegeWeather = 'clear' | 'snow' | 'wind';
export type GateId = 'south' | 'north' | 'west' | 'east';
export type EngineKind = 'ladder' | 'ram' | 'earthCart' | 'tower';
export type TrenchProgress = 0 | 0.5 | 1 | 1.5 | 2 | 2.5 | 3;
export type BuildProgress = 0 | 1 | 2 | 3 | 4;
export type SiegeTerrain =
  | 'plain'
  | 'hill'
  | 'wood'
  | 'water'
  | 'trench'
  | 'wall'
  | 'gate'
  | 'building'
  | 'ramp'
  | 'courtyard'
  | 'works';

export interface Cell {
  x: number;
  y: number;
}

export interface SiegePosition extends Cell {
  level: SiegeLevel;
}

export interface ReachableCell extends SiegePosition {
  cost: number;
}

export interface SiegeOfficer {
  id: string;
  name: string;
  chinese: string;
  portraitId: string | null;
}

export interface SiegeRosterEntry {
  id: string;
  officer: SiegeOfficer;
  troopType: SiegeTroopType;
  troops: number;
  force: number;
  intellect: number;
}

export interface SiegeUnit extends SiegeRosterEntry, SiegePosition {
  side: SiegeSide;
  wounded: number;
  morale: number;
  moved: boolean;
  acted: boolean;
  routed: boolean;
  casualtyRemainder?: number;
  troopExperience?: number;
  lostTroopsToday?: number;
  attackedFromBelowDay?: number;
  climbing?: boolean;
  lastMillstoneDay?: number;
  rotateRecoveryDay?: number;
}

export interface SiegeEngine extends Cell {
  id: string;
  kind: EngineKind;
  durability: number;
  max: number;
  burning: boolean;
  /** The ladder's base is its own (x, y), at ground level. */
  raisedAt?: Cell;
  uses?: number;
  wrecked: boolean;
  moved?: boolean;
  acted?: boolean;
}

export interface SiegeGate {
  durability: number;
  max: number;
  broken: boolean;
  damaged?: boolean;
}

export interface SiegeWorkshop {
  id: string;
  queue: EngineKind | null;
  daysRemaining: number;
}

export interface SiegeLogEntry {
  day: number;
  code: string;
  params: Record<string, string | number | boolean | null>;
}

/** Plain JSON; numeric record keys serialize as decimal strings. Days are 1-based. */
export interface SiegeState {
  version: 'siege_v0.1';
  seed: number;
  rngState: number;
  day: number;
  act: 1 | 2;
  /** Current day's weather; weatherByDay preserves the seeded daily schedule. */
  weather: SiegeWeather;
  weatherByDay: Record<number, SiegeWeather>;
  grain: number;
  zhangheDistance: number;
  units: SiegeUnit[];
  engines: SiegeEngine[];
  gates: Record<GateId, SiegeGate>;
  /** Keys use "x,y". Only SOUTH_TRENCH is fillable. */
  trenchFill: Record<string, TrenchProgress>;
  innerWall: Record<number, BuildProgress>;
  workshops: SiegeWorkshop[];
  ordersUsed: Record<SiegeSide, Record<number, boolean>>;
  log: SiegeLogEntry[];
  outcome: null | 'victory' | 'historical' | 'defeat';
  /** Early act transition takes effect on the day after the second combat loss. */
  act2Day?: number;
  enginesLostAct1?: number;
  holdFast?: { day: number; cells: Cell[] };
  /** Voluntary withdrawal receives the lower historical-ending rating. */
  withdrawn?: boolean;
}

export type SiegeAction =
  | ({ type: 'move'; unitId: string } & SiegePosition)
  | { type: 'attack'; unitId: string; targetId: string }
  | { type: 'attack'; unitId: string; gateId: GateId }
  | { type: 'attack'; engineId: string; targetId: string }
  | ({ type: 'fillTrench'; unitId: string } & Cell)
  | ({ type: 'fillTrench'; engineId: string } & Cell)
  | { type: 'raiseLadder'; engineId: string }
  | { type: 'ram'; engineId: string; gateId: GateId }
  | ({ type: 'moveEngine'; engineId: string } & Cell)
  | { type: 'queueEngine'; workshopId: string; kind: EngineKind }
  | { type: 'fireArrows' | 'dropMillstone'; unitId: string; engineId: string }
  | { type: 'dropBoulders'; unitId: string; targetId: string }
  | { type: 'buildWall'; unitId: string }
  | { type: 'order'; side: 'shu'; kind: 'rally' | 'supervise' | 'rotate'; target: string }
  | { type: 'order'; side: 'wei'; kind: 'rally' | 'nightRepair'; target: string }
  | { type: 'order'; side: 'wei'; kind: 'holdFast'; target: Cell | string }
  | { type: 'endDay' }
  | { type: 'withdraw' };

export type SiegeActionResult =
  { ok: true; state: SiegeState; events: SiegeLogEntry[] } | { ok: false; reason: string };

/** The defender may return a new state or modify the isolated draft passed to it. */
export type SiegeDefenderTurn = (state: SiegeState) => SiegeState | void;
