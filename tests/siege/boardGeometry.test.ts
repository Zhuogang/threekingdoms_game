import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  anchor,
  centre,
  contains,
  depthOf,
  formationFor,
  hitRect,
  layoutNameplates,
  planeRect,
  positionAt,
  standingPositions,
} from '../../src/siege/render/boardGeometry';
import { rectsOverlap } from '../../src/siege/render/scene';
import { createSiegeState } from '../../src/siege/rules/state';
import { SiegeMapView } from '../../src/siege/render/SiegeMapView';
import { createRenderScene } from '../../src/siege/dev/renderScenes';
import { INNER_WALL_SEGMENTS } from '../../src/siege/content/chencang';
import { statePatches, unitVisual } from '../../src/siege/render/stateArt';

describe('V2 board geometry contract', () => {
  it.each(['empty', 'built', 'broken'] as const)(
    '%s: every hit area is disjoint, invertible, at least 40×24, and contains its anchor',
    (mode) => {
      const state = createSiegeState(228);
      if (mode !== 'empty')
        for (const segment of INNER_WALL_SEGMENTS) state.innerWall[segment.index] = 4;
      if (mode === 'broken')
        for (const gate of Object.values(state.gates)) {
          gate.broken = true;
          gate.durability = 0;
        }
      const positions = standingPositions(state);
      let pairs = 0,
        feet = 0,
        minW = Infinity,
        minH = Infinity;
      for (const [i, p] of positions.entries()) {
        const r = hitRect(p, state)!,
          plane = planeRect(p),
          at = anchor(p, state);
        minW = Math.min(minW, r[2] - r[0]);
        minH = Math.min(minH, r[3] - r[1]);
        expect(r[2] - r[0], JSON.stringify(p)).toBeGreaterThanOrEqual(40);
        expect(r[3] - r[1], JSON.stringify(p)).toBeGreaterThanOrEqual(24);
        expect(positionAt(state, ...centre(r))).toEqual(p);
        expect(contains(r, ...at), JSON.stringify({ p, r, at })).toBe(true);
        for (const q of positions.slice(i + 1)) {
          expect(
            rectsOverlap(r, hitRect(q, state)!),
            JSON.stringify({ p, q, r, qRect: hitRect(q, state) }),
          ).toBe(false);
          pairs++;
        }
        for (const troops of [1, 150, 1000, 3000])
          for (const offset of formationFor(p, troops)) {
            const foot = anchor(p);
            expect(
              contains(plane, foot[0] + offset[0], foot[1] + offset[1]),
              JSON.stringify({ p, plane, foot, offset }),
            ).toBe(true);
            feet++;
          }
      }
      console.info(
        `V2 ${mode}: ${positions.length} positions, ${pairs} disjoint pairs, ${feet} feet, minimum ${minW}×${minH}`,
      );
    },
  );
  it('uses ground ramps, the visible row-six strip, faces, and separate gate mouths', () => {
    const state = createSiegeState(228);
    expect(planeRect({ x: 7, y: 6, level: 'ground' })).toEqual([1280, 576, 1472, 768]);
    expect(hitRect({ x: 6, y: 6, level: 'ground' })).toEqual([1088, 576, 1280, 696]);
    expect(hitRect({ x: 6, y: 7, level: 'wall' })).toEqual([1088, 696, 1280, 816]);
    expect(hitRect({ x: 6, y: 1, level: 'ground' })).toBeNull();
    expect(positionAt(state, -1, -1)).toBeNull();
    expect(positionAt(state, 1088, 696)).toEqual({ x: 6, y: 7, level: 'wall' });
    for (const p of [
      { x: 8, y: 7 },
      { x: 8, y: 2 },
      { x: 4, y: 5 },
      { x: 12, y: 5 },
    ]) {
      const wall = { ...p, level: 'wall' as const },
        ground = { ...p, level: 'ground' as const };
      expect(rectsOverlap(hitRect(wall)!, hitRect(ground)!)).toBe(false);
      expect(positionAt(state, ...centre(hitRect(ground)!))).toEqual(ground);
    }
  });
  it('refreshes cached levels when a dev fixture builds inner walls or breaks gates in place', () => {
    const state = createSiegeState(228),
      ground = { x: 7, y: 6, level: 'ground' as const };
    expect(positionAt(state, ...anchor(ground))).toEqual(ground);
    for (const segment of INNER_WALL_SEGMENTS) state.innerWall[segment.index] = 4;
    const wall = { ...ground, level: 'wall' as const };
    expect(positionAt(state, ...centre(hitRect(wall, state)!))).toEqual(wall);
    state.gates.south.broken = true;
    expect(positionAt(state, ...centre(hitRect({ x: 8, y: 7, level: 'ground' }, state)!))).toEqual({
      x: 8,
      y: 7,
      level: 'ground',
    });
  });
  it('fills all three fine cells of a wide trench position without seams', () => {
    const state = createSiegeState(228);
    state.trenchFill['7,8'] = 3;
    const patches = statePatches(state)
      .filter((p) => p.id.startsWith('trench-'))
      .sort((a, b) => a.clip![0] - b.clip![0]);
    expect(patches.map((p) => p.id)).toEqual(['trench-20,17', 'trench-21,17', 'trench-22,17']);
    expect(patches.every((p) => p.state === 'trench-filled')).toBe(true);
    expect(
      patches.reduce((n, p) => n + (p.clip![2] - p.clip![0]) * (p.clip![3] - p.clip![1]), 0),
    ).toBe(192 * 72);
    // Authoritative art boxes include a 24px trench-face apron below the 48px plane.
    expect(patches.map((p) => p.clip![1])).toEqual([816, 816, 816]);
    for (let i = 1; i < patches.length; i++)
      expect(patches[i]!.clip![0]).toBe(patches[i - 1]!.clip![2]);
  });
  it('caps narrow cells and keeps wall ranks, side files, and hero poses at full size', () => {
    const state = createSiegeState(228),
      unit = state.units[1]!;
    for (const p of [
      { x: 6, y: 7, level: 'wall' as const },
      { x: 4, y: 4, level: 'wall' as const },
      { x: 4, y: 7, level: 'wall' as const },
      { x: 6, y: 10, level: 'ground' as const },
    ]) {
      Object.assign(unit, p, { troops: 3000 });
      const visual = unitVisual(state, unit);
      expect(visual.figures).toHaveLength(p.x === 4 && p.y === 7 ? 3 : 5);
      expect(visual.depth).toEqual(depthOf(p));
      for (const figure of visual.figures) expect(figure.pose).toBe(visual.pose);
    }
    const hero = state.units[0]!;
    expect(unitVisual(state, hero).set).toBe('s5-05');
  });
  it('gate-top units draw in front while behind-building units keep masked yellow silhouettes', () => {
    const state = createSiegeState(228);
    Object.assign(state.units[1]!, { x: 7, y: 6, level: 'ground', troops: 3000 });
    const markup = renderToStaticMarkup(
      createElement(SiegeMapView, { state, locale: 'en', showRange: false }),
    );
    for (const id of ['wei-haozhao', state.units[1]!.id]) {
      if (id !== 'wei-haozhao') expect(markup).toContain(`data-covered-unit="${id}"`);
      const figureIndex = markup.indexOf(`data-unit="${id}"`);
      const plateIndex = markup.indexOf(`data-nameplate="${id}"`);
      expect(plateIndex).toBeGreaterThan(markup.lastIndexOf('data-object='));
      if (id === 'wei-haozhao') expect(markup).not.toContain(`data-covered-unit="${id}"`);
      else expect(figureIndex).toBeLessThan(markup.indexOf(`data-covered-unit="${id}"`));
    }
    expect(markup.match(/<feFlood flood-color="#ffd23c"/g)).toHaveLength(1);
    expect(markup).toContain('operator="in"');
    const silhouettes = [...markup.matchAll(/<g[^>]+data-silhouette=[\s\S]*?<\/g><\/g><\/g>/g)];
    expect(silhouettes.length).toBeGreaterThan(0);
    for (const [block] of silhouettes) {
      expect(block).toContain('-cover-');
      expect(block).toContain('-silhouette)');
      expect(block).toContain('<use ');
      expect(block).not.toContain('<image');
      expect(block).toContain('opacity="0.7"');
    }
  });
  it('keeps common-scene plates above ordinary figures or below ladder feet, spreading without horizontal drift', () => {
    let positions = 0,
      pairs = 0;
    for (const name of ['visible', 'worst', 'footholds', 'assault', 'mounds', 'ramps'] as const) {
      const { state } = createRenderScene(name);
      const figures = state.units.map((unit) => {
        const visual = unitVisual(state, unit);
        return {
          id: unit.id,
          position: unit,
          foot: visual.foot,
          rect: visual.rect,
          belowFoot: visual.climbing || visual.storming,
        };
      });
      const plates = layoutNameplates(figures);
      for (const [i, f] of figures.entries()) {
        const r = plates.get(f.id)!;
        if (f.belowFoot) {
          expect(r[1]).toBeLessThanOrEqual(f.foot[1] + 10);
          expect(r[3] <= f.foot[1] + 3 || r[1] >= f.foot[1] + 7).toBe(true);
        } else expect(r[3]).toBeLessThanOrEqual(f.rect[1] - 4);
        expect((r[0] + r[2]) / 2).toBeCloseTo(f.foot[0], 8);
        positions++;
        for (const other of figures.slice(i + 1)) {
          expect(rectsOverlap(r, plates.get(other.id)!), `${name}/${f.id}/${other.id}`).toBe(false);
          pairs++;
        }
      }
    }
    expect(positions).toBe(96);
    expect(pairs).toBe(720);
  });
  it('guards the sole board-to-pixel boundary outside explicitly fine-coordinate art modules', () => {
    const exemptions = new Set([
      'boardGeometry.ts',
      'assets.ts',
      'scene.ts',
      'mapPieces.ts',
      'SiegePreview.tsx',
    ]);
    const files = ['render', 'ui', 'dev'].flatMap((dir) =>
      readdirSync(`src/siege/${dir}`)
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => join('src/siege', dir, f)),
    );
    const violations: string[] = [];
    for (const path of files) {
      if (exemptions.has(path.split('/').at(-1)!)) continue;
      const source = readFileSync(path, 'utf8');
      if (
        /\bproject\s*\(/.test(source) ||
        /(?:\.[xy]\b[^;\n]*\*\s*FRAME\.(?:cw|cd)|FRAME\.(?:cw|cd)\s*\*[^;\n]*\.[xy]\b)/.test(source)
      )
        violations.push(path);
    }
    expect(violations).toEqual([]);
    console.info(
      `V2 source guard: ${files.length} files, ${exemptions.size} explicit geometry/art exemptions, ${violations.length} violations`,
    );
  });
});
