import { APPROACH_ROW, ROAD_COL, TRENCH_INNER_ROW, TRENCH_OUTER_ROW } from './coarseGrid';
import { SIEGE_TUNING } from '../rules/tuning';
import { OFFICER_CATALOG_BY_ID } from '../../v03/content/officer-catalog';
import type { Cell, GateId, SiegePosition, SiegeRosterEntry, SiegeTroopType } from '../rules/types';

/** Exact copy of docs/siege/chencang/art/layout.txt, verified against it by tests. */
export const CHENCANG_ART_LAYOUT: readonly string[] = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '................................................',
  '..............++++++++++++++++++++++++++++++++++',
  '^^^.........-----------==-----------............',
  '^^^^........--OWWWWWWWWGGWWWWWWWWO--............',
  '^^^^^.......--W.....MMM++MMM.....W--............',
  '^^TTT^......--WM.BBBBB.++KKKK...MW--....TT......',
  '^TTTTT......--WM.BBBBB.++KKKK...MW--...TTTT.....',
  '^^TTT^......--WM.BBBBB.++KKKK...MW--....TT......',
  '^^^^^.......--W........++........W--............',
  '^^^^...+++++==G++++++++++++++++++G==++++++++++++',
  '^^^^...+....--WM.......++.......MW--............',
  '^^^....+....--WM.BBBBB.++.BBBBB.MW--............',
  '^^^....+....--WM.BBBBB.++.BBBBB.MW--.........^^.',
  '^^.....+....--WR.RRRRRR++RRRRRR.RW--........^^^.',
  '^^.....+....--W.....MMM++MMM.....W--.........^^^',
  '^......+....--OWWWWWWWWGGWWWWWWWWO--.........^^^',
  '^......+....-----------==-----------.........^^^',
  '.......+....-----------==-----------..........^^',
  '.......+...............++.......................',
  '.......+...............++.......................',
  '.......+...............++.......................',
  '.......++++++++++++++++++.......................',
  '...............SSSS.X..++....SSSS...............',
  '...............SSSS....++....SSSS...............',
  '.......................++.......................',
  '..........PPPPPPPPPPPPP++PPPPPPPPPPPPP..........',
  '^^^.......P.ttt..ttt...++...ttt..ttt.P..........',
  '^^^^......P.ttt..ttt...++.CCCC..ttt..P....TTT...',
  '^^^^^.....P.ttt..ttt...++.CCCC..ttt..P...TTTTT..',
  '^^^^^^....P.ttt..ttt...++...ttt..ttt.P....TTT...',
  '^^^^^^^...P............++............P..........',
];

/** Rules board. Each cell spans the fine art coordinates in coarseGrid.ts. */
export const CHENCANG_LAYOUT: readonly string[] = [
  '.................',
  '^..-----=-----...',
  '^..-OWWWGWWWO-...',
  '^..-W..M+M..W-...',
  'T..-WMBB+KKMW-.T.',
  '^..=G+++++++G=...',
  '^..-WRBR+RBRW-..^',
  '^..-OWWWGWWWO-..^',
  '^..-----=-----..^',
  '...-----=-----..^',
  '........+.......^',
  '.....SS.+.SS.....',
  '^.PPPPPP+PPPPPP..',
  '^.Ptt.t.+CC.ttPT.',
];

export const MAP_WIDTH = CHENCANG_LAYOUT[0]!.length;
export const MAP_HEIGHT = CHENCANG_LAYOUT.length;
export const cellKey = ({ x, y }: Cell): string => `${x},${y}`;
export const sameCell = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;
export const layoutSymbol = (x: number, y: number): string | undefined => CHENCANG_LAYOUT[y]?.[x];

const allCells: Cell[] = CHENCANG_LAYOUT.flatMap((row, y) => [...row].map((_, x) => ({ x, y })));
const cellsWith = (symbols: string): Cell[] =>
  allCells.filter(({ x, y }) => symbols.includes(layoutSymbol(x, y)!));
const adjacent = ({ x, y }: Cell): Cell[] => [
  { x, y: y - 1 },
  { x: x + 1, y },
  { x, y: y + 1 },
  { x: x - 1, y },
];

