import { Button } from '../kit';
import { message } from '../../i18n';
import { movementBudget } from '../../battle';

import type { GameplayContext } from '../hooks/gameplayView';
import { BattleReadout } from './BattleReadout';

/** One line of what matters now; the multiplier table stays one click away (PF-UI-07). */
export function BattleConditions({
  context,
}: {
  context: GameplayContext & { battleState: NonNullable<GameplayContext['battleState']> };
}) {
  const { locale, openWiki, battleState, weatherName, currentUnit } = context;
  const enemySide = battleState.playerSide === 'attacker' ? 'defender' : 'attacker';
  return (
    <section
      className="v03-battle-inspection"
      aria-label={message(locale, 'ui.battle.conditions.31')}
    >
      <div className="v03-section-title">
        <strong>{message(locale, 'ui.battle.conditions.31')}</strong>
        <Button type="button" className="text-button" onClick={() => openWiki('battle')}>
          ?
        </Button>
      </div>
      <p className="v03-battle-strip">
        <span>
          {weatherName(battleState.weather)} → {weatherName(battleState.nextWeather)}
        </span>
        <span>
          {message(locale, 'battleFood', {
            own: battleState.supplies[battleState.playerSide].toLocaleString(),
            enemy: battleState.supplies[enemySide].toLocaleString(),
          })}
        </span>
        {currentUnit ? (
          <span>
            {message(locale, 'battleMoveRange', {
              move: movementBudget(currentUnit.troopType),
              range: currentUnit.attackRange,
            })}
          </span>
        ) : null}
      </p>
      <details className="v03-battle-rules">
        <summary>{message(locale, 'battleRulesDetail')}</summary>
        <BattleReadout context={{ ...context, battleState: battleState! }} />
        <small>{message(locale, 'ui.any.step.touching.water.costs.at.least.2.forest..32')}</small>
      </details>
    </section>
  );
}
