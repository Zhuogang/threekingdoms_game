import trenchJob from '../../../docs/siege/chencang/art/s3-01-trench-fill/job.json';
import { INNER_WALL_SEGMENTS, SOUTH_TRENCH, cellKey } from '../content/chencang';
import { isWallFoot, cellHeight } from '../rules/map';
import { usableEngine } from '../rules/combat';
import type { SiegeEngine, SiegeState, SiegeUnit } from '../rules/types';
import type { Facing } from '../save';
import { FRAME, INNER_WALL_JOB, POSE_SETS, WALL_FOOT, patchOf, sheet } from './assets';
import { placePiece, type Sprite } from './mapPieces';
import { project, STANDING_EPSILON, type SceneObject, type ScreenRect } from './scene';

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
  const ladder = state.engines.find(
    (e) => e.raisedAt && usableEngine(e) && e.x === unit.x && e.y === unit.y,
  );
  const climbing =
    unit.climbing ||
    (unit.side === 'shu' &&
      unit.level === 'ground' &&
      (ladder || isWallFoot(state, unit.x, unit.y)));
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
      : climbing
        ? 1.5
        : cellHeight(state, unit.x, unit.y, unit.level);
  const y = climbing && ladder ? 18 : unit.y;
  const foot = project(FRAME, unit.x + 0.5, y + (unit.level === 'wall' ? WALL_FOOT : 0.5), h);
  return {
    set,
    action,
    pose: poses.get(name)!,
    flip: facing === 'west',
    foot,
    rect: [foot[0] - 22, foot[1] - 48, foot[0] + 22, foot[1] + 10] as ScreenRect,
    depth: { row: climbing && ladder ? 19 : unit.y, height: (climbing ? 3 : h) + STANDING_EPSILON },
  };
}
