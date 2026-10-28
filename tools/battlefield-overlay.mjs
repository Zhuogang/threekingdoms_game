import { chromium } from '@playwright/test';
import { readFile, writeFile, readdir } from 'node:fs/promises';

// Alignment check for a painted battlefield: draws the painting, the colour
// layout at partial opacity and the 48×32 grid with every 4th line numbered,
// and writes a PNG for review.
//   node tools/battlefield-overlay.mjs <out-dir> <battlefield-id>[:attempt][@x0,y0,x1,y1] ...
// Without an attempt, the newest one in the folder is used. With a cell range,
// only those cells are drawn, at 3× zoom. OVERLAY_OPACITY sets the layout's opacity.
const [outDir, ...targets] = process.argv.slice(2);
if (!outDir || !targets.length)
  throw new Error('Usage: node tools/battlefield-overlay.mjs <out-dir> <id>[:attempt] ...');

const dataUrl = async (path) =>
  `data:image/${path.endsWith('.png') ? 'png' : 'webp'};base64,${(await readFile(path)).toString('base64')}`;
const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
try {
  const page = await browser.newPage();
  for (const target of targets) {
    const [spec, crop] = target.split('@');
    const [id, requested] = spec.split(':');
    const [cx0, cy0, cx1, cy1] = crop ? crop.split(',').map(Number) : [0, 0, 47, 31];
    const folder = `docs/v0.3/battlefield-art/${id}`;
    const attempts = (await readdir(`${folder}/attempts`))
      .filter((name) => /^v\d+\.(webp|png)$/.test(name))
      .sort((a, b) => Number(b.match(/\d+/)[0]) - Number(a.match(/\d+/)[0]));
    const attempt = requested
      ? attempts.find((name) => name.startsWith(`${requested}.`))
      : attempts[0];
    if (!attempt) throw new Error(`${id}: no attempt ${requested ?? ''}`);
    const base64 = await page.evaluate(
      async ({ painting, layout, opacity, cx0, cy0, cx1, cy1 }) => {
        const load = async (src) => {
          const image = new Image();
          image.src = src;
          await image.decode();
          return image;
        };
        const [art, guide] = await Promise.all([load(painting), load(layout)]);
        const zoom = cx1 - cx0 < 47 ? 3 : 1;
        const cell = 32 * zoom;
        const columns = cx1 - cx0 + 1;
        const rows = cy1 - cy0 + 1;
        const canvas = document.createElement('canvas');
        canvas.width = columns * cell;
        canvas.height = rows * cell;
        const context = canvas.getContext('2d');
        const source = [cx0 * 32, cy0 * 32, columns * 32, rows * 32];
        context.drawImage(art, ...source, 0, 0, canvas.width, canvas.height);
        context.globalAlpha = opacity;
        context.drawImage(guide, ...source, 0, 0, canvas.width, canvas.height);
        context.globalAlpha = 1;
        context.strokeStyle = 'rgba(0,0,0,0.35)';
        context.lineWidth = 1;
        for (let x = 0; x <= columns; x++) {
          context.beginPath();
          context.moveTo(x * cell + 0.5, 0);
          context.lineTo(x * cell + 0.5, canvas.height);
          context.stroke();
        }
        for (let y = 0; y <= rows; y++) {
          context.beginPath();
          context.moveTo(0, y * cell + 0.5);
          context.lineTo(canvas.width, y * cell + 0.5);
          context.stroke();
        }
        context.font = 'bold 13px sans-serif';
        context.fillStyle = '#000';
        const step = zoom > 1 ? 1 : 4;
        for (let x = 0; x < columns; x += step) context.fillText(String(cx0 + x), x * cell + 3, 13);
        for (let y = step; y < rows; y += step) context.fillText(String(cy0 + y), 3, y * cell + 13);
        return canvas.toDataURL('image/png').split(',')[1];
      },
      {
        painting: await dataUrl(`${folder}/attempts/${attempt}`),
        layout: await dataUrl(`${folder}/layout.png`),
        opacity: Number(process.env.OVERLAY_OPACITY ?? 0.42),
        cx0,
        cy0,
        cx1,
        cy1,
      },
    );
    const out = `${outDir}/${id}-${attempt.replace(/\.\w+$/, '')}${crop ? `-${crop.replaceAll(',', '_')}` : ''}-overlay.png`;
    await writeFile(out, Buffer.from(base64, 'base64'));
    console.log(out);
  }
} finally {
  await browser.close();
}
