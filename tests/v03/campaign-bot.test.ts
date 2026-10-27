import { preparePuyangArmy } from './helpers/army-fixture';
import { describe, expect, it } from 'vitest';
import { executeV03Command } from '../../src/v03/commands';
import { createV03Game } from '../../src/v03/initial-state';
import { ROUTE_DEFINITIONS } from '../../src/v03/geography';
import {
  executeNextAdjacentCampaignOrder,
  listAdjacentCampaignCandidates,
} from '../../tools/v03-campaign-bot.mjs';

describe('v0.3 deterministic campaign diagnostic bot', () => {
  it('selects stable adjacent enemy cities and does not mutate campaign state', () => {
    const state = createV03Game('cao', 610301);
    const before = structuredClone(state);
    const candidates = listAdjacentCampaignCandidates(state, ROUTE_DEFINITIONS);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates).toEqual(listAdjacentCampaignCandidates(state, ROUTE_DEFINITIONS));
    expect(state).toEqual(before);
    for (const candidate of candidates) {
      const source = state.cities.find((city) => city.id === candidate.sourceCityId)!;
      const target = state.cities.find((city) => city.id === candidate.targetCityId)!;
      expect(source.factionId).toBe('cao');
      expect(target.factionId).not.toBe('cao');
      expect(
        ROUTE_DEFINITIONS.some(
          (route) =>
            route.id === candidate.routeId &&
            ((route.fromCityId === source.id && route.toCityId === target.id) ||
              (route.toCityId === source.id && route.fromCityId === target.id)),
        ),
      ).toBe(true);
      expect(candidate.requestedTroops).toBeLessThanOrEqual(
        source.garrisonTroops - Math.min(1_000, Math.ceil(source.garrisonTroops * 0.35)),
      );
    }
  });

  it('uses command results, dispatches a viable campaign, and accounts for its force', () => {
    const state = createV03Game('cao', 610301);
    const action = executeNextAdjacentCampaignOrder(state, ROUTE_DEFINITIONS, executeV03Command);

    expect(action.candidatesTried).toBeGreaterThan(0);
    expect(action.state).not.toBe(state);
    const dispatched = action.state.directives.filter(
      (directive) => directive.status === 'dispatched',
    );
    if (action.dispatched) {
      expect(dispatched).toHaveLength(1);
      expect(action.selected).not.toBeNull();
      expect(action.state.journeys.some((journey) => journey.kind === 'campaign')).toBe(true);
    } else {
      expect(dispatched).toHaveLength(0);
      expect(
        action.state.directives.every(
          (directive) =>
            !['requested', 'proposed', 'waiting', 'accepted'].includes(directive.status),
        ),
      ).toBe(true);
    }
  });

  it('ranks independent targets using the 500 militia that battle resolution adds', () => {
    const state = createV03Game('cao', 610301);
    preparePuyangArmy(state);
    const candidates = listAdjacentCampaignCandidates(state, ROUTE_DEFINITIONS);
    const independent = candidates.find(
      (candidate) =>
        state.cities.find((city) => city.id === candidate.targetCityId)?.factionId === null,
    );

    expect(independent?.defenderTroops).toBeGreaterThanOrEqual(500);
  });

  it('continues after a rejected command without treating it as a dispatch', () => {
    const state = createV03Game('cao', 610301);
    const candidates = listAdjacentCampaignCandidates(state, ROUTE_DEFINITIONS);
    expect(candidates.length).toBeGreaterThan(1);
    let rejectFirstIssue = true;
    const action = executeNextAdjacentCampaignOrder(
      state,
      ROUTE_DEFINITIONS,
      (current, command) => {
        if (command.type === 'issueCampaignDirective' && rejectFirstIssue) {
          rejectFirstIssue = false;
          return { ok: false, state: current, error: 'test rejection' };
        }
        return executeV03Command(current, command);
      },
    );

    expect(action.commandsRejected).toBe(1);
    expect(action.candidatesTried).toBeGreaterThan(1);
    if (action.dispatched) {
      expect(action.selected).not.toEqual(candidates[0]);
    }
  });
});
