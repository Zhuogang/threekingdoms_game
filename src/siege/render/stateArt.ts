import trenchJob from '../../../docs/siege/chencang/art/s3-01-trench-fill/job.json';
import { INNER_WALL_SEGMENTS, SOUTH_TRENCH, cellKey } from '../content/chencang';
import { isWallFoot, cellHeight, cellTerrain } from '../rules/map';
import { usableEngine } from '../rules/combat';
import type { SiegeEngine, SiegePosition, SiegeState, SiegeUnit } from '../rules/types';
import type { Facing } from '../save';
import { FRAME, INNER_WALL_JOB, MAP, POSE_SETS, patchOf, sheet } from './assets';
import { placePiece, type Sprite } from './mapPieces';
import { project, STANDING_EPSILON, type SceneObject, type ScreenRect } from './scene';
import {
  climberPoses,
  climbingWall,
  figureBounds,
  formationOffsets,
  moundStandingHeight,
} from './v02Art';

export interface StatePatch {
  id: string;
  state: string;
  /** Map pixel rectangle; trench rectangles come verbatim from the art job. */
  clip?: ScreenRect;
  occluder?: SceneObject;
  opacity?: number;
}
export function statePatches(state: SiegeState): StatePatch[] {
  const patches: StatePatch[] = [];
  for (const [id, gate] of Object.entries(state.gates)) {
    if (gate.durability <= 0) patches.push({ id, state: `gate-${id}-broken` });
    else if (gate.durability < gate.max / 2) {
      // Only the south gate has a separate approved damage painting. The other
      // gates reuse their own patch as a light soot/debris wash until broken.
      patches.push({
        id,
        state: `gate-${id}-${id === 'south' ? 'damaged' : 'broken'}`,
        opacity: id === 'south' ? 1 : 0.35,
      });
    }
  }
  for (const cell of SOUTH_TRENCH) {
    const fill = state.trenchFill[cellKey(cell)] ?? 0;
    if (fill < 1.5) continue;
    const variant = fill === 3 ? 'trench-filled' : 'trench-half';
    const box = trenchJob.states
      .find((s) => s.id === variant)!
      .cells.find((c) => c.cell[0] === cell.x && c.cell[1] === cell.y)!.box as ScreenRect;
    patches.push({ id: `trench-${cellKey(cell)}`, state: variant, clip: box });
  }
  for (const segment of INNER_WALL_SEGMENTS) {
    const progress = state.innerWall[segment.index] ?? 0;
    if (!progress) continue;
    const variant = progress === 4 ? 'inner-wall-built' : 'inner-wall-works';
    const object = INNER_WALL_JOB.states.find((s) => s.id === variant)!.object!;
    const xs = segment.cells.map((c) => c.x);
    const patch = patchOf(variant);
    const clip: ScreenRect = [
      Math.min(...xs) * FRAME.cw,
      patch.at[1],
      (Math.max(...xs) + 1) * FRAME.cw,
      patch.at[1] + patch.size[1],
    ];
    patches.push({
      id: `inner-${segment.index}`,
      state: variant,
      clip,
      ...(progress === 4
        ? {
            occluder: {
              ...object,
              id: `inner-${segment.index}`,
              cells: [Math.min(...xs), 14, Math.max(...xs), 14],
              bbox: clip,
            } as SceneObject,
          }
        : {}),
    });
  }
  return patches;
}

/** Presentation footprint only. Wrecks retain their cart footprint. */
export function engineFootprint(engine: SiegeEngine): SiegePosition[] {
  const { x, y } = engine;
  const cells: SiegePosition[] = [
    { x, y, level: 'ground' },
    { x, y: y + 1, level: 'ground' },
  ];
  if (engine.kind === 'ram') cells.push({ x, y: y + 2, level: 'ground' });
  if (engine.kind === 'tower')
    cells.push({ x: x + 1, y, level: 'ground' }, { x: x + 1, y: y + 1, level: 'ground' });
  if (engine.kind === 'ladder' && engine.raisedAt && !engine.wrecked)
    for (let row = engine.raisedAt.y + 1; row < y; row++)
      cells.push({ x: engine.raisedAt.x, y: row, level: 'ground' });
  return cells;
}

export const UNIT_FIGURE_SCALE = 0.54;
export const UNIT_FOOT = 0.92;
const scaledPose = (
  pose: (typeof POSE_SETS)[string]['poses'] extends Map<string, infer P> ? P : never,
) => ({
  ...pose,
  size: pose.size.map((n) => n * UNIT_FIGURE_SCALE) as [number, number],
  anchor: pose.anchor.map((n) => n * UNIT_FIGURE_SCALE) as [number, number],
});

