import { CITY_BOUNDS, cellKey } from '../content/chencang';
import { activeUnit, usableEngine } from '../rules/combat';
import { isMapCell, isWallFoot } from '../rules/map';
import type { Cell, SiegeState, SiegeUnit } from '../rules/types';
import { FRAME, sheet, WALL_HEIGHT } from './assets';
import { placeAnchoredPiece, placePiece, type Sprite } from './mapPieces';
import { project, type ScreenRect } from './scene';

// Includes the full worst-case review fixture; only silhouettes are optional.
export const SPRITE_CAP = 512;
export const BRAZIER_SCALE = 0.72;
export const NIGHT_COLOR = '#1b2233';
export const NIGHT_OPACITY = 0.45;
export const formationCount = (troops: number): 1 | 3 | 5 =>
  troops <= 800 ? 1 : troops <= 2000 ? 3 : 5;

/** ink-04's rear pair (.34,.38) and fixed front (.5,.62), extended with
 * a second rear pair. Keep person size and the front person's foot fixed. */
export function formationOffsets(troops: number): Array<[number, number]> {
  const count = formationCount(troops);
  const w = FRAME.cw,
    d = FRAME.cd;
  return [
    ...(count === 5
      ? ([
          [-0.32 * w, -0.48 * d],
          [0.32 * w, -0.48 * d],
        ] as Array<[number, number]>)
      : []),
    ...(count >= 3
      ? ([
          [-0.16 * w, -0.24 * d],
          [0.16 * w, -0.24 * d],
        ] as Array<[number, number]>)
      : []),
    [0, 0] as [number, number],
  ];
}

export const climberPoses = (foothold: number): string[] =>
  foothold === 1
    ? ['north-climb-a']
    : foothold === 2
      ? ['north-climb-a', 'north-climb-b']
      : foothold >= 3
        ? ['north-climb-top']
        : [];
export const moundStage = (progress: number): number | null =>
  progress <= 0 ? null : progress <= 2 ? 0 : progress <= 5 ? 1 : 2;
export const parseCell = (key: string): Cell => {
  const [x, y] = key.split(',').map(Number);
  return { x: x!, y: y! };
};

export function climbingWall(state: SiegeState, unit: SiegeUnit): Cell | undefined {
  if (unit.side !== 'shu' || unit.level !== 'ground' || !activeUnit(unit)) return;
  const ladder = state.engines.find(
    (e) => e.raisedAt && usableEngine(e) && e.x === unit.x && e.y === unit.y,
  );
  return (
    ladder?.raisedAt ??
    (isWallFoot(state, unit.x, unit.y) ? { x: unit.x, y: unit.y - 1 } : undefined)
  );
}

export function moundSprite(key: string, progress: number): Sprite | undefined {
  const stage = moundStage(progress);
  if (stage === null) return;
  const { x, y } = parseCell(key),
    source = sheet('s8-03-earth-mound');
  const object = source.pieces[stage]!.objects[0]!;
  const registration = object.selectedRegistration ?? object.registration!;
  const crest = registration.rampCrest!,
    base = registration.southBase!;
  const targetCrest = project(FRAME, x + 0.5, y, crest.world[2]);
  const targetBase = project(FRAME, x + 0.5, y + 2, 0);
  return placeAnchoredPiece(source, stage, [x, y], FRAME, {
    id: `mound-${key}`,
    kind: 'mound',
    anchor: crest.pixel,
    target: targetCrest,
    scaleY: (targetBase[1] - targetCrest[1]) / (base.pixel[1] - crest.pixel[1]),
  });
}

