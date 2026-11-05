import { reignEra } from '../content/reign-eras';

type Locale = 'en' | 'zh';

/** One Han li is about 415 m. */
export const KM_PER_LI = 0.415;
/** The census counted households as roughly one fifth of the people. */
export const PEOPLE_PER_HOUSEHOLD = 5;

// Same convention as troopCount in formatters.ts: comma-grouped in both locales.
const group = (n: number, locale: Locale) =>
  Math.round(n).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US');

/** 12,345 -> "1.2" (one decimal, a trailing .0 dropped). */
const wan = (n: number) => {
  const value = Math.round(n / 1000) / 10;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
};

export function formatMoney(n: number, locale: Locale): string {
  if (locale === 'zh') return n >= 10000 ? `${wan(n)} 万钱` : `${group(n, locale)} 钱`;
  return `${group(n, locale)} cash`;
}

export function formatGrain(n: number, locale: Locale): string {
  return locale === 'zh' ? `${group(n, locale)} 石` : `${group(n, locale)} shi`;
}

export function formatMen(n: number, locale: Locale): string {
  return locale === 'zh' ? `${group(n, locale)} 人` : `${group(n, locale)} men`;
}

export function formatPopulation(n: number, locale: Locale): string {
  const households = n / PEOPLE_PER_HOUSEHOLD;
  if (locale === 'zh') {
    const people = n >= 10000 ? `${wan(n)} 万` : group(n, locale);
    const homes = households >= 10000 ? `${wan(households)} 万` : group(households, locale);
    return `${people}口（${homes}户）`;
  }
  return `${group(n, locale)} people (${group(households, locale)} households)`;
}

export function formatDistance(km: number, locale: Locale): string {
  const li = group(km / KM_PER_LI, locale);
  return locale === 'zh' ? `${li} 里` : `${li} li`;
}

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function zhNumber(n: number): string {
  if (n < 10) return DIGITS[n]!;
  if (n < 20) return `十${n === 10 ? '' : DIGITS[n - 10]}`;
  const tens = Math.floor(n / 10);
  return `${DIGITS[tens]}十${n % 10 ? DIGITS[n % 10] : ''}`;
}

/** 初一…初十, 十一…二十, 廿一…廿九, 三十. */
export function zhDayOfMonth(day: number): string {
  if (day <= 10) return `初${day === 10 ? '十' : DIGITS[day]}`;
  if (day <= 20) return zhNumber(day);
  if (day < 30) return `廿${DIGITS[day - 20]}`;
  return '三十';
}

export interface DateParts {
  year: number;
  month: number;
  /** `dayOfMonth` (CalendarDate) or `day` (gameDate). */
  dayOfMonth?: number;
  day?: number;
}

/** Takes a CalendarDate or the `gameDate` result; years outside the listed eras print as plain AD years. */
export function formatDate(date: DateParts, locale: Locale): string {
  const day = date.dayOfMonth ?? date.day ?? 1;
  const era = reignEra(date.year);
  if (locale === 'zh') {
    const monthText = `${zhNumber(date.month)}月`;
    if (!era) return `公元${date.year}年${monthText}${zhDayOfMonth(day)}`;
    const yearText = era.yearOfEra === 1 ? '元' : zhNumber(era.yearOfEra);
    return `${era.nameZh}${yearText}年${monthText}${zhDayOfMonth(day)}`;
  }
  if (!era) return `${date.year} AD, month ${date.month}, day ${day}`;
  return `${era.nameEn} ${era.yearOfEra} (${date.year} AD), month ${date.month}, day ${day}`;
}
