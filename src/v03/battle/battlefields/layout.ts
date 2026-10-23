import {
  CANVAS_BATTLE_HEIGHT,
  CANVAS_BATTLE_MAP_VERSION,
  CANVAS_BATTLE_WIDTH,
  type ApproachDirection,
  type BattleMap,
  type BattlePosition,
  type BattleRegion,
  type BattleTerrain,
} from '../types';
import { validateBattleMap } from '../maps';
import { CANVAS_BATTLEFIELD_LAYOUTS } from './layouts.generated';

/**
 * Canvas battlefields are authored as 32 rows of 48 visual symbols in
 * `tools/build-battlefield-art.mjs`, which also draws the reference image the
 * painting follows. Every symbol maps to exactly one rules terrain; the symbol
 * itself only matters to the art (see docs/v0.3/battlefield-art/README.md).
 */
export const CANVAS_CELL_TERRAIN: Readonly<Record<string, BattleTerrain>> = {
  '.': 'plain', // fields, open ground
  '+': 'plain', // road
  '=': 'plain', // bridge, plank road, jetty
  _: 'plain', // sand bar, flats, dry bed
  V: 'plain', // village
  G: 'plain', // gate
  T: 'forest', // woods
  b: 'forest', // bamboo
  r: 'forest', // reeds
  P: 'forest', // palisade
  '^': 'hill', // hill, mound, levee
  '~': 'water',
  '#': 'cliff', // cliff, crag
  W: 'cliff', // earth or stone wall
};

export interface CanvasBattlefieldLayout {
  id: string;
  camps: { attacker: BattlePosition; defender: BattlePosition };
  /** Inclusive deployment rows; columns are fixed at x 10–13 and x 34–37. */
  deploymentRows: { attacker: readonly number[]; defender: readonly number[] };
  rows: readonly string[];
}

/** Attacker enters on the left, defender on the right (plan B1). */
const DEPLOYMENT_COLUMNS = { attacker: [10, 13], defender: [34, 37] } as const;

// Until battlefield selection lands (plan P5), each canvas reuses the nearest
// legacy region for the battle heading.
const CANVAS_REGION: Readonly<Record<string, BattleRegion>> = {
  'bf01-north-plain': 'xiapi',
  'bf02-central-farmland': 'xiapi',
  'bf03-yellow-river-ford': 'shouchun',
  'bf04-wetland-north': 'shouchun',
  'bf04-wetland-south': 'shouchun',
  'bf05-yangtze-bank': 'shouchun',
  'bf05-yangtze-crossing': 'shouchun',
  'bf06-valley-north': 'hanzhong',
  'bf06-valley-south': 'hanzhong',
  'bf07-taihang': 'hanzhong',
  'bf07-rolling-hills': 'hanzhong',
  'bf08-south-hills': 'chengdu',
  'bf09-gorge': 'hanzhong',
  'bf09-three-gorges': 'hanzhong',
  'bf10-mountain-pass': 'hanzhong',
};

export function canvasBattlefieldIds(): string[] {
  return CANVAS_BATTLEFIELD_LAYOUTS.map((layout) => layout.id);
}

export function canvasBattlefieldLayout(id: string): CanvasBattlefieldLayout | undefined {
  return CANVAS_BATTLEFIELD_LAYOUTS.find((layout) => layout.id === id);
}

/** Parse a symbol layout into row-major rules terrain; throws on a malformed layout. */
export function parseCanvasLayout(rows: readonly string[]): BattleTerrain[] {
  if (rows.length !== CANVAS_BATTLE_HEIGHT)
    throw new Error(`A canvas layout needs ${CANVAS_BATTLE_HEIGHT} rows, got ${rows.length}.`);
  return rows.flatMap((row, y) => {
    if (row.length !== CANVAS_BATTLE_WIDTH)
      throw new Error(
        `Canvas layout row ${y} has ${row.length} cells, not ${CANVAS_BATTLE_WIDTH}.`,
      );
    return [...row].map((symbol, x) => {
      const terrain = CANVAS_CELL_TERRAIN[symbol];
      if (!terrain) throw new Error(`Unknown canvas symbol "${symbol}" at (${x}, ${y}).`);
      return terrain;
    });
  });
}

/**
 * Passable deployment cells, ordered so the first ten fill the two middle
 * columns from the centre row outwards, like the legacy templates.
 */
function deploymentCells(
  terrain: readonly BattleTerrain[],
  side: 'attacker' | 'defender',
  rows: readonly number[],
): BattlePosition[] {
  const [left, right] = DEPLOYMENT_COLUMNS[side];
  const [top, bottom] = [rows[0]!, rows[1]!];
  const columnOrder =
    side === 'attacker'
      ? [left + 2, left + 3, left + 1, left]
      : [right - 2, right - 3, right - 1, right];
  const centre = (top + bottom) / 2;
  const cells: Array<BattlePosition & { key: number[] }> = [];
  for (let y = top; y <= bottom; y++)
    for (const x of columnOrder) {
      const tile = terrain[y * CANVAS_BATTLE_WIDTH + x];
      if (tile === 'water' || tile === 'cliff') continue;
      const column = columnOrder.indexOf(x);
      cells.push({ x, y, key: [column < 2 ? 0 : 1, Math.abs(y - centre), y, column] });
    }
  const compare = (a: number[], b: number[]) => a.findIndex((v, i) => v !== b[i]);
  return cells
    .sort((a, b) => {
      const i = compare(a.key, b.key);
      return i < 0 ? 0 : a.key[i]! - b.key[i]!;
    })
    .map(({ x, y }) => ({ x, y }));
}

export interface CanvasBattleMapOptions {
  approachDirection?: ApproachDirection;
  seed?: number;
}

/** Builds a validated 48×32 battle map from a canvas layout. */
export function createCanvasBattleMap(
  battlefieldId: string,
  options: CanvasBattleMapOptions = {},
): BattleMap {
  const layout = canvasBattlefieldLayout(battlefieldId);
  if (!layout) throw new Error(`Unknown canvas battlefield "${battlefieldId}".`);
  const approachDirection = options.approachDirection ?? 'west';
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed!) : 1;
  const terrain = parseCanvasLayout(layout.rows);
  const map: BattleMap = {
    mapId: `${battlefieldId}-${approachDirection}-${seed}`,
    templateVersion: CANVAS_BATTLE_MAP_VERSION,
    regionId: CANVAS_REGION[battlefieldId] ?? 'xiapi',
    battlefieldId,
    approachDirection,
    seed,
    width: CANVAS_BATTLE_WIDTH,
    height: CANVAS_BATTLE_HEIGHT,
    terrain,
    attackerDeployment: deploymentCells(terrain, 'attacker', layout.deploymentRows.attacker),
    defenderDeployment: deploymentCells(terrain, 'defender', layout.deploymentRows.defender),
    objectives: [
      {
        id: 'attacker-camp',
        kind: 'camp',
        owner: 'attacker',
        position: { ...layout.camps.attacker },
      },
      {
        id: 'defender-camp',
        kind: 'camp',
        owner: 'defender',
        position: { ...layout.camps.defender },
      },
    ],
    landmarks: [],
  };
  const errors = validateBattleMap(map);
  if (errors.length) throw new Error(`${battlefieldId}: ${errors.join(' ')}`);
  return map;
}
