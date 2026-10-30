import { message } from '../../i18n';
import { lazy, Suspense, useState } from 'react';
import { officerCopy } from '../shared/officer-view';
const OfficerDirectory = lazy(() => import('../panels/OfficerDirectory'));

import { Button } from '../kit';
import { Flag, ScrollText, Handshake, BookUser, X } from 'lucide-react';
import { displayName } from '../shared/app-copy-3';

import type { GameplayContext } from '../hooks/gameplayView';
import { CampaignMap } from '../panels/CampaignMap';
import { CampaignStatus } from '../panels/CampaignStatus';
export function CampaignScreen({
  context,
}: {
  context: GameplayContext & { state: NonNullable<GameplayContext['state']> };
}) {
  const { t, state, locale } = context;
  const [directoryOpen, setDirectoryOpen] = useState<false | 'all' | 'mine-troops'>(false);
  const open = (tab: 'orders' | 'diplomacy') => {
    context.setCampaignTab(tab);
    context.setCampaignWindowOpen(true);
    context.setFeedback('');
  };
  return (
    <section className="v03-campaign-main">
      <CampaignStatus context={context} onOpenDirectory={() => setDirectoryOpen('mine-troops')} />
      <div className="v03-campaign-map-stage">
        <CampaignMap context={context} />
      </div>
      <footer className="v03-campaign-dock">
        <Button onClick={() => setDirectoryOpen('all')}>
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
            {message(locale, 'status.battle', {
              city: displayName(
                state.cities.find(
                  (city) =>
                    city.id ===
                    state.journeys.find((journey) => journey.id === battle.attackerJourneyId)
                      ?.destinationCityId,
                ) ?? { name: '—', chinese: '—' },
                locale,
              ),
            })}
          </Button>
        ))}
      </footer>
      {directoryOpen ? (
        <Suspense fallback={null}>
          <OfficerDirectory
            state={state}
            locale={locale}
            initialScope={directoryOpen}
            onClose={() => setDirectoryOpen(false)}
            onVisitCity={(id) => {
              setDirectoryOpen(false);
              context.focusCampaignCity(id, { pan: true });
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
