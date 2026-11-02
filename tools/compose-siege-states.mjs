import { chromium } from '@playwright/test';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Builds the S3 state variants (docs/siege/01-chencang-art-plan.md §9.2) on
// top of the approved S2-01 map:
//   node tools/compose-siege-states.mjs
// For every docs/siege/chencang/art/s3-*/job.json (written by
// tools/build-siege-blockout.mjs) and each of its states:
// - open state: writes inputs/<state>.png, the edit target to upload: the
//   map cropped at `crop`, with the state's block-out overlay pasted on;
// - chosen state: finds the chosen attempt's offset against the map (±SEARCH
//   px, over the part the state keeps), then writes patches/<state>.png (the
//   attempt under the blend mask, cut to its box), patches/<state>.json (where
//   it goes on the map) and previews/<state>.webp (map crop, before | after).
// Chrome does the image work, as in compose-siege-map.mjs.
const ART = 'docs/siege/chencang/art';
const SEARCH = 8;

const MIME = { png: 'image/png', webp: 'image/webp' };
async function dataUrl(path) {
  const type = MIME[path.split('.').pop()];
  if (!type) throw new Error(`Unsupported image: ${path}`);
  return `data:${type};base64,${(await readFile(path)).toString('base64')}`;
}

const jobs = [];
for (const name of (await readdir(ART)).filter((n) => n.startsWith('s3-')).sort()) {
  const dir = join(ART, name);
  const job = JSON.parse(await readFile(join(dir, 'job.json'), 'utf8').catch(() => 'null'));
  if (!job) continue;
  const states = [];
  for (const s of job.states)
    states.push({
      ...s,
      paintUrl: await dataUrl(join(dir, s.paint)),
      blendUrl: await dataUrl(join(dir, s.blend)),
      overlayUrl: s.overlay ? await dataUrl(join(dir, s.overlay)) : null,
      chosenUrl: s.chosen ? await dataUrl(join(dir, s.chosen)) : null,
    });
  jobs.push({
    dir,
    canvas: job.canvas,
    crop: job.crop,
    mapUrl: await dataUrl(join(dir, job.map)),
    states,
  });
}

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
const results = [];
try {
  const page = await browser.newPage();
  for (const job of jobs)
    results.push(
      await page.evaluate(
        async ({ job, search }) => {
          const pixels = async (url, label, size) => {
            const image = new Image();
            image.src = url;
            await image.decode();
            if (size && (image.naturalWidth !== size[0] || image.naturalHeight !== size[1]))
              throw new Error(
                `${label} is ${image.naturalWidth}×${image.naturalHeight}, expected ${size.join('×')}`,
              );
            const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            return {
              w: image.naturalWidth,
              h: image.naturalHeight,
              data: context.getImageData(0, 0, image.naturalWidth, image.naturalHeight).data,
            };
          };
          const encode = async (data, w, h, type, quality) => {
            const canvas = new OffscreenCanvas(w, h);
            canvas.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0);
            const blob = await canvas.convertToBlob({ type, quality });
            return new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.readAsDataURL(blob);
            });
          };
          const lum = (d, i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;

          const [w, h] = job.canvas;
          const [cx, cy] = job.crop;
          const map = await pixels(job.mapUrl, 'map');
          const base = new Uint8ClampedArray(w * h * 4);
          for (let y = 0; y < h; y++)
            base.set(
              map.data.subarray(((cy + y) * map.w + cx) * 4, ((cy + y) * map.w + cx + w) * 4),
              y * w * 4,
            );

          const out = [];
          for (const s of job.states) {
            const blend = (await pixels(s.blendUrl, s.blend, job.canvas)).data;
            if (!s.chosenUrl) {
              const input = base.slice();
              if (s.overlayUrl) {
                const overlay = (await pixels(s.overlayUrl, s.overlay, job.canvas)).data;
                for (let i = 0; i < input.length; i += 4)
                  if (overlay[i + 3] > 127) input.set(overlay.subarray(i, i + 3), i);
              }
              out.push({ id: s.id, input: s.input, png: await encode(input, w, h, 'image/png') });
              continue;
            }
            const tile = (await pixels(s.chosenUrl, s.chosen, job.canvas)).data;
            // Best whole-image offset over the part this state keeps (blend 0),
            // sampling every third pixel away from the edges.
            const cost = (dx, dy) => {
              let sum = 0;
              let n = 0;
              for (let y = search; y < h - search; y += 3)
                for (let x = search; x < w - search; x += 3) {
                  const i = (y * w + x) * 4;
                  if (blend[i]) continue;
                  sum += Math.abs(lum(tile, ((y + dy) * w + x + dx) * 4) - lum(base, i));
                  n++;
                }
              return n ? sum / n : 0;
            };
            let best = { dx: 0, dy: 0, cost: cost(0, 0) };
            const still = best.cost;
            for (let dy = -search; dy <= search; dy++)
              for (let dx = -search; dx <= search; dx++) {
                const c = cost(dx, dy);
                if (c < best.cost) best = { dx, dy, cost: c };
              }
            // How much the painting inside the blend area changed (it should).
            let changed = 0;
            let inside = 0;
            let [x0, y0, x1, y1] = [w, h, -1, -1];
            for (let y = 0; y < h; y++)
              for (let x = 0; x < w; x++)
                if (blend[(y * w + x) * 4]) {
                  [x0, y0, x1, y1] = [
                    Math.min(x0, x),
                    Math.min(y0, y),
                    Math.max(x1, x + 1),
                    Math.max(y1, y + 1),
                  ];
                  if (blend[(y * w + x) * 4] === 255) {
                    const sx = Math.min(w - 1, Math.max(0, x + best.dx));
                    const sy = Math.min(h - 1, Math.max(0, y + best.dy));
                    changed += Math.abs(lum(tile, (sy * w + sx) * 4) - lum(base, (y * w + x) * 4));
                    inside++;
                  }
                }
            const pw = x1 - x0;
            const ph = y1 - y0;
            const patch = new Uint8ClampedArray(pw * ph * 4);
            const after = base.slice();
            for (let y = y0; y < y1; y++)
              for (let x = x0; x < x1; x++) {
                const a = blend[(y * w + x) * 4];
                if (!a) continue;
                const sx = Math.min(w - 1, Math.max(0, x + best.dx));
                const sy = Math.min(h - 1, Math.max(0, y + best.dy));
                const t = (sy * w + sx) * 4;
                patch.set([tile[t], tile[t + 1], tile[t + 2], a], ((y - y0) * pw + x - x0) * 4);
                const i = (y * w + x) * 4;
                for (let c = 0; c < 3; c++)
                  after[i + c] = base[i + c] * (1 - a / 255) + tile[t + c] * (a / 255);
              }
            // Preview: the patch area with a margin, before above after.
            const m = 48;
            const [vx0, vy0] = [Math.max(0, x0 - m), Math.max(0, y0 - m)];
            const [vx1, vy1] = [Math.min(w, x1 + m), Math.min(h, y1 + m)];
            const vw = vx1 - vx0;
            const vh = vy1 - vy0;
            const preview = new Uint8ClampedArray(vw * (vh * 2 + 8) * 4).fill(255);
            for (let y = 0; y < vh; y++) {
              preview.set(
                base.subarray(((vy0 + y) * w + vx0) * 4, ((vy0 + y) * w + vx1) * 4),
                y * vw * 4,
              );
              preview.set(
                after.subarray(((vy0 + y) * w + vx0) * 4, ((vy0 + y) * w + vx1) * 4),
                (vh + 8 + y) * vw * 4,
              );
            }
            out.push({
              id: s.id,
              chosen: s.chosen,
              patchPath: s.patch,
              patch: await encode(patch, pw, ph, 'image/png'),
              info: {
                state: s.id,
                chosen: s.chosen,
                at: [cx + x0, cy + y0],
                size: [pw, ph],
                offset: [best.dx, best.dy],
                difference: Number(best.cost.toFixed(2)),
                differenceUnshifted: Number(still.toFixed(2)),
                changeInside: Number((changed / Math.max(1, inside)).toFixed(1)),
                ...(s.cells ? { cells: s.cells } : {}),
              },
              preview: await encode(preview, vw, vh * 2 + 8, 'image/webp', 0.92),
            });
          }
          return out;
        },
        { job, search: SEARCH },
      ),
    );
} finally {
  await browser.close();
}

const write = async (path, content) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
};
for (const [k, job] of jobs.entries())
  for (const r of results[k]) {
    if (r.png) {
      await write(join(job.dir, r.input), Buffer.from(r.png, 'base64'));
      console.log(`${job.dir.split('/').pop()} ${r.id}: upload ${join(job.dir, r.input)}`);
      continue;
    }
    // A chosen state keeps no input, so an old one cannot be uploaded by mistake.
    await rm(join(job.dir, `inputs/${r.id}.png`), { force: true });
    await write(join(job.dir, r.patchPath), Buffer.from(r.patch, 'base64'));
    await write(
      join(job.dir, r.patchPath.replace(/\.png$/, '.json')),
      `${JSON.stringify(r.info, null, 2)}\n`,
    );
    await write(join(job.dir, `previews/${r.id}.webp`), Buffer.from(r.preview, 'base64'));
    const { offset, difference, changeInside, at, size } = r.info;
    console.log(
      `${job.dir.split('/').pop()} ${r.id}: ${r.chosen} offset ${offset} difference ${difference} change ${changeInside} → patch ${size.join('×')} at ${at}`,
    );
  }
