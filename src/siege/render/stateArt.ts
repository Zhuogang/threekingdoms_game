import {
  anchor,
  artCell,
  depthOf,
  fineFootprint,
  formationFor,
  gateTowerAt,
  ladderBase,
  climbingBase,
  moundFoot,
  wallFaceFoot,
} from './boardGeometry';
import { fineCellsOf } from '../content/coarseGrid';
import trenchJob from '../../../docs/siege/chencang/art/s3-01-trench-fill/job.json';
import {
  CHENCANG_ART_LAYOUT,
  INNER_WALL_SEGMENTS,
  SOUTH_TRENCH,
  cellKey,
} from '../content/chencang';
import { isWallFoot } from '../rules/map';
import { usableEngine } from '../rules/combat';
import type { SiegeEngine, SiegePosition, SiegeState, SiegeUnit } from '../rules/types';
import type { Facing } from '../save';
import { FRAME, INNER_WALL_JOB, POSE_SETS, patchOf, sheet } from './assets';
import { placeAnchoredPiece, type Sprite } from './mapPieces';
import { type SceneObject, type ScreenRect } from './scene';
import {
  climberPoses,
  climbingWall,
  figureBounds,
  moundStandingHeight,
  stormingSprite,
} from './v02Art';

export interface StatePatch {
  id: string;
  state: string;
  /** Map pixel rectangle; trench rectangles come verbatim from the art job. */
  clip?: ScreenRect;
  occluder?: SceneObject;
  opacity?: number;
}
// State indexes still identify the original four painted inner-wall runs.
const innerArtRow = CHENCANG_ART_LAYOUT.findIndex((row) => row.includes('R'));
const innerArtRuns = [...CHENCANG_ART_LAYOUT[innerArtRow]!.matchAll(/R+/g)].map((run) => [
  run.index!,
  run.index! + run[0].length - 1,
]);
export function statePatches(state: SiegeState): StatePatch[] {
  const patches: StatePatch[] = [{ id: 'ramp-south', state: 'ramp-south' }];
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
    for (const fine of fineCellsOf(cell)) {
      const box = trenchJob.states
        .find((s) => s.id === variant)!
        .cells.find((c) => c.cell[0] === fine.x && c.cell[1] === fine.y)?.box as
        ScreenRect | undefined;
      if (box) patches.push({ id: `trench-${cellKey(fine)}`, state: variant, clip: box });
    }
  }
  for (const segment of INNER_WALL_SEGMENTS) {
    const progress = state.innerWall[segment.index] ?? 0;
    if (!progress) continue;
    const variant = progress === 4 ? 'inner-wall-built' : 'inner-wall-works';
    const object = INNER_WALL_JOB.states.find((s) => s.id === variant)!.object!;
    const xs = innerArtRuns[segment.index]!;
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
              cells: [Math.min(...xs), innerArtRow, Math.max(...xs), innerArtRow],
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
  return [
    ladderBase(engine),
    ...(engine.kind === 'ladder' && engine.raisedAt && !engine.wrecked
      ? [{ ...engine.raisedAt, level: 'wall' as const }]
      : []),
  ];
}

/** Rules keep the ladder's operating unit at its logical base. The raised art
 * has a separate base registration; neither may occlude its own operating unit. */
export function sharesEngineCell(engine: SiegeEngine, p: SiegePosition): boolean {
  return (
    (p.level === 'ground' && engine.x === p.x && engine.y === p.y) ||
    engineFootprint(engine).some((c) => c.x === p.x && c.y === p.y && c.level === p.level)
  );
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
  const source = sheet(asset),
    object = source.pieces[piece]!.objects[0]!;
  const ground = ladderBase(engine);
  const base = anchor(ground);
  const raised = engine.kind === 'ladder' && engine.raisedAt && !engine.wrecked;
  const top = raised ? anchor({ ...engine.raisedAt!, level: 'wall' }) : base;
  const origin = source.pieces[piece]!.origin;
  const registration = object.registration;
  const basePixel: [number, number] = registration?.cartBase?.pixel ??
    object.footCentreAnchor ?? [
      origin[0] + ((object.cells[0] + object.cells[2] + 1) / 2) * source.cell[0],
      object.anchor[1],
    ];
  const topPixel: [number, number] = registration?.wallTop?.pixel ?? [
    basePixel[0],
    origin[1] + object.cells[1] * source.cell[1] - object.height * source.level,
  ];
  // Uniform registration, never vertical stretching: old ladders span 3.5 fine
  // rows; the coarse inner trench base is closer to the parapet.
  const scale = raised ? (base[1] - top[1]) / (basePixel[1] - topPixel[1]) : undefined;
  return {
    ...placeAnchoredPiece(source, piece, artCell(engine), FRAME, {
      id: engine.id,
      kind: 'engine',
      anchor: raised ? topPixel : basePixel,
      target: top,
      scale,
    }),
    cells: fineFootprint(raised ? [ground, engine.raisedAt!] : [engine]),
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
  const gateTop = unit.level === 'wall' ? gateTowerAt(unit) : undefined;
  const foot = storming
    ? wallFaceFoot(wall!)
    : climbing
      ? anchor(climbingBase(wall!))
      : moundHeight !== undefined
        ? moundFoot(unit, moundHeight)
        : anchor(unit, state);
  const pose = poses.get(name)!;
  const offsets = formationFor(unit, unit.troops);
  const followers = POSE_SETS[unit.side === 'shu' ? 's1-05' : 's5-03']!.poses;
  const followerName = [`${dir}-${action}`, `${dir}-idle`, 'north-idle', 'south-idle'].find((n) =>
    followers.has(n),
  )!;
  const hero = set === 's5-05' || set === 's5-06';
  const figures = storming
    ? []
    : climbing
      ? climberPoses(progress).map((poseName, i) => ({
          name: poseName,
          pose: POSE_SETS['s5-01']!.poses.get(poseName)!,
          // Follow the painted ladder. Picking still uses the logical base cell.
          offset: [
            0,
            (anchor({ ...wall!, level: 'wall' })[1] - foot[1]) *
              (progress === 1 ? 0.3 : i === 0 ? 0.45 : 0.8),
          ] as [number, number],
        }))
      : offsets.map((offset, i) =>
          hero && i < offsets.length - 1
            ? { name: followerName, pose: followers.get(followerName)!, offset }
            : { name, pose, offset },
        );
  // Storming keeps the approved art bounds. Its logical hit cell is handled
  // independently by boardGeometry, including overhanging figures.
  const bounds: ScreenRect = storming
    ? stormingSprite(state, unit)!.rect
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
    depth: depthOf(climbing || storming ? climbingBase(wall!) : unit, state),
  };
}
