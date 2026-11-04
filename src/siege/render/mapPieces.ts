/**
 * Separate pieces on the full Chencang map (art plan §9.2): camp tents,
 * palisade, workshops and trees (S2-08 to S2-11) and siege engines (S4).
 *
 * Every piece sheet is drawn at 2× with a known frame: sheet pixel =
 * origin + x · cell − h · level for grid point (x, y, h), the same formula as
 * the map. A piece cropped from the sheet therefore lands on its own block-out
 * cells by dividing by the scale, and on any other cells by adding whole cell
 * steps. S8-04 instead records its actual alpha groups and fitWidthPx because
 * it was generated without a blockout. Nothing is repainted or registered by eye.
 */
import type { SceneObject, ScreenRect, SiegeFrame } from './scene';

export interface SheetObject {
  id: string;
  kind: string;
  /** Inclusive cell range [x0, y0, x1, y1] the block-out drew this object on. */
  cells: [number, number, number, number];
  height: number;
  /** South-west ground point of the footprint, in sheet pixels. */
  anchor: [number, number];
  bbox: ScreenRect;
  alphaBBox?: ScreenRect;
  footCentreAnchor?: [number, number];
  fitHeightLevels?: number;
  /** Actual alpha width at 100% zoom, independent of the blockout scale. */
  fitWidthPx?: number;
  moundHeight?: number;
  registration?: Record<string, Registration>;
  selectedRegistration?: Record<string, Registration>;
}
export interface Registration {
  world: [number, number, number];
  pixel: [number, number];
}
export interface SheetPiece {
  piece: number;
  name: string;
  /** The sheet slot [x, y, w, h] the piece was drawn in. */
  cell: [number, number, number, number];
  origin: [number, number];
  objects: SheetObject[];
}
/** `footprints.json` of a piece sheet (written by tools/build-siege-blockout.mjs). */
export interface SheetFootprints {
  asset: string;
  size: [number, number];
  cell: [number, number];
  level: number;
  pieces: SheetPiece[];
}

/** One piece placed on the map: which sheet pixels go to which map pixels. */
export interface Sprite {
  id: string;
  kind: string;
  /** Sheet asset id, e.g. `s2-08-camp-tents`. */
  sheet: string;
  /** Source rectangle on the sheet, in sheet pixels. */
  crop: ScreenRect;
  /** Destination on the map, in map pixels. */
  rect: ScreenRect;
  cells: [number, number, number, number];
  height: number;
}

/** Painted pieces overrun their block-out a little (guy ropes, crowns); keep that margin in sheet pixels. */
export const CROP_MARGIN = 48;
/**
 * S2-10 v6 painted the shed's base 32 sheet px below its footprint (README of
 * s2-10-workshop), so it is raised by that much to stand on its row.
 */
export const WORKSHOP_RAISE = 32;

const clampRect = (
  [x0, y0, x1, y1]: ScreenRect,
  [cx, cy, cw, ch]: SheetPiece['cell'],
): ScreenRect => [Math.max(cx, x0), Math.max(cy, y0), Math.min(cx + cw, x1), Math.min(cy + ch, y1)];
const union = (boxes: ScreenRect[]): ScreenRect => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];

export function sheetScale(sheet: SheetFootprints, frame: SiegeFrame): number {
  return sheet.cell[0] / frame.cw;
}

/**
 * Places `crop` of `piece` so that the block-out cell `from` lands on the map
 * cell `to`. `raise` lifts the picture by that many sheet pixels.
 */
export function placeCrop(
  sheet: SheetFootprints,
  piece: SheetPiece,
  crop: ScreenRect,
  from: [number, number],
  to: [number, number],
  frame: SiegeFrame,
  raise = 0,
): ScreenRect {
  const s = sheetScale(sheet, frame);
  const dx = frame.ox + (to[0] - from[0]) * frame.cw - piece.origin[0] / s;
  const dy = frame.oy + (to[1] - from[1]) * frame.cd - piece.origin[1] / s - raise / s;
  return [crop[0] / s + dx, crop[1] / s + dy, crop[2] / s + dx, crop[3] / s + dy];
}

