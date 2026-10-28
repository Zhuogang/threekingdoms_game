import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OFFICER_CATALOG, OFFICER_CATALOG_BY_ID } from '../../src/v03/content/officer-catalog';
import { OFFICER_HISTORY } from '../../src/v03/content/officer-history';
import {
  SAN11_OFFICER_DATES,
  SAN11_REFERENCE_URL,
} from '../../src/v03/content/officer-game-reference';
import { OFFICER_IDENTITIES } from '../../src/v03/content/officerIdentity';
import {
  LEGACY_OPENING_ARMIES,
  OFFICER_OPENING_PLACEMENTS,
} from '../../src/v03/content/officer-opening-placements';
import {
  createOfficerRosterSetup,
  scheduledOfficerDebuts,
  type OfficerRosterScenarioId,
} from '../../src/v03/content/officer-roster-setups';
import {
  officerAgeAtYear,
  officerBaseStatsAtYear,
  officerOpeningLifeStatus,
  type OfficerTimeline,
} from '../../src/v03/content/officer-timeline';
import { SCENARIOS } from '../../src/v03/content/scenario';

const scenarios: OfficerRosterScenarioId[] = ['divided-realm-190', 'guandu-200'];
const get = (id: string) => OFFICER_CATALOG_BY_ID.get(id)!;
const opening = (scenario: OfficerRosterScenarioId, id: string) =>
  createOfficerRosterSetup(scenario).officers.find((officer) => officer.id === id)!;

