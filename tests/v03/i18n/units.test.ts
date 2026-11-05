import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDistance,
  formatGrain,
  formatMen,
  formatMoney,
  formatPopulation,
  zhDayOfMonth,
} from '../../../src/v03/i18n/units';
import { reignEra } from '../../../src/v03/content/reign-eras';
import { calendarDateAt } from '../../../src/v03/calendar';
import { COPY } from '../../../src/v03/i18n';

describe('unit formatters', () => {
  it('formats money', () => {
    expect(formatMoney(0, 'zh')).toBe('0 钱');
    expect(formatMoney(1234, 'zh')).toBe('1,234 钱');
    expect(formatMoney(9999, 'zh')).toBe('9,999 钱');
    expect(formatMoney(10000, 'zh')).toBe('1 万钱');
    expect(formatMoney(12345, 'zh')).toBe('1.2 万钱');
    expect(formatMoney(0, 'en')).toBe('0 cash');
    expect(formatMoney(1234, 'en')).toBe('1,234 cash');
    expect(formatMoney(12345, 'en')).toBe('12,345 cash');
  });

  it('formats grain and men', () => {
    expect(formatGrain(2000, 'zh')).toBe('2,000 石');
    expect(formatGrain(0, 'en')).toBe('0 shi');
    expect(formatGrain(2000, 'en')).toBe('2,000 shi');
    expect(formatMen(3000, 'zh')).toBe('3,000 人');
    expect(formatMen(12345, 'en')).toBe('12,345 men');
    expect(formatMen(0, 'zh')).toBe('0 人');
  });

  it('formats population with households at one fifth', () => {
    expect(formatPopulation(110000, 'zh')).toBe('11 万口（2.2 万户）');
    expect(formatPopulation(110000, 'en')).toBe('110,000 people (22,000 households)');
    expect(formatPopulation(9999, 'zh')).toBe('9,999口（2,000户）');
    expect(formatPopulation(50000, 'zh')).toBe('5 万口（1 万户）');
    expect(formatPopulation(0, 'en')).toBe('0 people (0 households)');
  });

  it('converts kilometres to whole li', () => {
    expect(formatDistance(0, 'zh')).toBe('0 里');
    expect(formatDistance(49.8, 'zh')).toBe('120 里');
    expect(formatDistance(49.8, 'en')).toBe('120 li');
    expect(formatDistance(425, 'en')).toBe('1,024 li');
  });

  it('writes Chinese day numerals', () => {
    expect([1, 5, 10, 11, 20, 21, 29, 30].map(zhDayOfMonth)).toEqual([
      '初一',
      '初五',
      '初十',
      '十一',
      '二十',
      '廿一',
      '廿九',
      '三十',
    ]);
  });

  it('formats dates with reign eras', () => {
    const d = (year: number, month: number, day: number) => ({ year, month, dayOfMonth: day });
    expect(formatDate(d(190, 3, 5), 'zh')).toBe('初平元年三月初五');
    expect(formatDate(d(190, 3, 5), 'en')).toBe('Chuping 1 (190 AD), month 3, day 5');
    // Era boundaries.
    expect(formatDate(d(189, 12, 30), 'zh')).toBe('中平六年十二月三十');
    expect(formatDate(d(190, 1, 1), 'zh')).toBe('初平元年一月初一');
    expect(formatDate(d(195, 11, 21), 'zh')).toBe('兴平二年十一月廿一');
    expect(formatDate(d(196, 1, 1), 'en')).toBe("Jian'an 1 (196 AD), month 1, day 1");
    expect(formatDate(d(220, 12, 10), 'zh')).toBe('建安二十五年十二月初十');
    expect(formatDate(d(221, 2, 20), 'zh')).toBe('黄初元年二月二十');
    expect(formatDate(d(207, 10, 11), 'zh')).toBe('建安十二年十月十一');
    // Outside the listed eras: plain AD year.
    expect(formatDate(d(183, 1, 1), 'zh')).toBe('公元183年一月初一');
    expect(formatDate(d(230, 6, 2), 'en')).toBe('230 AD, month 6, day 2');
  });

  it('accepts the calendar date type', () => {
    expect(formatDate(calendarDateAt(190, 0), 'zh')).toBe('初平元年一月初一');
    expect(formatDate(calendarDateAt(190, 2 * 30 + 4), 'en')).toBe(
      'Chuping 1 (190 AD), month 3, day 5',
    );
  });

  it('knows the reign eras', () => {
    expect(reignEra(184)).toMatchObject({ nameZh: '中平', yearOfEra: 1 });
    expect(reignEra(226)).toMatchObject({ nameZh: '黄初', yearOfEra: 6 });
    expect(reignEra(227)).toBeNull();
  });
});

describe('message catalog wording', () => {
  // Allowlist: phrases that genuinely need the old word. Currently empty.
  const allowed: string[] = [];
  // Placeholder names such as {food} are not prose, so they are stripped before checking.
  const clean = (value: string) =>
    allowed.reduce((text, phrase) => text.split(phrase).join(''), value.replace(/\{[^}]*\}/g, ''));

  it('no English message calls money gold or grain food', () => {
    const offenders = Object.entries(COPY.en).filter(([, value]) =>
      /\b(gold|food)\b/i.test(clean(value)),
    );
    expect(offenders).toEqual([]);
  });

  it('no Chinese message uses 金钱, 粮食 or a number followed by 金', () => {
    const offenders = Object.entries(COPY.zh).filter(([, value]) =>
      /金钱|粮食|\d\s*金/.test(clean(value)),
    );
    expect(offenders).toEqual([]);
  });
});
