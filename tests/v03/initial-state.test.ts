import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../src/v03/initial-state';
import { SCENARIOS } from '../../src/v03/content/scenario';
import { validateV03State } from '../../src/v03/platform/storage';

describe('v0.3 new-campaign setup', () => {
  for (const scenario of SCENARIOS) {
    it(`creates a valid independent state for ${scenario.id}`, () => {
      const factionId = scenario.factions[0]!.id;
      const state = createV03Game(factionId, 20261021, scenario.id);
      expect(state.version).toBe(3);
      expect(state.ruleset).toBe('hegemony-3');
      expect(state.cities).toHaveLength(24);
      expect(state.monthIndex).toBe(0);
      expect(state.absoluteDay).toBe(0);
      expect(state.factions.find((faction) => faction.id === factionId)?.isPlayer).toBe(true);
      expect(validateV03State(state)).toBe(true);
    });
  }
});
