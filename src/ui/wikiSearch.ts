import { WIKI_SECTIONS } from '../content/wiki';
import { translateText } from '../i18n/core';

const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase().trim();

/** Index both languages so changing the UI language does not invalidate a search. */
export function searchWiki(query: string, references: Record<string, string[]> = {}) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return WIKI_SECTIONS;
  return WIKI_SECTIONS.filter((section) => {
    const strings = [
      section.title,
      section.summary,
      ...section.keywords,
      ...section.blocks.flatMap((block) => [block.heading, ...block.paragraphs]),
      ...(references[section.id] ?? []),
    ];
    const index = normalize(
      strings.flatMap((value) => [value, translateText(value, 'zh')]).join(' '),
    );
    return terms.every((term) => index.includes(term));
  });
}
