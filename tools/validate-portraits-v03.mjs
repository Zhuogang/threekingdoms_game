import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require(process.env.PORTRAIT_SHARP_PATH || 'sharp');
const spec = JSON.parse(
  await fs.readFile(
    'docs/assets/v0.3-portraits/three_kingdoms_portrait_master_assets_98.json',
    'utf8',
  ),
);
const manifest = JSON.parse(await fs.readFile('public/assets/v03/portraits/manifest.json', 'utf8'));
const review = JSON.parse(await fs.readFile('tools/portrait-v03-review.json', 'utf8'));
const legacy = JSON.parse(await fs.readFile('public/assets/portraits/credits.json', 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(spec.spec_rows.length, 98);
assert.equal(new Set(manifest.entries.map((e) => e.id)).size, 98);
assert.deepEqual(manifest.entries.map((e) => e.id).sort(), spec.spec_rows.map((e) => e.id).sort());
const seen = new Set();
let payload = 0;
for (const entry of manifest.entries) {
  const row = spec.spec_rows.find((r) => r.id === entry.id);
  assert.equal(entry.chinese, row.name_zh);
  assert.equal(entry.runtimeId, review.aliases[row.id] ?? row.id);
  assert.equal(entry.ageImpression, row.age);
  assert.equal(entry.status === 'revised', review.revised.includes(entry.id));
  assert.deepEqual(
    entry.files.map((f) => f.width).sort((a, b) => a - b),
    [128, 256],
  );
  if (entry.status === 'reused') {
    const old = legacy.entries.find((e) => e.id === entry.runtimeId);
    assert.equal(old.chinese, entry.chinese);
    for (const file of entry.files)
      assert.equal(file.sha256, old.files.find((f) => f.file === file.file).sha256);
  } else {
    const provenance = entry.provenance;
    assert.ok(
      provenance.prompt && provenance.created && provenance.tool === 'OpenAI built-in image_gen',
    );
    const source = await fs.readFile(provenance.path);
    assert.equal(hash(source), provenance.sourceSha256);
    const size = await sharp(source).metadata();
    assert.ok(size.width >= 1024 && size.width === size.height);
    for (const reference of provenance.references) await fs.access(reference);
  }
  for (const file of entry.files) {
    assert.ok(
      file.path.startsWith('assets/portraits/') || file.path.startsWith('assets/v03/portraits/'),
    );
    assert.equal(path.posix.normalize(file.path), file.path);
    assert.ok(!file.path.includes('..'));
    const bytes = await fs.readFile(`public/${file.path}`);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal(metadata.width, file.width);
    assert.equal(metadata.height, file.height);
    assert.equal(bytes.length, file.bytes);
    assert.equal(hash(bytes), file.sha256);
    assert.ok(!seen.has(file.sha256), `Duplicate rendition: ${file.path}`);
    seen.add(file.sha256);
    payload += bytes.length;
  }
}
for (const status of ['new', 'reused', 'revised'])
  assert.equal(manifest.counts[status], manifest.entries.filter((e) => e.status === status).length);
assert.ok(payload < 3.5 * 1024 * 1024, `98-person payload exceeds 3.5 MiB: ${payload}`);
console.log(
  `PASS: 98 unique identities, ${seen.size} checked WebP renditions, ${(payload / 1024 / 1024).toFixed(2)} MiB; source provenance, reuse hashes and aliases verified.`,
);
