/**
 * β city (art plan DS5): the S1-04 ground plate with the S1-02 gate and the
 * S1-03 wall kit laid on it. Pieces are painted at twice the battlefield scale
 * and registered by their own frames (`footprints.json`, `pieces.json`), so a
 * sheet pixel lands on screen at half its offset from the piece origin, plus
 * whole cells when a piece is reused elsewhere. Objects that have no piece yet
 * (other gates, north corner towers, buildings: S2) can be cut from the α
 * painting with their masks instead.
 */
import type { ScreenRect, SiegeFrame } from './scene';

export interface KitObject {
  id: string;
  kind: string;
  cells: [number, number, number, number];
  height: number;
  bbox: ScreenRect;
}

/** One cell of the S1-03 sheet (`pieces.json`), or the whole S1-02 sheet. */
export interface KitPiece {
  name: string;
  /** Source rectangle [x, y, w, h] on the sheet. */
  cell: [number, number, number, number];
  /** Sheet position of grid point (0, 0) at ground level for this piece. */
  origin: [number, number];
  objects: KitObject[];
}

export interface CityObject {
  id: string;
  kind: string;
  cells: [number, number, number, number];
  height: number;
}

export type BetaDraw =
  | {
      type: 'sheet';
      sheet: 'gate' | 'kit';
      label: string;
      src: ScreenRect;
      dest: ScreenRect;
      row: number;
      height: number;
      /** Straight wall stretches go last in their row so they cover the ink ends of their neighbours. */
      seam: boolean;
    }
  | { type: 'painting'; objectId: string; row: number; height: number; seam: false };

export interface BetaInputs {
  /** The S1-01 frame at 100%. */
  frame: SiegeFrame;
  city: CityObject[];
  gate: KitPiece;
  kit: KitPiece[];
  /** Sheet pixels per screen pixel (2: pieces are painted at 200%). */
  scale: number;
}

/** Sheet pixels cut from each painted end of a straight piece: its ink outline is about 3px wide. */
export const SEAM_TRIM = 4;
/**
 * Screen pixels a run of straight stretches reaches past its end cells, over
 * the outline of the gate, corner or tower next to it. Stretches inside a run
 * meet exactly, their painted ends trimmed, so each is stretched by 4% at most.
 */
export const SEAM_REACH = 2;
/** Parapets stand half a level above the walkway. */
const PARAPET_HEIGHT = 3.5;