/** Connected components retain row-major order, so IDs and segment indexes stay stable. */
function blocks(symbol: string): Cell[][] {
  const remaining = new Set(cellsWith(symbol).map(cellKey));
  const result: Cell[][] = [];
  for (const start of cellsWith(symbol)) {
    if (!remaining.delete(cellKey(start))) continue;
    const block = [start];
    for (let i = 0; i < block.length; i++) {
      for (const next of adjacent(block[i]!)) {
        if (remaining.delete(cellKey(next))) block.push(next);
      }
    }
    result.push(block.sort((a, b) => a.y - b.y || a.x - b.x));
  }
  return result;
}

const outerWall = cellsWith('WOG');
export const CITY_BOUNDS = {
  west: Math.min(...outerWall.map((cell) => cell.x)),
  east: Math.max(...outerWall.map((cell) => cell.x)),
  north: Math.min(...outerWall.map((cell) => cell.y)),
  south: Math.max(...outerWall.map((cell) => cell.y)),
} as const;

export interface GateGeometry {
  id: GateId;
  cells: readonly Cell[];
  max: number;
  approaches: readonly Cell[];
}

function gate(id: GateId): GateGeometry {
  const boundary = CITY_BOUNDS[id];
  const cells = cellsWith('G').filter((cell) =>
    id === 'north' || id === 'south' ? cell.y === boundary : cell.x === boundary,
  );
  return {
    id,
    cells,
    max: id === 'south' ? SIEGE_TUNING.southGateDurability : SIEGE_TUNING.otherGateDurability,
    approaches: cells.flatMap((cell) =>
      adjacent(cell).filter((next) => layoutSymbol(next.x, next.y) === '='),
    ),
  };
}

export const GATES: Readonly<Record<GateId, GateGeometry>> = {
  south: gate('south'),
  north: gate('north'),
  west: gate('west'),
  east: gate('east'),
};

export interface RampGeometry {
  id: string;
  /** Singleton retained for the temporary render bridge. Uses the ground level tag. */
  cells: readonly Cell[];
  ground: Cell;
  wall: Cell;
}

/** One ground cell per painted ramp; row-six ramps double as inner-wall sites. */
export const RAMPS: readonly RampGeometry[] = [
  [
    [7, 3],
    [7, 2],
  ],
  [
    [9, 3],
    [9, 2],
  ],
  [
    [5, 4],
    [4, 4],
  ],
  [
    [11, 4],
    [12, 4],
  ],
  [
    [5, 6],
    [4, 6],
  ],
  [
    [11, 6],
    [12, 6],
  ],
  [
    [7, 6],
    [7, 7],
  ],
  [
    [9, 6],
    [9, 7],
  ],
].map(([low, high], index) => {
  const ground = { x: low![0]!, y: low![1]! };
  return { id: `ramp-${index + 1}`, cells: [ground], ground, wall: { x: high![0]!, y: high![1]! } };
});

export const SOUTH_TRENCH: readonly Cell[] = cellsWith('-').filter(
  ({ y }) => y === TRENCH_INNER_ROW || y === TRENCH_OUTER_ROW,
);

export const INNER_WALL_SEGMENTS = blocks('R').map((cells, index) => ({
  index,
  cells: cells as readonly Cell[],
  buildPoints: 4 as const,
}));

export const COURTYARD: readonly Cell[] = cellsWith('K');

export const WORKSHOPS = blocks('S').map((cells, index) => ({
  id: `workshop-${index + 1}`,
  cells: cells as readonly Cell[],
  // Inner column first, then the other cell directly north of this workshop.
  spawns: [...cells]
    .sort((a, b) => Math.abs(a.x - ROAD_COL) - Math.abs(b.x - ROAD_COL))
    .map(({ x }) => ({ x, y: APPROACH_ROW })),
}));

const palisade = cellsWith('P');
const campWest = Math.min(...palisade.map((c) => c.x));
const campEast = Math.max(...palisade.map((c) => c.x));
const campNorth = Math.min(...palisade.map((c) => c.y));
const isOpen = ({ x, y }: Cell): boolean => '.+=XR'.includes(layoutSymbol(x, y)!);

