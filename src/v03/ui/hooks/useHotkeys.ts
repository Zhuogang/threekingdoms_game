import { useEffect, useRef } from 'react';
import type { GameplayContext } from './gameplayView';

type HotkeyContext = GameplayContext & { state: NonNullable<GameplayContext['state']> };

/** Keys that press the focused control natively; leave them to the browser there. */
function activatesFocusedControl(event: KeyboardEvent): boolean {
  const target = event.target as Element | null;
  return (
    (event.key === ' ' || event.key === 'Enter') &&
    Boolean(target?.closest('button, summary, a[href], [role="button"]'))
  );
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as Element | null;
  return Boolean(
    element?.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'),
  );
}

/**
 * Campaign and battle shortcuts that call the same commands as the visible buttons.
 * Campaign: Space 1 day, Shift+Space 10 days, N next event, I inbox, O orders,
 * C capital, D diplomacy. Battle: A attack and W wait with the selected unit, E end the
 * battle day, Esc step back.
 */
export function useHotkeys(context: HotkeyContext) {
  // The listener is registered once; it always reads the latest render's context.
  const latest = useRef(context);
  latest.current = context;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = latest.current;
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isTyping(event.target) ||
        activatesFocusedControl(event) ||
        current.showWiki ||
        current.confirmation ||
        current.showCampaignMenu ||
        current.state.phase === 'finished' ||
        document.querySelector('[aria-modal="true"]')
      )
        return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };
      if (key === 'i') return run(() => current.setShowReports(!current.showReports));
      if (current.isBattleView) {
        const battle = current.activeBattle;
        if (!battle || battle.autoCommand) return;
        // The shell handles Esc inside it; this catches it after focus fell to the page.
        if (key === 'Escape') {
          if (current.cancelBattleStep()) event.preventDefault();
          return;
        }
        // Tab stays a focus key outside the map; the map handles its own Tab cycling.
        if (key === 'w' && current.currentUnit && !current.currentUnit.acted)
          return run(() =>
            current.dispatch({
              type: 'battleAction',
              battleId: battle.id,
              action: { type: 'wait', unitId: current.currentUnit!.id },
            }),
          );
        if (key === 'a' && current.currentUnit && !current.currentUnit.acted)
          return run(() => current.startAttack());
        if (key === 'e') return run(() => current.requestEndBattleDay());
        return;
      }
      if (current.campaignWindowOpen) return;
      const manualBattle = current.activeBattles.some((battle) => !battle.autoCommand);
      if (key === ' ' && !event.shiftKey && !current.hasUnsubmittedBattleDay)
        return run(() => current.dispatch({ type: 'advance', days: 1 }));
      if (key === ' ' && event.shiftKey && !manualBattle)
        return run(() => current.dispatch({ type: 'advance', days: 10 }));
      if (key === 'n' && !manualBattle)
        return run(() => current.dispatch({ type: 'advance', days: 'nextEvent' }));
      if (key === 'c')
        return run(() =>
          current.focusCampaignCity(current.state.playerCapitalCityId, { pan: true }),
        );
      if (key === 'o' || key === 'd')
        return run(() => {
          current.setCampaignTab(key === 'o' ? 'orders' : 'diplomacy');
          current.setCampaignWindowOpen(true);
          current.setFeedback('');
        });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
