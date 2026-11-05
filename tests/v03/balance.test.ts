import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as balance from '../../src/v03/balance';

function checkLeaves(value: unknown, path: string, problems: string[]): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) problems.push(`${path} is not finite`);
    return;
  }
  if (typeof value === 'string' || typeof value === 'boolean') return;
  if (value !== null && typeof value === 'object') {
    if (!Object.isFrozen(value)) problems.push(`${path} is not frozen`);
    for (const [key, child] of Object.entries(value))
      checkLeaves(child, `${path}.${key}`, problems);
    return;
  }
  problems.push(`${path} has unsupported type ${value === null ? 'null' : typeof value}`);
}

describe('balance tables', () => {
  const tables = Object.entries(balance);

  it('exports one table per domain', () => {
    expect(tables.map(([name]) => name).sort()).toEqual(
      [
        'BATTLE',
        'BATTLE_AI',
        'CAMPAIGN_AI',
        'CITY_WORK',
        'ECONOMY',
        'EVENTS',
        'LEADERSHIP',
        'MORALE',
        'ORDERS',
        'PERSONNEL',
        'RECRUITMENT',
        'TACTICS',
      ].sort(),
    );
  });

  it('freezes every table deeply and holds only finite numbers, strings, booleans and frozen records', () => {
    const problems: string[] = [];
    for (const [name, table] of tables) checkLeaves(table, name, problems);
    expect(problems).toEqual([]);
  });

  it('ignores or rejects mutation of a table', () => {
    const table = balance.BATTLE as unknown as { damage: { coefficient: number } };
    expect(() => {
      table.damage.coefficient = 99;
    }).toThrow(TypeError);
    expect(balance.BATTLE.damage.coefficient).toBe(0.3);
  });
});

/** Numbers that are structure rather than tuning, allowed anywhere in a scanned module. */
const ALLOWED_LITERALS = new Set([
  '0', // empty, origin and "none"
  '1', // one step, one unit and increments
  '2', // pairs (cavalry eat double) and binary-heap child arithmetic
  '100', // percent scale
]);

/** Exact code lines that hold other literals, each with the reason. */
const ALLOWED_LINES: Record<string, string[]> = {
  // The four cardinal directions are indexed 0-3 in the reverse distance field.
  'src/v03/battle/rules.ts': [
    'for (let direction = 0; direction < 4; direction++) {',
    'const px = direction === 1 ? x + 1 : direction === 3 ? x - 1 : x;',
    'const py = direction === 0 ? y - 1 : direction === 2 ? y + 1 : y;',
  ],
};

function stripNonCode(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}

function strayLiterals(path: string): string[] {
  const allowedLines = new Set((ALLOWED_LINES[path] ?? []).map((line) => line.trim()));
  const found: string[] = [];
  for (const line of stripNonCode(readFileSync(path, 'utf8')).split('\n')) {
    if (allowedLines.has(line.trim())) continue;
    for (const match of line.matchAll(/(?<![\w.$])(\d[\d_]*(?:\.\d+)?)(?![\w])/g)) {
      const literal = match[1]!;
      if (!ALLOWED_LITERALS.has(literal)) found.push(`${literal} in: ${line.trim()}`);
    }
  }
  return found;
}

describe('rules modules read balance instead of numeric literals', () => {
  it.each([
    'src/v03/campaign/economy.ts',
    'src/v03/campaign/recruitment.ts',
    'src/v03/battle/rules.ts',
  ])('%s has no stray numeric literals', (path) => {
    expect(strayLiterals(path)).toEqual([]);
  });
});
