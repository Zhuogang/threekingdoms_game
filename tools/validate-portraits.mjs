import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { portraitRoster } from './portrait-roster.mjs';

const spec = JSON.parse(await fs.readFile('tools/portrait-spec.json', 'utf8'));
const root = 'public/assets/portraits';
const manifest = JSON.parse(await fs.readFile(path.join(root, 'credits.json'), 'utf8'));
const ids = spec.officers.map((row) => row[0]).sort();
const { officers, identities } = await portraitRoster();
const namedIds = [...officers.keys()].sort();
const expectedIds = [...namedIds, 'garrison'].sort();
if (JSON.stringify(ids) !== JSON.stringify(expectedIds))
  throw new Error(
    'Portrait specification must cover the union of both scenario rosters plus garrison.',
  );
if (JSON.stringify(Object.keys(identities).sort()) !== JSON.stringify(namedIds))
  throw new Error('Portrait identities do not match the union of scenario rosters.');
if (JSON.stringify(manifest.entries.map((e) => e.id).sort()) !== JSON.stringify(expectedIds))
  throw new Error(
    `Portrait coverage must be exactly ${officers.size} named officers plus garrison.`,
  );
for (const [id, officer] of officers) {
  const identity = identities[id];
  if (
    identity.name !== officer.name ||
    identity.chinese !== officer.chinese ||
    identity.portraitKey !== id
  )
    throw new Error(`Scenario and portrait identity disagree: ${id}`);
}
let total = 0;
const hashes = new Set();
function dimensions(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP')
    throw new Error('Invalid WebP signature');
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const type = buffer.toString('ascii', offset, offset + 4),
      length = buffer.readUInt32LE(offset + 4),
      data = offset + 8;
    if (type === 'VP8 ')
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
      };
    if (type === 'VP8L') {
      const n = buffer.readUInt32LE(data + 1);
      return { width: (n & 0x3fff) + 1, height: ((n >>> 14) & 0x3fff) + 1 };
    }
    if (type === 'VP8X')
      return {
        width: buffer.readUIntLE(data + 4, 3) + 1,
        height: buffer.readUIntLE(data + 7, 3) + 1,
      };
    offset = data + length + (length % 2);
  }
  throw new Error('No WebP dimensions');
}
for (const entry of manifest.entries) {
  const [, name, chinese, surnameEn, surnameZh, age] = spec.officers.find(
    (row) => row[0] === entry.id,
  );
  if (
    entry.name !== name ||
    entry.chinese !== chinese ||
    entry.surnameEn !== surnameEn ||
    entry.surnameZh !== surnameZh ||
    entry.scenarioAge !== age
  )
    throw new Error(`Portrait brief and provenance disagree: ${entry.id}`);
  if (
    (entry.scenarioYear ?? 190) !==
    (spec.scenarioYears?.[entry.id] ?? spec.defaultScenarioYear ?? 190)
  )
    throw new Error(`Wrong portrait scenario year: ${entry.id}`);
  if (!entry.prompt || !entry.creator || !entry.rights || !entry.created || !entry.sourceAsset)
    throw new Error(`Incomplete provenance: ${entry.id}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.created))
    throw new Error(`Invalid creation date: ${entry.id}`);
  const expectedFiles = [`${entry.id}-small.webp`, `${entry.id}.webp`].sort();
  if (JSON.stringify(entry.files.map((file) => file.file).sort()) !== JSON.stringify(expectedFiles))
    throw new Error(`Missing or unexpected rendition: ${entry.id}`);
  for (const file of entry.files) {
    if (path.basename(file.file) !== file.file) throw new Error('Unsafe asset path');
    const bytes = await fs.readFile(path.join(root, file.file));
    const size = dimensions(bytes);
    const expected = file.file.endsWith('-small.webp') ? 128 : 256;
    if (
      size.width !== expected ||
      size.height !== expected ||
      file.width !== expected ||
      file.height !== expected
    )
      throw new Error(`Wrong dimensions: ${file.file}`);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== file.sha256 || bytes.length !== file.bytes)
      throw new Error(`Manifest mismatch: ${file.file}`);
    if (hashes.has(hash)) throw new Error(`Duplicate portrait bytes: ${file.file}`);
    hashes.add(hash);
    total += bytes.length;
  }
}
if (total > 3.5 * 1024 * 1024) throw new Error(`Portrait payload over 3.5 MiB: ${total}`);
console.log(
  `PASS: ${officers.size} distinct named mappings + garrison, ${hashes.size} valid WebP renditions, ${(total / 1024 / 1024).toFixed(2)} MiB; scenario coverage/provenance/checksums complete. Human contact-sheet review additionally required.`,
);
