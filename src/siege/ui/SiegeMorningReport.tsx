import { useEffect, useRef, useState } from 'react';
import { Button } from '../../v03/ui/kit';
import { siegeText, type SiegeLocale } from '../i18n';
import { SiegeIcon } from './storyAssets';
import { REPORT_PAGE_SIZE, type ReportItem } from './report';

export function SiegeMorningReport({
  items,
  locale,
  close,
  focus,
}: {
  items: ReportItem[];
  locale: SiegeLocale;
  close: () => void;
  focus?: (place: NonNullable<ReportItem['place']>) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [page, setPage] = useState(0);
  const start = page * REPORT_PAGE_SIZE;
  const visible = items.slice(start, start + REPORT_PAGE_SIZE);
  const remaining = Math.max(0, items.length - start - REPORT_PAGE_SIZE);
  const counters = new Set<string>();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector('button')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="siege-howto-backdrop siege-report-backdrop">
      <section
        ref={panel}
        className="siege-howto siege-report"
        role="dialog"
        aria-modal="true"
        aria-labelledby="morning-title"
        data-testid="morning-report"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close();
          if (e.key === 'Tab') {
            e.stopPropagation();
            const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button');
            if (!buttons?.length) return;
            const first = buttons[0]!,
              last = buttons[buttons.length - 1]!;
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header>
          <h1 id="morning-title">{siegeText(locale, 'morningReport')}</h1>
          <Button data-testid="report-close" onClick={close}>
            {siegeText(locale, 'reportClose')}
          </Button>
        </header>
        {items.length ? (
          <ul>
            {visible.map((item, i) => {
              const showCounter = !counters.has(item.counter);
              counters.add(item.counter);
              return (
                <li key={`${item.code}-${i}`} data-testid="report-item" data-code={item.code}>
                  <button
                    type="button"
                    data-testid="report-focus"
                    disabled={!item.place}
                    onClick={() => item.place && focus?.(item.place)}
                  >
                    <SiegeIcon name={item.icon} />
                    <strong>{item.text}</strong>
                    {showCounter && <p>{item.counter}</p>}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p data-testid="report-empty">{siegeText(locale, 'reportEmpty')}</p>
        )}
        {(page > 0 || remaining > 0) && (
          <nav className="siege-report-pages" aria-label={siegeText(locale, 'morningReport')}>
            {page > 0 && (
              <Button data-testid="report-previous" onClick={() => setPage(page - 1)}>
                {siegeText(locale, 'reportPrevious')}
              </Button>
            )}
            {remaining > 0 && (
              <Button data-testid="report-more" onClick={() => setPage(page + 1)}>
                {siegeText(locale, 'reportMore', { n: remaining })}
              </Button>
            )}
          </nav>
        )}
      </section>
    </div>
  );
}
