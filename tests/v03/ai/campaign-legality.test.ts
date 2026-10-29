import { afterEach, describe, expect, it, vi } from 'vitest';
import * as strategic from '../../../src/v03/strategic-ai';
import { dispatchMonthlyRivalCampaigns, dispatchRivalCampaignPlan } from '../../../src/v03/engine';
import { createAiDecisionTrace, withAiDecisionTrace } from '../../../src/v03/ai/decision-trace';
import { rivalDecisionFixture } from '../helpers/ai-fixtures';
import type { V03GameState } from '../../../src/v03/types';
import type { StrategicRivalCampaignPlan } from '../../../src/v03/strategic-ai';

afterEach(() => vi.restoreAllMocks());
const originalPlanner = strategic.planStrategicRivalCampaigns;
function fixture() {
  const state = rivalDecisionFixture();
  state.absoluteDay = 30;
  state.monthIndex = 1;
  state.factions.forEach((faction) => {
    if (!['cao', 'yuan', 'liu'].includes(faction.id)) faction.eliminated = true;
  });
  state.cities.find((city) => city.id === 'pingyuan')!.garrisonTroops = 0;
  return state;
}
function occupyTarget(state: V03GameState, plan: StrategicRivalCampaignPlan) {
  state.directives.push({
    id: 'other-order',
    factionId: 'cao',
    sourceCityId: 'chenliu',
    targetCityId: plan.targetCityId,
    intent: 'conquer',
    requestedTroops: 1000,
    proposedTroops: 1000,
    requestedByDay: null,
    earliestDepartureDay: null,
    estimatedArrivalDay: null,
    status: 'waiting',
    journeyId: null,
    governanceRevision: state.governanceRevision,
    message: 'Competing order',
  });
}

