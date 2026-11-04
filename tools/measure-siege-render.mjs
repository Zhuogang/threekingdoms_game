// Browser-free L2 diagnostics. SSR rebuilds the entire scene; it does not
// measure browser paint, frame rate, or React's memoized camera updates.
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const vite = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  logLevel: 'error',
});
try {
  const [{ SiegeMapView }, { createRenderScene, RENDER_SCENES }, assets, geometry, camera] =
    await Promise.all([
      vite.ssrLoadModule('/src/siege/render/SiegeMapView.tsx'),
      vite.ssrLoadModule('/src/siege/dev/renderScenes.ts'),
      vite.ssrLoadModule('/src/siege/render/assets.ts'),
      vite.ssrLoadModule('/src/siege/render/scene.ts'),
      vite.ssrLoadModule('/src/v03/rendering/battlefield-viewport.ts'),
    ]);
  const render = (fixture) =>
    renderToStaticMarkup(
      createElement(SiegeMapView, {
        ...fixture,
        locale: 'en',
        showRange: false,
      }),
    );
  const scenes = {};
  for (const name of RENDER_SCENES) {
    const markup = render(createRenderScene(name));
    const visible = markup.replace(/<defs>[\s\S]*?<\/defs>/g, '');
    scenes[name] = {
      reported: Number(markup.match(/data-sprite-count="(\d+)"/)[1]),
      mandatory: Number(markup.match(/data-mandatory-sprite-count="(\d+)"/)[1]),
      actualImages: (visible.match(/<image\b/g) ?? []).length,
      silhouetteImages: (visible.match(/data-sprite="silhouette"/g) ?? []).length,
      omitted: Number(markup.match(/data-sprites-omitted="(\d+)"/)[1]),
      markupBytes: Buffer.byteLength(markup),
    };
  }
  const summary = (samples) => {
    const ordered = [...samples].sort((a, b) => a - b);
    return {
      samples: samples.length,
      medianMs: ordered[Math.floor(ordered.length / 2)],
      p95Ms: ordered[Math.ceil(ordered.length * 0.95) - 1],
      maxMs: ordered.at(-1),
    };
  };
  const fixture = createRenderScene('worst');
  for (let i = 0; i < 20; i++) render(fixture);
  const renderSamples = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    render(fixture);
    renderSamples.push(performance.now() - start);
  }
  const bounds = {
    left: 0,
    top: 0,
    right: assets.W,
    bottom: assets.H,
    width: assets.W,
    height: assets.H,
  };
  let view = { left: 1036, top: 490, width: 1000, height: 700 };
  const cameraSamples = [];
  for (let batch = 0; batch < 100; batch++) {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      view = camera.panBattlefieldViewport(view, { x: i % 2 ? 4 : -4, y: i % 2 ? 3 : -3 }, bounds);
      view = camera.zoomBattlefieldViewport(
        view,
        bounds,
        { x: view.left + view.width / 2, y: view.top + view.height / 2 },
        i % 2 ? 1.2 : 1 / 1.2,
      );
    }
    cameraSamples.push((performance.now() - start) / 1000);
  }
  const report = {
    node: process.version,
    cap: Number(render(fixture).match(/data-sprite-cap="(\d+)"/)[1]),
    scenery: {
      campPieces: assets.CAMP.length,
      campSlices: assets.CAMP.reduce(
        (n, s) =>
          n +
          geometry.sliceObject(assets.FRAME, {
            id: s.id,
            kind: s.kind,
            cells: s.cells,
            height: s.height,
            bbox: s.rect,
          }).length,
        0,
      ),
      cityObjects: assets.MAP.objects.length,
      citySlices: assets.MAP.objects.reduce(
        (n, o) => n + geometry.sliceObject(assets.FRAME, o).length,
        0,
      ),
    },
    scenes,
    fullSceneSSR: { warmups: 20, ...summary(renderSamples) },
    cameraMathPanZoomPair: { pairs: 100000, ...summary(cameraSamples) },
    limitations:
      'SSR is a full rebuild, not an actual pan/zoom update. Camera math excludes React, DOM, image decode, SVG masks, filters, rasterization, GPU, and frame scheduling.',
  };
  await mkdir('.artifacts/siege', { recursive: true });
  await writeFile(
    '.artifacts/siege/L2-render-measurements.json',
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await vite.close();
}
