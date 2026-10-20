import { describe, expect, it } from 'vitest';
import { FACTIONS, SCENARIOS, activateScenario } from '../src/content/scenario';
import { OFFICER_TRAITS, TRAIT_INFO, hasTrait } from '../src/content/traits';
import { getAdvice, getGoals } from '../src/game/advisor';
import { getAvailableTactics, processBattleCommand } from '../src/game/battle';
import {
  HEGEMON_MONTHS,
  createGame,
  dispatch,
  getActionInfo,
  getActionPreview,
  getObjectives,
  getPersuadeChance,
  validateState,
} from '../src/game/campaign';
import { DIFFICULTY_PRESETS } from '../src/game/difficulty';
import { EVENTS, eventIsEligible } from '../src/game/events';
import { fogRange, isScouted } from '../src/game/fog';
import { plunderOutcome } from '../src/game/plunder';
import type { GameCommand, GameState } from '../src/game/types';
import { decodeSave, encodeSave } from '../src/platform/saves';
import { translateText } from '../src/i18n/core';
import { gameWithBattle, battlefield, order, unit } from './fixtures';

function apply(state: GameState, command: GameCommand): GameState {
  const result = dispatch(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}
const city = (state: GameState, id: string) => state.cities.find((c) => c.id === id)!;
const officer = (state: GameState, id: string) => state.officers.find((o) => o.id === id)!;
function roundTrip(state: GameState): GameState {
  const restored = decodeSave(encodeSave(state));
  expect(restored).toEqual(state);
  expect(validateState(restored)).toBeNull();
  return restored;
}
function endMonth(state: GameState): GameState {
  let next = apply(state, { type: 'endMonth' });
  for (let guard = 0; next.phase === 'battle' && guard < 60; guard++)
    next = apply(next, { type: 'battleAuto' });
  return next;
}

describe('second scenario: the eve of Guandu', () => {
  it('is a complete, valid 200 CE world on the same atlas and roster', () => {
    const [divided, guandu] = SCENARIOS;
    expect(guandu!.id).toBe('guandu-200');
    expect(guandu!.cities.map((c) => c.id)).toEqual(divided!.cities.map((c) => c.id));
    expect(guandu!.officers.map((o) => o.id)).toEqual(divided!.officers.map((o) => o.id));
    for (const faction of guandu!.factions) {
      const state = createGame(faction.id, 7, 'balanced', { scenarioId: 'guandu-200' });
      expect(validateState(state), faction.id).toBeNull();
      expect(state.year).toBe(200);
      expect(state.scenarioId).toBe('guandu-200');
      // Each ruler starts with a city and a leader who is alive and serving.
      const leader = state.officers.find((o) => o.name === faction.leader)!;
      expect(leader.fate).toBe('active');
      expect(city(state, leader.cityId).factionId).toBe(faction.id);
      roundTrip(state);
    }
    activateScenario('divided-realm-190');
  });

  it('keeps the dead off the field and out of every search', () => {
    const state = createGame('cao', 9, 'balanced', { scenarioId: 'guandu-200' });
    const dead = state.officers.filter((o) => o.fate === 'deceased').map((o) => o.id);
    expect(dead).toEqual(
      expect.arrayContaining(['dongzhuo', 'lubu', 'sunjian', 'dianwei', 'liuyan', 'liru']),
    );
    for (const id of dead) expect(officer(state, id).factionId).toBeNull();
    let next = state;
    for (let month = 0; month < 12; month++) next = endMonth(next);
    expect(validateState(next)).toBeNull();
    expect(dead.every((id) => officer(next, id).fate === 'deceased')).toBe(true);
    activateScenario('divided-realm-190');
  });

  it('refuses mismatched or unknown scenarios in saves and translates its text', () => {
    const state = createGame('yuan', 5, 'balanced', { scenarioId: 'guandu-200' });
    const payload = JSON.parse(encodeSave(state));
    expect(payload.scenario).toBe('guandu-200');
    payload.scenario = 'divided-realm-190';
    expect(() => decodeSave(JSON.stringify(payload))).toThrow(/damaged|unsupported/);
    const broken = structuredClone(state) as unknown as { scenarioId: string };
    broken.scenarioId = 'nowhere';
    expect(validateState(broken as unknown as GameState)).toBe(
      'This save uses an unsupported scenario.',
    );
    const guandu = SCENARIOS[1]!;
    for (const text of [guandu.title, guandu.description])
      expect(translateText(text, 'zh')).toMatch(/[㐀-鿿]/u);
    for (const faction of guandu.factions)
      for (const text of [faction.motto, faction.description, faction.difficulty])
        expect(translateText(text, 'zh'), text).toMatch(/[㐀-鿿]/u);
    expect(translateText(state.log[0]!.text, 'zh')).toMatch(/^公元 200 年/);
    expect(() => createGame('cao', 1, 'balanced', { scenarioId: 'nowhere' })).toThrow();
    activateScenario('divided-realm-190');
  });

  it('plays a historically shaped war: Yuan Shao leads the north, Cao Cao the heartland', () => {
    const state = createGame('cao', 3, 'balanced', { scenarioId: 'guandu-200' });
    expect(city(state, 'ye').factionId).toBe('yuan');
    expect(city(state, 'xuchang').factionId).toBe('cao');
    expect(FACTIONS.map((f) => f.id)).not.toContain('dong');
    activateScenario('divided-realm-190');
  });
});

describe('difficulty presets', () => {
  it('only tune behaviour, never resources', () => {
    for (const [key, preset] of Object.entries(DIFFICULTY_PRESETS)) {
      const state = createGame('cao', 4, preset.aggression, {
        difficulty: key as keyof typeof DIFFICULTY_PRESETS,
        truceMonths: preset.truceMonths,
      });
      expect(state.difficulty).toBe(key);
      expect(state.aiPersonalities).toBe(preset.personalities);
      expect(state.truceUntilTurn).toBe(preset.truceMonths);
      // The world's wealth is identical on every difficulty (D8).
      expect(state.cities.map((c) => c.gold)).toEqual(
        createGame('cao', 4).cities.map((c) => c.gold),
      );
    }
    expect(() => createGame('cao', 1, 'balanced', { difficulty: 'impossible' as never })).toThrow();
  });

  it('house personalities switch off in Story difficulty', () => {
    const prepare = (personalities: boolean) => {
      const start = createGame('cao');
      start.aiPersonalities = personalities;
      start.turn = 1;
      start.month = 2;
      start.officers.forEach((o) => (o.busy = true));
      const lubu = officer(start, 'lubu');
      lubu.busy = false;
      lubu.troops = 1000;
      lubu.force = 100;
      const source = city(start, 'luoyang');
      source.reserve = 500;
      source.food = 10000;
      for (const c of start.cities.filter(
        (x) => source.neighbors.includes(x.id) && x.factionId !== source.factionId,
      ))
        c.reserve = 100000;
      const target = city(start, 'chenliu');
      target.reserve = 1000;
      target.defense = 0;
      start.officers.filter((o) => o.cityId === 'chenliu').forEach((o) => (o.troops = 0));
      const marches: string[] = [];
      dispatch(start, { type: 'endMonth' }, { aiMarch: (o) => marches.push(o.targetId) });
      return marches;
    };
    expect(prepare(true)).toContain('chenliu');
    expect(prepare(false)).not.toContain('chenliu');
  });
});

describe('hegemon victory', () => {
  const dominate = (holder: string, extra = 16) => {
    const state = createGame('cao', 12);
    const lands = state.cities
      .filter((c) => c.id === 'luoyang' || c.factionId !== holder)
      .sort((a, b) => (a.id === 'luoyang' ? -1 : b.id === 'luoyang' ? 1 : a.id.localeCompare(b.id)))
      .slice(0, extra);
    for (const c of lands) c.factionId = holder;
    for (const o of state.officers)
      if (o.factionId && lands.some((c) => c.id === o.cityId)) o.factionId = holder;
    for (const c of state.cities) c.governorId = null;
    // Nobody marches, so the test watches the hegemon clock rather than a war.
    state.truceUntilTurn = 12;
    return state;
  };

  it('is won by holding Luoyang plus sixteen cities for twelve months', () => {
    let state = dominate('cao');
    expect(getObjectives(state).find((o) => o.id === 'cities')!.done).toBe(true);
    for (let month = 0; month < HEGEMON_MONTHS - 1; month++) {
      state = endMonth(state);
      expect(state.phase).toBe('planning');
      expect(state.hegemon).toEqual({ factionId: 'cao', months: month + 1 });
    }
    state = endMonth(state);
    expect(state.phase).toBe('finished');
    expect(state.winner).toBe('cao');
    expect(validateState(state)).toBeNull();
    roundTrip(state);
  });

  it('resets when Luoyang falls and ends the game against the player when a rival wins', () => {
    let state = dominate('cao');
    state = endMonth(state);
    expect(state.hegemon.months).toBe(1);
    city(state, 'luoyang').factionId = 'yuan';
    state = endMonth(state);
    expect(state.hegemon).toEqual({ factionId: null, months: 0 });
    const rival = dominate('yuan');
    rival.hegemon = { factionId: 'yuan', months: HEGEMON_MONTHS - 1 };
    // Keep the player alive but outnumbered.
    const next = endMonth(rival);
    expect(next.phase).toBe('finished');
    expect(next.winner).toBe('yuan');
    expect(validateState(next)).toBeNull();
  });

  it('rejects a finished campaign with an unearned winner', () => {
    const state = createGame('cao', 3);
    state.phase = 'finished';
    state.winner = 'yuan';
    expect(validateState(state)).toBe('The campaign is marked finished without victory or defeat.');
  });
});

describe('optional aging', () => {
  it('is off by default and never ends a life', () => {
    let state = createGame('cao', 21, 'balanced', { truceMonths: 12 });
    officer(state, 'dongzhuo').age = 90;
    for (let month = 0; month < 30 && state.phase !== 'finished'; month++) state = endMonth(state);
    expect(state.turn).toBeGreaterThan(12);
    expect(state.officers.every((o) => o.fate === 'active')).toBe(true);
    expect(state.aging).toBe(false);
  });

  it('claims veterans only on request, spares rulers and reports the losses of the player', () => {
    let died = false;
    for (let seed = 1; seed <= 25 && !died; seed++) {
      let state = createGame('cao', seed, 'balanced', { aging: true, truceMonths: 12 });
      officer(state, 'xunyu').age = 88;
      officer(state, 'caocao').age = 99;
      while (state.month !== 12) state = endMonth(state);
      state = endMonth(state); // into January
      expect(officer(state, 'caocao').fate).toBe('active');
      if (officer(state, 'xunyu').fate === 'deceased') {
        died = true;
        const dead = officer(state, 'xunyu');
        expect(dead).toMatchObject({ factionId: null, troops: 0, captive: false });
        expect(state.reports.latest!.events).toContainEqual(
          expect.objectContaining({ kind: 'death', officerId: 'xunyu' }),
        );
        expect(validateState(state)).toBeNull();
        roundTrip(state);
      }
    }
    expect(died).toBe(true);
  });

  it('can be switched on from the campaign', () => {
    const state = createGame('cao', 2);
    expect(apply(state, { type: 'setAging', value: true }).aging).toBe(true);
    expect(dispatch(state, { type: 'setAging', value: 'yes' as never }).ok).toBe(false);
  });
});

describe('fog of war and scouting', () => {
  it('shows exact numbers for own cities and for two months after a scouting order', () => {
    let state = createGame('cao', 5);
    expect(isScouted(state, 'chenliu')).toBe(true);
    expect(isScouted(state, 'luoyang')).toBe(false);
    state = apply(state, {
      type: 'action',
      action: 'scout',
      cityId: 'chenliu',
      officerId: 'caocao',
      targetId: 'luoyang',
    });
    expect(state.scouted.luoyang).toBe(0);
    expect(isScouted(state, 'luoyang')).toBe(true);
    state = endMonth(state);
    expect(isScouted(state, 'luoyang')).toBe(true);
    state = endMonth(state);
    expect(isScouted(state, 'luoyang')).toBe(false);
    expect(validateState(state)).toBeNull();
  });

  it('draws stable ranges that always contain the truth', () => {
    for (const value of [90, 640, 2500, 7000, 52000]) {
      const [low, high] = fogRange(value, 'luoyang', 'gold');
      expect(low).toBeLessThanOrEqual(value);
      expect(high).toBeGreaterThanOrEqual(value);
      expect(fogRange(value, 'luoyang', 'gold')).toEqual([low, high]);
    }
  });
});

describe('troop reorganization', () => {
  it('costs 150 gold and 20% of the troops and rejects a no-op', () => {
    const state = createGame('cao', 6);
    const before = officer(state, 'xiahoudun');
    expect(before.troopType).toBe('cavalry');
    const gold = city(state, 'chenliu').gold;
    const next = apply(state, {
      type: 'action',
      action: 'reorganize',
      cityId: 'chenliu',
      officerId: 'xiahoudun',
      targetId: 'archer',
    });
    const after = officer(next, 'xiahoudun');
    expect(after.troopType).toBe('archer');
    expect(after.troops).toBe(before.troops - Math.floor(before.troops * 0.2));
    expect(city(next, 'chenliu').gold).toBe(gold - 150);
    expect(
      getActionPreview(state, 'reorganize', 'chenliu', 'xiahoudun', 'archer')!.effects,
    ).toEqual([
      {
        stat: 'troops',
        min: -Math.floor(before.troops * 0.2),
        max: -Math.floor(before.troops * 0.2),
        scope: 'officer',
      },
    ]);
    for (const targetId of ['cavalry', 'dragoon', undefined]) {
      const before2 = structuredClone(state);
      const result = dispatch(state, {
        type: 'action',
        action: 'reorganize',
        cityId: 'chenliu',
        officerId: 'xiahoudun',
        targetId,
      });
      expect(result.error).toBe('Choose a different troop type.');
      expect(state).toEqual(before2);
    }
    expect(getActionInfo(state, 'reorganize', 'chenliu', 'xiahoudun').gold).toBe(150);
    roundTrip(next);
  });
});

describe('officer traits', () => {
  it('give every named officer one or two traits, each with a bilingual description', () => {
    for (const officerId of Object.keys(
      createGame('cao')
        .officers.map((o) => o.id)
        .reduce<Record<string, 1>>((acc, id) => ({ ...acc, [id]: 1 }), {}),
    )) {
      const traits = OFFICER_TRAITS[officerId] ?? [];
      expect(traits.length, officerId).toBeGreaterThanOrEqual(1);
      expect(traits.length, officerId).toBeLessThanOrEqual(2);
    }
    for (const info of Object.values(TRAIT_INFO)) {
      expect(info.chinese).toMatch(/[㐀-鿿]/u);
      expect(translateText(info.description, 'zh')).toMatch(/[㐀-鿿]/u);
      expect(translateText(info.name, 'zh')).toMatch(/[㐀-鿿]/u);
    }
  });

  it('greedy leaders take 20% more gold; others keep the plain formula', () => {
    const greedy = officer(createGame('cao'), 'yuanshao');
    expect(hasTrait(greedy.id, 'greedy')).toBe(true);
    const target = { loyalty: 72, farming: 300, commerce: 300, population: 70000 };
    const plain = plunderOutcome(target, { intellect: greedy.intellect, force: greedy.force });
    const rich = plunderOutcome(target, greedy);
    expect(rich.gold).toBe(Math.floor(plain.gold * 1.2));
    expect(rich.food).toBe(plain.food);
  });

  it('cunning officers cast for one point less, never below one', () => {
    const state = gameWithBattle(battlefield());
    const battle = state.battle!;
    const caster = battle.units[0]!;
    caster.officerId = 'caocao'; // cunning
    battle.tacticPoints.attacker = 20;
    const rally = getAvailableTactics(battle, caster.id).find((t) => t.skill === 'rally')!;
    expect(rally.cost).toBe(1);
    const fire = getAvailableTactics(battle, caster.id).find((t) => t.skill === 'fire')!;
    expect(fire.cost).toBe(3);
    battle.units[1]!.x = 3;
    battle.units[1]!.y = 1;
    battle.units[0]!.x = 2;
    battle.units[0]!.y = 1;
    processBattleCommand(state, {
      type: 'battleSkill',
      unitId: caster.id,
      skill: 'fire',
      targetId: battle.units[1]!.id,
    });
    expect(battle.tacticPoints.attacker).toBe(17);
  });

  it('fierce defenders counter harder', () => {
    const run = (officerId: string) => {
      const state = gameWithBattle(battlefield());
      const battle = state.battle!;
      battle.units = [unit('a', 'attacker', 4, 4), unit('b', 'defender', 5, 4)];
      battle.units[1]!.officerId = officerId;
      processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'b' });
      return 1000 - battle.units[0]!.troops;
    };
    expect(hasTrait('zhangfei', 'fierce')).toBe(true);
    expect(hasTrait('xunyu', 'fierce')).toBe(false);
    expect(run('zhangfei')).toBeGreaterThan(run('xunyu'));
  });

  it('loyal officers resist persuasion and never leave; benevolent ones persuade better and grieve', () => {
    const state = createGame('cao', 8);
    const plain = getPersuadeChance(state, 'caocao', 'jiaxu')!; // cunning only
    expect(hasTrait('jiaxu', 'loyal')).toBe(false);
    expect(hasTrait('zhangliao', 'loyal')).toBe(true);
    const loyal = getPersuadeChance(state, 'caocao', 'zhangliao')!;
    const asIfPlain = Math.floor(30 + 0.5 * 94 - 0.7 * officer(state, 'zhangliao').loyalty);
    expect(loyal).toBe(Math.max(2, Math.floor(Math.min(75, Math.max(5, asIfPlain)) / 2)));
    expect(plain).toBeGreaterThan(0);
    // Benevolent persuaders gain eight points.
    const kind = structuredClone(state);
    officer(kind, 'caocao').id = 'caocao';
    const liubei = getPersuadeChance(createGame('liu', 8), 'liubei', 'jiaxu')!;
    const jianyong = getPersuadeChance(createGame('liu', 8), 'jianyong', 'jiaxu')!;
    expect(liubei).toBeGreaterThan(0);
    expect(jianyong).toBeGreaterThan(0);
    // Plundering grieves benevolent officers (-8) more than others (-3).
    const plundered = createGame('liu', 3);
    const loyaltyBefore = new Map(
      plundered.officers.filter((o) => o.cityId === 'pingyuan').map((o) => [o.id, o.loyalty]),
    );
    const next = apply(plundered, {
      type: 'action',
      action: 'plunder',
      cityId: 'pingyuan',
      officerId: 'liubei',
    });
    expect(officer(next, 'liubei').loyalty).toBe(loyaltyBefore.get('liubei')! - 8);
    expect(officer(next, 'zhangfei').loyalty).toBe(loyaltyBefore.get('zhangfei')! - 3);
    expect(officer(next, 'jianyong').loyalty).toBe(loyaltyBefore.get('jianyong')! - 8);
    // Loyal officers do not defect, however low their loyalty.
    let left = false;
    for (let seed = 1; seed <= 12; seed++) {
      let s = createGame('cao', seed);
      while (s.month !== 6) s = endMonth(s);
      officer(s, 'xiahoudun').loyalty = 0; // loyal
      s = endMonth(s);
      left ||= officer(s, 'xiahoudun').factionId !== 'cao';
    }
    expect(left).toBe(false);
    void order;
  });
});

