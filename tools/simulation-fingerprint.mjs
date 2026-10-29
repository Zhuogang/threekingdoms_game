import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Include the complete source/tool tree, including new and deleted working files. */
export async function simulationFingerprint(root = process.cwd(), configuration = {}) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const files = [
    ...new Set(
      git(
        'ls-files',
        '--cached',
        '--others',
        '--exclude-standard',
        '-z',
        '--',
        'src/v03',
        'tools',
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'vite.config.ts',
      )
        .split('\0')
        .filter(Boolean),
    ),
  ].sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file).update('\0');
    try {
      hash.update(await readFile(resolve(root, file)));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      hash.update('<deleted>');
    }
    hash.update('\0');
  }
  return {
    commit: git('rev-parse', 'HEAD'),
    dirty: git('status', '--porcelain', '--untracked-files=normal').length > 0,
    sourceFiles: files,
    sourceSha256: hash.digest('hex'),
    configuration,
    configSha256: createHash('sha256').update(JSON.stringify(configuration)).digest('hex'),
  };
}
