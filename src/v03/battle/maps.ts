import {
  BATTLE_HEIGHT,
  BATTLE_MAP_SIZES,
  BATTLE_MAP_TEMPLATE_VERSION,
  BATTLE_TILE_COUNT,
  BATTLE_WIDTH,
  MAX_UNITS_PER_SIDE,
  type ApproachDirection,
  type BattleLandmark,
  type BattleMap,
  type BattleMapOptions,
  type BattlePosition,
  type BattleRegion,
  type BattleTerrain,
  type BattleUnitPosition,
} from './types';
import { battlePositionIndex } from './rules';

const makePosition = (x: number, y: number): BattlePosition => ({ x, y });
/** Grid of the legacy regional templates built in this file. */
const LEGACY_GRID = { width: BATTLE_WIDTH, height: BATTLE_HEIGHT };

function writeTerrain(terrain: BattleTerrain[], x: number, y: number, value: BattleTerrain): void {
  if (x >= 0 && x < BATTLE_WIDTH && y >= 0 && y < BATTLE_HEIGHT)
    terrain[battlePositionIndex(LEGACY_GRID, x, y)] = value;
}

function writeRect(
  terrain: BattleTerrain[],
  left: number,
  top: number,
  width: number,
  height: number,
  value: BattleTerrain,
): void {
  for (let y = top; y < top + height; y++)
    for (let x = left; x < left + width; x++) writeTerrain(terrain, x, y, value);
}

function writeRow(
  terrain: BattleTerrain[],
  y: number,
  startX: number,
  endX: number,
  value: BattleTerrain,
): void {
  for (let x = startX; x <= endX; x++) writeTerrain(terrain, x, y, value);
}

function writeColumn(
  terrain: BattleTerrain[],
  x: number,
  startY: number,
  endY: number,
  value: BattleTerrain,
): void {
  for (let y = startY; y <= endY; y++) writeTerrain(terrain, x, y, value);
}

const waterPositions = (terrain: readonly BattleTerrain[]): BattlePosition[] =>
  terrain.flatMap((tile, index) =>
    tile === 'water' ? [makePosition(index % BATTLE_WIDTH, Math.floor(index / BATTLE_WIDTH))] : [],
  );

const hillPositions = (terrain: readonly BattleTerrain[]): BattlePosition[] =>
  terrain.flatMap((tile, index) =>
    tile === 'hill' || tile === 'cliff'
      ? [makePosition(index % BATTLE_WIDTH, Math.floor(index / BATTLE_WIDTH))]
      : [],
  );

function createRegionalTerrain(region: BattleRegion, seed: number): BattleTerrain[] {
  const terrain: BattleTerrain[] = Array.from({ length: BATTLE_TILE_COUNT }, () => 'plain');
  const variant = Math.abs(Math.trunc(seed)) % 3;

  if (region === 'hanzhong') {
    // The Han River valley runs east-west between broken Qinling and Micang ridges.
    // The ridge bands deliberately keep multiple low passes open.
    writeRect(terrain, 3, 3, 6, 3, 'hill');
    writeRect(terrain, 15, 3, 6, 3, 'hill');
    writeRect(terrain, 2, 14, 7, 3, 'hill');
    writeRect(terrain, 14, 14, 7, 3, 'hill');
    writeRect(terrain, 4, 3, 2, 1, 'cliff');
    writeRect(terrain, 17, 5, 3, 1, 'cliff');
    writeRect(terrain, 4, 16, 3, 1, 'cliff');
    writeRect(terrain, 16, 14, 2, 1, 'cliff');
    for (let x = 4; x <= 19; x++) {
      const y = 9 + (x % 5 === 0 ? 1 : 0);
      writeTerrain(terrain, x, y, 'water');
      if (x % 4 !== 0) writeTerrain(terrain, x, y + 1, 'water');
    }
    writeRect(terrain, 9 + variant, 6, 3, 2, 'forest');
    writeRect(terrain, 11, 12, 2, 1, 'forest');
  } else if (region === 'shouchun') {
    // Broad Huai channels and marshy bends frame open ground on each bank.
    writeRow(terrain, 8, 2, 21, 'water');
    writeRow(terrain, 9, 3, 20, 'water');
    writeRow(terrain, 10, 5, 18, 'water');
    writeColumn(terrain, 6, 8, 10, 'water');
    writeColumn(terrain, 17, 8, 10, 'water');
    writeRect(terrain, 3, 4 + variant, 3, 2, 'forest');
    writeRect(terrain, 17, 13, 3, 2, 'forest');
    writeRect(terrain, 8, 14, 4, 1, 'hill');
  } else if (region === 'xiapi') {
    // The lower Yi-Shu plain has gentle canal-like water lines and scattered woods.
    writeRow(terrain, 11, 2, 8, 'water');
    writeRow(terrain, 12, 7, 15, 'water');
    writeRow(terrain, 11, 14, 21, 'water');
    writeColumn(terrain, 8, 10, 12, 'water');
    writeColumn(terrain, 15, 11, 13, 'water');
    writeRect(terrain, 4, 5, 3, 2, 'forest');
    writeRect(terrain, 15 + variant, 5, 3, 3, 'forest');
    writeRect(terrain, 10, 15, 3, 2, 'forest');
    writeRow(terrain, 17, 4, 19, 'hill');
  } else {
    // The Chengdu Basin is mostly workable plain with irrigated waterways and low foothills.
    writeRect(terrain, 3, 3, 5, 2, 'hill');
    writeRect(terrain, 17, 3, 4, 2, 'hill');
    writeRect(terrain, 4, 3, 1, 1, 'cliff');
    writeRow(terrain, 7, 4, 19, 'water');
    writeRow(terrain, 13, 3, 20, 'water');
    for (let y = 7; y <= 13; y++) {
      if (y % 3 !== 0) writeTerrain(terrain, 12, y, 'water');
    }
    writeRect(terrain, 8, 9 + variant, 3, 2, 'forest');
    writeRect(terrain, 15, 15, 3, 2, 'forest');
  }
  return terrain;
}

