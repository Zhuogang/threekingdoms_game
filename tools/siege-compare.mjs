import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

const [
  baselinePath = '.artifacts/siege/sim-baseline-p4.json',
  actualPath = '.artifacts/siege/sim-q.json',
] = process.argv.slice(2);
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const actual = JSON.parse(readFileSync(actualPath, 'utf8'));
const key = (row) => `${row.method}/${row.seed}`;
const expected = new Map(baseline.results.map((row) => [key(row), row]));
const received = new Map(actual.results.map((row) => [key(row), row]));
const mismatches = [];
for (const id of new Set([...expected.keys(), ...received.keys()])) {
  const before = expected.get(id);
  const after = received.get(id);
  if (!isDeepStrictEqual(before, after))
    mismatches.push({
      game: id,
      fields: [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter(
        (field) => !isDeepStrictEqual(before?.[field], after?.[field]),
      ),
    });
}
const report = {
  baselineGames: expected.size,
  actualGames: received.size,
  compared: expected.size,
  identical: expected.size - mismatches.length,
  mismatches,
  baselineFailures: baseline.failures.length,
  actualFailures: actual.failures.length,
  // Compare every game field, including every day's events. Timing lives outside results.
  strategiesIdentical: isDeepStrictEqual(baseline.strategies, actual.strategies),
};
console.log(JSON.stringify(report, null, 2));
if (mismatches.length || actual.failures.length || !report.strategiesIdentical)
  process.exitCode = 1;
