import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createV03Game } from '../../../src/v03/initial-state';
import { OFFICER_CATALOG } from '../../../src/v03/content/officer-catalog';
import { OFFICER_PORTRAIT_PATHS } from '../../../src/v03/content/officer-portraits.generated';
import {
  officerPortraitPath,
  officerPortraitFallback,
} from '../../../src/v03/rendering/officer-portraits';
import { OfficerPortrait } from '../../../src/v03/rendering/OfficerPortrait';
import { OfficerProfile } from '../../../src/v03/ui/panels/OfficerProfile';
import { OfficerRoster, OfficerDetail } from '../../../src/v03/ui/panels/CityOfficers';
import {
  officerDirectory,
  officerDossier,
  officerStatus,
  officerLocation,
} from '../../../src/v03/ui/shared/officer-view';
import { hasNavalTraining } from '../../../src/v03/content/naval-commanders';
import { formationLeaderVisual } from '../../../src/v03/rendering/unit-leader';
import type { GameplayContext } from '../../../src/v03/ui/hooks/gameplayView';

describe('R4 portrait runtime index', () => {
  it('maps all 98 identities and both renditions without shipping production metadata', () => {
    const manifest = JSON.parse(readFileSync('public/assets/v03/portraits/manifest.json', 'utf8'));
    const legacy = JSON.parse(readFileSync('public/assets/portraits/credits.json', 'utf8'));
    expect(Object.keys(OFFICER_PORTRAIT_PATHS)).toHaveLength(99);
    for (const person of OFFICER_CATALOG) {
      const entry = manifest.entries.find(
        (entry: { runtimeId: string }) => entry.runtimeId === person.id,
      )!;
      const original = legacy.entries.find((entry: { id: string }) => entry.id === person.id);
      for (const size of [128, 256] as const) {
        const path = officerPortraitPath(person.id, size)!;
        const file = (entry.status === 'revised' ? original : entry).files.find(
          (file: { width: number }) => file.width === size,
        );
        expect(path).toBe(file.path ?? 'assets/portraits/' + file.file);
        const bytes = readFileSync('public/' + path);
        expect(bytes.length).toBe(file.bytes);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);
        if (person.isNew) expect(path).toMatch(/^assets\/v03\/portraits\//);
      }
    }
    expect(OFFICER_PORTRAIT_PATHS.garrison!.every((path) => existsSync('public/' + path))).toBe(
      true,
    );
    const source = readFileSync('src/v03/content/officer-portraits.generated.ts', 'utf8');
    expect(source).not.toMatch(/(?:promptSet|provenance|sourceSha256|ageImpression)\s*:/);
  });
  it('keeps stable aliases and safely rejects prototype names or unknown IDs', () => {
    expect(officerPortraitPath('maliang')).toBe('assets/portraits/maliang-small.webp');
    expect(officerPortraitPath('maliang_shu')).toBe('assets/v03/portraits/maliang_shu-small.webp');
    expect(officerPortraitPath('zuzhao')).toBe('assets/portraits/zuzhao-small.webp');
    for (const id of ['toString', '__proto__', 'missing']) {
      expect(officerPortraitPath(id)).toBeUndefined();
      expect(officerPortraitFallback(id, 'zh')).toBe('?');
    }
  });
  it.each([
    ['simayi', '司马', 'Sima'],
    ['zhugeliang', '诸葛', 'Zhuge'],
    ['gongsunzan', '公孙', 'Gongsun'],
    ['xiahoudun', '夏侯', 'Xiahou'],
  ])('preserves compound surname placeholders for %s', (id, zh, en) => {
    expect(officerPortraitFallback(id!, 'zh')).toBe(zh);
    expect(officerPortraitFallback(id!, 'en')).toBe(en);
    const html = renderToStaticMarkup(createElement(OfficerPortrait, { id: id!, locale: 'zh' }));
    expect(html).toContain(zh!);
    expect(html).toContain('loading="lazy"');
  });
});

