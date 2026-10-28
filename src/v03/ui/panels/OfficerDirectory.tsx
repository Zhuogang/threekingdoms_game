import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ArrowLeft } from 'lucide-react';
import type { V03GameState } from '../../types';
import { OfficerPortrait } from '../../rendering/OfficerPortrait';
import { troopName } from '../../rendering/presentation';
import { Button, Input, Select } from '../kit';
import { OfficerProfile } from './OfficerProfile';
import {
  officerCopy,
  officerDirectory,
  officerDossier,
  OFFICER_STATUSES,
  OFFICER_STATUS_LABELS,
  type OfficerStatus,
} from '../shared/officer-view';

const PAGE_SIZE = 12;
export default function OfficerDirectory({
  state,
  locale,
  onClose,
  onVisitCity,
}: {
  state: V03GameState;
  locale: 'zh' | 'en';
  onClose: () => void;
  onVisitCity: (id: string) => void;
}) {
  const t = officerCopy[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<OfficerStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const all = useMemo(() => officerDirectory(state), [state]);
  const matching = useMemo(() => officerDirectory(state, query, status), [state, query, status]);
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const data = selected ? officerDossier(state, selected) : null;
  const closeOrBack = () => (selected ? setSelected(null) : onClose());
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [selected]);
  useEffect(() => {
    const body = dialog.current?.querySelector('.v03-window-body');
    if (body) body.scrollTop = 0;
  }, [selected, currentPage, query, status]);
  return (
    <dialog
      ref={dialog}
      className="v03-campaign-window v03-officer-directory"
      aria-labelledby="officer-directory-title"
      data-total={all.length}
      onCancel={(event) => {
        event.preventDefault();
        closeOrBack();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          closeOrBack();
        }
      }}
    >
      <header className="v03-window-header">
        <div>
          <span className="v03-kicker">
            {t.directory} · {all.length}
          </span>
          <h2 id="officer-directory-title" ref={heading} tabIndex={-1}>
            {data
              ? locale === 'zh'
                ? data.definition.chinese
                : data.definition.name
              : t.directory}
          </h2>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label={t.close}>
          <X size={20} />
        </Button>
      </header>
      <div className="v03-window-body">
        {data ? (
          <>
            <OfficerProfile state={state} id={data.definition.id} locale={locale} />
            {data.canVisitCity ? (
              <Button className="v03-profile-visit" onClick={() => onVisitCity(data.cityId!)}>
                {t.visit}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <p className="v03-muted">{t.readOnly}</p>
            <div className="v03-directory-filters">
              <label>
                {t.search}
                <Input
                  aria-label={t.search}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <label>
                {locale === 'zh' ? '人物状态' : 'Officer status'}
                <Select
                  aria-label={locale === 'zh' ? '人物状态' : 'Officer status'}
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as OfficerStatus | 'all');
                    setPage(0);
                  }}
                >
                  <option value="all">
                    {t.all} · {all.length}
                  </option>
                  {OFFICER_STATUSES.map((key) => (
                    <option value={key} key={key}>
                      {OFFICER_STATUS_LABELS[key][locale]} ·{' '}
                      {all.filter((entry) => entry.status === key).length}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <p role="status">
              {matching.length} / {all.length} {t.records}
            </p>
            <div className="v03-directory-list">
              {matching
                .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                .map(({ definition: person, status }) => (
                  <Button
                    key={person.id}
                    className="v03-directory-card"
                    aria-label={locale === 'zh' ? person.chinese : person.name}
                    onClick={() => setSelected(person.id)}
                    data-status={status}
                  >
                    <OfficerPortrait id={person.id} locale={locale} />
                    <span>
                      <strong>{locale === 'zh' ? person.chinese : person.name}</strong>
                      <small>
                        {OFFICER_STATUS_LABELS[status][locale]} ·{' '}
                        {troopName(person.troopType, locale)}
                      </small>
                      <small>
                        {t.debut}: {person.timeline.debutYear}
                      </small>
                    </span>
                  </Button>
                ))}
            </div>
            {!matching.length ? <p>{t.noMatches}</p> : null}
          </>
        )}
      </div>
      <footer className="v03-window-footer">
        {selected ? (
          <Button variant="ghost" onClick={() => setSelected(null)}>
            <ArrowLeft size={16} />
            {t.back}
          </Button>
        ) : (
          <div className="v03-directory-pagination">
            <Button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
              {t.previous}
            </Button>
            <span>
              {currentPage + 1} / {pages}
            </span>
            <Button disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>
              {t.next}
            </Button>
          </div>
        )}
      </footer>
    </dialog>
  );
}