describe('R1 officer catalogue, identity and reference integrity', () => {
  it('covers exactly the 98 portrait identities, with 45 additions and no duplicate revised portraits', () => {
    const manifest = JSON.parse(
      readFileSync('public/assets/v03/portraits/manifest.json', 'utf8'),
    ) as {
      entries: {
        id: string;
        runtimeId: string;
        chinese: string;
        status: string;
        files: { path: string }[];
      }[];
    };
    expect(OFFICER_CATALOG).toHaveLength(98);
    expect(new Set(OFFICER_CATALOG.map((officer) => officer.id)).size).toBe(98);
    expect(new Set(OFFICER_CATALOG.map((officer) => officer.portraitId)).size).toBe(98);
    expect(
      OFFICER_CATALOG.filter((officer) => officer.isNew)
        .map((officer) => officer.id)
        .sort(),
    ).toEqual(
      manifest.entries
        .filter((entry) => entry.status === 'new')
        .map((entry) => entry.runtimeId)
        .sort(),
    );
    expect(OFFICER_CATALOG.map((officer) => officer.id).sort()).toEqual(
      manifest.entries.map((entry) => entry.runtimeId).sort(),
    );
    for (const officer of OFFICER_CATALOG) {
      const portrait = manifest.entries.find((entry) => entry.id === officer.portraitId)!;
      expect(portrait.runtimeId, officer.id).toBe(officer.id);
      expect(portrait.chinese, officer.id).toBe(officer.chinese);
      expect(portrait.files).toHaveLength(2);
      for (const file of portrait.files)
        expect(existsSync('public/' + file.path), file.path).toBe(true);
    }
  });

  it('keeps stable legacy aliases, every existing identity and compound surnames', () => {
    for (const [id, identity] of Object.entries(OFFICER_IDENTITIES).filter(
      ([id]) => !get(id).isNew,
    )) {
      const officer = get(id);
      expect(officer).toMatchObject(identity);
      expect(officer.isNew).toBe(false);
    }
    expect(get('maliang')).toMatchObject({ chinese: '马腾', portraitId: 'mateng' });
    expect(get('maliang_shu')).toMatchObject({ chinese: '马良', portraitId: 'maliang_shu' });
    expect(get('zuzhao')).toMatchObject({ chinese: '祖茂', portraitId: 'zumao' });
    for (const [id, surname] of [
      ['simayi', '司马'],
      ['simashi', '司马'],
      ['zhugeliang', '诸葛'],
      ['zhugejin', '诸葛'],
      ['zhugeke', '诸葛'],
      ['gongsunzan', '公孙'],
    ])
      expect(get(id!).surnameZh).toBe(surname);
  });

  it('has one base troop type, bounded adult stats, dated evidence and explicit reference kinds for everyone', () => {
    expect(Object.keys(OFFICER_HISTORY).sort()).toEqual(
      OFFICER_CATALOG.map((officer) => officer.id).sort(),
    );
    expect(Object.keys(OFFICER_OPENING_PLACEMENTS).sort()).toEqual(
      Object.keys(OFFICER_HISTORY).sort(),
    );
    for (const officer of OFFICER_CATALOG) {
      const { timeline } = officer;
      expect(['infantry', 'archer', 'cavalry']).toContain(officer.troopType);
      expect(officer.adultForce).toBeGreaterThan(3);
      expect(officer.adultForce).toBeLessThanOrEqual(100);
      expect(officer.adultIntellect).toBeGreaterThan(2);
      expect(officer.adultIntellect).toBeLessThanOrEqual(100);
      expect(timeline.sources.length, officer.id).toBeGreaterThan(0);
      expect(timeline.sources.every((url) => url.startsWith('https://'))).toBe(true);
      expect(timeline.basis.length, officer.id).toBeGreaterThan(10);
      expect(timeline.debutKind === 'recorded' && timeline.debutApproximate).toBe(false);
      expect(timeline.debutYear, officer.id).toBeGreaterThanOrEqual(timeline.birthYear! + 15);
      expect(timeline.debutYear, officer.id).toBeLessThanOrEqual(timeline.deathYear!);
      expect(timeline.birthYear).toBeLessThanOrEqual(timeline.deathYear!);
    }
    expect(get('zhugeliang').adultIntellect).toBe(100);
    expect(
      OFFICER_CATALOG.filter((officer) => officer.isNew && officer.adultIntellect >= 99),
    ).toHaveLength(1);
  });

  it('pins the SAN11 transcription and labels every adopted fallback instead of presenting it as history', () => {
    const reference = JSON.parse(
      readFileSync('docs/v0.3/evidence/officer-roster-2026-10-26/san11-reference.json', 'utf8'),
    ) as {
      entries: { id: string; birthYear: number; deathYear: number; debutYear: number }[];
    };
    expect(reference.entries).toHaveLength(98);
    for (const officer of OFFICER_CATALOG) {
      const evidence = reference.entries.find((row) => row.id === officer.id)!;
      const game = SAN11_OFFICER_DATES[officer.id]!;
      expect(game).toEqual([evidence.birthYear, evidence.deathYear, evidence.debutYear]);
      const { timeline } = officer;
      if (timeline.birthKind === 'game-reference')
        expect(timeline.birthYear, officer.id).toBe(game[0]);
      if (timeline.deathKind === 'game-reference')
        expect(timeline.deathYear, officer.id).toBe(game[1]);
      if (timeline.debutKind === 'game-reference')
        expect(timeline.debutYear, officer.id).toBe(Math.max(game[2], timeline.birthYear! + 15));
      if ([timeline.birthKind, timeline.deathKind, timeline.debutKind].includes('game-reference'))
        expect(timeline.sources).toContain(SAN11_REFERENCE_URL);
    }
    // These are intentional differences from SAN11, with historical priority.
    expect(get('huangzhong').timeline.deathYear).toBe(220); // SAN11: 222
    expect(get('xuhuang').timeline.deathYear).toBe(227); // SAN11: 228
    expect(get('jushou').timeline.deathYear).toBe(200); // SAN11: 201
    expect(get('caorui').timeline).toMatchObject({ birthYear: 206, birthKind: 'disputed' });
    expect(get('liru').timeline).toMatchObject({ deathYear: 192, deathKind: 'game-reference' });
    expect(get('zuzhao').timeline).toMatchObject({ deathYear: 190, deathKind: 'game-reference' });
  });
});

