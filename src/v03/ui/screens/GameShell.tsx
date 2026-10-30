import { useState } from 'react';
import { Button, Input } from '../kit';
import { CampaignEnd } from '../panels/CampaignEnd';
import { useHotkeys } from '../hooks/useHotkeys';
import { useBattleDisplay } from '../hooks/useBattleDisplay';
import { RetreatPreview } from '../panels/RetreatPreview';
import { previewRetreat } from '../../campaign/battle-aftermath';
import { message } from '../../i18n';
import { ReportsInbox } from '../panels/ReportsInbox';
import { BattleOutcome } from '../panels/BattleOutcome';
import { localizeAppMessage } from '../shared/app-copy-2';

import { TOPIC_LABEL } from '../shared/app-copy-1';

import { ConfirmDialog } from '../shared/app-copy-3';
import type { GameplayContext } from '../hooks/gameplayView';
import { TopBar } from '../panels/TopBar';
import { Workspace } from '../panels/Workspace';
import { CampaignWindow } from '../panels/CampaignWindow';
import { activeCityGovernance, CityGovernancePrompt } from '../panels/CityGovernanceDialog';
export function GameShell({
  context,
}: {
  context: GameplayContext & { state: NonNullable<GameplayContext['state']> };
}) {
  const display = useBattleDisplay(context.isBattleView);
  useHotkeys(context);
  const {
    t,
    locale,
    activeBattle,
    dispatch,
    saveGame,
    autosaveError,
    feedback,
    setFeedback,
    setConfirmation,
    selectedGeo,
    orderPreviewOrder,
    orderPreviewSourceCity,
    confirmation,
    showWiki,
    setShowWiki,
    wikiModalRef,
    wikiSearch,
    setWikiSearch,
    filteredWikiArticles,
    wikiTopic,
    setWikiTopic,
    displayedWikiArticle,
  } = context;
  const outcomeEvent = activeCityGovernance(context)
    ? undefined
    : context.state.events.find(
        (entry) =>
          entry.kind === 'battleResolved' &&
          entry.battleOutcome &&
          !entry.acknowledged &&
          entry.tier === 'critical',
      );
  // The end screen follows any last battle report; dismissing it leaves the map to browse.
  const endKey = `${context.state.scenarioId}:${context.state.winnerFactionId}:${context.state.absoluteDay}`;
  const [dismissedEnd, setDismissedEnd] = useState<string | null>(null);
  const showEnd = context.state.phase === 'finished' && !outcomeEvent && dismissedEnd !== endKey;
  return (
    <main
      ref={display.root}
      className={`v03-shell${context.isBattleView ? ' v03-battle-shell' : ''}${display.expanded && context.isBattleView ? ' v03-battle-expanded' : ''}`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (
          context.confirmation ||
          context.showWiki ||
          context.showReports ||
          (event.target as Element).closest('[role="dialog"]')
        )
          return;
        const menu = (event.target as Element).closest<HTMLDetailsElement>('details[open]');
        if (menu) {
          event.preventDefault();
          menu.open = false;
          menu.querySelector('summary')?.focus();
          return;
        }
        if (context.isBattleView && (context.selectedTactic || context.inspectedCell)) {
          event.preventDefault();
          context.setSelectedTactic(null);
          context.setInspectedCell(null);
          return;
        }
        if (display.expanded && !display.fullscreen) {
          event.preventDefault();
          display.leave();
        }
      }}
    >
      {context.showReports ? <ReportsInbox context={context} /> : null}
      {(() => {
        const event = outcomeEvent;
        return event ? (
          <BattleOutcome
            event={event}
            state={context.state}
            locale={locale}
            closeLabel={
              context.activeBattles.length ? message(locale, 'flow.continueBattle') : undefined
            }
            onClose={() => {
              dispatch({ type: 'acknowledgeEvent', eventId: event.id });
              context.setSelectedCityId(event.battleOutcome!.cityId);
              context.setViewMode(context.activeBattles.length ? 'battle' : 'campaign');
            }}
          />
        ) : null;
      })()}
      {showEnd ? (
        <CampaignEnd
          state={context.state}
          locale={locale}
          onViewMap={() => setDismissedEnd(endKey)}
          onNewCampaign={() => {
            setDismissedEnd(endKey);
            context.setScenarioId(context.state.scenarioId);
            context.setFactionId(context.state.playerFactionId);
            context.setShowCampaignMenu(true);
          }}
        />
      ) : null}
      <CityGovernancePrompt context={context} />

      {!context.isBattleView || display.panels.topbar ? <TopBar context={{ ...context }} /> : null}
      {autosaveError ? (
        <div className="v03-alert" role="alert">
          {t.savingFailed}{' '}
          <Button type="button" onClick={saveGame}>
            {t.saveRetry}
          </Button>
        </div>
      ) : null}
      {feedback && !context.campaignWindowOpen && !outcomeEvent ? (
        <div className="v03-toast" role="status">
          {localizeAppMessage(feedback, locale, context.state)}
          <Button type="button" aria-label={t.close} onClick={() => setFeedback('')}>
            ×
          </Button>
        </div>
      ) : null}
      <Workspace
        display={display}
        context={{
          ...context,
          selectedGeo: selectedGeo!,
          orderPreviewSourceCity: orderPreviewSourceCity!,
          orderPreviewOrder: orderPreviewOrder!,
        }}
      />
      {context.campaignWindowOpen && !context.isBattleView ? (
        <CampaignWindow context={context} />
      ) : null}
      {confirmation === 'end-day' && activeBattle ? (
        <ConfirmDialog
          title={message(locale, 'ui.end.battle.day.59')}
          detail={message(locale, 'ui.some.units.are.still.ready.they.will.hold.positi.60')}
          cancelLabel={context.t.cancel}
          confirmLabel={context.t.advanceBattle}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            setConfirmation(null);
            dispatch({ type: 'completeBattleDay', battleId: activeBattle.id });
          }}
        >
          <Button
            type="button"
            onClick={() => {
              setConfirmation(null);
              dispatch({
                type: 'completeBattleDay',
                battleId: activeBattle.id,
                remainingAct: true,
              });
            }}
          >
            {message(locale, 'battle.remainingAct')}
          </Button>
        </ConfirmDialog>
      ) : null}
      {confirmation === 'withdraw' && activeBattle ? (
        <ConfirmDialog
          title={message(locale, 'ui.withdraw.from.battle.61')}
          detail={t.retreatWarning}
          body={<RetreatPreview state={context.state} battle={activeBattle} locale={locale} />}
          cancelLabel={message(locale, 'ui.cancel.62')}
          confirmLabel={
            previewRetreat(context.state, activeBattle, activeBattle.battleData.playerSide).risk ===
            100
              ? locale === 'zh'
                ? '确认投降'
                : 'Confirm surrender'
              : message(locale, 'ui.confirm.withdrawal.63')
          }
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            setConfirmation(null);
            dispatch({
              type: 'battleAction',
              battleId: activeBattle.id,
              action: { type: 'retreat', side: activeBattle.battleData.playerSide },
            });
          }}
        />
      ) : null}
      {showWiki ? (
        <div
          className="v03-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowWiki(false);
          }}
        >
          <section
            ref={wikiModalRef}
            className="v03-wiki-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t.wiki}
            onKeyDown={(event) => {
              if (event.key !== 'Tab') return;
              const controls = wikiModalRef.current?.querySelectorAll<HTMLElement>(
                'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
              );
              if (!controls?.length) return;
              const first = controls[0]!;
              const last = controls[controls.length - 1]!;
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
              <div>
                <span className="v03-kicker">HEGEMONY v0.3</span>
                <h2>{t.wiki}</h2>
              </div>
              <Button type="button" onClick={() => setShowWiki(false)} aria-label={t.close}>
                ×
              </Button>
            </header>
            <label className="v03-wiki-search">
              <span>{t.searchWiki}</span>
              <Input
                type="search"
                value={wikiSearch}
                onChange={(event) => setWikiSearch(event.target.value)}
                aria-label={t.searchWiki}
              />
            </label>
            <nav className="v03-wiki-tabs">
              {filteredWikiArticles.map((article) => (
                <Button
                  type="button"
                  className={wikiTopic === article.id ? 'active' : ''}
                  key={article.id}
                  onClick={() => setWikiTopic(article.id)}
                >
                  {TOPIC_LABEL[locale][article.id]}
                </Button>
              ))}
            </nav>
            <div className="v03-wiki-body">
              {displayedWikiArticle ? (
                displayedWikiArticle.sections.map((section) => (
                  <section key={section.heading}>
                    <h3>{section.heading}</h3>
                    {section.body.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </section>
                ))
              ) : (
                <p role="status">{t.noWikiResults}</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
