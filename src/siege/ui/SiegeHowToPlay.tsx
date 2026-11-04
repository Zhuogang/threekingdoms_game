import { useEffect, useRef } from 'react';
import { Button } from '../../v03/ui/kit';
import { siegeText, type SiegeLocale, type SiegeTextKey } from '../i18n';
import type { SiegeWalkthrough } from '../save';
import { howToSections, type HowToRules } from './howToPlay';
import { WALKTHROUGH_STEPS } from './walkthrough';
import { SIEGE_TUNING as T } from '../rules/tuning';

export function SiegeHowToPlay({
  locale,
  close,
  replay,
  rules,
}: {
  locale: SiegeLocale;
  close: () => void;
  replay: () => void;
  rules?: HowToRules;
}) {
  const panel = useRef<HTMLElement>(null);
  const t = (key: SiegeTextKey) => siegeText(locale, key);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector('button')?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div className="siege-howto-backdrop">
      <section
        ref={panel}
        className="siege-howto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="siege-howto-title"
        data-testid="howto"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          event.stopPropagation();
          const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button');
          if (!buttons?.length) return;
          const first = buttons[0]!,
            last = buttons[buttons.length - 1]!;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header>
          <h1 id="siege-howto-title">{t('howTitle')}</h1>
          <Button onClick={close}>{t('closeGuide')}</Button>
        </header>
        {howToSections(locale, rules).map((section) => (
          <section key={section.title}>
            <h2>{t(section.title)}</h2>
            {section.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </section>
        ))}
        <Button onClick={replay}>{t('replayWalkthrough')}</Button>
      </section>
    </div>
  );
}

export function SiegeWalkthroughBox({
  progress,
  locale,
  waiting,
  skip,
}: {
  progress: SiegeWalkthrough;
  locale: SiegeLocale;
  waiting: boolean;
  skip: () => void;
}) {
  const key = (waiting ? 'walkWait' : `walk${progress.step}`) as SiegeTextKey;
  return (
    <section
      className="siege-walkthrough"
      aria-label={siegeText(locale, 'walkthrough')}
      data-testid="walkthrough"
      data-step={progress.step}
    >
      <strong>
        {siegeText(locale, 'walkthrough')} ·{' '}
        {siegeText(locale, 'walkProgress', { n: progress.step, max: WALKTHROUGH_STEPS })}
      </strong>
      <p aria-live="polite">{siegeText(locale, key, { max: T.footholdComplete })}</p>
      <Button size="sm" onClick={skip}>
        {siegeText(locale, 'skipWalkthrough')}
      </Button>
    </section>
  );
}
