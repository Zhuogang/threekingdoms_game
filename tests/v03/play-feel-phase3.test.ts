import { describe, expect, it } from 'vitest';
import {
  planStrategicRivalCampaigns,
  reviewStrategicRivalCampaigns,
} from '../../src/v03/strategic-ai';
import { createV03Game } from '../../src/v03/initial-state';
import { rulerTemperament, temperamentFromTraits } from '../../src/v03/ai/temperament';
import { rivalDecisionFixture } from './helpers/ai-fixtures';

/** Yuan's house at Ye with a chosen ruler; Pingyuan is the only reachable target. */
function rivalWithRuler(rulerId: string) {
  const state = rivalDecisionFixture();
  state.cities = state.cities.filter((city) => city.id !== 'jinyang');
  if (!state.officers.some((officer) => officer.id === rulerId)) {
    const ruler = createV03Game('cao', 17).officers.find((officer) => officer.id === rulerId)!;
    Object.assign(ruler, {
      factionId: 'yuan',
      location: { kind: 'city', cityId: 'ye' },
      troops: 1000,
      wounded: 0,
      reorganizationDays: 0,
      governorOfCityId: null,
    });
    state.officers.push(ruler);
  }
  state.factions.find((faction) => faction.id === 'yuan')!.leaderOfficerId = rulerId;
  return state;
}

describe('PF-CA-01 rulers with temperament', () => {
  it('derives policy from the current ruler’s traits and is neutral without one', () => {
    const state = createV03Game('cao', 17, 'divided-realm-190');
    expect(rulerTemperament(state, 'sun')).toMatchObject({
      admissionRatio: 0.7,
      homeRiskLimit: 1.1,
      raidRatio: 0.5,
    });
    expect(rulerTemperament(state, 'liu')).toMatchObject({
      admissionRatio: 0.95,
      rulerStaysHome: true,
      raidRatio: null,
    });
    expect(rulerTemperament(state, 'cao')).toMatchObject({ lossWeight: 2, admissionRatio: 0.8 });
    expect(rulerTemperament(state, 'yuan')).toMatchObject({ valuesWealth: true, raidRatio: 0.5 });
    // Dong Zhuo is both greedy and fierce; both apply.
    expect(rulerTemperament(state, 'dong')).toMatchObject({
      admissionRatio: 0.7,
      valuesWealth: true,
    });
    expect(temperamentFromTraits([])).toMatchObject({
      admissionRatio: 0.8,
      homeRiskLimit: 0.9,
      lossWeight: 1,
      rulerStaysHome: false,
      raidRatio: null,
    });
  });

  it('lets a fierce ruler march at odds a neutral ruler declines, never the reverse', () => {
    let fierceOnly = 0;
    for (let garrison = 2000; garrison <= 14_000; garrison += 500) {
      const plans = ['yuejin', 'yanliang'].map((rulerId) => {
        const state = rivalWithRuler(rulerId);
        state.cities.find((city) => city.id === 'pingyuan')!.garrisonTroops = garrison;
        return planStrategicRivalCampaigns(state, { factionId: 'yuan' }).filter(
          (plan) => plan.intent === 'conquer',
        ).length;
      });
      expect(plans[1]).toBeGreaterThanOrEqual(plans[0]!);
      if (plans[1]! > plans[0]!) fierceOnly++;
    }
    expect(fierceOnly).toBeGreaterThan(0);
  });

  it('keeps a benevolent ruler at home while other rulers lead in person', () => {
    const parties = (rulerId: string) =>
      reviewStrategicRivalCampaigns(rivalWithRuler(rulerId), {
        factionId: 'yuan',
      }).opportunities.map((opportunity) => opportunity.plan.officerIds);
    const benevolent = parties('liubei');
    expect(benevolent.length).toBeGreaterThan(0);
    expect(benevolent.flat()).not.toContain('liubei');
    expect(parties('yanliang').some((party) => party[0] === 'yanliang')).toBe(true);
  });
});