function opposite(direction: ApproachDirection): ApproachDirection {
  if (direction === 'north') return 'south';
  if (direction === 'south') return 'north';
  if (direction === 'east') return 'west';
  return 'east';
}

function edgePosition(
  direction: ApproachDirection,
  distance: number,
  offset: number,
): BattlePosition {
  if (direction === 'west') return makePosition(distance, offset);
  if (direction === 'east') return makePosition(BATTLE_WIDTH - 1 - distance, offset);
  if (direction === 'north') return makePosition(offset, distance);
  return makePosition(offset, BATTLE_HEIGHT - 1 - distance);
}

function deploymentPositions(direction: ApproachDirection): BattlePosition[] {
  const offsets = [7, 8, 9, 10, 11, 12, 13, 6, 14, 5];
  return offsets.map((offset, index) => edgePosition(direction, index < 5 ? 2 : 3, offset));
}

function campPosition(direction: ApproachDirection): BattlePosition {
  return edgePosition(direction, 1, 9);
}

function safeDeployment(
  positions: readonly BattlePosition[],
  terrain: readonly BattleTerrain[],
): boolean {
  return positions.every((position) => {
    const tile = terrain[battlePositionIndex(LEGACY_GRID, position.x, position.y)];
    return tile !== undefined && tile !== 'water' && tile !== 'cliff';
  });
}

function makeLandmarks(region: BattleRegion, terrain: readonly BattleTerrain[]): BattleLandmark[] {
  const water = waterPositions(terrain);
  const hills = hillPositions(terrain);
  const riverName: Record<BattleRegion, string> = {
    hanzhong: 'Han River valley',
    shouchun: 'Huai River channels',
    xiapi: 'Lower Yi-Shu waterways',
    chengdu: 'Chengdu irrigation canals',
  };
  const landmarks: BattleLandmark[] = [];
  if (water.length)
    landmarks.push({
      id: `${region}-water`,
      kind: 'river',
      label: riverName[region],
      positions: water,
    });
  if (hills.length)
    landmarks.push({
      id: `${region}-highland`,
      kind: 'ridge',
      label: region === 'hanzhong' ? 'Qinling and Micang foothills' : 'Low foothills',
      positions: hills,
    });
  return landmarks;
}

