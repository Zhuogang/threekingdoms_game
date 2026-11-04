import { useEffect, useRef } from 'react';
import { Button } from '../../v03/ui/kit';
import { siegeText, type SiegeLocale } from '../i18n';
import { SiegeIcon } from './storyAssets';
import type { ReportItem } from './report';

export function SiegeMorningReport({
  items,
  locale,
  close,
}: {
  items: ReportItem[];
  locale: SiegeLocale;
  close: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector('button')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="siege-howto-backdrop">
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
            e.preventDefault();
            panel.current?.querySelector('button')?.focus();
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
                <SiegeIcon name={item.icon} />
                <strong>{item.text}</strong>
                <p>{item.counter}</p>
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
