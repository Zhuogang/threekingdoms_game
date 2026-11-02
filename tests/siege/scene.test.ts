import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  STANDING_EPSILON,
  compareDepth,
  pickCell,
  project,
  sliceObject,
  type SceneObject,
  type SiegeFrame,
} from '../../src/siege/render/scene';

const footprints = JSON.parse(
  readFileSync('docs/siege/chencang/art/s1-01-city-vignette/footprints.json', 'utf8'),
) as { origin: [number, number]; cell: [number, number]; level: number; objects: SceneObject[] };
const frame: SiegeFrame = {
  ox: footprints.origin[0],
  oy: footprints.origin[1],
  cw: footprints.cell[0],
  cd: footprints.cell[1],
  lh: footprints.level,
};
const object = (id: string) => footprints.objects.find((entry) => entry.id === id)!;

describe('siege scene geometry', () => {
  it('projects cells with the art-plan formula', () => {
    // Plan §4.2 at 100%: one cell 64×48, one level 24px.
    expect(project(frame, 14, 16, 3)).toEqual([frame.ox + 896, frame.oy + 768 - 72]);
  });

  it('cuts a north-south wall into contiguous row bands covering its box', () => {
    const wall = object('wall-west-n');
    const slices = sliceObject(frame, wall);
    expect(slices.map((slice) => slice.row)).toEqual([5, 6, 7, 8]);
    expect(slices[0]!.rect[1]).toBe(wall.bbox[1]);
    expect(slices.at(-1)!.rect[3]).toBe(wall.bbox[3]);
    for (let i = 1; i < slices.length; i++) expect(slices[i]!.rect[1]).toBe(slices[i - 1]!.rect[3]);
  });

  it('keeps single-row objects whole', () => {
    const gate = object('gate-south');
    expect(sliceObject(frame, gate)).toEqual([
      { objectId: 'gate-south', kind: 'gate-tower', row: 16, height: 7, rect: gate.bbox },
    ]);
  });

  it('puts a wall-top unit between the wall body and its parapet', () => {
    const [wall] = sliceObject(frame, object('wall-south-w'));
    const [parapet] = sliceObject(frame, object('wall-south-w-parapet'));
    const unit = { row: 16, height: 3 + STANDING_EPSILON };
    expect(compareDepth(wall!, unit)).toBeLessThan(0);
    expect(compareDepth(parapet!, unit)).toBeGreaterThan(0);
    // A unit on the ring road behind the south wall is covered by it.
    expect(compareDepth({ row: 15, height: STANDING_EPSILON }, wall!)).toBeLessThan(0);
  });

  it('a unit on the north part of a north-south wall sorts after the rows behind it', () => {
    const slices = sliceObject(frame, object('wall-west-s'));
    const unit = { row: 13, height: 3 + STANDING_EPSILON };
    expect(slices.filter((slice) => compareDepth(slice, unit) > 0).map((s) => s.row)).toEqual([
      14, 15,
    ]);
  });

  it('picks the wall top before the ground under the same pixel', () => {
    const walls = new Set(['18,16']);
    const standsAt = (x: number, y: number, h: number) => (h === 3 ? walls.has(`${x},${y}`) : true);
    const [sx, sy] = project(frame, 18.5, 16.5, 3);
    expect(pickCell(frame, sx, sy, [0, 3], standsAt)).toEqual({ x: 18, y: 16, h: 3 });
    const [gx, gy] = project(frame, 18.5, 19.5, 0);
    expect(pickCell(frame, gx, gy, [0, 3], standsAt)).toEqual({ x: 18, y: 19, h: 0 });
  });
});
