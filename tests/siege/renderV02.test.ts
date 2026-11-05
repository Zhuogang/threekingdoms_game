import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CAMP, FRAME, MAP, POSE_SETS, sheet } from '../../src/siege/render/assets';
import { placeCrop, placePiece, spriteObject } from '../../src/siege/render/mapPieces';
import { compareDepth, project, sliceObject } from '../../src/siege/render/scene';
import { engineSprite, unitVisual, UNIT_FOOT } from '../../src/siege/render/stateArt';
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
import { SiegeMapView, SILHOUETTE_OPACITY } from '../../src/siege/render/SiegeMapView';
import {
  FootholdPips,
  FOOTHOLD_RADIUS,
  PreparationFlames,
} from '../../src/siege/render/v02Effects';
import { createRenderScene, RENDER_SCENES } from '../../src/siege/dev/renderScenes';
import { createSiegeState } from '../../src/siege/rules/state';
import { engine } from './rulesFixtures';

const markupFor = (fixture: ReturnType<typeof createRenderScene>, props = {}) =>
  renderToStaticMarkup(
    createElement(SiegeMapView, { ...fixture, locale: 'en', showRange: false, ...props }),
  );
const visibleImages = (markup: string) =>
  markup.replace(/<defs>[\s\S]*?<\/defs>/g, '').match(/<image\b/g)?.length ?? 0;

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
    if (progress === 1 || progress === 2) expect(visual.figures.map((f) => f.name)).toEqual(names);
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
    for (const asset of ['s8-01-covered-ladder', 's8-02-covered-ram']) {
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
  it('maps preparations, uses firewood only today, and omits every part of a spent millstone', () => {
    const state = createRenderScene('preparations').state;
    const sprites = preparationSprites(state);
    expect(sprites.filter((s) => s.flame)).toHaveLength(3);
    expect(sprites.filter((s) => s.id.endsWith('-2'))).toHaveLength(1);
    expect(sprites.some((s) => s.id === 'preparation-16,16-2')).toBe(true);
    expect(sprites.some((s) => s.id === 'preparation-27,16-3')).toBe(true);
    expect(sprites.filter((s) => s.id.startsWith('crane-'))).toHaveLength(2);
    expect(sprites.filter((s) => s.rope)).toHaveLength(2);
    for (const millstone of Object.values(state.preparations.millstones)) millstone.hoisted = false;
    const spent = preparationSprites(state);
    expect(spent.filter((s) => s.sheet === 's4-07-millstone-crane')).toHaveLength(0);
    expect(spent.filter((s) => s.rope)).toHaveLength(0);
    state.day++;
    expect(preparationSprites(state).filter((s) => s.id.endsWith('-2'))).toHaveLength(0);
  });
  it('hangs millstones clear of units, after the parapet and every tower slice, with a connected short rope', () => {
    const fixture = createRenderScene('preparations');
    const unit = fixture.state.units.find((u) => u.side === 'wei')!;
    // All gate orientations, including multi-row side towers, plus a plain wall.
    for (const tower of [...MAP.objects.filter((o) => o.kind === 'gate-tower'), undefined]) {
      const x = tower ? Math.floor((tower.cells[0] + tower.cells[2]) / 2) : 26;
      const y = tower ? Math.floor((tower.cells[1] + tower.cells[3]) / 2) : 16;
      const key = `${x},${y}`;
      Object.assign(unit, { x, y, level: 'wall' });
      fixture.state.preparations.millstones = { [key]: { day: 1, hoisted: true } };
      const visual = unitVisual(fixture.state, unit);
      const sprites = preparationSprites(fixture.state);
      const crane = sprites.find((s) => s.id === `crane-${key}`)!;
      const stone = sprites.find((s) => s.id === `millstone-${key}`)!;
      expect(compareDepth(crane.depth!, visual.depth)).toBeGreaterThan(0);
      expect(compareDepth(stone.depth!, visual.depth)).toBeGreaterThan(0);
      if (tower)
        for (const slice of sliceObject(FRAME, tower))
          expect(compareDepth(crane.depth!, slice)).toBeGreaterThan(0);
      else expect(compareDepth(crane.depth!, { row: y, height: 3.5 })).toBeGreaterThan(0);
      const mapped = (sprite: typeof stone, px: number, py: number) => [
        sprite.rect[0] + (px - sprite.crop[0]) / 2,
        sprite.rect[1] + (py - sprite.crop[1]) / 2,
      ];
      expect(stone.rope!.slice(0, 2)).toEqual(mapped(crane, 383, 602));
      expect(stone.rope!.slice(2)).toEqual(mapped(stone, 1154.5, 487));
      expect(stone.rope![2]).toBe(stone.rope![0]);
      expect(stone.rope![3] - stone.rope![1]).toBe(12);
      expect(stone.rope![1]).toBeGreaterThan(visual.foot[1]);
      expect(stone.rope![3]).toBeGreaterThan(visual.rect[3]);
      // Selection and xray must not fade the warning or silhouette the unit over it.
      for (const props of [{}, { selected: unit.id }, { selected: unit.id, xray: true }]) {
        const markup = markupFor(fixture, props);
        const normalUnit = markup.indexOf(`data-unit="${unit.id}"`);
        for (const sprite of [crane, stone]) {
          const rig = markup.indexOf(`data-piece="${sprite.id}"`);
          expect(rig).toBeGreaterThan(normalUnit);
          if (tower) expect(rig).toBeGreaterThan(markup.lastIndexOf(`data-object="${tower.id}"`));
          expect(markup).toContain(`data-piece="${sprite.id}" pointer-events="none"`);
        }
        expect(markup).toContain(`data-millstone-rope="millstone-${key}"`);
      }
    }
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
  it('draws both storming masses after every slice of their own raised ladder', () => {
    const fixture = createRenderScene('assault');
    for (const covered of [false, true]) {
      fixture.state.engines.forEach((e) => {
        e.covered = covered;
      });
      const markup = markupFor(fixture);
      for (const [index, x] of [18, 29].entries()) {
        const storm = markup.indexOf(`data-piece="storm-${fixture.state.units[index + 1]!.id}"`);
        expect(storm).toBeGreaterThan(markup.lastIndexOf(`data-piece="ladder-${x}"`));
        expect(markup.indexOf('data-testid="foothold-pips"')).toBeGreaterThan(storm);
      }
    }
  });
  it('draws gate-top units inside their own wall cell, after all tower slices, without a tower silhouette', () => {
    const fixture = createRenderScene('preparations');
    const unit = fixture.state.units.find((u) => u.side === 'wei')!;
    for (const gate of MAP.objects.filter((o) => o.kind === 'gate-tower')) {
      Object.assign(unit, {
        x: gate.cells[0] + Math.floor((gate.cells[2] - gate.cells[0]) / 2),
        y: Math.floor((gate.cells[1] + gate.cells[3]) / 2),
        level: 'wall',
      });
      const visual = unitVisual(fixture.state, unit);
      expect(visual.foot).toEqual(project(FRAME, unit.x + 0.5, unit.y + UNIT_FOOT, 3));
      for (const slice of sliceObject(FRAME, gate))
        expect(compareDepth(slice, visual.depth)).toBeLessThan(0);
      const markup = markupFor(fixture);
      const normalUnit = markup.indexOf(`data-unit="${unit.id}"`);
      expect(normalUnit).toBeGreaterThan(markup.lastIndexOf(`data-object="${gate.id}"`));
      expect(markup).toContain(`data-gate-top="${gate.id}"`);
      const cover = markup.match(
        new RegExp(`<mask[^>]+id="[^"]*-cover-${unit.id}"[^>]*>([\\s\\S]*?)</mask>`),
      )![1]!;
      // A side gate's feet can still sit behind the adjoining wall. Its own
      // tower must never be the occluder; the south gate is fully unobscured.
      expect(cover).not.toContain(`-${gate.id}-`);
      if (gate.id === 'gate-south') {
        const node = markup.match(new RegExp(`<g[^>]*data-unit="${unit.id}"[\\s\\S]*?</g>`))![0];
        expect(node).toContain('data-sprite="figure"');
        expect(node).not.toContain('data-sprite="silhouette"');
      }
    }
  });
  it('shows larger hollow empty pips beside the ladder with dark outlines and paper rings', () => {
    const state = createRenderScene('footholds').state;
    const markup = renderToStaticMarkup(createElement(FootholdPips, { state }));
    expect(FOOTHOLD_RADIUS).toBeCloseTo((FRAME.lh / 8) * 1.8);
    const cores = [...markup.matchAll(/<circle data-pip-core="true"[^>]+/g)].map((m) => m[0]);
    expect(cores).toHaveLength(12);
    expect(cores.filter((c) => c.includes('fill="none"'))).toHaveLength(6);
    expect(cores.filter((c) => c.includes('fill="#edbd56"'))).toHaveLength(6);
    expect(cores.every((c) => c.includes('stroke="#372e26"'))).toBe(true);
    for (const x of [16, 19, 28, 31])
      expect(markup).toContain(`cx="${project(FRAME, x + 0.98, 17, 1.5)[0]}"`);
    expect(markup.match(/stroke="#ece4d2"/g)).toHaveLength(12);
  });
  it('keeps hidden units findable with full-colour 85% figures above occluders, including xray', () => {
    const fixture = createRenderScene('formations');
    for (const xray of [false, true]) {
      const markup = markupFor(fixture, { xray });
      const silhouettes = [...markup.matchAll(/<g[^>]+data-silhouette="(shu|wei)"[^>]+>/g)];
      expect(silhouettes.length).toBeGreaterThan(0);
      expect(silhouettes.every((m) => m[0].includes(`opacity="${SILHOUETTE_OPACITY}"`))).toBe(true);
      expect(markup).not.toContain('-silhouette-shu');
      expect(markup).not.toContain('-silhouette-wei');
    }
  });
  it('keeps every living unit invisible geometry rect findable without input semantics at every zoom', () => {
    const state = createSiegeState(228);
    const unit = state.units.find((u) => u.id === 'wei-captain-1')!;
    Object.assign(unit, { x: 18, y: 16, level: 'wall' });
    state.engines[0]!.raisedAt = { x: 18, y: 16 };
    for (const initialZoom of [0.5, 0.75, 1, 1.5]) {
      const markup = renderToStaticMarkup(
        createElement(SiegeMapView, { state, locale: 'en', initialZoom }),
      );
      expect(markup).toContain(
        `data-silhouette="wei" opacity="${SILHOUETTE_OPACITY}" pointer-events="none"`,
      );
      const targetLayer = markup.indexOf('data-testid="unit-hit-targets"');
      expect(targetLayer).toBeGreaterThan(markup.lastIndexOf('data-object='));
      expect(targetLayer).toBeGreaterThan(markup.lastIndexOf('data-silhouette='));
      expect(targetLayer).toBeGreaterThan(markup.lastIndexOf('data-overlay='));
      const hits = [...markup.matchAll(/<rect[^>]+data-testid="map-unit-([^"]+)"[^>]*>/g)];
      expect(hits.map((hit) => hit[1]).sort()).toEqual(state.units.map((u) => u.id).sort());
      const hit = hits.find((hit) => hit[1] === unit.id)![0];
      const visual = unitVisual(state, unit);
      expect(hit).toContain(`x="${visual.rect[0]}" y="${visual.rect[1]}"`);
      expect(hit).toContain(`width="${visual.rect[2] - visual.rect[0]}"`);
      expect(hit).toContain(`height="${visual.rect[3] - visual.rect[1]}"`);
      expect(hit).toContain('pointer-events="none"');
      expect(markup).not.toContain('data-select=');
    }
  });
  it('fits preparations uniformly to their game widths, with measured feet on the walkway centre and bundles beside bowls', () => {
    const state = createRenderScene('preparations').state;
    const sprites = preparationSprites(state);
    const source = sheet('s8-04-wall-top-preparations');
    for (const sprite of sprites.filter((s) => s.id.startsWith('preparation-'))) {
      const index = Number(sprite.id.at(-1));
      const object = source.pieces[index]!.objects[0]!;
      expect(sprite.crop).toEqual(object.alphaBBox);
      const sx = (sprite.rect[2] - sprite.rect[0]) / (sprite.crop[2] - sprite.crop[0]);
      const sy = (sprite.rect[3] - sprite.rect[1]) / (sprite.crop[3] - sprite.crop[1]);
      expect(sx).toBeCloseTo(sy, 10);
      expect(sprite.rect[2] - sprite.rect[0]).toBeCloseTo([34, 34, 32, 40][index]!);
      const [x, y] = sprite.cells;
      const target = project(FRAME, x + 0.5, y + 0.5, 3);
      const anchor = object.footCentreAnchor!;
      expect(sprite.rect[1] + (anchor[1] - sprite.crop[1]) * sy).toBeCloseTo(target[1]);
      if (index !== 2)
        expect(sprite.rect[0] + (anchor[0] - sprite.crop[0]) * sx).toBeCloseTo(target[0]);
      if (sprite.flame) {
        expect(sprite.flame[0]).toBe(target[0]);
        expect(sprite.flame[1]).toBeGreaterThan(sprite.rect[1]);
        expect(sprite.flame[1]).toBeLessThan(sprite.rect[3]);
      }
    }
    for (const [key, brazier] of Object.entries(state.preparations.braziers)) {
      const bowl = sprites.find((s) => s.id === `preparation-${key}-1`)!;
      const bundle = sprites.find((s) => s.id === `preparation-${key}-2`);
      if (brazier.litDay === state.day) {
        expect(bundle).toBeDefined();
        expect(bundle!.rect[0] - bowl.rect[2]).toBeCloseTo(3, 10);
        expect(bundle!.rect[3]).toBeCloseTo(bowl.rect[3]);
        expect(bundle!.cells).toEqual(bowl.cells);
      } else expect(bundle).toBeUndefined();
    }
    for (const flare of [false, true]) {
      const flames = renderToStaticMarkup(createElement(PreparationFlames, { sprites, flare }));
      const images = [...flames.matchAll(/<image[^>]+data-flame="[^"]+"[^>]+>/g)];
      expect(images).toHaveLength(3);
      for (const [image] of images) {
        expect(Number(image.match(/\bwidth="([^"]+)"/)![1])).toBeCloseTo(34 / 3);
        expect(Number(image.match(/\bheight="([^"]+)"/)![1])).toBeCloseTo(17 * (flare ? 1.5 : 1));
      }
    }
  });
  it('shows thin ladder wall frames only when the cell is a legal action target', () => {
    const fixture = createRenderScene('footholds');
    expect(markupFor(fixture)).not.toContain('data-overlay="climb"');
    expect(markupFor(fixture, { selected: 'ladder-19' })).not.toContain('data-overlay="climb"');
    const markup = markupFor(fixture, { targets: [{ x: 19, y: 16, level: 'wall' }] });
    const frames = markup.match(/<rect[^>]+data-overlay="climb"[^>]+/g)!;
    expect(frames).toHaveLength(1);
    expect(frames[0]).toContain('data-cell="19,16,wall"');
    expect(frames[0]).toContain('stroke-width="1"');
    expect(markup).not.toContain('data-overlay="target"');
  });
  it('enforces the visible image budget, counts silhouettes and leaves source state untouched in all scenes', () => {
    const counts: Record<string, number> = {};
    for (const name of RENDER_SCENES) {
      const fixture = createRenderScene(name),
        before = structuredClone(fixture);
      const markup = markupFor(fixture);
      const count = Number(markup.match(/data-sprite-count="(\d+)"/)![1]);
      const visible = visibleImages(markup);
      counts[name] = count;
      expect(visible, name).toBe(count);
      expect(count, name).toBeLessThanOrEqual(SPRITE_CAP);
      expect(markup).not.toContain('href="undefined"');
      expect(markup).toContain('data-sprites-omitted="0"');
      for (const sprite of CAMP) expect(markup, sprite.id).toContain(`data-piece="${sprite.id}"`);
      expect(fixture).toEqual(before);
    }
    console.info('render-v02 visible sprite budgets:', JSON.stringify(counts));
    const candidates = Array.from({ length: 500 }, (_, i) =>
      placePiece(sheet('s8-02-covered-ram'), 0, [i, 20], FRAME, { id: `ram-${i}` }),
    );
    const bounded = boundSprites(candidates, 120);
    expect(bounded.sprites).toHaveLength(500);
    expect(bounded.used).toBe(1120);
    expect(bounded.omitted).toBe(0);
    expect(bounded.remaining).toBe(0);
    expect(counts.worst).toBe(388);
  });
  it('counts replay replacements and effects exactly, and keeps scenery and covered units even in an oversized future scene', () => {
    const fixture = createRenderScene('worst');
    for (const extra of [
      { night: { ...fixture.night!, previousEngine: { ...fixture.state.engines[0]!, y: 22 } } },
      {
        effectAction: {
          type: 'fireArrows',
          from: { x: 16, y: 16, level: 'wall' },
          to: { x: 16, y: 20, level: 'ground' },
        },
      },
    ]) {
      const markup = markupFor(fixture, extra);
      expect(visibleImages(markup)).toBe(Number(markup.match(/data-sprite-count="(\d+)"/)![1]));
    }
    fixture.state.engines = Array.from({ length: 100 }, (_, i) => ({
      ...fixture.state.engines[0]!,
      id: `overflow-${i}`,
    }));
    const markup = markupFor(fixture);
    expect(visibleImages(markup)).toBeGreaterThan(SPRITE_CAP);
    expect(markup).toContain('data-silhouette=');
    for (const sprite of CAMP) expect(markup).toContain(`data-piece="${sprite.id}"`);
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
