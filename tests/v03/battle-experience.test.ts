import { describe, expect, it } from 'vitest';
import {
  applyBattleAction,
  createBattleMap,
  createTacticalBattle,
  predictBattleAttack,
  predictBattleTactic,
  runBattleAiTurn,
  type BattleTactic,
} from '../../src/v03/battle';
import { battleExperienceGain, troopDamageMultiplier } from '../../src/v03/battle/experience';
import { awardTroopExperience } from '../../src/v03/campaign/troop-experience';

function battlefield(sourceExperience = 0, targetExperience = 0) {
  const roster = { troopType: 'infantry' as const, troops: 1000, force: 70, intellect: 85 };
  const state = createTacticalBattle({
    id: 'experience-test',
    map: createBattleMap({ regionId: 'xiapi', seed: 15 }),
    attackerUnits: [{ ...roster, id: 'a', name: 'Attacker', troopExperience: sourceExperience }],
    defenderUnits: [{ ...roster, id: 'd', name: 'Defender', troopExperience: targetExperience }],
    supplies: { attacker: 10000, defender: 10000 },
  });
  state.map.terrain.fill('plain');
  Object.assign(state.units[0]!, { x: 6, y: 6 });
  Object.assign(state.units[1]!, { x: 7, y: 6 });
  return state;
}

