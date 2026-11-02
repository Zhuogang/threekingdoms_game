import { chromium } from '@playwright/test';
import { mkdir, readFile, rm, writeFile as writeFileNow } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Grows the S2-01 full-map painting (docs/siege/01-chencang-art-plan.md §9.2)
// one step at a time:
//   node tools/compose-siege-map.mjs
// It reads steps.json (written by tools/build-siege-blockout.mjs), starts from
// the block-out with the S1-01 city painting pasted in, and blends in every
// chosen step. For the first open step it writes inputs/<step>.png, the edit
// target to upload: the map so far, with block-out where that step paints.
// It also writes the progress image composite.webp (100%) and preview.webp
// (50%). Chrome does the image work, as in build-battlefield-canvas.mjs.
const DIR = 'docs/siege/chencang/art/s2-01-full-map';
// An edit repaints the finished part slightly; each result is shifted by the
// offset (within ±SEARCH px) that best matches the map before it is blended.
const SEARCH = 8;

// Writes only changed files, retrying briefly: on Windows another process
// (indexer, antivirus, an open viewer) sometimes holds a file for a moment.
async function writeFile(path, content) {
  const next = Buffer.from(content);
  const previous = await readFile(path).catch(() => null);
  if (previous?.equals(next)) return;
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      return await writeFileNow(path, next);
    } catch (error) {
      if (attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}

const MIME = { png: 'image/png', webp: 'image/webp' };
async function dataUrl(path) {
  const type = MIME[path.split('.').pop()];
  if (!type) throw new Error(`Unsupported image: ${path}`);
  return `data:${type};base64,${(await readFile(join(DIR, path))).toString('base64')}`;
}

const manifest = JSON.parse(await readFile(join(DIR, 'steps.json'), 'utf8'));
const job = {
  canvas: manifest.canvas,
  search: SEARCH,
  blockout: await dataUrl(manifest.blockout),
  base: { ...manifest.base, url: await dataUrl(manifest.base.source) },
  steps: [],
};
for (const step of manifest.steps)
  job.steps.push({
    ...step,
    paintUrl: await dataUrl(step.paint),
    blendUrl: await dataUrl(step.blend),
    chosenUrl: step.chosen ? await dataUrl(step.chosen) : null,
  });

const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
let result;
try {
  const page = await browser.newPage();
  result = await page.evaluate(async (job) => {
    const pixels = async (url, size, label) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (image.naturalWidth !== size[0] || image.naturalHeight !== size[1])
        throw new Error(
          `${label} is ${image.naturalWidth}×${image.naturalHeight}, expected ${size.join('×')}`,
        );
      const canvas = new OffscreenCanvas(...size);
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, ...size).data;
    };
    const encode = async (data, size, type, quality, scale = 1) => {
      const source = new OffscreenCanvas(...size);
      source.getContext('2d').putImageData(new ImageData(data, ...size), 0, 0);
      const out = new OffscreenCanvas(size[0] * scale, size[1] * scale);
      const context = out.getContext('2d');
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, out.width, out.height);
      const blob = await out.convertToBlob({ type, quality });
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
    };
    const lum = (d, i) => d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;

    const [W, H] = job.canvas;
    const blockout = await pixels(job.blockout, job.canvas, 'blockout');
    const map = blockout.slice();
    const at = (x, y) => (y * W + x) * 4;
    {
      const [bx, by] = job.base.at;
      const size = [1536, 1024];
      const base = await pixels(job.base.url, size, job.base.source);
      for (let y = 0; y < size[1]; y++)
        map.set(base.subarray(y * size[0] * 4, (y + 1) * size[0] * 4), at(bx, by + y));
    }

    const log = [];
    let input = null;
    for (const step of job.steps) {
      const [ax, ay] = step.at;
      const [w, h] = step.size;
      const paint = await pixels(step.paintUrl, step.size, step.paint);
      const blend = await pixels(step.blendUrl, step.size, step.blend);
      if (!step.chosenUrl) {
        // The edit target: block-out where this step paints, the map elsewhere.
        const out = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const from = paint[i] ? blockout : map;
            out.set(from.subarray(at(ax + x, ay + y), at(ax + x, ay + y) + 4), i);
          }
        input = { id: step.id, path: step.input, png: await encode(out, step.size, 'image/png') };
        break;
      }
      const tile = await pixels(step.chosenUrl, step.size, step.chosen);
      // Best whole-tile offset over the part this step keeps (blend 0),
      // sampling every third pixel away from the edges.
      const r = job.search;
      const cost = (dx, dy) => {
        let sum = 0;
        let n = 0;
        for (let y = r; y < h - r; y += 3)
          for (let x = r; x < w - r; x += 3) {
            const i = (y * w + x) * 4;
            if (blend[i]) continue;
            sum += Math.abs(lum(tile, ((y + dy) * w + x + dx) * 4) - lum(map, at(ax + x, ay + y)));
            n++;
          }
        return n ? sum / n : 0;
      };
      let best = { dx: 0, dy: 0, cost: cost(0, 0) };
      const still = best.cost;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const c = cost(dx, dy);
          if (c < best.cost) best = { dx, dy, cost: c };
        }
      // Mean colour drift of the kept part after alignment, per channel.
      const drift = [0, 0, 0];
      let n = 0;
      for (let y = r; y < h - r; y += 3)
        for (let x = r; x < w - r; x += 3) {
          const i = (y * w + x) * 4;
          if (blend[i]) continue;
          const t = ((y + best.dy) * w + x + best.dx) * 4;
          const m = at(ax + x, ay + y);
          for (let c = 0; c < 3; c++) drift[c] += tile[t + c] - map[m + c];
          n++;
        }
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const a = blend[(y * w + x) * 4] / 255;
          if (!a) continue;
          const sx = Math.min(w - 1, Math.max(0, x + best.dx));
          const sy = Math.min(h - 1, Math.max(0, y + best.dy));
          const t = (sy * w + sx) * 4;
          const m = at(ax + x, ay + y);
          for (let c = 0; c < 3; c++) map[m + c] = map[m + c] * (1 - a) + tile[t + c] * a;
        }
      log.push({
        step: step.id,
        chosen: step.chosen,
        offset: [best.dx, best.dy],
        difference: Number(best.cost.toFixed(2)),
        differenceUnshifted: Number(still.toFixed(2)),
        drift: drift.map((d) => Number((d / Math.max(1, n)).toFixed(1))),
      });
    }
    return {
      log,
      input,
      composite: await encode(map, job.canvas, 'image/webp', 0.92),
      preview: await encode(map, job.canvas, 'image/webp', 0.9, 0.5),
    };
  }, job);
} finally {
  await browser.close();
}

for (const entry of result.log) console.log(JSON.stringify(entry));
await writeFile(join(DIR, 'composite.webp'), Buffer.from(result.composite, 'base64'));
await writeFile(join(DIR, 'preview.webp'), Buffer.from(result.preview, 'base64'));
// Only the next step's input stays, so an old one cannot be uploaded by mistake.
for (const step of manifest.steps)
  if (step.input !== result.input?.path) await rm(join(DIR, step.input), { force: true });
if (result.input) {
  await writeFile(join(DIR, result.input.path), Buffer.from(result.input.png, 'base64'));
  console.log(`next: step ${result.input.id}, upload ${join(DIR, result.input.path)}`);
} else console.log('all steps chosen: composite.webp is the full map');
