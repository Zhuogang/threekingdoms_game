import { FACTIONS, INITIAL_CITIES, INITIAL_OFFICERS } from '../content/scenario';
import { GAME_PATTERNS, GAME_ZH } from './game.zh';
import { UI_ZH } from './ui.zh';
import { MAP_ZH } from './map.zh';
import { PLATFORM_PATTERNS, PLATFORM_ZH } from './platform.zh';

export type Locale = 'en' | 'zh';
export type TranslationParams = Record<string, string | number>;

// Canonical content stays unchanged in the simulation and in existing save files.
const names: Record<string, string> = Object.fromEntries([
  ...INITIAL_CITIES.map((city) => [city.name, city.chinese]),
  ...INITIAL_OFFICERS.map((officer) => [officer.name, officer.chinese]),
  ...FACTIONS.map((faction) => [
    faction.name,
    INITIAL_OFFICERS.find((officer) => officer.name === faction.leader)?.chinese ?? faction.chinese,
  ]),
]);

interface Pattern {
  regex: RegExp;
  keys: string[];
  translation: string;
}
function compilePattern(source: string, translation: string): Pattern {
  const keys: string[] = [];
  let pattern = '';
  let cursor = 0;
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const match of source.matchAll(/\{(\w+)\}/g)) {
    pattern += escape(source.slice(cursor, match.index));
    // Date templates must not accidentally match arbitrary English sentences.
    const capture =
      match[1] === 'month'
        ? '(?:January|February|March|April|May|June|July|August|September|October|November|December|\\d{1,2})'
        : match[1] === 'year'
          ? '\\d{1,4}'
          : '.*?';
    pattern += `(${capture})`;
    keys.push(match[1]!);
    cursor = match.index! + match[0].length;
  }
  pattern += escape(source.slice(cursor));
  return { regex: new RegExp(`^${pattern}$`, 's'), keys, translation };
}

const patterns = [
  ...GAME_PATTERNS.filter(([key]) => key !== '{city}: {message}'),
  ...Object.entries(UI_ZH).filter(
    ([key]) =>
      /\{\w+\}/.test(key) &&
      (/[a-zA-Z]/.test(key.replace(/\{\w+\}/g, '')) || /\{(?:month|year)\}/.test(key)),
  ),
  ...PLATFORM_PATTERNS,
  ...GAME_PATTERNS.filter(([key]) => key === '{city}: {message}'),
].map(([source, translation]) => compilePattern(source, translation));

function interpolate(template: string, params: TranslationParams): string {
  return template.replace(/\{(\w+)\}/g, (token, key: string) => String(params[key] ?? token));
}

function translateCanonical(source: string, depth = 0): string {
  if (depth > 8 || !source || /^[-+\d\s.,%/]+$/.test(source)) return source;
  // Imported save text may contain any string, including Object prototype keys.
  // Only dictionary-owned entries are translations; unknown text stays text.
  const dictionary = [UI_ZH, GAME_ZH, MAP_ZH, PLATFORM_ZH, names].find((catalog) =>
    Object.hasOwn(catalog, source),
  );
  const exact = dictionary?.[source];
  if (exact !== undefined) return exact;
  for (const pattern of patterns) {
    const match = pattern.regex.exec(source);
    if (!match) continue;
    const params = Object.fromEntries(
      pattern.keys.map((key, index) => [
        key,
        translateCanonical(match[index + 1] ?? '', depth + 1),
      ]),
    );
    return interpolate(pattern.translation, params);
  }
  return source;
}

/** Translate presentation only; changing language never changes a saved game. */
export function translateText(
  input: string | null | undefined,
  locale: Locale,
  params?: TranslationParams,
): string {
  const source = input ?? '';
  if (locale === 'en') return params ? interpolate(source, params) : source;
  const translated = translateCanonical(source);
  return params
    ? interpolate(
        translated,
        Object.fromEntries(
          Object.entries(params).map(([key, value]) => [
            key,
            typeof value === 'string' ? translateCanonical(value) : value,
          ]),
        ),
      )
    : translated;
}