/** A whole piece, cropped to its objects plus the margin, moved so its north-west cell sits on `to`. */
export function placePiece(
  sheet: SheetFootprints,
  pieceIndex: number,
  to: [number, number],
  frame: SiegeFrame,
  { id, kind, raise = 0 }: { id: string; kind?: string; raise?: number },
): Sprite {
  const piece = sheet.pieces[pieceIndex]!;
  const crop = clampRect(
    (([x0, y0, x1, y1]) => [
      x0 - CROP_MARGIN,
      y0 - CROP_MARGIN,
      x1 + CROP_MARGIN,
      y1 + CROP_MARGIN,
    ])(union(piece.objects.map((o) => o.alphaBBox ?? o.bbox))) as ScreenRect,
    piece.cell,
  );
  const [x0, y0, x1, y1] = union(piece.objects.map((o) => [...o.cells] as ScreenRect));
  const from: [number, number] = [x0, y0];
  return {
    id,
    kind: kind ?? piece.objects[0]!.kind,
    sheet: sheet.asset,
    crop,
    rect: placeCrop(sheet, piece, crop, from, to, frame, raise),
    cells: [to[0], to[1], to[0] + x1 - x0, to[1] + y1 - y0],
    height: Math.max(...piece.objects.map((o) => o.height)),
  };
}

/** Map a recorded sheet landmark onto a projected map point. Pieces with
 * fitWidthPx use their complete alpha box and a uniform game-pixel scale. */
export function placeAnchoredPiece(
  sheet: SheetFootprints,
  pieceIndex: number,
  to: [number, number],
  frame: SiegeFrame,
  options: {
    id: string;
    kind?: string;
    anchor: [number, number];
    target: [number, number];
    scale?: number;
    scaleY?: number;
  },
): Sprite {
  const sprite = placePiece(sheet, pieceIndex, to, frame, options);
  const object = sheet.pieces[pieceIndex]!.objects[0]!;
  if (object.fitWidthPx !== undefined) sprite.crop = object.alphaBBox!;
  const scale =
    options.scale ??
    (object.fitWidthPx !== undefined
      ? object.fitWidthPx / (sprite.crop[2] - sprite.crop[0])
      : 1 / sheetScale(sheet, frame));
  const sy = options.scaleY ?? scale;
  const [ax, ay] = options.anchor;
  const [tx, ty] = options.target;
  sprite.rect = [
    tx + (sprite.crop[0] - ax) * scale,
    ty + (sprite.crop[1] - ay) * sy,
    tx + (sprite.crop[2] - ax) * scale,
    ty + (sprite.crop[3] - ay) * sy,
  ];
  return sprite;
}

/** Sprites sort and slice like painted objects (scene.ts). */
export const spriteObject = (sprite: Sprite): SceneObject => ({
  id: sprite.id,
  kind: sprite.kind,
  cells: sprite.cells,
  height: sprite.height,
  bbox: sprite.rect,
});

const cellsWith = (layout: readonly string[], symbol: string): Array<[number, number]> =>
  layout.flatMap((row, y) =>
    [...row].flatMap((s, x): Array<[number, number]> => (s === symbol ? [[x, y]] : [])),
  );
/** Deterministic per-cell variant, so the camp looks the same on every load. */
const variant = (x: number, y: number, n: number) => (x * 7 + y * 13) % n;

export interface CampSheets {
  tents: SheetFootprints;
  palisade: SheetFootprints;
  workshop: SheetFootprints;
  scenery: SheetFootprints;
}

/**
 * Palisade from its `P` cells (layout §7). The S2-09 sheet has a straight
 * east-west run, the two corners, a north-south run and the camp gate with
 * two stake cells each side. Corners and the gate are placed whole; other
 * cells take one cell-wide band of a straight run, cut on cell boundaries so
 * neighbouring bands join exactly.
 */
