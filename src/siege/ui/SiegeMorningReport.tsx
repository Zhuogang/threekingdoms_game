import { useEffect, useRef } from 'react';
import { Button } from '../../v03/ui/kit';
import { siegeText, type SiegeLocale } from '../i18n';
import { SiegeIcon } from './storyAssets';
import type { ReportItem } from './report';

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
            {items.map((item, i) => (
              <li key={`${item.code}-${i}`} data-testid="report-item" data-code={item.code}>
                <button
                  type="button"
                  data-testid="report-focus"
                  disabled={!item.place}
                  onClick={() => item.place && focus?.(item.place)}
                >
                  <SiegeIcon name={item.icon} />
                  <strong>{item.text}</strong>
                  <p>{item.counter}</p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p data-testid="report-empty">{siegeText(locale, 'reportEmpty')}</p>
        )}
      </section>
    </div>
  );
}
