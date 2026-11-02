import { OFFICER_CATALOG_BY_ID } from '../../v03/content/officer-catalog';
import type { Cell, GateId, SiegePosition, SiegeRosterEntry, SiegeTroopType } from '../rules/types';

/** Exact copy of docs/siege/chencang/art/layout.txt, verified against it by tests. */
export const CHENCANG_LAYOUT: readonly string[] = [
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
const distance = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

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
    max: id === 'south' ? 800 : 500,
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
  /** Low end first, high end last. Ramp positions use the ground level tag. */
  cells: readonly Cell[];
  ground: Cell;
  wall: Cell;
}

export const RAMPS: readonly RampGeometry[] = blocks('M').map((run, index) => {
  const gateCells = cellsWith('G');
  const gateDistance = (cell: Cell) => Math.min(...gateCells.map((g) => distance(cell, g)));
  const cells = [...run].sort((a, b) => gateDistance(a) - gateDistance(b));
  const low = cells[0]!;
  const high = cells.at(-1)!;
  const next = cells[1]!;
  const wall = adjacent(high).find(
    ({ x, y }) => layoutSymbol(x, y) === 'W' || layoutSymbol(x, y) === 'O',
  )!;
  return {
    id: `ramp-${index + 1}`,
    cells,
    ground: { x: low.x + low.x - next.x, y: low.y + low.y - next.y },
    wall,
  };
});

export const SOUTH_TRENCH: readonly Cell[] = cellsWith('-').filter(
  ({ y }) => y === CITY_BOUNDS.south + 1 || y === CITY_BOUNDS.south + 2,
);

export const INNER_WALL_SEGMENTS = blocks('R').map((cells, index) => ({
  index,
  cells: cells as readonly Cell[],
  buildPoints: 4 as const,
}));

const hallRow = Math.min(...cellsWith('K').map((cell) => cell.y));
export const COURTYARD: readonly Cell[] = cellsWith('K').filter(({ y }) => y > hallRow);

export const WORKSHOPS = blocks('S').map((cells, index) => ({
  id: `workshop-${index + 1}`,
  cells: cells as readonly Cell[],
  // Even-width fronts have two middle cells; use the western one consistently.
  spawn: {
    x: Math.floor((Math.min(...cells.map((c) => c.x)) + Math.max(...cells.map((c) => c.x))) / 2),
    y: Math.max(...cells.map((c) => c.y)) + 1,
  },
}));

const palisade = cellsWith('P');
const campWest = Math.min(...palisade.map((c) => c.x));
const campEast = Math.max(...palisade.map((c) => c.x));
const campNorth = Math.min(...palisade.map((c) => c.y));
const isOpen = ({ x, y }: Cell): boolean => '.+=XR'.includes(layoutSymbol(x, y)!);

export const DEPLOY_SHU: readonly SiegePosition[] = allCells
  .filter(
    (cell) =>
      isOpen(cell) &&
      ((cell.y >= 21 && cell.y <= 25) ||
        (cell.x > campWest && cell.x < campEast && cell.y > campNorth)),
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
  shuOfficer('zhaoyun', 2000, 'infantry'),
  shuOfficer('yanyan', 2000, 'archer'),
  shuOfficer('jiangwan', 1500, 'archer'),
  shuOfficer('feiyi', 1500, 'archer'),
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