describe('R4 directory is a read-only 98-person projection', () => {
  it.each(['divided-realm-190', 'guandu-200'])(
    'displays all five statuses without creating world objects in %s',
    (scenario) => {
      const state = createV03Game('cao', 19, scenario);
      const before = structuredClone(state);
      const entries = officerDirectory(state);
      expect(entries).toHaveLength(98);
      const counts = Object.fromEntries(
        ['serving', 'free', 'captured', 'pending', 'deceased'].map((key) => [
          key,
          entries.filter((entry) => entry.status === key).length,
        ]),
      );
      expect(counts).toEqual(
        scenario === 'guandu-200'
          ? { serving: 50, free: 16, captured: 0, pending: 17, deceased: 15 }
          : { serving: 34, free: 35, captured: 0, pending: 29, deceased: 0 },
      );
      expect(officerDossier(state, 'jiangwei')).toMatchObject({
        status: 'pending',
        runtime: undefined,
        canVisitCity: false,
      });
      expect(state).toEqual(before);
    },
  );
  it('uses actual death, captivity, faction and physical location rather than portrait categories', () => {
    const state = createV03Game('cao', 19);
    const person = state.officers.find((person) => person.id === 'gongsunzan')!;
    expect(officerStatus(person)).toBe('free');
    person.factionId = 'sun';
    expect(officerStatus(person)).toBe('serving');
    person.location = { kind: 'captured', cityId: 'chenliu' };
    expect(officerDossier(state, person.id)).toMatchObject({
      status: 'captured',
      holderFactionId: 'cao',
      canVisitCity: true,
    });
    person.alive = false;
    expect(officerDossier(state, person.id)).toMatchObject({
      status: 'deceased',
      canVisitCity: false,
    });
    expect(officerDossier(state, 'not-a-person')).toBeNull();
  });
  it('keeps travelling and battling officers serving but does not offer a fake city link', () => {
    const state = createV03Game('cao', 19);
    const person = state.officers[0]!;
    person.location = { kind: 'journey', journeyId: 'travelling' };
    expect(officerDossier(state, person.id)).toMatchObject({
      status: 'serving',
      canVisitCity: false,
    });
    expect(officerLocation(state, person, 'en')).toBe('Travelling');
    person.location = { kind: 'battle', battleId: 'battle' };
    expect(officerLocation(state, person, 'zh')).toBe('战斗中');
    expect(officerDossier(state, person.id)!.canVisitCity).toBe(false);
    person.location = {
      kind: 'captured',
      cityId: 'chenliu',
      journeyId: 'escort',
      holderFactionId: 'sun',
    };
    expect(officerDossier(state, person.id)).toMatchObject({
      status: 'captured',
      canVisitCity: false,
      cityId: null,
    });
    expect(officerLocation(state, person, 'en')).toBe('Travelling');
  });
  it('searches Chinese names, compound surnames and unaccented English names', () => {
    const state = createV03Game('cao', 19);
    expect(officerDirectory(state, '诸葛').map((entry) => entry.definition.id)).toEqual([
      'zhugeliang',
      'zhugejin',
      'zhugeke',
    ]);
    expect(officerDirectory(state, 'SIMA').map((entry) => entry.definition.id)).toEqual([
      'simayi',
      'simashi',
    ]);
    expect(officerDirectory(state, 'lu meng')[0]!.definition.id).toBe('lvmeng');
    expect(officerDirectory(state, '费祎')[0]!.definition.id).toBe('feiyi');
    expect(officerDirectory(state, '曹叡')[0]!.definition.id).toBe('caorui');
    expect(officerDirectory(state, '', 'pending')).toHaveLength(29);
  });
  it.each(['zh', 'en'] as const)(
    'renders future and deceased profiles as reference-only in %s',
    (locale) => {
      const state = createV03Game('cao', 19, 'guandu-200');
      const before = structuredClone(state);
      const future = renderToStaticMarkup(
        createElement(OfficerProfile, { state, id: 'jiangwei', locale }),
      );
      const dead = renderToStaticMarkup(
        createElement(OfficerProfile, { state, id: 'liru', locale }),
      );
      expect(future).toContain('data-status="pending"');
      expect(future).toContain('225');
      expect(future).toContain(locale === 'zh' ? '成年基准' : 'Adult baseline');
      expect(dead).toContain('data-status="deceased"');
      expect(dead).toContain(locale === 'zh' ? '不能搜索' : 'unavailable for searches');
      expect(future + dead).not.toContain('<button');
      expect(state).toEqual(before);
    },
  );
  it('renders unknown ages honestly and does not use a reference death as current campaign status', () => {
    const state = createV03Game('cao', 19, 'guandu-200');
    const person = state.officers.find((entry) => entry.id === 'sunce')!;
    person.age = null;
    const html = renderToStaticMarkup(
      createElement(OfficerProfile, { state, id: 'sunce', locale: 'zh' }),
    );
    expect(html).toContain('不详');
    expect(html).toContain('data-status="serving"');
    expect(html).toContain('不决定本局命运');
  });
});

