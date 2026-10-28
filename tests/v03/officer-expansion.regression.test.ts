import { describe, it } from 'vitest';
import {
  ROSTER_MATRIX,
  FLOW_MODES,
  runRosterFlow,
  runRosterYearBoundary,
} from './helpers/roster-regression';

describe.each(ROSTER_MATRIX)(
  'roster campaign integration $scenarioId / $factionId',
  ({ scenarioId, factionId }) => {
    it.each(FLOW_MODES)(
      'recruits, assigns, marches, crosses water, settles %s and recovers through saves',
      (mode) => {
        runRosterFlow(scenarioId, factionId, mode);
      },
    );
    it('crosses two year boundaries without duplicates or reviving campaign/opening deaths, across two seeds', () => {
      for (const seed of [19, 971]) runRosterYearBoundary(scenarioId, factionId, seed);
    });
  },
);

describe.each(['divided-realm-190', 'guandu-200'])(
  'month-boundary personnel arrivals %s',
  (scenarioId) => {
    it('opens a new officer campaign arriving on day 30 and survives reload', () => {
      runRosterFlow(scenarioId, 'cao', 'capture-release', 29);
    });
    it('unloads a retreating wounded new officer on day 30 exactly once, with XP and rations intact', () => {
      runRosterFlow(scenarioId, 'cao', 'retreat', 26);
    });
  },
);
