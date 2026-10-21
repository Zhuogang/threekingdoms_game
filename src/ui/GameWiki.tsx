import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { WIKI_SECTIONS } from '../content/wiki';
import { TROOP_LABELS } from '../content/scenario';
import { TRAIT_INFO } from '../content/traits';
import { getActionInfo } from '../game/campaign';
import { getBattleUnitMove, getBattleUnitRange, TACTIC_COST } from '../game/battle';
import type { BattleSkill, GameState, TroopType } from '../game/types';
import { useI18n } from '../i18n';
import LanguageSwitch from '../i18n/LanguageSwitch';
import TroopFigure from './TroopFigure';
import TroopIcon from './TroopIcon';
import { searchWiki } from './wikiSearch';
import { WIKI_OPEN_EVENT } from './wikiNavigation';

export const WIKI_TROOPS: { type: TroopType; role: string }[] = [
  { type: 'infantry', role: 'Foot soldiers; efficient against cavalry.' },
  { type: 'cavalry', role: 'Fast riders; strong against archers, slowed in hills and forests.' },
  { type: 'archer', role: 'Ranged troops; strong against infantry, weakened by rain.' },
  { type: 'naval', role: 'Water movement; dry ground costs more movement.' },
  { type: 'elite', role: 'Attack bonus and efficient hill/forest movement.' },
  { type: 'guard', role: 'Lower normal damage received and stronger counters.' },
];
export const WIKI_TACTICS: { skill: BattleSkill; label: string; note: string }[] = [
  { skill: 'fire', label: 'Fire', note: 'INT 60; damage affected by rain, wind and forest.' },
  {
    skill: 'rally',
    label: 'Rally',
    note: 'INT 50 or Might 85; raise allied morale, remove confusion and inspire.',
  },
  {
    skill: 'confuse',
    label: 'Confuse',
    note: 'INT 70; success depends on both commanders’ intellect and blocks the target’s turn.',
  },
  {
    skill: 'raidSupply',
    label: 'Raid supplies',
    note: 'INT 60 or cavalry; seize food equal to half the target unit’s troops (minimum 100), limited by enemy stocks; keep half of what was seized.',
  },
  {
    skill: 'ambush',
    label: 'Ambush',
    note: 'INT 60; stand in forest and do not move first; attack within 2 tiles at +40% damage without a counter.',
  },
  {
    skill: 'rockfall',
    label: 'Rockfall',
    note: 'INT 65; stand on a hill; hit a non-hill target within 2 tiles, ignoring terrain defense and reducing morale by 10.',
  },
];

