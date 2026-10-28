import { en, type MessageKey } from './en';
import { zh } from './zh';
export type { MessageKey };
export const COPY = { en, zh };
export function message(
  locale: 'en' | 'zh',
  key: MessageKey,
  params: Record<string, string | number | boolean | null | undefined> = {},
) {
  return COPY[locale][key].replace(/\{([^}]+)\}/g, (_, name: string) => String(params[name] ?? ''));
}
export const t = message;
