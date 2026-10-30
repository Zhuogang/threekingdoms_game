import { describe, expect, it } from 'vitest';
import {
  campaignTargetValue,
  leadingFactionId,
  planStrategicRivalCampaigns,
  reviewStrategicRivalCampaigns,
} from '../../src/v03/strategic-ai';
import { createV03Game } from '../../src/v03/initial-state';
import { executeV03Command } from '../../src/v03/commands';
import { applyV03BattleAction, dispatchRivalCampaignPlan } from '../../src/v03/engine';
import { estimateCampaignSupply } from '../../src/v03/calendar';
import { formatEvent } from '../../src/v03/i18n/events';
import { createPersonnelDay } from '../../src/v03/campaign/personnel';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../src/v03/platform/storage';
import { rulerTemperament, temperamentFromTraits } from '../../src/v03/ai/temperament';
import { rivalDecisionFixture } from './helpers/ai-fixtures';

/** Cao Cao marches on Ye and the battle is open on its first day. */
function conquestBattle(setup?: (state: ReturnType<typeof createV03Game>) => void) {
  let state = createV03Game('cao', 19);
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  city.food = 1_000_000;
  for (const [id, troops] of [
    ['caocao', 5000],
    ['xiahoudun', 2000],
  ] as const) {
    const officer = state.officers.find((entry) => entry.id === id)!;
    city.garrisonTroops += troops - officer.troops;
    Object.assign(officer, { troops, troopExperience: 1200 });
  }
  setup?.(state);
  state.personnelDay = createPersonnelDay(state);
  const dispatch = executeV03Command(state, {
    type: 'marchArmy',
    sourceCityId: city.id,
    targetCityId: 'ye',
    officerIds: ['caocao', 'xiahoudun'],
    intent: 'conquer',
  });
  expect(dispatch.ok, dispatch.error).toBe(true);
  state = dispatch.state;
  const journey = state.journeys.at(-1)!;
  journey.routeSnapshot = journey.routeSnapshot.map((segment) => ({
    ...segment,
    lengthKm: 1,
    fixedDelayDays: 0,
  }));
  journey.segmentProgressKm.fill(0);
  journey.segmentWaitDays.fill(0);
  state = executeV03Command(state, { type: 'advance', days: 1 }).state;
  const battle = state.battles.find((entry) => entry.active)!;
  expect(battle).toBeDefined();
  battle.battleData.map.terrain.fill('plain');
  return { state, battle };
}

/** Yuan Shao, played, withdraws from Ye, so Cao Cao takes the city. */
function captureYe(setup?: (state: ReturnType<typeof createV03Game>) => void) {
  const { state, battle } = conquestBattle(setup);
  state.playerFactionId = 'yuan';
  state.playerCapitalCityId = 'ye';
  state.factions.forEach((faction) => (faction.isPlayer = faction.id === 'yuan'));
  battle.battleData.playerSide = 'defender';
  battle.battleData.engaged = true;
  state.rng = 1;
  const result = applyV03BattleAction(state, battle.id, { type: 'retreat', side: 'defender' });
  expect(result.ok, result.error).toBe(true);
  expect(result.state.cities.find((city) => city.id === 'ye')?.factionId).toBe('cao');
  return { before: state, after: result.state, battle };
}

