import { build } from 'esbuild';

/** Scenario roster union, independent of the portrait specification and manifest. */
export async function portraitRoster() {
  const result = await build({
    stdin: {
      contents:
        "export { SCENARIOS } from './src/v03/content/scenario'; export { OFFICER_IDENTITIES } from './src/v03/content/officerIdentity';",
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node22',
  });
  const { SCENARIOS, OFFICER_IDENTITIES } = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`
  );
  const officers = new Map();
  for (const scenario of SCENARIOS)
    for (const officer of scenario.officers) {
      const existing = officers.get(officer.id);
      if (existing && (existing.name !== officer.name || existing.chinese !== officer.chinese))
        throw new Error(`Conflicting scenario identity: ${officer.id}`);
      officers.set(officer.id, officer);
    }
  return { officers, identities: OFFICER_IDENTITIES };
}