describe('R1 chronology boundaries and basic growth', () => {
  it('distinguishes actual appearance from the virtual-age floor and keeps unready people out', () => {
    expect(officerAgeAtYear(181, 190)).toBe(10);
    expect(officerOpeningLifeStatus(get('zhugeliang').timeline, 196)).toBe('pending');
    expect(officerOpeningLifeStatus(get('zhugeliang').timeline, 197)).toBe('available');
    expect(opening('divided-realm-190', 'machao').status).toBe('pending');
    expect(opening('guandu-200', 'caopi').status).toBe('pending');
    expect(opening('guandu-200', 'liushan').age).toBe(null);
    expect(get('guanping').timeline.debutYear).toBe(201);
    expect(get('simashi').timeline.debutYear).toBe(223);
    expect(get('liaohua').timeline.debutYear).toBe(185);
    for (const officer of OFFICER_CATALOG) {
      expect(
        officerOpeningLifeStatus(officer.timeline, officer.timeline.debutYear - 1),
        officer.id,
      ).toBe('pending');
      expect(
        officerOpeningLifeStatus(officer.timeline, officer.timeline.debutYear),
        officer.id,
      ).toBe('available');
    }
  });

  it('uses only deaths before January 1, freezes dead ages, and keeps those IDs out of future schedules', () => {
    expect(opening('guandu-200', 'sunce')).toMatchObject({ status: 'serving', age: 26 });
    expect(opening('guandu-200', 'yanliang').status).toBe('serving');
    expect(officerOpeningLifeStatus(get('taoqian').timeline, 194)).toBe('available');
    expect(officerOpeningLifeStatus(get('taoqian').timeline, 195)).toBe('deceased');
    expect(opening('guandu-200', 'taoqian')).toMatchObject({ status: 'deceased', age: 63 });
    expect(opening('guandu-200', 'zuzhao')).toMatchObject({ status: 'deceased', age: 36 });
    const schedule = scheduledOfficerDebuts('guandu-200');
    expect(
      schedule.some((entry) =>
        ['taoqian', 'liru', 'gaoshun', 'chengong', 'zuzhao'].includes(entry.id),
      ),
    ).toBe(false);
    expect(schedule.at(-1)!.year).toBe(225);
  });

  it('supports genuinely unknown future records without converting null to a newborn or fake birthday', () => {
    const unknown: OfficerTimeline = {
      birthYear: null,
      deathYear: null,
      birthKind: 'unknown',
      deathKind: 'unknown',
      debutYear: 210,
      debutKind: 'design',
      debutApproximate: true,
      debutCityId: 'wu',
      sources: [],
      basis: 'Synthetic boundary fixture',
    };
    expect(officerAgeAtYear(null, 210)).toBe(null);
    expect(officerAgeAtYear(207, 200)).toBe(null);
    expect(officerOpeningLifeStatus(unknown, 209)).toBe('pending');
    expect(officerOpeningLifeStatus(unknown, 210)).toBe('available');
    expect(officerBaseStatsAtYear({ force: 60, intellect: 70 }, null, 210)).toEqual({
      force: 60,
      intellect: 70,
    });
  });

  it('uses a common adult baseline and only the existing +3/+2 difference for young officers', () => {
    const before = opening('divided-realm-190', 'sunce');
    const adult = opening('guandu-200', 'sunce');
    expect(before).toMatchObject({ age: 16, force: 92, intellect: 74 });
    expect(adult).toMatchObject({ age: 26, force: 95, intellect: 76 });
    expect(officerBaseStatsAtYear({ force: 95, intellect: 76 }, 175, 191)).toEqual({
      force: 92,
      intellect: 74,
    });
    expect(officerBaseStatsAtYear({ force: 95, intellect: 76 }, 175, 192)).toEqual({
      force: 95,
      intellect: 76,
    });
    expect(officerBaseStatsAtYear({ force: 95, intellect: 76 }, 175, 200)).toEqual({
      force: 95,
      intellect: 76,
    });
    expect(opening('divided-realm-190', 'zhouyu')).toMatchObject({ force: 71, intellect: 96 });
  });
});