/** Builds a fixed 24×20 region map with row-major logic terrain and explicit objectives. */
export function createBattleMap(options: BattleMapOptions): BattleMap {
  const approachDirection = options.approachDirection ?? 'west';
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed!) : 1;
  const terrain = createRegionalTerrain(options.regionId, seed);
  const attackerDeployment = deploymentPositions(approachDirection);
  const defenderDeployment = deploymentPositions(opposite(approachDirection));
  const attackerCamp = campPosition(approachDirection);
  const defenderCamp = campPosition(opposite(approachDirection));

  // The entering forces get clear land staging areas even when a river or ridge
  // crosses a map from the north or south. These are still ordinary plain cells.
  for (const position of [...attackerDeployment, ...defenderDeployment])
    writeTerrain(terrain, position.x, position.y, 'plain');
  writeTerrain(terrain, attackerCamp.x, attackerCamp.y, 'plain');
  writeTerrain(terrain, defenderCamp.x, defenderCamp.y, 'plain');

  if (!safeDeployment(attackerDeployment, terrain) || !safeDeployment(defenderDeployment, terrain))
    throw new Error(
      `The ${options.regionId} template places a deployment zone in water or on a cliff.`,
    );

  return {
    mapId: `${options.regionId}-${approachDirection}-${seed}`,
    templateVersion: BATTLE_MAP_TEMPLATE_VERSION,
    regionId: options.regionId,
    approachDirection,
    seed,
    width: BATTLE_WIDTH,
    height: BATTLE_HEIGHT,
    terrain,
    attackerDeployment,
    defenderDeployment,
    objectives: [
      { id: 'attacker-camp', kind: 'camp', owner: 'attacker', position: attackerCamp },
      { id: 'defender-camp', kind: 'camp', owner: 'defender', position: defenderCamp },
    ],
    landmarks: makeLandmarks(options.regionId, terrain),
  };
}

export function battleTerrainAt(map: BattleMap, position: BattlePosition): BattleTerrain | null {
  if (position.x < 0 || position.x >= map.width || position.y < 0 || position.y >= map.height)
    return null;
  return map.terrain[battlePositionIndex(map, position.x, position.y)] ?? null;
}

export function objectiveAt(
  map: BattleMap,
  position: BattlePosition,
): BattleMap['objectives'][number] | null {
  return (
    map.objectives.find(
      (objective) => objective.position.x === position.x && objective.position.y === position.y,
    ) ?? null
  );
}

/** Camps are objective overlays. Their tile never grants additional terrain defense. */
export function objectiveDefenseMultiplier(_map: BattleMap, _position: BattlePosition): number {
  return 1;
}

/** Ordinary terrain defense only; the camp overlay never changes this value. */
export function battleTerrainDefenseMultiplier(map: BattleMap, position: BattlePosition): number {
  return terrainDefenseMultiplier(battleTerrainAt(map, position));
}

/** Existing normal-attack terrain modifier, also exposed to tactical inspection. */
export function terrainDefenseMultiplier(terrain: BattleTerrain | null): number {
  return terrain === 'hill' ? 0.8 : terrain === 'forest' ? 0.82 : 1;
}

/** Existing fire damage multiplier for the target tile. */
export function fireTerrainMultiplier(terrain: BattleTerrain | null): number {
  return terrain === 'forest' ? 1.4 : 1;
}

