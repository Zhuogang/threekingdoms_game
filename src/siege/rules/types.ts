import type { SiegeScore } from './score';

export type SiegeSide = 'shu' | 'wei';
export type SiegeLevel = 'ground' | 'wall';
export type SiegeTroopType = 'infantry' | 'archer';
export type SiegeWeather = 'clear' | 'snow' | 'wind';
export type GateId = 'south' | 'north' | 'west' | 'east';
export type EngineKind = 'ladder' | 'ram' | 'earthCart' | 'tower';
export type TrenchProgress =
  0 | 0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 1.75 | 2 | 2.25 | 2.5 | 2.75 | 3;
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
  suppressedDay?: number;
  assaultedDay?: number;
  rotateRecoveryDay?: number;
}

export interface SiegeEngine extends Cell {
  id: string;
  kind: EngineKind;
  durability: number;
  max: number;
  burning: boolean;
  covered?: boolean;
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
  version: 'siege_v0.2';
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
  footholds: Record<string, 0 | 1 | 2 | 3>;
  mounds: Record<string, 0 | 1 | 2 | 3 | 4 | 5 | 6>;
  preparations: {
    braziers: Record<string, { litDay: number }>;
    millstones: Record<string, { hoisted: boolean; day: number }>;
    boulders: Record<string, { day: number }>;
  };
  nightOrders: {
    shu?: { kind: 'nightAssault' };
    wei?:
      | { kind: 'torches' }
      | { kind: 'nightRepair'; target: GateId }
      | { kind: 'sortie'; target: string; unitId: string };
  };
  mainBodyThreatened: boolean;
  stats: {
    shuLost: number;
    weiLost: number;
    enginesLost: number;
    assaults: number;
    nightClashes: number;
    nightResults: Array<{ day: number; kind: string; result: string }>;
    idleDays: number;
    lastActiveDay: number | null;
    score: { shu: SiegeScore; wei: SiegeScore } | null;
    moundsBuilt: number;
    gateEverBroken: boolean;
    wallEverHeldAtNight: boolean;
    wallNights: number;
    firstFootholdDay: number | null;
    firstWallDay: number | null;
  };
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
  | { type: 'climb'; unitId: string; assault?: boolean }
  | { type: 'attack'; unitId: string; targetId: string; assault?: boolean }
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
  | { type: 'suppress'; unitId: string; targetId: string }
  | { type: 'suppress'; engineId: string; targetId: string }
  | { type: 'coverEngine'; unitId: string; engineId: string }
  | ({ type: 'pileEarth'; unitId: string } & Cell)
  | ({ type: 'pileEarth'; engineId: string } & Cell)
  | { type: 'lightBrazier' | 'hoistMillstone' | 'stackBoulders'; unitId: string }
  | { type: 'order'; side: 'shu'; kind: 'nightAssault'; target?: string }
  | { type: 'order'; side: 'wei'; kind: 'torches'; target?: string }
  | { type: 'order'; side: 'wei'; kind: 'sortie'; target: string }
  | { type: 'order'; side: 'shu'; kind: 'rally' | 'supervise' | 'rotate'; target: string }
  | { type: 'order'; side: 'wei'; kind: 'rally' | 'nightRepair'; target: string }
  | { type: 'order'; side: 'wei'; kind: 'holdFast'; target: Cell | string }
  | { type: 'endDay' }
  | { type: 'withdraw' };

export type SiegeActionResult =
  { ok: true; state: SiegeState; events: SiegeLogEntry[] } | { ok: false; reason: string };

/** Optional simulator hook, driven before endDay rather than by the night resolver. */
export type SiegeDefenderTurn = (state: SiegeState) => SiegeState | void;