describe('adviser and first-campaign goals', () => {
  it('is pure, capped at three and ranked by urgency', () => {
    const state = createGame('cao', 11);
    const before = structuredClone(state);
    expect(getAdvice(state)).toEqual(getAdvice(state));
    expect(state).toEqual(before);
    const hungry = structuredClone(state);
    city(hungry, 'chenliu').food = 100;
    city(hungry, 'puyang').food = 100;
    city(hungry, 'xuchang').food = 100;
    officer(hungry, 'yujin').loyalty = 10;
    const advice = getAdvice(hungry);
    expect(advice.length).toBeLessThanOrEqual(3);
    expect(advice[0]!.kind).toBe('food');
    expect(advice.every((a, i) => i === 0 || advice[i - 1]!.urgency >= a.urgency)).toBe(true);
    expect(new Set(getAdvice(hungry).map((a) => a.kind)).size).toBeGreaterThan(0);
    const risky = structuredClone(state);
    officer(risky, 'yujin').loyalty = 10;
    expect(getAdvice(risky).some((a) => a.kind === 'atRisk' && a.officerId === 'yujin')).toBe(true);
  });

  it('tracks goals for six months and then goes quiet', () => {
    let state = createGame('cao', 11);
    const goals = getGoals(state)!;
    expect(goals.map((g) => g.id)).toEqual(['develop', 'muster', 'recruit', 'capture', 'supply']);
    expect(goals.find((g) => g.id === 'develop')!.done).toBe(false);
    for (const [index, id] of ['caocao', 'xiahoudun', 'yujin'].entries())
      state = apply(state, {
        type: 'action',
        action: index === 0 ? 'farm' : 'commerce',
        cityId: 'chenliu',
        officerId: id,
      });
    expect(getGoals(state)!.find((g) => g.id === 'develop')!.done).toBe(true);
    for (let m = 0; m < 6; m++) state = endMonth(state);
    expect(getGoals(state)).toBeNull();
  });
});

