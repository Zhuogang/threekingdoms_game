import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { portraitRoster } from './portrait-roster.mjs';

const require = createRequire(import.meta.url);
const sharp = require(process.env.PORTRAIT_SHARP_PATH || 'sharp');
const spec = JSON.parse(await fs.readFile('tools/portrait-spec.json', 'utf8'));
const output = 'public/assets/portraits';
const retained = JSON.parse(await fs.readFile(path.join(output, 'credits.json'), 'utf8'));
const existingEntries = new Map(retained.entries.map((entry) => [entry.id, entry]));
const { officers } = await portraitRoster();
const specIds = spec.officers.map((row) => row[0]);
if (
  new Set(specIds).size !== specIds.length ||
  JSON.stringify([...specIds].sort()) !== JSON.stringify([...officers.keys(), 'garrison'].sort())
)
  throw new Error('Portrait specification must cover both scenario rosters and garrison exactly.');
if (
  existingEntries.size !== retained.entries.length ||
  [...existingEntries.keys()].some((id) => !specIds.includes(id))
)
  throw new Error(
    'Existing manifest has duplicate/unknown entries; refusing to discard provenance.',
  );
await fs.mkdir(output, { recursive: true });
await fs.mkdir('docs/assets', { recursive: true });
await fs.mkdir('docs/images', { recursive: true });
const entries = [];
let added = 0;
const pendingFiles = [];
for (const [id, name, chinese, surnameEn, surnameZh, age] of spec.officers) {
  const approved = existingEntries.get(id);
  if (approved) {
    if (approved.name !== name || approved.chinese !== chinese || approved.scenarioAge !== age)
      throw new Error(`Specification changed approved identity: ${id}`);
    for (const file of approved.files) {
      const bytes = await fs.readFile(path.join(output, file.file));
      if (
        createHash('sha256').update(bytes).digest('hex') !== file.sha256 ||
        bytes.length !== file.bytes
      )
        throw new Error(`Approved rendition changed: ${file.file}; refusing to overwrite it.`);
    }
    entries.push(approved);
    continue;
  }
  // Only new assets need originals. Approved entries survive a clean checkout without
  // the ignored initial source manifest or old files in the image tool's output folder.
  const metadata = JSON.parse(
    await fs.readFile(
      path.join(process.env.PORTRAIT_SOURCE_DIR || '.artifacts', `portrait-source-${id}.json`),
      'utf8',
    ),
  );
  const scenarioYear = spec.scenarioYears?.[id] ?? spec.defaultScenarioYear ?? 190;
  if (
    metadata.id !== id ||
    !metadata.path ||
    !metadata.prompt ||
    !/^\d{4}-\d{2}-\d{2}$/.test(metadata.created ?? '') ||
    metadata.scenarioYear !== scenarioYear ||
    !Array.isArray(metadata.references)
  )
    throw new Error(
      `New portrait needs actual prompt, date, scenario year and reference metadata: ${id}`,
    );
  const source = metadata.path;
  const sourceBytes = await fs.readFile(source);
  const files = [];
  for (const [suffix, size, quality] of [
    ['-small', 128, 82],
    ['', 256, 87],
  ]) {
    const filename = `${id}${suffix}.webp`;
    const dest = path.join(output, filename);
    try {
      await fs.stat(dest);
      throw new Error(`Unregistered rendition exists: ${filename}; refusing to overwrite it.`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const bytes = await sharp(sourceBytes)
      .resize(size, size, { fit: 'contain', background: '#e9e0ca' })
      .webp({ quality, effort: 6 })
      .toBuffer();
    pendingFiles.push({ dest, bytes });
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
    scenarioYear,
    kind: 'original-generated-illustration',
    creator: 'OpenAI built-in image_gen, directed for this project',
    created: metadata.created,
    model: metadata.model ?? 'Not exposed by the built-in tool',
    rights:
      'Original AI-generated project artwork. No third-party portrait was reused; no public-domain or authenticated-likeness claim is made.',
    sourceAsset: path.basename(source),
    sourceSha256: createHash('sha256').update(sourceBytes).digest('hex'),
    projectSource: source.replaceAll('\\', '/'),
    prompt: metadata.prompt,
    references: metadata.references,
    editPrompts: metadata.editPrompts ?? [],
    sourceHistory: metadata.sourceHistory ?? [],
    modifications:
      'Selected original includes any recorded image_gen edits. Delivery: square contain resize to 256 and 128 pixels; WebP compression. No facial editing or substitution during delivery.',
    files,
  });
  added++;
}
// Finish validation and encoding before writing any new delivery files.
for (const { dest, bytes } of pendingFiles) await fs.writeFile(dest, bytes, { flag: 'wx' });
const credits = {
  ...retained,
  version: retained.version,
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
    `| \`${e.id}\` | ${e.name} / ${e.chinese} | ${e.scenarioAge} | ${e.scenarioYear ?? 190} | ${e.created} | \`${e.id}.webp\` |`,
);
await fs.writeFile(
  'docs/assets/portrait-credits.md',
  `# Officer portrait credits / 武将头像来源

${credits.description}

${credits.descriptionZh}

The original collection was created on October 19, 2026 using OpenAI's built-in image_gen tool with no reference image inputs. Ma Chao was created on October 20, 2026 with the same built-in tool, then received a framing edit using his first generated image as the edit target. No other portraits were supplied as image inputs. The tool did not expose a model identifier. Each entry preserves its actual date, prompts, source history and checksums. Names identify imagined depictions, not authenticated likenesses. Generated-output use is subject to the applicable creation-service terms; no third-party image license is invented here.

The art direction and briefs are in [the prompt set](../../tools/portrait-spec.json). Individual provenance and rendition checksums are in [the bundled manifest](../../public/assets/portraits/credits.json). Only contain resizing and WebP compression are applied during delivery. Ma Chao's selected original and first draft are preserved in project-owned \`.artifacts/portrait-sources/\`; the original collection retains its historical tool-output source records. Runtime assets always use the bundled renditions.

Progress: **${entries.filter((e) => e.id !== 'garrison').length}/${officers.size} named officers**, plus ${entries.some((e) => e.id === 'garrison') ? 1 : 0}/1 garrison; ${entries.length * 2} runtime renditions. Fallbacks do not count as portrait coverage. The 190 scenario has 52 officers; Guandu adds Ma Chao, age 24 in 200 AD.

## Incremental preparation

Use the repository's installed Node dependencies. The encoder also needs \`sharp\`: set \`PORTRAIT_SHARP_PATH\` to an installed sharp package directory from Codex's \`load_workspace_dependencies\`, or provide a locally installed package. Run \`node tools/prepare-portraits.mjs\`, then \`npm run validate:portraits\`. No image-service API key is used for preparation.

For a new portrait, add its brief to the specification and a \`.artifacts/portrait-source-<id>.json\` record with \`id\`, \`path\`, actual \`created\` date, \`scenarioYear\`, exact \`prompt\`, \`references\`, and any \`editPrompts\`/\`sourceHistory\`. \`PORTRAIT_SOURCE_DIR\` can point to another source-record directory. Approved portraits retain their provenance and rendition bytes even if their originals are unavailable. Preparation checks their hashes and refuses silent replacement. Coverage is checked independently against both game scenarios.

| Stable ID | Depicted person | Scenario age | Scenario year | Created | Inspector file |
| --- | --- | ---: | ---: | --- | --- |
${rows.join('\n')}

Stable-ID exceptions are intentional: \`maliang\` is Ma Teng / 马腾; \`zuzhao\` is Zu Mao / 祖茂. Never infer the depicted person from these slugs or rename save IDs.
`,
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
  `Prepared ${added} new portraits; preserved ${existingEntries.size} approved entries. ${entries.filter((x) => x.id !== 'garrison').length}/${officers.size} named officers, ${entries.length * 2} renditions.`,
);