export default function GameWiki({ state }: { state: GameState }) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false);
  const [selected, setSelected] = useState('start');
  const [query, setQuery] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const article = useRef<HTMLElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const orders = useMemo(
    () =>
      Object.fromEntries(
        WIKI_SECTIONS.map((section) => [
          section.id,
          (section.actions ?? []).map((action) => getActionInfo(state, action, '')),
        ]),
      ),
    [state],
  );
  const references = useMemo(
    () => ({
      ...Object.fromEntries(
        Object.entries(orders).map(([id, entries]) => [
          id,
          entries.flatMap((entry) => [entry.label, entry.description]),
        ]),
      ),
      troops: WIKI_TROOPS.flatMap((entry) => [TROOP_LABELS[entry.type], entry.role]),
      tactics: WIKI_TACTICS.flatMap((entry) => [entry.label, entry.note]),
      officers: [
        ...(orders.officers ?? []).flatMap((entry) => [entry.label, entry.description]),
        ...Object.values(TRAIT_INFO).flatMap((entry) => [entry.name, entry.description]),
      ],
    }),
    [orders],
  );
  const matches = useMemo(() => searchWiki(query, references), [query, references]);
  const section = matches.find((entry) => entry.id === selected) ?? matches[0];
  const chapterIndex = WIKI_SECTIONS.findIndex((entry) => entry.id === section?.id);

  useEffect(() => {
    const show = (event: Event) => {
      const chapter = (event as CustomEvent<unknown>).detail;
      if (typeof chapter === 'string' && WIKI_SECTIONS.some((entry) => entry.id === chapter)) {
        setSelected(chapter);
        setQuery('');
      }
      setOpened(true);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault();
        setOpened(true);
      }
    };
    window.addEventListener(WIKI_OPEN_EVENT, show);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener(WIKI_OPEN_EVENT, show);
      window.removeEventListener('keydown', key);
    };
  }, []);
  useEffect(() => {
    const node = dialog.current;
    if (opened && node && !node.open) {
      node.showModal();
      search.current?.focus();
    } else if (!opened && node?.open) node.close();
  }, [opened]);
  useEffect(() => {
    if (article.current) article.current.scrollTop = 0;
  }, [section?.id]);
  const choose = (id: string) => {
    setSelected(id);
    setQuery('');
  };

  return (
    <dialog
      ref={dialog}
      className="wiki-dialog"
      aria-labelledby="wiki-title"
      aria-modal="true"
      onCancel={(event) => {
        event.preventDefault();
        setOpened(false);
      }}
      onClose={() => setOpened(false)}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
          ),
        ].filter((node) => node.offsetParent !== null);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpened(false);
      }}
    >
      <div className="wiki-shell">
        <header className="wiki-header">
          <div>
            <span className="eyebrow">HEGEMONY · v0.2</span>
            <h2 id="wiki-title">
              <BookOpen size={24} />
              {t('Game Wiki')}
            </h2>
          </div>
          <LanguageSwitch />
          <button
            className="icon-button"
            aria-label={t('Close Wiki')}
            onClick={() => setOpened(false)}
          >
            <X size={22} />
          </button>
        </header>
        <div className="wiki-search">
          <label htmlFor="wiki-search-input">
            <Search size={18} />
            {t('Search the Wiki')}
          </label>
          <div>
            <input
              ref={search}
              id="wiki-search-input"
              type="search"
              value={query}
              placeholder={t('Search troops, equipment, battles…')}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button
                onClick={() => {
                  setQuery('');
                  search.current?.focus();
                }}
              >
                {t('Clear search')}
              </button>
            )}
          </div>
          <output aria-live="polite">{t('{count} chapters', { count: matches.length })}</output>
        </div>
        <div className="wiki-layout">
          <nav className="wiki-nav" aria-label={t('Wiki chapters')}>
            {matches.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setSelected(entry.id)}
                aria-current={entry.id === section?.id ? 'page' : undefined}
              >
                {t(entry.title)}
              </button>
            ))}
          </nav>
          <article
            ref={article}
            className="wiki-article"
            tabIndex={0}
            aria-label={section ? t(section.title) : t('No matching chapters')}
          >
            {!section ? (
              <div className="wiki-empty">
                <Search size={28} />
                <h3>{t('No matching chapters')}</h3>
                <p>{t('Try a troop name, command, or question in English or Chinese.')}</p>
                <button onClick={() => setQuery('')}>{t('Clear search')}</button>
              </div>
            ) : (
              <>
                <h3>{t(section.title)}</h3>
                <p className="wiki-summary">{t(section.summary)}</p>
                {(section.kind || section.actions?.length) && (
                  <p className="wiki-table-hint">
                    {t('Swipe tables sideways to see all columns.')}
                  </p>
                )}
                {section.id === 'start' && (
                  <div className="wiki-quick-links" aria-label={t('Quick links')}>
                    {['troops', 'equipment', 'battle', 'economy'].map((id) => (
                      <button key={id} onClick={() => choose(id)}>
                        {t(WIKI_SECTIONS.find((entry) => entry.id === id)!.title)}
                        <ChevronRight size={14} />
                      </button>
                    ))}
                  </div>
                )}
                {section.kind === 'troops' && (
                  <div className="wiki-table-wrap" tabIndex={0}>
                    <table>
                      <caption>{t('The six troop types')}</caption>
                      <thead>
                        <tr>
                          <th>{t('Troop type')}</th>
                          <th>{t('Movement points')}</th>
                          <th>{t('Attack range')}</th>
                          <th>{t('Role and terrain')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {WIKI_TROOPS.map(({ type, role }) => (
                          <tr key={type} data-troop={type}>
                            <th scope="row">
                              <span className="wiki-troop">
                                <TroopFigure type={type} />
                                <TroopIcon type={type} />
                                {t(TROOP_LABELS[type])}
                              </span>
                            </th>
                            <td>{getBattleUnitMove({ troopType: type })}</td>
                            <td>{getBattleUnitRange({ troopType: type })}</td>
                            <td>{t(role)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {section.kind === 'tactics' && (
                  <div className="wiki-table-wrap" tabIndex={0}>
                    <table>
                      <caption>{t('The six tactics')}</caption>
                      <thead>
                        <tr>
                          <th>{t('Tactics')}</th>
                          <th>{t('Base cost')}</th>
                          <th>{t('Requirements and effect')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {WIKI_TACTICS.map(({ skill, label, note }) => (
                          <tr key={skill} data-tactic={skill}>
                            <th scope="row">{t(label)}</th>
                            <td>{TACTIC_COST[skill]}</td>
                            <td>{t(note)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {section.kind === 'traits' && (
                  <div className="wiki-table-wrap" tabIndex={0}>
                    <table>
                      <caption>{t('Officer traits')}</caption>
                      <tbody>
                        {Object.entries(TRAIT_INFO).map(([id, trait]) => (
                          <tr key={id}>
                            <th scope="row">{t(trait.name)}</th>
                            <td>{t(trait.description)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {section.blocks.map((block) => (
                  <section key={block.heading}>
                    <h4>{t(block.heading)}</h4>
                    {block.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{t(paragraph)}</p>
                    ))}
                  </section>
                ))}
                {!!orders[section.id]?.length && (
                  <section>
                    <h4>{t('Order reference')}</h4>
                    <p>
                      {t(
                        'Base costs; other requirements are explained above and in each order preview.',
                      )}
                    </p>
                    <div className="wiki-table-wrap" tabIndex={0}>
                      <table>
                        <thead>
                          <tr>
                            <th>{t('Order')}</th>
                            <th>{t('Gold cost')}</th>
                            <th>{t('Stamina cost')}</th>
                            <th>{t('Effect')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders[section.id]!.map((order) => (
                            <tr key={order.label}>
                              <th scope="row">{t(order.label)}</th>
                              <td>{order.gold}</td>
                              <td>{order.stamina}</td>
                              <td>{t(order.description)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}
                <footer className="wiki-chapter-footer">
                  {chapterIndex > 0 && (
                    <button onClick={() => choose(WIKI_SECTIONS[chapterIndex - 1]!.id)}>
                      <ChevronLeft size={16} />
                      {t('Previous chapter')}
                    </button>
                  )}
                  {chapterIndex < WIKI_SECTIONS.length - 1 && (
                    <button onClick={() => choose(WIKI_SECTIONS[chapterIndex + 1]!.id)}>
                      {t('Next chapter')}
                      <ChevronRight size={16} />
                    </button>
                  )}
                </footer>
              </>
            )}
          </article>
        </div>
        <footer className="wiki-footnote">
          <span>{t('Reading does not advance time or issue orders.')}</span>
          <span>F1 · Esc</span>
        </footer>
      </div>
    </dialog>
  );
}
