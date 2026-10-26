import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { applyV03CityAction } from '../../../src/v03/governance/city-actions';
import {
  applyBattleAction,
  createBattleMap,
  createTacticalBattle,
  type BattleTactic,
} from '../../../src/v03/battle';
import {
  localizeRoutineBattleLog,
  localizeRoutineFeedback,
  localizeV03PersonOrFormationName,
} from '../../../src/v03/ui/feedback';
import { executeV03Command } from '../../../src/v03/commands';
import { v03BattleForState } from '../../../src/v03/engine';
import type { V03CityAction } from '../../../src/v03/types';

const game = createV03Game('cao', 31);

describe('v0.3 person and formation names', () => {
  it.each([
    ['Infantry · Cao Cao, Xiahou Yuan', '步兵 · 曹操、夏侯渊'],
    ['Cavalry · Xiahou Yuan', '骑兵 · 夏侯渊'],
    ['Archers · Cao Cao', '弓兵 · 曹操'],
    ['infantry · Cao Cao, Xiahou Yuan', '步兵 · 曹操、夏侯渊'],
    ['Militia', '民兵'],
    ['Cao Cao', '曹操'],
    ['骑兵 · 曹操、夏侯渊', '骑兵 · 曹操、夏侯渊'],
    ['Cavalry · Unknown officer 12', '骑兵 · Unknown officer 12'],
  ])('translates %s while preserving the English identity', (source, expected) => {
    expect(localizeV03PersonOrFormationName(source, 'zh', game)).toBe(expected);
    expect(localizeV03PersonOrFormationName(source, 'en', game)).toBe(source);
  });

  it('translates the actual grouped roster produced by a campaign arrival', () => {
    let state = createV03Game('cao', 481516);
    const dispatch = executeV03Command(state, {
      type: 'issueCampaignDirective',
      sourceCityId: 'puyang',
      targetCityId: 'xiapi',
      intent: 'conquer',
      requestedTroops: 700,
      requestedByDay: null,
    });
    expect(dispatch.ok, dispatch.error).toBe(true);
    state = dispatch.state;
    for (let day = 0; day < 120 && !state.battles.some((battle) => battle.active); day++) {
      for (const event of state.events.filter((entry) => !entry.acknowledged)) {
        state = executeV03Command(state, { type: 'acknowledgeEvent', eventId: event.id }).state;
      }
      const advance = executeV03Command(state, { type: 'advance', days: 1 });
      expect(advance.ok, advance.error).toBe(true);
      state = advance.state;
    }
    const battle = v03BattleForState(state, state.battles.find((entry) => entry.active)!.id);
    expect(battle).not.toBeNull();
    expect(battle!.units.some((unit) => unit.name.includes(' · '))).toBe(true);
    for (const unit of battle!.units) {
      const translated = localizeV03PersonOrFormationName(unit.name, 'zh', state);
      expect(translated).toMatch(/[\u3400-\u9fff]/u);
      expect(translated).not.toMatch(/[a-z]/iu);
      expect(localizeV03PersonOrFormationName(unit.name, 'en', state)).toBe(unit.name);
      const rejection = `${unit.name} has already acted today.`;
      expect(localizeRoutineFeedback(rejection, 'zh', state)).toBe(`${translated}今日已经行动。`);
      const fireLog = `${unit.name}'s fire tactic strikes Militia: 123 casualties.`;
      expect(localizeRoutineBattleLog(fireLog, state, 'zh')).toBe(
        `${translated}对民兵施展火计：伤亡 123。`,
      );
    }
  });
});

