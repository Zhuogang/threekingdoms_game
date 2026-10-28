import { message } from '../../i18n';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button, Input } from '../kit';

export function BattleActionBar({
  context,
  compact = false,
}: {
  context: GameplayContext;
  compact?: boolean;
}) {
  const { activeBattle, dispatch, locale, t, setConfirmation } = context;
  if (!activeBattle) return null;
  return (
    <div className={`v03-battle-action-bar${compact ? ' v03-battle-action-bar-compact' : ''}`}>
      <label className="v03-auto-command">
        <Input
          type="checkbox"
          checked={Boolean(activeBattle.autoCommand)}
          onChange={(event) =>
            dispatch({
              type: 'setBattleAutoCommand',
              battleId: activeBattle.id,
              enabled: event.target.checked,
            })
          }
        />
        {message(locale, 'ui.let.officers.command.76')}
      </label>
      <Button
        className="v03-primary v03-block"
        disabled={activeBattle.playerDayComplete && !context.canResumeBattleDay}
        onClick={() =>
          activeBattle.autoCommand
            ? dispatch({ type: 'advance', days: 1 })
            : context.requestEndBattleDay()
        }
      >
        {context.canResumeBattleDay
          ? t.advanceDay
          : activeBattle.playerDayComplete
            ? t.battleDaySubmitted
            : t.advanceBattle}
      </Button>
      <details>
        <summary>{message(locale, 'ui.more.actions.77')}</summary>
        <Button
          className="v03-retreat-action"
          disabled={activeBattle.playerDayComplete}
          onClick={() => setConfirmation('withdraw')}
        >
          {t.retreat}
        </Button>
        <p>{t.retreatWarning}</p>
      </details>
    </div>
  );
}
