/** Inspect actual runtime sizes; enlarged art alone cannot establish icon readability. */
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require(
  process.env.HEGEMONY_IMAGE_NODE_MODULES
    ? join(process.env.HEGEMONY_IMAGE_NODE_MODULES, '@napi-rs/canvas')
    : '@napi-rs/canvas',
);
const manifest = JSON.parse(await readFile('docs/v0.3/assets/unit-squads-runtime.json', 'utf8'));
const labels = {
  infantry: '步兵',
  cavalry: '骑兵',
  archer: '弓兵',
  'heavy-infantry': '重步兵',
  'elite-cavalry': '精锐骑兵',
  'strong-archer': '强弓兵',
  'boat-transport': '载兵小船',
  warship: '楼船',
};
const singles = manifest.entries.filter((entry) => entry.count === 1);
const canvas = createCanvas(1200, singles.length * 170 + 100);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#eee8d8';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#292820';
ctx.font = 'bold 24px Microsoft YaHei';
ctx.fillText('1 人 / 3 人 · 每个人保持相同大小', 24, 38);
ctx.font = '17px Microsoft YaHei';
for (const [text, x] of [
  ['1人 40px', 240],
  ['3人 40px', 360],
  ['1人 56px', 500],
  ['3人 56px', 620],
  ['1人 112px', 800],
  ['3人 112px', 1000],
])
  ctx.fillText(text, x, 74);
for (const [index, entry] of singles.entries()) {
  const y = 100 + index * 170;
  ctx.fillStyle = index % 2 ? '#e2d9c3' : '#f4efdf';
  ctx.fillRect(12, y, 1176, 168);
  const family = entry.key.replace(/-small$/, '');
  ctx.fillStyle = '#292820';
  ctx.font = '20px Microsoft YaHei';
  ctx.fillText(labels[family], 24, y + 65);
  ctx.font = '14px Microsoft YaHei';
  ctx.fillText(family, 24, y + 92);
  const small = await loadImage(await readFile(join('public', entry.path)));
  const large = await loadImage(
    await readFile(
      join('public', manifest.entries.find((item) => item.key === family + '-large').path),
    ),
  );
  for (const [image, x, size] of [
    [small, 240, 40],
    [large, 360, 40],
    [small, 500, 56],
    [large, 620, 56],
    [small, 800, 112],
    [large, 1000, 112],
  ])
    ctx.drawImage(image, x, y + 24 + (112 - size) / 2, size, size);
}
const target = 'docs/v0.3/assets/units-count-ink-04-comparison.png';
await writeFile(target, canvas.toBuffer('image/png'));
console.log(target);
