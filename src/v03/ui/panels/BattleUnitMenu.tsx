import { useState } from 'react';
import { getBattleTacticTargets } from '../../battle';
import { gridToWorld } from '../../rendering';
import { Button } from '../kit';
import { tacticLabel, localizeTacticReason } from '../shared/app-copy-2';
import type { GameplayContext } from '../hooks/gameplayView';

export function BattleUnitMenu({ context }: { context: GameplayContext }) {
  const { activeBattle, battleState, currentUnit, battleActionMenu: menu, locale, t } = context;
  const [mode, setMode] = useState<'actions' | 'tactics'>('actions');
  if (
    !activeBattle ||
    !battleState ||
    !currentUnit ||
    !menu ||
    menu.battleId !== activeBattle.id ||
    menu.day !== battleState.day ||
    menu.unitId !== currentUnit.id ||
    currentUnit.acted ||
    currentUnit.side !== battleState.playerSide ||
    activeBattle.autoCommand ||
    activeBattle.playerDayComplete
  )
    return null;
  const zh = locale === 'zh';
  const close = () => {
    context.setBattleActionMenu(null);
    context.setSelectedTactic(null);
  };
  const point = gridToWorld(currentUnit);
  const viewport = context.battleViewport;
  const x = viewport ? ((point.x - viewport.left) / viewport.width) * 100 : 50;
  const y = viewport ? ((point.y - viewport.top) / viewport.height) * 100 : 50;
  const tactics = context.availableTactics.map((entry) => ({
    ...entry,
    hasTargets:
      entry.allowed && getBattleTacticTargets(battleState, currentUnit.id, entry.tactic).length > 0,
  }));
  return (
    <section
      className="v03-battle-unit-menu"
      role="region"
      aria-label={zh ? '部队行动选择' : 'Unit actions'}
      style={{
        left: `clamp(8px, calc(${x}% + 12px), max(8px, calc(100% - 272px)))`,
        top: `clamp(8px, ${y}%, max(8px, calc(100% - 280px)))`,
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <strong>{context.localizedOfficerName(currentUnit.name)}</strong>
      {mode === 'actions' ? (
        <>
          <Button
            disabled={!context.attackTargets.length}
            title={!context.attackTargets.length ? t.tacticNoTargets : undefined}
            onClick={() => {
              context.setSelectedTactic(null);
              context.setBattleActionMenu(null);
              context.setFeedback(t.attackHelp);
            }}
          >
            {zh ? '攻击' : 'Attack'}
          </Button>
          <Button
            disabled={!tactics.some((entry) => entry.hasTargets)}
            title={!tactics.some((entry) => entry.hasTargets) ? t.tacticNoTargets : undefined}
            onClick={() => setMode('tactics')}
          >
            {t.tactics}
          </Button>
          <Button
            onClick={() =>
              context.dispatch({
                type: 'battleAction',
                battleId: activeBattle.id,
                action: { type: 'wait', unitId: currentUnit.id },
              })
            }
          >
            {t.waitAction}
          </Button>
          {!context.attackTargets.length ? <small>{t.tacticNoTargets}</small> : null}
        </>
      ) : (
        <>
          <p role="status">{context.selectedTactic ? t.tacticChooseTarget : t.chooseTactic}</p>
          {tactics.map((entry) => (
            <Button
              key={entry.tactic}
              disabled={!entry.hasTargets}
              aria-pressed={context.selectedTactic === entry.tactic}
              title={
                entry.reason
                  ? localizeTacticReason(entry.reason, locale, context.state)
                  : !entry.hasTargets
                    ? t.tacticNoTargets
                    : undefined
              }
              onClick={() => {
                context.setSelectedTactic(entry.tactic);
                context.setBattleActionMenu(null);
                context.setFeedback(t.tacticChooseTarget);
              }}
            >
              {tacticLabel(entry.tactic, locale)} · {t.tacticCost} {entry.cost}
            </Button>
          ))}
        </>
      )}
      {mode !== 'actions' ? (
        <Button
          variant="ghost"
          onClick={() => {
            context.setSelectedTactic(null);
            setMode('actions');
          }}
        >
          {zh ? '返回行动' : 'Back to actions'}
        </Button>
      ) : null}
      <Button variant="ghost" onClick={close}>
        {t.close}
      </Button>
    </section>
  );
}