describe.each(scenarios)('R1 opening configuration: %s', (scenarioId) => {
  it('partitions all 98 identities, with six explicit rulers and valid friendly offices', () => {
    const setup = createOfficerRosterSetup(scenarioId);
    const baseline = SCENARIOS.find((scenario) => scenario.id === scenarioId)!;
    expect(setup.officers).toHaveLength(98);
    expect(new Set(setup.officers.map((officer) => officer.id)).size).toBe(98);
    expect(setup.factions.map((faction) => faction.id).sort()).toEqual(
      baseline.factions.map((faction) => faction.id).sort(),
    );
    expect(setup.factions).toHaveLength(6);
    expect(setup.cities).toHaveLength(24);
    for (const officer of setup.officers) {
      const city = setup.cities.find((candidate) => candidate.id === officer.cityId);
      expect(city, officer.id).toBeDefined();
      if (officer.status === 'serving') {
        expect(city!.factionId, officer.id).toBe(officer.factionId);
        expect(setup.factions.some((faction) => faction.id === officer.factionId)).toBe(true);
      } else expect(officer).toMatchObject({ factionId: null, role: 'none', troops: 0 });
      if (officer.status === 'free' || officer.status === 'serving')
        expect(officer.age).toBeGreaterThanOrEqual(16);
    }
    for (const faction of setup.factions) {
      const ruler = setup.officers.find((officer) => officer.id === faction.leaderOfficerId)!;
      expect(ruler).toMatchObject({
        status: 'serving',
        role: 'ruler',
        factionId: faction.id,
        cityId: faction.capitalCityId,
      });
      expect(setup.cities.find((city) => city.id === faction.capitalCityId)!.governorId).toBe(null);
    }
    for (const city of setup.cities.filter((city) => city.governorId)) {
      expect(setup.officers.find((officer) => officer.id === city.governorId)).toMatchObject({
        status: 'serving',
        factionId: city.factionId,
        cityId: city.id,
        role: 'governor',
      });
    }
    const counts = Object.fromEntries(
      ['serving', 'free', 'deceased', 'pending'].map((status) => [
        status,
        setup.officers.filter((officer) => officer.status === status).length,
      ]),
    );
    expect(counts).toEqual(
      scenarioId === 'divided-realm-190'
        ? { serving: 34, free: 35, deceased: 0, pending: 29 }
        : { serving: 50, free: 16, deceased: 15, pending: 17 },
    );
    expect(
      scheduledOfficerDebuts(scenarioId)
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(
      setup.officers
        .filter((officer) => officer.status === 'pending')
        .map((officer) => officer.id)
        .sort(),
    );
  });

  it('gives every added officer zero soldiers and preserves each city and troop type through explicit returns', () => {
    const setup = createOfficerRosterSetup(scenarioId);
    for (const officer of setup.officers) {
      expect(officer).toMatchObject({
        wounded: 0,
        experience: 0,
        troopExperience: 0,
        reorganizationDays: 0,
      });
      if (get(officer.id).isNew) expect(officer.troops, officer.id).toBe(0);
    }
    for (const city of setup.cities)
      for (const troopType of ['infantry', 'cavalry', 'archer'] as const) {
        const oldHealthy = LEGACY_OPENING_ARMIES[scenarioId]!.filter(
          (row) => row[1] === city.id && row[2] === troopType,
        ).reduce((sum, row) => sum + row[3], 0);
        const newHealthy = setup.officers
          .filter((officer) => officer.cityId === city.id && officer.troopType === troopType)
          .reduce((sum, officer) => sum + officer.troops, 0);
        expect(newHealthy + city.reserveAdditions[troopType], `${city.id}/${troopType}`).toBe(
          oldHealthy,
        );
        expect(city.reserveAdditions[troopType]).toBeGreaterThanOrEqual(0);
        expect(city.healthyTroops).toBe(
          setup.officers
            .filter((officer) => officer.status === 'serving' && officer.cityId === city.id)
            .reduce((sum, officer) => sum + officer.troops, 0),
        );
      }
    if (scenarioId === 'divided-realm-190') {
      expect(setup.cities.find((city) => city.id === 'beihai')).toMatchObject({
        governorId: 'yanliang',
        workPoints: 2,
        healthyTroops: 700,
      });
      expect(setup.reserveAssignments).toEqual([
        { officerId: 'yanliang', cityId: 'beihai', troopType: 'cavalry', troops: 700 },
      ]);
    }
  });

  it('gives each owned city two work points and leaves the archived scenario baseline untouched', () => {
    const oldContent = JSON.stringify(SCENARIOS);
    const setup = createOfficerRosterSetup(scenarioId);
    for (const city of setup.cities) {
      expect(city.workPoints).toBe(city.factionId === null ? 0 : 2);
    }
    setup.officers[0]!.troops = 9999;
    setup.cities[0]!.reserveAdditions.cavalry = 9999;
    expect(createOfficerRosterSetup(scenarioId).officers[0]!.troops).not.toBe(9999);
    expect(JSON.stringify(SCENARIOS)).toBe(oldContent);
    expect(SCENARIOS.map((scenario) => scenario.officers.length)).toEqual([52, 53]);
  });
});

describe('R1 historical affiliations and later appearances', () => {
  it('respects opening employment and does not pre-apply later events or hidden factions', () => {
    expect(opening('divided-realm-190', 'xunyu')).toMatchObject({
      status: 'free',
      cityId: 'xuchang',
    });
    expect(opening('divided-realm-190', 'zhanghe')).toMatchObject({ status: 'free', cityId: 'ye' });
    expect(opening('divided-realm-190', 'liubiao')).toMatchObject({
      status: 'free',
      cityId: 'luoyang',
    });
    expect(opening('guandu-200', 'guojia')).toMatchObject({ status: 'serving', factionId: 'cao' });
    expect(opening('guandu-200', 'zhangzhao')).toMatchObject({
      status: 'serving',
      factionId: 'sun',
    });
    expect(opening('guandu-200', 'xuyou')).toMatchObject({ status: 'serving', factionId: 'yuan' });
    expect(opening('guandu-200', 'jiaxu')).toMatchObject({ status: 'serving', factionId: 'cao' });
    for (const id of ['lusu', 'zhugejin', 'zhuran', 'xusheng', 'simayi'])
      expect(opening('guandu-200', id).status, id).toBe('free');
    for (const id of ['gongsunzan', 'taoqian', 'liubiao', 'yuanshu', 'hansui'])
      expect(opening('divided-realm-190', id).placementNote).toContain('未独立建模');
    expect(opening('guandu-200', 'kongrong')).toMatchObject({ status: 'free', cityId: 'xuchang' });
  });

  it('keeps all late people on a unique ordered schedule without deferring normal campaign victory', () => {
    for (const scenarioId of scenarios) {
      const setup = createOfficerRosterSetup(scenarioId);
      const schedule = scheduledOfficerDebuts(scenarioId);
      expect(new Set(schedule.map((entry) => entry.id)).size).toBe(schedule.length);
      expect(
        schedule.every(
          (entry) =>
            entry.year > setup.year && setup.cities.some((city) => city.id === entry.cityId),
        ),
      ).toBe(true);
      expect(schedule).toEqual(
        [...schedule].sort((a, b) => a.year - b.year || a.id.localeCompare(b.id)),
      );
      expect(schedule.find((entry) => entry.id === 'jiangwei')).toMatchObject({
        year: 225,
        cityId: 'tianshui',
      });
      expect(schedule.find((entry) => entry.id === 'simashi')).toMatchObject({
        year: 223,
        cityId: 'luoyang',
      });
    }
  });
});
