import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FRAME, POSE_SETS, sheet } from '../../src/siege/render/assets';
import { placeCrop, placePiece, spriteObject } from '../../src/siege/render/mapPieces';
import { compareDepth, project, sliceObject } from '../../src/siege/render/scene';
import { engineSprite, unitVisual } from '../../src/siege/render/stateArt';
import { boundSprites } from '../../src/siege/render/spriteBudget';
import {
  climberPoses,
  formationCount,
  moundStage,
  moundSprite,
  preparationSprites,
  stormingSprite,
  SPRITE_CAP,
} from '../../src/siege/render/v02Art';
import { SiegeMapView } from '../../src/siege/render/SiegeMapView';
import { createRenderScene, RENDER_SCENES } from '../../src/siege/dev/renderScenes';
import { createSiegeState } from '../../src/siege/rules/state';
import { engine } from './rulesFixtures';

describe('v0.2 pure sprite mapping and registration', () => {
  it.each([
    [0, []],
    [1, ['north-climb-a']],
    [2, ['north-climb-a', 'north-climb-b']],
    [3, ['north-climb-top']],
  ] as const)('foothold %i selects the real S5-01 poses', (progress, names) => {
    expect(climberPoses(progress)).toEqual(names);
    for (const name of names) expect(POSE_SETS['s5-01']!.poses.has(name)).toBe(true);
    const state = createRenderScene('footholds').state;
    state.footholds['19,16'] = progress;
    const visual = unitVisual(state, state.units[2]!);
    if (progress) expect(visual.figures.map((f) => f.name)).toEqual(names);
    else expect(visual.figures.every((f) => !f.name.includes('climb'))).toBe(true);
  });
  it.each([
    [800, 1],
    [801, 3],
    [2000, 3],
    [2001, 5],
  ])('renders %i troops with %i figures at fixed size', (troops, count) => {
    const state = createSiegeState(228),
      unit = state.units[5]!;
    unit.troops = troops;
    const visual = unitVisual(state, unit);
    expect(formationCount(troops)).toBe(count);
    expect(visual.figures).toHaveLength(count);
    expect(visual.figures.every((f) => f.pose === visual.pose)).toBe(true);
    expect(visual.figures.at(-1)!.offset).toEqual([0, 0]);
  });
  it.each([
    [0, null],
    [1, 0],
    [2, 0],
    [3, 1],
    [5, 1],
    [6, 2],
  ])('mound progress %i maps to stage %s', (progress, stage) => {
    expect(moundStage(progress)).toBe(stage);
    expect(moundSprite('20,17', progress)?.cells).toEqual(
      stage === null ? undefined : [20, 17, 20, 18],
    );
  });
  it('registers every mound crest and base exactly, including the measured finished base', () => {
    for (const [index, progress] of [1, 3, 6].entries()) {
      const object = sheet('s8-03-earth-mound').pieces[index]!.objects[0]!;
      const registration = object.selectedRegistration ?? object.registration!;
      const sprite = moundSprite('20,17', progress)!;
      const y = (sourceY: number) =>
        sprite.rect[1] +
        ((sourceY - sprite.crop[1]) * (sprite.rect[3] - sprite.rect[1])) /
          (sprite.crop[3] - sprite.crop[1]);
      expect(y(registration.rampCrest!.pixel[1])).toBeCloseTo(
        project(FRAME, 20.5, 17, object.moundHeight!)[1],
        8,
      );
      expect(y(registration.southBase!.pixel[1])).toBeCloseTo(project(FRAME, 20.5, 19, 0)[1], 8);
    }
    const state = createRenderScene('mounds').state,
      visual = unitVisual(state, state.units[1]!);
    const mound = moundSprite('32,17', 6)!;
    expect(visual.foot[1]).toBeCloseTo(project(FRAME, 32.5, 17.5, 2.25)[1]);
    state.footholds['32,16'] = 2;
    const advancing = unitVisual(state, state.units[1]!);
    expect(advancing.foot).toEqual(visual.foot);
    expect(advancing.figures.every((f) => !f.name.includes('climb'))).toBe(true);
    expect(compareDepth(sliceObject(FRAME, spriteObject(mound))[0]!, visual.depth)).toBeLessThan(0);
    expect(
      compareDepth({ row: 16, height: 3.01 }, sliceObject(FRAME, spriteObject(mound))[0]!),
    ).toBeLessThan(0);
  });
  it('uses all six covered engine variants and the existing burning/wreck paths', () => {
    const scene = createRenderScene('covered');
    const sprites = scene.state.engines.map((e) => engineSprite(e, scene.facings[e.id]));
    expect(sprites.slice(0, 3).map((s) => s.sheet)).toEqual(Array(3).fill('s8-01-covered-ladder'));
    expect(sprites.slice(3, 6).map((s) => s.sheet)).toEqual(Array(3).fill('s8-02-covered-ram'));
    for (const [i, piece] of [0, 1, 2, 0, 1, 2].entries()) {
      const sprite = sprites[i]!,
        source = sheet(sprite.sheet).pieces[piece]!;
      expect(sprite.crop[0]).toBeGreaterThanOrEqual(source.cell[0]);
      expect(sprite.crop[2]).toBeLessThanOrEqual(source.cell[0] + source.cell[2]);
    }
    expect(sprites[4]!.flip).toBe(true);
    expect(sprites[6]!.sheet).toBe('s4-01-ladder-cart');
    expect(sprites[7]!.sheet).toBe('s4-03-ram');
    expect(engineSprite(engine('ram', 20, 20, { covered: true, durability: 150 })).crop).toEqual(
      sprites[3]!.crop,
    );
    expect(engineSprite(engine('ram', 20, 20, { covered: true, wrecked: true })).sheet).toBe(
      's4-03-ram',
    );
  });
  it('keeps all footprint-scale S8 anchors on the projected cells, including raised ladder wall top', () => {
    for (const asset of [
      's8-01-covered-ladder',
      's8-02-covered-ram',
      's8-04-wall-top-preparations',
    ]) {
      const source = sheet(asset);
      source.pieces.forEach((piece, i) => {
        const object = piece.objects[0]!,
          from: [number, number] = [object.cells[0], object.cells[1]];
        const sprite = placePiece(source, i, [20, 17], FRAME, { id: 'check' });
        const anchor = object.registration?.wallTop ?? object.registration?.baseCentre;
        const [ax, ay] = anchor?.pixel ?? object.anchor;
        const mapped = placeCrop(source, piece, [ax, ay, ax, ay], from, [20, 17], FRAME);
        const expected = anchor
          ? project(
              FRAME,
              20 + anchor.world[0] - from[0],
              17 + anchor.world[1] - from[1],
              anchor.world[2],
            )
          : project(
              FRAME,
              20 + (ax - piece.origin[0]) / source.cell[0] - from[0],
              17 + (ay - piece.origin[1]) / source.cell[1] - from[1],
            );
        expect(mapped.slice(0, 2)).toEqual(expected);
        const alpha = object.alphaBBox!;
        expect(sprite.crop[0]).toBeLessThanOrEqual(alpha[0]);
        expect(sprite.crop[2]).toBeGreaterThanOrEqual(alpha[2]);
      });
    }
  });
  it('maps preparations, uses firewood only today, and suspends stone directly under the recorded arm', () => {
    const state = createRenderScene('preparations').state;
    const sprites = preparationSprites(state);
    expect(sprites.filter((s) => s.flame)).toHaveLength(3);
    expect(sprites.filter((s) => s.id.endsWith('-2'))).toHaveLength(1);
    expect(sprites.some((s) => s.id === 'preparation-16,16-2')).toBe(true);
    expect(sprites.some((s) => s.id === 'preparation-27,16-3')).toBe(true);
    expect(sprites.filter((s) => s.id.startsWith('crane-'))).toHaveLength(1);
    const crane = sprites.find((s) => s.id === 'crane-24,16')!,
      stone = sprites.find((s) => s.id === 'millstone-24,16')!;
    const source = sheet('s4-07-millstone-crane'),
      armPiece = source.pieces[0]!,
      arm = armPiece.objects[0]!;
    const armEnd = placeCrop(
      source,
      armPiece,
      [(arm.bbox[0] + arm.bbox[2]) / 2, arm.bbox[3], (arm.bbox[0] + arm.bbox[2]) / 2, arm.bbox[3]],
      [arm.cells[0], arm.cells[1]],
      [24, 16],
      FRAME,
      3 * source.level,
    );
    const stoneBox = source.pieces[1]!.objects[0]!.bbox;
    const stoneTop = stone.rect[1] + (stoneBox[1] - stone.crop[1]) / 2;
    expect(stoneTop).toBeCloseTo(armEnd[1]);
    expect(stone.height).toBeGreaterThan(crane.height);
    state.day++;
    expect(preparationSprites(state).filter((s) => s.id.endsWith('-2'))).toHaveLength(0);
  });
  it('fits both storming variants uniformly to 84px, at the recorded foot centre, and replaces climbers', () => {
    const state = createRenderScene('assault').state,
      unit = state.units[1]!;
    for (const repulsed of [false, true]) {
      const sprite = stormingSprite(state, unit, repulsed)!;
      const object = sheet(sprite.sheet).pieces[repulsed ? 1 : 0]!.objects[0]!;
      const sx = (sprite.rect[2] - sprite.rect[0]) / (sprite.crop[2] - sprite.crop[0]);
      const sy = (sprite.rect[3] - sprite.rect[1]) / (sprite.crop[3] - sprite.crop[1]);
      expect(sx).toBeCloseTo(sy, 10);
      expect(sprite.rect[3] - sprite.rect[1]).toBe(84);
      expect(sprite.rect[0] + (object.footCentreAnchor![0] - sprite.crop[0]) * sx).toBe(
        project(FRAME, 18.5, 17)[0],
      );
      expect(sprite.rect[3]).toBe(project(FRAME, 18.5, 17)[1]);
    }
    expect(unitVisual(state, unit).figures).toHaveLength(0);
    unit.level = 'wall';
    unit.y = 16;
    expect(stormingSprite(state, unit)).toBeUndefined();
    expect(unitVisual(state, unit).figures.length).toBe(formationCount(unit.troops));
  });
  it('enforces the visible image budget, counts silhouettes and leaves source state untouched in all scenes', () => {
    const counts: Record<string, number> = {};
    for (const name of RENDER_SCENES) {
      const fixture = createRenderScene(name),
        before = structuredClone(fixture);
      const markup = renderToStaticMarkup(
        createElement(SiegeMapView, { ...fixture, locale: 'en', showRange: false }),
      );
      const count = Number(markup.match(/data-sprite-count="(\d+)"/)![1]);
      const visible = markup.replace(/<defs>[\s\S]*?<\/defs>/g, '').match(/<image\b/g)?.length ?? 0;
      counts[name] = count;
      expect(visible, name).toBeLessThanOrEqual(count);
      expect(count, name).toBeLessThanOrEqual(SPRITE_CAP);
      expect(markup).not.toContain('href="undefined"');
      expect(fixture).toEqual(before);
    }
    console.info('render-v02 visible sprite budgets:', JSON.stringify(counts));
    const candidates = Array.from({ length: 500 }, (_, i) =>
      placePiece(sheet('s8-02-covered-ram'), 0, [i, 20], FRAME, { id: `ram-${i}` }),
    );
    const bounded = boundSprites(candidates, 120);
    expect(bounded.used).toBeLessThanOrEqual(300);
    expect(bounded.omitted).toBeGreaterThan(0);
  });
  it('retains processed art metadata verbatim', () => {
    for (const asset of [
      's8-01-covered-ladder',
      's8-02-covered-ram',
      's8-03-earth-mound',
      's8-04-wall-top-preparations',
      's8-06-storming-cluster',
    ]) {
      expect(sheet(asset)).toEqual(
        JSON.parse(readFileSync(`docs/siege/chencang/art/${asset}/footprints.json`, 'utf8')),
      );
    }
  });
});
