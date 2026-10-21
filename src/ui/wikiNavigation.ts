export const WIKI_OPEN_EVENT = 'baye:open-wiki';

/** UI navigation only: never dispatch a game command or replace an unfinished form. */
export function openWiki(chapter?: string): void {
  window.dispatchEvent(new CustomEvent(WIKI_OPEN_EVENT, { detail: chapter }));
}