export function stormingSprite(
  state: SiegeState,
  unit: SiegeUnit,
  repulsed = false,
): Sprite | undefined {
  const wall = climbingWall(state, unit);
  if (!wall || unit.assaultedDay !== state.day) return;
  const source = sheet('s8-06-storming-cluster'),
    index = repulsed ? 1 : 0;
  const object = source.pieces[index]!.objects[0]!,
    box = object.alphaBBox!;
  const sprite = placeAnchoredPiece(source, index, [wall.x, wall.y + 1], FRAME, {
    id: `storm-${unit.id}`,
    kind: repulsed ? 'storm-repulsed' : 'storm',
    anchor: object.footCentreAnchor!,
    target: project(FRAME, wall.x + 0.5, wall.y + 1, 0),
    scale: (object.fitHeightLevels! * FRAME.lh) / (box[3] - box[1]),
  });
  // Fit to the actual alpha box, without transparent margin.
  const scale = (object.fitHeightLevels! * FRAME.lh) / (box[3] - box[1]);
  const foot = project(FRAME, wall.x + 0.5, wall.y + 1, 0);
  sprite.crop = box;
  sprite.rect = [
    foot[0] + (box[0] - object.footCentreAnchor![0]) * scale,
    foot[1] + (box[1] - object.footCentreAnchor![1]) * scale,
    foot[0] + (box[2] - object.footCentreAnchor![0]) * scale,
    foot[1] + (box[3] - object.footCentreAnchor![1]) * scale,
  ];
  return sprite;
}

export interface PreparationSprite extends Sprite {
  flame?: [number, number];
}
export function preparationSprites(state: SiegeState): PreparationSprite[] {
  const result: PreparationSprite[] = [],
    source = sheet('s8-04-wall-top-preparations');
  const prop = (key: string, index: number, offset = 0): PreparationSprite => {
    const { x, y } = parseCell(key),
      object = source.pieces[index]!.objects[0]!;
    const target = project(FRAME, x + 0.25 + offset, y + 0.65, WALL_HEIGHT);
    const sprite: PreparationSprite = placeAnchoredPiece(source, index, [x, y], FRAME, {
      id: `preparation-${key}-${index}`,
      kind: 'preparation',
      anchor: object.registration!.baseCentre!.pixel,
      target,
      scale: (FRAME.cw / source.cell[0]) * (index <= 1 ? BRAZIER_SCALE : 1),
    });
    // Sort between the walkway and parapet, like wall-top units.
    sprite.height = WALL_HEIGHT + 0.01;
    if (index === 1)
      sprite.flame = [target[0], sprite.rect[1] + (sprite.rect[3] - sprite.rect[1]) / 3];
    return sprite;
  };
  for (const [key, brazier] of Object.entries(state.preparations.braziers)) {
    result.push(prop(key, 1));
    if (brazier.litDay === state.day) {
      const bundle = prop(key, 2, 0.5);
      const bowl = result[result.length - 1]!;
      // Separate actual painted bounds, rather than the transparent crop margins.
      const bowlObject = source.pieces[1]!.objects[0]!;
      const bundleObject = source.pieces[2]!.objects[0]!;
      const bowlRight =
        bowl.rect[0] +
        ((bowlObject.alphaBBox ?? bowlObject.bbox)[2] - bowl.crop[0]) *
          (FRAME.cw / source.cell[0]) *
          BRAZIER_SCALE;
      const bundleLeft =
        bundle.rect[0] +
        ((bundleObject.alphaBBox ?? bundleObject.bbox)[0] - bundle.crop[0]) *
          (FRAME.cw / source.cell[0]);
      const shift = Math.max(0, bowlRight + 3 - bundleLeft);
      bundle.rect = [
        bundle.rect[0] + shift,
        bundle.rect[1],
        bundle.rect[2] + shift,
        bundle.rect[3],
      ];
      result.push(bundle);
    }
  }
  for (const key of Object.keys(state.preparations.boulders)) result.push(prop(key, 3));
  for (const [key, millstone] of Object.entries(state.preparations.millstones)) {
    const { x, y } = parseCell(key),
      craneSheet = sheet('s4-07-millstone-crane');
    const stone = placePiece(craneSheet, 1, [x, y], FRAME, {
      id: `millstone-${key}`,
      kind: 'preparation',
      raise: WALL_HEIGHT * craneSheet.level,
    });
    stone.height = WALL_HEIGHT + 0.01;
    if (millstone.hoisted) {
      const crane = placePiece(craneSheet, 0, [x, y], FRAME, {
        id: `crane-${key}`,
        kind: 'preparation',
        raise: WALL_HEIGHT * craneSheet.level,
      });
      crane.height += WALL_HEIGHT;
      result.push(crane);
      // The bottom centre of the recorded crane box is its arm's hanging point.
      const craneObject = craneSheet.pieces[0]!.objects[0]!;
      const arm = craneObject.bbox;
      const from = craneSheet.pieces[0]!.origin;
      const hang = project(
        FRAME,
        x + ((arm[0] + arm[2]) / 2 - from[0]) / craneSheet.cell[0] - craneObject.cells[0],
        y + (arm[3] - from[1]) / craneSheet.cell[1] - craneObject.cells[1],
        WALL_HEIGHT,
      );
      const stoneBox = craneSheet.pieces[1]!.objects[0]!.bbox;
      const stoneOrigin = craneSheet.pieces[1]!.origin;
      const stoneObject = craneSheet.pieces[1]!.objects[0]!;
      const centre = project(
        FRAME,
        x +
          ((stoneBox[0] + stoneBox[2]) / 2 - stoneOrigin[0]) / craneSheet.cell[0] -
          stoneObject.cells[0],
        y + (stoneBox[1] - stoneOrigin[1]) / craneSheet.cell[1] - stoneObject.cells[1],
        WALL_HEIGHT,
      );
      const dx = hang[0] - centre[0],
        dy = hang[1] - centre[1];
      stone.rect = [stone.rect[0] + dx, stone.rect[1] + dy, stone.rect[2] + dx, stone.rect[3] + dy];
      stone.height = crane.height + 0.01;
    }
    result.push(stone);
  }
  return result;
}