export function betaDraws({ frame, city, gate, kit, scale }: BetaInputs): BetaDraw[] {
  const draws: BetaDraw[] = [];
  const covered = new Set<string>();
  const painted = new Set<string>();
  const cellKey = (x: number, y: number) => `${x},${y}`;
  const screenX = (piece: KitPiece, sx: number, shift: number) =>
    frame.ox + (sx - piece.origin[0]) / scale + shift * frame.cw;
  const screenY = (piece: KitPiece, sy: number, shift: number) =>
    frame.oy + (sy - piece.origin[1]) / scale + shift * frame.cd;
  const sheetX = (piece: KitPiece, x: number) => piece.origin[0] + x * frame.cw * scale;
  const sheetY = (piece: KitPiece, y: number, h = 0) =>
    piece.origin[1] + (y * frame.cd - h * frame.lh) * scale;

  // Whole pieces that stand where they were drawn: the gate and the two
  // southern corners. Their wall cells are taken out of the straight runs.
  const placeWhole = (piece: KitPiece, sheet: 'gate' | 'kit') => {
    const [x, y, w, h] = piece.cell;
    draws.push({
      type: 'sheet',
      sheet,
      label: piece.name,
      src: [x, y, x + w, y + h],
      dest: [
        screenX(piece, x, 0),
        screenY(piece, y, 0),
        screenX(piece, x + w, 0),
        screenY(piece, y + h, 0),
      ],
      row: Math.max(...piece.objects.map((object) => object.cells[3])),
      height: Math.max(...piece.objects.map((object) => object.height)),
      seam: false,
    });
    for (const object of piece.objects) {
      const match = city.find(
        (entry) =>
          entry.id === object.id || (entry.kind === object.kind && sameCells(entry, object)),
      );
      if (match && match.kind !== 'wall') covered.add(match.id);
      if (object.kind === 'wall' && object.cells[1] === object.cells[3])
        for (let cx = object.cells[0]; cx <= object.cells[2]; cx++)
          painted.add(cellKey(cx, object.cells[1]));
    }
  };
  placeWhole(gate, 'gate');
  for (const piece of kit)
    if (piece.objects.some((object) => object.kind === 'corner-tower')) placeWhole(piece, 'kit');

  const wallOf = (piece: KitPiece) => piece.objects.find((object) => object.kind === 'wall')!;
  const straight = kit.filter((piece) => {
    const [x0, y0, x1, y1] = wallOf(piece).cells;
    return piece.objects.length === 2 && y0 === y1 && x1 > x0;
  });
  const upright = kit.filter((piece) => {
    const [x0, y0, x1, y1] = wallOf(piece).cells;
    return piece.objects.length === 2 && x0 === x1 && y1 > y0;
  });

  for (const wall of city.filter((object) => object.kind === 'wall')) {
    const [x0, y0, x1, y1] = wall.cells;
    covered.add(wall.id);
    covered.add(`${wall.id}-parapet`);
    if (y0 === y1) {
      const piece = straight.find((entry) => wallOf(entry).cells[1] === y0);
      if (!piece) throw new Error(`no straight wall piece for row ${y0}`);
      const [px0, py, px1] = wallOf(piece).cells;
      const length = px1 - px0 + 1;
      for (const run of runs(x0, x1, (x) => !painted.has(cellKey(x, y0))))
        for (let start = run[0]; start <= run[1]; start += length) {
          const count = Math.min(length, run[1] - start + 1);
          const reachWest = start === run[0] ? SEAM_REACH : 0;
          const reachEast = start + count - 1 === run[1] ? SEAM_REACH : 0;
          const [, sy, , sh] = piece.cell;
          const sx0 = sheetX(piece, px0) + SEAM_TRIM;
          // A short stretch ends inside the piece, where there is unpainted wall to reach with.
          const sx1 =
            count === length
              ? sheetX(piece, px0 + count) - SEAM_TRIM
              : sheetX(piece, px0 + count) + reachEast * scale;
          draws.push({
            type: 'sheet',
            sheet: 'kit',
            label: `${piece.name} → ${wall.id} ${start}–${start + count - 1}`,
            src: [sx0, sy, sx1, sy + sh],
            dest: [
              frame.ox + start * frame.cw - reachWest,
              screenY(piece, sy, y0 - py),
              frame.ox + (start + count) * frame.cw + reachEast,
              screenY(piece, sy + sh, y0 - py),
            ],
            row: y0,
            height: PARAPET_HEIGHT,
            seam: true,
          });
        }
    } else {
      const piece = upright.find((entry) => wallOf(entry).cells[0] === x0);
      if (!piece) throw new Error(`no north-south wall piece for column ${x0}`);
      const [px, py0, , py1] = wallOf(piece).cells;
      const length = py1 - py0 + 1;
      // North to south, so each stretch covers the south end face of the one before.
      for (let start = y0; start <= y1; start += length) {
        const count = Math.min(length, y1 - start + 1);
        const [sx, sy, sw, sh] = piece.cell;
        // A short stretch uses the southern rows of the piece, cut at the parapet top.
        const top = count === length ? sy : sheetY(piece, py1 - count + 1, PARAPET_HEIGHT);
        const shift = start + count - 1 - py1;
        draws.push({
          type: 'sheet',
          sheet: 'kit',
          label: `${piece.name} → ${wall.id} ${start}–${start + count - 1}`,
          src: [sx, top, sx + sw, sy + sh],
          dest: [
            screenX(piece, sx, x0 - px),
            screenY(piece, top, shift),
            screenX(piece, sx + sw, x0 - px),
            screenY(piece, sy + sh, shift),
          ],
          row: start + count - 1,
          height: PARAPET_HEIGHT,
          seam: false,
        });
      }
    }
  }

  for (const object of city)
    if (object.kind !== 'parapet' && !covered.has(object.id))
      draws.push({
        type: 'painting',
        objectId: object.id,
        row: object.cells[3],
        height: object.height,
        seam: false,
      });
  // Painter's order (plan §9.1), straight stretches last within their row.
  return draws.sort(
    (a, b) => a.row - b.row || Number(a.seam) - Number(b.seam) || a.height - b.height,
  );
}

function sameCells(a: { cells: number[] }, b: { cells: number[] }) {
  return a.cells.every((value, index) => value === b.cells[index]);
}

/** Contiguous [start, end] runs of the integers in [from, to] that pass the test. */
function runs(from: number, to: number, keep: (value: number) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let value = from; value <= to; value++) {
    if (!keep(value)) continue;
    const last = out.at(-1);
    if (last && last[1] === value - 1) last[1] = value;
    else out.push([value, value]);
  }
  return out;
}
