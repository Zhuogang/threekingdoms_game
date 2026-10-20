import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const spec = JSON.parse(await fs.readFile('tools/portrait-spec.json', 'utf8'));
const root = 'public/assets/portraits';
const manifest = JSON.parse(await fs.readFile(path.join(root, 'credits.json'), 'utf8'));
const ids = spec.officers.map((row) => row[0]).sort();
if (JSON.stringify(manifest.entries.map((e) => e.id).sort()) !== JSON.stringify(ids))
  throw new Error('Portrait coverage must be exactly 52 named officers plus garrison.');
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
  if (!entry.prompt || !entry.creator || !entry.rights || !entry.created || !entry.sourceAsset)
    throw new Error(`Incomplete provenance: ${entry.id}`);
  if (entry.files.length !== 2) throw new Error(`Missing rendition: ${entry.id}`);
  for (const file of entry.files) {
    if (path.basename(file.file) !== file.file) throw new Error('Unsafe asset path');
    const bytes = await fs.readFile(path.join(root, file.file));
    const size = dimensions(bytes);
    const expected = file.file.endsWith('-small.webp') ? 128 : 256;
    if (size.width !== expected || size.height !== expected)
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
  `PASS: 52 distinct named mappings + garrison, 106 valid WebP renditions, ${(total / 1024 / 1024).toFixed(2)} MiB; provenance/checksums complete. Human contact-sheet review additionally required.`,
);
