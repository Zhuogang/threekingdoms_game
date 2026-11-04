import { SIEGE_TUNING as T } from '../rules/tuning';
import { en, enReasons } from './en';
import { zh, zhReasons } from './zh';
export type SiegeLocale = 'en' | 'zh';
export type SiegeTextKey = keyof typeof en;
export const SIEGE_COPY = { en, zh };
export const SIEGE_REASONS = { en: enReasons, zh: zhReasons };
export function siegeText(
  locale: SiegeLocale,
  key: SiegeTextKey,
  params: Record<string, string | number> = {},
): string {
  const text = SIEGE_COPY[locale][key].replace(/\{([^}]+)\}/g, (_, name: string) =>
    String(params[name] ?? ''),
  );
  return locale === 'zh' && key.startsWith('report')
    ? text.replace(/(?<=[\u3400-\u9fff]) +| +(?=[\u3400-\u9fff])/gu, '')
    : text;
}
export function rejectionText(locale: SiegeLocale, reason: string): string {
  return (SIEGE_REASONS[locale][reason as keyof typeof enReasons] ?? reason).replace(
    '{max}',
    String(T.engineCap),
  );
}
