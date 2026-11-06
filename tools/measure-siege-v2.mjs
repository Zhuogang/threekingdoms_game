// Browser-free V2 geometry, SSR and review-sheet evidence. SVG rasterization is
// a separate librsvg check; neither check measures Chromium frame scheduling.
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
const directory = '.artifacts/siege/v2-scenes';
await mkdir(directory, { recursive: true });
const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  logLevel: 'error',
});
try {
  const [
    { SiegeMapView },
    { createRenderScene, RENDER_SCENES },
    g,
    { createSiegeState },
    assets,
    { statePatches, unitVisual, engineSprite },
  ] = await Promise.all([
    vite.ssrLoadModule('/src/siege/render/SiegeMapView.tsx'),
    vite.ssrLoadModule('/src/siege/dev/renderScenes.ts'),
    vite.ssrLoadModule('/src/siege/render/boardGeometry.ts'),
    vite.ssrLoadModule('/src/siege/rules/state.ts'),
    vite.ssrLoadModule('/src/siege/render/assets.ts'),
    vite.ssrLoadModule('/src/siege/render/stateArt.ts'),
  ]);
  const geometry = {};
  for (const mode of ['empty', 'built', 'broken']) {
    const state = createSiegeState(228);
    if (mode !== 'empty') state.innerWall = { 0: 4, 1: 4, 2: 4, 3: 4 };
    if (mode === 'broken')
      for (const gate of Object.values(state.gates)) {
        gate.broken = true;
        gate.durability = 0;
      }
    const positions = g.standingPositions(state);
    let pairs = 0,
      overlaps = 0,
      feet = 0,
      badFeet = 0,
      badAnchors = 0,
      badCentres = 0,
      minWidth = Infinity,
      minHeight = Infinity;
    for (const [i, p] of positions.entries()) {
      const r = g.hitRect(p, state),
        at = g.anchor(p, state),
        plane = g.planeRect(p);
      minWidth = Math.min(minWidth, r[2] - r[0]);
      minHeight = Math.min(minHeight, r[3] - r[1]);
      if (!g.contains(r, ...at)) badAnchors++;
      if (JSON.stringify(g.positionAt(state, ...g.centre(r))) !== JSON.stringify(p)) badCentres++;
      for (const q of positions.slice(i + 1)) {
        const b = g.hitRect(q, state);
        pairs++;
        if (r[0] < b[2] && b[0] < r[2] && r[1] < b[3] && b[1] < r[3]) overlaps++;
      }
      for (const troops of [1, 150, 1000, 3000])
        for (const [x, y] of g.formationFor(p, troops)) {
          const a = g.anchor(p);
          feet++;
          if (!g.contains(plane, a[0] + x, a[1] + y)) badFeet++;
        }
    }
    geometry[mode] = {
      positions: positions.length,
      pairs,
      overlaps,
      feet,
      badFeet,
      badAnchors,
      badCentres,
      minWidth,
      minHeight,
    };
  }
  const render = (name) => {
    const fixture = createRenderScene(name);
    return renderToStaticMarkup(
      createElement(SiegeMapView, {
        ...fixture,
        locale: 'en',
        showRange: false,
        boardReview: name === 'board',
      }),
    );
  };
  const scenes = {};
  for (const name of RENDER_SCENES) {
    const fixture = createRenderScene(name),
      markup = render(name),
      visible = markup.replace(/<defs>[\s\S]*?<\/defs>/g, '');
    const covered = [...markup.matchAll(/data-covered-unit="([^"]+)"/g)].map((m) => m[1]);
    const figures = fixture.state.units.map((unit) => ({
      unit,
      visual: unitVisual(fixture.state, unit),
    }));
    const plates = g.layoutNameplates(
      figures.map(({ unit, visual }) => ({
        id: unit.id,
        position: unit,
        foot: visual.foot,
        rect: visual.rect,
      })),
      name !== 'board',
    );
    scenes[name] = {
      units: fixture.state.units.length,
      platePairs: (figures.length * (figures.length - 1)) / 2,
      overlappingPlates: figures.reduce(
        (n, f, i) =>
          n +
          figures.slice(i + 1).filter((q) => {
            const a = plates.get(f.unit.id),
              b = plates.get(q.unit.id);
            return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
          }).length,
        0,
      ),
      platesAboveFigures: figures.filter((f) => plates.get(f.unit.id)[3] <= f.visual.rect[1] - 4)
        .length,
      images: Number(markup.match(/data-sprite-count="(\d+)"/)[1]),
      actualImageNodes: (visible.match(/<image\b/g) ?? []).length,
      figures: figures.reduce((n, v) => n + v.visual.figures.length, 0),
      silhouetteGroups: covered.length,
      drawInstances: Number(markup.match(/data-draw-instance-count="(\d+)"/)[1]),
      reusedSilhouetteFigures: figures
        .filter((v) => covered.includes(v.unit.id))
        .reduce((n, v) => n + v.visual.figures.length, 0),
      silhouetteFilterDefinitions: (markup.match(/<feFlood flood-color="#ffd23c"/g) ?? []).length,
      covered,
      markupBytes: Buffer.byteLength(markup),
    };
    const end = markup.indexOf('</svg><svg class="siege-minimap"') + 6;
    let svg = markup
      .slice(markup.indexOf('<svg '), end)
      .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')
      .replace(/viewBox="[^"]+"/, 'viewBox="0 0 3072 1536"')
      .replace('width="100%" height="100%"', 'width="3072" height="1536"');
    svg = svg.replace(
      /href="(\/docs\/[^"?#]+)(?:[^" ]*)"/g,
      (_, path) => `href="file://${resolve('.' + decodeURIComponent(path))}"`,
    );
    svg = svg.replace(
      /href="(assets\/[^"?#]+)"/g,
      (_, path) => `href="file://${resolve('public', path)}"`,
    );
    await writeFile(`${directory}/${name}.svg`, svg);
    await writeFile(
      `${directory}/${name}.json`,
      JSON.stringify(
        {
          patches: statePatches(fixture.state),
          units: figures.map(({ unit, visual }) => ({
            id: unit.id,
            p: { x: unit.x, y: unit.y, level: unit.level },
            anchor: g.anchor(unit),
            foot: visual.foot,
            plane: g.planeRect(unit),
            hit: g.hitRect(unit, fixture.state),
            plate: plates.get(unit.id),
            figures: visual.figures.length,
          })),
          patchesResolved: statePatches(fixture.state).map((p) => ({
            ...p,
            ...assets.patchOf(p.state),
          })),
        },
        null,
        2,
      ),
    );
  }
  for (let i = 0; i < 20; i++) render('worst');
  const samples = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    render('worst');
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  const state = createSiegeState(228),
    ladder = state.engines[0];
  ladder.raisedAt = { x: 6, y: 7 };
  const ladders = [false, true].map((covered) => {
    const sprite = engineSprite({ ...ladder, covered });
    return {
      covered,
      logicalBase: { x: 6, y: 10 },
      paintedBase: g.anchor(g.ladderBase(ladder)),
      top: g.anchor({ x: 6, y: 7, level: 'wall' }),
      scale: (sprite.rect[2] - sprite.rect[0]) / (sprite.crop[2] - sprite.crop[0]),
      rect: sprite.rect,
    };
  });
  const report = {
    node: process.version,
    reactMode: process.env.NODE_ENV ?? 'development',
    geometry,
    scenes,
    ladders,
    fullSceneSSR: {
      warmups: 20,
      samples: samples.length,
      medianMs: samples[50],
      p95Ms: samples[94],
      maxMs: samples[99],
    },
    limitations:
      'SSR includes React and markup construction. It excludes browser rasterization, filters, image decoding and frame scheduling. Librsvg review images are static evidence, not Chromium screenshots.',
  };
  await writeFile('.artifacts/siege/v2-measurements.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await vite.close();
}
