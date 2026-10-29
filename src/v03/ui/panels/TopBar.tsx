import { useMenuPlacement } from '../hooks/useMenuPlacement';
import { displayName } from '../shared/app-copy-3';
import { Button, Input } from '../kit';
import { message } from '../../i18n';
import { pendingCityGovernance } from '../../governance/conquest';

import type { GameplayContext } from '../hooks/gameplayView';

export function TopBar({
  context,
}: {
  context: GameplayContext & { state: NonNullable<GameplayContext['state']> };
}) {
  const {
    t,
    locale,
    selectedFaction,
    friendlyCities,
    date,
    isBattleView,
    activeBattle,
    dispatch,
    activeBattles,
    openWiki,
    setScenarioId,
    state,
    setFactionId,
    setShowCampaignMenu,
    saveGame,
    exportSave,
    fileInput,
    importSave,
    setLocale,
  } = context;
  const menuPlacement = useMenuPlacement();
  return (
    <header className="v03-topbar">
      <div className="v03-brand">
        <span className="v03-brand-mark">漢</span>
        <div>
          <strong>{t.title}</strong>
          <small>
            {selectedFaction ? displayName(selectedFaction, locale) : ''} · {t.territory}{' '}
            {friendlyCities.length}
          </small>
        </div>
      </div>
      <div className="v03-top-actions">
        <div className="v03-date">
          <small>{t.date}</small>
          <strong>{date}</strong>
        </div>
        {isBattleView ? (
          <Button
            type="button"
            className="v03-primary"
            disabled={Boolean(activeBattle?.playerDayComplete) && !context.canResumeBattleDay}
            onClick={() =>
              activeBattle &&
              (activeBattle.autoCommand
                ? dispatch({ type: 'advance', days: 1 })
                : context.requestEndBattleDay())
            }
          >
            {context.canResumeBattleDay
              ? t.advanceDay
              : activeBattle?.playerDayComplete
                ? t.battleDaySubmitted
                : t.advanceBattle}
          </Button>
        ) : state.phase === 'finished' ? (
          // Time no longer moves; point to the menu that starts another campaign.
          <Button
            type="button"
            className="v03-primary"
            onClick={() => {
              setScenarioId(state.scenarioId);
              setFactionId(state.playerFactionId);
              setShowCampaignMenu(true);
            }}
          >
            {message(locale, 'topbar.campaignEnded')}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              disabled={context.hasUnsubmittedBattleDay}
              aria-keyshortcuts="Space"
              title={message(locale, 'topbar.hotkey', { p0: message(locale, 'topbar.key.space') })}
              onClick={() => dispatch({ type: 'advance', days: 1 })}
            >
              {t.advanceDay}
            </Button>
            <Button
              type="button"
              disabled={activeBattles.some((battle) => !battle.autoCommand)}
              aria-keyshortcuts="Shift+Space"
              title={message(locale, 'topbar.hotkey', {
                p0: message(locale, 'topbar.key.shiftSpace'),
              })}
              onClick={() => dispatch({ type: 'advance', days: 10 })}
            >
              {t.advanceTen}
            </Button>
            <Button
              type="button"
              disabled={activeBattles.some((battle) => !battle.autoCommand)}
              aria-keyshortcuts="N"
              title={message(locale, 'topbar.hotkey', { p0: 'N' })}
              onClick={() => dispatch({ type: 'advance', days: 'nextEvent' })}
            >
              {t.nextEvent}
            </Button>
          </>
        )}
        <Button
          aria-keyshortcuts="I"
          title={message(locale, 'topbar.hotkey', { p0: 'I' })}
          onClick={() => context.setShowReports(true)}
        >
          {message(locale, 'ui.inbox.118')} (
          {
            new Set(
              [...context.worldEvents, ...pendingCityGovernance(state)].map((event) => event.id),
            ).size
          }
          )
        </Button>
        <details
          className="v03-app-menu"
          {...menuPlacement}
          onClick={(event) => {
            if ((event.target as Element).closest('button')) event.currentTarget.open = false;
          }}
        >
          <summary>{message(locale, 'ui.menu.119')}</summary>
          <div>
            {' '}
            <Button type="button" onClick={() => openWiki('overview')}>
              {t.wiki}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setScenarioId(state.scenarioId);
                setFactionId(state.playerFactionId);
                setShowCampaignMenu(true);
              }}
            >
              {message(locale, 'ui.campaign.menu.120')}
            </Button>
            <Button type="button" onClick={saveGame}>
              {t.save}
            </Button>
            <Button type="button" onClick={exportSave}>
              {t.export}
            </Button>
            <Button type="button" onClick={() => fileInput.current?.click()}>
              {t.load}
            </Button>
            <Input
              ref={fileInput}
              className="v03-file-input"
              type="file"
              accept=".save,.json,application/json"
              onChange={(event) => void importSave(event.target.files?.[0])}
            />
            <Button
              type="button"
              className="v03-locale"
              onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            >
              {message(locale, 'ui.text.122')}
            </Button>
          </div>
        </details>
      </div>
    </header>
  );
}
