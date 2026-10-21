import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SCENARIOS,
  activateScenario,
  factionById,
  factionOf,
  factionsOf,
  scenarioOf,
} from '../src/content/scenario';
import { createGame } from '../src/game/campaign';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

/** The live bindings that `activateScenario` swaps; presentation code must not read them. */
const LIVE_BINDINGS =
  /\b(FACTIONS|SCENARIO|INITIAL_CITIES|INITIAL_OFFICERS|factionById|activateScenario)\b/;

describe('the interface reads the scenario from the game state (review L10)', () => {
  it('no UI, rendering or platform file imports a live scenario binding', () => {
    const offenders: string[] = [];
    for (const dir of ['src/ui', 'src/rendering', 'src/platform'])
      for (const path of files(dir)) {
        const imports = readFileSync(path, 'utf8').match(
          /import[^;]*?from '[^']*content\/scenario'/gs,
        );
        for (const statement of imports ?? [])
          if (LIVE_BINDINGS.test(statement.replace(/\bSCENARIOS\b|DEFAULT_SCENARIO_ID/g, '')))
            offenders.push(`${path}: ${statement.replace(/\s+/g, ' ')}`);
      }
    expect(offenders).toEqual([]);
  });

  it('answers for the given game even when another scenario is active', () => {
    const guandu = createGame('ma', 4, 'balanced', { scenarioId: 'guandu-200' });
    const divided = createGame('yan', 4);
    activateScenario('divided-realm-190');
    // The live binding now describes 190, yet the accessors still describe each game.
    expect(factionById('ma')).toBeUndefined();
    expect(factionOf(guandu, 'ma')?.name).toBe('Ma Teng');
    expect(factionOf(guandu, 'yan')?.name).toBe('Liu Zhang');
    expect(factionOf(divided, 'yan')?.name).toBe('Liu Yan');
    expect(scenarioOf(guandu).id).toBe('guandu-200');
    expect(factionsOf(guandu)).toBe(SCENARIOS[1]!.factions);
    expect(scenarioOf({ scenarioId: 'unknown' }).id).toBe(SCENARIOS[0]!.id);
  });
});
