import { deflateSync } from 'node:zlib';
import { mkdir, readdir, readFile, rm, writeFile as writeFileNow } from 'node:fs/promises';
import { join } from 'node:path';
import * as prettier from 'prettier';

// Builds the Chencang siege art kit in docs/siege/chencang/art/ (plan:
// docs/siege/01-chencang-art-plan.md §8). Each asset gets a folder with an
// oblique block-out rendered from the layout and height table, a transparent
// alignment grid, per-object masks and footprints for cutting layers, and the
// full ImageGen prompt. S2-01 also gets the step masks that
// tools/compose-siege-map.mjs uses to grow the full-map painting.
const OUT = 'docs/siege/chencang/art';
const PLAN = '01-chencang-art-plan.md';

// Writes only changed files, retrying briefly: on Windows another process
// (indexer, antivirus, an open viewer) sometimes holds a file for a moment.
async function writeFile(path, content) {
  const next = Buffer.from(content);
  const previous = await readFile(path).catch(() => null);
  if (previous?.equals(next)) return;
  for (let attempt = 0; ; attempt++) {
    try {
      return await writeFileNow(path, next);
    } catch (error) {
      if (attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}

// Generated Markdown and JSON go through the repo's prettier settings, so
// `npm run format:check` stays clean without hand-aligning tables.
const PRETTIER = await prettier.resolveConfig('README.md');
const pretty = (text, parser) => prettier.format(text, { ...PRETTIER, parser });

// Plan §7. x 0–47 runs west to east, y 0–31 north to south. Shu comes up the
// road from the south, Wei relief from the east. `M` (horse ramps) came with
// the MVP plan (§4.4) after S1, so the S1 assets are drawn without them.
const LAYOUT = [
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
const W = 48;
const H = 32;

// Block-out colours (plan §7.1). Top faces use these; front faces are darker.
const C = {
  snow: '#e6e4dc',
  road: '#967046',
  ice: '#9cc0d0',
  trench: '#7fa6b8',
  bank: '#8c7356',
  bridge: '#684220',
  bridgeFront: '#4a2e16',
  hill: '#928860',
  wallTop: '#8c8c9c',
  wallFront: '#5e5e6e',
  parapetTop: '#6c6c7c',
  tower: '#c8b8a0',
  roof: '#50565e',
  gate: '#de2828',
  residence: '#b05842',
  barracks: '#a0704c',
  works: '#9a8f74',
  foundation: '#5a5650',
  tunnel: '#3a2a1a',
  pine: '#386838',
  timber: '#4a3a2e',
  palisade: '#965ca0',
  tent: '#c9b48a',
  hq: '#b23a2a',
  shed: '#7a5a3a',
  shedBody: '#5a4028',
  ramp: '#b4a48c',
  camp: '#d6ccb6',
  deadwood: '#7a6a5a',
  rock: '#8a8a86',
  sky: '#cfd4d6',
  magenta: '#ff00ff',
};

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const mix = (hex, toward, t) => {
  const a = hexRgb(hex);
  const b = hexRgb(toward);
  return `#${a
    .map((v, i) =>
      Math.round(v + (b[i] - v) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};
const shade = (hex, t) => mix(hex, '#000000', t);
const tint = (hex, t) => mix(hex, '#ffffff', t);

// Legend keys, so a prompt only describes colours that are visible in its frame.
const KEYS = [
  'snow',
  'road',
  'ice',
  'trench',
  'bridge',
  'hill',
  'wall',
  'ramp',
  'gate',
  'tower',
  'residence',
  'barracks',
  'works',
  'foundation',
  'tunnel',
  'pine',
  'palisade',
  'tent',
  'hq',
  'shed',
  'camp',
];

// ---------------------------------------------------------------------------
// Scene: terrain columns plus authored objects. Heights are in levels (§5.1).

function terrainAt(x, y) {
  const s = LAYOUT[y][x];
  if (s === '+' || s === 'G') return { h: 0, top: C.road, key: 'road' };
  if (s === '~') return { h: -1, top: C.ice, key: 'ice' };
  if (s === '-' || s === '=') return { h: -1, top: C.trench, key: 'trench' };
  if (s === '^') return { h: 1, top: C.hill, key: 'hill' };
  if (s === 'X') return { h: 0, top: C.tunnel, key: 'tunnel' };
  // The residence's front courtyard is the attacker's objective (§7.1).
  if (s === 'K' && y > 6) return { h: 0, top: C.residence, key: 'residence' };
  return { h: 0, top: C.snow, key: 'snow' };
}

// The full-map painting (S2-01) carries the ground only under the camp and the
// woods: tents, fences, trees and engines are separate pieces (plan §9.2). The
// tunnel mouth waits for v0.2, so it is plain snow for now.
const PIECE_KINDS = new Set(['workshop', 'tent', 'palisade', 'tree', 'camp-gate']);
function mapTerrain(x, y) {
  const s = LAYOUT[y][x];
  const inCamp = y >= 27 && x > 10 && x < 37;
  if ('tCS'.includes(s) || (s === '.' && inCamp)) return { h: 0, top: C.camp, key: 'camp' };
  if (s === 'X') return { h: 0, top: C.snow, key: 'snow' };
  return terrainAt(x, y);
}

const box = (x0, x1, y0, y1, b, t, top, front = shade(top, 0.35), extra = {}) => ({
  type: 'box',
  x0,
  x1,
  y0,
  y1,
  b,
  t,
  top,
  front,
  ...extra,
});
// A hip roof over the eave rectangle; `inset` is how far the ridge stops short
// of each end. An inset of 0 gives a gable, half the depth gives a pyramid.
const roof = (x0, x1, y0, y1, e, r, ridge, inset, color = C.roof, extra = {}) => ({
  type: 'roof',
  x0,
  x1,
  y0,
  y1,
  e,
  r,
  ridge,
  inset,
  color,
  ...extra,
});
// A vertical face drawn onto the south plane y, such as a gate passage.
const panel = (x0, x1, y, b, t, color, extra = {}) => ({
  type: 'panel',
  x0,
  x1,
  y,
  b,
  t,
  color,
  ...extra,
});
// A ramp rising from the ground to level t at its `rise` end (n, s, e or w).
const ramp = (x0, x1, y0, y1, t, rise) => ({
  type: 'ramp',
  x0,
  x1,
  y0,
  y1,
  b: 0,
  t,
  rise,
  top: C.ramp,
  front: shade(C.ramp, 0.35),
});
const rampHeight = ({ x0, x1, y0, y1, t, rise }, x, y) =>
  t *
  {
    n: (y1 - y) / (y1 - y0),
    s: (y - y0) / (y1 - y0),
    w: (x1 - x) / (x1 - x0),
    e: (x - x0) / (x1 - x0),
  }[rise];

const PARAPET = 0.22;
const wallParts = (id, x0, x1, y0, y1, outer) => {
  const p = {
    south: [x0, x1, y1 - PARAPET, y1],
    north: [x0, x1, y0, y0 + PARAPET],
    west: [x0, x0 + PARAPET, y0, y1],
    east: [x1 - PARAPET, x1, y0, y1],
  }[outer];
  return [
    box(x0, x1, y0, y1, 0, 3, C.wallTop, C.wallFront),
    box(...p, 3, 3.5, C.parapetTop, C.wallFront, { id: `${id}-parapet`, layer: 'L4' }),
  ];
};
const wallEW = (id, x0, x1, y, outer) => ({
  id,
  kind: 'wall',
  key: 'wall',
  row: y,
  cells: [x0, y, x1, y],
  symbols: 'W',
  parts: wallParts(id, x0, x1 + 1, y, y + 1, outer),
});
const wallNS = (id, x, y0, y1, outer) => ({
  id,
  kind: 'wall',
  run: 'ns',
  key: 'wall',
  row: y1,
  cells: [x, y0, x, y1],
  symbols: 'W',
  parts: wallParts(id, x, x + 1, y0, y1 + 1, outer),
});
const cornerTower = (id, x, y) => ({
  id,
  kind: 'corner-tower',
  key: 'tower',
  row: y,
  cells: [x, y, x, y],
  symbols: 'O',
  parts: [
    box(x, x + 1, y, y + 1, 0, 3, C.wallTop, C.wallFront, { key: 'wall' }),
    box(x + 0.14, x + 0.86, y + 0.14, y + 0.86, 3, 4.25, C.tower, C.tower),
    roof(x - 0.04, x + 1.04, y - 0.02, y + 1.04, 4.25, 5, 'ew', 0.53),
  ],
});
// South gate (§7.1): two storeys, ridge at level 7, the tallest building.
const gateSouth = () => ({
  id: 'gate-south',
  kind: 'gate-tower',
  key: 'tower',
  row: 16,
  cells: [22, 16, 25, 16],
  symbols: 'WG',
  parts: [
    box(22, 26, 16, 17, 0, 3, C.wallTop, C.wallFront, { key: 'wall' }),
    panel(23, 25, 17, 0, 2.1, C.gate, { key: 'gate' }),
    box(22.2, 25.8, 15.55, 16.6, 3, 4.8, C.tower, C.tower),
    box(22, 26, 17 - PARAPET, 17, 3, 3.5, C.parapetTop, C.wallFront, {
      id: 'gate-south-parapet',
      layer: 'L4',
      key: 'wall',
    }),
    roof(22, 26, 15.42, 16.74, 4.8, 5.3, 'ew', 0.45),
    box(22.55, 25.45, 15.72, 16.42, 5.3, 6.3, C.tower, C.tower),
    roof(22.15, 25.85, 15.48, 16.62, 6.3, 7, 'ew', 0.4),
  ],
});
// North gate: one storey; its passage is seen from inside the city.
const gateNorth = () => ({
  id: 'gate-north',
  kind: 'gate-tower',
  key: 'tower',
  row: 4,
  cells: [22, 4, 25, 4],
  symbols: 'WG',
  parts: [
    box(22, 26, 4, 5, 0, 3, C.wallTop, C.wallFront, { key: 'wall' }),
    panel(23, 25, 5, 0, 2.1, C.gate, { key: 'gate' }),
    box(22.2, 25.8, 3.7, 4.75, 3, 4.25, C.tower, C.tower),
    roof(22, 26, 3.58, 4.9, 4.25, 5, 'ew', 0.4),
  ],
});
// West and east gates open sideways, so their passages face east and west
// and are never visible; the road simply runs into the tower.
const gateSide = (id, x) => ({
  id,
  kind: 'gate-tower',
  key: 'tower',
  row: 11,
  cells: [x, 9, x, 11],
  symbols: 'WG',
  parts: [
    box(x, x + 1, 9, 12, 0, 3, C.wallTop, C.wallFront, { key: 'wall' }),
    box(x + 0.11, x + 0.89, 9.15, 11.85, 3, 4.25, C.tower, C.tower),
    roof(x - 0.05, x + 1.05, 8.98, 12.04, 4.25, 5, 'ns', 0.42),
  ],
});
const hall = (id, kind, key, x0, x1, y0, y1, row, body, eaves, ridge, symbols) => ({
  id,
  kind,
  key,
  row,
  cells: [Math.floor(x0), Math.floor(y0), Math.ceil(x1) - 1, Math.ceil(y1) - 1],
  symbols,
  parts: [
    box(x0 + 0.12, x1 - 0.12, y0 + 0.12, y1 - 0.14, 0, body, C[key], C[key]),
    roof(x0 - 0.02, x1 + 0.02, y0 - 0.02, y1, body, ridge, 'ew', eaves),
  ],
});
// Horse ramps (MVP plan §4.4): two against the inner face of each wall, one
// each side of its gate, low beside the gate road and rising away from it to
// the walkway. [id, x0, x1, y0, y1, high end]
const RAMPS = [
  ['ramp-north-w', 20, 22, 5, 5, 'w'],
  ['ramp-north-e', 25, 27, 5, 5, 'e'],
  ['ramp-west-n', 15, 15, 6, 8, 'n'],
  ['ramp-east-n', 32, 32, 6, 8, 'n'],
  ['ramp-west-s', 15, 15, 11, 13, 's'],
  ['ramp-east-s', 32, 32, 11, 13, 's'],
  ['ramp-south-w', 20, 22, 15, 15, 'w'],
  ['ramp-south-e', 25, 27, 15, 15, 'e'],
];
const rampObject = ([id, x0, x1, y0, y1, rise]) => ({
  id,
  kind: 'ramp',
  key: 'ramp',
  row: y1,
  cells: [x0, y0, x1, y1],
  symbols: 'M',
  parts: [ramp(x0, x1 + 1, y0, y1 + 1, 3, rise)],
});

// Camp and field pieces (S2-08 to S2-11), also used by the full layout.
const workshop = (n, x) => ({
  id: `workshop-${n}`,
  kind: 'workshop',
  key: 'shed',
  row: 24,
  cells: [x, 23, x + 3, 24],
  symbols: 'S',
  parts: [
    // Eaves at 2 levels so a ladder cart fits under the roof (S2-10 round 1
    // drew taller posts on its own when the eaves were at 1.1).
    box(x + 0.1, x + 3.9, 23.15, 24.88, 0, 2, C.shedBody, C.shedBody),
    roof(x - 0.02, x + 4.02, 23.02, 25, 2, 3, 'ew', 0.4, C.shed),
  ],
});
const hqTent = () => ({
  id: 'hq-tent',
  kind: 'tent',
  key: 'hq',
  row: 29,
  cells: [26, 28, 29, 29],
  symbols: 'C',
  parts: [
    box(26.1, 29.9, 28.15, 29.88, 0, 0.6, C.hq, C.hq),
    roof(26, 30, 28.05, 30, 0.6, 1.5, 'ew', 0.5, C.hq),
  ],
});
const tent = (x, y) => ({
  id: `tent-${x}-${y}`,
  kind: 'tent',
  key: 'tent',
  row: y,
  cells: [x, y, x, y],
  symbols: 't',
  parts: [
    box(x + 0.12, x + 0.88, y + 0.18, y + 0.9, 0, 0.25, C.tent, shade(C.tent, 0.2)),
    roof(x + 0.08, x + 0.92, y + 0.14, y + 0.94, 0.25, 1, 'ns', 0, C.tent),
  ],
});
// One stake line per palisade cell, reaching toward each palisade neighbour.
const isP = (x, y) => LAYOUT[y]?.[x] === 'P';
function palisadeAt(x, y) {
  const [a, b] = [0.41, 0.59];
  const parts = [];
  if (isP(x, y - 1)) parts.push([x + a, x + b, y, y + b]);
  if (isP(x - 1, y)) parts.push([x, x + b, y + a, y + b]);
  if (isP(x + 1, y)) parts.push([x + a, x + 1, y + a, y + b]);
  if (isP(x, y + 1)) parts.push([x + a, x + b, y + a, y + 1]);
  return {
    id: `palisade-${x}-${y}`,
    kind: 'palisade',
    key: 'palisade',
    row: y,
    cells: [x, y, x, y],
    symbols: 'P',
    parts: parts.map((r) => box(...r, 0, 1, C.palisade)),
  };
}
// The camp gate (辕门) stands over the road where it crosses the palisade.
const campGate = () => ({
  id: 'camp-gate',
  kind: 'camp-gate',
  key: 'palisade',
  row: 26,
  cells: [23, 26, 24, 26],
  symbols: '+',
  parts: [
    box(22.62, 22.9, 26.36, 26.64, 0, 2.2, C.timber, C.timber),
    box(25.1, 25.38, 26.36, 26.64, 0, 2.2, C.timber, C.timber),
    box(22.52, 25.48, 26.42, 26.58, 1.9, 2.25, C.timber, C.timber),
  ],
});
const pine = (x, y, id = `pine-${x}-${y}`) => ({
  id,
  kind: 'tree',
  key: 'pine',
  foundation: false,
  row: y,
  cells: [x, y, x, y],
  symbols: 'T',
  parts: [
    box(x + 0.45, x + 0.55, y + 0.5, y + 0.6, 0, 0.6, C.timber, C.timber),
    roof(x + 0.1, x + 0.9, y + 0.12, y + 0.88, 0.45, 2.2, 'ew', 0.38, C.pine),
  ],
});
// Field scenery for S2-11, one cell each except the abatis.
const scenery = (id, kind, key, x, y, w, parts) => ({
  id,
  kind,
  key,
  row: y,
  cells: [x, y, x + w - 1, y],
  symbols: '.',
  parts,
});
const pinePair = (x, y) =>
  scenery('pine-pair', 'tree', 'pine', x, y, 1, [
    roof(x + 0.04, x + 0.56, y + 0.08, y + 0.6, 0.3, 1.7, 'ew', 0.25, C.pine),
    roof(x + 0.44, x + 0.96, y + 0.36, y + 0.88, 0.25, 1.45, 'ew', 0.25, C.pine),
  ]);
const broadPine = (x, y) =>
  scenery('pine-broad', 'tree', 'pine', x, y, 1, [
    box(x + 0.44, x + 0.56, y + 0.48, y + 0.6, 0, 0.6, C.timber, C.timber),
    roof(x - 0.06, x + 1.06, y + 0.04, y + 0.96, 0.5, 2.4, 'ew', 0.46, C.pine),
  ]);
const deadTree = (x, y) =>
  scenery('dead-tree', 'tree', 'pine', x, y, 1, [
    box(x + 0.44, x + 0.56, y + 0.46, y + 0.58, 0, 1.8, C.timber, C.timber),
    roof(x + 0.12, x + 0.88, y + 0.16, y + 0.86, 1.1, 2.6, 'ew', 0.36, C.deadwood),
  ]);
const rocks = (x, y) =>
  scenery('rocks', 'rock', 'hill', x, y, 1, [
    box(x + 0.1, x + 0.56, y + 0.3, y + 0.8, 0, 0.45, C.rock),
    box(x + 0.5, x + 0.86, y + 0.46, y + 0.86, 0, 0.3, C.rock),
  ]);
const abatis = (x, y) =>
  scenery('abatis', 'abatis', 'palisade', x, y, 2, [
    roof(x + 0.04, x + 1.96, y + 0.3, y + 0.8, 0, 0.8, 'ew', 0, C.timber),
  ]);

function cityObjects({ ramps = true } = {}) {
  const objects = [
    cornerTower('corner-nw', 14, 4),
    wallEW('wall-north-w', 15, 21, 4, 'north'),
    wallEW('wall-north-e', 26, 32, 4, 'north'),
    gateNorth(),
    cornerTower('corner-ne', 33, 4),
    {
      id: 'residence-hall',
      kind: 'building',
      key: 'residence',
      row: 6,
      cells: [25, 6, 28, 6],
      symbols: 'K',
      parts: [
        box(25.15, 28.85, 6.1, 6.88, 0, 1.5, C.residence, C.residence),
        roof(24.98, 29.02, 5.9, 7.06, 1.5, 2.5, 'ew', 0.32),
      ],
    },
    hall('armoury', 'building', 'barracks', 17, 22, 6, 7.3, 7, 1, 0.36, 2, 'B'),
    {
      id: 'residence-wall',
      kind: 'courtyard-wall',
      key: 'residence',
      row: 8,
      cells: [25, 7, 28, 8],
      symbols: 'K',
      parts: [
        box(25, 25.14, 7, 7.55, 0, 0.6, tint(C.residence, 0.2), C.residence),
        box(25, 25.14, 8.3, 8.86, 0, 0.6, tint(C.residence, 0.2), C.residence),
        box(28.86, 29, 7, 8.86, 0, 0.6, tint(C.residence, 0.2), C.residence),
        box(25, 29, 8.86, 9, 0, 0.6, tint(C.residence, 0.2), C.residence),
      ],
    },
    hall('granary', 'building', 'barracks', 17, 22, 7.64, 9, 8, 1, 0.36, 2, 'B'),
    wallNS('wall-west-n', 14, 5, 8, 'west'),
    wallNS('wall-east-n', 33, 5, 8, 'east'),
    gateSide('gate-west', 14),
    gateSide('gate-east', 33),
    hall('barracks-sw', 'building', 'barracks', 17, 22, 12, 14, 13, 1, 0.5, 2, 'B'),
    hall('barracks-se', 'building', 'barracks', 26, 31, 12, 14, 13, 1, 0.5, 2, 'B'),
    wallNS('wall-west-s', 14, 12, 15, 'west'),
    wallNS('wall-east-s', 33, 12, 15, 'east'),
    wallEW('wall-south-w', 15, 21, 16, 'south'),
    wallEW('wall-south-e', 26, 32, 16, 'south'),
    cornerTower('corner-sw', 14, 16),
    cornerTower('corner-se', 33, 16),
    gateSouth(),
  ];
  if (ramps) objects.push(...RAMPS.map(rampObject));
  // Siege-engine workshops, the chancellor's tent and the camp gate.
  objects.push(workshop(1, 15), workshop(2, 29), hqTent(), campGate());
  // One piece per cell for tents, palisade stakes and pines.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = LAYOUT[y][x];
      if (s === 't') objects.push(tent(x, y));
      if (s === 'P') objects.push(palisadeAt(x, y));
      if (s === 'T') objects.push(pine(x, y));
    }
  return objects;
}
// What S2-01 paints: the city with its ramps, without the camp and field pieces.
const mapObjects = () => cityObjects().filter((o) => !PIECE_KINDS.has(o.kind));

// Bridge decks (one deck per block of `=`) and the dashed line of the inner
// wall, drawn on the ground.
function groundDecals() {
  const decals = [];
  const decked = new Set();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = LAYOUT[y][x];
      if (s === '=' && !decked.has(`${x},${y}`)) {
        let x1 = x;
        while (LAYOUT[y][x1 + 1] === '=') x1++;
        let y1 = y;
        while (LAYOUT[y1 + 1]?.slice(x, x1 + 1) === '='.repeat(x1 - x + 1)) y1++;
        for (let j = y; j <= y1; j++) for (let i = x; i <= x1; i++) decked.add(`${i},${j}`);
        decals.push({
          row: y1,
          key: 'bridge',
          part: box(x, x1 + 1, y, y1 + 1, -0.2, 0, C.bridge, C.bridgeFront),
        });
      }
      if (s === 'R')
        for (const d of [0.08, 0.58])
          decals.push({
            row: y,
            key: 'works',
            part: box(x + d, x + d + 0.34, y + 0.42, y + 0.58, 0, 0, C.works, C.works, {
              outline: false,
            }),
          });
    }
  return decals;
}

// Every wall, gate, building and camp symbol must sit under an object of the
// matching kind, so a layout edit cannot silently leave cells undrawn.
function validate(objects) {
  const errors = [];
  if (LAYOUT.length !== H) errors.push(`layout has ${LAYOUT.length} rows`);
  LAYOUT.forEach((row, y) => {
    if (row.length !== W) errors.push(`row ${y} has ${row.length} cells`);
  });
  const covered = new Set();
  for (const o of objects) {
    const [x0, y0, x1, y1] = o.cells;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const s = LAYOUT[y][x];
        if (!o.symbols.includes(s)) errors.push(`${o.id} covers "${s}" at (${x}, ${y})`);
        covered.add(`${x},${y}`);
      }
  }
  LAYOUT.forEach((row, y) =>
    [...row].forEach((s, x) => {
      const needsObject = 'WOGBSCtPTM'.includes(s) || (s === 'K' && y === 6);
      if (needsObject && !covered.has(`${x},${y}`))
        errors.push(`"${s}" at (${x}, ${y}) has no object`);
    }),
  );
  return errors;
}

// ---------------------------------------------------------------------------
// Software rasteriser: supersampled colour plus per-pixel object, face, top
// height and legend key, so one pass yields the block-out, masks and grid.

const SS = 2;

function createCanvas(w, h, background) {
  const n = w * SS * h * SS;
  const rgb = new Uint8Array(n * 3);
  const bg = hexRgb(background);
  for (let i = 0; i < n; i++) rgb.set(bg, i * 3);
  return {
    w,
    h,
    W: w * SS,
    H: h * SS,
    rgb,
    obj: new Uint16Array(n),
    face: new Int32Array(n),
    top: new Float32Array(n).fill(NaN),
    key: new Uint8Array(n).fill(255),
    objects: [''],
    nextFace: 1,
  };
}

function objectIndex(canvas, id) {
  let i = canvas.objects.indexOf(id);
  if (i < 0) i = canvas.objects.push(id) - 1;
  return i;
}

// Fills a convex polygon given in final-pixel coordinates.
function fill(canvas, pts, paint) {
  const p = pts.map(([x, y]) => [x * SS, y * SS]);
  const ys = p.map(([, y]) => y);
  const top = Math.max(0, Math.ceil(Math.min(...ys) - 0.5));
  const bottom = Math.min(canvas.H - 1, Math.floor(Math.max(...ys) - 0.5));
  const rgb = hexRgb(paint.color);
  for (let py = top; py <= bottom; py++) {
    const yc = py + 0.5;
    const xs = [];
    for (let i = 0; i < p.length; i++) {
      const [ax, ay] = p[i];
      const [bx, by] = p[(i + 1) % p.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc))
        xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(canvas.W - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
      for (let px = from; px <= to; px++) {
        const i = py * canvas.W + px;
        canvas.rgb.set(rgb, i * 3);
        canvas.obj[i] = paint.obj;
        canvas.face[i] = paint.face;
        canvas.top[i] = paint.top ?? NaN;
        canvas.key[i] = paint.key;
      }
    }
  }
}

// A 1-pixel outline along the polygon's edges.
function stroke(canvas, pts, paint) {
  const rgb = hexRgb(shade(paint.color, 0.55));
  const p = pts.map(([x, y]) => [x * SS, y * SS]);
  for (let i = 0; i < p.length; i++) {
    const [ax, ay] = p[i];
    const [bx, by] = p[(i + 1) % p.length];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
    for (let s = 0; s <= steps; s++) {
      const x = ax + ((bx - ax) * s) / steps;
      const y = ay + ((by - ay) * s) / steps;
      for (let py = Math.ceil(y - SS / 2 - 0.5); py < Math.ceil(y + SS / 2 - 0.5); py++)
        for (let px = Math.ceil(x - SS / 2 - 0.5); px < Math.ceil(x + SS / 2 - 0.5); px++) {
          if (px < 0 || py < 0 || px >= canvas.W || py >= canvas.H) continue;
          const j = py * canvas.W + px;
          canvas.rgb.set(rgb, j * 3);
          if (paint.obj) canvas.obj[j] = paint.obj;
        }
    }
  }
}

function face(canvas, pts, paint, outline) {
  const p = { ...paint, face: canvas.nextFace++ };
  fill(canvas, pts, p);
  if (outline) stroke(canvas, pts, p);
}

// Plan §4.2: screen x = ox + x·cw, screen y = oy + y·cd − h·lh.
const project = (f) => (x, y, h) => [f.ox + x * f.cw, f.oy + y * f.cd - h * f.lh];

function drawPart(canvas, f, part, base) {
  const P = project(f);
  const obj = base.obj;
  const key = KEYS.indexOf(part.key ?? base.key);
  const outline = part.outline ?? true;
  if (part.type === 'box') {
    const { x0, x1, y0, y1, b, t } = part;
    face(
      canvas,
      [P(x0, y0, t), P(x1, y0, t), P(x1, y1, t), P(x0, y1, t)],
      { color: part.top, obj, key, top: t },
      outline,
    );
    if (t > b)
      face(
        canvas,
        [P(x0, y1, t), P(x1, y1, t), P(x1, y1, b), P(x0, y1, b)],
        { color: part.front, obj, key },
        outline,
      );
  } else if (part.type === 'panel') {
    const { x0, x1, y, b, t } = part;
    face(
      canvas,
      [P(x0, y, t), P(x1, y, t), P(x1, y, b), P(x0, y, b)],
      { color: part.color, obj, key },
      outline,
    );
  } else if (part.type === 'ramp') {
    // A sloped top (no grid height) and, unless the south edge is at ground
    // level, the south face under it.
    const { x0, x1, y0, y1 } = part;
    const at = (x, y) => P(x, y, rampHeight(part, x, y));
    face(
      canvas,
      [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1)],
      { color: part.top, obj, key },
      outline,
    );
    if (rampHeight(part, x0, y1) > 0 || rampHeight(part, x1, y1) > 0)
      face(
        canvas,
        [at(x0, y1), at(x1, y1), P(x1, y1, 0), P(x0, y1, 0)],
        { color: part.front, obj, key },
        outline,
      );
  } else {
    // Roof faces from back to front: north, the two sides, then south. Slopes
    // toward the south-west sun are a little lighter so the form reads.
    const { x0, x1, y0, y1, e, r, inset, color } = part;
    const north = tint(color, 0.25);
    const west = tint(color, 0.12);
    const east = shade(color, 0.15);
    const faces =
      part.ridge === 'ew'
        ? (() => {
            const ym = (y0 + y1) / 2;
            const [ra, rb] = [x0 + inset, x1 - inset];
            return [
              [[P(x0, y0, e), P(x1, y0, e), P(rb, ym, r), P(ra, ym, r)], north],
              [[P(x0, y0, e), P(ra, ym, r), P(x0, y1, e)], west],
              [[P(x1, y0, e), P(x1, y1, e), P(rb, ym, r)], east],
              [[P(ra, ym, r), P(rb, ym, r), P(x1, y1, e), P(x0, y1, e)], color],
            ];
          })()
        : (() => {
            const xm = (x0 + x1) / 2;
            const [ra, rb] = [y0 + inset, y1 - inset];
            return [
              [[P(x0, y0, e), P(x1, y0, e), P(xm, ra, r)], north],
              [[P(x0, y0, e), P(xm, ra, r), P(xm, rb, r), P(x0, y1, e)], west],
              [[P(x1, y0, e), P(x1, y1, e), P(xm, rb, r), P(xm, ra, r)], east],
              [[P(x0, y1, e), P(xm, rb, r), P(x1, y1, e)], color],
            ];
          })();
    for (const [pts, c] of faces) face(canvas, pts, { color: c, obj, key }, outline);
  }
}

function drawObject(canvas, f, o) {
  for (const part of o.parts) {
    const obj = objectIndex(canvas, part.id ?? o.id);
    drawPart(canvas, f, part, { obj, key: o.key });
  }
}

// A terrain cell is a column from level −1 up to its height. Only the south
// face can show: hill slopes above the ground, trench banks below it.
function drawTerrain(canvas, f, x, y, override) {
  const P = project(f);
  const t = override ?? terrainAt(x, y);
  const key = KEYS.indexOf(t.key);
  face(canvas, [P(x, y, t.h), P(x + 1, y, t.h), P(x + 1, y + 1, t.h), P(x, y + 1, t.h)], {
    color: t.top,
    obj: 0,
    key,
    top: t.h,
  });
  if (t.h > 0)
    face(canvas, [P(x, y + 1, t.h), P(x + 1, y + 1, t.h), P(x + 1, y + 1, 0), P(x, y + 1, 0)], {
      color: shade(t.top, 0.3),
      obj: 0,
      key,
    });
  const from = Math.min(t.h, 0);
  if (from > -1)
    face(canvas, [P(x, y + 1, from), P(x + 1, y + 1, from), P(x + 1, y + 1, -1), P(x, y + 1, -1)], {
      color: C.bank,
      obj: 0,
      key: KEYS.indexOf('trench'),
    });
}

// Painter's order (§9.1): rows north to south; in each row the ground, then
// ground decals, then objects in authored order (low before high).
function renderScene(canvas, f, objects, { flat = false, terrain = terrainAt } = {}) {
  const decals = groundDecals();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) drawTerrain(canvas, f, x, y, terrain(x, y));
    for (const d of decals.filter((d) => d.row === y))
      drawPart(canvas, f, d.part, { obj: 0, key: d.key });
    for (const o of objects.filter((o) => o.row === y)) {
      if (!flat) {
        drawObject(canvas, f, o);
        continue;
      }
      // Ground plate (S1-04): every footing becomes a flat dark foundation.
      if (o.foundation === false) continue;
      for (const part of o.parts)
        if (part.type === 'box' && part.b <= 0 && part.layer !== 'L4')
          drawPart(
            canvas,
            f,
            box(part.x0, part.x1, part.y0, part.y1, 0, 0, C.foundation, C.foundation),
            { obj: 0, key: 'foundation' },
          );
    }
  }
}

// Isolated pieces (S1-02, S1-03) on a flat background, each centred in its box.
function renderPiece(canvas, scale, objects, [bx0, by0, bx1, by1]) {
  const P = project({ ox: 0, oy: 0, ...scale });
  const pts = [];
  for (const o of objects)
    for (const p of o.parts) {
      const t = p.type === 'roof' ? p.r : p.t;
      const b = p.type === 'roof' ? p.e : p.b;
      const ys = p.type === 'panel' ? [p.y] : [p.y0, p.y1];
      for (const x of [p.x0, p.x1]) for (const y of ys) pts.push(P(x, y, t), P(x, y, b));
    }
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => y);
  const f = {
    ...scale,
    ox: Math.round((bx0 + bx1) / 2 - (Math.min(...xs) + Math.max(...xs)) / 2),
    oy: Math.round((by0 + by1) / 2 - (Math.min(...ys) + Math.max(...ys)) / 2),
  };
  for (const o of [...objects].sort((a, b) => a.row - b.row)) drawObject(canvas, f, o);
  return f;
}

// Piece sheets: [English name, Chinese name, slot [x, y, w, h], objects], one
// piece centred in each slot. Object ids must be unique across the sheet so
// each piece gets its own bbox.
const renderSheet = (canvas, scale, slots) =>
  slots.map(([name, zh, cell, objects], i) => {
    const [x, y, w, h] = cell;
    const frame = renderPiece(canvas, scale, objects, [x, y, x + w, y + h]);
    return { piece: i + 1, name, zh, cell, frame, objects };
  });

// Final-resolution outputs: averaged colour, soft masks, sampled buffers.
function resolve(canvas) {
  const { w, h, W: cw } = canvas;
  const rgb = new Uint8Array(w * h * 3);
  const masks = new Map();
  const sample = (px, py) => (py * SS + (SS >> 1)) * cw + px * SS + (SS >> 1);
  const face = new Int32Array(w * h);
  const obj = new Uint16Array(w * h);
  const top = new Float32Array(w * h);
  const key = new Uint8Array(w * h);
  const keys = new Set();
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const p = py * w + px;
      const sum = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const i = (py * SS + sy) * cw + px * SS + sx;
          for (let c = 0; c < 3; c++) sum[c] += canvas.rgb[i * 3 + c];
          const id = canvas.obj[i];
          if (id) {
            if (!masks.has(id)) masks.set(id, new Uint8Array(w * h));
            const m = masks.get(id);
            m[p] = Math.min(255, m[p] + Math.ceil(255 / (SS * SS)));
          }
          if (canvas.key[i] !== 255) keys.add(KEYS[canvas.key[i]]);
        }
      for (let c = 0; c < 3; c++) rgb[p * 3 + c] = Math.round(sum[c] / (SS * SS));
      const s = sample(px, py);
      face[p] = canvas.face[s];
      obj[p] = canvas.obj[s];
      top[p] = canvas.top[s];
      key[p] = canvas.key[s];
    }
  return { rgb, masks, face, obj, top, key, keys };
}

// Distance in pixels from each pixel to the nearest set pixel of `mask`
// (two-pass chamfer, diagonal step √2).
function distanceFrom(mask, w, h) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] ? 0 : 1e9;
  const pass = (ys, xs, dy, dx) => {
    for (const y of ys)
      for (const x of xs) {
        const i = y * w + x;
        let v = d[i];
        const py = y - dy;
        const px = x - dx;
        if (px >= 0 && px < w) v = Math.min(v, d[i - dx] + 1);
        if (py >= 0 && py < h) {
          v = Math.min(v, d[i - dy * w] + 1);
          if (x > 0) v = Math.min(v, d[i - dy * w - 1] + Math.SQRT2);
          if (x < w - 1) v = Math.min(v, d[i - dy * w + 1] + Math.SQRT2);
        }
        d[i] = v;
      }
  };
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  pass(range(h), range(w), 1, 1);
  pass(range(h).reverse(), range(w).reverse(), -1, -1);
  return d;
}

// 255 within `inside` pixels of the mask, fading to 0 over the next `width`.
function feather(mask, w, h, inside, width) {
  const d = distanceFrom(mask, w, h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++)
    out[i] = Math.max(0, Math.min(255, Math.round(255 * (1 - (d[i] - inside) / width))));
  return out;
}

// Transparent alignment overlay: dark lines are ground cells, red lines are
// the faces of solid pieces, orange lines are cells on their top faces.
function gridImage(canvas, r, f) {
  const { w, h } = canvas;
  const out = new Uint8Array(w * h * 4);
  const cell = (px, py, hgt) => [
    Math.floor((px + 0.5 - f.ox) / f.cw),
    Math.floor((py + 0.5 - f.oy + hgt * f.lh) / f.cd),
  ];
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      const p = py * w + px;
      let kind = 0;
      for (const [qx, qy] of [
        [px + 1, py],
        [px, py + 1],
      ]) {
        if (qx >= w || qy >= h) continue;
        const q = qy * w + qx;
        const solid = r.obj[p] || r.obj[q];
        if (r.face[p] !== r.face[q]) {
          if (!r.face[p] && !r.face[q]) continue;
          kind = Math.max(kind, solid ? 3 : 1);
        } else if (!Number.isNaN(r.top[p])) {
          const a = cell(px, py, r.top[p]);
          const b = cell(qx, qy, r.top[p]);
          if (a[0] !== b[0] || a[1] !== b[1]) kind = Math.max(kind, solid ? 2 : 1);
        }
      }
      if (kind)
        out.set(
          [
            [20, 20, 20, 130],
            [255, 150, 0, 190],
            [255, 40, 40, 235],
          ][kind - 1],
          p * 4,
        );
    }
  return out;
}

// ---------------------------------------------------------------------------
// PNG

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, body.length + 4);
  return out;
}
function png(width, height, channels, data) {
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++)
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = { 1: 0, 3: 2, 4: 6 }[channels];
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Pose-sheet guide (S1-05, S1-06): equal cells with a sole baseline and a
// dashed head line, on the same magenta the sheet should come back on.
function guideImage(width, height, cols, rows, figure, foot) {
  const out = new Uint8Array(width * height * 3);
  const bg = hexRgb(C.magenta);
  for (let i = 0; i < width * height; i++) out.set(bg, i * 3);
  const ink = hexRgb('#2a2622');
  const dot = (x, y) => {
    if (x >= 0 && y >= 0 && x < width && y < height) out.set(ink, (y * width + x) * 3);
  };
  const edges = (n, size) => Array.from({ length: n + 1 }, (_, i) => Math.round((i * size) / n));
  const xs = edges(cols, width);
  const ys = edges(rows, height);
  for (const x of xs) for (let y = 0; y < height; y++) for (const d of [-1, 0]) dot(x + d, y);
  for (const y of ys) for (let x = 0; x < width; x++) for (const d of [-1, 0]) dot(x, y + d);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const base = ys[r + 1] - foot;
      const head = base - figure;
      const mid = Math.round((xs[c] + xs[c + 1]) / 2);
      for (let x = xs[c] + 48; x < xs[c + 1] - 48; x++) {
        for (const d of [-1, 0, 1]) dot(x, base + d);
        if ((x - xs[c]) % 16 < 9) for (const d of [0, 1]) dot(x, head + d);
      }
      for (let y = base - 10; y <= base + 10; y++) for (const d of [-1, 0, 1]) dot(mid + d, y);
    }
  return out;
}

// ---------------------------------------------------------------------------
// Prompt segments (plan §6.4). Change a segment here and rerun to regenerate
// every prompt.

const FIDELITY =
  "The attached image is a colour-coded 3D block-out, not a style reference. Strictly preserve the position, footprint, height and outline of every block: each block's top face and front face must stay within about a quarter of a grid cell of where it is drawn. Replace the flat colours with finished materials and keep straight architecture straight. Natural features (snow drifts, ice edges, trench banks, paths) may have soft organic edges, within half a cell of where they are marked.";
const PROJECTION =
  'Camera: orthographic three-quarter top-down view, looking due north and tilted about 50 degrees down from the horizon. Strictly parallel projection: no perspective, no vanishing points, near and far objects the same size. Every vertical edge is perfectly vertical, every east-west edge perfectly horizontal, and north-south edges run straight up the image. Only top faces and south-facing front faces are visible; east and west side faces are never visible.';
const LIGHT =
  'Light: low winter sun from the lower left (south-west). Front faces catch a pale warm light, top faces carry fresh snow, and soft cool blue-grey shadows fall toward the upper right.';
// The ground plate (β) gets no painted cast shadows: walls and buildings are
// laid on top later and their shadows are drawn by code (§4.3).
const LIGHT_GROUND =
  'Light: low winter sun from the lower left (south-west); the trench banks facing the viewer catch a pale warm light. Paint no cast shadows anywhere: the walls and buildings are added later with their own shadows.';
const LIGHT_SPRITE =
  'Light: low winter sun from the lower left (south-west). Front faces catch a pale warm light and top faces carry fresh snow. Shade the object itself only; do not paint any cast shadow on the ground.';
// `scene` and `piece` go first in the prompt. S1-01 round 1 without them added
// trees and rocks and made A/B/C look alike; round 2 (v2-*) prepended `scene`.
// `piece` is the same paragraph reworded for isolated objects on magenta.
const STYLES = {
  a: {
    zh: 'A 界画淡彩',
    scene:
      "Style priority — A 界画淡彩: The entire image is a TWO-DIMENSIONAL TRADITIONAL CHINESE JIEHUA PAINTING on warm rice paper. Finely ruled, uniform slender ink contours define the architecture with quiet precise architectural draughtsmanship. Flat, pale, transparent ochre and grey watercolour washes; broad untouched paper-white snow. Show soft ink diffusion and visible subtle paper fibres throughout the image. Keep brick and roof-tile marks sparse and deliberately drawn by hand, with generous calm untextured surfaces. The result must unmistakably read as fine Chinese ink-and-light-colour architectural painting, not a realistic digital environment. No photographic material textures, physically based rendering, glossy surfaces, dense mottling or dark heavy outlines. Preserve every block's location and silhouette from the reference, and keep open snow and roads free of added trees, rocks or extra buildings.",
    piece:
      'Style priority — A 界画淡彩: Paint the object as a TWO-DIMENSIONAL TRADITIONAL CHINESE JIEHUA PAINTING. Finely ruled, uniform slender ink contours define the architecture with quiet precise architectural draughtsmanship. Flat, pale, transparent ochre and grey watercolour washes with soft ink diffusion; snow left as clean paper-white. Keep brick and roof-tile marks sparse and deliberately drawn by hand, with generous calm untextured surfaces. The result must unmistakably read as fine Chinese ink-and-light-colour architectural painting, not a realistic digital render. No photographic material textures, physically based rendering, glossy surfaces, dense mottling or dark heavy outlines.',
    text: 'Style: traditional Chinese ink-wash painting with light colour (水墨淡彩), with the precision of jiehua (界画) ruled-line architectural painting: crisp, straight, evenly weighted ink lines on walls, gate towers, timber and roof tiles; soft transparent washes on snow, earth, ice and water; subtle rice-paper grain. Restrained winter palette: warm paper-white snow, ochre rammed earth, grey brick, dark timber, slate roof tiles, muted pine green, with small accents of red lacquer.',
  },
  b: {
    zh: 'B 写意淡彩',
    scene:
      "Style priority — B 写意淡彩: The entire image is a TWO-DIMENSIONAL EXPRESSIVE CHINESE XIEYI INK-AND-WATERCOLOUR PAINTING on warm rice paper. Confident loose calligraphic brush strokes, broken dry-brush charcoal marks, broad wet-on-wet diluted ink blooms and translucent ochre washes, with abundant untouched paper-white snow. Suggest the roof tiles, bricks and timber with only a few expressive strokes rather than delineating every small part. Architectural silhouette edges and alignments stay straight and exactly follow the reference, but the interior mark-making is visibly spontaneous, soft and painterly. Make this unmistakably an expressive hand-painted ink wash, with quiet empty ground. No photographic material textures, realistic digital-game rendering, carved miniature surfaces, uniformly detailed brickwork or dense tiny marks. Preserve every block's location and silhouette from the reference, and keep open snow and roads free of added trees, rocks or extra buildings.",
    piece:
      'Style priority — B 写意淡彩: Paint the object as a TWO-DIMENSIONAL EXPRESSIVE CHINESE XIEYI INK-AND-WATERCOLOUR PAINTING. Confident loose calligraphic brush strokes, broken dry-brush charcoal marks, wet-on-wet diluted ink blooms and translucent ochre washes. Suggest the roof tiles, bricks and timber with only a few expressive strokes rather than delineating every small part. Silhouette edges and alignments stay straight and exactly follow the reference, but the interior mark-making is visibly spontaneous, soft and painterly. No photographic material textures, realistic digital-game rendering, carved miniature surfaces, uniformly detailed brickwork or dense tiny marks.',
    text: 'Style: expressive Chinese ink-wash painting with light colour (写意淡彩): confident loose brush strokes and wet-on-wet washes, architecture suggested with fewer lines but still straight and readable, generous paper-white snow, subtle rice-paper grain. Restrained winter palette: ochre earth, grey brick, dark timber, slate roofs, muted pine green.',
  },
  c: {
    zh: 'C 沙盘微缩',
    scene:
      "Style priority — C 沙盘微缩: The entire image is a HAND-BUILT MILITARY SAND-TABLE MINIATURE with tangible carved wood architecture, matte moulded clay ground, sculpted plaster snow and hand-painted grey brick markings, in restrained Chinese ink-wash colours. Clearly visible small handcrafted bevels, slightly softened carved edges, simplified miniature roof grooves, tactile chalky matte surfaces and gentle ambient occlusion at joins. It should read immediately as a physical scale model photographed through an orthographic camera, with everything equally sharp, no depth-of-field or tilt-shift blur. Keep snowy playable surfaces broad, simple and calm. No rice-paper grain, watercolour blooms, loose brushwork, photoreal life-size weathering, glossy CGI or toy-like saturated plastic. Preserve every block's location and silhouette from the reference, and keep open snow and roads free of added trees, rocks or extra buildings.",
    piece:
      'Style priority — C 沙盘微缩: The object is a HAND-BUILT MILITARY SAND-TABLE MINIATURE: tangible carved wood architecture, sculpted plaster snow and hand-painted grey brick markings, in restrained Chinese ink-wash colours. Clearly visible small handcrafted bevels, slightly softened carved edges, simplified miniature roof grooves, tactile chalky matte surfaces and gentle ambient occlusion at joins, everything equally sharp. No rice-paper grain, watercolour blooms, loose brushwork, photoreal life-size weathering, glossy CGI or toy-like saturated plastic.',
    text: 'Style: a hand-made military sand-table diorama (沙盘) finished in Chinese ink-wash colours: matte clay ground, carved wooden buildings with slightly softened edges, gentle ambient occlusion where surfaces meet, faint ink outlines. Everything stays in sharp focus; no tilt-shift blur. Restrained winter palette: paper-white snow, ochre earth, grey brick, dark timber, slate roofs.',
  },
};
// DS6 picked A; S1-01 tried all three. Switch both once you choose: the
// letter, and the S1-01 attempt that later pieces upload as style reference.
const CHOSEN_STYLE = 'a';
const CHOSEN_VIGNETTE = 'v2-a.webp';
const VIGNETTE_UPLOAD = `\`docs/siege/chencang/art/s1-01-city-vignette/attempts/${CHOSEN_VIGNETTE}\`（第二张，风格参考）`;
// The S1-02 standard piece every later piece uploads as its style reference.
const CHOSEN_GATE = 'v4.webp';
const GATE_UPLOAD = `\`docs/siege/chencang/art/s1-02-south-gate/attempts/${CHOSEN_GATE}\`（第二张，标准件）`;
const SURFACES =
  'Game readability: surfaces soldiers stand on (open ground, roads, wall walkways, gate passages) are calm, flat and light, with low texture contrast. Vertical faces are clearly darker than top faces, so every height step reads at a glance. Walls are exactly as thick as marked; the walkway on top of each wall is a clean light strip with a crenellated parapet along its outer edge. Keep detail density even across the image, with no vignette and no darkened corners.';
const SURFACES_GROUND =
  'Game readability: open ground, roads, bridges and foundations are calm, flat and light, with low texture contrast, so soldiers and wall pieces placed on top stay readable. Keep detail density even across the image, with no vignette and no darkened corners.';
const SPRITE =
  'Isolated object only, on a perfectly flat solid magenta (#FF00FF) background with no gradient, texture or ground. Nothing else in the frame. Clean edges against the background, and no magenta tint reflected onto the object.';
const EXCLUDE_SCENE =
  'Do not include: any text, letters, calligraphy, seals or signatures; grid lines; borders, frames or paper margins; legend or compass; people, soldiers, horses, flags, banners or pennants; perspective views, horizon or sky; vignette; modern objects.';
const EXCLUDE_SPRITE =
  'Do not include: any text, letters, calligraphy, seals or signatures; grid lines or guide marks; ground, scenery or cast shadows; people, soldiers, horses, flags, banners or pennants; modern objects.';
// Pose sheets need the requested soldiers; exclude only extra figures.
const EXCLUDE_UNIT_SHEET = EXCLUDE_SPRITE.replace(
  'people, soldiers, horses,',
  'additional figures, horses,',
);
const MATCH_STANDARD =
  'Match the brushwork, line weight, colours and lighting of the second attached image exactly.';
// Piece prompts open with the output canvas and pixel landmarks measured from
// the block-out. S1-02 round 1 without them drew the roof too high and left a
// magenta notch under the doors; round 2 with hand-written ones fixed both.
const spriteOutput = ([w, h], what = 'the architecture', inside = 'the building silhouettes') =>
  `Output requirements: create an image exactly ${w} by ${h} pixels. Treat the first attached block-out as the exact ${w}×${h} registration canvas. Paint only ${what}; every empty background pixel must be perfectly uniform pure magenta RGB(255,0,255), hex #FF00FF. Apply paper grain and watercolour texture only inside ${inside}, never on the magenta background. No paper sheet, paper margin, background texture, cast shadow, floor or haze.`;
const LANDMARK_RULE =
  'Match every roof height and position to these boxes rather than making towers taller or walls longer.';

function partBox(f, p) {
  const P = project(f);
  if (p.type === 'panel') return [...P(p.x0, p.y, p.t), ...P(p.x1, p.y, p.b)];
  if (p.type === 'box') return [...P(p.x0, p.y0, p.t), ...P(p.x1, p.y1, p.b)];
  if (p.type === 'ramp') {
    const ys = [p.y0, p.y1].flatMap((y) =>
      [p.x0, p.x1].map((x) => P(x, y, rampHeight(p, x, y))[1]),
    );
    return [P(p.x0, 0, 0)[0], Math.min(...ys), P(p.x1, 0, 0)[0], P(0, p.y1, 0)[1]];
  }
  const ridge = p.ridge === 'ew' ? (p.y0 + p.y1) / 2 : p.y0 + p.inset;
  const top = Math.min(P(0, p.y0, p.e)[1], P(0, ridge, p.r)[1]);
  return [P(p.x0, 0, 0)[0], top, P(p.x1, 0, 0)[0], P(0, p.y1, p.e)[1]];
}

// One line per part a painter registers against (wall body, parapet, gate
// doors, roofs); touching boxes of the same kind merge into one.
function landmarkLines(f, objects) {
  const entries = [];
  for (const o of objects) {
    const roofs = o.parts.filter((p) => p.type === 'roof').sort((a, b) => a.e - b.e);
    const tower = { 'corner-tower': 'corner tower ', 'gate-tower': 'gate tower ' }[o.kind] ?? '';
    const ns = o.run === 'ns';
    for (const p of o.parts) {
      const name =
        p.layer === 'L4'
          ? ns
            ? 'crenellated parapet along the outer side of the north-south wall'
            : 'crenellated parapet'
          : p.type === 'panel'
            ? 'closed gate doors, reaching all the way down to the wall base'
            : p.type === 'roof'
              ? `${tower}${roofs.length > 1 ? (p === roofs[0] ? 'lower ' : 'upper ') : ''}roof`
              : p.type === 'box' && p.b === 0
                ? ns
                  ? 'north-south wall, from the north end of its walkway down to the base of its south end'
                  : 'wall, from the back edge of its walkway down to its base'
                : null;
      if (name) entries.push({ name, box: partBox(f, p).map(Math.round) });
    }
  }
  // Merge left to right, then list in the order the parts were first named.
  const merged = [];
  const sorted = entries.map((e, order) => ({ ...e, order })).sort((a, b) => a.box[0] - b.box[0]);
  for (const e of sorted) {
    const m = merged.find(
      (o) =>
        o.name === e.name && o.box[1] === e.box[1] && o.box[3] === e.box[3] && e.box[0] <= o.box[2],
    );
    if (m) m.box[2] = Math.max(m.box[2], e.box[2]);
    else merged.push({ ...e, box: [...e.box] });
  }
  return merged
    .sort((a, b) => a.order - b.order)
    .map(({ name, box: [x0, y0, x1, y1] }) => `${name}: x=${x0}..${x1}, y=${y0}..${y1}`);
}

// Landmarks for non-architectural pieces (S2 sheets): the whole outline and
// the ground footprint the piece stands on.
function pieceLandmarks(f, objects) {
  const P = project(f);
  const boxes = objects.flatMap((o) => o.parts.map((p) => partBox(f, p)));
  const whole = [0, 1, 2, 3].map((k) =>
    Math.round((k < 2 ? Math.min : Math.max)(...boxes.map((b) => b[k]))),
  );
  const cells = objects.map((o) => o.cells);
  const [gx0, gy0] = P(Math.min(...cells.map((c) => c[0])), Math.min(...cells.map((c) => c[1])), 0);
  const [gx1, gy1] = P(
    Math.max(...cells.map((c) => c[2])) + 1,
    Math.max(...cells.map((c) => c[3])) + 1,
    0,
  );
  return [
    `whole piece: x=${whole[0]}..${whole[2]}, y=${whole[1]}..${whole[3]}`,
    `ground footprint, where it stands: x=${Math.round(gx0)}..${Math.round(gx1)}, y=${Math.round(gy0)}..${Math.round(gy1)}`,
  ];
}

// With a style reference attached as the second image, name the block-out as the first.
const FIDELITY_FIRST = FIDELITY.replace('The attached image', 'The first attached image');
const MATCH_VIGNETTE = MATCH_STANDARD.replace(
  'second attached image',
  'second attached image (the chosen city view)',
);

const SCENE_LEGEND = {
  snow: `pale grey-white (${C.snow}): open ground under fresh snow`,
  road: `brown (${C.road}): trampled mud-and-snow roads: the two streets that cross the city between its four gates, the approach roads, and the road along the river bank`,
  ice: `pale icy blue, one level below the ground (${C.ice}): the frozen Wei River`,
  trench: `steel blue, one level below the ground (${C.trench}), with ochre-brown earth banks (${C.bank}): the defensive trench around the walls, half-frozen dark water between steep earth banks`,
  bridge: `dark brown (${C.bridge}): plank bridges over the trench in front of the gates`,
  hill: `olive (${C.hill}): low snowy hills`,
  wall: `blue-grey top with a darker front (${C.wallTop} / ${C.wallFront}): the city wall, rammed earth faced with grey brick, three levels high; the light top is the walkway and the darker strip along its outer edge (${C.parapetTop}) is a crenellated parapet`,
  ramp: `sandy grey sloping blocks (${C.ramp}): horse ramps (马道) of brick-faced rammed earth built against the inner face of the city wall, rising from the ground to the walkway`,
  gate: `red (${C.gate}): gate passages through the wall; paint them as dark open gateways with heavy closed timber doors, never red`,
  tower: `cream walls under slate roofs (${C.tower} / ${C.roof}): timber gate towers and corner towers with snow-covered grey tile hip-and-gable roofs; the south gate tower has two storeys and is the tallest building, the others have one. The west and east gates open sideways, so their passages are hidden from this view and the road simply runs into the gate tower`,
  residence: `red-brown (${C.residence}): the commandant's residence: a main hall with a tiled roof along the north side, and a paved front courtyard inside a low wall`,
  barracks: `tan walls under slate roofs (${C.barracks} / ${C.roof}): long single-storey barracks, armoury and granary with snow-covered tiled roofs`,
  works: `short dashes on the ground (${C.works}): where an inner wall will later be built; paint only trampled ground with a few stacks of timber and baskets of earth`,
  tunnel: `very dark brown (${C.tunnel}): the timber-framed mouth of a tunnel dug into the ground`,
  pine: `dark green (${C.pine}): snowy pines`,
  palisade: `purple (${C.palisade}): a timber palisade of sharpened stakes around the camp`,
  tent: `canvas beige (${C.tent}): army tents`,
  hq: `dark red (${C.hq}): the chancellor's large command tent`,
  shed: `brown sheds (${C.shed}): open timber workshops where siege engines are built`,
  camp: `pale tan (${C.camp}): the lightly trampled snow of an army camp, flat and empty, with a few faint footpaths; the tents, fences and sheds are added later as separate pieces`,
};
const GROUND_LEGEND = {
  ...SCENE_LEGEND,
  residence: `red-brown (${C.residence}): a paved courtyard`,
  foundation: `dark grey (${C.foundation}): flat stone and rammed-earth foundations where walls and buildings will later be placed as separate pieces; paint them as bare, level foundations with no walls, no buildings and no rubble`,
};
const legendText = (legend, keys) =>
  KEYS.filter((k) => keys.has(k) && legend[k])
    .map((k) => `- ${legend[k]}`)
    .join('\n');

// ---------------------------------------------------------------------------
// Assets

const SCALE_1X = { cw: 64, cd: 48, lh: 24 };
const SCALE_2X = { cw: 128, cd: 96, lh: 48 };
// S1-01 and S1-04 frame x 12–35, y 1–21 at 100%: 24×21 cells, 16px spare below.
const VIGNETTE = { ...SCALE_1X, ox: -12 * 64, oy: -1 * 48 };
// S1-03 pieces in sheet order, as named in its landmark list.
const WALL_KIT_NAMES = [
  'a straight south wall section',
  'the south-west corner',
  'the south-east corner',
  'a west wall section',
  'an east wall section',
  'a north wall section seen from inside',
];

// S2-01 (plan §9.2): the whole 48×32 map at 100%, origin at the north-west
// corner. The 24px above the river is more ice; the renderer fades every map
// edge into paper (留白), so nothing is painted beyond the map.
const MAP_SIZE = [3072, 1536];
const FULL = { ...SCALE_1X, ox: 0, oy: 0 };
// The city body is S1-01 v2-a, whose frame sits here on the full map.
const CITY_AT = [-VIGNETTE.ox, -VIGNETTE.oy];
const TILE = [1536, 1024];
// Chosen attempt per S2-01 step (a file in s2-01-full-map/attempts/), or null
// while the step is open. tools/compose-siege-map.mjs reads them via steps.json.
const MAP_PICKS = {
  city: 'city-v3.webp',
  nw: 'nw-v1.webp',
  ne: 'ne-v2.webp',
  s: 's-v6.webp',
  sw: 'sw-v3.webp',
  se: 'se-v3.webp',
};
// Outpainting tiles, in order. `paint` is the new area in tile pixels; the rest
// of each tile is already painted by the time its turn comes (checked below).
const MAP_TILES = [
  {
    id: 'nw',
    zh: '西北块',
    at: [0, 0],
    paint: [
      [0, 0, 768, 1024],
      [768, 0, 1536, 48],
    ],
    where: 'the left half of the image and the thin strip along its top edge',
    scene:
      'the country west of the fortress: the frozen Wei River along the top edge, open snowy ground, the low snowy foothills of the Qinling along the west edge with a small snowy hollow among them where a wood will stand (its trees are added later), and a road that comes up from the south-west and turns east to the bridge at the west gate. Along the right edge of the block-out area runs the outer earth bank of the city trench, whose water is already painted on the other side',
  },
  {
    id: 'ne',
    zh: '东北块',
    at: [1536, 0],
    paint: [
      [768, 0, 1536, 1024],
      [0, 0, 768, 48],
    ],
    where: 'the right half of the image and the thin strip along its top edge',
    scene:
      "the country east of the fortress: the frozen Wei River along the top edge, the river-bank road and the road from the east gate running off east toward Chang'an, open snowy ground, and low snowy hills at the bottom right. Along the left edge of the block-out area runs the outer earth bank of the city trench, whose water is already painted on the other side",
  },
  {
    id: 's',
    zh: '南块',
    at: [768, 512],
    paint: [[0, 560, 1536, 1024]],
    where: 'the bottom part of the image, below y=560',
    scene:
      // Round 1 (2026-11-02) moved the cross road to the camp edge on all three
      // candidates, so the scene now names where each feature lies.
      'the ground south of the fortress where the Shu-Han army is encamped: the main road from the south running straight up to the south gate (x=704..832); a cross road that comes in from the left edge and joins the main road from the west only, along y=544..592, and does not continue east of the main road; the trampled yards of two siege workshops (x=192..448 and x=1088..1344, y=592..688); and, below y=784, the trampled ground of the camp, which meets the snow directly, with no road along its edge; the camp is still empty because its tents, fences and sheds are added later',
  },
  {
    id: 'sw',
    zh: '西南块',
    at: [0, 512],
    paint: [[0, 512, 768, 1024]],
    where: 'the bottom-left quarter of the image',
    scene:
      // Positions named after the s tile's round 1 moved its cross road.
      'the south-west of the battlefield: open snowy ground; the road that comes down from the west gate along x=448..512 and, at y=544..592, turns east and runs to the right edge as the cross road (it does not continue south or west); low snowy hills in the bottom-left corner (x=0..448, below y=760); and, along the right edge below y=784 (x=704..768), the western edge of the empty camp ground',
  },
  {
    id: 'se',
    zh: '东南块',
    at: [1536, 512],
    paint: [[768, 512, 1536, 1024]],
    where: 'the bottom-right quarter of the image',
    scene:
      'the south-east of the battlefield: open snowy ground, no roads; the eastern edge of the empty camp ground, running straight down at x=832 below y=784; and plain snow where a small wood will stand (its trees are added later)',
  },
];
// Blend widths: a tile fades into the painted side over 48px; the ramp patch
// reaches 12px past each ramp, then fades over 10px.
const TILE_FEATHER = 48;
const RAMP_MARGIN = [12, 10];

const EDIT_KEEP =
  'Keep the finished area exactly as it is: do not move, redraw, recolour, sharpen or blur it, and keep the output aligned pixel for pixel with the input, at exactly the same size.';
const FIDELITY_AREA = FIDELITY.replace(
  'The attached image is a colour-coded 3D block-out',
  'The block-out area is a colour-coded 3D block-out',
);
const SURFACES_MAP =
  'Game readability: open ground, roads and camp ground are calm, flat and light, with low texture contrast, so soldiers, tents and trees placed on top later stay readable. The fronts of hills and trench banks are clearly darker than the ground. Keep the density of detail of the finished area, with no vignette and no darkened corners.';
const EXCLUDE_MAP = EXCLUDE_SCENE.replace(
  'flags, banners or pennants;',
  'flags, banners or pennants; tents, fences, sheds, siege engines, trees or rocks, which are added later as separate pieces;',
);
const SETTING_MAP =
  'Setting: the siege of Chencang, a small Wei frontier fortress in the Wei River valley, winter of 228 AD. A clear, cold winter day.';
const rects = (list) =>
  list.map(([x0, y0, x1, y1]) => `x=${x0}..${x1}, y=${y0}..${y1}`).join(' and ');

const tilePrompt = (t, keys) =>
  [
    'Edit task: extend a finished painting over the rest of the frame (outpainting). The attached image is the edit target, exactly 1536×1024, and the output must be exactly 1536×1024 too.',
    `Part of it is already finished: a traditional Chinese jiehua ink-and-light-colour painting of a battlefield map. The rest, ${t.where} (${rects(t.paint)}), is still a flat colour-coded block-out. Repaint only the block-out area, as a seamless continuation of the finished painting, as if the whole image had been painted at once by the same hand: the same brushwork, line weight, paper grain, colours, light and density of detail. Roads, banks, hills and snow that cross into the block-out area continue without a seam or a change of tone. ${EDIT_KEEP}`,
    STYLES[CHOSEN_STYLE].scene,
    FIDELITY_AREA,
    PROJECTION,
    `Subject of the block-out area: ${t.scene}. In the block-out, one grid cell is 64 pixels wide and 48 pixels deep, and one height level is 24 pixels.`,
    `Block-out legend (each colour means exactly this):\n${legendText(SCENE_LEGEND, keys)}`,
    SETTING_MAP,
    LIGHT,
    STYLES[CHOSEN_STYLE].text,
    SURFACES_MAP,
    EXCLUDE_MAP,
  ].join('\n\n');

const DIRECTION = { n: 'north', s: 'south', e: 'east', w: 'west' };
const OPPOSITE = { n: 'south', s: 'north', e: 'west', w: 'east' };
function rampLine([id, , , , , rise], [x0, y0, x1, y1]) {
  const [, wall, side] = id.split('-');
  const ns = rise === 'n' || rise === 's';
  return `against the ${wall} wall, ${DIRECTION[side]} of its gate${ns ? ', running north-south' : ''}: low at its ${OPPOSITE[rise]} end beside the gate road, reaching the walkway at its ${DIRECTION[rise]} end${rise === 's' ? ', where its south end face shows' : ''}: x=${x0}..${x1}, y=${y0}..${y1}`;
}
const rampPrompt = () =>
  [
    'Edit task: add eight horse ramps to a finished painting. The attached image is the edit target, exactly 1536×1024, and the output must be exactly 1536×1024 too.',
    `It is the finished painting of the walled city of Chencang, a traditional Chinese jiehua ink-and-light-colour painting. Eight flat sandy-grey shapes (${C.ramp}, some with a darker front) have been pasted onto it inside the walls; each marks a horse ramp (马道) to paint in. A horse ramp is a sloping ramp of rammed earth faced with grey brick, built against the inner face of the city wall, rising from the ground inside the city to the walkway on top of the wall, with a smooth paved slope (no steps) and a low plain kerb along its open side. Where a ramp reaches the walkway, open the walkway's inner kerb so the two join.`,
    [
      'Ramp positions on this canvas (pixel boxes measured from the block-out):',
      ...RAMPS.map(
        (r) => `- ${rampLine(r, partBox(VIGNETTE, rampObject(r).parts[0]).map(Math.round))}`,
      ),
      'Paint each ramp inside its box and no larger.',
    ].join('\n'),
    `Repaint only the eight marked shapes and the few pixels around them needed to blend them in. ${EDIT_KEEP.replace('the finished area', 'everything else')}`,
    'Paint the ramps with exactly the brushwork, line weight, colours and light of the walls around them.',
    PROJECTION,
    LIGHT,
    STYLES[CHOSEN_STYLE].text,
    EXCLUDE_SCENE,
  ].join('\n\n');

// The S2-01 steps: the ramp patch on the city body, then the tiles. Each step
// has a hard `paint` mask (what ImageGen repaints: the input shows block-out
// there) and a soft `blend` mask (how much of its result goes into the map).
function mapSteps(canvas, r) {
  const [W, Hm] = MAP_SIZE;
  const [w, h] = TILE;
  const city = new Uint8Array(w * h);
  for (const [id] of RAMPS) {
    const mask = r.masks.get(canvas.objects.indexOf(id));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (mask[(y + CITY_AT[1]) * W + x + CITY_AT[0]]) city[y * w + x] = 255;
  }
  const steps = [
    {
      id: 'city',
      zh: '马道补画',
      at: CITY_AT,
      paint: city,
      blend: feather(city, w, h, ...RAMP_MARGIN),
    },
  ];
  // Every tile must paint only new pixels and find the rest already painted.
  const done = new Uint8Array(W * Hm);
  const mark = ([x0, y0, x1, y1], value) => {
    for (let y = y0; y < y1; y++) done.fill(value, y * W + x0, y * W + x1);
  };
  mark([CITY_AT[0], CITY_AT[1], CITY_AT[0] + w, CITY_AT[1] + h], 1);
  for (const t of MAP_TILES) {
    const paint = new Uint8Array(w * h);
    for (const [x0, y0, x1, y1] of t.paint)
      for (let y = y0; y < y1; y++) paint.fill(255, y * w + x0, y * w + x1);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const painted = done[(y + t.at[1]) * W + x + t.at[0]];
        if (painted === (paint[y * w + x] ? 1 : 0))
          throw new Error(
            `S2-01 tile ${t.id}: pixel (${x}, ${y}) is ${painted ? 'painted twice' : 'never painted'}`,
          );
      }
    for (const [x0, y0, x1, y1] of t.paint)
      mark([x0 + t.at[0], y0 + t.at[1], x1 + t.at[0], y1 + t.at[1]], 1);
    steps.push({ ...t, paint, blend: feather(paint, w, h, 0, TILE_FEATHER) });
  }
  if (done.includes(0)) throw new Error('S2-01: the tiles leave part of the map unpainted');
  return steps;
}

// Piece sheets of the camp and the field (S2-08 to S2-11).
const EXCLUDE_PIECES = EXCLUDE_SPRITE.replace(
  'ground, scenery or cast shadows;',
  'ground, snowfield, cast shadows or anything besides the requested pieces;',
);
const sheetAsset = ({ id, zh, stage = 'S2', final, about, slots, subject, checks }) => ({
  id,
  stage,
  zh,
  final,
  size: [1536, 1024],
  about,
  render() {
    const canvas = createCanvas(1536, 1024, C.magenta);
    const pieces = renderSheet(canvas, SCALE_2X, slots());
    return { canvas, frame: pieces[0].frame, pieces };
  },
  prompts: (keys, { pieces }) => [
    {
      text: [
        spriteOutput([1536, 1024], 'the requested pieces', 'their silhouettes'),
        [
          'Registration landmarks on this canvas (pixel boxes measured from the block-out):',
          ...pieces.flatMap((p) => [
            `Piece ${p.piece}, ${p.name}:`,
            ...pieceLandmarks(p.frame, p.objects).map((line) => `- ${line}`),
          ]),
          'Keep each piece inside its whole-piece box and stand it on its ground footprint; match heights to the block-out rather than making anything taller.',
        ].join('\n'),
        MATCH_STANDARD,
        STYLES[CHOSEN_STYLE].piece,
        FIDELITY_FIRST,
        PROJECTION,
        `${subject}\nIn the block-out, one grid cell is 128 pixels wide and 96 pixels deep, and one height level is 48 pixels.`,
        SPRITE,
        LIGHT_SPRITE,
        STYLES[CHOSEN_STYLE].text,
        EXCLUDE_PIECES,
      ].join('\n\n'),
    },
  ],
  uploads: ['`blockout.png`', GATE_UPLOAD],
  checks: [
    '和 S1-02 标准件、S1-01 v2-a 是不是同一套笔法、颜色和光照。',
    '每件都在自己的框里，底边落在灰盒的地面框上；背景纯品红，没有地面、雪地和落地影子。',
    ...checks,
    '把图缩到一半（游戏 100% 的大小）看：放在 S1-01 的雪地上不突兀。',
  ],
  naming: '依次命名 `v1.webp`、`v2.webp`……',
});

const sceneChecks = [
  '100% 缩放下，城墙顶走道、城门、堑和桥是否一眼能认出。',
  '有没有透视、有没有画出建筑的东西侧面（都不该有），竖直棱线是否竖直。',
  '把 `grid.png` 叠在出图上：墙、门楼、营房的顶面与灰盒误差不超过 1/4 格（横 16px、纵 12px）。',
  '灰盒里的红色门洞、蓝灰墙体有没有被照搬成颜色。',
];

// ---------------------------------------------------------------------------
// S3 state variants (MVP plan §8.2, art plan §9.2): local repaints of the
// approved S2-01 map. Each state is one ImageGen edit of a 1536×1024 crop of
// s2-01-full-map/composite.webp. Per state the builder writes
// `steps/<state>-paint.png` (what may change), `steps/<state>-blend.png` (how
// much of the result goes into the patch) and, for new geometry,
// `steps/<state>-overlay.png` (block-out pixels pasted onto the crop).
// `job.json` lists them for tools/compose-siege-states.mjs, which writes the
// edit input `inputs/<state>.png` and, for each chosen state, the patch
// `patches/<state>.png` with its place on the map.
const STATE_PICKS = {
  'trench-half': 'trench-half-v1.webp',
  'trench-filled': 'trench-filled-v3.webp',
  'gate-south-damaged': 'gate-south-damaged-v2.webp',
  'gate-south-broken': 'gate-south-broken-v2.webp',
  'gate-north-broken': 'gate-north-broken-v2.webp',
  'gate-west-broken': 'gate-west-broken-v2.webp',
  'gate-east-broken': 'gate-east-broken-v2.webp',
  'inner-wall-works': 'inner-wall-works-v1.webp',
  'inner-wall-built': 'inner-wall-built-v1.webp',
};
const CROP_SOUTH = [768, 512];
const CROP_NORTH = [768, 0];
const STATE_MARGIN = { gate: [6, 12], trench: [4, 12], wall: [8, 12] };
// The inner wall (MVP plan §4.8): four runs on row 14, gaps at x 16, 23–24, 31.
const INNER_WALL_RUNS = [
  [15, 16],
  [17, 23],
  [25, 31],
  [32, 33],
];
const innerWall = (built) =>
  INNER_WALL_RUNS.map(([x0, x1], i) => ({
    id: `inner-wall-${i + 1}`,
    kind: 'inner-wall',
    key: 'works',
    row: 14,
    cells: [x0, 14, x1 - 1, 14],
    symbols: 'R',
    parts: [
      box(
        x0,
        x1,
        14.2,
        14.8,
        0,
        built ? 2 : 1,
        built ? '#c9b48c' : '#bfa97f',
        built ? '#8f7a58' : '#86714f',
      ),
    ],
  }));
// The south trench (MVP plan §4.6): rows 17–18, x 12–35, minus the bridge.
const TRENCH_ROWS = [17, 18];
const TRENCH_X = [12, 36];
const BRIDGE_X = [23, 25];

const cropFrame = ([cx, cy]) => ({ ...SCALE_1X, ox: -cx, oy: -cy });
const toCrop = ([cx, cy], [x0, y0, x1, y1]) => [x0 - cx, y0 - cy, x1 - cx, y1 - cy];
function objectMask(canvas, r, ids) {
  const [w, h] = TILE;
  const out = new Uint8Array(w * h);
  for (const id of ids) {
    const m = r.masks.get(canvas.objects.indexOf(id));
    if (!m) throw new Error(`S3: no mask for ${id}`);
    for (let i = 0; i < out.length; i++) if (m[i] > 127) out[i] = 255;
  }
  return out;
}
function rectMask(list) {
  const [w, h] = TILE;
  const out = new Uint8Array(w * h);
  for (const [x0, y0, x1, y1] of list)
    for (let y = Math.max(0, y0); y < Math.min(h, y1); y++)
      out.fill(255, y * w + Math.max(0, x0), y * w + Math.min(w, x1));
  return out;
}
const grow = (mask, px) => {
  const [w, h] = TILE;
  return feather(mask, w, h, px, 1).map((v) => (v > 127 ? 255 : 0));
};
const maskBox = (mask) => {
  const [w, h] = TILE;
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
  return [x0, y0, x1, y1];
};
const boxText = ([x0, y0, x1, y1]) => `x=${x0}..${x1}, y=${y0}..${y1}`;
const trenchRects = (crop) => {
  // Floor of a level −1 cell plus the north bank face above it.
  const y0 = TRENCH_ROWS[0] * 48;
  const y1 = (TRENCH_ROWS.at(-1) + 1) * 48 + 24;
  return [
    toCrop(crop, [TRENCH_X[0] * 64, y0, BRIDGE_X[0] * 64, y1]),
    toCrop(crop, [BRIDGE_X[1] * 64, y0, TRENCH_X[1] * 64, y1]),
  ];
};

const statePrompt = ({ what, overlay, change, positions, region }) =>
  [
    `Edit task: change one part of a finished painting to show ${what}. The attached image is the edit target, exactly 1536×1024, and the output must be exactly 1536×1024 too.`,
    `It is part of a finished battlefield map of the walled city of Chencang, a traditional Chinese jiehua ink-and-light-colour painting.${overlay ? ` ${overlay}` : ''}`,
    change,
    ['Positions on this canvas (pixel boxes measured from the block-out):', ...positions].join(
      '\n',
    ),
    `Repaint only ${region} and the few pixels around it needed to blend it in. ${EDIT_KEEP.replace('the finished area', 'everything else')}`,
    'Paint the change with exactly the brushwork, line weight, colours and light of the painting around it, as if the same hand had painted it from the start.',
    PROJECTION,
    LIGHT,
    STYLES[CHOSEN_STYLE].text,
    EXCLUDE_SCENE,
  ].join('\n\n');

// What a broken gate looks like from this camera: the south gate shows its
// doors; the north gate is seen from inside; the side gates' doors face east
// and west, which the camera never sees, so they break through debris.
const BROKEN_GATE = {
  south:
    'The south gate has been broken through by a battering ram. The heavy iron-studded doors are smashed in: one hangs askew from its upper hinge, the other has fallen inward, both split into jagged planks. The gate passage is now open and dark, with splintered timber, iron straps and broken brick across the threshold and spilling onto the bridge end. Soot streaks rise from the gateway over the brick face, and a few roof tiles are missing from the lower eaves of the gate tower. The gate tower and the wall still stand.',
  north:
    'The north gate has been broken through, seen from inside the city: inside the dark gate passage the doors at its far end are smashed and hanging open, splintered timber and broken brick lie across the passage mouth and the street just inside it, soot streaks rise over the brick face above the passage, and a few roof tiles are missing from the tower eaves. The gate tower and the wall still stand.',
  side: (side) =>
    `The ${side} gate has been broken through. Its doors face ${side} and cannot be seen from this camera, so show the break by what spills out of the gate passage: splintered door planks, iron straps and broken brick strewn across the road and the bridge where they meet the gate, trampled mud, soot streaks on the gate tower's south face, and a few roof tiles knocked off its eaves. The gate tower and the wall still stand.`,
};

function stateAsset({ id, zh, crop, about, states, checks }) {
  const renderState = (s) => {
    const canvas = createCanvas(...TILE, C.ice);
    const extra = s.objects ?? [];
    const ids = new Set(extra.map((o) => o.id));
    const objects = [...mapObjects().filter((o) => !ids.has(o.id)), ...extra];
    const frame = cropFrame(crop);
    renderScene(canvas, frame, objects, { terrain: mapTerrain });
    const focus = new Set([...(s.focus ?? []), ...ids]);
    return { canvas, frame, r: resolve(canvas), objects: objects.filter((o) => focus.has(o.id)) };
  };
  const picked = states.filter((s) => STATE_PICKS[s.id]);
  return {
    id,
    stage: 'S3',
    zh,
    size: TILE,
    final: picked.length ? picked.map((s) => STATE_PICKS[s.id]).join('`、`') : undefined,
    about: [
      ...about,
      ...(picked.length
        ? [
            `**2026-11-02 选定**（待你确认）：${picked.map((s) => `${s.zh} \`${STATE_PICKS[s.id]}\``).join('，')}。补丁在 \`patches/\`（\`<态>.json\` 记它在全图上的位置），贴回全图的前后对比在 \`previews/\`；每张的提示词、源文件和选择理由记在 \`generation-manifest.json\`。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh）。`,
          ]
        : []),
    ],
    // blockout.png and footprints.json show the last state (for the inner
    // wall: built, whose outline is the cut-out mask); each state with its
    // own geometry is rendered again for its masks and overlay.
    render() {
      return renderState(states.at(-1));
    },
    async write(dir) {
      const [w, h] = TILE;
      await mkdir(join(dir, 'steps'), { recursive: true });
      const job = { canvas: TILE, crop, map: '../s2-01-full-map/composite.webp', states: [] };
      for (const s of states) {
        const { canvas, r } = renderState(s);
        const area = s.area(canvas, r);
        const paint = grow(area, s.margin[0]);
        const blend = feather(area, w, h, s.margin[0], s.margin[1]);
        await writeFile(join(dir, 'steps', `${s.id}-paint.png`), png(w, h, 1, paint));
        await writeFile(join(dir, 'steps', `${s.id}-blend.png`), png(w, h, 1, blend));
        let overlay = null;
        if (s.objects) {
          const keep = new Set(s.objects.map((o) => canvas.objects.indexOf(o.id)));
          const rgba = new Uint8Array(w * h * 4);
          for (let i = 0; i < w * h; i++)
            if (keep.has(r.obj[i]))
              rgba.set([r.rgb[i * 3], r.rgb[i * 3 + 1], r.rgb[i * 3 + 2], 255], i * 4);
          overlay = `steps/${s.id}-overlay.png`;
          await writeFile(join(dir, overlay), png(w, h, 4, rgba));
          // New geometry also gets its exact outline, so the game can cut it
          // out as a layer that hides units behind it (map coordinates below).
          await writeFile(join(dir, 'steps', `${s.id}-mask.png`), png(w, h, 1, area));
        }
        job.states.push({
          id: s.id,
          name: s.zh,
          paint: `steps/${s.id}-paint.png`,
          blend: `steps/${s.id}-blend.png`,
          overlay,
          input: `inputs/${s.id}.png`,
          chosen: STATE_PICKS[s.id] ? `attempts/${STATE_PICKS[s.id]}` : null,
          patch: `patches/${s.id}.png`,
          ...(s.cells ? { cells: s.cells } : {}),
          ...(s.objects
            ? {
                mask: `steps/${s.id}-mask.png`,
                object: {
                  id: s.id,
                  kind: 'inner-wall',
                  cells: [
                    Math.min(...s.objects.map((o) => o.cells[0])),
                    Math.min(...s.objects.map((o) => o.cells[1])),
                    Math.max(...s.objects.map((o) => o.cells[2])),
                    Math.max(...s.objects.map((o) => o.cells[3])),
                  ],
                  height: Math.max(...s.objects.flatMap((o) => o.parts.map((part) => part.t))),
                  bbox: (([x0, y0, x1, y1]) => [
                    x0 + crop[0],
                    y0 + crop[1],
                    x1 + crop[0],
                    y1 + crop[1],
                  ])(maskBox(area)),
                },
              }
            : {}),
        });
      }
      await writeFile(join(dir, 'job.json'), await pretty(JSON.stringify(job), 'json'));
    },
    prompts: () =>
      states.map((s) => ({
        title: `${s.zh}（${s.id}）`,
        note: `上传 \`inputs/${s.id}.png\`（先跑 \`node tools/compose-siege-states.mjs\` 生成）${s.objects ? '：画面上贴了这一态的灰盒' : ''}。出图存为 \`attempts/${s.id}-v1.webp\`……`,
        text: (({ canvas, r }) => s.prompt(maskBox(s.area(canvas, r))))(renderState(s)),
      })),
    uploads: [
      '每一态只上传一张：`inputs/<态>.png`（编辑对象，由 `node tools/compose-siege-states.mjs` 从 S2-01 定稿全图裁出）。工具支持蒙版编辑时，可以同时给 `steps/<态>-paint.png`。',
    ],
    checks: [
      ...checks,
      '只有标出的地方变了；compose 报的偏移应在 ±4px 以内、差值和 S2-01 各步相近，补丁 `patches/<态>.png` 贴回全图后（`previews/<态>.webp`）看不出边。',
    ],
    naming:
      '每态分开编号：`<态>-v1.webp`、`<态>-v2.webp`……，保持 1536×1024 原尺寸，不缩放、不裁切。',
  };
}

const STATE_ASSETS = [
  stateAsset({
    id: 's3-01-trench-fill',
    zh: 'S3-01 城堑填堑',
    crop: CROP_SOUTH,
    about: [
      '南墙外的城堑两行（y 17–18，x 12–35，桥下 x 23–24 不动），画两态：半填、填平。规则见 MVP 计划 §4.6：外侧一行先填平，内侧一行才能填。',
      '定 α 后不再出单格贴片：整条城堑各画一张半填、一张填平，游戏按格从里面切（`job.json` 的 `cells` 给出每格的像素框），一格一格换状态，所以三种花样从整条里自然得来。',
      '裁取全图 (768, 512) 起的 1536×1024，和 S2-01 南块同一块。',
    ],
    states: ['half', 'filled'].map((k) => ({
      id: `trench-${k}`,
      zh: k === 'half' ? '半填' : '填平',
      margin: STATE_MARGIN.trench,
      area: () => rectMask(trenchRects(CROP_SOUTH)),
      cells: TRENCH_ROWS.flatMap((y) =>
        Array.from({ length: TRENCH_X[1] - TRENCH_X[0] }, (_, i) => TRENCH_X[0] + i)
          .filter((x) => x < BRIDGE_X[0] || x >= BRIDGE_X[1])
          .map((x) => ({ cell: [x, y], box: [x * 64, y * 48, x * 64 + 64, y * 48 + 72] })),
      ),
      prompt: () =>
        statePrompt({
          what: k === 'half' ? 'the city trench half filled in' : 'the city trench filled level',
          change:
            k === 'half'
              ? 'The attackers have begun to fill the trench along the south wall, on both sides of the gate bridge. Loose earth, rubble and bundles of brushwood have been tipped in from the outer (south) bank and form uneven mounds that cover about half of the trench, mostly along its south side; broken ice and dark water still show between the mounds, mostly along the wall side. Fresh earth is trodden into the snow along the outer bank. The bridge, the wall and the bank on the wall side stay as they are.'
              : 'The attackers have filled the trench along the south wall, on both sides of the gate bridge, level with the ground: packed earth, rubble and brushwood trampled flat, muddy and trodden into the snow, so that it reads as a rough causeway along the foot of the wall. Only a faint dip and a few stones of the old bank edges remain; no water or ice shows. The bridge and the wall stay as they are.',
          positions: [
            `- the trench west of the bridge: ${boxText(trenchRects(CROP_SOUTH)[0])}`,
            `- the trench east of the bridge: ${boxText(trenchRects(CROP_SOUTH)[1])}`,
            `- the gate bridge, which stays unchanged: ${boxText(toCrop(CROP_SOUTH, [BRIDGE_X[0] * 64, 816, BRIDGE_X[1] * 64, 936]))}`,
          ],
          region: 'the trench inside these two boxes',
        }),
    })),
    checks: [
      '半填：土堆从外岸（南）往里堆，盖住约一半，靠墙一侧还见冰和水；填平：和地面齐平，看不到水和冰，像一条土道。',
      '桥、城墙、墙脚不变；城堑以外的雪地、路不变。',
      '按格切出来拼（外侧一行填平、内侧一行完好）时，两行之间的过渡说得过去。',
    ],
  }),
  ...[
    ['s3-02-gate-south-damaged', 'S3-02 南门受损', 'south', 'damaged'],
    ['s3-03-gate-south-broken', 'S3-03 南门门破', 'south', 'broken'],
    ['s3-04-gate-north-broken', 'S3-04 北门门破', 'north', 'broken'],
    ['s3-05-gate-west-broken', 'S3-05 西门门破', 'west', 'broken'],
    ['s3-06-gate-east-broken', 'S3-06 东门门破', 'east', 'broken'],
  ].map(([id, zh, side, state]) => {
    const gate = `gate-${side}`;
    const crop = side === 'south' ? CROP_SOUTH : CROP_NORTH;
    const ids = side === 'south' ? [gate, 'gate-south-parapet'] : [gate];
    return stateAsset({
      id,
      zh,
      crop,
      about: [
        `${{ south: '南', north: '北', west: '西', east: '东' }[side]}门${state === 'damaged' ? '受损：门还关着，被冲车撞得开裂，门楼掉了几片瓦。耐久过半时换这一态（MVP 计划 §4.5）' : '门破：门洞变成双方都能进的格（MVP 计划 §4.5）'}。补丁只取门楼蒙版${side === 'south' ? '（连女墙前沿）' : ''}外扩 6px、再渐变 12px 的一圈。`,
        side === 'west' || side === 'east'
          ? '东西门的门扇朝东西，这个机位看不到，所以门破靠门洞两头散出来的碎门板、铁件和碎砖、门楼南面的烟痕来表现。'
          : side === 'north'
            ? '北门是从城内看：门扇在门洞北头，画成门洞里门扇破开、门洞口一地碎木。'
            : '南门正对镜头，门扇看得清。',
        `裁取全图 (${crop.join(', ')}) 起的 1536×1024。`,
      ],
      states: [
        {
          id: `${gate}-${state}`,
          zh: state === 'damaged' ? '受损' : '门破',
          margin: STATE_MARGIN.gate,
          focus: [gate],
          area: (canvas, r) => objectMask(canvas, r, ids),
          prompt: (b) =>
            statePrompt({
              what: state === 'damaged' ? `the ${side} gate battered` : `the ${side} gate broken`,
              change:
                state === 'damaged'
                  ? 'The south gate has been battered by a ram but still holds. The iron-studded doors stay closed, but their planks are split and gouged, several iron straps are bent and torn loose, and a dark bruised scar marks where the ram struck; splinters and a few fallen bricks lie on the threshold. A few roof tiles are knocked off the lower eaves of the gate tower, and faint scorch marks stain the brick around the gateway. The gate tower and the wall still stand.'
                  : side === 'south' || side === 'north'
                    ? BROKEN_GATE[side]
                    : BROKEN_GATE.side(side),
              positions: [`- the ${side} gate with its tower: ${boxText(b)}`],
              region: `the ${side} gate inside this box`,
            }),
        },
      ],
      checks: [
        state === 'damaged'
          ? '门还关着、看得出被撞过；门楼大体完好。'
          : '门洞看得出已经打开、能走人；门楼和城墙还在，没有塌。',
        '只改了这座门：两边的墙段、别的门楼、路和桥不变。',
      ],
    });
  }),
  stateAsset({
    id: 's3-07-inner-wall',
    zh: 'S3-07/08 重墙（施工中、建成）',
    crop: CROP_SOUTH,
    about: [
      '重墙在 y 14，分四段：x 15、x 17–22、x 25–30、x 32；缺口在 x 16、x 23–24（路口）、x 31（MVP 计划 §4.8）。两态各是一次编辑：施工中（灰盒 1 层高）、建成（灰盒 2 层高，比城墙矮一层，顶上能站人）。',
      '输入图上按这一态的高度贴了重墙灰盒；补丁取灰盒蒙版外扩 8px、再渐变 12px。建成的墙在 y 14 那一行，挡住南营房的墙脚，排序时和城墙同一层（L3）。',
      '`steps/inner-wall-*-overlay.png` 就是贴上去的灰盒；切层蒙版按建成态的灰盒（`footprints.json`）。',
      '裁取全图 (768, 512) 起的 1536×1024。',
    ],
    states: [
      {
        id: 'inner-wall-works',
        zh: '施工中（S3-07）',
        margin: STATE_MARGIN.wall,
        objects: innerWall(false),
        area: (canvas, r) =>
          objectMask(
            canvas,
            r,
            INNER_WALL_RUNS.map((_, i) => `inner-wall-${i + 1}`),
          ),
        prompt: (b) =>
          statePrompt({
            what: 'an inner wall being built',
            overlay: `Four flat sandy shapes (a pale top and a darker front) have been pasted onto it across the city, between the southern barracks and the south wall; each marks one run of a new inner wall that the defenders are building in haste overnight. Paint over the four shapes; they are the block-out, not part of the painting.`,
            change:
              'Paint each run as rammed earth (夯土) half raised: a long low body of fresh tamped yellow-brown earth exactly filling the marked shape, held between timber shuttering boards lashed to upright poles and cross-ties; the poles stand about twice as high as the earth. Along the runs lie baskets of earth, wooden rammers, a ladder and loose planks, and fresh earth is spilled and trodden into the snow around them. The four runs stay separate, with the gaps between them clear (the street to the south gate passes through the middle gap).',
            positions: [`- the four runs of the inner wall, all inside: ${boxText(b)}`],
            region: 'the four marked shapes',
          }),
      },
      {
        id: 'inner-wall-built',
        zh: '建成（S3-08）',
        margin: STATE_MARGIN.wall,
        objects: innerWall(true),
        area: (canvas, r) =>
          objectMask(
            canvas,
            r,
            INNER_WALL_RUNS.map((_, i) => `inner-wall-${i + 1}`),
          ),
        prompt: (b) =>
          statePrompt({
            what: 'a finished inner wall',
            overlay: `Four flat sandy shapes (a pale top and a darker front) have been pasted onto it across the city, between the southern barracks and the south wall; each marks one run of a new inner wall (重墙) that the defenders built in haste. Paint over the four shapes; they are the block-out, not part of the painting.`,
            change:
              'Paint each run as a finished rammed-earth wall exactly filling its marked shape: smooth tamped yellow-brown earth with faint horizontal layer lines left by the shuttering, lower than the city wall, with a narrow flat walkway on top under fresh snow and a low crenellated earth parapet along its south (front) edge only. It is plainer and rougher than the brick-faced city wall, clearly new work. The four runs stay separate, with the gaps between them clear (the street to the south gate passes through the middle gap).',
            positions: [`- the four runs of the inner wall, all inside: ${boxText(b)}`],
            region: 'the four marked shapes',
          }),
      },
    ],
    checks: [
      '四段都在灰盒的位置上，缺口留着；建成的墙比城墙矮、顶上有走道和朝南的矮垛口。',
      '施工中看得出是夯土版筑：木板夹着半截土墙、立杆、土筐。',
      '南营房和城墙不变。',
    ],
  }),
];

// ---------------------------------------------------------------------------
// S4 siege engines and countermeasures (MVP plan §4.7, §4.8, §8.2): piece
// sheets like S2-08 to S2-11, magenta, 2× scale, S1-02 as the standard. Each
// factory takes a unique id and a cell (x, y) on an empty part of the map; the
// sheet centres every piece in its slot, so only sizes and heights matter.
// Burning states are painted charred and smouldering; the game adds flames and
// smoke (S6-01, MVP plan §8.3).
const WOOD = '#9a7650';
const WOOD_DARK = '#6e5438';
const HIDE = '#8c7a5c';
const CHAR = '#4a4036';
const EARTH = '#a88d62';
const STONE = '#9c9a94';
const engine = (id, kind, x, y, cells, parts) => ({
  id,
  kind,
  key: 'shed',
  row: cells[3],
  cells,
  symbols: 'E',
  parts,
});
const slope = (x0, x1, y0, y1, t, rise, top = WOOD, front = WOOD_DARK) => ({
  ...ramp(x0, x1, y0, y1, t, rise),
  top,
  front,
});
// 云梯车: a wheeled chassis with a triangular ladder truss rising to 2.5 levels.
const ladderCart = (id, x, y, side = false, burnt = false) =>
  side
    ? engine(
        id,
        'ladder-cart',
        x,
        y,
        [x, y, x + 1, y],
        [
          box(x + 0.05, x + 1.95, y + 0.1, y + 0.9, 0.2, burnt ? 0.5 : 0.75, burnt ? CHAR : WOOD),
          slope(x + 0.15, x + 1.85, y + 0.2, y + 0.8, burnt ? 1 : 2.5, 'e', burnt ? CHAR : WOOD),
        ],
      )
    : engine(
        id,
        'ladder-cart',
        x,
        y,
        [x, y - 1, x, y],
        [
          box(x + 0.1, x + 0.9, y - 0.95, y + 0.95, 0.2, burnt ? 0.5 : 0.75, burnt ? CHAR : WOOD),
          slope(x + 0.2, x + 0.8, y - 0.85, y + 0.85, burnt ? 1 : 2.5, 'n', burnt ? CHAR : WOOD),
        ],
      );
// The ladder raised against the south wall: the cart stands south of the
// trench (row y + 3), the ladder spans the two trench rows to the wall top
// (3 levels) at the wall's front edge (y).
const ladderOnWall = (id, x, y, burnt = false) =>
  engine(
    id,
    'ladder-raised',
    x,
    y,
    [x, y, x, y + 3],
    [
      box(x + 0.1, x + 0.9, y + 2.9, y + 3.9, 0.2, 0.75, burnt ? CHAR : WOOD),
      slope(x + 0.25, x + 0.75, y, y + 3.4, 3, 'n', burnt ? CHAR : WOOD),
    ],
  );
// 冲车: a roofed shed of timber and hides on wheels, its ram beam out front.
const ram = (id, x, y, side = false, wrecked = false) => {
  const h = wrecked ? 0.45 : 0.9;
  const top = wrecked ? 0.7 : 1.5;
  return side
    ? engine(
        id,
        'ram',
        x,
        y,
        [x, y, x + 1, y],
        [
          box(x + 0.05, x + 1.95, y + 0.1, y + 0.9, 0.15, h, HIDE),
          roof(x, x + 2, y + 0.05, y + 0.95, h, top, 'ew', 0, HIDE),
          ...(wrecked ? [] : [box(x + 1.95, x + 2.45, y + 0.42, y + 0.58, 0.35, 0.55, WOOD_DARK)]),
        ],
      )
    : engine(
        id,
        'ram',
        x,
        y,
        [x, y - 1, x, y],
        [
          box(x + 0.1, x + 0.9, y - 0.95, y + 0.95, 0.15, h, HIDE),
          roof(x + 0.05, x + 0.95, y - 1, y + 1, h, top, 'ns', 0, HIDE),
          ...(wrecked ? [] : [box(x + 0.42, x + 0.58, y - 1.5, y - 0.95, 0.35, 0.55, WOOD_DARK)]),
        ],
      );
};
// 井阑: a wheeled timber tower 2×2 cells and 6 levels high (the tallest thing
// on the map after the gate towers), a fighting platform with a parapet on top.
const siegeTower = (id, x, y, burnt = false) =>
  engine(
    id,
    'siege-tower',
    x,
    y,
    [x, y - 1, x + 1, y],
    [
      box(
        x + 0.15,
        x + 1.85,
        y - 0.85,
        y + 0.85,
        0.2,
        5.3,
        burnt ? CHAR : WOOD,
        burnt ? CHAR : WOOD_DARK,
      ),
      box(x, x + 2, y - 1, y + 1, 5.3, 5.5, burnt ? CHAR : WOOD),
      box(x, x + 2, y + 0.8, y + 1, 5.5, 6, burnt ? CHAR : WOOD_DARK),
    ],
  );
// The toppled tower lies east-west, four cells long.
const towerWreck = (id, x, y) =>
  engine(
    id,
    'siege-tower-wreck',
    x,
    y,
    [x, y - 1, x + 3, y],
    [box(x + 0.1, x + 3.9, y - 0.8, y + 0.9, 0, 1.3, CHAR)],
  );
// 土车: a one-cell barrow cart heaped with earth.
const earthCart = (id, x, y, tipped = false) =>
  engine(
    id,
    'earth-cart',
    x,
    y,
    [x, y, x, y],
    tipped
      ? [
          box(x + 0.15, x + 0.85, y + 0.1, y + 0.6, 0, 0.45, WOOD),
          roof(x + 0.05, x + 0.95, y + 0.55, y + 0.95, 0, 0.3, 'ew', 0.1, EARTH),
        ]
      : [
          box(x + 0.2, x + 0.8, y + 0.1, y + 0.9, 0.15, 0.55, WOOD),
          roof(x + 0.2, x + 0.8, y + 0.15, y + 0.85, 0.55, 0.9, 'ns', 0.15, EARTH),
        ],
  );
// 石磨吊架: a timber crane that stands on the wall walkway (the game lifts it by
// 3 levels), its arm reaching south over the parapet; the millstone is its
// own piece so the game can drop it on a rope it draws itself.
const millCrane = (id, x, y) =>
  engine(
    id,
    'mill-crane',
    x,
    y,
    [x, y, x, y],
    [
      box(x + 0.15, x + 0.3, y + 0.25, y + 0.4, 0, 2.2, WOOD, WOOD_DARK),
      box(x + 0.7, x + 0.85, y + 0.25, y + 0.4, 0, 2.2, WOOD, WOOD_DARK),
      box(x + 0.15, x + 0.85, y + 0.25, y + 0.4, 2.0, 2.2, WOOD, WOOD_DARK),
      box(x + 0.44, x + 0.56, y + 0.25, y + 1.5, 2.2, 2.35, WOOD, WOOD_DARK),
    ],
  );
const millstone = (id, x, y) =>
  engine(
    id,
    'millstone',
    x,
    y,
    [x, y, x, y],
    [box(x + 0.25, x + 0.75, y + 0.25, y + 0.75, 0, 0.35, STONE)],
  );

// Chosen attempt per S4 sheet, with why (details in generation-manifest.json).
const ENGINE_PICKS = {
  's4-01-ladder-cart': ['v2.webp', '对位最准，侧面梯架升向东、乘员棚在后'],
  's4-02-ladder-on-wall': ['v3.webp', '车底正好落在地面框上，梯顶的钩子标出搭墙的位置'],
  's4-03-ram': [
    'v1.webp',
    '两种推行朝向的撞木都在前；砸毁那件石磨压在塌下的棚顶上。v3 朝北那件撞木画在了近端（南），不对',
  ],
  's4-04-siege-tower': ['v1.webp', '对位最准（12px 以内），射台朝南有女墙；v2 高了约一层'],
  's4-05-siege-tower-wrecks': [
    'v3.webp',
    '两件对位都最准；倾覆的井阑东西向躺倒、一只轮子朝天、射台压在东头',
  ],
  's4-06-earth-cart': [
    'v3.webp',
    '最贴灰盒，三件是同一辆车；侧面的车把伸出灰盒约 70px（每张都这样，属于车本身）；v2 画大了',
  ],
  's4-07-millstone-crane': ['v3.webp', '对位更准；第 2 张被出图服务的安全过滤拒了三次，没有出图'],
};
const engineSheet = (o) => {
  const [final, why] = ENGINE_PICKS[o.id] ?? [];
  return sheetAsset({
    stage: 'S4',
    ...o,
    final,
    about: [
      ...o.about,
      ...(final
        ? [
            `**2026-11-02 选定 \`attempts/${final}\`**（待你确认）：${why}。透明版 \`selected-transparent.png\` 由 \`attempts/key.py\` 确定性抠出品红（不重画）；每张的提示词、源文件和对位量测记在 \`generation-manifest.json\`。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh）。`,
          ]
        : []),
    ],
  });
};
const CHARRED =
  'charred black and smouldering, with glowing orange embers along the burnt timbers but no large flames and no smoke (the game adds flames and smoke on top)';
const ENGINE_ASSETS = [
  engineSheet({
    id: 's4-01-ladder-cart',
    zh: 'S4-01 云梯车',
    about: [
      '三格各一件：朝北推行（1×2 格，梯架升向北端，高 2.5 层）、朝东推行（2×1 格）、烧毁残骸（1×2 格）。每格 128×96、每层 48px。',
      '朝西推行由程序把朝东那件左右翻转（美术计划 §9.5）。',
    ],
    slots: () => [
      [
        'the ladder cart, heading north',
        '朝北',
        [0, 0, 512, 1024],
        [ladderCart('ladder-n', 40, 8)],
      ],
      [
        'the ladder cart, heading east',
        '朝东',
        [512, 0, 512, 1024],
        [ladderCart('ladder-e', 42, 8, true)],
      ],
      [
        'the ladder cart, burnt out',
        '烧毁',
        [1024, 0, 512, 1024],
        [ladderCart('ladder-burnt', 45, 8, false, true)],
      ],
    ],
    subject: `Subject: a Shu-Han siege ladder cart (云梯车) of the Three Kingdoms period for a strategy game, three separate pieces side by side, one centred in each third of the image. The cart is a heavy four-wheeled timber chassis carrying a folded scaling ladder on a triangular timber truss, with a small hide-covered shelter at the rear for the crew. Left: heading north, away from the viewer, the truss rising toward its far (north) end. Middle: the same cart heading east, seen from its side, the truss rising toward its right (east) end. Right: the same cart burnt out where it stood, ${CHARRED}, the ladder collapsed onto the chassis. Same cart, same size and timber in all three.`,
    checks: ['三件是同一辆车：同样的轮、架和大小。', '残骸看得出是烧坏的云梯车，没有大火苗和烟。'],
  }),
  engineSheet({
    id: 's4-02-ladder-on-wall',
    zh: 'S4-02 云梯架上墙面',
    about: [
      '车停在城堑外沿（墙前第 3 行），梯子跨过两行城堑，搭到 3 层高的墙头前沿。左完好，右燃烧（焦黑、余烬，火苗和烟由程序加）。',
      '整件按南墙对位：梯顶在墙的正面前沿，游戏把这件放在墙格正南、车在第 3 行。',
    ],
    slots: () => [
      [
        'the scaling ladder raised against the wall',
        '完好',
        [0, 0, 768, 1024],
        [ladderOnWall('ladder-up', 40, 8)],
      ],
      [
        'the scaling ladder raised against the wall, burning',
        '燃烧',
        [768, 0, 768, 1024],
        [ladderOnWall('ladder-up-burnt', 42, 8, true)],
      ],
    ],
    subject: `Subject: a Shu-Han siege ladder cart (云梯车) with its scaling ladder raised, for a strategy game, two separate pieces side by side, one centred in each half of the image. The four-wheeled timber cart stands at the near (south) end; from it a long timber scaling ladder with hooked tips rises steeply away from the viewer, northward, to the top of a city wall that is not drawn (the ladder's top end, at the far end of the piece, rests where the wall top will be). Nothing under the ladder: the city trench it spans is not part of the piece. Left: intact. Right: the same, ${CHARRED}. Same cart and ladder in both.`,
    checks: [
      '梯子从车上往北升，梯顶在框的最北端；梯下是空的（城堑不画）。',
      '燃烧那件焦黑、有余烬，没有大火苗和烟。',
    ],
  }),
  engineSheet({
    id: 's4-03-ram',
    zh: 'S4-03 冲车',
    about: [
      '三格各一件：朝北推行（1×2 格，撞木伸向北）、朝东推行（2×1 格，撞木伸向东）、被石磨砸毁（1×2 格，棚顶塌下）。每格 128×96、每层 48px。',
      '冲车只能走路和桥，撞门时在门前前后来回（程序做）；被石磨砸毁时换第三件，碎木由程序加（MVP 计划 §8.3）。',
    ],
    slots: () => [
      ['the battering ram, heading north', '朝北', [0, 0, 512, 1024], [ram('ram-n', 40, 8)]],
      ['the battering ram, heading east', '朝东', [512, 0, 512, 1024], [ram('ram-e', 42, 8, true)]],
      [
        'the battering ram, smashed by a millstone',
        '砸毁',
        [1024, 0, 512, 1024],
        [ram('ram-wreck', 45, 8, false, true)],
      ],
    ],
    subject:
      'Subject: a Shu-Han battering ram (冲车) of the Three Kingdoms period for a strategy game, three separate pieces side by side, one centred in each third of the image. It is a low four-wheeled timber shed with a steep gabled roof covered in wet ox hides against fire, and inside it a heavy ram beam slung on ropes, its iron-shod head sticking out of the front. Left: heading north, away from the viewer, the ram head at its far (north) end. Middle: the same ram heading east, seen from its side, the ram head at its right (east) end. Right: the same ram smashed by a falling millstone: the roof caved in and split, beams broken, the ram beam fallen askew, hides torn. Same machine, same size in all three.',
    checks: ['撞木头朝着行进方向伸出来。', '砸毁那件看得出是被重物从上砸塌的。'],
  }),
  engineSheet({
    id: 's4-04-siege-tower',
    zh: 'S4-04 井阑',
    about: [
      '2×2 格，高 6 层（全图第二高，只比门楼矮）：四轮木架塔，顶上是带女墙的射台，第二幕解锁（MVP 计划 §4.7）。每格 128×96、每层 48px。',
      '只有完好一件；燃烧和倾覆在 S4-05。',
    ],
    slots: () => [['the siege tower', '井阑', [384, 0, 768, 1024], [siegeTower('tower', 40, 8)]]],
    subject:
      'Subject: a Shu-Han siege tower (井阑) of the Three Kingdoms period for a strategy game, one piece centred in the image. A tall square tower of heavy timber framing on four solid wheels, braced with diagonal timbers and partly boarded with planks and wet hides, with a ladder inside; at the top, a square fighting platform with a timber parapet along its front (south) edge for archers. Seen from the south. It must be tall and narrow, exactly as high as the block-out.',
    checks: [
      '高度和灰盒一样（6 层），不要画矮或画高。',
      '顶上射台有朝南的女墙，看得出弓兵能站上去。',
    ],
  }),
  engineSheet({
    id: 's4-05-siege-tower-wrecks',
    zh: 'S4-05 井阑燃烧、倾覆',
    about: [
      '左：燃烧（同 S4-04 的形体，焦黑、余烬，火苗和烟由程序加）。右：倾覆残骸，东西向倒在地上，4×2 格、高 1.3 层。',
      '被毁的器械原地挡路（MVP 计划 §4.7）。',
    ],
    slots: () => [
      [
        'the siege tower, burning',
        '燃烧',
        [0, 0, 768, 1024],
        [siegeTower('tower-burnt', 40, 8, true)],
      ],
      ['the siege tower, toppled', '倾覆', [768, 0, 768, 1024], [towerWreck('tower-wreck', 44, 8)]],
    ],
    subject: `Subject: two states of a Shu-Han siege tower (井阑) for a strategy game, two separate pieces side by side, one centred in each half of the image. The tower is a tall square timber tower on four wheels with a fighting platform on top. Left: the tower still standing, ${CHARRED}, planks burnt through so the frame shows. Right: the tower toppled over onto its side, lying east-west along the ground: a long heap of broken, charred framing timbers, a wheel in the air, the platform crushed at its east end.`,
    checks: ['燃烧那件和 S4-04 同一个形体，只是烧黑。', '倾覆那件是东西向躺倒的长条残骸，不高。'],
  }),
  engineSheet({
    id: 's4-06-earth-cart',
    zh: 'S4-06 土车',
    about: [
      '三格各一件，都是 1×1 格：朝北推行、朝东推行、倾倒（土倒在南边，填堑时用）。每格 128×96、每层 48px。',
    ],
    slots: () => [
      ['the earth cart, heading north', '朝北', [0, 0, 512, 1024], [earthCart('cart-n', 40, 8)]],
      ['the earth cart, heading east', '朝东', [512, 0, 512, 1024], [earthCart('cart-e', 42, 8)]],
      [
        'the earth cart, tipped over',
        '倾倒',
        [1024, 0, 512, 1024],
        [earthCart('cart-tipped', 44, 8, true)],
      ],
    ],
    subject:
      'Subject: a Shu-Han earth cart (土车) for filling the city trench, for a strategy game, three separate pieces side by side, one centred in each third of the image. A small two-wheeled timber cart with a deep plank box heaped with earth and a few bundles of brushwood, pushed by handles. Left: heading north, away from the viewer, handles at the near (south) end. Middle: heading east, seen from its side, handles at its left (west) end. Right: tipped forward with its earth spilled out in a heap in front of it. Same cart, same size in all three.',
    checks: ['三件是同一辆小车。', '倾倒那件的土堆看得出是从车里倒出来的。'],
  }),
  engineSheet({
    id: 's4-07-millstone-crane',
    zh: 'S4-07 城头石磨吊架',
    about: [
      '左：吊架，1 格，高 2.35 层，臂伸向南、越过女墙。游戏把它放在墙顶走道上（抬高 3 层）。右：石磨单独一件，绳子由程序画（MVP 计划 §8.3）。',
    ],
    slots: () => [
      ['the millstone crane', '吊架', [0, 0, 768, 1024], [millCrane('crane', 40, 8)]],
      ['the millstone', '石磨', [768, 0, 768, 1024], [millstone('stone', 42, 8)]],
    ],
    subject:
      'Subject: two separate pieces for a strategy game, one centred in each half of the image. Left: a simple timber crane that Wei defenders set up on a city wall walkway: two upright posts joined by a crossbeam, braced, and a single heavy arm reaching out toward the viewer (south) beyond where the parapet will be, with a pulley block at its tip. No rope, no stone. Right: a heavy round millstone (石磨) lying flat, with a square hole in the middle and grinding grooves on its face. Nothing else.',
    checks: ['吊架的臂朝南伸出；不画绳子和石磨。', '石磨是平放的厚圆盘。'],
  }),
];

// ---------------------------------------------------------------------------
// S5 troops and commanders (MVP plan §8.2, art plan E01–E07, F01–F02).
// Pose sheets work like S1-05/S1-06: a guide sets the cells, baselines and
// figure height; the approved S1 sheets are uploaded so every sheet draws the
// same armies. Portraits follow the v0.3 portrait brief
// (docs/assets/v0.3-portraits/), one square image each, no reference.
const SHU_SHEET =
  '`docs/siege/chencang/art/s1-05-shu-halberd-sheet/attempts/v5.webp`（第二张，蜀戟兵定稿）';
const WEI_SHEET =
  '`docs/siege/chencang/art/s1-06-wei-archer-sheet/attempts/v4.webp`（第二张，魏弓兵定稿）';
const SHU_COAT =
  'a bright jade-green (#5f9a5a) padded war coat with red (#a8432f) trim over dark iron lamellar armour, a fur-lined collar against the winter cold, wrapped leggings and boots';
const WEI_COAT =
  'a deep indigo (#2f4a6e) padded war coat over black lacquered lamellar armour, a fur-lined collar against the winter cold';
const UNIT_CAMERA =
  'Camera: the same orthographic three-quarter top-down camera as the battlefield, about 50 degrees from above, so the top of the helmet and the shoulders are visible and the figure is slightly foreshortened.';
const UNIT_LIGHT =
  'Light: low winter sun from the lower left (south-west); shade the figure only, with no cast shadow.';
const unitStyle = (whose) =>
  `Style: match the second attached sheet (${whose}) exactly in brushwork and colour handling: bold dark ink outline, flat ink-textured colour fills, no facial features. Match its style, proportions and figure size.`;
const grid = (cols, rows, [w, h]) =>
  `${cols} by ${rows} grid of equal cells (${w}×${h} pixels each)`;
const poseSheet = ({
  id,
  zh,
  guide,
  about,
  cells,
  subject,
  rows,
  columns,
  figure,
  extra = [],
  ref,
  whose,
  checks,
  exclude = EXCLUDE_UNIT_SHEET,
}) => ({
  id,
  stage: 'S5',
  zh,
  size: [1536, 1024],
  guide,
  about,
  prompts: () => [
    {
      text: [
        [
          `Subject: ${subject} Arrange the sheet as a ${grid(guide.cols, guide.rows, cells)} exactly as in the first attached guide: one figure per cell, every figure the same size (${figure}), feet on the solid baseline.`,
          rows,
          columns,
          UNIT_CAMERA,
          ...extra,
          unitStyle(whose),
          UNIT_LIGHT,
        ]
          .filter(Boolean)
          .join('\n'),
        SPRITE,
        exclude,
      ].join('\n\n'),
    },
  ],
  uploads: ['`guide.png`', ref],
  checks: [
    '把图缩到人物约 36px 高看：每个朝向、每个姿势都看得懂，转成灰度也分得出蜀魏。',
    '和参考的 S1 定稿表是同一支军队、同一套画风；各格是同一个人，脚都踩在基线上。',
    ...checks,
  ],
  naming: '依次命名 `v1.webp`、`v2.webp`……',
});

const PORTRAIT_BRIEF = [
  'Use case: historical-scene. Asset type: one individual square officer portrait for a Three Kingdoms strategy game.',
  'Original imagined historical character illustration, one Chinese person only, centered head and shoulders, head and all headwear entirely inside image with a little empty headroom, face large and readable at 48 pixels, slight three-quarter pose.',
  'Elegant hand-painted historical portrait with precise dark ink contours, muted mineral watercolor, warm plain parchment backdrop, soft even lighting, realistic individual facial anatomy, premium illustrated strategy game asset. Restrained late-Han / Three Kingdoms period clothing and headwear.',
  'No frame, no lettering, no Chinese characters, no watermark, no scenery, no extra people, no modern clothing, no exaggerated fantasy armor, no commercial-game copy. Make this person clearly distinctive in facial structure, age, hair, expression, clothing, and headwear.',
];
const PORTRAIT_FRAMING =
  'Production emphasis:  Square 1:1 canvas, zoomed-out bust framing: the top 10 percent of canvas is plain parchment; entire headwear and hair lie below that margin, full head and shoulders visible; unobscured face. Every individual must have a distinct natural face, matching the supplied age and identity cues.';
const portrait = ({ id, zh, slug, name, about, age, face, hair, headwear, cues, goal, avoid }) => ({
  id,
  stage: 'S5',
  zh,
  size: [1024, 1024],
  portrait: true,
  about,
  prompts: () => [
    {
      text: [
        ...PORTRAIT_BRIEF,
        `Subject: Portray ${name} (${slug}) as a Chinese historical figure of the late Han / Three Kingdoms era. Age impression: ${age}. Face: ${face}. Facial hair: ${hair}. Headwear / hairstyle: ${headwear}. Distinctive cues: ${cues}. Character goal: ${goal}. Avoid: ${avoid}.`,
        PORTRAIT_FRAMING,
      ].join('\n\n'),
    },
  ],
  uploads: ['不上传参考图（和 v0.3 立绘同一套做法）。'],
  checks: [
    '和 `public/assets/v03/portraits/` 里的诸葛亮、姜维、曹真放在一起，是同一套画风、同样的取景和底色。',
    '缩到 48px 还认得出脸；和郝昭、王生、靳详彼此一眼分得开。',
  ],
  naming:
    '依次命名 `v1.webp`、`v2.webp`……（1024×1024）。选定后另存运行时用的 256px 和 128px（`-small`）webp，同 v0.3。',
});

// Chosen attempt per S5 asset, with why (details in generation-manifest.json).
const ROSTER_PICKS = {
  's5-01-shu-siege-poses': [
    'v2.webp',
    '攀梯三格手脚交替最清楚，翻墙那格看得懂；和 S1-05 是同一个兵',
  ],
  's5-02-shu-crossbow-sheet': [
    'v1.webp',
    '弩和箭箙清楚；皮帽、无盾，和戟兵一眼分得开。正面射击三张都朝侧面瞄（正对镜头很难画），可以接受',
  ],
  's5-03-wei-infantry-sheet': [
    'v1.webp',
    '背面一行看得出是背面（没有脸、没有带扣，和 S1-06 的背面一致），格挡那一列大盾举过头',
  ],
  's5-04-banners': [
    'v2.webp',
    '旗面都空着，旗杆竖直，丞相帅旗最气派。第一次出图时排除项里还写着"不画旗"，停掉重出',
  ],
  's5-05-zhuge-liang-carriage': ['v1.webp', '羽扇纶巾一眼认得出，推车的两名蜀兵和 S1-05 一致'],
  's5-06-hao-zhao-wall': ['v3.webp', '指挥那格按剑、另一手前指最清楚，背面披风最好'],
  's5-07-portrait-hao-zhao': ['v1.webp', '冷峻的边关守将，红缨铁盔、深靛披风，和张郃分得开'],
  's5-08-portrait-wang-sheng': ['v2.webp', '敦实、朴素，比郝昭粗壮，正脸 48px 也认得出'],
  's5-09-portrait-jin-xiang': ['v2.webp', '恳切、略带不安的文人说客，没有甲胄，和诸葛亮分得开'],
};
const withRosterPick = (asset) => {
  const [final, why] = ROSTER_PICKS[asset.id] ?? [];
  if (!final) return asset;
  const files = asset.portrait
    ? `运行时用的 256px 和 128px 在 \`runtime/\`（同 v0.3 的质量设置）`
    : `透明版 \`selected-transparent.png\` 由 \`attempts/key.py\` 确定性抠出品红；逐格切出的姿态在 \`poses/\`，游戏尺寸的在 \`poses-game/\`，脚底锚点见 \`poses.json\`（\`attempts/cut_poses.py\` 切的，不重画）`;
  return {
    ...asset,
    final,
    about: [
      ...asset.about,
      `**2026-11-02 选定 \`attempts/${final}\`**（待你确认）：${why}。${files}；每张的提示词、源文件和选择理由记在 \`generation-manifest.json\`。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh）。`,
    ],
  };
};
const ROSTER_ASSETS = [
  poseSheet({
    id: 's5-01-shu-siege-poses',
    zh: 'S5-01 蜀步兵攀梯、运土',
    guide: { cols: 3, rows: 2, figure: 300, foot: 56 },
    cells: [512, 512],
    about: [
      '3×2 宫格，每格 512×512，同 S1-06 的版式。第一行攀梯（背面，朝北）：伸手、迈步、翻上墙头；第二行运土：背面扛土筐行进、侧面（朝东）扛土筐行进、背面把土倒下去。',
      '同一个 S1-05 戟兵：攀梯和运土时戟和盾背在背上。梯子是 S4-02 的分件，这里不画，游戏把人摆在梯上。',
    ],
    subject:
      'a character pose sheet of the same Shu-Han halberd infantryman as on the second attached sheet, for a strategy game, drawn six times in siege work.',
    figure: 'about 300 pixels from the soles to the top of the helmet, up to the dashed line',
    rows: [
      'Top row, all seen from behind (facing north, away from the viewer), climbing a scaling ladder that is NOT drawn (the ladder is a separate piece he will be placed on): reaching up with the right hand, left foot raised to the next rung; reaching up with the left hand, right foot raised; at the top, one leg swung up and over as if onto a wall top.',
      'Bottom row, carrying earth to fill the city trench: seen from behind (north), marching with a wicker basket of earth on his right shoulder; seen from the side facing right (east), marching with the basket on his shoulder; seen from behind (north), tipping the basket forward so the earth pours out in front of him.',
    ].join('\n'),
    columns: '',
    extra: [
      `The soldier: ${SHU_COAT}, a rounded iron helmet with a neck guard; for this work his ji halberd and small round wooden shield are slung on his back. No facial features. Identical armour, colours and proportions in every cell, and the same soldier as on the second attached sheet.`,
    ],
    ref: SHU_SHEET,
    whose: 'the Shu-Han halberdier pose sheet',
    checks: [
      '攀梯三格手脚交替，看得出在往上爬；梯子没画。',
      '运土三格的土筐一样大，倒土那格土是往前（北）倒的。',
    ],
  }),
  poseSheet({
    id: 's5-02-shu-crossbow-sheet',
    zh: 'S5-02 蜀弓弩兵姿态表',
    guide: { cols: 3, rows: 3, figure: 240, foot: 24 },
    cells: [512, 341],
    about: [
      '3×3 宫格，每格约 512×341，同 S1-05 的版式：行是背面（朝北）、侧面（朝东）、正面（朝南），列是待机、行进、射击。',
      '和戟兵同一支蜀军：同样的绿袍红边，但轻甲、皮盔、无盾，手持弩，腰挂箭箙，剪影要和戟兵分得开。井阑上射击用射击这一格。',
    ],
    subject:
      'a character pose sheet of one Shu-Han crossbowman for a strategy game, the same soldier drawn nine times, from the same army as the halberdier on the second attached sheet.',
    figure: 'about 240 pixels from the soles to the top of the cap, up to the dashed line',
    rows: 'Rows, top to bottom: seen from behind, facing away (north); seen from the side, facing right (east); seen from the front, facing the viewer (south).',
    columns:
      'Columns, left to right: standing ready, crossbow held across the body; marching mid-stride, crossbow on the shoulder; shooting, crossbow raised to the shoulder and aimed in the facing direction.',
    extra: [
      `The soldier: ${SHU_COAT}, but lighter than the halberdier: a leather lamellar vest instead of full iron armour, a close-fitting leather cap with ear flaps instead of the iron helmet, no shield, a Han crossbow (弩) with a bronze trigger mechanism, and a quiver of bolts at the right hip. No facial features. Identical gear, colours and proportions in every cell.`,
    ],
    ref: SHU_SHEET,
    whose: 'the Shu-Han halberdier pose sheet',
    checks: ['和戟兵一眼分得开：无盾、皮帽、弩。', '射击那一列弩都朝着这一行的朝向。'],
  }),
  poseSheet({
    id: 's5-03-wei-infantry-sheet',
    zh: 'S5-03 魏步兵姿态表',
    guide: { cols: 3, rows: 3, figure: 240, foot: 24 },
    cells: [512, 341],
    about: [
      '3×3 宫格，每格约 512×341：行是背面（朝北）、侧面（朝东）、正面（朝南），列是待机、格挡、攻击。守城时多是正面。',
      '和 S1-06 魏弓兵同一支魏军：深靛袍、黑漆甲；环首刀加长方大盾，和蜀戟兵（戟、小圆盾）分得开。',
    ],
    subject:
      'a character pose sheet of one Wei infantryman for a strategy game, the same soldier drawn nine times, from the same army as the archer on the second attached sheet.',
    figure: 'about 240 pixels from the soles to the top of the helmet, up to the dashed line',
    rows: 'Rows, top to bottom: seen from behind, facing away (north); seen from the side, facing right (east); seen from the front, facing the viewer (south).',
    columns:
      'Columns, left to right: standing ready behind his shield; blocking, the shield raised high and braced against a blow from above; attacking, slashing forward with the sabre past the shield.',
    extra: [
      `The soldier: ${WEI_COAT}, a round iron helmet with a neck guard like the archer's, a ring-pommel sabre (环首刀) and a tall rectangular wooden shield faced with lacquered hide. No facial features. Identical gear, colours and proportions in every cell.`,
    ],
    ref: WEI_SHEET,
    whose: 'the Wei archer pose sheet',
    checks: [
      '和 S1-06 魏弓兵放在一起是同一支军队。',
      '格挡那一列盾举过头，能看懂是在挡上面砸下来的东西。',
    ],
  }),
  poseSheet({
    id: 's5-04-banners',
    zh: 'S5-04 旗帜',
    guide: { cols: 3, rows: 1, figure: 820, foot: 60 },
    cells: [512, 1024],
    about: [
      '三面旗，每格 512×1024，旗杆底端踩在基线上：认旗（每支部队一面，旗面浅色，由程序按势力着色）、丞相帅旗（大旗，深红）、"郝"字旗（魏，深靛）。',
      '旗面都留白，字由程序写；旗面画得平一点，飘动由程序做（MVP 计划 §8.3）。',
    ],
    subject:
      'three separate flags for a strategy game, each on its own pole, one centred in each cell.',
    figure: 'each pole from its foot on the baseline up to about the dashed line',
    rows: [
      'Left: a unit recognition flag (认旗): a slim bamboo pole with a small iron spearhead finial and a narrow vertical rectangular flag of plain off-white silk hanging from a crossbar near the top, with a short dark border; the flag face is left blank so the game can colour and letter it.',
      "Middle: the chancellor's great banner (丞相帅旗): a tall heavy lacquered pole with a gilded finial and red tassels, carrying a large vertical deep-red silk banner with a black border and a scalloped edge; a large plain panel in the middle is left blank for a character the game writes.",
      "Right: the Wei commander's banner of Hao Zhao (郝字旗): a sturdy pole with an iron finial carrying a square deep-indigo (#2f4a6e) silk banner with a white border; the middle is left blank for a character the game writes.",
    ].join('\n'),
    columns:
      'Each flag hangs almost flat with only a gentle wave, seen from the front, so the game can animate it.',
    extra: [],
    ref: SHU_SHEET,
    whose: 'the Shu-Han halberdier pose sheet',
    // The flags are the subject here, so only figures and writing are excluded.
    exclude: EXCLUDE_SPRITE.replace(
      'people, soldiers, horses, flags, banners or pennants;',
      'people, soldiers or horses; any writing, characters or emblems on the flags;',
    ),
    checks: [
      '三面旗的旗面都是空的，没有任何字或花纹。',
      '旗面平整、轻微飘动，方便程序做飘动；旗杆竖直。',
    ],
  }),
  poseSheet({
    id: 's5-05-zhuge-liang-carriage',
    zh: 'S5-05 诸葛亮乘四轮车',
    guide: { cols: 2, rows: 2, figure: 330, foot: 56 },
    cells: [768, 512],
    about: [
      '2×2 宫格，每格 768×512：行是朝北（背面）、朝南（正面），列是端坐、挥扇指挥。人连车从轮底到纶巾顶约 330px，比小兵（300px）略高。',
      '羽扇纶巾、鹤氅，坐四轮小车，由两名蜀兵在后推（战场武将形象，美术 F01）。和小兵一样不画五官。',
    ],
    subject:
      'a character pose sheet of Zhuge Liang, the Shu-Han chancellor, seated in his small four-wheeled carriage (四轮车) and pushed by two Shu-Han soldiers, for a strategy game, drawn four times.',
    figure:
      'about 330 pixels from the bottom of the wheels to the top of his kerchief cap, up to the dashed line',
    rows: 'Top row: the whole group seen from behind, heading north, away from the viewer (the two soldiers pushing at the near end). Bottom row: the group seen from the front, facing the viewer (south), the soldiers behind the carriage.',
    columns:
      'Left column: Zhuge Liang sitting upright and calm, the feather fan resting in his lap. Right column: commanding, the white feather fan raised and pointing forward.',
    extra: [
      `Zhuge Liang: a white crane-feather cloak (鹤氅) over a pale robe, a dark silk kerchief cap (纶巾), a white feather fan (羽扇); the carriage is a light open timber chair on four spoked wheels with a low railing and a small canopy-less seat. The two soldiers wear ${SHU_COAT} and rounded iron helmets, as on the second attached sheet. No facial features on anyone. Same carriage, figures and proportions in every cell.`,
    ],
    ref: SHU_SHEET,
    whose: 'the Shu-Han halberdier pose sheet',
    checks: [
      '羽扇纶巾一眼认得出是诸葛亮；车是四轮的。',
      '推车的两名蜀兵和 S1-05 戟兵是同一支军队。',
    ],
  }),
  poseSheet({
    id: 's5-06-hao-zhao-wall',
    zh: 'S5-06 郝昭城头形象',
    guide: { cols: 3, rows: 2, figure: 300, foot: 56 },
    cells: [512, 512],
    about: [
      '3×2 宫格，每格 512×512：第一行正面（朝南）：按剑而立、拔剑指挥、张弓；第二行侧面（朝东）站立、侧面行进、背面（朝北）站立。',
      '魏将：比 S1-06 魏弓兵的甲更重、有披风和红缨，站在城头时一眼认得出是主将（战场武将形象，美术 F01）。',
    ],
    subject:
      'a character pose sheet of Hao Zhao, the Wei general defending Chencang, for a strategy game, the same man drawn six times, from the same army as the archer on the second attached sheet.',
    figure:
      'about 300 pixels from the soles to the top of the helmet, not counting its plume, up to the dashed line',
    rows: [
      'Top row, all seen from the front, facing the viewer (south): standing firm with his left hand on his sword hilt; commanding, his sword drawn and pointing forward and down over a wall; drawing a bow.',
      'Bottom row: standing, seen from the side facing right (east); walking, seen from the side facing right; standing, seen from behind (north).',
    ].join('\n'),
    columns: '',
    extra: [
      `Hao Zhao: ${WEI_COAT}, but a general's heavier armour with shoulder guards, a dark red cloak, a round iron helmet with a short red plume, a straight sword at his hip and a bow on his back. No facial features. Identical gear, colours and proportions in every cell.`,
    ],
    ref: WEI_SHEET,
    whose: 'the Wei archer pose sheet',
    checks: ['放在魏弓兵、魏步兵中间，一眼看得出是主将（披风、红缨）。', '六格是同一个人。'],
  }),
  portrait({
    id: 's5-07-portrait-hao-zhao',
    zh: 'S5-07 立绘：郝昭',
    slug: 'haozhao',
    name: '郝昭',
    about: ['魏将，太原人，镇守陈仓（MVP 计划 §4.2）。按 v0.3 立绘的同一套提示词结构出图。'],
    age: '35-45',
    face: 'lean, weathered, angular face with high cheekbones and a firm jaw',
    hair: 'short dark beard and moustache, neatly kept',
    headwear: 'plain practical iron helmet with a short red plume over a dark headcloth',
    cues: 'unyielding frontier fortress commander; calm, stern, watchful eyes; worn but well-kept lamellar armour under a dark indigo cloak',
    goal: 'must feel immovable and incorruptible, a soldier rather than a courtier',
    avoid: 'flamboyant nobleman, old grizzled veteran, resemblance to Zhang He',
  }),
  portrait({
    id: 's5-08-portrait-wang-sheng',
    zh: 'S5-08 立绘：王生',
    slug: 'wangsheng',
    name: '王生',
    about: ['魏将，郝昭的副将（《资治通鉴》载曹真派郝昭、王生守陈仓，MVP 计划 §4.2）。'],
    age: '30-40',
    face: 'broad, round, sturdy face with a heavy brow',
    hair: 'thick drooping moustache and a short square chin beard',
    headwear: 'low rounded iron cap with leather ear flaps',
    cues: 'loyal, practical deputy; steady and watchful; plain dark lamellar armour, no cloak',
    goal: "must read as Hao Zhao's reliable second: plainer and heavier-set than him",
    avoid: 'looking like Hao Zhao, scholar, nobleman',
  }),
  portrait({
    id: 's5-09-portrait-jin-xiang',
    zh: 'S5-09 立绘：靳详',
    slug: 'jinxiang',
    name: '靳详',
    about: ['郝昭的同乡，诸葛亮派他到城下两次劝降（开场，MVP 计划 §3）。是说客，不是武将。'],
    age: '35-45',
    face: 'open, earnest face with gentle features and slightly anxious eyes',
    hair: 'thin neat moustache and a small pointed beard',
    headwear: 'soft black civilian headcloth (介帻)',
    cues: 'persuasive envoy and old acquaintance; plain dark-green travelling robe with a fur-trimmed cloak, no armour',
    goal: 'must read as a civilian go-between, earnest rather than cunning',
    avoid: 'armour, weapons, a scholar-strategist look like Zhuge Liang',
  }),
];

// ---------------------------------------------------------------------------
// S6 effect elements and interface (MVP plan §8.2, §8.3). Still images only:
// the game moves, scales, fades and tints them (no frame animation). These
// sheets ask ImageGen for a genuinely transparent background, because smoke,
// dust and glow need soft partial alpha that a magenta key cannot recover.
// The effects take a crop of the approved S2-01 map as their style reference
// (s6-01-fire-smoke/style-reference.png), not a building piece.
const MAP_STYLE_REF =
  '`docs/siege/chencang/art/s6-01-fire-smoke/style-reference.png`（S2-01 定稿全图的一块，风格参考）';
const TRANSPARENT_OUT =
  'Output a PNG with a genuinely transparent background (a real alpha channel): every pixel outside the elements is fully transparent; soft smoke, dust, glow and spray keep their partial transparency. No background colour, paper, ground or frame.';
const EXCLUDE_ELEMENTS =
  'Do not include: any text, letters, calligraphy, seals or signatures; grid lines, cell borders or guide marks; ground, scenery or backgrounds; people, soldiers, horses, flags or banners; modern objects.';
const cellLayout = (cols, rows, w, h) =>
  `Arrange the sheet as a ${cols} by ${rows} grid of equal cells (${w}×${h} pixels each, no borders drawn): one element centred in each cell with clear empty space around it, nothing crossing into a neighbouring cell.`;
const elementSheet = ({
  id,
  zh,
  about,
  cols,
  rows,
  subject,
  items,
  uploads,
  styleLine,
  checks,
}) => {
  const [w, h] = [1536 / cols, 1024 / rows].map(Math.round);
  return {
    id,
    stage: 'S6',
    zh,
    size: [1536, 1024],
    noImage: true,
    about,
    prompts: () => [
      {
        text: [
          `Output: an image exactly 1536 by 1024 pixels. ${subject}`,
          cellLayout(cols, rows, w, h),
          items.join('\n'),
          styleLine,
          TRANSPARENT_OUT,
          EXCLUDE_ELEMENTS,
        ].join('\n\n'),
      },
    ],
    uploads,
    checks: [
      '背景真的是透明的（PNG 带 alpha）：烟、尘、光晕边缘是半透明，不是一块底色。',
      '每格一件，不出格；缩到游戏大小（一半）还看得懂。',
      ...checks,
    ],
    naming: '依次命名 `v1.webp`、`v2.webp`……（无损 webp，保留透明通道）。',
  };
};
const EFFECT_STYLE =
  'Style: traditional Chinese ink-wash painting with light colour, matching the attached painting (the battlefield map these effects are laid over) in brushwork, ink weight and palette: loose expressive ink strokes and soft transparent washes, warm restrained colour; flames in vermilion, orange and pale yellow washes with dark ink tips, smoke in layered grey ink washes. Seen from the same high three-quarter camera as the map. Painted, not photographic, no glossy CG fire.';
const ICON_STYLE =
  'Style: each icon is a single bold Chinese ink-brush pictogram in near-black ink (#2a2622) with exactly one small accent in vermilion (#b5402e), like a carved seal motif without the seal border: confident thick brush strokes, simple flat silhouette, no shading or gradients, no circle, square or frame around it. All twelve share the same stroke weight and visual size, and each must stay recognisable when shrunk to 32 pixels.';
const iconItems = (names) => [
  'Rows left to right, top to bottom:',
  ...names.map((n, i) => `${i + 1}. ${n}`),
];

// Chosen attempt per S6 sheet, with why and what was cut from it.
const EFFECT_PICKS = {
  's6-01-fire-smoke': [
    'v1.webp',
    '三种火焰大小分得开，焦痕带余烬，烟是半透明的灰墨',
    '逐格切出的元素在 `poses/`（游戏尺寸 50% 在 `poses-game/`，锚点见 `poses.json`）',
  ],
  's6-02-impacts': [
    'v1.webp',
    '尘爆最好（边缘散开、带土块），墙上的箭簇没画墙',
    '逐格切出的元素在 `poses/`、`poses-game/`',
  ],
  's6-03-icons-siege': [
    'v3.webp',
    '笔画最一致，32px 下十二个都认得出；v2 的死守画成了西式盾',
    '方形图标 128、64、32px 在 `icons/`',
  ],
  's6-04-icons-state': [
    'v3.webp',
    '和 S6-03 v3 是一套，32px 下都认得出',
    '方形图标 128、64、32px 在 `icons/`',
  ],
  's6-05-paper': [
    'v2.webp',
    '卷轴木轴和锦缎镶边最干净，纸面全空',
    '四件和横幅两端、可重复的中段、可平铺的纸纹在 `pieces/`（`pieces.json`）',
  ],
};
const withEffectPick = (asset) => {
  const [final, why, files] = EFFECT_PICKS[asset.id] ?? [];
  if (!final) return asset;
  return {
    ...asset,
    final,
    about: [
      ...asset.about,
      `**2026-11-02 选定 \`attempts/${final}\`**（待你确认）：${why}。ImageGen 出的透明通道有噪点（实心处 252–254、底上有一层 1），存 \`attempts/\` 时线性拉到 0 和 255，软边保留；原图不动。选定的透明 PNG 是 \`selected.png\`；${files}，由 \`attempts/cut_poses.py\`、\`attempts/prepare_ui.py\` 切出，不重画。每张的提示词、源文件和选择理由记在 \`generation-manifest.json\`。`,
    ],
  };
};
const EFFECT_ASSETS = [
  elementSheet({
    id: 's6-01-fire-smoke',
    zh: 'S6-01 火与烟',
    cols: 3,
    rows: 3,
    about: [
      '3×3 宫格，每格 512×341，透明底。第一行火焰小、中、大；第二行蔓延的火（宽而低）、火星余烬、焦痕贴花（俯视地面）；第三行淡烟团、上升的烟柱、黑烟。',
      '程序把四种火焰轮换显示，加缩放、闪烁、明暗；烟团向东北飘升、变大、淡出；焦痕贴在器械和地面上（MVP 计划 §8.3）。',
      '风格参考是 S2-01 定稿全图的一块（`style-reference.png`），火和烟要像同一幅画里画出来的。',
    ],
    subject:
      'A sheet of separate painted effect elements of fire and smoke for a strategy game, nine elements.',
    items: [
      'Top row, flames standing on an invisible ground line near the bottom of each cell: a small flame (a hand-sized tongue of fire); a medium fire; a large roaring fire, about three times as tall as the small one.',
      'Middle row: a low spreading fire, wide and short, as fire running along timber; a loose cluster of sparks and glowing embers drifting upward; a scorch mark decal: a blackened, charred patch of ground with ash and a few cinders, seen from above at the map camera angle, flat on the ground.',
      'Bottom row: a single soft puff of pale grey smoke; a rising column of grey smoke, tall and narrow, leaning slightly to the upper right; a heavy billow of thick black smoke.',
    ],
    uploads: [MAP_STYLE_REF],
    styleLine: EFFECT_STYLE,
    checks: [
      '火焰三种大小明显不同；烟是半透明的灰墨，不是一块实心的灰。',
      '焦痕是平贴地面的，从斜俯视看是扁的。',
    ],
  }),
  elementSheet({
    id: 's6-02-impacts',
    zh: 'S6-02 冲击',
    cols: 3,
    rows: 3,
    about: [
      '3×3 宫格，每格 512×341，透明底。第一行尘爆小、中、大；第二行碎木、碎石、礌石两块；第三行插在雪里的箭簇、插在墙面上的箭簇、瓦砾堆。',
      '冲车撞门、礌石落地、石磨砸冲车时出尘爆和碎片，碎片由程序四散；箭由程序画成墨线，落地后换成插着的箭簇（MVP 计划 §8.3）。',
    ],
    subject:
      'A sheet of separate painted impact and debris elements for a siege battle in a strategy game, nine elements.',
    items: [
      'Top row, bursts of snow-dust and earth thrown up by an impact, sitting on an invisible ground line near the bottom of each cell: small, medium, large.',
      'Middle row: a scatter of broken wooden splinters and planks flying apart; a scatter of broken stone and brick fragments; two heavy rough-hewn stone boulders (礌石) of the kind defenders drop from walls, side by side.',
      'Bottom row: four arrows stuck at angles into a patch of snow, seen from the map camera; four arrows stuck into a vertical brick wall face, seen from the front, with only the arrows and a few chips of brick (no wall); a low pile of broken roof tiles and bricks (rubble).',
    ],
    uploads: [MAP_STYLE_REF],
    styleLine: EFFECT_STYLE,
    checks: ['尘爆是半透明的，边缘散开。', '墙上的箭簇只画箭和几点碎砖，不画墙。'],
  }),
  elementSheet({
    id: 's6-03-icons-siege',
    zh: 'S6-03 图标表一：器械、反制、军令',
    cols: 4,
    rows: 3,
    about: [
      '4×3 宫格，每格 384×341，十二个图标：云梯、冲车、土车、井阑；火箭、石磨、礌石、筑重墙；鼓舞、督造、轮换、死守（MVP 计划 §4.7–§4.9）。',
      '墨色剪影加一点朱红，不带外框；底框、选中态、灰显由界面代码画，所以图标本身要简单（32px 还认得出）。',
    ],
    subject: 'A sheet of twelve user-interface icons for a Three Kingdoms siege strategy game.',
    items: iconItems([
      'siege ladder cart (云梯): a wheeled cart with a tall leaning ladder',
      'battering ram (冲车): a roofed wheeled shed with a ram beam sticking out',
      'earth cart (土车): a small two-wheeled barrow heaped with earth',
      'siege tower (井阑): a tall timber tower on wheels with a platform on top',
      'fire arrow (火箭): an arrow whose head is wrapped in flame (the flame is the vermilion accent)',
      'millstone drop (石磨): a heavy round millstone hanging from a rope, about to fall',
      'dropped boulders (礌石): two boulders falling with short speed strokes',
      'build the inner wall (筑重墙): a short rammed-earth wall between wooden shuttering boards with a rammer',
      'rally (鼓舞): a war drum with crossed drumsticks',
      'speed up construction (督造): a carpenter’s square crossed with a mallet',
      'rotate troops (轮换): two curved arrows chasing each other around a small tent',
      'hold fast (死守): a tall shield planted firmly, with a single upright spear behind it',
    ]),
    uploads: ['不上传参考图。'],
    styleLine: ICON_STYLE,
    checks: [
      '十二个图标笔画粗细和大小一致，每个只有一处朱红。',
      '缩到 32px 每个都还认得出、彼此不混。',
    ],
  }),
  elementSheet({
    id: 's6-04-icons-state',
    zh: 'S6-04 图标表二：高度、登城、填堑、余粮、援军等',
    cols: 4,
    rows: 3,
    about: [
      '4×3 宫格，每格 384×341，十二个图标：高度、登城、填堑、城门；城墙、余粮、援军、士气；兵力、伤兵、日、夜修（MVP 计划 §4、§7）。',
      '画风同 S6-03，两张表放在一起要像一套。',
    ],
    subject:
      'A sheet of twelve user-interface icons for a Three Kingdoms siege strategy game, a companion set to an existing sheet of engine and order icons.',
    items: iconItems([
      'height (高度): three stacked steps rising to the right',
      'climb the wall (登城): a ladder leaning on a crenellated wall top, with an upward arrow stroke',
      'fill the trench (填堑): a basket tipping earth into a narrow ditch',
      'city gate (城门): a gate tower over a pair of closed studded doors',
      'city wall (城墙): a short crenellated wall section',
      'grain supply (余粮): a tied grain sack with a few spilled grains',
      'reinforcements (援军): a galloping horse head with a pennant streaming behind',
      'morale (士气): a battle flag streaming in the wind on a short pole',
      'troop strength (兵力): three spears standing upright side by side',
      'wounded (伤兵): a broken spear with a bandage wrapped around it',
      'day (日): a sun disc with a few short brush rays (the disc is the vermilion accent)',
      'night repair (夜修): a crescent moon above a mallet',
    ]),
    uploads: ['不上传参考图；出图后和 S6-03 放在一起看。'],
    styleLine: ICON_STYLE,
    checks: ['和 S6-03 放在一起像同一套。', '缩到 32px 每个都还认得出。'],
  }),
  {
    id: 's6-05-paper',
    stage: 'S6',
    zh: 'S6-05 卷轴横幅和面板纸纹',
    size: [1536, 1024],
    noImage: true,
    about: [
      '四件，都留白（字由程序写）：上方一条完整的横幅卷轴（两端木轴，中间纸面）；下方左一块面板纸纹（方形，程序做无缝平铺）；下方右上一块名牌（窄长的木框纸牌）；右下一块对话框底（锦缎镶边的纸面）。',
      '横幅由程序从中间切开卷起、展开（MVP 计划 §8.3）：两端木轴各切一段，中间纸面横向重复。面板纸纹出图后由脚本做成可平铺。',
    ],
    prompts: () => [
      {
        text: [
          'Output: an image exactly 1536 by 1024 pixels. Four separate blank paper and silk pieces for the interface of a Three Kingdoms strategy game, laid out without overlapping:',
          [
            '- Top, across almost the whole width (x=64..1472, y=96..352): a horizontal hanging scroll, unrolled: a long strip of warm cream rice paper mounted on pale blue-grey silk borders, with a dark lacquered wooden roller at each end capped with small bronze ends. The paper is completely blank and evenly textured along its length, so its middle can be repeated.',
            '- Bottom left (x=64..640, y=448..1024): a square of plain warm rice paper with subtle fibres and faint watercolour mottling, completely blank, even in tone from edge to edge.',
            '- Bottom right, upper (x=768..1472, y=448..640): a narrow horizontal name plaque: a thin dark wooden frame around blank cream paper.',
            '- Bottom right, lower (x=768..1472, y=704..992): a dialogue panel: blank cream paper mounted in a narrow border of muted indigo brocade with a fine cloud pattern.',
          ].join('\n'),
          'Seen straight on, flat, evenly lit, no perspective and no cast shadows. Traditional Chinese mounting craft, restrained and elegant, matching a game painted in ink and light colour.',
          TRANSPARENT_OUT,
          'Do not include: any text, letters, calligraphy, seals or signatures on any piece; ornaments on the blank paper; grid lines or guide marks; backgrounds; modern objects.',
        ].join('\n\n'),
      },
    ],
    uploads: ['不上传参考图。'],
    checks: ['四件纸面都完全空白。', '横幅中间纸面纹理均匀，可以横向重复；面板纸纹整块色调均匀。'],
    naming: '依次命名 `v1.webp`、`v2.webp`……（无损 webp，保留透明通道）。',
  },
];

// ---------------------------------------------------------------------------
// S7 story illustrations and key visual (MVP plan §3, §8.2; art plan A07,
// I01–I03). Full painted scenes in the map's ink-and-light-colour style but
// framed like narrative paintings, not with the game camera. Every upload
// starts with a crop of the approved S2-01 map (s7-01-key-visual/
// style-reference.png) for style and architecture; scenes with named people
// add their portraits for costume and identity only.
const STORY_STYLE_REF =
  '`docs/siege/chencang/art/s7-01-key-visual/style-reference.png`（第一张：S2-01 定稿全图南半城，风格和建筑参考）';
const PORTRAIT_REF = {
  zhuge: '`public/assets/v03/portraits/zhugeliang.webp`（诸葛亮立绘，只作人物参考）',
  hao: '`docs/siege/chencang/art/s5-07-portrait-hao-zhao/attempts/v1.webp`（郝昭立绘，只作人物参考）',
  jin: '`docs/siege/chencang/art/s5-09-portrait-jin-xiang/attempts/v2.webp`（靳详立绘，只作人物参考）',
};
const STORY_STYLE =
  'Style: a traditional Chinese narrative painting in ink and light colour (水墨淡彩) on warm rice paper, matching the first attached painting in brushwork, line weight and palette: the city wall, gate tower and timber drawn with the fine ruled ink lines of jiehua (界画), people and landscape in looser expressive ink with soft transparent washes; restrained winter palette of paper-white snow, ochre earth, grey brick, slate roofs, Shu-Han jade green with red trim and Wei deep indigo, with fire in vermilion and orange washes. Painterly and atmospheric, with generous calm empty areas; not a photograph, not 3D, not anime.';
const STORY_CAST =
  'The attached portraits after the first image only show who the named people are (face, headwear and dress); paint them as small or medium figures in the scene, not as portraits. Shu-Han soldiers wear jade-green padded coats with red trim and rounded iron helmets; Wei soldiers wear deep indigo coats over black lacquered lamellar and round iron helmets.';
const EXCLUDE_STORY =
  'Do not include: any text, letters, calligraphy, seals or signatures; borders or frames; gore or blood; modern objects; anachronistic stirrup-era plate armour or European weapons.';
const storyAsset = ({ id, zh, about, scene, refs = [], checks }) => ({
  id,
  stage: 'S7',
  zh,
  size: [1536, 1024],
  noImage: true,
  about,
  prompts: () => [
    {
      text: [
        `Output: a landscape painting exactly 1536 by 1024 pixels. ${scene}`,
        'Setting: the siege of Chencang, a small Wei frontier fortress in the snowy Wei River valley, winter of 228 AD; the walled city has brick-faced rammed-earth walls, a two-storey timber gate tower over the south gate with a wooden bridge across a frozen trench.',
        ...(refs.length ? [STORY_CAST] : []),
        STORY_STYLE,
        EXCLUDE_STORY,
      ].join('\n\n'),
    },
  ],
  uploads: [STORY_STYLE_REF, ...refs.map((r) => PORTRAIT_REF[r])],
  checks: [
    '和 S2-01 全图、S5 立绘放在一起是同一套画风；城门楼、城墙和全图里的一致。',
    '没有任何文字、印章、外框；没有血腥。',
    ...checks,
  ],
  naming: '依次命名 `v1.webp`、`v2.webp`……（1536×1024）。',
});

// Chosen attempt per S7 illustration, with why (details in generation-manifest.json).
const STORY_PICKS = {
  's7-01-key-visual': [
    'v2.webp',
    '左上是安静的夜空，能放标题；燃烧的云梯、城头的郝昭、近景的诸葛亮都清楚',
  ],
  's7-02-opening-persuasion': ['v1.webp', '纸色天空和全图一致；靳详在桥头举手喊话，郝昭在城头听'],
  's7-03-opening-refusal': ['v1.webp', '拒绝的手势最有力，郝昭和立绘一致；旗面空白'],
  's7-04-fire-arrows': [
    'v2.webp',
    '火箭往下射、两架云梯着火、蜀兵后撤；v1、v3 照搬了全图那块的构图（连城内都画了）',
  ],
  's7-05-ending-fall': [
    'v3.webp',
    '只有这张是四轮小车由兵推着（v1、v2 画成了马拉的有篷车）；城门破、城头换上红旗',
  ],
  's7-06-ending-withdrawal': ['v1.webp', '远处蜀军撤上山道，近景魏骑冲进伏弩，没有血腥'],
  's7-07-ending-rout': [
    'v1.webp',
    '器械焦毁、蜀军扶伤后撤、魏军城头欢呼、山脊上援军出现；v3 画了配重投石机，不合时代',
  ],
};
const withStoryPick = (asset) => {
  const [final, why] = STORY_PICKS[asset.id] ?? [];
  if (!final) return asset;
  return {
    ...asset,
    final,
    about: [
      ...asset.about,
      `**2026-11-02 选定 \`attempts/${final}\`**：${why}。四角和旗面在原尺寸下查过，没有印章、落款和文字。运行时用的 1536×1024 和 768×512 在 \`runtime/\`；每张的提示词、源文件和选择理由记在 \`generation-manifest.json\`。`,
    ],
  };
};
const STORY_ASSETS = [
  storyAsset({
    id: 's7-01-key-visual',
    zh: 'S7-01 主视觉：雪中陈仓',
    about: [
      '主视觉，也是开始画面"特别战役 · 陈仓之战"卡的底图（美术 A07、H07）。左上留出一块安静的地方给程序写标题。',
      '雪夜：一架云梯靠在南墙上烧着，火光映在雪上；郝昭立在门楼前的城头；诸葛亮坐四轮车在城下近景（背影或侧背影）。',
    ],
    refs: ['zhuge', 'hao'],
    scene:
      'The key visual of a strategy game campaign: the south gate of Chencang on a snowy night. The wall and its two-storey gate tower rise across the right two thirds of the picture, seen from the south and a little below; a scaling ladder leans against the wall to the left of the gate and is burning, its fire throwing warm orange light over the snow and the brick and sending smoke up into the falling snow. On the wall top beside the gate tower stands Hao Zhao, the Wei commander, in a dark red cloak and an iron helmet with a short red plume, looking down, with a few Wei archers along the parapet. In the near foreground at lower left, seen from behind and a little to the side, Zhuge Liang sits in his small four-wheeled carriage in a white crane-feather cloak and dark silk kerchief cap, holding a white feather fan, looking up at the wall, with a line of Shu-Han soldiers and banners on blank silk behind him. Keep the upper left third of the picture quiet (dark sky and falling snow) for a title the game will add.',
    checks: [
      '左上三分之一安静，能放标题。',
      '火光是画面的焦点；诸葛亮和郝昭一个在城下、一个在城头，一眼看得出对峙。',
    ],
  }),
  storyAsset({
    id: 's7-02-opening-persuasion',
    zh: 'S7-02 开场一：靳详城下劝降',
    about: ['开场第一张（美术 I01）：靳详在城下喊话劝降，郝昭在城头听。白天，雪后。'],
    refs: ['jin', 'hao'],
    scene:
      'Opening scene: Jin Xiang, an envoy and old acquaintance of the defender, stands before the south gate of Chencang on a clear winter morning after snow and calls up to the wall to urge its surrender. He is a civilian in a soft black headcloth, a plain dark-green travelling robe and a fur-trimmed cloak, standing at the near end of the wooden bridge over the frozen trench with one hand raised, two Shu-Han attendants a few steps behind him. Above him the brick wall and the closed gate rise steeply; on the wall top Hao Zhao in his dark red cloak and red-plumed helmet leans on the parapet listening, among a few Wei soldiers. In the far distance to the south, the tents and banners of the Shu-Han camp under the snowy foothills. A calm, tense moment, no fighting.',
    checks: ['靳详是文人、没有甲胄；郝昭在城头。', '没有交战，气氛平静而紧张。'],
  }),
  storyAsset({
    id: 's7-03-opening-refusal',
    zh: 'S7-03 开场二：郝昭城头拒降',
    about: ['开场第二张（美术 I01）：郝昭在门楼前的城头拒绝，手按剑，守军张弓待命。'],
    refs: ['hao'],
    scene:
      'Opening scene: Hao Zhao refuses to surrender. A closer view on the wall top of Chencang beside the two-storey gate tower, seen from slightly below along the parapet: Hao Zhao stands at the crenellated parapet in his dark red cloak, black lacquered armour and iron helmet with a short red plume, one hand on his sword hilt, the other raised flat in refusal, his face stern. Along the wall behind him Wei archers in deep indigo coats stand ready with arrows nocked, and a square deep-indigo banner with a blank face flies from the gate tower. Below and beyond the wall, small in the distance, the Shu-Han army waits on the snowy plain before its camp. Late afternoon light, light snow.',
    checks: ['郝昭的拒绝姿态清楚，像 S5-07 立绘里的那个人。', '旗面空白，没有字。'],
  }),
  storyAsset({
    id: 's7-04-fire-arrows',
    zh: 'S7-04 幕间：火箭逆射，烧毁云梯',
    about: ['第一幕中的事件插画（美术 I02）：守军火箭逆射，云梯着火，梯上的蜀兵往下撤。'],
    scene:
      'Event scene: the defenders burn the scaling ladders. Dusk, snow falling. Along the south wall of Chencang, Wei archers in deep indigo lean between the crenels and loose fire arrows downward, the burning arrowheads drawing short streaks of light. Two Shu-Han scaling ladders leaning against the wall have caught fire; flames climb their rails and black smoke rolls up the brick face; Shu-Han soldiers in jade green scramble down the ladders and fall back across the half-filled trench, shields raised. In the foreground, the wheeled ladder carts and a few soldiers with earth baskets, lit orange by the fire. Dramatic but without gore.',
    checks: ['火箭从城头往下射，云梯在烧；没有血腥。'],
  }),
  storyAsset({
    id: 's7-05-ending-fall',
    zh: 'S7-05 结局：陈仓陷落（架空）',
    about: ['架空结局"陈仓陷落"（美术 I03）：南门已破，蜀军涌入，城头换上蜀军的旗。'],
    refs: ['zhuge'],
    scene:
      'Ending scene, the fall of Chencang: a grey winter morning after the battle. The south gate of Chencang stands broken open, its iron-studded doors smashed and hanging, the gate tower scorched and missing tiles but standing; red Shu-Han banners with blank faces now fly from the gate tower and along the wall. A column of Shu-Han soldiers marches in through the gate over the wooden bridge; at the head of the column, Zhuge Liang rides in his small four-wheeled carriage in his white crane-feather cloak and kerchief cap, feather fan in hand. Thin smoke rises from inside the city; broken siege engines and scattered arrows lie in the snow in the foreground. Victorious but sober, not triumphant.',
    checks: ['城门破、城头换上蜀旗（旗面空白）；诸葛亮的车在入城队伍前头。'],
  }),
  storyAsset({
    id: 's7-06-ending-withdrawal',
    zh: 'S7-06 结局：粮尽退兵，王双追击被斩（史实）',
    about: [
      '史实结局（美术 I02）：粮尽，蜀军退回散关的山道；王双率魏骑追击，中伏。画成中伏的一刻，不画血腥。',
    ],
    scene:
      'Ending scene, the historical outcome: the Shu-Han army, its grain exhausted, withdraws southward into the snowy Qinling mountains. A long column of soldiers in jade green, carts and banners winds up a narrow valley road between steep snowy slopes and pines, small in the middle distance. In the foreground below a rocky bend of the road, a troop of Wei cavalry in deep indigo, led by a commander with a tall plume on a dark horse, gallops in pursuit straight into an ambush: Shu-Han crossbowmen rise from behind rocks and pines on the slopes above them, crossbows levelled, and the leading horses rear in alarm. Cold blue-grey evening light, falling snow. The moment of the trap springing, without gore.',
    checks: ['蜀军在远处撤入山道；近景魏骑中伏，没有血腥。'],
  }),
  storyAsset({
    id: 's7-07-ending-rout',
    zh: 'S7-07 结局：蜀军溃败（架空）',
    about: [
      '架空结局"蜀军溃败"（美术 I03）：器械烧毁，蜀军在雪地里溃退，城头魏军欢呼，远山上张郃援军的旗出现。',
    ],
    scene:
      'Ending scene, the defeat of the attackers: before the south wall of Chencang on a grey winter afternoon. Siege engines lie burnt and broken in the snow before the trench, still smoking; Shu-Han soldiers in jade green fall back across the snowy plain in disorder, some helping wounded comrades, banners trailing. On the intact wall the Wei defenders in deep indigo raise their weapons and banners, the deep-indigo commander’s banner flying from the gate tower. On the hills far to the east, a dark line of Wei cavalry with many banners appears over the ridge: the relief army arriving. Bleak and cold, without gore.',
    checks: ['城墙完好、魏军在城头；蜀军溃退；远处山脊出现援军。'],
  }),
];

const ASSETS = [
  {
    id: 's1-01-city-vignette',
    zh: 'S1-01 陈仓全城小景',
    size: [1536, 1024],
    final: CHOSEN_VIGNETTE,
    about: [
      '取景 x 12–35、y 1–21（24×21 格），每格 64×48、每层 24px，正好是游戏 100% 缩放的分辨率，不用放大；底部多出 16px。',
      '出三张，提示词只差风格段：A 界画淡彩、B 写意淡彩、C 沙盘微缩。你选定风格后，选中的那张也是 α 法（整画切层）的测试图，`masks/` 就是切层用的蒙版。',
      '已出两轮（2026-11-01，记录在 `generation-manifest.json`，三张对比在 `comparison-v2.png`）。第一轮（v1）没有最前面的"Style priority"段，结果加了树和石头，三种风格也太像；第二轮（v2）加了这一段，就是下面的提示词。',
      '叠 `grid.png` 量过：v2-a、v2-c 的墙、门楼、营房都在 1/4 格以内；v2-b 的南门桥向南多出约 20px；v2-c 的南门楼屋脊高出约 18px。v2-a 的墙顶内沿也画了垛口（灰盒只在外沿有），对 α 法切层影响不大。',
      '**2026-11-01 定稿：A 界画淡彩，`attempts/v2-a.webp`**。S1-02 以后都上传它作风格参考；它也是 α 法的测试图。',
    ],
    render() {
      const canvas = createCanvas(1536, 1024, C.snow);
      // Camp pieces stay out of the locked S1 frame (the workshop roofs reach it).
      const objects = cityObjects({ ramps: false }).filter((o) => !PIECE_KINDS.has(o.kind));
      renderScene(canvas, VIGNETTE, objects);
      return { canvas, frame: VIGNETTE, masks: true, objects };
    },
    prompts(keys) {
      return Object.entries(STYLES).map(([k, s]) => ({
        title: s.zh,
        file: `v2-${k}.webp`,
        text: [
          s.scene,
          FIDELITY,
          PROJECTION,
          'Subject: the walled fortress of Chencang seen from the south, a battlefield map for a Three Kingdoms strategy game. Output 1536×1024, landscape, filled edge to edge. In the block-out, one grid cell is 64 pixels wide and 48 pixels deep, and one height level is 24 pixels.',
          `Block-out legend (each colour means exactly this):\n${legendText(SCENE_LEGEND, keys)}`,
          'Setting: Chencang, a small but formidable Wei frontier fortress in the Wei River valley, winter of 228 AD. Compact and military rather than grand: brick-faced rammed-earth walls, a deep trench, trampled paths, snow on every roof and walkway. A clear, cold winter day.',
          LIGHT,
          s.text,
          SURFACES,
          EXCLUDE_SCENE,
        ].join('\n\n'),
      }));
    },
    uploads: ['`blockout.png`'],
    checks: ['整体好不好看，三种风格哪种最好。', ...sceneChecks],
    naming: '第一轮是 `v1-a.webp`、`v1-b.webp`、`v1-c.webp`，第二轮 `v2-*`；再出就用 `v3-*`。',
  },
  {
    id: 's1-02-south-gate',
    zh: 'S1-02 南门门楼（标准件）',
    size: [1024, 1024],
    final: CHOSEN_GATE,
    about: [
      '取景 x 21–26：6 格城墙，城门洞 x 23–24，门楼 x 22–25（两层，屋脊在 7 层）。每格 128×96、每层 48px，是 100% 的 2 倍。',
      '只画物件本身：底边是地面线，不含地面和堑。',
      '这一件定了就是**标准件**：从 S1-03 起，每件都上传它当风格参考。',
      '**2026-11-01 定稿：`attempts/v4.webp`**。它是 v3 抠掉背景后的版本：四角纯品红。透明版是 `selected-transparent.png`（复制自仓库根目录出图工作区的 `attempts/s1-02/v4-transparent.png`），预览页的 β 对照用它拼城。每一轮实际用的提示词记在 `generation-manifest.json`。v1 没有对位坐标段，屋顶偏高、门下漏出缺口；v2 起加了坐标段才对齐，下面的提示词已由脚本自动生成这一段。',
    ],
    render() {
      const canvas = createCanvas(1024, 1024, C.magenta);
      const objects = [
        wallEW('wall-south-w', 21, 21, 16, 'south'),
        wallEW('wall-south-e', 26, 26, 16, 'south'),
        gateSouth(),
      ];
      const frame = renderPiece(canvas, SCALE_2X, objects, [0, 0, 1024, 1024]);
      return { canvas, frame, objects };
    },
    prompts: (keys, { frame, objects }) => [
      {
        text: [
          spriteOutput([1024, 1024]),
          [
            'Registration landmarks on this canvas (pixel boxes measured from the block-out):',
            ...landmarkLines(frame, objects).map((line) => `- ${line}`),
            LANDMARK_RULE,
          ].join('\n'),
          MATCH_VIGNETTE,
          STYLES[CHOSEN_STYLE].piece,
          FIDELITY_FIRST,
          PROJECTION,
          'Subject: one building piece for a strategy game: the south gate of Chencang. A six-cell section of the city wall (rammed earth faced with grey brick, three levels high, a light walkway on top, a crenellated parapet along the front edge and only a low plain kerb along the back edge) with a two-cell gate passage in the middle. Heavy iron-studded timber gate doors stand closed inside the passage. On the wall above the passage stands a two-storey timber gate tower: red-lacquered columns, white plastered walls with lattice windows, a wooden gallery around the upper storey, and a snow-covered grey tile hip-and-gable roof with gently upturned eaves. In the block-out the red panel marks the gate passage: paint it as a dark gateway with the closed doors inside, never red. Output 1024×1024. In the block-out, one grid cell is 128 pixels wide and 96 pixels deep, and one height level is 48 pixels.',
          SPRITE,
          LIGHT_SPRITE,
          STYLES[CHOSEN_STYLE].text,
          EXCLUDE_SPRITE,
        ].join('\n\n'),
      },
    ],
    uploads: ['`blockout.png`', VIGNETTE_UPLOAD],
    checks: [
      '和选定的 S1-01 是不是同一套笔法、颜色和光照；细节比 S1-01 多，但不能变成另一种画法。',
      '比例、线条、歇山顶、积雪、立面明暗、门扇。',
      '门楼两层，屋脊是灰盒里的最高点；城墙三层高，墙顶走道和外沿女墙清楚。',
      '背景是纯品红，没有地面、堑和落地影子。',
      '把 `grid.png` 叠上去：墙顶、门楼的位置和灰盒对得上。',
    ],
    naming: '依次命名 `v1.webp`、`v2.webp`……',
  },
  {
    id: 's1-03-wall-kit',
    zh: 'S1-03 城墙模块表',
    final: 'v4.webp',
    size: [1536, 1024],
    about: [
      '3×2 宫格，每格 512×512 放一件；每格 128×96、每层 48px，同 S1-02。',
      '六件：上排是南墙直段（3 格）、西南角楼、东南角楼；下排是西墙段（南北向 2 格）、东墙段（2 格）、北墙直段（3 格，从城内看）。',
      '和计划初稿相比：南墙直段从 4 格改成 3 格、西墙段从 3 格改成 2 格，否则放不进 512 格还留 32px 边；西门（一层门楼）高 3 格、放不下，挪到 S2 和东门一起做，这里换成北墙直段，补上"从城内看女墙"这种情况。',
      '2026-11-01 完成四版，采用 `attempts/v4.webp`。透明表见 `selected-transparent.png`，六个独立件在 `pieces/`，锚点和占地见 `pieces.json`，完整提示词及检查见 `generation-manifest.json`。',
      '同日画法定 α（计划 §9.2）：城墙都画在整画里，这套模块不进游戏，只在预览页作 β 对照。',
    ],
    render() {
      const canvas = createCanvas(1536, 1024, C.magenta);
      // Ids are unique across the sheet so each piece gets its own bbox.
      const pieces = [
        ['南墙直段', [wallEW('p1-wall-south', 15, 17, 16, 'south')]],
        [
          '西南角楼',
          [
            wallNS('p2-wall-west', 14, 15, 15, 'west'),
            wallEW('p2-wall-south', 15, 15, 16, 'south'),
            cornerTower('p2-corner-sw', 14, 16),
          ],
        ],
        [
          '东南角楼',
          [
            wallNS('p3-wall-east', 33, 15, 15, 'east'),
            wallEW('p3-wall-south', 32, 32, 16, 'south'),
            cornerTower('p3-corner-se', 33, 16),
          ],
        ],
        ['西墙段', [wallNS('p4-wall-west', 14, 12, 13, 'west')]],
        ['东墙段', [wallNS('p5-wall-east', 33, 12, 13, 'east')]],
        ['北墙直段', [wallEW('p6-wall-north', 15, 17, 4, 'north')]],
      ];
      const frames = renderSheet(
        canvas,
        SCALE_2X,
        pieces.map(([zh, objects], i) => [
          WALL_KIT_NAMES[i],
          zh,
          [(i % 3) * 512, Math.floor(i / 3) * 512, 512, 512],
          objects,
        ]),
      );
      return { canvas, frame: frames[0].frame, pieces: frames };
    },
    prompts: (keys, { pieces }) => [
      {
        text: [
          spriteOutput([1536, 1024]),
          [
            'Registration landmarks on this canvas (pixel boxes measured from the block-out):',
            ...pieces.flatMap((p, i) => [
              `Piece ${p.piece} (${i < 3 ? 'top' : 'bottom'} row, ${['left', 'middle', 'right'][i % 3]}), ${p.name}:`,
              ...landmarkLines(p.frame, p.objects).map((line) => `- ${line}`),
            ]),
            LANDMARK_RULE,
          ].join('\n'),
          MATCH_STANDARD,
          STYLES[CHOSEN_STYLE].piece,
          FIDELITY_FIRST,
          PROJECTION,
          [
            'Subject: a modular kit of city-wall pieces for a strategy game, six separate pieces arranged in a 3 by 2 grid exactly as in the block-out, one piece centred in each 512×512 cell, with clear empty space between pieces. All pieces share the same wall: rammed earth faced with grey brick, three levels high, a light walkway on top with a crenellated parapet along the outer edge and only a low plain kerb along the inner edge, snow on every top surface.',
            'Top row, left to right: a straight three-cell section of the south wall, parapet along its front (south) edge; the south-west corner, where the south wall meets the west wall, with a small one-storey corner tower; the south-east corner, the same mirrored.',
            'Bottom row, left to right: a two-cell section of the west wall running north-south, so only its top walkway and its southern end face are visible, parapet along the west edge; the same for the east wall, parapet along the east edge; a straight three-cell section of the north wall seen from inside the city, parapet along its back (north) edge, so the inner face of the parapet shows above the walkway.',
            'In the block-out, one grid cell is 128 pixels wide and 96 pixels deep, and one height level is 48 pixels.',
          ].join('\n'),
          SPRITE,
          LIGHT_SPRITE,
          STYLES[CHOSEN_STYLE].text,
          EXCLUDE_SPRITE,
        ].join('\n\n'),
      },
    ],
    uploads: ['`blockout.png`', GATE_UPLOAD],
    checks: [
      '六件和 S1-02 是不是同一套笔法、颜色和光照。',
      '南北向墙段只见墙顶和南端截面，没有画出东西侧面。',
      '直段左右两端、南北墙段上下两端能不能无缝拼接。',
      '女墙都在外沿；北墙那件看得到女墙的内侧。',
    ],
    naming: '依次命名 `v1.webp`、`v2.webp`……',
  },
  {
    id: 's1-04-ground-plate',
    zh: 'S1-04 地表底板',
    final: 'v2.webp',
    size: [1536, 1024],
    about: [
      '取景同 S1-01。灰盒里的城墙和建筑都压平成暗灰色地基（`#5a5650`），只留地面。',
      'β 法的 L1 地表层：上面再摆 S1-02、S1-03 的分件。画法定 α 后不进游戏，只在预览页作 β 对照。',
      '2026-11-01 完成三版，采用 `attempts/v2.webp`；北桥及地基已按灰盒复核，完整提示词及检查见 `generation-manifest.json`。',
    ],
    render() {
      const canvas = createCanvas(1536, 1024, C.snow);
      renderScene(
        canvas,
        VIGNETTE,
        cityObjects({ ramps: false }).filter((o) => !PIECE_KINDS.has(o.kind)),
        {
          flat: true,
        },
      );
      return { canvas, frame: VIGNETTE };
    },
    prompts: (keys) => [
      {
        text: [
          MATCH_VIGNETTE,
          STYLES[CHOSEN_STYLE].scene,
          FIDELITY_FIRST,
          PROJECTION,
          'Subject: the ground layer only of a battlefield map for a strategy game: the site of the walled fortress of Chencang in the snow, with every wall and building removed. Output 1536×1024, landscape, filled edge to edge. One grid cell is 64 pixels wide and 48 pixels deep.',
          `Block-out legend:\n${legendText(GROUND_LEGEND, keys)}`,
          'Setting: Chencang, Wei River valley, winter of 228 AD. A clear, cold winter day.',
          LIGHT_GROUND,
          STYLES[CHOSEN_STYLE].text,
          SURFACES_GROUND,
          EXCLUDE_SCENE,
        ].join('\n\n'),
      },
    ],
    uploads: ['`blockout.png`', VIGNETTE_UPLOAD],
    checks: [
      '和选定的 S1-01 是不是同一套笔法和颜色。',
      '地基是平的暗灰色地块，没有画出墙、房子或瓦砾。',
      '堑的北岸土壁、桥、路和 S1-01 对得上。',
    ],
    naming: '依次命名 `v1.webp`、`v2.webp`……',
  },
  {
    id: 's1-05-shu-halberd-sheet',
    zh: 'S1-05 蜀戟兵姿态表',
    final: 'v5.webp',
    size: [1536, 1024],
    guide: { cols: 3, rows: 3, figure: 240, foot: 24 },
    about: [
      '3×3 宫格，每格约 512×341：行是背面（朝北）、侧面（朝东）、正面（朝南），列是待机、行进、攻击。',
      '人物从脚底到头盔顶约 240px（计划初稿写 280px，但格子只有 341px 高，戟会顶出格子），戟可以高出头顶线。',
      '2026-11-01 完成五版，采用 `attempts/v5.webp`，已缩短正面突刺的戟尖。透明表见 `selected-transparent.png`；九个独立姿态在 `poses/`，逐格缩放及脚底锚点见 `poses.json`，提示词及检查见 `generation-manifest.json`。',
    ],
    prompts: () => [
      {
        text: [
          [
            'Subject: a character pose sheet of one Shu-Han halberd infantryman for a strategy game, the same soldier drawn nine times. Arrange the sheet as a 3 by 3 grid of equal cells (512×341 pixels each) exactly as in the first attached guide: one full-body figure per cell, every figure the same size (about 240 pixels from the soles to the top of the helmet, up to the dashed line; the halberd may reach higher), feet on the solid baseline.',
            'Rows, top to bottom: seen from behind, facing away (north); seen from the side, facing right (east); seen from the front, facing the viewer (south).',
            'Columns, left to right: standing ready; marching mid-stride; attacking, thrusting the halberd forward.',
            'Camera: the same orthographic three-quarter top-down camera as the battlefield, about 50 degrees from above, so the top of the helmet and the shoulders are visible and the figure is slightly foreshortened.',
            'The soldier: a late Eastern Han infantryman in a bright jade-green (#5f9a5a) padded war coat with red (#a8432f) trim over dark iron lamellar armour, a fur-lined collar against the winter cold, a rounded iron helmet with a neck guard, wrapped leggings and boots, a ji (戟) halberd and a small round wooden shield. No facial features, like the reference figure. Identical armour, colours, weapon and proportions in every cell.',
            'Style: match the second attached reference figure exactly in brushwork and colour handling: bold dark ink outline, flat ink-textured colour fills, no facial features. Match its style only, not its camera angle.',
            'Light: low winter sun from the lower left (south-west); shade the figure only, with no cast shadow.',
          ].join('\n'),
          SPRITE,
          EXCLUDE_UNIT_SHEET,
        ].join('\n\n'),
      },
    ],
    uploads: [
      '`guide.png`',
      '`docs/v0.3/assets/generated/units-count-ink-04/infantry.png`（第二张）',
    ],
    checks: [
      '把图缩到约 1/7（人物约 36px 高）看：三个朝向、三个姿势是否都看得懂。',
      '和现有 ink-04 步兵是不是同一套画风。',
      '九格是同一个人：甲胄、颜色、兵器、比例一致，脚都踩在基线上。',
    ],
    naming: '依次命名 `v1.webp`、`v2.webp`……',
  },
  {
    id: 's1-06-wei-archer-sheet',
    zh: 'S1-06 魏弓兵姿态表',
    final: 'v4.webp',
    size: [1536, 1024],
    guide: { cols: 3, rows: 2, figure: 300, foot: 56 },
    about: [
      '3×2 宫格，每格 512×512。第一行正面（朝南）的待机、拉弓、放火箭；第二行背面待机、侧面（朝东）待机、侧面拉弓。',
      '人物从脚底到头盔顶约 300px。',
      '2026-11-01 完成四版，采用 `attempts/v4.webp`。透明表见 `selected-transparent.png`；六个独立姿态在 `poses/`，逐格缩放及脚底锚点见 `poses.json`，提示词及检查见 `generation-manifest.json`。',
    ],
    prompts: () => [
      {
        text: [
          [
            'Subject: a character pose sheet of one Wei archer for a strategy game, the same soldier drawn six times. Arrange the sheet as a 3 by 2 grid of equal cells (512×512 pixels each) exactly as in the first attached guide: one full-body figure per cell, every figure the same size (about 300 pixels from the soles to the top of the helmet, up to the dashed line), feet on the solid baseline.',
            'Top row, all seen from the front facing the viewer (south): standing ready; drawing the bow; loosing a fire arrow with a burning arrowhead.',
            'Bottom row: standing ready, seen from behind (north); standing ready, seen from the side facing right (east); drawing the bow, seen from the side facing right.',
            'Camera: the same orthographic three-quarter top-down camera as the battlefield, about 50 degrees from above, so the top of the helmet and the shoulders are visible and the figure is slightly foreshortened.',
            'The soldier: a Wei archer in a deep indigo (#2f4a6e) padded war coat over black lacquered lamellar armour, a fur-lined collar against the winter cold, a round iron helmet with a neck guard, a long recurve bow and a quiver at the hip. No facial features, like the reference figure. Identical armour, colours, bow and proportions in every cell.',
            'Style: match the second attached reference figure exactly in brushwork and colour handling: bold dark ink outline, flat ink-textured colour fills, no facial features. Match its style only, not its camera angle.',
            'Light: low winter sun from the lower left (south-west); shade the figure only, with no cast shadow.',
          ].join('\n'),
          SPRITE,
          EXCLUDE_UNIT_SHEET,
        ].join('\n\n'),
      },
    ],
    uploads: [
      '`guide.png`',
      '`docs/v0.3/assets/generated/units-count-ink-04/archer.png`（第二张）',
    ],
    checks: [
      '缩到人物约 36px 高看：三个朝向、拉弓和放火箭是否看得懂，火箭的箭头有火。',
      '和 S1-05 的蜀兵放在一起、再转成灰度，能否一眼分出蜀魏。',
      '六格是同一个人，脚都踩在基线上。',
    ],
    naming: '依次命名 `v1.webp`、`v2.webp`……',
  },
  {
    id: 's2-01-full-map',
    stage: 'S2',
    zh: 'S2-01 全图整画',
    size: MAP_SIZE,
    about: [
      '全图 3072×1536：48×32 格，每格 64×48、每层 24px，正好是游戏 100% 缩放的分辨率，原点在西北角。冰河以北多出的 24px 画成冰面。地图四边由程序淡出成纸色（留白），所以不画远山，B02 远景留到 S7。',
      '**城池本体直接用 S1-01 v2-a**，放在全图的 (768, 48)，不重画：它和灰盒对得准，蒙版已经能切。第 1 步在它上面补画八条马道，第 2–6 步以它为中心分五块向外扩画。',
      '整画里只画地面：营帐、木栅、辕门、工棚、树都是分件（S2-08～S2-11），这里只画营地踩实的雪地和林下的雪地。地道口留到 v0.2，这里画成雪地。',
      '每一步都是 ImageGen 的**编辑**：只上传一张 `inputs/<步>.png`，它是已画好的部分加上这一步要画的灰盒。`inputs/` 由 `node tools/compose-siege-map.mjs` 生成：脚本把已选定的各步拼起来，写出下一步的输入，以及拼图进度 `composite.webp`（100%）和 `preview.webp`（50%）。',
      '拼接：每块只取它新画的部分，在已画好的一侧留 48px 渐变；马道补画只取马道外扩 12px、再渐变 10px 的一圈。编辑会把已画的部分也轻微重画，所以脚本拼之前先找出整块的错位（±8px），对齐后再拼，并报出偏移和差值。',
      '选定一张后，把文件名填进 `tools/build-siege-blockout.mjs` 的 `MAP_PICKS`，重跑这个脚本，再跑 compose 脚本，就得到下一步的输入。',
      '`steps/` 里每步两张：`<步>-paint.png`（白色是这一步要画的地方；工具支持蒙版编辑时可以一起上传）和 `<步>-blend.png`（拼接权重）。`masks/`、`footprints.json` 用全图坐标，游戏按它们切层；`steps.json` 给 compose 脚本读。',
      '**2026-11-02 六步都已选定**（2026-11-02 你在审阅页确认）：马道 `city-v3`、西北 `nw-v1`、东北 `ne-v2`、南 `s-v6`、西南 `sw-v3`、东南 `se-v3`；compose 报的偏移都是 0,0，差值 5.3–9.0。南块第一轮（v1–v3）把十字路画到了营地边上，于是南、西南、东南三块的场景描述里写明了路和营地的像素位置，第二轮起都对。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh），每步每张的提示词、源文件和选择理由记在 `generation-manifest.json`。',
    ],
    render() {
      const canvas = createCanvas(...MAP_SIZE, C.ice);
      const objects = mapObjects();
      renderScene(canvas, FULL, objects, { terrain: mapTerrain });
      return { canvas, frame: FULL, masks: true, objects };
    },
    async write(dir, { canvas }, r) {
      const steps = mapSteps(canvas, r);
      await mkdir(join(dir, 'steps'), { recursive: true });
      for (const s of steps) {
        await writeFile(join(dir, 'steps', `${s.id}-paint.png`), png(...TILE, 1, s.paint));
        await writeFile(join(dir, 'steps', `${s.id}-blend.png`), png(...TILE, 1, s.blend));
      }
      const manifest = {
        canvas: MAP_SIZE,
        blockout: 'blockout.png',
        base: {
          source: `../s1-01-city-vignette/attempts/${CHOSEN_VIGNETTE}`,
          at: CITY_AT,
        },
        steps: steps.map((s) => ({
          id: s.id,
          name: s.zh,
          at: s.at,
          size: TILE,
          paint: `steps/${s.id}-paint.png`,
          blend: `steps/${s.id}-blend.png`,
          input: `inputs/${s.id}.png`,
          chosen: MAP_PICKS[s.id] ? `attempts/${MAP_PICKS[s.id]}` : null,
        })),
      };
      await writeFile(join(dir, 'steps.json'), await pretty(JSON.stringify(manifest), 'json'));
    },
    prompts(keys, rendered, r) {
      const [W] = MAP_SIZE;
      const tileKeys = (t) => {
        const found = new Set();
        for (const [x0, y0, x1, y1] of t.paint)
          for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
              const k = r.key[(y + t.at[1]) * W + x + t.at[0]];
              if (k !== 255) found.add(KEYS[k]);
            }
        return found;
      };
      return [
        {
          title: '第 1 步 · 马道补画（city）',
          note: '上传 `inputs/city.png`：v2-a 上贴了八块马道灰盒。出图存为 `attempts/city-v1.webp`、`city-v2.webp`……',
          text: rampPrompt(),
        },
        ...MAP_TILES.map((t, i) => ({
          title: `第 ${i + 2} 步 · ${t.zh}（${t.id}）`,
          note: `上传 \`inputs/${t.id}.png\`：要画的是 ${rects(t.paint).replaceAll(' and ', '、')}，其余已经画好。出图存为 \`attempts/${t.id}-v1.webp\`……`,
          text: tilePrompt(t, tileKeys(t)),
        })),
      ];
    },
    uploads: [
      '每一步只上传一张：`inputs/<步>.png`（编辑对象，先跑 `node tools/compose-siege-map.mjs` 生成）。工具支持蒙版编辑时，可以同时给 `steps/<步>-paint.png`。',
    ],
    checks: [
      '第 1 步：八条马道都在标出的范围里，坡面看得出高低，顶端接上墙顶走道；别处没变（compose 报的偏移应是 0,0，差值很小）。',
      '第 2–6 步：`preview.webp` 里看不出接缝；路、堑岸、丘陵、冰河和灰盒对得上（把 `grid.png` 叠在 `composite.webp` 上看）；新画的部分没有帐篷、木栅、树和石头。',
      '每块的笔法、纸纹和颜色深浅和城池那块一致，不发灰、不发黄。',
      'compose 报的偏移超过 ±4px，或者差值明显比别的块大，就重出这一块。',
    ],
    naming: '每步分开编号：`city-v1.webp`、`nw-v1.webp`……，保持 1536×1024 原尺寸，不缩放、不裁切。',
  },
  sheetAsset({
    id: 's2-08-camp-tents',
    zh: 'S2-08 中军帐和营帐',
    final: 'v2.webp',
    about: [
      '2×2 宫格，每格 768×512 放一件；每格 128×96、每层 48px，同 S1-02。',
      '左上是丞相中军帐（4×2 格，高 1.5 层）；其余三格是三种一格的营帐（高 1 层），游戏里随机排成行，所以大小、形状要一样，只是细节不同。',
      '帐上的旗由程序画，这里不画。',
      '**2026-11-02 选定 `attempts/v2.webp`**（2026-11-02 你在审阅页确认）：对位最准，中军帐在框内 16px 以内（雪檐略高），营帐连拉绳在 22px 以内；营帐的拉绳和地钉每边伸出约 20px，排成行时地钉相碰。透明版 `selected-transparent.png` 由 `attempts/key.py`（仓库根目录出图工作区）确定性抠出品红：不重画，不透明像素原样保留，边缘按背景色反混合去品红边。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh），每张的提示词、源文件和对位量测记在 `generation-manifest.json`。',
    ],
    slots: () => [
      ["the chancellor's command tent", '中军帐', [0, 0, 768, 512], [hqTent()]],
      ["soldiers' tent, variant A", '营帐 A', [768, 0, 768, 512], [tent(12, 27)]],
      ["soldiers' tent, variant B", '营帐 B', [0, 512, 768, 512], [tent(13, 27)]],
      ["soldiers' tent, variant C", '营帐 C', [768, 512, 768, 512], [tent(14, 27)]],
    ],
    subject: [
      'Subject: tents for the Shu-Han army camp in a strategy game, four separate pieces arranged in a 2 by 2 grid exactly as in the block-out, one piece centred in each 768×512 cell, with clear empty space between pieces.',
      "Top left: the chancellor's command tent (中军帐): a large rectangular ridge tent, four cells wide and two deep, of heavy dark red-lacquered canvas on a timber frame, the front curtain tied open, low wooden steps at the entrance, snow along the ridge. The grandest tent in the camp, but still a field tent rather than a building.",
      "Top right, bottom left and bottom right: three variants of a one-cell soldiers' tent: a small ridge tent of undyed hemp canvas with snow on its slopes and guy ropes pegged close. Variant A is closed; variant B has its front flap tied back, showing a dark interior; variant C is older and patched, with a short stack of firewood against its side. All three the same size and shape, so they can stand in rows.",
    ].join('\n'),
    checks: [
      '中军帐比营帐明显气派，但仍是帐篷，不像房子。',
      '三种营帐大小、轮廓一样，排成一行时不乱。',
    ],
  }),
  sheetAsset({
    id: 's2-09-palisade-kit',
    zh: 'S2-09 木栅模块',
    final: 'v2.webp',
    about: [
      '五件：上排是东西向直段（3 格）、营地西北角、东北角；下排是南北向直段（3 格）和辕门（门两侧各带两格木栅）。每格 128×96、每层 48px。',
      '游戏按每格的邻居拼：直段从中间裁一格出来重复用，所以左右（上下）两端要能接上。',
      '**2026-11-02 选定 `attempts/v2.webp`**（2026-11-02 你在审阅页确认）：三张都在 7px 以内，v2 最准（直段 1px、转角 3px），木桩节奏均匀，重复拼接看不出接缝；辕门横梁三张都比灰盒高 6–7px。透明版 `selected-transparent.png` 由 `attempts/key.py`（仓库根目录出图工作区）确定性抠出品红：不重画，不透明像素原样保留，边缘按背景色反混合去品红边。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh），每张的提示词、源文件和对位量测记在 `generation-manifest.json`。',
    ],
    slots: () => [
      [
        'an east-west run, three cells',
        '东西直段',
        [0, 0, 512, 512],
        [14, 15, 16].map((x) => palisadeAt(x, 26)),
      ],
      [
        'the north-west corner of the camp',
        '西北角',
        [512, 0, 512, 512],
        [
          [10, 26],
          [11, 26],
          [10, 27],
        ].map(([x, y]) => palisadeAt(x, y)),
      ],
      [
        'the north-east corner of the camp',
        '东北角',
        [1024, 0, 512, 512],
        [
          [36, 26],
          [37, 26],
          [37, 27],
        ].map(([x, y]) => palisadeAt(x, y)),
      ],
      [
        'a north-south run, three cells',
        '南北直段',
        [0, 512, 512, 512],
        [28, 29, 30].map((y) => palisadeAt(10, y)),
      ],
      [
        'the camp gate with the palisade ending at each post',
        '辕门',
        [512, 512, 1024, 512],
        [
          palisadeAt(21, 26),
          palisadeAt(22, 26),
          campGate(),
          palisadeAt(25, 26),
          palisadeAt(26, 26),
        ],
      ],
    ],
    subject: [
      'Subject: a modular kit of the Shu-Han camp palisade for a strategy game, five separate pieces arranged exactly as in the block-out, with clear empty space between pieces. The palisade is a single line of sharpened log stakes about one level high, lashed to two horizontal rails, with snow on the stake tops and rails.',
      'Top row, left to right: a straight three-cell run going east-west, whose left and right ends must join seamlessly when copies are placed side by side; the north-west corner of the camp, where the east-west run turns south; the north-east corner, the same mirrored.',
      'Bottom row: on the left, a three-cell run going north-south, seen from above so only the stake tops, the rails and the south end show, never its east or west side; on the right, the camp gate (辕门): two tall timber posts and a cross-beam spanning the road, with the palisade ending against each post.',
    ].join('\n'),
    checks: [
      '直段的两端能接上：东西段左右相接、南北段上下相接都看不出缝。',
      '南北段只看得到桩顶、横木和南端，没有画出东西侧面。',
      '辕门的门洞空着，路从中间穿过。',
    ],
  }),
  sheetAsset({
    id: 's2-10-workshop',
    zh: 'S2-10 器械工棚',
    final: 'v6.webp',
    about: [
      '同一座工棚画两态：左边空着，右边正在造器械。4×2 格，檐高 2 层、屋脊 3 层；每格 128×96、每层 48px。',
      '第一轮（v1–v3）灰盒檐高只有 1.1 层（游戏里 26px，比 36px 的小兵还矮），三张都自己把柱子画高，底边落到地面框以南 100px 以上；于是灰盒改成檐 2 层、脊 3 层，出第二轮（v4–v6）。',
      '**2026-11-02 选定 `attempts/v6.webp`**（2026-11-02 你在审阅页确认）：仍在屋顶下画了整面立面，画出来的底边在 y=717，比地面框前沿（685）低 32px，所以游戏按画出来的底边（y=717）对齐，不按灰盒。透明版 `selected-transparent.png` 由 `attempts/key.py`（仓库根目录出图工作区）确定性抠出品红：不重画，不透明像素原样保留，边缘按背景色反混合去品红边。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh），每张的提示词、源文件和对位量测记在 `generation-manifest.json`。',
      '打造进度由界面显示，这里只要两态；造好的器械是 S4 的分件。',
    ],
    slots: () => [
      ['the workshop, empty', '空工棚', [0, 0, 768, 1024], [workshop(1, 15)]],
      ['the workshop, building a siege engine', '造器械中', [768, 0, 768, 1024], [workshop(2, 29)]],
    ],
    subject:
      'Subject: a siege-engine workshop of the Shu-Han camp for a strategy game, drawn twice side by side, one piece centred in each half of the image. It is an open-sided timber shed four cells wide and two deep: stout posts, a plank roof with snow on it, timber and tools under the roof. Left: empty, with only stacked logs and planks inside. Right: the same shed with a half-built siege ladder cart inside: its wheeled base and the first rungs of its frame, with fresh-cut timber and a sawhorse. Both sheds are identical apart from what is inside.',
    checks: ['两座工棚完全一样，只有里面的东西不同。', '造器械中那件看得出是造到一半的云梯车。'],
  }),
  sheetAsset({
    id: 's2-11-field-scenery',
    zh: 'S2-11 野外点缀',
    final: 'v3.webp',
    about: [
      '3×2 宫格，每格 512×512：上排三种雪松，下排枯树、乱石、鹿角（2 格）。每格 128×96、每层 48px。',
      '布局里的林子（`T`）每格放一到两棵雪松，三种随机；乱石、枯树、鹿角由我在布局里另摆。',
      '**2026-11-02 选定 `attempts/v3.webp`**（2026-11-02 你在审阅页确认）：对位最准，除雪松 C 外都在 26px 以内；雪松 C（伞形老松）三张都比灰盒宽，每边约 40px，树冠伸出格子属正常。透明版 `selected-transparent.png` 由 `attempts/key.py`（仓库根目录出图工作区）确定性抠出品红：不重画，不透明像素原样保留，边缘按背景色反混合去品红边。出图用 Codex 内置 image_gen（gpt-6.1-sol，xhigh），每张的提示词、源文件和对位量测记在 `generation-manifest.json`。',
    ],
    slots: () => [
      ['a tall snow-laden pine', '雪松 A', [0, 0, 512, 512], [pine(40, 6, 'pine-a')]],
      ['a pair of younger pines', '雪松 B', [512, 0, 512, 512], [pinePair(41, 6)]],
      ['a broad old pine', '雪松 C', [1024, 0, 512, 512], [broadPine(42, 6)]],
      ['a dead tree', '枯树', [0, 512, 512, 512], [deadTree(43, 6)]],
      ['a cluster of boulders', '乱石', [512, 512, 512, 512], [rocks(44, 6)]],
      ['an abatis, two cells long', '鹿角', [1024, 512, 512, 512], [abatis(45, 6)]],
    ],
    subject:
      'Subject: scenery pieces for the snowy battlefield of a strategy game, six separate pieces in a 3 by 2 grid exactly as in the block-out, one piece centred in each 512×512 cell. Top row, left to right: a tall snow-laden pine; a pair of younger pines growing together; a broad old pine with spreading snowy boughs. Bottom row, left to right: a leafless dead tree with bare twisted branches; a cluster of grey boulders with snow on top; an abatis (鹿角), a low barrier of sharpened branches lashed together, two cells long, running east-west.',
    checks: [
      '三种雪松一眼能看出是同一片林子里的树，又各不相同。',
      '鹿角是一道低矮的尖枝障碍，东西走向。',
    ],
  }),
  ...STATE_ASSETS,
  ...ENGINE_ASSETS,
  ...ROSTER_ASSETS.map(withRosterPick),
  ...EFFECT_ASSETS.map(withEffectPick),
  ...STORY_ASSETS.map(withStoryPick),
];

// ---------------------------------------------------------------------------
// Outputs

const round = (v) => Math.round(v * 100) / 100;

function bbox(mask, w, h) {
  let [x0, y0, x1, y1] = [w, h, -1, -1];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (mask[y * w + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : [x0, y0, x1 + 1, y1 + 1];
}

// One entry per mask id: the object itself and any part with its own id
// (parapet fronts go to layer L4).
function footprintEntries(objects, frame, r, canvas, withMasks) {
  const P = project(frame);
  const entries = [];
  for (const o of objects) {
    const groups = new Map();
    for (const part of o.parts) {
      const id = part.id ?? o.id;
      if (!groups.has(id)) groups.set(id, { layer: part.layer ?? 'L3', parts: [] });
      groups.get(id).parts.push(part);
    }
    for (const [id, g] of groups) {
      const index = canvas.objects.indexOf(id);
      const mask = index > 0 ? r.masks.get(index) : null;
      const box = mask ? bbox(mask, canvas.w, canvas.h) : null;
      if (!box) continue;
      const [x0, , , y1] = o.cells;
      entries.push({
        id,
        kind: id === o.id ? o.kind : 'parapet',
        layer: g.layer,
        cells: o.cells,
        height: Math.max(...g.parts.map((p) => (p.type === 'roof' ? p.r : p.t))),
        anchor: P(x0, y1 + 1, 0).map(round),
        bbox: box,
        ...(withMasks ? { mask: `masks/${id}.png` } : {}),
      });
    }
  }
  return entries;
}

function assetReadme(asset, prompts) {
  const promptBlocks = prompts
    .map(
      (p) =>
        `${p.title ? `### ${p.title}\n\n` : ''}${p.file ? `出图存为 \`attempts/${p.file}\`。\n\n` : ''}${p.note ? `${p.note}\n\n` : ''}\`\`\`text\n${p.text}\n\`\`\``,
    )
    .join('\n\n');
  const image = asset.guide ? 'guide.png' : 'blockout.png';
  const section = asset.stage === 'S1' || !asset.stage ? '§10' : '§9.2、§13';
  return `# ${asset.zh}

\`${asset.id}\` · 由 \`node tools/build-siege-blockout.mjs\` 生成，请改脚本而不是改这个文件。计划见 [${PLAN}](../../../${PLAN}) ${section}。

${asset.about.map((line) => `- ${line}`).join('\n')}

${
  asset.portrait || asset.noImage
    ? ''
    : `## 参考图

![${image.replace('.png', '')}](${image})
${asset.guide ? '' : `\n叠图检查用 \`grid.png\`（透明底）：黑线是地面格子，红线是立体件的面，橙线是墙顶等顶面上的格子。\n`}
`
}## 上传与提示词

尺寸 ${asset.size.join('×')}。上传：

${asset.uploads.map((u, i) => `${i + 1}. ${u}`).join('\n')}

${promptBlocks}

## 看什么

${asset.checks.map((c) => `- ${c}`).join('\n')}

## 出图记录

出的图放进 \`attempts/\`，${asset.naming}
`;
}

function indexReadme(rows) {
  const table = (stage) => `| ID | 资产 | 尺寸 | 出图 |
| --- | --- | --- | --- |
${rows
  .filter((r) => r.stage === stage)
  .map((r) => r.line)
  .join('\n')}`;
  return `# 陈仓攻城战：美术资产

由 \`node tools/build-siege-blockout.mjs\` 生成，请改脚本而不是改这个文件。计划见 [${PLAN}](../../${PLAN})。

## 全图灰盒

48×32 全图按计划 §4 的斜俯视投影渲染，缩到 50%（每格 32×24，一层 12px）。只用来检查布局和高度，不上传 ImageGen。

![全图灰盒](blockout-full.png)

## S1 风格锁定（2026-11-02 通过）

${table('S1')}

顺序：S1-01（三种风格）→ 你选风格 → S1-02 → 你确认标准件 → S1-03、S1-04 → S1-05、S1-06 → 预览页测试场景（计划 §11）。每个提示词出 3–4 张，选一张。

**画法：α 整画切层**（2026-11-01 在预览页对比后定，计划 §9.2）。城池是一整张画，按 \`masks/\` 切层，会变的部分在整画上局部重画；营地、器械、部队等不在城池画里的东西才出分件。S1-03、S1-04 只在预览页作 β 对照。

## S2 全图与完好态（2026-11-02 通过）

${table('S2')}

顺序：S2-01 分六步，一步一步来：先在 S1-01 v2-a 上补画马道，再按西北、东北、南、西南、东南五块向外扩画；每步选定后跑 \`node tools/compose-siege-map.mjs\` 拿到下一步的输入（见 S2-01 的说明）。S2-08 到 S2-11 是分件表，和 S2-01、和彼此都不相干，随时可以出。

S1-02 以后的提示词按脚本里的 \`CHOSEN_STYLE\`（风格字母）和 \`CHOSEN_VIGNETTE\`（作风格参考上传的那张 S1-01）生成，现在是 A 和 \`v2-a.webp\`；S1-03 起上传的标准件是 \`CHOSEN_GATE\`，现在是 S1-02 的 \`v4.webp\`。改选别的，就改这几项再重新生成。分件的提示词开头有一段由灰盒算出的像素坐标（对位坐标段），帮 ImageGen 把屋顶、门、女墙放准。

## S3 状态变体

${table('S3')}

做法（计划 §9.2）：每一态是 S2-01 定稿全图上一块 1536×1024 的局部重画。跑 \`node tools/compose-siege-states.mjs\` 从全图裁出每一态的输入 \`inputs/<态>.png\`（新几何如重墙，先贴上灰盒）；选定后把文件名填进脚本的 \`STATE_PICKS\`，重跑两个脚本，就切出和全图对齐的补丁 \`patches/<态>.png\`（位置在 \`patches/<态>.json\`），以及贴回全图的对比 \`previews/<态>.webp\`。各件互不相干，可以同时出。

## S4 器械与反制

${table('S4')}

和 S2-08 到 S2-11 一样是品红底的 2 倍分件表，上传 S1-02 当标准件，各件互不相干。燃烧态只画焦黑和余烬，火苗和烟由程序加（MVP 计划 §8.3）；朝西推行由程序把朝东那件左右翻转。

## S5 部队与武将

${table('S5')}

姿态表的做法同 S1-05、S1-06：上传版式图 \`guide.png\` 和对应阵营的 S1 定稿表（蜀用 S1-05 v5，魏用 S1-06 v4），保证是同一支军队。旗面留白，字和颜色由程序加。立绘照 v0.3 立绘的提示词结构（\`docs/assets/v0.3-portraits/\`），不上传参考图。

## S6 特效元素与界面

${table('S6')}

都是静态元素，动起来全靠程序（移动、缩放、淡入淡出、换图，MVP 计划 §8.3）。这一阶段要 ImageGen 直接出透明底（烟、尘、光晕要半透明，品红抠不出来）；特效以 S2-01 定稿全图的一块作风格参考，图标和纸纹不上传参考。

## S7 叙事与主视觉

${table('S7')}

完整的叙事画，和全图同一套水墨淡彩，但构图按插画，不用游戏机位。每张先上传 S2-01 定稿全图南半城作风格和建筑参考；有名有姓的人物再上传立绘，只作人物参考。旗面都空白，没有文字和血腥。

## 每个文件夹里有什么

- \`blockout.png\`（姿态表是 \`guide.png\`）：上传 ImageGen 的参考图。
- \`grid.png\`：透明底的格子和轮廓，叠在出图上检查对位。
- \`masks/\`：每个立体件在画面上的轮廓蒙版，α 法切层用；女墙前沿单独一张（\`*-parapet.png\`，L4 层）。只有 S1-01 和 S2-01 有。
- \`footprints.json\`：每个物件的占地格、高度、锚点（占地西南角的地面点）和像素框。
- \`README.md\`：说明、上传清单、完整提示词和检查项。
- \`attempts/\`：出的图。
`;
}

async function attemptCount(dir) {
  const files = await readdir(join(dir, 'attempts')).catch(() => []);
  return files.filter((f) => /\.(webp|png|jpe?g)$/i.test(f)).length;
}

const objects = cityObjects();
const errors = validate(objects);
if (errors.length) {
  for (const e of errors) console.error(e);
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, 'layout.txt'), `${LAYOUT.join('\n')}\n`);
{
  const frame = { cw: 32, cd: 24, lh: 12, ox: 0, oy: 256 };
  const canvas = createCanvas(1536, 1024, C.sky);
  renderScene(canvas, frame, objects);
  await writeFile(join(OUT, 'blockout-full.png'), png(1536, 1024, 3, resolve(canvas).rgb));
}

const rows = [];
for (const asset of ASSETS) {
  const dir = join(OUT, asset.id);
  await mkdir(join(dir, 'attempts'), { recursive: true });
  let keys = new Set();
  let rendered = null;
  let resolved = null;
  if (asset.guide) {
    const { cols, rows: n, figure, foot } = asset.guide;
    await writeFile(
      join(dir, 'guide.png'),
      png(...asset.size, 3, guideImage(...asset.size, cols, n, figure, foot)),
    );
  } else if (asset.render) {
    rendered = asset.render();
    const { canvas, frame, masks, pieces, objects: drawn = objects } = rendered;
    const r = resolve(canvas);
    keys = r.keys;
    await writeFile(join(dir, 'blockout.png'), png(canvas.w, canvas.h, 3, r.rgb));
    await writeFile(join(dir, 'grid.png'), png(canvas.w, canvas.h, 4, gridImage(canvas, r, frame)));
    const footprints = {
      asset: asset.id,
      size: asset.size,
      cell: [frame.cw, frame.cd],
      level: frame.lh,
      projection: 'screen x = ox + x * cell[0]; screen y = oy + y * cell[1] - height * level',
    };
    if (pieces)
      footprints.pieces = pieces.map((p) => ({
        piece: p.piece,
        name: p.zh,
        cell: p.cell,
        origin: [p.frame.ox, p.frame.oy],
        objects: footprintEntries(p.objects, p.frame, r, canvas, false),
      }));
    else {
      footprints.origin = [frame.ox, frame.oy];
      footprints.objects = footprintEntries(drawn, frame, r, canvas, masks);
    }
    if (pieces || footprints.objects.length)
      await writeFile(
        join(dir, 'footprints.json'),
        await pretty(JSON.stringify(footprints), 'json'),
      );
    if (masks) {
      const maskDir = join(dir, 'masks');
      await mkdir(maskDir, { recursive: true });
      const names = new Set();
      for (const [index, mask] of r.masks) {
        const name = `${canvas.objects[index]}.png`;
        names.add(name);
        await writeFile(join(maskDir, name), png(canvas.w, canvas.h, 1, mask));
      }
      for (const stale of await readdir(maskDir))
        if (!names.has(stale)) await rm(join(maskDir, stale));
    }
    await asset.write?.(dir, rendered, r);
    resolved = r;
  }
  await writeFile(
    join(dir, 'README.md'),
    await pretty(assetReadme(asset, asset.prompts(keys, rendered, resolved)), 'markdown'),
  );
  const n = await attemptCount(dir);
  rows.push({
    stage: asset.stage ?? 'S1',
    line: `| ${asset.zh.split(' ')[0]} | [${asset.zh.split(' ').slice(1).join(' ')}](${asset.id}/README.md) | ${asset.size.join('×')} | ${n ? `${n} 张` : '待出图'}${asset.final ? `，定稿 \`${asset.final}\`` : ''} |`,
  });
  console.log(`${asset.id}: ${n} attempt(s)`);
}
await writeFile(join(OUT, 'README.md'), await pretty(indexReadme(rows), 'markdown'));
