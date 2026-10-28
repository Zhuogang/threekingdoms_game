import { useState } from 'react';
import { Button } from '../kit';
import { message } from '../../i18n';

import {
  WATER_ATTACK_MULTIPLIER,
  WATER_INCOMING_DAMAGE_MULTIPLIER,
  battlefieldName,
} from '../../battle';

import { BattlefieldMapView, BattlefieldMinimap } from '../../rendering';

import type { GameplayContext } from '../hooks/gameplayView';
import type { BattleDisplay } from '../hooks/useBattleDisplay';
import { BattleDisplayControls } from '../panels/BattleDisplayControls';
import { BattleActionBar } from '../panels/BattleActionBar';
import { BattleUnitMenu } from '../panels/BattleUnitMenu';

export function BattleScreen({
  context,
  display,
}: {
  display: BattleDisplay;
  context: GameplayContext & {
    state: NonNullable<GameplayContext['state']>;
    battleState: NonNullable<GameplayContext['battleState']>;
    activeBattle: NonNullable<GameplayContext['activeBattle']>;
  };
}) {
  const {
    t,
    battleState,
    locationName,
    state,
    activeBattle,
    battleMapFrame,
    troopVisuals,
    battleViewport,
    setBattleViewport,
    currentUnit,
    reachableCells,
    attackableCells,
    tacticTargets,
    locale,
    handleBattleUnitClick,
    setInspectedCell,
    selectedTactic,
    setFeedback,
    dispatch,
    zoomBattleMap,
    fitBattleMap,
    focusBattleMapUnit,
    battleViewportPolygon,
    navigateBattleMinimap,
    localizedOfficerName,
  } = context;
  // Faint grid lines are on by default and can be hidden (plan §3).
  const [showGrid, setShowGrid] = useState(true);
  return (
    <section
      className="v03-battle-main"
      onKeyDown={(event) => {
        // Map shortcuts must not intercept Tab or typing in display controls.
        if (!(event.target as Element).closest('.v03-battlefield-map')) return;
        if (event.key === 'Tab' && !event.shiftKey) {
          event.preventDefault();
          context.nextReadyUnit();
        }
        if (event.key.toLowerCase() === 'w' && currentUnit) {
          event.preventDefault();
          dispatch({
            type: 'battleAction',
            battleId: activeBattle.id,
            action: { type: 'wait', unitId: currentUnit.id },
          });
        }
        if (event.key.toLowerCase() === 'e') {
          event.preventDefault();
          context.requestEndBattleDay();
        }
      }}
    >
      <div className="v03-view-heading">
        <div>
          <span className="v03-kicker">
            {t.battle} · {battlefieldName(battleState.map.battlefieldId, locale)}
          </span>
          <h1>
            {locationName(
              state.journeys.find((journey) => journey.id === activeBattle.attackerJourneyId)
                ?.destinationCityId ?? '',
            )}
          </h1>
        </div>
        <div className="v03-battle-day">
          {t.battleDayLabel} {battleState.day} / {battleState.dayLimit}
        </div>
        <BattleDisplayControls display={display} locale={locale} />
      </div>
      <div ref={battleMapFrame} className="v03-battle-board">
        <BattlefieldMapView
          map={battleState.map}
          units={troopVisuals}
          viewport={battleViewport ?? undefined}
          interactive
          showGrid={showGrid}
          onViewportChange={setBattleViewport}
          selectedCell={currentUnit ? { x: currentUnit.x, y: currentUnit.y } : undefined}
          reachableCells={reachableCells}
          attackableCells={attackableCells}
          tacticTargetCells={tacticTargets.map((target) => ({ x: target.x, y: target.y }))}
          locale={locale}
          waterAttackMultiplier={WATER_ATTACK_MULTIPLIER}
          waterIncomingDamageMultiplier={WATER_INCOMING_DAMAGE_MULTIPLIER}
          onUnitClick={(unitId) => {
            handleBattleUnitClick(unitId);
          }}
          onCellClick={(cell) => {
            setInspectedCell(cell);
            if (selectedTactic) {
              setFeedback({ key: 'tacticChooseTarget' });
              return;
            }
            if (!currentUnit) {
              setFeedback({ key: 'selectUnit' });
              return;
            }
            dispatch({
              type: 'battleAction',
              battleId: activeBattle.id,
              action: { type: 'move', unitId: currentUnit.id, x: cell.x, y: cell.y },
            });
          }}
        />
        {display.panels.minimap ? (
          <div className="v03-battle-minimap-overlay">
            <BattlefieldMinimap
              map={battleState.map}
              units={troopVisuals}
              viewportPolygon={battleViewportPolygon}
              locale={locale}
              className="v03-battlefield-minimap"
              onNavigate={navigateBattleMinimap}
            />
          </div>
        ) : null}
        <BattleUnitMenu
          key={`${context.battleActionMenu?.battleId}:${context.battleActionMenu?.unitId}:${context.battleActionMenu?.day}`}
          context={context}
        />
      </div>
      <div className="v03-battle-camera-controls" role="group" aria-label={t.battleMapCamera}>
        <Button type="button" aria-label={t.battleMapZoomOut} onClick={() => zoomBattleMap(0.8)}>
          −
        </Button>
        <Button type="button" aria-label={t.battleMapZoomIn} onClick={() => zoomBattleMap(1.25)}>
          +
        </Button>
        <Button type="button" aria-label={t.battleMapFit} onClick={fitBattleMap}>
          {message(locale, 'ui.fit.74')}
        </Button>
        <Button
          type="button"
          aria-label={t.battleMapFocusUnit}
          disabled={!currentUnit}
          onClick={focusBattleMapUnit}
        >
          {message(locale, 'ui.unit.123')}
        </Button>
        <Button
          type="button"
          aria-label={t.battleMapGrid}
          aria-pressed={showGrid}
          onClick={() => setShowGrid((value) => !value)}
        >
          {t.battleMapGridShort}
        </Button>
      </div>
      {display.panels.help ? (
        <div className="v03-battle-help">
          <strong>{currentUnit ? localizedOfficerName(currentUnit.name) : t.selectUnit}</strong>
          <p>{t.moveHelp}</p>
          <p>{t.attackHelp}</p>
          <p>{t.waterRule}</p>
          <small>{t.dayLimit.replace('30', String(battleState.dayLimit))}</small>
        </div>
      ) : null}
      {!display.panels.commands ? <BattleActionBar context={context} compact /> : null}
    </section>
  );
}