export type EngineSprite = Sprite & { flip: boolean; burning: boolean; engine: SiegeEngine };
export function engineSprite(engine: SiegeEngine, facing: Facing = 'north'): EngineSprite {
  let asset: string;
  let piece = facing === 'east' || facing === 'west' ? 1 : 0;
  if (engine.kind === 'ladder') {
    asset = engine.raisedAt && !engine.wrecked ? 's4-02-ladder-on-wall' : 's4-01-ladder-cart';
    if (engine.wrecked) piece = 2;
    else if (engine.raisedAt) piece = engine.burning ? 1 : 0;
  } else if (engine.kind === 'ram') {
    asset = 's4-03-ram';
    if (engine.wrecked) piece = 2;
  } else if (engine.kind === 'tower') {
    asset = engine.wrecked || engine.burning ? 's4-05-siege-tower-wrecks' : 's4-04-siege-tower';
    piece = engine.wrecked ? 1 : 0;
  } else {
    asset = 's4-06-earth-cart';
    if (engine.acted || engine.wrecked) piece = 2;
  }
  if (engine.covered && !engine.burning && !engine.wrecked) {
    if (engine.kind === 'ladder') {
      asset = 's8-01-covered-ladder';
      piece = engine.raisedAt ? 2 : facing === 'east' || facing === 'west' ? 1 : 0;
    } else if (engine.kind === 'ram') {
      asset = 's8-02-covered-ram';
      piece =
        engine.durability < engine.max / 2 ? 2 : facing === 'east' || facing === 'west' ? 1 : 0;
    }
  }
  const at: [number, number] =
    engine.raisedAt && !engine.wrecked ? [engine.raisedAt.x, 17] : [engine.x, engine.y];
  return {
    ...placePiece(sheet(asset), piece, at, FRAME, { id: engine.id, kind: 'engine' }),
    flip: facing === 'west' && !engine.raisedAt && !engine.wrecked,
    burning: engine.burning && !engine.wrecked,
    engine,
  };
}
export function climbableCells(state: SiegeState) {
  const cells = SOUTH_TRENCH.filter((c) => isWallFoot(state, c.x, c.y)).map((c) => ({
    x: c.x,
    y: c.y - 1,
    level: 'wall' as const,
  }));
  for (const engine of state.engines)
    if (engine.raisedAt && usableEngine(engine)) cells.push({ ...engine.raisedAt, level: 'wall' });
  return [...new Map(cells.map((c) => [cellKey(c), c])).values()];
}
export function unitVisual(
  state: SiegeState,
  unit: SiegeUnit,
  facing: Facing = unit.side === 'shu' ? 'north' : 'south',
  activity?: string,
) {
  const wall = climbingWall(state, unit);
  const progress = wall ? (state.footholds[`${wall.x},${wall.y}`] ?? 0) : 0;
  const storming = Boolean(wall && unit.assaultedDay === state.day);
  const moundHeight =
    unit.level === 'ground' ? moundStandingHeight(state, unit.x, unit.y) : undefined;
  const climbing = Boolean(
    wall && (progress === 1 || progress === 2) && !storming && moundHeight === undefined,
  );
  const filling = activity === 'fillTrench';
  const set =
    unit.officer.id === 'zhugeliang'
      ? 's5-05'
      : unit.officer.id === 'haozhao'
        ? 's5-06'
        : unit.side === 'shu'
          ? climbing || filling
            ? 's5-01'
            : unit.troopType === 'archer'
              ? 's5-02'
              : 's1-05'
          : unit.troopType === 'archer'
            ? 's1-06'
            : 's5-03';
  const action = climbing
    ? 'climb-a'
    : filling
      ? unit.acted
        ? 'dump'
        : 'carry'
      : activity === 'move'
        ? 'march'
        : activity === 'attack'
          ? unit.troopType === 'archer'
            ? unit.side === 'shu'
              ? 'shoot'
              : 'fire'
            : 'attack'
          : 'idle';
  const poses = POSE_SETS[set]!.poses;
  const dir = facing === 'west' ? 'east' : facing;
  const name =
    [`${dir}-${action}`, `north-${action}`, `${dir}-idle`, 'south-idle', 'north-idle'].find((n) =>
      poses.has(n),
    ) ?? poses.keys().next().value!;
  const h =
    unit.level === 'wall'
      ? cellHeight(state, unit.x, unit.y, unit.level)
      : (moundHeight ?? cellHeight(state, unit.x, unit.y, unit.level));
  const gateTop =
    unit.level === 'wall'
      ? MAP.objects.find(
          (object) =>
            object.kind === 'gate-tower' &&
            unit.x >= object.cells[0] &&
            unit.x <= object.cells[2] &&
            unit.y >= object.cells[1] &&
            unit.y <= object.cells[3],
        )
      : undefined;
  const foot = storming
    ? project(FRAME, wall!.x + 0.5, wall!.y + 1, 0)
    : project(
        FRAME,
        unit.x + 0.5,
        unit.y +
          (moundHeight !== undefined || cellTerrain(state, unit.x, unit.y) === 'ramp'
            ? 0.5
            : UNIT_FOOT),
        h,
      );
  const pose = scaledPose(poses.get(name)!);
  const figures = storming
    ? []
    : climbing
      ? climberPoses(progress).map((poseName, i) => ({
          name: poseName,
          pose: scaledPose(POSE_SETS['s5-01']!.poses.get(poseName)!),
          // Keep both climbing poses over the ladder's clickable ground cells.
          offset: [0, -(progress - 1) * FRAME.cd - (i === 0 ? 0.5 : 1.8) * FRAME.lh] as [
            number,
            number,
          ],
        }))
      : formationOffsets(unit.troops).map((offset) => ({ name, pose, offset }));
  // Storming remains a separate, unchanged painting. Its locator represents
  // the actor's base cell, so it never borrows the defender's wall-top click.
  const base = project(FRAME, unit.x, unit.y, 0);
  const bounds: ScreenRect = storming
    ? [base[0] + 8, base[1] + 4, base[0] + FRAME.cw - 8, base[1] + FRAME.cd - 4]
    : figureBounds(figures, foot);
  const rect: ScreenRect =
    facing === 'west'
      ? [2 * foot[0] - bounds[2], bounds[1], 2 * foot[0] - bounds[0], bounds[3]]
      : bounds;
  return {
    set,
    cell: { x: unit.x, y: unit.y, level: unit.level },
    action,
    pose,
    climbing,
    flip: facing === 'west',
    foot,
    figures,
    rect,
    gateTop: gateTop?.id,
    depth: {
      row: gateTop?.cells[3] ?? (climbing || storming ? wall!.y + 1 : unit.y),
      height:
        (gateTop?.height ?? (climbing || storming || moundHeight !== undefined ? 3 : h)) +
        STANDING_EPSILON,
    },
  };
}
