import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const sharp = require(process.env.PORTRAIT_SHARP_PATH || 'sharp');
const spec = JSON.parse(await fs.readFile('tools/portrait-spec.json', 'utf8'));
const initial = JSON.parse(await fs.readFile('.artifacts/portrait-sources-initial.json', 'utf8'));
const sources = new Map(initial.map((item) => [item.id, item.path]));
for (const name of await fs.readdir('.artifacts')) {
  if (/^portrait-source-.+\.json$/.test(name)) {
    const item = JSON.parse(await fs.readFile(path.join('.artifacts', name), 'utf8'));
    sources.set(item.id, item.path);
  }
}
const output = 'public/assets/portraits';
await fs.mkdir(output, { recursive: true });
await fs.mkdir('docs/assets', { recursive: true });
await fs.mkdir('docs/images', { recursive: true });
const entries = [];
for (const [id, name, chinese, surnameEn, surnameZh, age, brief] of spec.officers) {
  const source = sources.get(id);
  if (!source) continue;
  const files = [];
  for (const [suffix, size, quality] of [
    ['-small', 128, 82],
    ['', 256, 87],
  ]) {
    const filename = `${id}${suffix}.webp`;
    const dest = path.join(output, filename);
    const inputStat = await fs.stat(source);
    let existing = null;
    try {
      existing = await fs.stat(dest);
    } catch {
      /* not prepared yet */
    }
    if (!existing || existing.mtimeMs < inputStat.mtimeMs) {
      await sharp(source)
        .resize(size, size, { fit: 'contain', background: '#e9e0ca' })
        .webp({ quality, effort: 6 })
        .toFile(dest);
    }
    const bytes = await fs.readFile(dest);
    files.push({
      file: filename,
      width: size,
      height: size,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
  }
  entries.push({
    id,
    name,
    chinese,
    surnameEn,
    surnameZh,
    scenarioAge: age,
    kind: 'original-generated-illustration',
    creator: 'OpenAI built-in image_gen, directed for this project',
    created: '2026-10-19',
    model: 'Not exposed by the built-in tool',
    rights:
      'Original AI-generated project artwork. No third-party portrait was reused; no public-domain or authenticated-likeness claim is made.',
    sourceAsset: path.basename(source),
    prompt: spec.artDirection + `${name} (${chinese}), age ${age} in 190 AD. ${brief}.`,
    modifications:
      'Square contain resize to 256 and 128 pixels; WebP compression. No facial editing or substitution.',
    files,
  });
}
const credits = {
  version: 1,
  title: 'Officer portrait provenance / 武将头像来源',
  description:
    'Original imagined historical depictions created for this project with the built-in image_gen tool. These are artistic interpretations, not authenticated contemporary likenesses. No commercial game portraits or third-party portrait scans were reused.',
  descriptionZh:
    '本项目使用内置 image_gen 工具创作的历史人物艺术想象，并非经考证的同时代真实肖像。未使用商业游戏头像或第三方肖像扫描图。',
  rightsStatement:
    'Original generated project assets; applicable creation-service terms govern the generated output. This manifest does not assert a historical public-domain source or invent a third-party license.',
  promptSet: 'tools/portrait-spec.json',
  entries,
};
await fs.writeFile(path.join(output, 'credits.json'), JSON.stringify(credits, null, 2) + '\n');
const rows = entries.map(
  (e) =>
    `| \`${e.id}\` | ${e.name} / ${e.chinese} | ${e.scenarioAge} | Original generated illustration | \`${e.id}.webp\` |`,
);
await fs.writeFile(
  'docs/assets/portrait-credits.md',
  `# Officer portrait credits / 武将头像来源\n\n${credits.description}\n\n${credits.descriptionZh}\n\nCreated October 19, 2026 with OpenAI's built-in image_gen tool; the tool did not expose a model identifier. All portraits were commissioned through original project prompts, with no reference image input. Names identify imagined depictions, not authenticated likenesses. No public-domain historical image or commercial game portrait is claimed as a source. Generated-output use is subject to the applicable creation-service terms; no third-party image license is invented here.\n\nThe complete art direction and per-person briefs are in [the prompt set](../../tools/portrait-spec.json). Runtime provenance, individual prompts, generated-source filenames, dimensions, byte counts, and SHA256 checksums are in [the bundled manifest](../../public/assets/portraits/credits.json). Only resize and WebP compression were applied to the generated originals. Original generated PNGs remain in the tool's output directory; the project contains the final local delivery renditions.\n\nProgress: **${entries.filter((x) => x.id !== 'garrison').length}/52 named officers**, plus ${entries.some((x) => x.id === 'garrison') ? 1 : 0}/1 garrison. Fallbacks do not count as portrait coverage.\n\n| Stable ID | Depicted person | Scenario age | Provenance | Inspector file |\n| --- | --- | ---: | --- | --- |\n${rows.join('\n')}\n\nStable-ID exceptions are intentional: \`maliang\` is Ma Teng / 马腾; \`zuzhao\` is Zu Mao / 祖茂. Never infer the depicted person from these slugs or rename save IDs.\n`,
);
const escape = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const cards = [];
const portraitLayers = [];
for (let index = 0; index < entries.length; index++) {
  const entry = entries[index],
    x = (index % 8) * 150,
    y = Math.floor(index / 8) * 184;
  const bytes = await fs.readFile(path.join(output, entry.id + '-small.webp'));
  portraitLayers.push({ input: bytes, left: x + 11, top: y + 4 });
  cards.push(
    `<g transform="translate(${x},${y})"><text x="75" y="148" text-anchor="middle" font-size="13">${escape(entry.name)} · ${escape(entry.chinese)}</text><text x="75" y="167" text-anchor="middle" font-size="11">${escape(entry.id)}</text></g>`,
  );
}
const sheetHeight = Math.ceil(entries.length / 8) * 184;
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${sheetHeight}"><g font-family="Microsoft YaHei,Segoe UI,sans-serif" fill="#25362b">${cards.join('')}</g></svg>`;
await sharp({ create: { width: 1200, height: sheetHeight, channels: 3, background: '#eee6d5' } })
  .composite([...portraitLayers, { input: Buffer.from(sheet), left: 0, top: 0 }])
  .jpeg({ quality: 90 })
  .toFile('docs/images/officer-headshots.jpg');
console.log(
  `Prepared ${entries.length}/53 portraits; ${entries.filter((x) => x.id !== 'garrison').length}/52 named officers.`,
);
