import { Button } from '../kit';
import { message } from '../../i18n';

import type { GameplayContext } from '../hooks/gameplayView';
import { BattleReadout } from './BattleReadout';
export function BattleConditions({
  context,
}: {
  context: GameplayContext & { battleState: NonNullable<GameplayContext['battleState']> };
}) {
  const { locale, openWiki, battleState } = context;
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
      <BattleReadout context={{ ...context, battleState: battleState! }} />
      <small>{message(locale, 'ui.any.step.touching.water.costs.at.least.2.forest..32')}</small>
    </section>
  );
}
