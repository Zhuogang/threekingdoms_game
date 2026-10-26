import { deflateSync } from 'node:zlib';
import { mkdir, readFile, writeFile as writeFileNow } from 'node:fs/promises';
import { join } from 'node:path';

// Builds the battlefield art kit in docs/v0.3/battlefield-art/: one folder per canvas with
// the 48×32 cell layout, a 1536×1024 color reference image and the full ImageGen prompt.
// Layouts live here until they move into src/v03/battle as game data.
const OUT = 'docs/v0.3/battlefield-art';

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
const W = 48;
const H = 32;
const CELL = 32;

// Visual classes. Each one maps to exactly one rules terrain.
const CLASSES = {
  '.': { logic: 'plain', rgb: [214, 196, 150], zh: '田地、空地' },
  '+': { logic: 'plain', rgb: [150, 112, 70], zh: '道路、小径' },
  '=': { logic: 'plain', rgb: [104, 66, 32], zh: '桥、栈道、码头' },
  _: { logic: 'plain', rgb: [236, 226, 196], zh: '沙洲、河滩、干河床' },
  V: { logic: 'plain', rgb: [176, 88, 66], zh: '村落、房舍' },
  G: { logic: 'plain', rgb: [222, 40, 40], zh: '城门、寨门' },
  T: { logic: 'forest', rgb: [56, 104, 56], zh: '树林' },
  b: { logic: 'forest', rgb: [24, 140, 110], zh: '竹林' },
  r: { logic: 'forest', rgb: [168, 184, 88], zh: '芦苇荡' },
  // Palisades are passable but slow, and burn like woods.
  P: { logic: 'forest', rgb: [150, 92, 160], zh: '木栅、鹿角' },
  '^': { logic: 'hill', rgb: [146, 136, 96], zh: '丘陵、土岗、堤' },
  '~': { logic: 'water', rgb: [64, 118, 176], zh: '水' },
  '#': { logic: 'cliff', rgb: [78, 62, 52], zh: '峭壁、岩壁' },
  W: { logic: 'cliff', rgb: [132, 132, 150], zh: '城墙、关墙（夯土、砖石）' },
};
const THIN = new Set(['~', '+', '=', 'W', 'G', 'P']);
const LOGIC_ZH = { plain: '平原', forest: '森林', hill: '丘陵', water: '水', cliff: '峭壁' };

function grid(fill = '.') {
  const cells = Array.from({ length: H }, () => Array(W).fill(fill));
  const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  const paint = (x, y, c) => {
    if (!inside(x, y)) return;
    cells[y][x] = typeof c === 'function' ? c(cells[y][x]) : c;
  };
  const api = {
    cells,
    get: (x, y) => (inside(x, y) ? cells[y][x] : null),
    set: paint,
    rect(x0, y0, x1, y1, c) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) paint(x, y, c);
    },
    outline(x0, y0, x1, y1, c) {
      for (let x = x0; x <= x1; x++) (paint(x, y0, c), paint(x, y1, c));
      for (let y = y0; y <= y1; y++) (paint(x0, y, c), paint(x1, y, c));
    },
    ellipse(cx, cy, rx, ry, c) {
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) paint(x, y, c);
    },
    // Width 1 keeps 4-connected stair steps, so a one-cell river has no diagonal gaps.
    path(points, width, c) {
      const half = width >= 2 ? width / 2 : 0.71;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          for (let i = 1; i < points.length; i++) {
            if (segmentDistance(x, y, points[i - 1], points[i]) <= half) {
              paint(x, y, c);
              break;
            }
          }
        }
    },
  };
  return api;
}