describe('v0.3 routine feedback', () => {
  it.each<V03CityAction>([
    'restore-loyalty',
    'develop-farming',
    'develop-commerce',
    'search',
    'recruit',
    'assign-troops',
    'train',
    'security',
    'feast',
    'reward',
    'relieve',
    'equip',
    'buy-food',
    'sell-food',
  ])('translates actual %s results and officer names while preserving English', (action) => {
    const state = createV03Game('cao', 31);
    const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
    const officer = state.officers.find((entry) => entry.id === 'caocao')!;
    Object.assign(city, {
      gold: 2000,
      food: 3000,
      population: 10000,
      reserve: 1000,
      garrisonTroops: 1000,
      loyalty: 50,
      farming: 30,
      commerce: 30,
      workPointsUsed: 0,
      workMonthIndex: state.monthIndex,
    });
    Object.assign(officer, {
      force: 50,
      loyalty: 50,
      experience: 25,
      level: 0,
      troops: 500,
      equipment: null,
    });
    const result = applyV03CityAction(state, {
      cityId: city.id,
      action,
      officerId: officer.id,
      amount: 600,
    });
    expect(result.ok).toBe(true);
    expect(result.message).toBeTruthy();
    const translated = localizeRoutineFeedback(result.message!, 'zh', result.state);
    expect(translated).toMatch(/[\u3400-\u9fff]/u);
    expect(translated).not.toContain('Cao Cao');
    expect(localizeRoutineFeedback(result.message!, 'en', result.state)).toBe(result.message);
  });

  it.each([
    'This officer has reached the current training limit.',
    'This action would spend gold reserved for an approved order.',
    'This action would spend food reserved for an approved order.',
    'These soldiers are reserved for an approved order.',
    'A governor or local steward handles this city’s internal administration.',
    'An officer commanding troops cannot take office until relieved.',
    'Acknowledge the current report before completing the battle day.',
    'The capital has used its 3 monthly work points.',
    'The city needs 180 gold to issue fine arms.',
    'This save uses an unsupported newer version. Open it with a compatible game version; existing data was left unchanged.',
    "Cao Cao is outside this tactic's range.",
  ])('translates current rejection: %s', (message) => {
    const translated = localizeRoutineFeedback(message, 'zh', game);
    expect(translated).toMatch(/[\u3400-\u9fff]/u);
    expect(translated).not.toContain('Cao Cao');
    expect(localizeRoutineFeedback(message, 'en', game)).toBe(message);
  });

  it('lets unknown messages use the established fallback', () => {
    expect(localizeRoutineFeedback('Future diagnostic text', 'zh', game)).toBeNull();
    expect(localizeRoutineBattleLog('Future diagnostic text', game, 'zh')).toBeNull();
  });
});

describe('v0.3 current tactical log vocabulary', () => {
  it.each<BattleTactic>(['fire', 'rally', 'confuse', 'raidSupply', 'ambush', 'rockfall'])(
    'translates an actual %s action, preserving numbers and water feedback',
    (tactic) => {
      const map = createBattleMap({ regionId: 'xiapi', approachDirection: 'north', seed: 31 });
      const state = createTacticalBattle({
        id: 'feedback-battle',
        map,
        seed: 31,
        playerSide: 'attacker',
        attackerUnits: [
          {
            id: 'caocao',
            name: 'Cao Cao',
            troopType: 'archer',
            troops: 3000,
            force: 100,
            intellect: 100,
            level: 5,
          },
        ],
        defenderUnits: [
          {
            id: 'guanyu',
            name: 'Guan Yu',
            troopType: 'infantry',
            troops: 3000,
            force: 70,
            intellect: 50,
          },
        ],
        supplies: { attacker: 3000, defender: 3000 },
      });
      state.map.terrain.fill('plain');
      const source = state.units[0]!;
      const target = state.units[1]!;
      Object.assign(source, { x: 10, y: 10 });
      Object.assign(target, { x: 11, y: 10 });
      state.map.terrain[10 * 24 + 11] = 'water';
      if (tactic === 'ambush') state.map.terrain[10 * 24 + 10] = 'forest';
      if (tactic === 'rockfall') state.map.terrain[10 * 24 + 10] = 'hill';
      const result = applyBattleAction(state, {
        type: 'tactic',
        tactic,
        unitId: source.id,
        targetId: tactic === 'rally' ? source.id : target.id,
      });
      expect(result.ok).toBe(true);
      const line = result.state.log.at(-1)!;
      const translated = localizeRoutineBattleLog(line, game, 'zh');
      expect(translated).toMatch(/[\u3400-\u9fff]/u);
      expect(translated).not.toMatch(/Cao Cao|Guan Yu|casualties|supplies|morale|chance|water/);
      for (const value of line.match(/\d+(?:\.\d+)?/g) ?? []) expect(translated).toContain(value);
      if (['fire', 'ambush', 'rockfall'].includes(tactic)) expect(translated).toContain('水上修正');
      expect(localizeRoutineBattleLog(line, game, 'en')).toBe(line);
    },
  );

  it.each([
    'Battle battle-13 begins on a xiapi field.',
    'Battle battle-13 begins at the Yellow River Ford.',
    'Cao Cao confuses Guan Yu; the unit will lose its next turn (90% chance).',
    "Guan Yu resists Cao Cao's confusion tactic (90% chance).",
    'Cao Cao rallies Cao Cao: morale +20; next attack +20%; confusion cleared.',
    'attacker army breaks and retreats; defender holds the battlefield.',
    'Cao Cao loses its turn to confusion.',
  ])('translates lifecycle/chance result: %s', (line) => {
    const translated = localizeRoutineBattleLog(line, game, 'zh');
    expect(translated).toMatch(/[\u3400-\u9fff]/u);
    expect(translated).not.toMatch(
      /Cao Cao|Guan Yu|chance|confusion|morale|holds the battlefield|begins on/,
    );
  });
});