describe('R4 city grouping and permissions', () => {
  function context(player = 'yan', cityId = 'puyang') {
    const state = createV03Game(player, 19);
    return {
      state,
      selectedCity: state.cities.find((city) => city.id === cityId),
      locale: 'zh',
      t: { troops: '兵', noFineArms: '未装备' },
      troopAssignments: {},
      capitalReason: () => '外城由自治管理。',
    } as unknown as GameplayContext;
  }
  it('separates local free people from serving officers and gives both real portraits', () => {
    const ctx = context();
    const html = renderToStaticMarkup(
      createElement(OfficerRoster, { context: ctx, onOfficer: () => {} }),
    );
    expect(html).toContain('驻城在职');
    expect(html).toContain('本城在野');
    expect(html).toContain('data-portrait-id="chengyu"');
    expect(html).toContain('data-portrait-id="xiahouyuan"');
    const escort = ctx.state.officers.find((person) => person.id === 'chengyu')!;
    escort.location = {
      kind: 'captured',
      cityId: 'puyang',
      journeyId: 'escort',
      holderFactionId: 'cao',
    };
    const transit = renderToStaticMarkup(
      createElement(OfficerRoster, { context: ctx, prisoners: true, onOfficer: () => {} }),
    );
    expect(transit).not.toContain('data-portrait-id="chengyu"');
  });
  it('keeps free and enemy profiles inspection-only, without direct work controls', () => {
    for (const id of ['chengyu', 'xiahouyuan']) {
      const html = renderToStaticMarkup(
        createElement(OfficerDetail, { context: context(), officerId: id, onWork: () => {} }),
      );
      expect(html).not.toContain('officer-work-menu');
      expect(html).toContain('v03-officer-profile');
    }
  });
});

describe('R4 explicit new vessel display eligibility', () => {
  it('allows six named additions and does not grant all Wu officers a vessel', () => {
    for (const id of ['lvmeng', 'luxun', 'zhoutai', 'zhuran', 'xusheng', 'dingfeng'])
      expect(hasNavalTraining(id)).toBe(true);
    for (const id of ['sunquan', 'zhangzhao', 'zhugeke', 'gongsunzan'])
      expect(hasNavalTraining(id)).toBe(false);
    const party = [
      { id: 'zhuran', level: 1, force: 75 },
      { id: 'zhangzhao', level: 2, force: 30 },
    ];
    expect(
      formationLeaderVisual(
        party,
        party.map((person) => person.id),
      ),
    ).toEqual({ portraitKey: 'zhangzhao', navalTraining: false });
    party[0]!.level = 3;
    expect(
      formationLeaderVisual(
        party,
        party.map((person) => person.id),
      ),
    ).toEqual({ portraitKey: 'zhuran', navalTraining: true });
  });
});
