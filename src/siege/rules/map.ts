import { SIEGE_TUNING as T } from './tuning';
import {
  CITY_BOUNDS,
  COURTYARD,
  GATES,
  INNER_WALL_SEGMENTS,
  MAP_HEIGHT,
  MAP_WIDTH,
  RAMPS,
  SOUTH_TRENCH,
  cellKey,
  layoutSymbol,
} from '../content/chencang';
import type { GateId, SiegeLevel, SiegeState, SiegeTerrain } from './types';

const courtyardKeys = new Set(COURTYARD.map(cellKey));
const southTrenchKeys = new Set(SOUTH_TRENCH.map(cellKey));
const segmentIndexes = new Map(
  INNER_WALL_SEGMENTS.flatMap(({ cells, index }) => cells.map((c) => [cellKey(c), index] as const)),
);
const rampHeights = new Map(
  RAMPS.flatMap(({ cells }) => cells.map((c, index) => [cellKey(c), index + 1] as const)),
);

export function isMapCell(x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < MAP_WIDTH &&
    y < MAP_HEIGHT
  );
}

export function gateAt(x: number, y: number): GateId | undefined {
  return (Object.keys(GATES) as GateId[]).find((id) =>
    GATES[id].cells.some((cell) => cell.x === x && cell.y === y),
  );
}

/** Off-map positions are water, and movement also rejects them explicitly. */
export function cellTerrain(state: SiegeState, x: number, y: number): SiegeTerrain {
  if (!isMapCell(x, y)) return 'water';
  const key = cellKey({ x, y });
  switch (layoutSymbol(x, y)) {
    case '^':
      return 'hill';
    case 'T':
    case 'P':
      return 'wood';
    case '~':
      return 'water';
    case '-':
      return southTrenchKeys.has(key) && state.trenchFill[key] === T.trenchCapacity
        ? 'plain'
        : 'trench';
    case 'W':
    case 'O':
      return 'wall';
    case 'G':
      return 'gate';
    case 'M':
      return 'ramp';
    case 'K':
      return courtyardKeys.has(key) ? 'courtyard' : 'building';
    case 'B':
    case 'S':
    case 't':
    case 'C':
      return 'building';
    case 'R': {
      const index = segmentIndexes.get(key)!;
      const progress = state.innerWall[index] ?? 0;
      return progress === 4 ? 'wall' : progress > 0 ? 'works' : 'plain';
    }
    default:
      return 'plain';
  }
}

export function cellHeight(state: SiegeState, x: number, y: number, level: SiegeLevel): number {
  const terrain = cellTerrain(state, x, y);
  if (terrain === 'ramp') return rampHeights.get(cellKey({ x, y }))!;
  if (level === 'wall' && terrain === 'wall') return layoutSymbol(x, y) === 'R' ? 2 : 3;
  if (level === 'wall' && terrain === 'gate') return 3;
  return 0;
}

export function isWallFoot(state: SiegeState, x: number, y: number): boolean {
  return (
    y === CITY_BOUNDS.south + 1 &&
    southTrenchKeys.has(cellKey({ x, y })) &&
    state.trenchFill[cellKey({ x, y })] === T.trenchCapacity &&
    cellTerrain(state, x, y - 1) === 'wall'
  );
}