describe('soldier combat experience', () => {
  it.each([
    [0, 1, 1],
    [400, 1.08, 0.96],
    [900, 1.18, 0.91],
    [1000, 1.2, 0.9],
    [1900, 1.38, 0.81],
  ])('uses the approved smooth level multipliers at %i experience', (xp, attack, defense) => {
    expect(troopDamageMultiplier(xp!, 0)).toBeCloseTo(attack!);
    expect(troopDamageMultiplier(0, xp!)).toBeCloseTo(defense!);
  });

  it.each(['plain', 'hill', 'water'] as const)(
    'composes level, terrain and water damage on %s and forecasts both sides exactly',
    (terrain) => {
      const baseline = battlefield();
      baseline.map.terrain[6 * baseline.map.width + 7] = terrain;
      const experienced = structuredClone(baseline);
      experienced.units[0]!.troopExperience = 1900;
      experienced.units[1]!.troopExperience = 1000;
      const ordinary = predictBattleAttack(baseline, 'a', 'd')!;
      const forecast = predictBattleAttack(experienced, 'a', 'd')!;
      expect(
        Math.abs(forecast.estimatedCasualties! - ordinary.estimatedCasualties! * 1.38 * 0.9),
      ).toBeLessThan(2);
      const before = structuredClone(experienced);
      const result = applyBattleAction(experienced, { type: 'attack', unitId: 'a', targetId: 'd' });
      expect(result.ok).toBe(true);
      expect(experienced).toEqual(before);
      const [a, d] = result.state.units;
      expect(d!.troops).toBe(1000 - forecast.estimatedCasualties!);
      expect(a!.troops).toBe(1000 - forecast.counterattack.estimatedCasualties!);
      expect(a!.combatCasualtiesDealt).toBe(d!.combatCasualtiesReceived);
      expect(d!.combatCasualtiesDealt).toBe(a!.combatCasualtiesReceived);
      expect(a!.combatCasualtiesDealt).toBe(forecast.estimatedCasualties);
      expect(d!.combatCasualtiesDealt).toBe(forecast.counterattack.estimatedCasualties);
      expect(a!.troopExperience).toBe(1900);
      expect(d!.troopExperience).toBe(1000);
    },
  );

  it.each([
    ['fire', 'plain'],
    ['ambush', 'forest'],
    ['rockfall', 'hill'],
  ] as const)(
    'counts %s casualties but applies no soldier-level tactic bonus',
    (tactic, terrain) => {
      const fresh = battlefield();
      fresh.map.terrain[6 * fresh.map.width + 6] = terrain;
      const veteran = structuredClone(fresh);
      veteran.units.forEach((unit) => (unit.troopExperience = 1900));
      expect(predictBattleTactic(veteran, 'a', tactic, 'd')).toEqual(
        predictBattleTactic(fresh, 'a', tactic, 'd'),
      );
      const command = { type: 'tactic' as const, unitId: 'a', tactic, targetId: 'd' };
      const normal = applyBattleAction(fresh, command);
      const skilled = applyBattleAction(veteran, command);
      expect(normal.ok && skilled.ok).toBe(true);
      const [a, d] = skilled.state.units;
      expect(d!.troops).toBe(normal.state.units[1]!.troops);
      expect(a!.combatCasualtiesDealt).toBe(1000 - d!.troops);
      expect(d!.combatCasualtiesReceived).toBe(a!.combatCasualtiesDealt);
      expect(a!.combatCasualtiesDealt).toBeGreaterThan(0);
      expect(
        battleExperienceGain(a!, { winner: 'attacker', reason: 'elimination' }),
      ).toBeGreaterThan(60);
    },
  );

  it.each(['rally', 'confuse', 'raidSupply'] satisfies BattleTactic[])(
    '%s alone does not qualify a unit for participation or victory experience',
    (tactic) => {
      const state = battlefield();
      const result = applyBattleAction(state, {
        type: 'tactic',
        unitId: 'a',
        tactic,
        targetId: tactic === 'rally' ? 'a' : 'd',
      });
      expect(result.ok).toBe(true);
      for (const unit of result.state.units)
        expect(battleExperienceGain(unit, { winner: unit.side, reason: 'elimination' })).toBe(0);
    },
  );

  it('does not reward pure movement, waiting or noncombat losses', () => {
    const state = battlefield();
    state.units[1]!.x = 12;
    const moved = applyBattleAction(state, { type: 'move', unitId: 'a', x: 5, y: 6 });
    expect(moved.ok).toBe(true);
    const waited = applyBattleAction(moved.state, { type: 'wait', unitId: 'a' });
    expect(waited.ok).toBe(true);
    const unit = waited.state.units[0]!;
    unit.troops -= 100;
    expect(battleExperienceGain(unit, { winner: 'attacker', reason: 'dayLimit' })).toBe(0);
  });

  it('clips overkill to actual casualties and never rewards a dead force', () => {
    const state = battlefield(900, 1200);
    state.units[1]!.troops = 1;
    const result = applyBattleAction(state, { type: 'attack', unitId: 'a', targetId: 'd' });
    expect(result.ok).toBe(true);
    const [a, d] = result.state.units;
    expect(a!.combatCasualtiesDealt).toBe(1);
    expect(d).toMatchObject({ troops: 0, troopExperience: 0, combatCasualtiesReceived: 1 });
    expect(battleExperienceGain(d!, result.state.outcome!)).toBe(0);
    expect(a!.troopExperience).toBe(900); // Outcome alone does not settle campaign rewards.
    expect(battleExperienceGain(a!, result.state.outcome!)).toBeCloseTo(60.08);
  });

  it('rewards both AI and player actions through the same combat path', () => {
    const state = battlefield(900, 1000);
    state.tacticPoints.defender = 0;
    const forecast = predictBattleAttack(state, 'd', 'a')!;
    const next = runBattleAiTurn(state, 'defender');
    expect(next.units[1]!.combatCasualtiesDealt).toBe(forecast.estimatedCasualties);
    expect(next.units[0]!.combatCasualtiesDealt).toBe(forecast.counterattack.estimatedCasualties);
    expect(next.units.map((u) => u.troopExperience)).toEqual([900, 1000]);
  });

  it('uses starting headcount, preserves fractional gains, and caps gains and total experience', () => {
    const unit = battlefield().units[0]!;
    unit.troops = 100;
    unit.combatCasualtiesDealt = 500;
    expect(battleExperienceGain(unit, { winner: 'attacker', reason: 'elimination' })).toBe(100);
    expect(battleExperienceGain(unit, { winner: 'defender', reason: 'retreat' })).toBe(80);
    expect(battleExperienceGain(unit, { winner: null, reason: 'dayLimit' })).toBe(80);
    unit.combatCasualtiesDealt = 0;
    unit.combatCasualtiesReceived = 900;
    expect(battleExperienceGain(unit, { winner: 'defender', reason: 'retreat' })).toBe(40);
    expect(battleExperienceGain(unit, { winner: 'attacker', reason: 'elimination' })).toBe(60);
    unit.combatCasualtiesDealt = 10000;
    const gain = battleExperienceGain(unit, { winner: 'attacker', reason: 'elimination' });
    expect(gain).toBe(140);
    unit.troopExperience = 1890;
    awardTroopExperience(unit, gain);
    expect(unit.troopExperience).toBe(1900);
    const empty = { troops: 0, troopExperience: 0 };
    awardTroopExperience(empty, gain);
    expect(empty.troopExperience).toBe(0);
  });
});
