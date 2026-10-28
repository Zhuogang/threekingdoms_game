/** Pack generated icons without altering their subjects; preserve alpha and keep sources. */
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const sharp = require(
  process.env.HEGEMONY_IMAGE_NODE_MODULES
    ? join(process.env.HEGEMONY_IMAGE_NODE_MODULES, 'sharp')
    : 'sharp',
);
const manifestPath = 'docs/v0.3/assets/units-count-ink-04.json';
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const previewOnly = process.argv.includes('--preview');
if (!previewOnly && manifest.entries.length !== 14)
  throw new Error('All fourteen icons are required.');
const entries = [];
const sprites = new Map();
for (const entry of manifest.entries) {
  if (entry.reuse) {
    entries.push({ ...entry.reuse, key: entry.key });
    continue;
  }
  const source = resolve(entry.path);
  let sprite = sprites.get(source);
  if (!sprite) {
    const { data, info } = await sharp(source)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let left = info.width,
      top = info.height,
      right = -1,
      bottom = -1,
      transparent = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3];
        if (alpha === 0) transparent++;
        if (alpha <= 16) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    if (right < left || transparent < info.width * info.height * 0.1)
      throw new Error(`${entry.key}: empty icon or missing transparent background.`);
    const size = manifest.canvasSize;
    const fitted = await sharp(source)
      .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
      .resize({
        width: Math.floor(size * manifest.personScale),
        height: Math.floor(size * manifest.personScale),
        fit: 'inside',
      })
      .toBuffer({ resolveWithObject: true });
    sprite = {
      ...fitted,
      crop: [left, top, right + 1, bottom + 1],
      hash: createHash('sha256').update(fitted.data).digest('hex'),
    };
    sprites.set(source, sprite);
  }
  const size = manifest.canvasSize;
  const path = `assets/v03/units/${entry.key}-ink-04.webp`;
  const target = join('public', path);
  await mkdir(dirname(target), { recursive: true });
  const instances = entry.layout.map(({ x, y }) => ({
    input: sprite.data,
    left: Math.round(size * x - sprite.info.width / 2),
    top: Math.round(size * y - sprite.info.height / 2),
  }));
  if (
    instances.some(
      ({ left, top }) =>
        left < 0 || top < 0 || left + sprite.info.width > size || top + sprite.info.height > size,
    )
  )
    throw new Error(`${entry.key}: fixed-size person would be clipped.`);
  const packed = await sharp({
    create: { width: size, height: size, channels: 4, background: '#00000000' },
  })
    .composite(instances)
    .webp({ lossless: true })
    .toBuffer();
  await writeFile(target, packed);
  entries.push({
    key: entry.key,
    source: entry.path,
    path,
    sourceCrop: sprite.crop,
    count: entry.layout.length,
    layout: entry.layout,
    personSize: [sprite.info.width, sprite.info.height],
    personSha256: sprite.hash,
    promptId: manifest.id,
    width: size,
    height: size,
    sha256: createHash('sha256').update(packed).digest('hex'),
  });
}
const output = previewOnly
  ? '.artifacts/unit-icons-04-preview.json'
  : 'docs/v0.3/assets/unit-squads-runtime.json';
await mkdir(dirname(output), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    {
      sourceManifest: 'units-count-ink-04.json',
      scope:
        'One person below 500 troops; three identical-scale instances at 500+. Both use the same single-person sprite and canvas size. Level and vessel selection rules are unchanged.',
      entries,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Packed ${entries.length} transparent icons; metadata: ${output}`);
