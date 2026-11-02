import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  SEAM_REACH,
  betaDraws,
  type BetaDraw,
  type KitObject,
  type KitPiece,
} from '../../src/siege/render/betaCity';
import type { SceneObject, SiegeFrame } from '../../src/siege/render/scene';

const read = <T>(path: string) =>
  JSON.parse(readFileSync(`docs/siege/chencang/art/${path}`, 'utf8')) as T;
const city = read<{
  origin: [number, number];
  cell: [number, number];
  level: number;
  objects: SceneObject[];
}>('s1-01-city-vignette/footprints.json');
const gate = read<{
  size: [number, number];
  cell: [number, number];
  origin: [number, number];
  objects: KitObject[];
}>('s1-02-south-gate/footprints.json');
const kit = read<{
  pieces: Array<{
    name: string;
    cell: KitPiece['cell'];
    footprint: { origin: [number, number]; objects: KitObject[] };
  }>;
}>('s1-03-wall-kit/pieces.json');
const frame: SiegeFrame = {
  ox: city.origin[0],
  oy: city.origin[1],
  cw: city.cell[0],
  cd: city.cell[1],
  lh: city.level,
};
const draws = betaDraws({
  frame,
  city: city.objects,
  gate: { name: 's1-02', cell: [0, 0, ...gate.size], origin: gate.origin, objects: gate.objects },
  kit: kit.pieces.map((piece) => ({
    name: piece.name,
    cell: piece.cell,
    origin: piece.footprint.origin,
    objects: piece.footprint.objects,
  })),
  scale: gate.cell[0] / frame.cw,
});
const sheets = draws.filter(
  (draw): draw is Extract<BetaDraw, { type: 'sheet' }> => draw.type === 'sheet',
);
const cellX = (x: number) => frame.ox + x * frame.cw;

describe('β city layout', () => {
  it('places the gate sheet where its own frame puts it', () => {
    const [gateDraw] = sheets.filter((draw) => draw.sheet === 'gate');
    // S1-02's wall starts at x = 21; its sheet pixel 128 is that cell's west edge.
    expect(gateDraw!.dest[0] + 128 / 2).toBe(cellX(21));
    expect(gateDraw!.dest[2] - gateDraw!.dest[0]).toBe(gate.size[0] / 2);
  });

  it('covers the whole south wall from corner to corner without gaps', () => {
    const south = sheets
      .filter((draw) => draw.row === 16)
      .map((draw) => [draw.dest[0], draw.dest[2]] as const)
      .sort((a, b) => a[0] - b[0]);
    let reach = cellX(14);
    for (const [x0, x1] of south) {
      expect(x0).toBeLessThanOrEqual(reach);
      reach = Math.max(reach, x1);
    }
    expect(reach).toBeGreaterThanOrEqual(cellX(34));
  });

  it('cuts straight stretches into pieces of at most three cells and keeps their scale', () => {
    const stretches = sheets.filter((draw) => draw.seam);
    // Two runs of five cells on the south wall (3 + 2 each), two runs of seven on the north (3 + 3 + 1).
    expect(
      stretches.map((draw) => Math.round((draw.dest[2] - draw.dest[0]) / frame.cw)).sort(),
    ).toEqual([1, 1, 2, 2, 3, 3, 3, 3, 3, 3]);
    for (const draw of stretches) {
      // At most 4% wider than the piece was painted.
      const ratio = (draw.src[2] - draw.src[0]) / (draw.dest[2] - draw.dest[0]);
      expect(ratio).toBeGreaterThan(1.92);
      expect(ratio).toBeLessThanOrEqual(2);
      // A straight piece keeps its own vertical scale.
      expect((draw.src[3] - draw.src[1]) / (draw.dest[3] - draw.dest[1])).toBe(2);
    }
  });

  it('meets exactly inside a run and reaches over the neighbours at its ends', () => {
    const run = sheets
      .filter((draw) => draw.seam && draw.row === 16 && draw.dest[0] < cellX(22))
      .map((draw) => draw.dest);
    expect(run.map(([x0, , x1]) => [x0, x1])).toEqual([
      [cellX(16) - SEAM_REACH, cellX(19)],
      [cellX(19), cellX(21) + SEAM_REACH],
    ]);
  });

  it('stacks north-south stretches from north to south, before the corner tower', () => {
    const west = draws.filter(
      (draw) =>
        draw.type === 'sheet' &&
        (draw.label.includes('wall-west') || draw.label === 'southwest-corner'),
    );
    expect(west.map((draw) => draw.row)).toEqual([6, 8, 13, 15, 16]);
  });

  it('fills only the objects with no piece from the α painting', () => {
    const missing = draws.flatMap((draw) => (draw.type === 'painting' ? [draw.objectId] : []));
    expect(missing.sort()).toEqual(
      [
        'armoury',
        'barracks-se',
        'barracks-sw',
        'corner-ne',
        'corner-nw',
        'gate-east',
        'gate-north',
        'gate-west',
        'granary',
        'residence-hall',
        'residence-wall',
      ].sort(),
    );
  });

  it('draws in painter order', () => {
    for (let i = 1; i < draws.length; i++)
      expect(draws[i]!.row).toBeGreaterThanOrEqual(draws[i - 1]!.row);
  });
});