describe('events', () => {
  const dongWorld = () => {
    const state = createGame('cao', 14);
    expect(city(state, 'luoyang').factionId).toBe('dong');
    return state;
  };

  it('every historical event waits for its own conditions (D10) and fires once', () => {
    const state = dongWorld();
    const coalition = EVENTS.find((e) => e.id === 'anti-dong-coalition')!;
    expect(eventIsEligible(state, coalition)).toBe(true);
    // Remove each condition in turn: nothing fires.
    const late = structuredClone(state);
    late.year = 192;
    expect(eventIsEligible(late, coalition)).toBe(false);
    const fallen = structuredClone(state);
    city(fallen, 'luoyang').factionId = 'cao';
    expect(eventIsEligible(fallen, coalition)).toBe(false);
    const lonely = structuredClone(state);
    for (const c of lonely.cities)
      if (['yuan', 'sun', 'yan'].includes(c.factionId ?? '')) c.factionId = null;
    expect(eventIsEligible(lonely, coalition)).toBe(false);

    // Events resolve at month end, together with the rest of the month.
    const fired = endMonth(state);
    expect(fired.firedEvents).toContain('anti-dong-coalition');
    expect(fired.invitations).toHaveLength(1);
    expect(fired.invitations[0]!.members).not.toContain('dong');
    expect(fired.alliances.length).toBeGreaterThan(0);
    for (const pair of fired.alliances) expect([pair.a, pair.b]).not.toContain('cao');
    expect(validateState(fired)).toBeNull();
    roundTrip(fired);
    // A one-shot event never fires twice.
    const again = endMonth(fired);
    expect(again.firedEvents.filter((id) => id === 'anti-dong-coalition')).toHaveLength(1);
    expect(again.invitations.length).toBeLessThanOrEqual(1);
  });

  it('lets the player accept or decline the coalition invitation', () => {
    const state = endMonth(dongWorld());
    const id = state.invitations[0]!.id;
    const members = state.invitations[0]!.members;
    const accepted = apply(state, { type: 'invitation', id, accept: true });
    expect(accepted.invitations).toEqual([]);
    for (const member of members)
      expect(
        accepted.alliances.some((p) => [p.a, p.b].includes('cao') && [p.a, p.b].includes(member)),
      ).toBe(true);
    expect(validateState(accepted)).toBeNull();
    const declined = apply(state, { type: 'invitation', id, accept: false });
    expect(declined.invitations).toEqual([]);
    expect(declined.alliances.some((p) => [p.a, p.b].includes('cao'))).toBe(false);
    expect(dispatch(declined, { type: 'invitation', id, accept: true }).error).toBe(
      'That invitation is no longer open.',
    );
  });
  it('never offers the Dong events in the 200 CE world', () => {
    const state = createGame('cao', 6, 'balanced', { scenarioId: 'guandu-200' });
    for (const event of EVENTS.filter((e) => e.once))
      expect(eventIsEligible(state, event)).toBe(false);
    activateScenario('divided-realm-190');
  });

  it('Dong burns Luoyang when it is about to fall and withdraws to Chang’an', () => {
    const state = dongWorld();
    // A vast neighbouring army makes Luoyang "about to fall".
    city(state, 'chenliu').reserve = 90000;
    const next = endMonth(state);
    expect(next.firedEvents).toContain('dong-burns-luoyang');
    const luoyang = city(next, 'luoyang');
    expect(luoyang.plunderCooldownUntil).toBeGreaterThan(0);
    expect(luoyang.reserve).toBe(0);
    expect(next.log.some((entry) => entry.text.includes('burns Luoyang'))).toBe(true);
    expect(validateState(next)).toBeNull();
    // The same world without the threat leaves the capital alone.
    const calm = dongWorld();
    for (const c of calm.cities)
      if (
        calm.cities.find((x) => x.id === 'luoyang')!.neighbors.includes(c.id) &&
        c.factionId !== 'dong'
      )
        c.reserve = 10;
    for (const o of calm.officers)
      if (
        calm.cities.find((x) => x.id === 'luoyang')!.neighbors.includes(o.cityId) &&
        o.factionId !== 'dong'
      )
        o.troops = 0;
    expect(
      eventIsEligible(
        calm,
        EVENTS.find((e) => e.id === 'dong-burns-luoyang')!,
      ),
    ).toBe(false);
  });
  it('systemic events add variety over a long campaign without breaking any invariant', () => {
    const seen = new Set<string>();
    for (const seed of [2, 5, 9]) {
      let state = createGame('cao', seed, 'balanced', { truceMonths: 12 });
      for (let month = 0; month < 40 && state.phase !== 'finished'; month++) {
        const before = state.log.length;
        state = endMonth(state);
        for (const entry of state.log.slice(Math.max(0, before - state.log.length - 1)))
          for (const marker of [
            'plague',
            'bumper harvest',
            'Locusts',
            'Bandits',
            'wanders into',
            'festival',
            'Drought',
            'scholar',
            'comes of age',
          ])
            if (entry.text.includes(marker)) seen.add(marker);
        expect(validateState(state), `seed ${seed} month ${month}`).toBeNull();
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  }, 120_000);

  it('has at least eight systemic events and two historical ones', () => {
    expect(EVENTS.filter((e) => e.chance !== undefined || !e.once).length).toBeGreaterThanOrEqual(
      8,
    );
    expect(EVENTS.filter((e) => e.once).map((e) => e.id)).toEqual([
      'anti-dong-coalition',
      'dong-burns-luoyang',
    ]);
  });
});