describe('V04-01 campaign legality and bounded fallback', () => {
  it('filters alliances before ranking and permits the target exactly when the treaty expires', () => {
    const state = fixture();
    state.cities.find((city) => city.id === 'pingyuan')!.factionId = 'liu';
    state.alliances.push({ a: 'yuan', b: 'liu', expiresMonthIndex: 2 });
    const trace = createAiDecisionTrace(1000);
    const plans = withAiDecisionTrace(trace, () => originalPlanner(state, { factionId: 'yuan' }));
    expect(plans[0]!.targetCityId).toBe('jinyang');
    expect(
      trace.events.some(
        (event) =>
          event.kind === 'campaign' &&
          event.reason === 'allied-target' &&
          event.targetCityId === 'pingyuan',
      ),
    ).toBe(true);
    state.monthIndex = 2;
    state.absoluteDay = 60;
    expect(originalPlanner(state, { factionId: 'yuan' })[0]!.targetCityId).toBe('pingyuan');
  });

  const staleCases: Array<
    [string, (state: V03GameState, plan: StrategicRivalCampaignPlan) => void]
  > = [
    [
      'target became friendly',
      (state, plan) => {
        state.cities.find((city) => city.id === plan.targetCityId)!.factionId = 'yuan';
      },
    ],
    [
      'new alliance',
      (state, plan) => {
        state.cities.find((city) => city.id === plan.targetCityId)!.factionId = 'liu';
        state.alliances.push({ a: 'yuan', b: 'liu', expiresMonthIndex: 3 });
      },
    ],
    ['busy target', occupyTarget],
    [
      'source changed owner',
      (state, plan) => {
        state.cities.find((city) => city.id === plan.sourceCityId)!.factionId = 'cao';
      },
    ],
    [
      'officer reorganizing',
      (state, plan) => {
        state.officers.find((officer) => officer.id === plan.officerIds[0])!.reorganizationDays = 3;
      },
    ],
    [
      'insufficient food',
      (state, plan) => {
        state.cities.find((city) => city.id === plan.sourceCityId)!.food = 0;
      },
    ],
    [
      'stale date',
      (_state, plan) => {
        plan.departureDay--;
      },
    ],
    [
      'altered route',
      (_state, plan) => {
        plan.route.roadKmNominal++;
      },
    ],
    [
      'underreported cavalry',
      (_state, plan) => {
        plan.party.composition.cavalryTroops = 0;
      },
    ],
  ];
  it.each(staleCases)(
    'rejects %s without spending stock, RNG, IDs or officer assignments',
    (_label, alter) => {
      const state = fixture();
      if (_label === 'underreported cavalry')
        state.officers
          .filter((officer) => officer.troopType !== 'cavalry')
          .forEach((officer) => (officer.reorganizationDays = 1));
      const plan = originalPlanner(state, { factionId: 'yuan' })[0]!;
      if (_label === 'underreported cavalry')
        expect(plan.party.composition.cavalryTroops).toBeGreaterThan(0);
      alter(state, plan);
      const before = structuredClone(state);
      const assigned = new Set<string>();
      const trace = createAiDecisionTrace();
      expect(
        withAiDecisionTrace(trace, () => dispatchRivalCampaignPlan(state, plan, assigned)),
      ).toBe(false);
      expect(state).toEqual(before);
      expect(assigned.size).toBe(0);
      expect(trace.events).toHaveLength(1);
      expect(trace.events[0]!.status).toBe('execution-rejected');
    },
  );

  it.each(staleCases.slice(0, 3))(
    'refreshes and dispatches a legal alternative after %s',
    (_label, alter) => {
      const state = fixture();
      const foodBefore = state.cities.find((city) => city.id === 'ye')!.food;
      const nextId = state.nextId,
        rng = state.rng;
      let staleTarget = '';
      let changed = false;
      vi.spyOn(strategic, 'planStrategicRivalCampaigns').mockImplementation((snapshot, options) => {
        const plans = originalPlanner(snapshot, options);
        if (options?.factionId === 'yuan' && !changed) {
          changed = true;
          staleTarget = plans[0]!.targetCityId;
          alter(snapshot as V03GameState, plans[0]!);
        }
        return plans;
      });
      const trace = createAiDecisionTrace(1000);
      withAiDecisionTrace(trace, () => dispatchMonthlyRivalCampaigns(state));
      const committed = state.directives.filter((order) => order.factionId === 'yuan');
      expect(committed).toHaveLength(1);
      expect(committed[0]!.targetCityId).not.toBe(staleTarget);
      expect(committed[0]!.targetCityId).toBe('jinyang');
      expect(state.journeys).toHaveLength(1);
      expect(state.nextId).toBe(nextId + 2);
      expect(state.rng).toBe(rng);
      expect(state.cities.find((city) => city.id === 'ye')!.food).toBe(
        foodBefore - state.journeys[0]!.manifest.carriedFood,
      );
      expect(
        trace.events.filter(
          (event) => event.kind === 'campaign' && event.status === 'execution-rejected',
        ),
      ).toHaveLength(1);
      expect(
        trace.events.filter((event) => event.kind === 'campaign' && event.status === 'committed'),
      ).toHaveLength(1);
    },
  );

  it('bounds repeated stale proposals even if the planner keeps returning the rejected option', () => {
    const state = fixture();
    state.factions.forEach((faction) => {
      if (faction.id !== 'yuan') faction.eliminated = true;
    });
    const plan = originalPlanner(state, { factionId: 'yuan' })[0]!;
    plan.departureDay--;
    const before = structuredClone(state);
    const planner = vi.spyOn(strategic, 'planStrategicRivalCampaigns').mockReturnValue([plan]);
    dispatchMonthlyRivalCampaigns(state);
    expect(planner).toHaveBeenCalledTimes(3);
    expect(state).toEqual(before);
  });

  it('keeps one successful new dispatch even with two eligible source cities', () => {
    const state = fixture();
    const ye = state.cities.find((city) => city.id === 'ye')!;
    ye.garrisonTroops = 3000;
    state.cities.find((city) => city.id === 'jinyang')!.garrisonTroops = 0;
    state.cities.find((city) => city.id === 'pingyuan')!.garrisonTroops = 1000;
    state.cities.push({ ...structuredClone(ye), id: 'beiping', name: 'Beiping' });
    state.officers.slice(3).forEach((officer) => {
      officer.location = { kind: 'city', cityId: 'beiping' };
    });
    const trace = createAiDecisionTrace(1000);
    withAiDecisionTrace(trace, () =>
      originalPlanner(state, { factionId: 'yuan', maxPlansPerFaction: 2 }),
    );
    expect(
      new Set(
        trace.events
          .filter((event) => event.kind === 'campaign' && event.status === 'eligible')
          .map((event) => event.kind === 'campaign' && event.sourceCityId),
      ),
    ).toEqual(new Set(['ye', 'beiping']));
    dispatchMonthlyRivalCampaigns(state);
    expect(state.directives.filter((order) => order.factionId === 'yuan')).toHaveLength(1);
    expect(state.journeys).toHaveLength(1);
  });
});