/** Open ground enclosed by the camp's palisade, in stable row-major order. */
export const CAMP_CELLS: readonly Cell[] = allCells.filter(
  (cell) => isOpen(cell) && cell.x > campWest && cell.x < campEast && cell.y >= campNorth,
);

export const DEPLOY_SHU: readonly SiegePosition[] = allCells
  .filter(
    (cell) =>
      (isOpen(cell) && cell.y >= APPROACH_ROW && cell.y <= APPROACH_ROW + 1) ||
      CAMP_CELLS.some((camp) => sameCell(camp, cell)),
  )
  .map((cell) => ({ ...cell, level: 'ground' }));

export const DEPLOY_WEI: readonly SiegePosition[] = allCells.flatMap((cell): SiegePosition[] => {
  const symbol = layoutSymbol(cell.x, cell.y)!;
  if ('WOG'.includes(symbol)) return [{ ...cell, level: 'wall' }];
  const inside =
    cell.x > CITY_BOUNDS.west &&
    cell.x < CITY_BOUNDS.east &&
    cell.y > CITY_BOUNDS.north &&
    cell.y < CITY_BOUNDS.south;
  return inside && (isOpen(cell) || COURTYARD.some((c) => sameCell(c, cell)))
    ? [{ ...cell, level: 'ground' }]
    : [];
});

function shuOfficer(id: string, troops: number, troopType: SiegeTroopType): SiegeRosterEntry {
  const officer = OFFICER_CATALOG_BY_ID.get(id);
  if (!officer) throw new Error(`Missing siege officer: ${id}`);
  return {
    id: `shu-${id}`,
    officer: {
      id: officer.id,
      name: officer.name,
      chinese: officer.chinese,
      portraitId: officer.portraitId,
    },
    troops,
    troopType,
    force: officer.adultForce,
    intellect: officer.adultIntellect,
  };
}

export const SHU_ROSTER: readonly SiegeRosterEntry[] = [
  shuOfficer('zhugeliang', 1000, 'infantry'),
  shuOfficer('weiyan', 3000, 'infantry'),
  shuOfficer('jiangwei', 2500, 'infantry'),
  shuOfficer('wangping', 2500, 'infantry'),
  shuOfficer('wuyi', 2000, 'infantry'),
  shuOfficer('liaohua', 2000, 'infantry'),
  ...(
    [
      [2000, 'infantry', 62, 50],
      [2000, 'infantry', 60, 47],
      [1500, 'archer', 58, 44],
      [1500, 'archer', 55, 40],
    ] as const
  ).map(([troops, troopType, force, intellect], index) => ({
    id: `shu-captain-${index + 1}`,
    officer: {
      id: `shu-captain-${index + 1}`,
      name: `Shu Captain ${index + 1}`,
      chinese: `蜀军校尉${index + 1}`,
      portraitId: null,
    },
    troops,
    troopType,
    force,
    intellect,
  })),
];

export const WEI_ROSTER: readonly SiegeRosterEntry[] = [
  {
    id: 'wei-haozhao',
    officer: { id: 'haozhao', name: 'Hao Zhao', chinese: '郝昭', portraitId: 'haozhao' },
    troopType: 'infantry',
    troops: 300,
    force: 76,
    intellect: 74,
  },
  {
    id: 'wei-wangsheng',
    officer: { id: 'wangsheng', name: 'Wang Sheng', chinese: '王生', portraitId: 'wangsheng' },
    troopType: 'infantry',
    troops: 200,
    force: 64,
    intellect: 52,
  },
  ...(
    [
      [250, 'archer', 58, 45],
      [200, 'archer', 55, 42],
      [200, 'infantry', 53, 38],
      [150, 'archer', 50, 35],
    ] as const
  ).map(([troops, troopType, force, intellect], index) => ({
    id: `wei-captain-${index + 1}`,
    officer: {
      id: `wei-captain-${index + 1}`,
      name: `Captain ${index + 1}`,
      chinese: `守将${index + 1}`,
      portraitId: null,
    },
    troops,
    troopType,
    force,
    intellect,
  })),
];
