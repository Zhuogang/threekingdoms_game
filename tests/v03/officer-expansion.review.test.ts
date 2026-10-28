import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createV03Game } from '../../src/v03/initial-state';
import { playtestFixture } from '../../src/v03/dev/fixtures';
import { applyCombatDamage } from '../../src/v03/battle/experience';
import { validateV03State, encodeV03Save, decodeV03Save } from '../../src/v03/platform/storage';
import { OfficerProfile } from '../../src/v03/ui/panels/OfficerProfile';
import { officerDossier } from '../../src/v03/ui/shared/officer-view';

describe('officer expansion review: save identity and life invariants', () => {
  it.each(['divided-realm-190', 'guandu-200'])(
    'rejects changing a new officer’s fixed troop type in %s',
    (scenario) => {
      const state = createV03Game('cao', 19, scenario);
      state.officers.find((officer) => officer.id === 'caohong')!.troopType = 'archer';
      expect(validateV03State(state)).toBe(false);
      expect(() => decodeV03Save(encodeV03Save(state))).toThrow();
    },
  );
  it.each(['troops', 'wounded'] as const)(
    'rejects a deceased opening record retaining %s',
    (field) => {
      const state = createV03Game('cao', 19, 'guandu-200');
      state.officers.find((officer) => officer.id === 'gaoshun')![field] = 100;
      expect(validateV03State(state)).toBe(false);
    },
  );
  it('still accepts a living pure-wounded new officer and legitimate changes of allegiance', () => {
    const state = createV03Game('cao', 19);
    const officer = state.officers.find((officer) => officer.id === 'caohong')!;
    Object.assign(officer, {
      factionId: 'sun',
      location: { kind: 'captured', cityId: 'chenliu' },
      troops: 0,
      wounded: 500,
      troopExperience: 1300,
    });
    expect(decodeV03Save(encodeV03Save(state))).toEqual(state);
  });
});

describe('officer expansion review: honest profile information', () => {
  it.each(['zh', 'en'] as const)(
    'marks inferred, disputed and game-reference chronology explicitly (%s)',
    (locale) => {
      const state = createV03Game('cao', 19);
      const html = (id: string) =>
        renderToStaticMarkup(createElement(OfficerProfile, { state, id, locale }));
      expect(html('caocao')).toContain(locale === 'zh' ? '155 · 推算' : '155 · Inferred');
      expect(html('sunjian')).toContain(locale === 'zh' ? '有争议' : 'Disputed');
      expect(html('weiyan')).toContain(locale === 'zh' ? '194 · 游戏参考' : '194 · Game reference');
    },
  );
  it.each(['liubiao', 'ganning'])(
    'does not project %s’s later independent-house relationship back into 190',
    (id) => {
      expect(officerDossier(createV03Game('cao', 19), id)!.opening!.unmodeledHouse).toBeNull();
      expect(
        officerDossier(createV03Game('cao', 19, 'guandu-200'), id)!.opening!.unmodeledHouse,
      ).not.toBeNull();
    },
  );
  it.each(['zh', 'en'] as const)(
    'explains unmodeled opening houses without changing current affiliation (%s)',
    (locale) => {
      const state = createV03Game('cao', 19);
      const officer = state.officers.find((officer) => officer.id === 'gongsunzan')!;
      officer.factionId = 'cao';
      const html = renderToStaticMarkup(
        createElement(OfficerProfile, { state, id: officer.id, locale }),
      );
      expect(html).toContain(
        locale === 'zh' ? '原势力未独立建模' : 'Original house is not modeled separately',
      );
      expect(html).toContain(locale === 'zh' ? '开局安排' : 'Opening arrangement');
      expect(officerDossier(state, officer.id)!.runtime!.factionId).toBe('cao');
    },
  );
  it('reads live battle casualties, including a defeated pure-wounded unit, without mutating settlement records', () => {
    const state = playtestFixture('battle');
    const battle = state.battles.find((entry) => entry.active)!;
    const unit = battle.battleData.units.find((entry) => entry.side === 'attacker')!;
    const officerId = battle.attackerFormationOfficerIds[unit.id]![0]!;
    const officer = state.officers.find((entry) => entry.id === officerId)!;
    applyCombatDamage(unit, unit.troops);
    const before = structuredClone(state);
    const html = renderToStaticMarkup(
      createElement(OfficerProfile, { state, id: officerId, locale: 'en' }),
    );
    expect(html).toMatch(/Healthy soldiers<\/dt><dd[^>]*>0<\/dd>/);
    expect(html).toMatch(
      new RegExp('Wounded<\\/dt><dd[^>]*>' + unit.wounded.toLocaleString() + '<\\/dd>'),
    );
    expect(officer.troops).toBeGreaterThan(0);
    expect(state).toEqual(before);
  });
  it('labels a merged formation’s total explicitly instead of attributing all soldiers to one officer', () => {
    const state = playtestFixture('battle');
    const battle = state.battles.find((entry) => entry.active)!;
    const [unit, other] = battle.battleData.units.filter((entry) => entry.side === 'attacker');
    const members = battle.attackerFormationOfficerIds[unit!.id]!;
    members.push(...battle.attackerFormationOfficerIds[other!.id]!);
    delete battle.attackerFormationOfficerIds[other!.id];
    battle.battleData.units = battle.battleData.units.filter((entry) => entry.id !== other!.id);
    Object.assign(unit!, { troops: 123, wounded: 321 });
    for (const id of members) {
      const html = renderToStaticMarkup(createElement(OfficerProfile, { state, id, locale: 'en' }));
      expect(html).toContain('Current formation healthy soldiers');
      expect(html).toContain('Current formation wounded');
      expect(html).toContain('allocated proportionally after battle');
      expect(officerDossier(state, id)!.personnel).toEqual({
        troops: 123,
        wounded: 321,
        shared: true,
      });
    }
  });
});