function segmentDistance(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

const bridgeOverWater = (previous) => (previous === '~' ? '=' : '+');
const keepWater = (previous) => (previous === '~' ? '~' : '+');

// ---------------------------------------------------------------- layouts

function northPlain(g) {
  // Old dry channel in the lower left.
  g.path(
    [
      [0, 23],
      [7, 26],
      [13, 31],
    ],
    1,
    '_',
  );
  // Low mounds and one earth ridge: a plain, but not a billiard table.
  g.ellipse(18, 6, 2.2, 1.3, '^');
  g.ellipse(6, 5, 1.6, 1.1, '^');
  g.ellipse(30, 25, 2.2, 1.3, '^');
  g.ellipse(21, 28, 1.3, 1.1, '^');
  g.ellipse(41, 24, 2, 1.4, '^');
  g.ellipse(45, 4, 1.4, 1, '^');
  g.path(
    [
      [1, 9],
      [8, 11],
    ],
    2,
    '^',
  );
  // Small groves standing alone in the fields.
  g.ellipse(19, 22, 2, 1.4, 'T');
  g.ellipse(31, 11, 1.5, 1, 'T');
  g.ellipse(44, 29, 1.6, 1.1, 'T');
  g.ellipse(13, 4, 1.8, 1.2, 'T');
  g.ellipse(37, 27, 1.6, 1.1, 'T');
  g.ellipse(40, 11, 1.4, 1, 'T');
  // River, pond, willows by the bridge.
  g.path(
    [
      [25, 0],
      [25, 5],
      [27, 9],
      [26, 13],
      [25, 15],
      [24, 19],
      [25, 24],
      [27, 28],
      [26, 31],
    ],
    1,
    '~',
  );
  g.ellipse(23, 3, 1.2, 0.7, '~');
  for (const [x, y] of [
    [23, 12],
    [23, 13],
    [23, 17],
    [26, 17],
  ])
    g.set(x, y, 'T');
  // Village 1, open: houses with a few trees, fields right up to the walls.
  g.rect(34, 5, 36, 7, 'V');
  g.rect(37, 6, 37, 6, 'V');
  for (const [x, y] of [
    [33, 4],
    [38, 5],
    [35, 8],
    [33, 7],
  ])
    g.set(x, y, 'T');
  // Village 2, a walled manor (坞堡) with a moat; east gate to the road, north gate to the fields.
  g.outline(7, 22, 14, 29, '~');
  g.outline(8, 23, 13, 28, 'W');
  g.rect(9, 24, 12, 27, 'V');
  g.set(13, 25, 'G');
  g.set(14, 25, '=');
  g.path(
    [
      [15, 25],
      [17, 20],
      [17, 16],
    ],
    1,
    '+',
  );
  g.set(10, 23, 'G');
  g.set(10, 22, '=');
  g.path(
    [
      [10, 21],
      [10, 16],
    ],
    1,
    '+',
  );
  // The main road and the bridge.
  g.path(
    [
      [0, 15],
      [47, 15],
    ],
    1,
    bridgeOverWater,
  );
}

function centralFarmland(g) {
  const canal = [
    [16, 0],
    [23, 11],
    [26, 20],
    [32, 31],
  ];
  g.path(canal, 4, '^');
  g.path(canal, 2, '~');
  // Ditches cut the fields into blocks.
  g.path(
    [
      [0, 4],
      [14, 4],
    ],
    1,
    '~',
  );
  g.path(
    [
      [30, 10],
      [47, 10],
    ],
    1,
    '~',
  );
  g.path(
    [
      [0, 22],
      [20, 22],
    ],
    1,
    '~',
  );
  g.path(
    [
      [33, 28],
      [47, 28],
    ],
    1,
    '~',
  );
  g.path(
    [
      [41, 0],
      [41, 9],
    ],
    1,
    '~',
  );
  // Mulberry and elm groves, dense villages.
  g.rect(4, 0, 9, 2, 'T');
  g.rect(42, 24, 46, 26, 'T');
  g.rect(17, 25, 20, 28, 'T');
  g.ellipse(36, 4, 2, 1.2, 'T');
  g.ellipse(6, 28, 2, 1.4, 'T');
  g.rect(26, 1, 29, 3, 'T');
  g.ellipse(6, 18, 2, 1.5, 'T');
  g.ellipse(36, 30, 2.5, 1, 'T');
  g.ellipse(46, 4, 1.5, 2, 'T');
  g.ellipse(30, 18, 1.5, 1.2, 'T');
  g.rect(5, 9, 7, 10, 'V');
  g.rect(30, 3, 32, 4, 'V');
  g.rect(12, 28, 14, 29, 'V');
  g.rect(38, 20, 40, 22, 'V');
  // Defender field fort: a palisade with front and rear gates.
  g.outline(40, 13, 45, 19, 'P');
  g.set(40, 16, 'G');
  g.set(45, 16, 'G');
  // Post roads, bridged over the canal; ditches stay open water (one-cell wade).
  g.path(
    [
      [0, 8],
      [47, 8],
    ],
    1,
    bridgeOverWater,
  );
  g.path(
    [
      [0, 23],
      [47, 23],
    ],
    1,
    bridgeOverWater,
  );
  g.path(
    [
      [5, 16],
      [16, 16],
      [18, 8],
    ],
    1,
    keepWater,
  );
  g.path(
    [
      [33, 23],
      [36, 16],
      [39, 16],
    ],
    1,
    keepWater,
  );
}

function yellowRiverFord(g) {
  g.rect(20, 0, 27, 31, '~');
  for (const [y0, y1] of [
    [3, 9],
    [12, 19],
    [22, 28],
  ])
    g.rect(23, y0, 24, y1, '_');
  // Levees, broken at the two ferries.
  g.rect(18, 0, 19, 31, '^');
  g.rect(28, 0, 29, 31, '^');
  // Each ferry is a full wooden bridge from bank to sand bar, as the v1 painting draws it.
  for (const y of [8, 24]) {
    g.rect(18, y - 1, 19, y + 1, '.');
    g.rect(28, y - 1, 29, y + 1, '.');
    g.rect(20, y, 22, y, '=');
    g.rect(25, y, 27, y, '=');
  }
  g.rect(20, 13, 20, 18, 'r');
  g.rect(27, 4, 27, 7, 'r');
  // Ferry roads.
  g.path(
    [
      [5, 16],
      [12, 16],
      [17, 8],
      [19, 8],
    ],
    1,
    '+',
  );
  g.path(
    [
      [12, 16],
      [17, 24],
      [19, 24],
    ],
    1,
    '+',
  );
  g.path(
    [
      [28, 8],
      [33, 12],
      [42, 16],
    ],
    1,
    '+',
  );
  g.path(
    [
      [28, 24],
      [33, 20],
      [42, 16],
    ],
    1,
    '+',
  );
  // Bank willows, ferry hamlets, the terraces on the defender bank.
  g.ellipse(16, 3, 1.5, 1.4, 'T');
  g.ellipse(16, 29, 1.5, 1.4, 'T');
  g.ellipse(31, 3, 1.4, 1.2, 'T');
  g.rect(31, 6, 32, 7, 'V');
  g.rect(14, 25, 15, 26, 'V');
  g.ellipse(41, 5, 3.5, 2, '^');
  g.ellipse(41, 27, 3.5, 2, '^');
  g.ellipse(6, 26, 2.5, 1.5, 'T');
}

function wetland(g, south) {
  const reed = south ? 'b' : 'r';
  g.ellipse(22, 12, 3.6, 2.8, 'r');
  g.ellipse(6, 19, 3, 2.4, 'r');
  g.ellipse(33, 28, 3, 2, reed);
  g.ellipse(4, 3, 2.5, 1.6, reed);
  for (const [cx, cy, rx, ry] of [
    [17, 18, 2, 1.5],
    [45, 6, 2, 1.5],
    [24, 21, 2.5, 1.5],
    [3, 30, 2.5, 1.2],
    [31, 4, 1.5, 1.2],
    [9, 23, 2, 1],
  ])
    g.ellipse(cx, cy, rx, ry, 'r');
  g.path(
    [
      [0, 6],
      [14, 9],
      [22, 6],
      [34, 9],
      [47, 7],
    ],
    2,
    '~',
  );
  g.path(
    [
      [12, 0],
      [16, 12],
      [14, 22],
      [18, 31],
    ],
    1,
    '~',
  );
  g.path(
    [
      [0, 26],
      [20, 24],
      [30, 27],
      [47, 25],
    ],
    2,
    '~',
  );
  g.path(
    [
      [28, 0],
      [29, 10],
      [27, 18],
      [30, 31],
    ],
    1,
    '~',
  );
  g.ellipse(22, 12, 2.4, 1.7, '~');
  g.ellipse(6, 19, 1.8, 1.3, '~');
  g.ellipse(40, 3, 2, 1.3, '~');
  // Polder dikes.
  g.outline(2, 10, 8, 14, '^');
  g.outline(19, 28, 26, 31, '^');
  g.ellipse(44, 30, 2, 1.2, '^');
  // Defender camp on high ground inside a moat, two bridges in.
  g.outline(38, 11, 46, 21, '~');
  g.outline(39, 12, 45, 20, '^');
  g.set(39, 16, '.');
  g.set(42, 20, '.');
  // Villages and willows.
  g.rect(9, 28, 10, 29, 'V');
  g.rect(44, 27, 45, 28, 'V');
  g.rect(33, 2, 34, 3, 'V');
  g.ellipse(9, 4, 1.4, 1, 'T');
  g.ellipse(36, 22, 1.2, 1, 'T');
  // Causeway road; every water crossing becomes a bridge.
  g.path(
    [
      [0, 16],
      [38, 16],
      [42, 16],
    ],
    1,
    bridgeOverWater,
  );
  g.path(
    [
      [42, 21],
      [42, 23],
    ],
    1,
    bridgeOverWater,
  );
}

function yangtzeBank(g) {
  for (let x = 0; x < W; x++) {
    const shore = Math.round(10.5 + 1.5 * Math.sin(x / 5));
    g.rect(x, 0, x, shore, '~');
    g.rect(x, shore + 1, x, shore + 2, '_');
  }
  g.ellipse(20, 4, 5, 1.6, '_');
  g.ellipse(20, 4, 3, 0.8, 'r');
  g.ellipse(8, 14, 4, 1.5, 'r');
  g.ellipse(27, 14, 4, 1.5, 'r');
  // Red cliffs and a water fort on the defender side.
  g.rect(38, 9, 47, 13, '#');
  g.rect(43, 9, 43, 13, '+');
  g.outline(40, 3, 46, 8, 'P');
  g.set(43, 8, 'G');
  // Bank hills, river road, hamlets.
  g.ellipse(8, 29, 4, 2, '^');
  g.ellipse(22, 30, 5, 2, '^');
  g.ellipse(36, 29, 4, 2.5, '^');
  g.ellipse(45, 28, 3, 2, '^');
  g.ellipse(22, 30, 3, 1, 'T');
  g.ellipse(36, 29, 2, 1, 'T');
  g.path(
    [
      [0, 20],
      [20, 19],
      [32, 21],
      [47, 19],
    ],
    1,
    '+',
  );
  g.rect(16, 23, 17, 24, 'V');
  g.rect(30, 16, 31, 17, 'V');
}

function yangtzeCrossing(g) {
  g.rect(19, 0, 28, 31, '~');
  g.rect(22, 6, 25, 25, '_');
  g.rect(23, 9, 24, 22, 'r');
  // Defender bank: cliffs, two landing beaches.
  g.rect(29, 0, 31, 31, '#');
  g.rect(29, 7, 31, 9, '_');
  g.rect(29, 22, 31, 24, '_');
  // Attacker bank: mud flats and reed beds.
  g.rect(17, 0, 18, 31, '_');
  g.rect(14, 2, 16, 8, 'r');
  g.rect(14, 24, 16, 29, 'r');
  g.path(
    [
      [5, 16],
      [16, 16],
    ],
    1,
    '+',
  );
  g.path(
    [
      [32, 8],
      [38, 12],
      [42, 16],
    ],
    1,
    '+',
  );
  g.path(
    [
      [32, 23],
      [38, 20],
      [42, 16],
    ],
    1,
    '+',
  );
  g.rect(38, 4, 39, 5, 'V');
  g.rect(5, 6, 7, 7, 'V');
  g.ellipse(44, 5, 3, 2, '^');
  g.ellipse(44, 27, 3, 2, '^');
  g.ellipse(36, 28, 2, 1.5, 'T');
  g.ellipse(8, 27, 3, 2, '^');
  g.ellipse(12, 22, 2.5, 1.5, '^');
  g.ellipse(11, 4, 2, 1, 'T');
  g.ellipse(40, 9, 2, 1.5, 'T');
  g.ellipse(9, 12, 2, 1.5, 'T');
  g.ellipse(35, 24, 1.5, 1.2, 'T');
}

function riverValley(g, south) {
  for (let x = 0; x < W; x++) {
    const top = 4 + Math.round(Math.sin(x / 4));
    const bottom = 27 + Math.round(Math.sin(x / 5 + 1));
    g.rect(x, 0, x, top, '^');
    g.rect(x, 0, x, 1 + Math.round(Math.sin(x / 3 + 1)), '#');
    g.rect(x, bottom, x, H - 1, '^');
    g.rect(x, H - 2 - Math.round(Math.sin(x / 3)), x, H - 1, '#');
  }
  // The Wei terraces are wooded knolls in the Han painting.
  g.ellipse(4, 24, 3, 1.5, south ? 'T' : '^');
  g.ellipse(40, 22, 4, 2, south ? 'T' : '^');
  g.ellipse(30, 8, 2, 1.5, 'T');
  g.ellipse(14, 25, 2, 1.2, 'T');
  g.ellipse(8, 13, 2, 1.2, 'T');
  g.ellipse(26, 6, 2, 1.2, 'T');
  g.ellipse(34, 25, 2.5, 1.2, 'T');
  g.ellipse(44, 19, 2, 1.5, 'T');
  g.path(
    [
      [0, 8],
      [9, 9],
      [16, 13],
      [22, 20],
      [28, 22],
      [34, 18],
      [40, 15],
      [47, 15],
    ],
    2,
    '~',
  );
  g.rect(17, 6, 18, 7, 'V');
  g.rect(37, 7, 39, 8, 'V');
  // City corner at the defender edge: wall, gate, rooftops.
  g.rect(45, 5, 47, 5, 'W');
  g.rect(45, 5, 45, 13, 'W');
  g.rect(46, 6, 47, 13, 'V');
  g.set(45, 10, 'G');
  g.path(
    [
      [5, 18],
      [18, 23],
      [24, 24],
      [26, 16],
      [34, 12],
      [42, 10],
      [44, 10],
    ],
    1,
    bridgeOverWater,
  );
}

function northHills(g, rolling) {
  g.rect(0, 0, W - 1, H - 1, '^');
  const pass = [
    [0, 16],
    [10, 15],
    [18, 18],
    [28, 14],
    [38, 17],
    [47, 16],
  ];
  g.path(pass, rolling ? 9 : 7, '.');
  g.path(
    pass.map(([x, y]) => [x, y + 1]),
    1,
    '_',
  );
  const crags = [
    [8, 7, 3, 2],
    [22, 8, 2, 3],
    [33, 5, 4, 2],
    [14, 26, 3, 2],
    [30, 25, 2, 3],
    [42, 26, 3, 2],
    [24, 11, 2, 1],
    [25, 21, 2, 1],
    [4, 26, 2, 1.5],
    [44, 11, 2, 1.5],
    [17, 12, 1.5, 1],
    [36, 21, 2, 1],
    [2, 3, 2, 1.5],
    [46, 30, 2, 1.5],
  ];
  for (const [cx, cy, rx, ry] of rolling
    ? crags.slice(0, 2).map(([x, y]) => [x, y, 1.5, 1])
    : crags)
    g.ellipse(cx, cy, rx, ry, '#');
  // Goat paths over the hills, two upland springs.
  g.path(
    [
      [6, 15],
      [8, 10],
      [16, 5],
      [26, 4],
      [38, 6],
      [42, 12],
    ],
    1,
    '+',
  );
  g.path(
    [
      [20, 19],
      [22, 26],
      [34, 29],
      [40, 20],
    ],
    1,
    '+',
  );
  g.ellipse(18, 23, 1, 0.6, '~');
  g.ellipse(36, 10, 1, 0.6, '~');
  // Pines, terraced dry fields, a hamlet.
  g.ellipse(12, 22, 2, 1.5, 'T');
  g.ellipse(28, 9, 2, 1.5, 'T');
  g.ellipse(44, 6, 2, 1.5, 'T');
  g.ellipse(4, 8, 2.5, 1.5, 'T');
  g.ellipse(36, 28, 2.5, 1.5, 'T');
  g.ellipse(20, 3, 2, 1.2, 'T');
  if (rolling) (g.ellipse(26, 24, 2.5, 1.5, 'T'), g.ellipse(14, 9, 2.5, 1.5, 'T'));
  g.ellipse(40, 22, rolling ? 4 : 3, 2, '.');
  g.ellipse(6, 26, rolling ? 4 : 3, 2, '.');
  if (rolling) g.ellipse(26, 28, 3, 1.5, '.');
  g.rect(3, 12, 4, 13, 'V');
}

function southHills(g) {
  for (const [cx, cy, rx, ry] of [
    [9, 5, 2.5, 2],
    [20, 9, 2.5, 2],
    [32, 4, 3, 2],
    [42, 8, 2.5, 2],
    [16, 27, 3, 2],
    [28, 23, 2, 2],
    [40, 26, 3, 2.2],
    [3, 25, 2, 2],
  ])
    g.ellipse(cx, cy, rx, ry, '^');
  g.path(
    [
      [14, 22],
      [26, 17],
    ],
    2,
    '^',
  );
  for (const [cx, cy, rx, ry] of [
    [9, 5, 1.5, 1],
    [32, 4, 1.8, 1],
    [40, 26, 1.8, 1.2],
    [16, 27, 1.6, 1],
  ])
    g.ellipse(cx, cy, rx, ry, 'T');
  g.ellipse(6, 12, 2, 2.5, 'b');
  g.ellipse(24, 13, 2.5, 2, 'b');
  g.ellipse(45, 18, 2, 3, 'b');
  g.ellipse(22, 3, 2, 1.2, 'b');
  g.ellipse(34, 30, 2.5, 1.2, 'T');
  for (const [cx, cy, rx, ry, c] of [
    [13, 8, 2, 1.5, 'b'],
    [28, 7, 2.5, 1.5, 'T'],
    [36, 13, 2, 2, 'b'],
    [22, 25, 2.5, 1.5, 'T'],
    [10, 23, 2, 1.5, 'b'],
    [46, 28, 1.5, 2, 'b'],
    [1, 8, 1.5, 2, 'T'],
    [28, 23, 1.2, 1.2, 'T'],
    [20, 9, 1.5, 1, 'T'],
    [42, 8, 1.5, 1, 'T'],
    [3, 25, 1.2, 1.2, 'T'],
    [39, 3, 2, 1.2, 'b'],
    [27, 30, 2, 1, 'b'],
  ])
    g.ellipse(cx, cy, rx, ry, c);
  g.set(32, 4, '#');
  g.set(33, 4, '#');
  g.path(
    [
      [0, 18],
      [8, 20],
      [18, 14],
      [30, 12],
      [47, 14],
    ],
    1,
    '~',
  );
  g.ellipse(30, 27, 1.5, 1, '~');
  g.rect(44, 20, 45, 21, 'V');
  g.rect(19, 4, 20, 5, 'V');
  g.rect(7, 29, 8, 30, 'V');
  g.path(
    [
      [5, 16],
      [18, 18],
      [30, 16],
      [42, 16],
    ],
    1,
    bridgeOverWater,
  );
}

function gorge(g) {
  g.rect(0, 0, W - 1, H - 1, '#');
  g.rect(0, 9, W - 1, 22, '.');
  g.rect(18, 6, 29, 25, '.');
  // Side gullies up to ambush terraces.
  g.path(
    [
      [18, 7],
      [15, 4],
      [12, 3],
    ],
    2,
    '.',
  );
  g.ellipse(9, 3, 3, 1.5, '^');
  g.path(
    [
      [29, 24],
      [33, 27],
      [37, 28],
    ],
    2,
    '.',
  );
  g.ellipse(39, 28, 3, 1.5, '^');
  g.set(13, 4, 'T');
  // Rock spurs pinch the floor down to plank roads. The two upper spurs follow
  // the v1 painting: the plank hugs the spur's face and rocks fill the gap below.
  g.ellipse(6, 9, 3, 2, '#');
  g.rect(4, 12, 8, 13, '#');
  g.rect(3, 11, 9, 11, '=');
  g.ellipse(14, 21, 3, 2, '#');
  g.rect(11, 18, 17, 18, '=');
  g.ellipse(36, 10, 3, 2, '#');
  g.rect(34, 13, 38, 13, '#');
  g.rect(33, 12, 39, 12, '=');
  g.ellipse(44, 21, 3, 2, '#');
  g.set(47, 22, '#');
  g.rect(41, 18, 47, 18, '=');
  g.ellipse(2, 20, 2, 1.5, '^');
  g.ellipse(46, 10, 1.5, 1.2, '^');
  g.ellipse(21, 8, 2, 1.2, 'T');
  g.ellipse(27, 23, 2, 1.2, 'T');
  g.ellipse(40, 9, 1.5, 0.8, 'T');
  g.ellipse(8, 21, 1.5, 0.8, 'T');
  g.rect(25, 7, 26, 8, 'V');
  g.rect(0, 14, W - 1, 16, '~');
  g.rect(23, 14, 23, 16, '=');
  g.rect(30, 14, 30, 16, '=');
}

function threeGorges(g) {
  g.rect(0, 0, W - 1, H - 1, '#');
  g.rect(0, 10, W - 1, 21, '.');
  g.rect(19, 6, 28, 25, '.');
  g.rect(0, 12, W - 1, 19, '~');
  // As the v1 painting draws them: towpaths on rows 10 and 21, a boulder bank
  // between path and water; the basin keeps its open beach. All plain ground.
  g.rect(0, 11, W - 1, 11, '_');
  g.rect(0, 20, W - 1, 20, '_');
  g.rect(0, 10, 18, 10, '=');
  g.rect(29, 10, W - 1, 10, '=');
  g.rect(0, 21, 18, 21, '=');
  g.rect(29, 21, W - 1, 21, '=');
  g.ellipse(23.5, 15.5, 2.5, 1.2, '_');
  g.ellipse(22, 7, 2, 1, 'T');
  g.ellipse(25, 24, 2, 1, 'T');
  g.rect(26, 7, 27, 8, 'V');
  g.path(
    [
      [19, 7],
      [15, 4],
    ],
    2,
    '.',
  );
  g.ellipse(13, 3, 2.5, 1.5, '^');
  g.path(
    [
      [28, 24],
      [33, 27],
    ],
    2,
    '.',
  );
  g.ellipse(35, 28, 2.5, 1.5, '^');
}

function mountainPass(g) {
  for (let x = 0; x < W; x++) {
    const top = 6 + Math.round(Math.sin(x / 3));
    const bottom = 25 + Math.round(Math.sin(x / 4 + 2));
    const c = x <= 25 ? '^' : '#';
    g.rect(x, 0, x, top, c);
    g.rect(x, bottom, x, H - 1, c);
  }
  // A one-cell pass wall: the main gate on the road and a 2-cell side gate to the south.
  g.rect(30, 0, 30, 31, (previous) => (previous === '.' || previous === '^' ? 'W' : '#'));
  g.rect(30, 5, 30, 26, 'W');
  g.rect(30, 14, 30, 16, 'G');
  g.rect(30, 21, 30, 22, 'G');
  g.path(
    [
      [0, 15],
      [47, 15],
    ],
    1,
    (previous) => (previous === 'G' ? 'G' : '+'),
  );
  g.path(
    [
      [26, 18],
      [29, 21],
    ],
    1,
    '+',
  );
  g.path(
    [
      [31, 22],
      [35, 19],
      [38, 15],
    ],
    1,
    '+',
  );
  // Approach slope before the gate.
  g.ellipse(18, 10, 2.5, 1.5, '^');
  g.ellipse(22, 21, 2, 1.5, '^');
  g.ellipse(9, 9, 2, 1.5, 'T');
  g.ellipse(14, 24, 2, 1.2, 'T');
  g.ellipse(4, 20, 2, 1.5, 'T');
  // Behind the wall: barracks, grove, knoll.
  g.rect(36, 9, 38, 10, 'V');
  g.ellipse(40, 21, 2, 1.5, 'T');
  g.ellipse(45, 9, 2, 1.5, '^');
  // The perilous bypass trail through the northern crags.
  g.path(
    [
      [20, 7],
      [24, 3],
      [30, 2],
      [37, 3],
      [41, 8],
    ],
    1,
    '+',
  );
}

// ---------------------------------------------------------------- catalogue

const STYLE = `Style: traditional Chinese ink-wash painting with light color (水墨淡彩). Soft brush texture, subtle rice-paper grain, gentle ink outlines on roads, banks, walls and cliff edges. Light from the upper left with very soft shadows.`;
const SHAPES = `The flat color blocks only mark where each feature goes. Paint natural, organic shapes: rivers and shores curve smoothly, groves have soft irregular outlines, hills are rounded, fields are irregular plots. Never copy the square stair-step edges of the blocks. Keep every feature within about half a block of where it is marked.`;
const WALLS = `Walls and palisades are exactly one block thick: paint them as a single continuous line along the marked blocks, never as a wide band. Paint every red gate block as a clear open gateway in the wall, wide enough to read at a glance; the red only marks the opening, so never paint the gate itself red. A timber palisade is a light fence of sharpened stakes, visibly lighter and thinner than an earth or stone wall.`;
const READABILITY = `Game readability: keep open ground calm, flat and low-contrast so game unit tokens placed on top stay readable. Keep detail density even across the whole map, with no vignette and no darkened corners.`;
const BASE_EXCLUDE = `any text, letters, labels, seals or signatures; grid lines; borders, frames, scroll edges or paper margins; compass or legend; people, soldiers, horses, carts, boats with crews, flags, tents or banners; horizon, sky or distant mountains; modern objects`;

const LEGEND_EN = {
  '.': 'open ground',
  '+': 'packed dirt road or footpath',
  '=': 'wooden bridge, plank road or jetty',
  _: 'pale sand bar, mud flat or dry riverbed',
  V: 'small village of rammed-earth courtyard houses with grey tile roofs',
  G: 'gate opening in the wall',
  T: 'grove of trees',
  b: 'bamboo grove',
  r: 'reed beds',
  '^': 'low rounded hills, earth mounds or embankments',
  '~': 'water',
  '#': 'rock cliffs and crags',
  W: 'rammed-earth wall',
  P: 'timber palisade of sharpened stakes',
};

const MAPS = [
  {
    id: 'bf01-north-plain',
    no: '①',
    zh: '北方旷野',
    round: 1,
    build: northPlain,
    camps: { a: [5, 15], d: [42, 15] },
    target: { plain: 82, forest: 8, hill: 6, water: 4, cliff: 0 },
    about: [
      '河北、鲁北平原：麦田、土路、杨柳、小河。界桥之战一类的正面会战。',
      '右上是开放的村落，房舍间只有几棵树；左下是带护城壕的坞堡，东门朝大路，北门朝田野，各有一座小桥过壕。',
      '散布六处低土岗、一道土梁和一条干河床，平原但不平坦。',
    ],
    legend: {
      '.': 'open winter wheat fields with faint straight field ridges',
      T: 'small groves of bare willows and poplars standing in the fields',
      '^': 'low, gentle loess earth mounds and one long earth ridge',
      '~': 'a narrow shallow meandering river, a tiny pond, and the moat around the walled manor',
      _: 'a pale, dry old river channel',
      V: 'houses of rammed-earth courtyards with grey tile roofs; the upper-right village is open, with fields right up to its houses',
      W: 'the rammed-earth wall of a fortified manor (坞堡)',
      G: 'the two gates of the manor (east and north), each facing a small plank bridge over its moat',
      '=': 'small plank bridges: one on the main road over the river, two over the manor moat',
      '+': 'packed dirt roads',
    },
    setting:
      'Hebei plain in the late Eastern Han dynasty, around 190 AD. Dry early winter, light loess dust, quiet farmland. Palette: muted ochre, warm grey-brown, pale straw yellow, dull grey-green trees, soft grey-blue water.',
  },
  {
    id: 'bf02-central-farmland',
    no: '②',
    zh: '中原沃野',
    round: 1,
    build: centralFarmland,
    camps: { a: [5, 16], d: [42, 16] },
    target: { plain: 67, forest: 12, hill: 8, water: 13, cliff: 0 },
    about: [
      '黄淮平原：一条两岸有土堤的运河斜穿全图，两条驿道各有一座桥过河。',
      '横向沟渠把田地切成方块，村落密集，桑林成片；守方营地有一圈木栅。',
    ],
    legend: {
      '.': 'small irregular plots of green wheat and fallow land, densely farmed',
      '~': 'a straight-banked canal crossing the map diagonally, and narrow irrigation ditches',
      '^': 'grassy earth embankments along both banks of the canal',
      T: 'mulberry and elm groves planted in rows',
      V: 'dense villages of rammed-earth courtyards with grey tile roofs',
      P: 'a square timber palisade of a field fort',
      G: 'the front and rear gates of the palisade',
      '+': 'straight post roads and village lanes',
      '=': 'wooden bridges over the canal',
    },
    setting:
      'Central Plains between Chenliu and Xuchang, late Eastern Han dynasty, around 200 AD. Mild early spring. Palette: fresh pale green, warm ochre earth, grey-blue water, dark green groves.',
  },
  {
    id: 'bf03-yellow-river-ford',
    no: '③',
    zh: '黄河津渡',
    round: 1,
    build: yellowRiverFord,
    camps: { a: [5, 16], d: [42, 16] },
    target: { plain: 55, forest: 8, hill: 12, water: 25, cliff: 0 },
    about: [
      '白马津、孟津一类的黄河渡口：浑黄大河竖贯中间，河心三块沙洲，两岸大堤只在两处渡口断开。',
      '沙洲两侧各 3 格水；两处渡口各有一座木桥从岸边接到沙洲，再接到对岸；守方岸后是台地。',
    ],
    legend: {
      '~': 'the wide, muddy, ochre-brown Yellow River with silt swirls',
      _: 'pale sand bars in the middle of the river',
      '^': 'high earthen levees along both banks, and loess terraces on the right side',
      '=': 'two wooden ferry bridges, each running from a bank to a sand bar and on to the far bank',
      r: 'thin reed fringes on the river edge',
      T: 'bank-side willows',
      V: 'small ferry hamlets',
      '+': 'dirt roads leading to the two ferries',
      '.': 'flat loess farmland',
    },
    setting:
      'The Yellow River at Baima ford, late Eastern Han dynasty, around 200 AD. Early spring, dry wind, silt-laden water. Palette: ochre, khaki, muddy brown-yellow water, grey-brown earth.',
  },
  {
    id: 'bf04-wetland-north',
    no: '④北',
    zh: '水网泽国（淮泗）',
    round: 1,
    build: (g) => wetland(g, false),
    camps: { a: [5, 16], d: [42, 16] },
    target: { plain: 45, forest: 15, hill: 10, water: 30, cliff: 0 },
    about: [
      '淮河—泗水下游：网状水道、湖塘、芦苇荡、圩田，陆地被切成几块，靠桥和堤相连。',
      '守方营地在一块四面环水的高地上，只有两座桥通进去（呼应下邳、寿春）。',
    ],
    legend: {
      '~': 'a web of winding creeks, two broad channels and shallow ponds',
      r: 'dense reed beds around the ponds and along the creeks',
      '^': 'polder dikes and a raised mound ringed by water on the right',
      '.': 'wet, low-lying fields between the waterways',
      T: 'a few willows',
      V: 'small marsh villages',
      '+': 'a raised causeway road',
      '=': 'small wooden and stone bridges',
    },
    setting:
      'The lower Huai and Si rivers near Xiapi, late Eastern Han dynasty, around 198 AD. Damp late autumn. Palette: yellow-green reeds, olive marsh, grey-green water, muted ochre fields.',
  },
  {
    id: 'bf04-wetland-south',
    no: '④南',
    zh: '水网泽国（江南）',
    round: 2,
    build: (g) => wetland(g, true),
    camps: { a: [5, 16], d: [42, 16] },
    target: { plain: 45, forest: 15, hill: 10, water: 30, cliff: 0 },
    about: ['太湖平原：与 ④北 同一布局，换成稻田、竹林和江南水乡。'],
    legend: {
      '~': 'a web of winding canals, two broad channels and lotus ponds',
      r: 'reed beds around the ponds',
      b: 'bamboo groves',
      '^': 'polder dikes and a raised mound ringed by water on the right',
      '.': 'flooded green rice paddies divided by narrow bunds',
      T: 'a few camphor trees',
      V: 'whitewashed canal-side houses with dark tile roofs',
      '+': 'a stone-paved causeway',
      '=': 'arched stone bridges',
    },
    setting:
      'The Taihu lake plain near Wu, late Eastern Han dynasty. Humid early summer. Palette: jade green paddies, teal water, dark green bamboo, white walls and dark grey roofs.',
  },
  {
    id: 'bf05-yangtze-bank',
    no: '⑤A',
    zh: '大江·沿江',
    round: 1,
    build: yangtzeBank,
    camps: { a: [5, 20], d: [42, 20] },
    rows: [14, 23],
    target: { plain: 35, forest: 12, hill: 8, water: 38, cliff: 7 },
    about: [
      '长江中游岸路：大江横贯地图上方，江中有一座芦苇洲，部队在下方江岸带行军作战。',
      '守方一侧是临江红色石壁和水寨，石壁中留一条下水的坡道。',
    ],
    legend: {
      '~': 'the vast grey-green Yangtze river with long current lines',
      _: 'pale mud flats and beaches along the shore, and a sandy river island',
      r: 'tall reed beds on the shore and on the island',
      '#': 'red sandstone river cliffs (赤壁)',
      P: 'the timber palisade of a water fort standing in the river',
      G: 'the water gate of the fort',
      '^': 'rounded green hills on the landward side',
      T: 'broadleaf woods on the hills',
      '+': 'the riverside road and a slipway cut through the cliffs',
      V: 'small riverside hamlets',
      '.': 'riverside fields and grass',
    },
    setting:
      'The middle Yangtze near Red Cliffs, late Eastern Han dynasty, around 208 AD. Early winter mist over the water. Palette: grey-green water, pale sand, yellow reeds, rust-red cliffs, dark green hills.',
  },
  {
    id: 'bf05-yangtze-crossing',
    no: '⑤B',
    zh: '大江·渡江',
    round: 1,
    build: yangtzeCrossing,
    camps: { a: [5, 16], d: [42, 16] },
    target: { plain: 40, forest: 15, hill: 10, water: 25, cliff: 10 },
    about: [
      '从北面攻建业：大江竖贯，中间一条长长的江心洲，两侧各 3 格水。',
      '守方岸是一整段临江悬崖，只留两处登陆滩口；攻方岸是滩涂和芦苇荡。',
    ],
    legend: {
      '~': 'the broad grey-green Yangtze river flowing top to bottom',
      _: 'pale mud flats on the left bank, a long sandy midstream island, and two small landing beaches',
      r: 'reed beds on the island and the left bank',
      '#': 'steep riverside cliffs along the whole right bank',
      '^': 'rounded hills',
      T: 'small woods',
      V: 'hamlets',
      '+': 'dirt roads',
      '.': 'fields and grass',
    },
    setting:
      'The lower Yangtze above Jianye, late Eastern Han dynasty. Overcast spring morning. Palette: grey-green water, pale sand, yellow-green reeds, dark grey-brown cliffs.',
  },
  {
    id: 'bf06-valley-north',
    no: '⑥北',
    zh: '河谷川地（渭水）',
    round: 1,
    build: riverValley,
    camps: { a: [5, 18], d: [42, 10] },
    rows: { a: [13, 22], d: [6, 14] },
    target: { plain: 49, forest: 10, hill: 22, water: 10, cliff: 9 },
    about: [
      '渭水谷地：上下两条山带夹出一条川地，一条河呈 S 形把双方隔在两岸，中间一座桥。',
      '守方后方边缘露出城池一角（城墙、城门、屋顶）。',
    ],
    legend: {
      '~': 'a medium river winding through the valley in an S-curve',
      '^': 'loess terraces and hill slopes rising along the top and bottom edges',
      '#': 'bare rock ridges at the very top and bottom edges',
      '.': 'dry loess fields on the valley floor',
      T: 'small groves',
      V: 'villages, and the rooftops of a walled city at the right edge',
      W: 'a corner of the city wall',
      G: 'the city gate',
      '+': 'the valley road',
      '=': 'a wooden bridge over the river',
    },
    setting:
      "The Wei River valley west of Chang'an, late Eastern Han dynasty. Late autumn. Palette: loess yellow, ochre terraces, grey-green river, sparse dark green.",
  },
  {
    id: 'bf06-valley-south',
    no: '⑥南',
    zh: '河谷川地（汉水）',
    round: 1,
    build: (g) => riverValley(g, true),
    camps: { a: [5, 18], d: [42, 10] },
    rows: { a: [13, 22], d: [6, 14] },
    target: { plain: 49, forest: 10, hill: 22, water: 10, cliff: 9 },
    about: ['汉水谷地：与 ⑥北 同一布局，换成稻田、绿色山坡；城池一角是襄阳。'],
    legend: {
      '~': 'the jade-green Han River winding through the valley in an S-curve',
      '^': 'green wooded hill slopes along the top and bottom edges',
      '#': 'grey rock outcrops at the very top and bottom edges',
      '.': 'green rice paddies and vegetable fields on the valley floor',
      T: 'camphor and broadleaf groves',
      V: 'villages, and the rooftops of the walled city of Xiangyang at the right edge',
      W: 'a corner of the city wall',
      G: 'the city gate',
      '+': 'the valley road',
      '=': 'a wooden bridge over the river',
    },
    setting:
      'The Han River valley at Xiangyang, late Eastern Han dynasty. Early summer. Palette: jade green water, fresh green paddies, dark green hills, grey walls.',
  },
  {
    id: 'bf07-taihang',
    no: '⑦太行',
    zh: '北方山丘（太行）',
    round: 1,
    build: (g) => northHills(g, false),
    camps: { a: [5, 16], d: [42, 16] },
    rows: [13, 19],
    target: { plain: 35, forest: 10, hill: 35, water: 5, cliff: 15 },
    about: [
      '太行陉道：一条蜿蜒谷道横贯全图，谷底有干河床；两侧是黄土丘陵和裸岩。',
      '两条山间小径翻过高地，可绕行或占高地用落石。',
    ],
    legend: {
      '.': 'the floor of a winding mountain pass and small terraced dry fields',
      _: 'a pale, stony dry riverbed along the pass',
      '^': 'eroded loess hills and rocky slopes',
      '#': 'bare grey crags and rock walls',
      '+': 'narrow goat paths over the hills',
      '~': 'two tiny mountain springs',
      T: 'sparse pines and junipers',
      V: 'a small stone hamlet',
    },
    setting:
      'A pass through the Taihang Mountains, late Eastern Han dynasty. Cold early winter. Palette: cold grey rock, loess yellow, dark pine green, very little color.',
  },
  {
    id: 'bf07-rolling-hills',
    no: '⑦丘陵',
    zh: '北方山丘（沂蒙、方城）',
    round: 2,
    build: (g) => northHills(g, true),
    camps: { a: [5, 16], d: [42, 16] },
    rows: [12, 20],
    target: { plain: 35, forest: 12, hill: 45, water: 3, cliff: 5 },
    about: ['沂蒙丘陵、方城隘口：与 ⑦太行 同一走向，谷道更宽、岩壁更少、坡更缓。'],
    legend: {
      '.': 'a broad valley floor and terraced dry fields',
      _: 'a pale dry streambed',
      '^': 'gentle rolling hills with thin grass',
      '#': 'two small rock outcrops',
      '+': 'footpaths over the hills',
      '~': 'two tiny springs',
      T: 'pine and oak groves',
      V: 'a small hamlet',
    },
    setting:
      'The rolling hills of southern Shandong, late Eastern Han dynasty. Autumn. Palette: dry grass yellow, ochre, grey-green, dark pine green.',
  },
  {
    id: 'bf08-south-hills',
    no: '⑧',
    zh: '南方丘陵',
    round: 1,
    build: southHills,
    camps: { a: [5, 16], d: [42, 16] },
    target: { plain: 40, forest: 25, hill: 25, water: 8, cliff: 2 },
    about: [
      '巴蜀、荆门丘陵：圆丘散布，丘间水田，竹林成片，一条溪流蜿蜒穿过。',
      '攻方一侧有一段缓缓上升的长坡（长坂坡意象）。',
    ],
    legend: {
      '^': 'round green hills and one long gentle slope',
      T: 'broadleaf woods on the hilltops',
      b: 'dense bamboo groves',
      '.': 'terraced and flat rice paddies between the hills',
      '~': 'a winding stream and a small pond',
      '#': 'a small grey rock outcrop on a hilltop',
      V: 'hamlets with dark tile roofs',
      '+': 'red-earth footpaths',
      '=': 'a small plank bridge',
    },
    setting:
      'The hills of Jingmen and the Sichuan basin, late Eastern Han dynasty. Humid spring with light mist. Palette: fresh greens, teal bamboo, red-brown earth paths, silver water.',
  },
  {
    id: 'bf09-gorge',
    no: '⑨峡谷',
    zh: '峡谷栈道',
    round: 1,
    build: gorge,
    camps: { a: [4, 19], d: [43, 11] },
    rows: [9, 22],
    target: { plain: 22, forest: 8, hill: 15, water: 10, cliff: 45 },
    about: [
      '秦岭褒斜道、祁山道：深峡横贯，谷底急流；岩嘴把谷底挤成 1 格栈道。',
      '中段一块开阔谷地作主战场，上下各一条侧谷通往伏兵台地。',
    ],
    legend: {
      '#': 'sheer misty cliffs filling the top and bottom of the map',
      '.': 'the gorge floor: gravel banks and small level clearings',
      '=': 'timber plank roads (栈道) bolted to the cliff face, and two log bridges over the torrent',
      '~': 'a fast, white-flecked mountain torrent',
      '^': 'small high terraces at the head of side gullies',
      T: 'clinging pines',
      V: 'a tiny post station',
    },
    setting:
      'The Baoxie plank road through the Qinling Mountains, late Eastern Han dynasty. Damp autumn with drifting cloud. Palette: blue-grey rock, ink black shadows, moss green, white water.',
  },
  {
    id: 'bf09-three-gorges',
    no: '⑨三峡',
    zh: '峡谷栈道（三峡）',
    round: 2,
    build: threeGorges,
    // Camps at the mouths of the basin: from the map edges, two-cell towpaths
    // stretched battles to a 15-day median; here the median is 9 days.
    camps: { a: [14, 10], d: [33, 10] },
    rows: [10, 21],
    target: { plain: 22, forest: 4, hill: 6, water: 25, cliff: 43 },
    about: ['三峡：大江从峡底横贯，两岸是贴崖的纤道，中段一小块河谷盆地。'],
    legend: {
      '#': 'towering limestone gorge walls',
      '~': 'the green Yangtze racing through the gorge',
      '=': 'narrow towpaths cut into the cliffs along both banks',
      _: 'a gravel bar in midstream and boulder banks between the towpaths and the water',
      '.': 'a small riverside basin and gully floors',
      '^': 'small high terraces',
      T: 'clinging trees',
      V: 'a tiny riverside village',
    },
    setting:
      'The Three Gorges of the Yangtze, late Eastern Han dynasty. Misty spring. Palette: grey-white limestone, deep green water, moss green.',
  },
  {
    id: 'bf10-mountain-pass',
    no: '⑩',
    zh: '雄关隘口',
    round: 1,
    build: mountainPass,
    camps: { a: [5, 15], d: [42, 15] },
    target: { plain: 40, forest: 10, hill: 25, water: 0, cliff: 25 },
    about: [
      '潼关、虎牢关、剑门关：上下两山夹峙，一道关墙横断山口；大路上是 3 格宽的主城门，南面另有一座 2 格宽的侧门。关前缓坡，关后营地。',
      '一条 1 格险峻小道翻过北面山崖绕过关隘。',
    ],
    legend: {
      '#': 'steep rock cliffs and crags',
      '^': 'rugged hill slopes on the approach side',
      W: 'a massive rammed-earth and brick pass wall running from cliff to cliff',
      G: 'the main fortified gate with a gate tower on the road, and a smaller side gate to the south',
      '+': 'the road through the gate, and a perilous narrow trail over the crags',
      '.': 'an open grassy approach slope and the ground behind the pass',
      T: 'pine groves',
      V: 'barracks behind the wall',
    },
    setting:
      'Tong Pass between the mountains, late Eastern Han dynasty. Clear cold autumn. Palette: ochre walls, grey rock, dry grass, dark pine green.',
  },
];

// ---------------------------------------------------------------- outputs

function deployCells(map, cells, side) {
  const xs = side === 'a' ? [10, 13] : [34, 37];
  const [y0, y1] = Array.isArray(map.rows) ? map.rows : (map.rows?.[side] ?? [11, 20]);
  const result = [];
  for (let y = y0; y <= y1; y++)
    for (let x = xs[0]; x <= xs[1]; x++) {
      const logic = CLASSES[cells[y][x]].logic;
      if (logic !== 'water' && logic !== 'cliff') result.push([x, y]);
    }
  return { rect: [xs[0], y0, xs[1], y1], cells: result };
}

function validate(map, cells) {
  const errors = [];
  const passable = (x, y) => CLASSES[cells[y][x]].logic !== 'cliff';
  for (const side of ['a', 'd']) {
    const [x, y] = map.camps[side];
    if (!passable(x, y) || CLASSES[cells[y][x]].logic === 'water')
      errors.push(`camp ${side} is not on dry ground`);
    if (deployCells(map, cells, side).cells.length < 10)
      errors.push(`deployment ${side} has fewer than 10 cells`);
  }
  const seen = new Set();
  const queue = [map.camps.a];
  while (queue.length) {
    const [x, y] = queue.pop();
    const key = y * W + x;
    if (seen.has(key) || x < 0 || y < 0 || x >= W || y >= H || !passable(x, y)) continue;
    seen.add(key);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  if (!seen.has(map.camps.d[1] * W + map.camps.d[0])) errors.push('camps are not connected');
  // No sealed pockets: every passable cell can be reached from the camps.
  let sealed = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) if (passable(x, y) && !seen.has(y * W + x)) sealed++;
  if (sealed) errors.push(`${sealed} passable cells cannot be reached`);
  // Walls are one cell thick, so archers can shoot over them.
  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W - 1; x++)
      if (
        [cells[y][x], cells[y][x + 1], cells[y + 1][x], cells[y + 1][x + 1]].every((c) => c === 'W')
      )
        errors.push(`wall is thicker than one cell at ${x},${y}`);
  // Closing every gate must not cut off any ground behind a wall, unless it has two gates.
  const closed = new Set();
  const flood = [map.camps.a];
  while (flood.length) {
    const [x, y] = flood.pop();
    const key = y * W + x;
    if (
      closed.has(key) ||
      x < 0 ||
      y < 0 ||
      x >= W ||
      y >= H ||
      !passable(x, y) ||
      cells[y][x] === 'G'
    )
      continue;
    closed.add(key);
    flood.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const neighbours = (key) => {
    const [x, y] = [key % W, Math.floor(key / W)];
    return [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ]
      .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < W && ny < H && passable(nx, ny))
      .map(([nx, ny]) => ny * W + nx);
  };
  const isGate = (key) => cells[Math.floor(key / W)][key % W] === 'G';
  // Collect a 4-connected group of cells that all pass the test.
  const group = (start, test) => {
    const found = new Set([start]);
    for (const key of found) for (const next of neighbours(key)) if (test(next)) found.add(next);
    return found;
  };
  const done = new Set();
  for (const key of seen) {
    if (closed.has(key) || isGate(key) || done.has(key)) continue;
    const inside = group(key, (next) => !isGate(next));
    for (const k of inside) done.add(k);
    // Adjacent gate cells, merged into openings: a 3-cell gate is still one gate.
    const gateCells = new Set([...inside].flatMap(neighbours).filter(isGate));
    const openings = new Set();
    for (const gate of gateCells) openings.add(Math.min(...group(gate, isGate)));
    if (openings.size < 2)
      errors.push(`walled ground near ${key % W},${Math.floor(key / W)} has ${openings.size} gate`);
  }
  return errors;
}

