import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const sharp = require(process.env.PORTRAIT_SHARP_PATH || 'sharp');
const root = 'docs/assets/v0.3-portraits';
const specPath = `${root}/three_kingdoms_portrait_master_assets_98.json`;
const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
const review = JSON.parse(await fs.readFile('tools/portrait-v03-review.json', 'utf8'));
const legacy = JSON.parse(await fs.readFile('public/assets/portraits/credits.json', 'utf8'));
const output = 'public/assets/v03/portraits';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const entries = [];
const pending = [];
if (spec.spec_rows.length !== 98 || new Set(spec.spec_rows.map((r) => r.id)).size !== 98)
  throw new Error('Expected exactly 98 unique specification rows.');

for (const row of spec.spec_rows) {
  const runtimeId = review.aliases[row.id] ?? row.id;
  const old = legacy.entries.find((entry) => entry.id === runtimeId);
  const revised = review.revised.includes(row.id);
  const entry = {
    id: row.id,
    runtimeId,
    chinese: row.name_zh,
    faction: row.faction,
    ageImpression: row.age,
    signature: row.signature,
    status: revised ? 'revised' : old ? 'reused' : 'new',
    reviewReason:
      review.notes[row.id] ??
      (old
        ? 'Existing portrait retains the required identity cues.'
        : 'Missing portrait generated from the v0.3 brief.'),
  };
  if (old && !revised) {
    if (old.chinese !== row.name_zh) throw new Error(`Identity mismatch: ${row.id}`);
    entry.provenance = { manifest: 'assets/portraits/credits.json', id: old.id };
    entry.files = [];
    for (const file of old.files) {
      const bytes = await fs.readFile(`public/assets/portraits/${file.file}`);
      if (hash(bytes) !== file.sha256 || bytes.length !== file.bytes)
        throw new Error(`Retained portrait changed: ${file.file}`);
      entry.files.push({ ...file, path: `assets/portraits/${file.file}` });
    }
  } else {
    const recordPath = `${root}/generated/${row.id}.json`;
    const record = JSON.parse(await fs.readFile(recordPath, 'utf8'));
    if (
      record.id !== row.id ||
      !record.prompt ||
      !record.created ||
      !Array.isArray(record.references)
    )
      throw new Error(`Incomplete generation record: ${row.id}`);
    const source = await fs.readFile(record.path);
    const size = await sharp(source).metadata();
    if (size.width !== size.height || size.width < 1024)
      throw new Error(`Expected individual square HD original: ${row.id}`);
    entry.provenance = {
      ...record,
      sourceSha256: hash(source),
      width: size.width,
      height: size.height,
    };
    entry.files = [];
    for (const [suffix, pixels, quality] of [
      ['-small', 128, 82],
      ['', 256, 87],
    ]) {
      const file = `${row.id}${suffix}.webp`;
      const bytes = await sharp(source)
        .resize(pixels, pixels, { fit: 'contain' })
        .webp({ quality, effort: 6 })
        .toBuffer();
      const dest = `${output}/${file}`;
      try {
        const existing = await fs.readFile(dest);
        if (hash(existing) !== hash(bytes))
          throw new Error(`Refusing to overwrite different rendition: ${dest}`);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        pending.push({ dest, bytes });
      }
      entry.files.push({
        file,
        path: `assets/v03/portraits/${file}`,
        width: pixels,
        height: pixels,
        bytes: bytes.length,
        sha256: hash(bytes),
      });
    }
  }
  entries.push(entry);
}

await fs.mkdir(output, { recursive: true });
for (const { dest, bytes } of pending) await fs.writeFile(dest, bytes, { flag: 'wx' });
const counts = Object.fromEntries(
  ['reused', 'revised', 'new'].map((status) => [
    status,
    entries.filter((e) => e.status === status).length,
  ]),
);
const manifest = {
  version: 1,
  title: '三国霸业 v0.3 全98人头像资源',
  promptSet: specPath,
  created: '2026-10-22',
  counts,
  description:
    'Original imagined historical illustrations. Built-in OpenAI image_gen. Existing compliant renditions reused byte-for-byte; separate v0.3 variants preserve historical 190/200 scenario portraits. Generated output subject to applicable creation-service terms.',
  pathConvention:
    'Rendition paths are relative to public/. Reused originals remain in assets/portraits/. New and revised artwork is in assets/v03/portraits/.',
  entries,
};
await fs.writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
const escape = (v) =>
  String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const layers = [];
const labels = [];
for (const [index, entry] of entries.entries()) {
  const x = (index % 10) * 180,
    y = Math.floor(index / 10) * 214;
  const image = entry.files.find((f) => f.width === 256);
  layers.push({
    input: await sharp(`public/${image.path}`).resize(160, 160).toBuffer(),
    left: x + 10,
    top: y + 6,
  });
  labels.push(
    `<g transform="translate(${x},${y})"><text x="90" y="185" text-anchor="middle" font-size="16">${escape(entry.chinese)}</text><text x="90" y="203" text-anchor="middle" font-size="11">${entry.id} · ${entry.status}</text></g>`,
  );
}
const height = Math.ceil(entries.length / 10) * 214;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="${height}"><g font-family="Microsoft YaHei,Segoe UI,sans-serif" fill="#29352c">${labels.join('')}</g></svg>`;
await sharp({ create: { width: 1800, height, channels: 3, background: '#eee6d5' } })
  .composite([...layers, { input: Buffer.from(svg), left: 0, top: 0 }])
  .jpeg({ quality: 93 })
  .toFile(`${root}/officer-headshots-98.jpg`);
const rows = entries.map(
  (e) => `| ${e.id} | ${e.chinese} | ${e.status} | ${e.files.find((f) => f.width === 256).path} |`,
);
await fs.writeFile(
  `${root}/asset-inventory.md`,
  `# v0.3 武将头像交付清单\n\n覆盖 98/98 人：复用 ${counts.reused} 人，新生成 ${counts.new} 人，修订 ${counts.revised} 人。每人均有 256×256 和 128×128 WebP。\n\n原有剧本资源不覆盖；符合规范的图片按字节复用。新图与修订图位于 public/assets/v03/portraits/，高清 PNG 与实际提示词、引用记录位于本目录 generated/。所有生成均使用内置 image_gen。\n\n完整记录：[manifest](../../../public/assets/v03/portraits/manifest.json)。人物特征与基础提示词：[98 人规范](three_kingdoms_portrait_master_assets_98.json)。修订依据：[审查记录](../../../tools/portrait-v03-review.json)。总览：[98 人头像](officer-headshots-98.jpg)。\n\n规范 ID zumao 对应旧游戏 ID zuzhao（祖茂），mateng 对应 maliang（马腾）；马良使用 maliang_shu。运行时路径以 manifest.entries[].files[].path 为准，相对于 public/。此交付补齐图片资源，不新增剧本人物或改动存档 ID。\n\n重新导出：设置 PORTRAIT_SHARP_PATH 后运行 node tools/prepare-portraits-v03.mjs；校验运行 node tools/validate-portraits-v03.mjs。\n\n| 规范 ID | 人物 | 处理 | 256px 资源（相对 public/） |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n`,
);
console.log(
  `Prepared v0.3 portraits: ${JSON.stringify(counts)}; ${entries.length * 2} renditions indexed.`,
);
