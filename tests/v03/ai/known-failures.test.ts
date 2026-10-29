import { describe, expect, it } from 'vitest';
import { planStrategicRivalCampaigns } from '../../../src/v03/strategic-ai';
import {
  applyBattleAction,
  getBattleTacticTargets,
  predictBattleAttack,
  runBattleAiTurn,
} from '../../../src/v03/battle';
import { rivalDecisionFixture, decisionBattle } from '../helpers/ai-fixtures';

const unresolved = process.env.V04_REPRODUCE_FAILURES === '1' ? it : it.fails;

/** These expected failures establish reviewed defects; convert each to a normal regression in its ticket. */
describe('v0.4 reproduced behavior requirements', () => {
  it('V04-01: an allied empty city cannot mask a legal independent target', () => {
    const state = rivalDecisionFixture();
    Object.assign(
      state.cities.find((city) => city.id === 'pingyuan')!,
      { factionId: 'liu', garrisonTroops: 0 },
    );
    state.alliances.push({ a: 'yuan', b: 'liu', expiresMonthIndex: 2 });
    expect(
      planStrategicRivalCampaigns(state).find((plan) => plan.factionId === 'yuan')?.targetCityId,
    ).toBe('jinyang');
  });

  unresolved('V04-06: a routine 1:10 conquest is rejected in favor of preparation', () => {
    const state = rivalDecisionFixture();
    for (const city of state.cities) if (city.id !== 'ye') city.garrisonTroops = 50_000;
    expect(planStrategicRivalCampaigns(state).filter((plan) => plan.factionId === 'yuan')).toEqual(
      [],
    );
  });

  unresolved('V04-06: consider a smaller affordable party while retaining home provisions', () => {
    const state = rivalDecisionFixture();
    state.cities = state.cities.filter((city) => city.id !== 'jinyang');
    Object.assign(
      state.cities.find((city) => city.id === 'pingyuan')!,
      { garrisonTroops: 0 },
    );
    state.cities.find((city) => city.id === 'ye')!.food = 6000;
    const plans = planStrategicRivalCampaigns(state).filter((plan) => plan.factionId === 'yuan');
    expect(plans).toHaveLength(1);
    expect(plans[0]!.requestedTroops).toBeLessThan(5000);
    expect(plans[0]!.food).toBeLessThan(6000);
  });

  unresolved(
    'V04-03: Confuse can deny the next activation after a target has already acted',
    () => {
      const battle = decisionBattle();
      const source = battle.units.find((unit) => unit.id === 'actor')!;
      source.intellect = 120;
      const target = battle.units.find((unit) => unit.id === 'strong')!;
      target.acted = true;
      expect(getBattleTacticTargets(battle, source.id, 'confuse').map((unit) => unit.id)).toContain(
        target.id,
      );
    },
  );

  unresolved('V04-03: the Inspired bonus is consumed by its first ordinary hit', () => {
    const battle = decisionBattle();
    const source = battle.units.find((unit) => unit.id === 'actor')!;
    source.status = 'inspired';
    const result = applyBattleAction(battle, {
      type: 'attack',
      unitId: source.id,
      targetId: 'strong',
    });
    expect(result.ok).toBe(true);
    expect(result.state.units.find((unit) => unit.id === source.id)!.status).toBe('normal');
  });

  unresolved(
    'V04-04: compare Fire with the best ordinary target before spending tactic points',
    () => {
      const battle = decisionBattle();
      const forecast = predictBattleAttack(battle, 'actor', 'strong')!;
      expect(forecast.estimatedCasualties).toBeGreaterThan(300);
      expect(forecast.counterattack.possible).toBe(false);
      const result = runBattleAiTurn(battle, 'attacker');
      expect(result.tacticPoints.attacker).toBe(battle.tacticPoints.attacker);
      expect(result.units.find((unit) => unit.id === 'strong')!.troops).toBe(
        3000 - forecast.estimatedCasualties!,
      );
    },
  );
});