export function validateBattleMap(map: BattleMap): string[] {
  const errors: string[] = [];
  if (!BATTLE_MAP_SIZES.some(([width, height]) => map.width === width && map.height === height))
    errors.push(
      `Battlefield must be ${BATTLE_MAP_SIZES.map(([width, height]) => `${width}×${height}`).join(' or ')}.`,
    );
  if (map.terrain.length !== map.width * map.height)
    errors.push(`Battlefield must contain exactly ${map.width * map.height} terrain cells.`);
  const terrainValues: readonly string[] = ['plain', 'forest', 'hill', 'water', 'cliff'];
  if (map.terrain.some((tile) => !terrainValues.includes(tile)))
    errors.push(
      'Battlefield contains an unsupported terrain value (walls and gates are excluded).',
    );
  if (map.attackerDeployment.length < MAX_UNITS_PER_SIDE)
    errors.push(`Attacker deployment needs at least ${MAX_UNITS_PER_SIDE} spaces.`);
  if (map.defenderDeployment.length < MAX_UNITS_PER_SIDE)
    errors.push(`Defender deployment needs at least ${MAX_UNITS_PER_SIDE} spaces.`);

  const indexList = (positions: readonly BattlePosition[]) =>
    positions.map((position) => battlePositionIndex(map, position.x, position.y));
  const attackers = indexList(map.attackerDeployment);
  const defenders = indexList(map.defenderDeployment);
  if (new Set(attackers).size !== attackers.length)
    errors.push('Attacker deployment contains duplicates.');
  if (new Set(defenders).size !== defenders.length)
    errors.push('Defender deployment contains duplicates.');
  if (attackers.some((index) => defenders.includes(index)))
    errors.push('Attacker and defender deployment zones overlap.');

  for (const [side, positions] of [
    ['attacker', map.attackerDeployment],
    ['defender', map.defenderDeployment],
  ] as const) {
    for (const position of positions) {
      const tile = battleTerrainAt(map, position);
      if (!tile) errors.push(`${side} deployment contains an out-of-bounds space.`);
      else if (tile === 'water' || tile === 'cliff')
        errors.push(`${side} deployment must begin on passable land.`);
    }
  }

  if (map.objectives.length !== 2 || map.objectives.some((objective) => objective.kind !== 'camp'))
    errors.push('Battlefield must define two camp objectives and no siege structures.');
  if (new Set(map.objectives.map((objective) => objective.id)).size !== map.objectives.length)
    errors.push('Objective IDs must be unique.');
  const campIndexes = indexList(map.objectives.map((objective) => objective.position));
  if (new Set(campIndexes).size !== campIndexes.length) errors.push('Camp positions overlap.');
  if (campIndexes.some((index) => attackers.includes(index) || defenders.includes(index)))
    errors.push('A camp objective overlaps a deployment zone.');
  for (const camp of map.objectives) {
    const tile = battleTerrainAt(map, camp.position);
    if (!tile) errors.push(`Camp ${camp.id} is outside the battlefield.`);
    else if (tile === 'water' || tile === 'cliff')
      errors.push(`Camp ${camp.id} must sit on passable land.`);
  }

  const start = map.attackerDeployment.find(
    (position) =>
      Number.isInteger(position.x) &&
      Number.isInteger(position.y) &&
      position.x >= 0 &&
      position.x < map.width &&
      position.y >= 0 &&
      position.y < map.height &&
      battleTerrainAt(map, position) !== 'cliff',
  );
  if (start) {
    // Every non-cliff terrain cell is traversable for every unit type. This checks the
    // connected components of the shared map graph, including all spawns and camps;
    // the path service separately accounts for asymmetric movement costs.
    const reachable = new Set<number>([battlePositionIndex(map, start.x, start.y)]);
    const queue = [start];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor]!;
      for (const next of [
        { x: current.x, y: current.y - 1 },
        { x: current.x + 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x - 1, y: current.y },
      ]) {
        if (
          next.x < 0 ||
          next.x >= map.width ||
          next.y < 0 ||
          next.y >= map.height ||
          battleTerrainAt(map, next) === 'cliff'
        )
          continue;
        const nextIndex = battlePositionIndex(map, next.x, next.y);
        if (reachable.has(nextIndex)) continue;
        reachable.add(nextIndex);
        queue.push(next);
      }
    }
    const requiredPositions = [
      ...map.attackerDeployment.map((position) => ['attacker deployment', position] as const),
      ...map.defenderDeployment.map((position) => ['defender deployment', position] as const),
      ...map.objectives.map((objective) => [`camp ${objective.id}`, objective.position] as const),
    ];
    for (const [label, position] of requiredPositions) {
      if (
        Number.isInteger(position.x) &&
        Number.isInteger(position.y) &&
        position.x >= 0 &&
        position.x < map.width &&
        position.y >= 0 &&
        position.y < map.height &&
        !reachable.has(battlePositionIndex(map, position.x, position.y))
      )
        errors.push(`${label} at (${position.x}, ${position.y}) has no passable route.`);
    }
  }
  return errors;
}

export function validateBattleUnits(
  map: BattleMap,
  units: readonly BattleUnitPosition[],
): string[] {
  const errors: string[] = [];
  const attackerCount = units.filter((unit) => unit.side === 'attacker').length;
  const defenderCount = units.filter((unit) => unit.side === 'defender').length;
  if (attackerCount > MAX_UNITS_PER_SIDE)
    errors.push(`Attacker has more than ${MAX_UNITS_PER_SIDE} units.`);
  if (defenderCount > MAX_UNITS_PER_SIDE)
    errors.push(`Defender has more than ${MAX_UNITS_PER_SIDE} units.`);
  if (new Set(units.map((unit) => unit.id)).size !== units.length)
    errors.push('Unit IDs must be unique.');
  if (new Set(units.map((unit) => battlePositionIndex(map, unit.x, unit.y))).size !== units.length)
    errors.push('Two units cannot occupy the same battlefield cell.');

  for (const unit of units) {
    const terrain = battleTerrainAt(map, unit);
    if (!terrain) errors.push(`Unit ${unit.id} is outside the battlefield.`);
    else if (terrain === 'cliff') errors.push(`Unit ${unit.id} cannot stand on a cliff.`);
    const deployment = unit.side === 'attacker' ? map.attackerDeployment : map.defenderDeployment;
    if (!deployment.some((position) => position.x === unit.x && position.y === unit.y))
      errors.push(`Unit ${unit.id} is outside its side's deployment zone.`);
  }
  return errors;
}
