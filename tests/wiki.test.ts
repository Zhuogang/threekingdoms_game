import { describe, expect, it } from 'vitest';
import { WIKI_SECTIONS } from '../src/content/wiki';
import { WIKI_ZH } from '../src/i18n/wiki.zh';
import { translateText } from '../src/i18n/core';
import { searchWiki } from '../src/ui/wikiSearch';
import { WIKI_TROOPS, WIKI_TACTICS } from '../src/ui/GameWiki';
import { TRAIT_INFO } from '../src/content/traits';
import { TROOP_LABELS } from '../src/content/scenario';
import { TACTIC_COST } from '../src/game/battle';
import { createGame, getActionInfo } from '../src/game/campaign';

describe('bilingual Wiki reference', () => {
  it('translates every chapter, table reference, and interface string', () => {
    const state = createGame('cao', 16);
    const strings = [
      ...Object.keys(WIKI_ZH),
      ...WIKI_SECTIONS.flatMap((section) => [
        section.title,
        section.summary,
        ...section.blocks.flatMap((block) => [block.heading, ...block.paragraphs]),
        ...(section.actions ?? []).flatMap((action) => {
          const info = getActionInfo(state, action, '');
          return [info.label, info.description];
        }),
      ]),
      ...WIKI_TROOPS.flatMap((entry) => [TROOP_LABELS[entry.type], entry.role]),
      ...WIKI_TACTICS.flatMap((entry) => [entry.label, entry.note]),
      ...Object.values(TRAIT_INFO).flatMap((entry) => [entry.name, entry.description]),
      'Troops',
      'Tactics',
      'Order',
      'Effect',
    ];
    for (const value of strings) {
      expect(translateText(value, 'en'), value).toBe(value);
      expect(translateText(value, 'zh'), value).not.toBe(value);
      expect(translateText(value, 'zh'), value).toMatch(/[\u3400-\u9fff]/);
    }
  });
  it('includes every existing troop, tactic and city order, without mutating a campaign', () => {
    expect(new Set(WIKI_SECTIONS.map((section) => section.id)).size).toBe(WIKI_SECTIONS.length);
    expect(WIKI_TROOPS.map((entry) => entry.type).sort()).toEqual(Object.keys(TROOP_LABELS).sort());
    expect(WIKI_TACTICS.map((entry) => entry.skill).sort()).toEqual(
      Object.keys(TACTIC_COST).sort(),
    );
    const state = createGame('cao', 16),
      before = structuredClone(state);
    const actions = WIKI_SECTIONS.flatMap((section) => section.actions ?? []);
    expect(new Set(actions).size).toBe(21);
    for (const action of actions)
      expect(getActionInfo(state, action, '').label).not.toBe('Unknown order');
    expect(state).toEqual(before);
  });
  it('searches both languages, normalizes full-width text and handles empty/no-result queries', () => {
    expect(searchWiki('   ')).toEqual(WIKI_SECTIONS);
    expect(searchWiki('弓兵').map((section) => section.id)).toContain('troops');
    expect(searchWiki('ＦＩＮＥ　ＡＲＭＳ').map((section) => section.id)).toContain('equipment');
    expect(searchWiki('weapons passive').map((section) => section.id)).toContain('troubleshooting');
    expect(searchWiki('unfindable-987654')).toEqual([]);
    expect(
      searchWiki('目标部队兵力', { tactics: WIKI_TACTICS.map((entry) => entry.note) }).map(
        (section) => section.id,
      ),
    ).toContain('tactics');
  });
});