function stats(cells) {
  const counts = { plain: 0, forest: 0, hill: 0, water: 0, cliff: 0 };
  for (const row of cells) for (const c of row) counts[CLASSES[c].logic]++;
  return Object.fromEntries(
    Object.entries(counts).map(([k, v]) => [k, Math.round((v / (W * H)) * 100)]),
  );
}

// Soft-cornered reference: each pixel takes the class with the most nearby cell weight,
// so stair steps become curves while thin rivers, roads and walls survive.
function referencePng(cells) {
  const pw = W * CELL;
  const ph = H * CELL;
  const raw = Buffer.alloc((pw * 3 + 1) * ph);
  for (let py = 0; py < ph; py++) {
    const v = (py + 0.5) / CELL - 0.5;
    raw[py * (pw * 3 + 1)] = 0;
    for (let px = 0; px < pw; px++) {
      const u = (px + 0.5) / CELL - 0.5;
      const weights = {};
      for (let j = Math.floor(v) - 1; j <= Math.floor(v) + 2; j++)
        for (let i = Math.floor(u) - 1; i <= Math.floor(u) + 2; i++) {
          const c = cells[Math.max(0, Math.min(H - 1, j))][Math.max(0, Math.min(W - 1, i))];
          const w = Math.max(0, 1 - Math.hypot(u - i, v - j)) * (THIN.has(c) ? 1.35 : 1);
          if (w > 0) weights[c] = (weights[c] ?? 0) + w;
        }
      const best = Object.entries(weights).sort((a, b) => b[1] - a[1])[0][0];
      raw.set(CLASSES[best].rgb, py * (pw * 3 + 1) + 1 + px * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(pw, 0);
  ihdr.writeUInt32BE(ph, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

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

const colorName = ([r, g, b]) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

function prompt(map, used) {
  const legend = [...used]
    .map(
      (c) =>
        `- ${colorName(CLASSES[c].rgb)} (${describeColor(c)}): ${map.legend[c] ?? LEGEND_EN[c]}`,
    )
    .join('\n');
  return `Strictly preserve the positions, shapes and sizes of every feature in the attached layout image. The attached image is a color-coded layout map, not a style reference: repaint it as a finished illustration while keeping every boundary in the same place.

${SHAPES}
${used.includes('W') || used.includes('P') ? `\n${WALLS}\n` : ''}
Subject: a top-down 2D battlefield map for a Three Kingdoms strategy game. Camera is straight overhead (orthographic, 90 degrees down). No perspective, no horizon, no sky, no tilted or isometric view. Output 1536×1024, landscape, the whole frame filled edge to edge.

Layout legend (each color in the layout image means exactly this):
${legend}

Setting: ${map.setting}

${STYLE}

${READABILITY}

Do not include: ${BASE_EXCLUDE}.`;
}

function describeColor(c) {
  return {
    '.': 'beige',
    '+': 'brown',
    '=': 'dark brown',
    _: 'pale cream',
    V: 'red-brown',
    G: 'bright red',
    T: 'dark green',
    b: 'teal green',
    r: 'yellow-green',
    '^': 'olive',
    '~': 'blue',
    '#': 'dark grey-brown',
    W: 'blue-grey',
    P: 'purple',
  }[c];
}

function readme(map, cells, used) {
  const s = stats(cells);
  const a = deployCells(map, cells, 'a');
  const d = deployCells(map, cells, 'd');
  const shown = cells.map((row) => [...row]);
  shown[map.camps.a[1]][map.camps.a[0]] = 'a';
  shown[map.camps.d[1]][map.camps.d[0]] = 'd';
  const legend = [...used]
    .map(
      (c) =>
        `| \`${c}\` | ${CLASSES[c].zh} | ${LOGIC_ZH[CLASSES[c].logic]} | ${colorName(CLASSES[c].rgb)} |`,
    )
    .join('\n');
  const ratio = Object.keys(s)
    .map((k) => `| ${LOGIC_ZH[k]} | ${s[k]}% | ${map.target[k]}% |`)
    .join('\n');
  return `# ${map.no} ${map.zh}

\`${map.id}\` · 第${'一二三'[map.round - 1]}轮 · 由 \`node tools/build-battlefield-art.mjs\` 生成，请改脚本而不是改这个文件。

${map.about.map((line) => `- ${line}`).join('\n')}

## 参考图

![layout](layout.png)

## 格子布局（48×32）

x 0–47 从左到右，y 0–31 从上到下。攻方在左，守方在右。\`a\`/\`d\` 是攻方、守方营地。

\`\`\`
${shown.map((row) => row.join('')).join('\n')}
\`\`\`

| 符号 | 画面 | 规则格子 | 参考图颜色 |
| --- | --- | --- | --- |
${legend}

- 攻方部署区：x ${a.rect[0]}–${a.rect[2]}，y ${a.rect[1]}–${a.rect[3]}，可用 ${a.cells.length} 格
- 守方部署区：x ${d.rect[0]}–${d.rect[2]}，y ${d.rect[1]}–${d.rect[3]}，可用 ${d.cells.length} 格

| 规则格子 | 实际 | 目标 |
| --- | --- | --- |
${ratio}

## 提示词

上传 \`layout.png\`，尺寸 1536×1024，粘贴：

\`\`\`text
${prompt(map, used)}
\`\`\`

## 出图记录

出的图放进 \`attempts/\`，文件名用 \`v1.webp\`、\`v2.webp\` 依次编号。
`;
}

// Game data: the same layouts, read by src/v03/battle/battlefields/layout.ts.
const GAME_LAYOUTS = 'src/v03/battle/battlefields/layouts.generated.ts';
function gameLayoutEntry(map, cells) {
  const rows = (side) => (Array.isArray(map.rows) ? map.rows : (map.rows?.[side] ?? [11, 20]));
  const point = ([x, y]) => `{ x: ${x}, y: ${y} }`;
  return `  {
    id: '${map.id}',
    camps: { attacker: ${point(map.camps.a)}, defender: ${point(map.camps.d)} },
    deploymentRows: { attacker: [${rows('a').join(', ')}], defender: [${rows('d').join(', ')}] },
    rows: [
${cells.map((row) => `      '${row.join('')}',`).join('\n')}
    ],
  },`;
}

let failed = false;
const gameEntries = [];
for (const map of MAPS) {
  const g = grid();
  map.build(g);
  const cells = g.cells;
  const errors = validate(map, cells);
  if (errors.length) {
    failed = true;
    console.error(`${map.id}: ${errors.join('; ')}`);
  }
  const used = new Set(cells.flat());
  const order = Object.keys(CLASSES).filter((c) => used.has(c));
  const dir = join(OUT, map.id);
  await mkdir(join(dir, 'attempts'), { recursive: true });
  await writeFile(join(dir, 'layout.png'), referencePng(cells));
  await writeFile(join(dir, 'layout.txt'), `${cells.map((row) => row.join('')).join('\n')}\n`);
  await writeFile(join(dir, 'README.md'), readme(map, cells, order));
  gameEntries.push(gameLayoutEntry(map, cells));
  console.log(`${map.id}: ${JSON.stringify(stats(cells))}`);
}
await mkdir(join(GAME_LAYOUTS, '..'), { recursive: true });
await writeFile(
  GAME_LAYOUTS,
  `// Generated by tools/build-battlefield-art.mjs; edit the tool and rerun it, not this file.
import type { CanvasBattlefieldLayout } from './layout';

export const CANVAS_BATTLEFIELD_LAYOUTS: readonly CanvasBattlefieldLayout[] = [
${gameEntries.join('\n')}
];
`,
);
if (failed) process.exitCode = 1;
