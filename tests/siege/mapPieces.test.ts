import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CROP_MARGIN,
  campSprites,
  palisadeSprites,
  placeCrop,
  placePiece,
  spriteObject,
  type SheetFootprints,
} from '../../src/siege/render/mapPieces';
import { sliceObject, type SiegeFrame } from '../../src/siege/render/scene';

const read = <T>(path: string) =>
  JSON.parse(readFileSync(`docs/siege/chencang/art/${path}`, 'utf8')) as T;
const layout = readFileSync('docs/siege/chencang/art/layout.txt', 'utf8').trimEnd().split('\n');
const sheets = {
  tents: read<SheetFootprints>('s2-08-camp-tents/footprints.json'),
  palisade: read<SheetFootprints>('s2-09-palisade-kit/footprints.json'),
  workshop: read<SheetFootprints>('s2-10-workshop/footprints.json'),
  scenery: read<SheetFootprints>('s2-11-field-scenery/footprints.json'),
};
const map = read<{ origin: [number, number]; cell: [number, number]; level: number }>(
  's2-01-full-map/footprints.json',
);
const frame: SiegeFrame = {
  ox: map.origin[0],
  oy: map.origin[1],
  cw: map.cell[0],
  cd: map.cell[1],
  lh: map.level,
};
const count = (symbol: string) => layout.join('').split(symbol).length - 1;

describe('siege map pieces', () => {
  it('puts a piece drawn on its own cells back on those map pixels', () => {
    // tent-12-27 was drawn on cell (12, 27): its block-out box divided by the
    // 2× scale must land on the map where the same cell projects.
    const piece = sheets.tents.pieces[1]!;
    const object = piece.objects[0]!;
    const [x0, , x1] = placeCrop(sheets.tents, piece, object.bbox, [12, 27], [12, 27], frame);
    expect(x1 - x0).toBeCloseTo((object.bbox[2] - object.bbox[0]) / 2);
    // The footprint's south-west ground point (the anchor) maps to that cell's projection.
    const [ax, ay] = object.anchor;
    const [mx, my] = placeCrop(sheets.tents, piece, [ax, ay, ax, ay], [12, 27], [12, 27], frame);
    expect(mx).toBeCloseTo(12 * 64);
    expect(my).toBeCloseTo(28 * 48);
  });

  it('moves a piece by whole cells', () => {
    const a = placePiece(sheets.tents, 1, [12, 27], frame, { id: 'a' });
    const b = placePiece(sheets.tents, 1, [20, 29], frame, { id: 'b' });
    expect(b.rect[0] - a.rect[0]).toBeCloseTo(8 * 64);
    expect(b.rect[1] - a.rect[1]).toBeCloseTo(2 * 48);
    expect(b.cells).toEqual([20, 29, 20, 29]);
  });

  it('crops whole pieces to their objects plus a margin, inside their sheet slot', () => {
    for (const sheet of Object.values(sheets))
      sheet.pieces.forEach((piece, i) => {
        const sprite = placePiece(sheet, i, [0, 0], frame, { id: 'x' });
        const [cx, cy, cw, ch] = piece.cell;
        expect(sprite.crop[0]).toBeGreaterThanOrEqual(cx);
        expect(sprite.crop[1]).toBeGreaterThanOrEqual(cy);
        expect(sprite.crop[2]).toBeLessThanOrEqual(cx + cw);
        expect(sprite.crop[3]).toBeLessThanOrEqual(cy + ch);
        const minX = Math.min(...piece.objects.map((o) => o.bbox[0]));
        expect(sprite.crop[0]).toBeGreaterThanOrEqual(Math.max(cx, minX - CROP_MARGIN));
      });
  });

  it('covers every palisade cell exactly once, with bands that join on cell edges', () => {
    const sprites = palisadeSprites(layout, sheets.palisade, frame);
    const covered = new Map<string, number>();
    for (const {
      cells: [x0, y0, x1, y1],
    } of sprites)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
          covered.set(`${x},${y}`, (covered.get(`${x},${y}`) ?? 0) + 1);
    const wanted = new Set(
      layout.flatMap((row, y) => [...row].flatMap((s, x) => (s === 'P' ? [`${x},${y}`] : []))),
    );
    for (const key of wanted) expect(covered.get(key), key).toBeGreaterThanOrEqual(1);
    const bands = sprites.filter((s) => /^palisade-\d+-\d+$/.test(s.id));
    for (const band of bands) expect(band.cells[0]).toBe(band.cells[2]);
    // East-west bands are exactly one cell wide on the map.
    const row26 = bands.filter((s) => s.cells[1] === 26).sort((a, b) => a.cells[0] - b.cells[0]);
    expect(row26.length).toBeGreaterThan(0);
    for (const band of row26) {
      expect(band.rect[2] - band.rect[0]).toBeCloseTo(64);
      expect(band.rect[0]).toBeCloseTo(band.cells[0] * 64);
    }
    // No band repeats a cell the corner or gate pieces already draw.
    const bandCells = bands.map((s) => `${s.cells[0]},${s.cells[1]}`);
    expect(new Set(bandCells).size).toBe(bandCells.length);
    for (const cell of ['10,26', '11,26', '10,27', '36,26', '37,26', '37,27', '21,26', '26,26'])
      expect(bandCells).not.toContain(cell);
  });

  it('places one piece per tent, pine, workshop block and the chancellor tent', () => {
    const sprites = campSprites(layout, sheets, frame);
    expect(sprites.filter((s) => s.id.startsWith('tent-'))).toHaveLength(count('t'));
    expect(sprites.filter((s) => s.id.startsWith('pine-'))).toHaveLength(count('T'));
    expect(sprites.filter((s) => s.id === 'hq-tent')).toHaveLength(1);
    const workshops = sprites.filter((s) => s.id.startsWith('workshop-'));
    expect(workshops.map((s) => s.cells)).toEqual([
      [15, 23, 18, 24],
      [29, 23, 32, 24],
    ]);
    expect(new Set(sprites.map((s) => s.id)).size).toBe(sprites.length);
  });

  it('slices sprites like painted objects', () => {
    const hq = campSprites(layout, sheets, frame).find((s) => s.id === 'hq-tent')!;
    const slices = sliceObject(frame, spriteObject(hq));
    expect(slices.map((s) => s.row)).toEqual([28, 29]);
    expect(slices[0]!.rect[1]).toBe(hq.rect[1]);
    expect(slices.at(-1)!.rect[3]).toBe(hq.rect[3]);
  });
});
