import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

// Run after the readability matrix. This packages selected evidence, without
// rerunning the simulation or changing the retained pre-improvement fixtures.
const input = '.artifacts/improvements/metrics';
const files = (await readdir(input))
  .filter((file) => /^(1366|1920)-(en|zh)-(compact|comfortable|large)\.json$/.test(file))
  .sort();
if (files.length !== 12) throw new Error('Run all 12 readability cases before packaging evidence.');
const round = (number) => Math.round(number * 1000) / 1000;
const cases = [];
for (const file of files) {
  const value = JSON.parse(await readFile(`${input}/${file}`, 'utf8'));
  const target = { compact: 14, comfortable: 16, large: 18 }[value.preset];
  if (!(value.campaign.cityFont >= target))
    throw new Error(`Missing/undersized campaign label evidence: ${file}`);
  const battle = (phase) => ({
    tileSide: round(phase.tile),
    troopCountFont: round(phase.countFont),
    surnameFont: round(phase.surnameFont),
    factionCrestFont: round(phase.crestFont),
    readinessFont: round(phase.statusFont),
    canvas: { width: phase.width, height: phase.height },
    board: {
      left: round(phase.left),
      top: round(phase.top),
      right: round(phase.right),
      bottom: round(phase.bottom),
    },
    cameraScale: round(phase.scale),
  });
  cases.push({
    viewport: value.viewport,
    language: value.language,
    preset: value.preset,
    campaign: {
      minimumCityLabelFont: value.campaign.cityFont,
      canvas: { width: value.campaign.width, height: value.campaign.height },
      cameraScale: round(value.campaign.scale),
    },
    battleReadable: battle(value.readable),
    battleFitted: battle(value.fit),
  });
}
const evidence = {
  description:
    'Final browser display matrix: 12 configurations, each with campaign and dense battle scenes. All lengths and rendered font targets use CSS pixels at 100% browser zoom.',
  capturedOn: '2026-10-19',
  environment: { os: 'Windows x64 10.0.26300', node: 'v24.15.0', browser: 'Chrome 155.0.8059.80' },
  fixture: 'tests/fixtures/legacy-dense-battle.json',
  source:
    'Playwright map metrics after rendered camera transforms; assertions plus actual pointer tests and screenshots in tests/e2e/improvements.spec.ts.',
  cases,
};
await mkdir('docs/archive/v0.1/validation-evidence', { recursive: true });
await writeFile(
  'docs/archive/v0.1/validation-evidence/display-metrics.json',
  JSON.stringify(evidence, null, 2) + '\n',
);
await copyFile(
  '.artifacts/improvements/campaign-1920-zh-comfortable.png',
  'docs/images/campaign-zh.png',
);
await copyFile(
  '.artifacts/improvements/battle-1920-en-comfortable.png',
  'docs/images/battle-en.png',
);
await mkdir('docs/images/improvements', { recursive: true });
await copyFile(
  '.artifacts/improvements/actual-browser-zoom-200.png',
  'docs/images/improvements/browser-zoom-200.png',
);
console.log(
  `Packaged ${cases.length} configurations, 24 scenes, two clean README images, and the actual 200% browser surface.`,
);
