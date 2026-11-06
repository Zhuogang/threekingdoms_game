import {
  anchor,
  artCell,
  climbingBase,
  depthOf,
  fineFootprint,
  gateTowerAt,
  moundRegistration,
  wallFaceFoot,
} from './boardGeometry';
export { formationCount } from './boardGeometry';
import { CITY_BOUNDS, cellKey } from '../content/chencang';
import { activeUnit, usableEngine } from '../rules/combat';
import { isMapCell, isWallFoot } from '../rules/map';
import type { Cell, SiegeState, SiegeUnit } from '../rules/types';
import { FRAME, sheet, WALL_HEIGHT } from './assets';
import { placeAnchoredPiece, type Sprite } from './mapPieces';
import { STANDING_EPSILON, type DepthKey, type ScreenRect } from './scene';

// Includes the full worst-case review fixture and every living formation.
export const SPRITE_CAP = 512;
export const NIGHT_COLOR = '#1b2233';
export const NIGHT_OPACITY = 0.45;
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
  const { crest: targetCrest, base: targetBase } = moundRegistration({ x, y }, crest.world[2]);
  const sprite = placeAnchoredPiece(source, stage, artCell({ x, y }), FRAME, {
    id: `mound-${key}`,
    kind: 'mound',
    anchor: crest.pixel,
    target: targetCrest,
    scaleY: (targetBase[1] - targetCrest[1]) / (base.pixel[1] - crest.pixel[1]),
  });
  sprite.cells = fineFootprint([
    { x, y },
    { x, y: y + 1 },
  ]);
  return sprite;
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
  const sprite = placeAnchoredPiece(source, index, artCell(wall), FRAME, {
    id: `storm-${unit.id}`,
    kind: repulsed ? 'storm-repulsed' : 'storm',
    anchor: object.footCentreAnchor!,
    target: wallFaceFoot(wall),
    scale: (object.fitHeightLevels! * FRAME.lh) / (box[3] - box[1]),
  });
  // Fit to the actual alpha box, without transparent margin.
  const scale = (object.fitHeightLevels! * FRAME.lh) / (box[3] - box[1]);
  const foot = wallFaceFoot(wall);
  sprite.crop = box;
  sprite.rect = [
    foot[0] + (box[0] - object.footCentreAnchor![0]) * scale,
    foot[1] + (box[1] - object.footCentreAnchor![1]) * scale,
    foot[0] + (box[2] - object.footCentreAnchor![0]) * scale,
    foot[1] + (box[3] - object.footCentreAnchor![1]) * scale,
  ];
  sprite.cells = fineFootprint([climbingBase(wall)]);
  return sprite;
}

export interface PreparationSprite extends Sprite {
  flame?: [number, number];
  /** Hoisted rigs sort whole after their local parapet, tower and unit. */
  depth?: DepthKey;
  rope?: ScreenRect;
}
export function preparationSprites(state: SiegeState): PreparationSprite[] {
  const result: PreparationSprite[] = [],
    source = sheet('s8-04-wall-top-preparations');
  const prop = (key: string, index: number): PreparationSprite => {
    const { x, y } = parseCell(key),
      object = source.pieces[index]!.objects[0]!;
    const target = anchor({ x, y, level: 'wall' });
    const sprite: PreparationSprite = placeAnchoredPiece(source, index, artCell({ x, y }), FRAME, {
      id: `preparation-${key}-${index}`,
      kind: 'preparation',
      anchor: object.footCentreAnchor!,
      target,
    });
    sprite.cells = fineFootprint([{ x, y }]);
    // Sort between the walkway and parapet, like wall-top units.
    sprite.height = WALL_HEIGHT + 0.01;
    if (index === 1)
      sprite.flame = [target[0], sprite.rect[1] + (sprite.rect[3] - sprite.rect[1]) / 3];
    return sprite;
  };
  for (const [key, brazier] of Object.entries(state.preparations.braziers)) {
    result.push(prop(key, 1));
    if (brazier.litDay === state.day) {
      const bundle = prop(key, 2);
      const bowl = result[result.length - 1]!;
      // These crops are the complete alpha boxes. Keep a 3px painted gap,
      // with both feet on the same walkway line and the bowl centred in its cell.
      const shift = Math.max(0, bowl.rect[2] + 3 - bundle.rect[0]);
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
    if (!millstone.hoisted) continue;
    const { x, y } = parseCell(key),
      craneSheet = sheet('s4-07-millstone-crane');
    const tower = gateTowerAt({ x, y });
    const standing = depthOf({ x, y, level: 'wall' });
    const depth = {
      row: Math.max(standing.row, tower?.cells[3] ?? standing.row),
      height: (tower?.height ?? WALL_HEIGHT + 0.5) + 2 * STANDING_EPSILON,
    };
    const foot = wallFaceFoot({ x, y });
    const hang: [number, number] = [foot[0] + 32, foot[1] - 60];
    const stoneTop: [number, number] = [hang[0], hang[1] + FRAME.lh * 0.5];
    // Measured on selected-transparent.png: the painted pulley ends at
    // (383,602), outside the old blockout bbox; the stone starts at y=487.
    // Keep the existing sheet scale and art, registering these actual features.
    const crane: PreparationSprite = {
      ...placeAnchoredPiece(craneSheet, 0, artCell({ x, y }), FRAME, {
        id: `crane-${key}`,
        kind: 'hoisted-millstone',
        anchor: [383, 602],
        target: hang,
      }),
      depth,
    };
    const stone: PreparationSprite = {
      ...placeAnchoredPiece(craneSheet, 1, artCell({ x, y }), FRAME, {
        id: `millstone-${key}`,
        kind: 'hoisted-millstone',
        anchor: [1154.5, 487],
        target: stoneTop,
      }),
      depth,
      rope: [...hang, ...stoneTop],
    };
    crane.cells = stone.cells = fineFootprint([{ x, y }]);
    result.push(crane, stone);
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