export function footholdCells(state: SiegeState): Cell[] {
  const keys = new Set(Object.keys(state.footholds));
  for (const engine of state.engines)
    if (engine.raisedAt && usableEngine(engine)) keys.add(cellKey(engine.raisedAt));
  for (const unit of state.units) {
    const wall = climbingWall(state, unit);
    if (wall) keys.add(cellKey(wall));
  }
  return [...keys].map(parseCell).filter((c) => isMapCell(c.x, c.y));
}

/** A continuous surface for presentation only; the rules keep the ground tag.
 * At the centre of the north cell of a finished mound this is 2.25 levels. */
export function moundStandingHeight(state: SiegeState, x: number, y: number): number | undefined {
  const progress = state.mounds[`${x},${CITY_BOUNDS.south + 1}`] ?? 0;
  if (progress !== 6 || y < CITY_BOUNDS.south + 1 || y > CITY_BOUNDS.south + 2) return;
  return (WALL_HEIGHT * (CITY_BOUNDS.south + 3 - (y + 0.5))) / 2;
}

export function figureBounds(
  figures: Array<{
    pose: { size: [number, number]; anchor: [number, number] };
    offset: [number, number];
  }>,
  foot: [number, number],
): ScreenRect {
  if (!figures.length)
    return [
      foot[0] - FRAME.cw / 2,
      foot[1] - WALL_HEIGHT * FRAME.lh,
      foot[0] + FRAME.cw / 2,
      foot[1],
    ];
  return [
    Math.min(...figures.map((f) => foot[0] + f.offset[0] - f.pose.anchor[0])),
    Math.min(...figures.map((f) => foot[1] + f.offset[1] - f.pose.anchor[1])),
    Math.max(...figures.map((f) => foot[0] + f.offset[0] - f.pose.anchor[0] + f.pose.size[0])),
    Math.max(...figures.map((f) => foot[1] + f.offset[1] - f.pose.anchor[1] + f.pose.size[1])),
  ];
}
