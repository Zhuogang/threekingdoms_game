import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createV03Game } from '../../../src/v03/initial-state';
import { applyV03CityAction } from '../../../src/v03/governance/city-actions';
import { setReservePool } from '../../../src/v03/campaign/troop-experience';
import { ReinforcementPreview, TroopProgress } from '../../../src/v03/ui/panels/TroopProgress';
import { TroopGrowthReport } from '../../../src/v03/ui/panels/TroopGrowthReport';
import { V03_ASSETS } from '../../../src/v03/rendering/assets';

describe('troop progression presentation', () => {
  it.each([
    [100, 11],
    [200, 10],
    [400, 9],
  ])('previews %i recruits using the actual command result', (added, expectedLevel) => {
    const state = createV03Game('cao', 1);
    const city = state.cities.find((c) => c.id === state.playerCapitalCityId)!;
    const officer = state.officers.find((o) => o.id === 'caocao')!;
    city.garrisonTroops += 800 - officer.troops;
    Object.assign(officer, { troops: 800, troopExperience: 1200 });
    setReservePool(city, officer.troopType, { troops: 400, troopExperience: 0 });
    const result = applyV03CityAction(state, {
      cityId: city.id,
      officerId: officer.id,
      action: 'assign-troops',
      amount: 800 + added!,
    });
    expect(result.ok).toBe(true);
    const after = result.state.officers.find((o) => o.id === officer.id)!;
    for (const locale of ['zh', 'en'] as const) {
      const html = renderToStaticMarkup(
        createElement(ReinforcementPreview, { before: officer, after, locale }),
      );
      expect(html).toContain(`Lv.13 → Lv.${expectedLevel}`);
      expect(html).toContain('elite-cavalry-large-ink-02.webp');
      if (expectedLevel! < 11) {
        expect(html).toContain('cavalry-large-ink-02.webp');
        expect(html).toContain(locale === 'zh' ? '精锐 → 普通' : 'Elite → Regular');
      }
    }
    expect(officer.troopExperience).toBe(1200);
  });

  it('shows fractional boundaries and maximum level without rounding into the next rank', () => {
    const unit = { troopType: 'infantry', troops: 500, troopExperience: 999.999 };
    const html = renderToStaticMarkup(createElement(TroopProgress, { unit, locale: 'zh' }));
    expect(html).toContain('Lv.10');
    expect(html).toContain('999.99');
    expect(html).toContain('距下一级 0.01');
    const max = renderToStaticMarkup(
      createElement(TroopProgress, { unit: { ...unit, troopExperience: 1900 }, locale: 'en' }),
    );
    expect(max).toContain('Heavy infantry');
    expect(max).toContain('Lv.20');
    expect(max).toContain('Max level');
  });

  it('renders immutable report values, promotion, the cap, nonparticipants and wiped forces', () => {
    const state = createV03Game('cao', 1);
    state.officers.find((o) => o.id === 'caocao')!.troopExperience = 0;
    const entries = [
      {
        officerId: 'caocao',
        troopType: 'cavalry' as const,
        survivingTroops: 499,
        beforeExperience: 990,
        afterExperience: 1050,
        participated: true,
      },
      {
        officerId: 'xiahoudun',
        troopType: 'cavalry' as const,
        survivingTroops: 500,
        beforeExperience: 1890,
        afterExperience: 1900,
        participated: true,
      },
      {
        officerId: null,
        troopType: 'infantry' as const,
        survivingTroops: 0,
        beforeExperience: 1100,
        afterExperience: 0,
        participated: true,
      },
      {
        officerId: null,
        troopType: 'archer' as const,
        survivingTroops: 100,
        beforeExperience: 300,
        afterExperience: 300,
        participated: false,
      },
    ];
    const html = renderToStaticMarkup(
      createElement(TroopGrowthReport, { entries, state, locale: 'zh' }),
    );
    expect(html).toContain('Lv.10 → Lv.11');
    expect(html).toContain('晋升精锐');
    expect(html).toContain('elite-cavalry-small-ink-02.webp');
    expect(html).toContain('已满级');
    expect(html).toContain('(+10)');
    expect(html).toContain('全灭，部队经验清零');
    expect(html).toContain('未实际交战，无经验奖励');
  });

  it('ships all six approved elite assets with manifest-matching bytes and alpha', () => {
    const keys = [
      'heavyInfantrySquadInk02',
      'heavyInfantryFormationInk02',
      'eliteCavalrySquadInk02',
      'eliteCavalryFormationInk02',
      'strongArcherSquadInk02',
      'strongArcherFormationInk02',
    ] as const;
    for (const key of keys) {
      const asset = V03_ASSETS[key];
      const bytes = readFileSync(`public/${asset.path}`);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
      expect(asset.alpha).toBe(true);
    }
  });
});
