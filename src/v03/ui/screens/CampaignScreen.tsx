import { message } from '../../i18n';
import { lazy, Suspense, useState } from 'react';
import { officerCopy } from '../shared/officer-view';
const OfficerDirectory = lazy(() => import('../panels/OfficerDirectory'));

import { Button } from '../kit';
import { Flag, ScrollText, Handshake, BookUser, X } from 'lucide-react';
import { displayName } from '../shared/app-copy-3';

import type { GameplayContext } from '../hooks/gameplayView';
import { CampaignMap } from '../panels/CampaignMap';
export function CampaignScreen({
  context,
}: {
  context: GameplayContext & { state: NonNullable<GameplayContext['state']> };
}) {
  const { t, state, locale } = context;
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const open = (tab: 'orders' | 'diplomacy') => {
    context.setCampaignTab(tab);
    context.setCampaignWindowOpen(true);
    context.setFeedback('');
  };
  return (
    <section className="v03-campaign-main">
      <div className="v03-view-heading">
        <div>
          <span className="v03-kicker">
            {t.campaign} ·{' '}
            {locale === 'zh'
              ? state.scenarioId === 'guandu-200'
                ? '官渡前夕'
                : '群雄割据'
              : state.scenarioId === 'guandu-200'
                ? 'On the eve of Guandu'
                : 'A divided realm'}
          </span>
          <h1>{t.territory}</h1>
        </div>
        <p className="v03-map-instruction">{message(locale, 'flow.mapHint')}</p>
      </div>
      <div className="v03-campaign-map-stage">
        <CampaignMap context={context} />
      </div>
      <footer className="v03-campaign-dock">
        <Button onClick={() => setDirectoryOpen(true)}>
          <BookUser size={18} />
          {officerCopy[locale].directory}
        </Button>
        <Button
          aria-keyshortcuts="C"
          title={message(locale, 'topbar.hotkey', { p0: 'C' })}
          onClick={() => context.focusCampaignCity(state.playerCapitalCityId)}
        >
          <Flag size={18} />
          {t.rulerCapital}
        </Button>
        <Button
          aria-keyshortcuts="O"
          title={message(locale, 'topbar.hotkey', { p0: 'O' })}
          onClick={() => open('orders')}
        >
          <ScrollText size={18} />
          {message(locale, 'flow.orders')}
        </Button>
        <Button
          aria-keyshortcuts="D"
          title={message(locale, 'topbar.hotkey', { p0: 'D' })}
          onClick={() => open('diplomacy')}
        >
          <Handshake size={18} />
          {t.diplomacy}
        </Button>
        {context.activeBattles.map((battle) => (
          <Button
            key={battle.id}
            variant="danger"
            onClick={() => {
              context.setSelectedBattleId(battle.id);
              context.setViewMode('battle');
            }}
          >
            {message(locale, 'ui.open.battle.397')}
          </Button>
        ))}
      </footer>
      {directoryOpen ? (
        <Suspense fallback={null}>
          <OfficerDirectory
            state={state}
            locale={locale}
            onClose={() => setDirectoryOpen(false)}
            onVisitCity={(id) => {
              setDirectoryOpen(false);
              context.focusCampaignCity(id);
            }}
          />
        </Suspense>
      ) : null}
      {context.marchNotice ? (
        <div className="v03-march-notice" role="status">
          <Flag size={22} />
          <div>
            <strong>{message(locale, 'flow.departed')}</strong>
            <span>
              {displayName(
                state.cities.find((city) => city.id === context.marchNotice!.source)!,
                locale,
              )}{' '}
              →{' '}
              {displayName(
                state.cities.find((city) => city.id === context.marchNotice!.target)!,
                locale,
              )}
              {' · '}
              {context.marchNotice.troops.toLocaleString()} {t.troops}
              {' · '}
              {Math.max(0, context.marchNotice.arrivalDay - state.absoluteDay)}{' '}
              {message(locale, 'ui.days.15')}
            </span>
          </div>
          <Button variant="ghost" onClick={() => context.setMarchNotice(null)} aria-label={t.close}>
            <X size={16} />
          </Button>
        </div>
      ) : null}
    </section>
  );
}
