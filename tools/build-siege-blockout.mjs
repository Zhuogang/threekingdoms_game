import { deflateSync } from 'node:zlib';
import { mkdir, readdir, readFile, rm, writeFile as writeFileNow } from 'node:fs/promises';
import { join } from 'node:path';
import * as prettier from 'prettier';

// Builds the Chencang siege art kit in docs/siege/chencang/art/ (plan:
// docs/siege/01-chencang-art-plan.md §8). Each S1 asset gets a folder with an
// oblique block-out rendered from the layout and height table, a transparent
// alignment grid, per-object masks and footprints for cutting layers, and the
// full ImageGen prompt.
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
// road from the south, Wei relief from the east.
const LAYOUT = [
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  '................................................',
  '..............++++++++++++++++++++++++++++++++++',
  '^^^.........-----------==-----------............',
  '^^^^........--OWWWWWWWWGGWWWWWWWWO--............',
  '^^^^^.......--W........++........W--............',
  '^^TTT^......--W..BBBBB.++KKKK....W--....TT......',
  '^TTTTT......--W..BBBBB.++KKKK....W--...TTTT.....',
  '^^TTT^......--W..BBBBB.++KKKK....W--....TT......',
  '^^^^^.......--W........++........W--............',
  '^^^^...+++++==G++++++++++++++++++G==++++++++++++',
  '^^^^...+....--W........++........W--............',
  '^^^....+....--W..BBBBB.++.BBBBB..W--............',
  '^^^....+....--W..BBBBB.++.BBBBB..W--.........^^.',
  '^^.....+....--WR.RRRRRR++RRRRRR.RW--........^^^.',
  '^^.....+....--W........++........W--.........^^^',
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

function cityObjects() {
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
  // Siege-engine workshops and the chancellor's tent in the Shu camp.
  for (const [n, x] of [
    [1, 15],
    [2, 29],
  ])
    objects.push({
      id: `workshop-${n}`,
      kind: 'workshop',
      key: 'shed',
      row: 24,
      cells: [x, 23, x + 3, 24],
      symbols: 'S',
      parts: [
        box(x + 0.1, x + 3.9, 23.15, 24.88, 0, 1.1, C.shedBody, C.shedBody),
        roof(x - 0.02, x + 4.02, 23.02, 25, 1.1, 2, 'ew', 0.4, C.shed),
      ],
    });
  objects.push({
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
  // One piece per cell for tents, palisade stakes and pines.
  const isP = (x, y) => LAYOUT[y]?.[x] === 'P';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = LAYOUT[y][x];
      const at = { row: y, cells: [x, y, x, y], symbols: s };
      if (s === 't')
        objects.push({
          id: `tent-${x}-${y}`,
          kind: 'tent',
          key: 'tent',
          ...at,
          parts: [
            box(x + 0.12, x + 0.88, y + 0.18, y + 0.9, 0, 0.25, C.tent, shade(C.tent, 0.2)),
            roof(x + 0.08, x + 0.92, y + 0.14, y + 0.94, 0.25, 1, 'ns', 0, C.tent),
          ],
        });
      if (s === 'P') {
        const [a, b] = [0.41, 0.59];
        const parts = [];
        if (isP(x, y - 1)) parts.push([x + a, x + b, y, y + b]);
        if (isP(x - 1, y)) parts.push([x, x + b, y + a, y + b]);
        if (isP(x + 1, y)) parts.push([x + a, x + 1, y + a, y + b]);
        if (isP(x, y + 1)) parts.push([x + a, x + b, y + a, y + 1]);
        objects.push({
          id: `palisade-${x}-${y}`,
          kind: 'palisade',
          key: 'palisade',
          ...at,
          parts: parts.map((r) => box(...r, 0, 1, C.palisade)),
        });
      }
      if (s === 'T')
        objects.push({
          id: `pine-${x}-${y}`,
          kind: 'tree',
          key: 'pine',
          foundation: false,
          ...at,
          parts: [
            box(x + 0.45, x + 0.55, y + 0.5, y + 0.6, 0, 0.6, C.timber, C.timber),
            roof(x + 0.1, x + 0.9, y + 0.12, y + 0.88, 0.45, 2.2, 'ew', 0.38, C.pine),
          ],
        });
    }
  return objects;
}

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
      const needsObject = 'WOGBSCtPT'.includes(s) || (s === 'K' && y === 6);
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
function renderScene(canvas, f, objects, { flat = false } = {}) {
  const decals = groundDecals();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) drawTerrain(canvas, f, x, y);
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

// Final-resolution outputs: averaged colour, soft masks, sampled buffers.
function resolve(canvas) {
  const { w, h, W: cw } = canvas;
  const rgb = new Uint8Array(w * h * 3);
  const masks = new Map();
  const sample = (px, py) => (py * SS + (SS >> 1)) * cw + px * SS + (SS >> 1);
  const face = new Int32Array(w * h);
  const obj = new Uint16Array(w * h);
  const top = new Float32Array(w * h);
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
    }
  return { rgb, masks, face, obj, top, keys };
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
const STYLES = {
  a: {
    zh: 'A 界画淡彩',
    text: 'Style: traditional Chinese ink-wash painting with light colour (水墨淡彩), with the precision of jiehua (界画) ruled-line architectural painting: crisp, straight, evenly weighted ink lines on walls, gate towers, timber and roof tiles; soft transparent washes on snow, earth, ice and water; subtle rice-paper grain. Restrained winter palette: warm paper-white snow, ochre rammed earth, grey brick, dark timber, slate roof tiles, muted pine green, with small accents of red lacquer.',
  },
  b: {
    zh: 'B 写意淡彩',
    text: 'Style: expressive Chinese ink-wash painting with light colour (写意淡彩): confident loose brush strokes and wet-on-wet washes, architecture suggested with fewer lines but still straight and readable, generous paper-white snow, subtle rice-paper grain. Restrained winter palette: ochre earth, grey brick, dark timber, slate roofs, muted pine green.',
  },
  c: {
    zh: 'C 沙盘微缩',
    text: 'Style: a hand-made military sand-table diorama (沙盘) finished in Chinese ink-wash colours: matte clay ground, carved wooden buildings with slightly softened edges, gentle ambient occlusion where surfaces meet, faint ink outlines. Everything stays in sharp focus; no tilt-shift blur. Restrained winter palette: paper-white snow, ochre earth, grey brick, dark timber, slate roofs.',
  },
};
// DS6 picked A; S1-01 still tries all three. Switch this once you choose.
const CHOSEN_STYLE = 'a';
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
const MATCH_STANDARD =
  'Match the brushwork, line weight, colours and lighting of the second attached image exactly.';

const SCENE_LEGEND = {
  snow: `pale grey-white (${C.snow}): open ground under fresh snow`,
  road: `brown (${C.road}): trampled mud-and-snow roads: the two streets that cross the city between its four gates, the approach roads, and the road along the river bank`,
  ice: `pale icy blue, one level below the ground (${C.ice}): the frozen Wei River`,
  trench: `steel blue, one level below the ground (${C.trench}), with ochre-brown earth banks (${C.bank}): the defensive trench around the walls, half-frozen dark water between steep earth banks`,
  bridge: `dark brown (${C.bridge}): plank bridges over the trench in front of the gates`,
  hill: `olive (${C.hill}): low snowy hills`,
  wall: `blue-grey top with a darker front (${C.wallTop} / ${C.wallFront}): the city wall, rammed earth faced with grey brick, three levels high; the light top is the walkway and the darker strip along its outer edge (${C.parapetTop}) is a crenellated parapet`,
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

const sceneChecks = [
  '100% 缩放下，城墙顶走道、城门、堑和桥是否一眼能认出。',
  '有没有透视、有没有画出建筑的东西侧面（都不该有），竖直棱线是否竖直。',
  '把 `grid.png` 叠在出图上：墙、门楼、营房的顶面与灰盒误差不超过 1/4 格（横 16px、纵 12px）。',
  '灰盒里的红色门洞、蓝灰墙体有没有被照搬成颜色。',
];

const ASSETS = [
  {
    id: 's1-01-city-vignette',
    zh: 'S1-01 陈仓全城小景',
    size: [1536, 1024],
    about: [
      '取景 x 12–35、y 1–21（24×21 格），每格 64×48、每层 24px，正好是游戏 100% 缩放的分辨率，不用放大；底部多出 16px。',
      '出三张，提示词只差风格段：A 界画淡彩、B 写意淡彩、C 沙盘微缩。你选定风格后，选中的那张也是 α 法（整画切层）的测试图，`masks/` 就是切层用的蒙版。',
    ],
    render() {
      const canvas = createCanvas(1536, 1024, C.snow);
      renderScene(canvas, VIGNETTE, cityObjects());
      return { canvas, frame: VIGNETTE, masks: true };
    },
    prompts(keys) {
      return Object.entries(STYLES).map(([k, s]) => ({
        title: s.zh,
        file: `v1-${k}.webp`,
        text: [
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
    naming: '依次命名 `v1-a.webp`、`v1-b.webp`、`v1-c.webp`，第二轮 `v2-a.webp`……',
  },
  {
    id: 's1-02-south-gate',
    zh: 'S1-02 南门门楼（标准件）',
    size: [1024, 1024],
    about: [
      '取景 x 21–26：6 格城墙，城门洞 x 23–24，门楼 x 22–25（两层，屋脊在 7 层）。每格 128×96、每层 48px，是 100% 的 2 倍。',
      '只画物件本身：底边是地面线，不含地面和堑。',
      '这一件定了就是**标准件**：从 S1-03 起，每件都上传它当风格参考。',
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
    prompts: () => [
      {
        text: [
          FIDELITY,
          PROJECTION,
          'Subject: one building piece for a strategy game: the south gate of Chencang. A six-cell section of the city wall (rammed earth faced with grey brick, three levels high, a light walkway on top and a crenellated parapet along the front edge) with a two-cell gate passage in the middle. Heavy iron-studded timber gate doors stand closed inside the passage. On the wall above the passage stands a two-storey timber gate tower: red-lacquered columns, white plastered walls with lattice windows, a wooden gallery around the upper storey, and a snow-covered grey tile hip-and-gable roof with gently upturned eaves. In the block-out the red panel marks the gate passage: paint it as a dark gateway with the closed doors inside, never red. Output 1024×1024. In the block-out, one grid cell is 128 pixels wide and 96 pixels deep, and one height level is 48 pixels.',
          SPRITE,
          LIGHT_SPRITE,
          STYLES[CHOSEN_STYLE].text,
          EXCLUDE_SPRITE,
        ].join('\n\n'),
      },
    ],
    uploads: [
      '`blockout.png`',
      '可选：选定的 S1-01 图，作第二张参考图；这时在提示词最前面加一句 `Match the brushwork, line weight, colours and lighting of the second attached image exactly.`',
    ],
    checks: [
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
    size: [1536, 1024],
    about: [
      '3×2 宫格，每格 512×512 放一件；每格 128×96、每层 48px，同 S1-02。',
      '六件：上排是南墙直段（3 格）、西南角楼、东南角楼；下排是西墙段（南北向 2 格）、东墙段（2 格）、北墙直段（3 格，从城内看）。',
      '和计划初稿相比：南墙直段从 4 格改成 3 格、西墙段从 3 格改成 2 格，否则放不进 512 格还留 32px 边；西门（一层门楼）高 3 格、放不下，挪到 S2 和东门一起做，这里换成北墙直段，补上"从城内看女墙"这种情况。',
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
      const frames = pieces.map(([zh, objects], i) => {
        const cell = [(i % 3) * 512, Math.floor(i / 3) * 512];
        const f = renderPiece(canvas, SCALE_2X, objects, [...cell, cell[0] + 512, cell[1] + 512]);
        return { piece: i + 1, zh, cell, frame: f, objects };
      });
      return { canvas, frame: frames[0].frame, pieces: frames };
    },
    prompts: () => [
      {
        text: [
          MATCH_STANDARD,
          FIDELITY,
          PROJECTION,
          [
            'Subject: a modular kit of city-wall pieces for a strategy game, six separate pieces arranged in a 3 by 2 grid exactly as in the block-out, one piece centred in each 512×512 cell, with clear empty space between pieces. All pieces share the same wall: rammed earth faced with grey brick, three levels high, a light walkway on top with a crenellated parapet along the outer edge, snow on every top surface.',
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
    uploads: ['`blockout.png`', '定稿的 S1-02（第二张，风格参考）'],
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
    size: [1536, 1024],
    about: [
      '取景同 S1-01。灰盒里的城墙和建筑都压平成暗灰色地基（`#5a5650`），只留地面。',
      'β 法的 L1 地表层：上面再摆 S1-02、S1-03 的分件。',
    ],
    render() {
      const canvas = createCanvas(1536, 1024, C.snow);
      renderScene(canvas, VIGNETTE, cityObjects(), { flat: true });
      return { canvas, frame: VIGNETTE };
    },
    prompts: (keys) => [
      {
        text: [
          MATCH_STANDARD.replace(
            'second attached image',
            'second attached image (the chosen city view)',
          ),
          FIDELITY,
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
    uploads: ['`blockout.png`', '选定的 S1-01 图（第二张，风格参考）'],
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
    size: [1536, 1024],
    guide: { cols: 3, rows: 3, figure: 240, foot: 24 },
    about: [
      '3×3 宫格，每格约 512×341：行是背面（朝北）、侧面（朝东）、正面（朝南），列是待机、行进、攻击。',
      '人物从脚底到头盔顶约 240px（计划初稿写 280px，但格子只有 341px 高，戟会顶出格子），戟可以高出头顶线。',
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
          EXCLUDE_SPRITE,
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
    size: [1536, 1024],
    guide: { cols: 3, rows: 2, figure: 300, foot: 56 },
    about: [
      '3×2 宫格，每格 512×512。第一行正面（朝南）的待机、拉弓、放火箭；第二行背面待机、侧面（朝东）待机、侧面拉弓。',
      '人物从脚底到头盔顶约 300px。',
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
          EXCLUDE_SPRITE,
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
        `${p.title ? `### ${p.title}\n\n` : ''}${p.file ? `出图存为 \`attempts/${p.file}\`。\n\n` : ''}\`\`\`text\n${p.text}\n\`\`\``,
    )
    .join('\n\n');
  const image = asset.guide ? 'guide.png' : 'blockout.png';
  return `# ${asset.zh}

\`${asset.id}\` · 由 \`node tools/build-siege-blockout.mjs\` 生成，请改脚本而不是改这个文件。计划见 [${PLAN}](../../../${PLAN}) §10。

${asset.about.map((line) => `- ${line}`).join('\n')}

## 参考图

![${image.replace('.png', '')}](${image})
${asset.guide ? '' : `\n叠图检查用 \`grid.png\`（透明底）：黑线是地面格子，红线是立体件的面，橙线是墙顶等顶面上的格子。\n`}
## 上传与提示词

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
  return `# 陈仓攻城战：美术资产

由 \`node tools/build-siege-blockout.mjs\` 生成，请改脚本而不是改这个文件。计划见 [${PLAN}](../../${PLAN})。

## 全图灰盒

48×32 全图按计划 §4 的斜俯视投影渲染，缩到 50%（每格 32×24，一层 12px）。只用来检查布局和高度，不上传 ImageGen。

![全图灰盒](blockout-full.png)

## S1 风格锁定

| ID | 资产 | 尺寸 | 出图 |
| --- | --- | --- | --- |
${rows.join('\n')}

顺序：S1-01（三种风格）→ 你选风格 → S1-02 → 你确认标准件 → S1-03、S1-04 → S1-05、S1-06 → 预览页测试场景（计划 §11）。每个提示词出 3–4 张，选一张。

选定风格后，把脚本里的 \`CHOSEN_STYLE\` 改成对应的字母并重新生成，S1-02 以后的提示词就换成新风格。

## 每个文件夹里有什么

- \`blockout.png\`（姿态表是 \`guide.png\`）：上传 ImageGen 的参考图。
- \`grid.png\`：透明底的格子和轮廓，叠在出图上检查对位。
- \`masks/\`：每个立体件在画面上的轮廓蒙版，α 法切层用；女墙前沿单独一张（\`*-parapet.png\`，L4 层）。只有 S1-01 有。
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
  if (asset.guide) {
    const { cols, rows: n, figure, foot } = asset.guide;
    await writeFile(
      join(dir, 'guide.png'),
      png(...asset.size, 3, guideImage(...asset.size, cols, n, figure, foot)),
    );
  } else {
    const { canvas, frame, masks, pieces, objects: drawn = objects } = asset.render();
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
        cell: [...p.cell, 512, 512],
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
  }
  await writeFile(
    join(dir, 'README.md'),
    await pretty(assetReadme(asset, asset.prompts(keys)), 'markdown'),
  );
  const n = await attemptCount(dir);
  rows.push(
    `| ${asset.zh.split(' ')[0]} | [${asset.zh.split(' ').slice(1).join(' ')}](${asset.id}/README.md) | ${asset.size.join('×')} | ${n ? `${n} 张` : '待出图'} |`,
  );
  console.log(`${asset.id}: ${n} attempt(s)`);
}
await writeFile(join(OUT, 'README.md'), await pretty(indexReadme(rows), 'markdown'));
