import { useMemo, useSyncExternalStore } from 'react';
import { translateText, type Locale, type TranslationParams } from './core';
export { translateText } from './core';
export type { Locale, TranslationParams } from './core';

const preferenceKey = 'baye.language';
function readLanguage(): Locale {
  try {
    return localStorage.getItem(preferenceKey) === 'zh' ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}
let locale: Locale = readLanguage();
const listeners = new Set<() => void>();
function updateDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  document.title = locale === 'zh' ? '三国霸业 — 群雄割据' : 'Hegemony of the Three Kingdoms';
}
updateDocument();

export function setLocale(next: Locale): void {
  if (next !== 'en' && next !== 'zh') return;
  locale = next;
  try {
    localStorage.setItem(preferenceKey, next);
  } catch {
    /* Switching works without storage. */
  }
  updateDocument();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function useI18n() {
  const language = useSyncExternalStore(
    subscribe,
    () => locale,
    () => 'en' as Locale,
  );
  return useMemo(
    () => ({
      locale: language,
      setLocale,
      t: (source: string, params?: TranslationParams) => translateText(source, language, params),
      tx: (source: string | null | undefined) => translateText(source, language),
    }),
    [language],
  );
}