export function palisadeSprites(
  layout: readonly string[],
  sheet: SheetFootprints,
  frame: SiegeFrame,
): Sprite[] {
  const isP = (x: number, y: number) => layout[y]?.[x] === 'P';
  const [cw, cd] = sheet.cell;
  const lh = sheet.level;
  const [ew, nw, ne, ns, gate] = sheet.pieces as [
    SheetPiece,
    SheetPiece,
    SheetPiece,
    SheetPiece,
    SheetPiece,
  ];
  const covered = new Set<string>();
  const sprites: Sprite[] = [];
  const whole = (index: number, piece: SheetPiece, id: string) => {
    const [x0, y0] = union(piece.objects.map((o) => [...o.cells] as ScreenRect));
    for (const o of piece.objects)
      for (let y = o.cells[1]; y <= o.cells[3]; y++)
        for (let x = o.cells[0]; x <= o.cells[2]; x++) covered.add(`${x},${y}`);
    sprites.push(placePiece(sheet, index, [x0, y0], frame, { id, kind: 'palisade' }));
  };
  // The sheet pieces were drawn on the real camp cells, so they go back there.
  whole(1, nw, 'palisade-nw');
  whole(2, ne, 'palisade-ne');
  whole(4, gate, 'camp-gate');
  for (const [x, y] of cellsWith(layout, 'P')) {
    if (covered.has(`${x},${y}`)) continue;
    const eastWest = isP(x - 1, y) || isP(x + 1, y);
    const piece = eastWest ? ew : ns;
    const ref = piece.objects[1]!.cells; // the middle cell of the three
    const [rx, ry] = [ref[0], ref[1]];
    const [ox, oy] = piece.origin;
    const top = (row: number) => oy + row * cd - lh; // stake tops of this row
    const crop: ScreenRect = eastWest
      ? [ox + rx * cw, top(ry) - CROP_MARGIN, ox + (rx + 1) * cw, oy + (ry + 1) * cd + CROP_MARGIN]
      : [
          ox + rx * cw - CROP_MARGIN,
          top(ry),
          ox + (rx + 1) * cw + CROP_MARGIN,
          // The last cell of a run also keeps the front face below it.
          isP(x, y + 1) ? top(ry + 1) : oy + (ry + 1) * cd + CROP_MARGIN / 2,
        ];
    sprites.push({
      id: `palisade-${x}-${y}`,
      kind: 'palisade',
      sheet: sheet.asset,
      crop,
      rect: placeCrop(sheet, piece, crop, [rx, ry], [x, y], frame),
      cells: [x, y, x, y],
      height: 1,
    });
  }
  return sprites;
}

/** Every camp and field piece the layout asks for: tents (`t`), the chancellor's tent (`C`), workshops (`S`), palisade (`P`) and pines (`T`). */
export function campSprites(
  layout: readonly string[],
  sheets: CampSheets,
  frame: SiegeFrame,
): Sprite[] {
  const sprites: Sprite[] = [];
  for (const [x, y] of cellsWith(layout, 't'))
    sprites.push(
      placePiece(sheets.tents, 1 + variant(x, y, 3), [x, y], frame, { id: `tent-${x}-${y}` }),
    );
  const blocks = (symbol: string) =>
    cellsWith(layout, symbol).filter(
      ([x, y]) => layout[y]![x - 1] !== symbol && layout[y - 1]?.[x] !== symbol,
    );
  for (const [x, y] of blocks('C'))
    sprites.push(placePiece(sheets.tents, 0, [x, y], frame, { id: 'hq-tent' }));
  // West workshop empty, east one building an engine, as drawn on S2-10.
  blocks('S').forEach(([x, y], i) =>
    sprites.push(
      placePiece(sheets.workshop, Math.min(i, 1), [x, y], frame, {
        id: `workshop-${i + 1}`,
        raise: WORKSHOP_RAISE,
      }),
    ),
  );
  sprites.push(...palisadeSprites(layout, sheets.palisade, frame));
  for (const [x, y] of cellsWith(layout, 'T'))
    sprites.push(
      placePiece(sheets.scenery, variant(x, y, 3), [x, y], frame, {
        id: `pine-${x}-${y}`,
        kind: 'tree',
      }),
    );
  return sprites;
}