/** Yuan's house at Ye with a chosen ruler; Pingyuan alone is reachable unless Jinyang is kept. */
function rivalWithRuler(rulerId: string, keepJinyang = false) {
  const state = rivalDecisionFixture();
  if (!keepJinyang) state.cities = state.cities.filter((city) => city.id !== 'jinyang');
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

describe('PF-CA-02 wars with a purpose', () => {
  const neutral = temperamentFromTraits([]);

  it('values Luoyang, a recent loss and the leading house, within a cap', () => {
    const state = createV03Game('cao', 17, 'divided-realm-190');
    expect(campaignTargetValue(state, 'yuan', 'luoyang', neutral)).toBe(0.25);
    expect(campaignTargetValue(state, 'yuan', 'puyang', neutral)).toBe(0);

    const puyang = state.cities.find((city) => city.id === 'puyang')!;
    puyang.lostBy = { factionId: 'yuan', absoluteDay: state.absoluteDay };
    expect(campaignTargetValue(state, 'yuan', 'puyang', neutral)).toBe(0.25);
    expect(campaignTargetValue(state, 'liu', 'puyang', neutral)).toBe(0);
    state.absoluteDay += 361;
    expect(campaignTargetValue(state, 'yuan', 'puyang', neutral)).toBe(0);

    for (const id of ['xiapi', 'beiping', 'jiangling']) {
      state.cities.find((city) => city.id === id)!.factionId = 'cao';
    }
    expect(leadingFactionId(state)).toBe('cao');
    expect(campaignTargetValue(state, 'yuan', 'puyang', neutral)).toBe(0.2);
    expect(campaignTargetValue(state, 'cao', 'ye', neutral)).toBe(0);

    state.cities.find((city) => city.id === 'luoyang')!.factionId = 'cao';
    state.cities.find((city) => city.id === 'luoyang')!.lostBy = {
      factionId: 'dong',
      absoluteDay: state.absoluteDay,
    };
    // Luoyang + recent loss + leading house = 0.7, capped at 0.5.
    expect(campaignTargetValue(state, 'dong', 'luoyang', neutral)).toBe(0.5);
  });

  it('gives greedy rulers rich targets and cunning rulers isolated ones', () => {
    const state = createV03Game('cao', 17, 'divided-realm-190');
    const greedy = temperamentFromTraits(['greedy']);
    const values = state.cities
      .filter((city) => city.id !== 'luoyang')
      .map((city) => campaignTargetValue(state, 'dong', city.id, greedy));
    expect(Math.max(...values)).toBeGreaterThan(0.1);
    expect(Math.min(...values)).toBe(0);
    const cunning = temperamentFromTraits(['cunning']);
    // Pingyuan is Liu Bei's only city: nothing of his borders it.
    expect(campaignTargetValue(state, 'yuan', 'pingyuan', cunning)).toBe(0.15);
    expect(campaignTargetValue(state, 'yuan', 'chenliu', cunning)).toBe(0);
  });

  it('raises a recently lost city’s campaign score by its value', () => {
    const scores = (lost: boolean) => {
      const state = rivalWithRuler('yuejin', true);
      if (lost)
        state.cities.find((city) => city.id === 'jinyang')!.lostBy = {
          factionId: 'yuan',
          absoluteDay: state.absoluteDay,
        };
      return reviewStrategicRivalCampaigns(state, { factionId: 'yuan' })
        .opportunities.filter((opportunity) => opportunity.plan.targetCityId === 'jinyang')
        .map((opportunity) => opportunity.score);
    };
    const usual = scores(false);
    expect(usual.length).toBeGreaterThan(0);
    const valued = scores(true);
    expect(valued).toHaveLength(usual.length);
    valued.forEach((score, index) => expect(score).toBeCloseTo(usual[index]! * 1.25, 6));
  });

  it('records the loser on conquest and keeps it through save and load', () => {
    const { before, after } = captureYe();
    expect(before.cities.find((city) => city.id === 'ye')!.lostBy).toBeUndefined();
    expect(after.cities.find((city) => city.id === 'ye')!.lostBy).toEqual({
      factionId: 'yuan',
      absoluteDay: after.absoluteDay,
    });
    expect(validateV03State(after)).toBe(true);
    expect(decodeV03Save(encodeV03Save(after))).toEqual(after);
  });
});

describe('PF-CA-05 AI raids below the conquest threshold', () => {
  /** Pingyuan belongs to Liu Bei and is too strong to conquer, but not to raid. */
  function raidTarget(rulerId: string) {
    const state = rivalWithRuler(rulerId);
    Object.assign(
      state.cities.find((city) => city.id === 'pingyuan')!,
      {
        factionId: 'liu',
        garrisonTroops: 14_000,
      },
    );
    return state;
  }

  it('lets fierce and greedy rulers raid where a conquest is out of reach', () => {
    const fierce = planStrategicRivalCampaigns(raidTarget('yanliang'), { factionId: 'yuan' });
    expect(fierce).toHaveLength(1);
    expect(fierce[0]).toMatchObject({ intent: 'raid', targetCityId: 'pingyuan' });
    // Fourteen battle days of provisions instead of thirty.
    const conquestFood = estimateCampaignSupply({
      troopCount: fierce[0]!.requestedTroops,
      cavalryTroops: fierce[0]!.party.composition.cavalryTroops,
      outboundDays: fierce[0]!.route.estimatedDays,
      battleDays: 30,
      returnDays: fierce[0]!.route.estimatedDays,
    }).totalFood;
    expect(fierce[0]!.food).toBeLessThan(conquestFood);
    expect(
      planStrategicRivalCampaigns(raidTarget('yuanshao'), { factionId: 'yuan' })[0]?.intent,
    ).toBe('raid');
    expect(planStrategicRivalCampaigns(raidTarget('yuejin'), { factionId: 'yuan' })).toEqual([]);
    expect(planStrategicRivalCampaigns(raidTarget('liubei'), { factionId: 'yuan' })).toEqual([]);
  });

  it('waits out the plunder cooldown and never raids an independent city', () => {
    const recovering = raidTarget('yanliang');
    recovering.cities.find((city) => city.id === 'pingyuan')!.plunderCooldownUntilDay =
      recovering.absoluteDay + 30;
    expect(planStrategicRivalCampaigns(recovering, { factionId: 'yuan' })).toEqual([]);
    const independent = raidTarget('yanliang');
    independent.cities.find((city) => city.id === 'pingyuan')!.factionId = null;
    expect(planStrategicRivalCampaigns(independent, { factionId: 'yuan' })).toEqual([]);
  });

  it('dispatches a raid, warns the player and leaves the conquest objective alone', () => {
    const state = raidTarget('yanliang');
    state.playerFactionId = 'liu';
    state.factions.forEach((faction) => (faction.isPlayer = faction.id === 'liu'));
    const plan = planStrategicRivalCampaigns(state, { factionId: 'yuan' })[0]!;
    expect(dispatchRivalCampaignPlan(state, plan)).toBe(true);
    const journey = state.journeys.at(-1)!;
    expect(journey.intent).toBe('raid');
    expect(state.directives.at(-1)!.intent).toBe('raid');
    const warning = state.events.find((event) => event.kind === 'hostileApproach')!;
    expect(warning.params).toMatchObject({ intent: 'raid', targetCityId: 'pingyuan' });
    expect(formatEvent(warning, state, 'en')!.title).toBe('Raiders marching on Pingyuan');
    expect(
      state.factionObjectives?.some((objective) =>
        objective.orderIds.includes(journey.executionId),
      ),
    ).not.toBe(true);
  });

  it('refuses a raid plan from a ruler who does not raid', () => {
    const state = raidTarget('yanliang');
    const plan = planStrategicRivalCampaigns(state, { factionId: 'yuan' })[0]!;
    state.factions.find((faction) => faction.id === 'yuan')!.leaderOfficerId = 'yuejin';
    expect(dispatchRivalCampaignPlan(state, plan)).toBe(false);
  });
});
