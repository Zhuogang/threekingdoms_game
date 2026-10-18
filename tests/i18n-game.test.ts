import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  FACTIONS,
  INITIAL_CITIES,
  INITIAL_OFFICERS,
  SCENARIO,
  TROOP_LABELS,
} from '../src/content/scenario';
import { autoResolveBattle } from '../src/game/battle';
import { createGame, dispatch, getActionInfo } from '../src/game/campaign';
import type { Action, GameCommand, GameState } from '../src/game/types';
import { translateText } from '../src/i18n/core';

function expectChinese(source: string): void {
  const translated = translateText(source, 'zh');
  expect(translated, source).not.toBe(source);
  expect(translated, source).toMatch(/[\u3400-\u9fff]/u);
  expect(translated, source).not.toMatch(/[a-z]/iu);
  expect(translated, source).not.toMatch(/\{\w+\}/u);
  expect(translateText(source, 'en')).toBe(source);
}

function apply(state: GameState, command: GameCommand): GameState {
  const result = dispatch(state, command);
  expect(result.ok, result.error).toBe(true);
  return result.state;
}

describe('canonical game text localization', () => {
  it('translates scenario, factions, city and officer names without replacing canonical data', () => {
    const original = JSON.stringify({ SCENARIO, FACTIONS, INITIAL_CITIES, INITIAL_OFFICERS });
    expectChinese(SCENARIO.title);
    expectChinese(SCENARIO.description);
    for (const faction of FACTIONS) {
      for (const value of [faction.name, faction.motto, faction.description, faction.difficulty])
        expectChinese(value);
      expect(translateText(faction.name, 'zh')).toBe(
        INITIAL_OFFICERS.find((officer) => officer.name === faction.leader)!.chinese,
      );
    }
    for (const city of INITIAL_CITIES) {
      expect(translateText(city.name, 'zh')).toBe(city.chinese);
      expectChinese(city.region);
      expect(translateText(`${city.name} garrison`, 'zh')).toBe(`${city.chinese}守军`);
    }
    for (const officer of INITIAL_OFFICERS)
      expect(translateText(officer.name, 'zh')).toBe(officer.chinese);
    for (const label of Object.values(TROOP_LABELS)) expectChinese(label);
    expect(JSON.stringify({ SCENARIO, FACTIONS, INITIAL_CITIES, INITIAL_OFFICERS })).toBe(original);
  });

  it.each<Action>([
    'farm',
    'commerce',
    'govern',
    'search',
    'recruit',
    'train',
    'reward',
    'feast',
    'buyFood',
    'sellFood',
    'relieve',
    'scout',
    'persuade',
    'subvert',
    'alliance',
    'equip',
    'confiscate',
    'banish',
    'appoint',
  ])('localizes %s labels, descriptions, eligibility and actual action logs', (action) => {
    const state = createGame('cao', 12);
    const officer = state.officers.find((candidate) => candidate.id === 'xiahoudun')!;
    if (action === 'confiscate') {
      officer.equipment = 'Fine arms';
      officer.force += 5;
    }
    const info = getActionInfo(state, action, 'chenliu', officer.id);
    expectChinese(info.label);
    expectChinese(info.description);
    expectChinese(getActionInfo(state, action, 'chenliu').reason!);
    const targetId =
      action === 'persuade'
        ? 'dianwei'
        : action === 'alliance'
          ? 'dong'
          : ['scout', 'subvert'].includes(action)
            ? 'luoyang'
            : undefined;
    const next = apply(state, {
      type: 'action',
      action,
      cityId: 'chenliu',
      officerId: officer.id,
      targetId,
    });
    const before = JSON.stringify(next);
    const newLog = next.log.at(-1)!.text;
    expectChinese(newLog);
    expect(translateText(newLog, 'zh')).toContain('陈留');
    expect(JSON.stringify(next)).toBe(before);
  });

  it('covers every complete literal explanation and validation sentence in both simulation modules', () => {
    // This guards the user-visible language boundary when future commands or
    // validation messages are added, without fixing engine implementation details.
    for (const path of ['src/game/campaign.ts', 'src/game/battle.ts']) {
      const source = ts.createSourceFile(
        path,
        readFileSync(path, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const messages = new Set<string>();
      function visit(node: ts.Node): void {
        if (ts.isStringLiteral(node) && /^[A-Z].*\s.*[.!?]$/u.test(node.text))
          messages.add(node.text);
        ts.forEachChild(node, visit);
      }
      visit(source);
      expect(messages.size).toBeGreaterThan(20);
      for (const message of messages) expectChinese(message);
    }
  });

  it.each([
    ['Chenliu: Cao Cao improves farming by 92.', '陈留：曹操使农业提升 92 点。'],
    ["Chenliu: Lü Bu declines Cao Cao's offer.", '陈留：吕布拒绝了曹操的招揽。'],
    [
      'Luoyang: Li Ru spreads dissent in Chenliu: −17 public support.',
      '洛阳：李儒在陈留煽动离间，民心降低 17 点。',
    ],
    [
      "Cao Cao's fire tactic struck Xiapi garrison: 1,200 casualties (dampened by rain).",
      '曹操对下邳守军施放火计，造成 1,200 人伤亡（雨势削弱了火攻）。',
    ],
    [
      'Xiahou Yuan attacked Xiapi garrison: 250 casualties.',
      '夏侯渊攻击下邳守军，造成 250 人伤亡。',
    ],
    ['Cao Cao captures Xiapi after 1 day of battle.', '曹操经过 1 日交战，攻占下邳。'],
    ['Cao Cao captures Xiapi after 12 days of battle.', '曹操经过 12 日交战，攻占下邳。'],
    [
      '190 · Month 2. Your treasury changes by +300 gold and -300 food after income and upkeep. Officers are ready.',
      '190 年 2 月。结算收入与军费后，金钱变化 +300，粮草变化 -300。诸将已可受命。',
    ],
    ['Day 2: rain skies.', '第 2 日：雨天。'],
    ['Requires 100 gold.', '需要 100 金。'],
    ['Invalid resources in Chang’an.', '长安的资源数据无效。'],
  ])(
    'renders saved message %s with translated nested names and preserved quantities',
    (source, expected) => {
      expect(translateText(source, 'zh')).toBe(expected);
      expect(translateText(source, 'en')).toBe(source);
    },
  );

  it('translates real multi-month AI chronicles and battle logs retroactively after JSON loading', () => {
    const observed = new Set<string>();
    for (const faction of FACTIONS) {
      let state = createGame(faction.id, 190);
      for (let month = 0; month < 10 && state.phase !== 'finished'; month++) {
        state = apply(state, { type: 'endMonth' });
        for (let guard = 0; state.phase === 'battle' && guard < 60; guard++) {
          const battleSnapshot = structuredClone(state);
          autoResolveBattle(battleSnapshot);
          for (const text of battleSnapshot.battle!.log) observed.add(text);
          state = apply(state, { type: 'battleAuto' });
        }
        for (const entry of state.log) observed.add(entry.text);
      }
    }
    expect(observed.size).toBeGreaterThan(150);
    const serialized = JSON.stringify([...observed]);
    const oldSaveMessages = JSON.parse(serialized) as string[];
    for (const message of oldSaveMessages) expectChinese(message);
    expect(JSON.stringify(oldSaveMessages)).toBe(serialized);
  }, 30000);

  it('gives specific UI hints precedence over a generic city-prefixed message', () => {
    const source = 'Cao Cao: select a highlighted tile to move, or an enemy to attack.';
    expect(translateText(source, 'zh')).toBe('曹操：选择高亮格子移动，或选择敌军攻击。');
    expect(translateText('Chenliu: Cao Cao improves farming by 92.', 'zh')).toBe(
      '陈留：曹操使农业提升 92 点。',
    );
  });

  it('translates original English saved-slot names while preserving unknown user-authored labels', () => {
    expect(translateText('Cao Cao · January 190', 'zh')).toBe('曹操 · 190年一月');
    expect(translateText('Lü Bu · December 191', 'zh')).toBe('吕布 · 191年十二月');
    expect(translateText('My favourite campaign backup', 'zh')).toBe(
      'My favourite campaign backup',
    );
    expect(translateText('Unknown future chronicle message.', 'zh')).toBe(
      'Unknown future chronicle message.',
    );
  });

  it.each(['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'])(
    'keeps imported prototype-key text %s as plain text',
    (source) => {
      expect(translateText(source, 'zh')).toBe(source);
      expect(translateText(source, 'en')).toBe(source);
      expect(translateText('Chenliu: {message}', 'zh', { message: source })).toBe(
        `陈留：${source}`,
      );
    },
  );

  it('localizes actual save-boundary error sentences and nested semantic failures', () => {
    const path = 'src/platform/saves.ts';
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const messages = new Set<string>();
    function visit(node: ts.Node): void {
      if (ts.isStringLiteral(node) && /^[A-Z].*\s.*[.!?]$/u.test(node.text))
        messages.add(node.text);
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(messages.size).toBeGreaterThan(5);
    messages.add('This save contains inconsistent game data: Invalid resources in Chenliu.');
    for (const message of messages) {
      const translated = translateText(message, 'zh');
      expect(translated, message).toMatch(/[\u3400-\u9fff]/u);
      // Technical format identifiers remain conventional in localized copy.
      expect(translated.replace(/JSON|MB|Baye|BAYE/g, ''), message).not.toMatch(/[a-z]/iu);
    }
  });
});
