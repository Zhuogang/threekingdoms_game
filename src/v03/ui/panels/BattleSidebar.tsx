import { Button, Input } from '../kit';
import { BattleLog } from './BattleLog';
import { message } from '../../i18n';

import { battlePortraitPath } from '../../rendering/presentation';
import { resolvePublicAsset } from '../../rendering/assets';
import { UnitIcon } from '../../rendering/UnitIcon';
import { battleTerrainAt } from '../../battle';

import { tacticLabel, localizeTacticReason } from '../shared/app-copy-2';

import type { GameplayContext } from '../hooks/gameplayView';
import { BattleConditions } from './BattleConditions';
export function BattleSidebar({
  context,
}: {
  context: GameplayContext & {
    state: NonNullable<GameplayContext['state']>;
    battleState: NonNullable<GameplayContext['battleState']>;
    activeBattle: NonNullable<GameplayContext['activeBattle']>;
  };
}) {
  const {
    t,
    battleState,
    locale,
    currentUnit,
    selectedUnitId,
    handleBattleUnitClick,
    localizedOfficerName,
    unitBattleStatus,
    attackForecasts,
    selectedTactic,
    tacticForecasts,
    dispatch,
    activeBattle,
    availableTactics,
    state,
    setFeedback,
    setSelectedTactic,
    selectedTacticAvailability,
    tacticTargets,
    setConfirmation,
    activeBattles,
    setViewMode,
    troopVisuals,
  } = context;
  return (
    <div className="v03-battle-sidebar">
      <div className="v03-battle-sidebar-scroll">
        <div className="v03-panel-title">
          <span className="v03-kicker">{t.battleOrders}</span>
          <h2>
            {battleState.units
              .filter((unit) => unit.side === battleState.playerSide && unit.troops > 0)
              .reduce((sum, unit) => sum + unit.troops, 0)
              .toLocaleString()}{' '}
            ·{' '}
            {battleState.units
              .filter((unit) => unit.side !== battleState.playerSide && unit.troops > 0)
              .reduce((sum, unit) => sum + unit.troops, 0)
              .toLocaleString()}
          </h2>
        </div>
        <p className="v03-muted">{t.moveHelp}</p>
        <BattleConditions context={{ ...context, battleState: battleState! }} />
        <div className="v03-unit-list">
          {battleState.units
            .filter((unit) => unit.troops > 0)
            .map((unit) => {
              const portraitKey = troopVisuals.find((visual) => visual.id === unit.id)?.portraitKey;
              return (
                <Button
                  type="button"
                  key={unit.id}
                  className={`v03-unit-row ${unit.id === selectedUnitId ? 'selected' : ''} ${unit.side === battleState.playerSide ? '' : 'enemy'}`}
                  onClick={() => handleBattleUnitClick(unit.id)}
                >
                  <span className="v03-unit-art-pair">
                    {portraitKey ? (
                      <img
                        className="v03-unit-leader"
                        src={resolvePublicAsset(
                          battlePortraitPath(portraitKey),
                          import.meta.env.BASE_URL,
                        )}
                        alt=""
                      />
                    ) : null}
                    <UnitIcon
                      troopType={unit.troopType}
                      onWater={battleTerrainAt(battleState.map, unit) === 'water'}
                      locale={locale}
                    />
                  </span>
                  <span>
                    <strong>{localizedOfficerName(unit.name)}</strong>
                    <small>
                      {unit.troops.toLocaleString()} · {unit.morale}% · {unitBattleStatus(unit)}
                    </small>
                    {unit.side !== battleState.playerSide && attackForecasts.has(unit.id) ? (
                      <small className="v03-attack-forecast">
                        {t.estimatedLosses}{' '}
                        {attackForecasts.get(unit.id)?.estimatedCasualties?.toLocaleString() ?? '—'}
                        {' · '}
                        {t.counterattackLabel}{' '}
                        {attackForecasts
                          .get(unit.id)
                          ?.counterattack.estimatedCasualties?.toLocaleString() ?? '—'}
                        {' · '}
                        {attackForecasts.get(unit.id)?.targetOnWater
                          ? t.waterTargetDamage
                          : attackForecasts.get(unit.id)?.sourceOnWater
                            ? t.waterAttackPenalty
                            : t.landModifiers}
                      </small>
                    ) : null}
                    {selectedTactic && tacticForecasts.has(unit.id) ? (
                      <small className="v03-tactic-forecast">
                        {tacticLabel(selectedTactic, locale)} · {t.tacticChance}{' '}
                        {tacticForecasts.get(unit.id)?.chance ?? 0}%
                        {(tacticForecasts.get(unit.id)?.maxCasualties ?? 0) > 0 ? (
                          <>
                            {' · '}
                            {t.tacticCasualties}{' '}
                            {tacticForecasts.get(unit.id)?.minCasualties.toLocaleString()}–
                            {tacticForecasts.get(unit.id)?.maxCasualties.toLocaleString()}
                          </>
                        ) : null}
                        {(tacticForecasts.get(unit.id)?.moraleChange ?? 0) !== 0 ? (
                          <>
                            {' · '}
                            {t.tacticMorale}{' '}
                            {tacticForecasts.get(unit.id)!.moraleChange > 0 ? '+' : ''}
                            {tacticForecasts.get(unit.id)?.moraleChange}%
                          </>
                        ) : null}
                        {(tacticForecasts.get(unit.id)?.suppliesTransferred ?? 0) > 0 ? (
                          <>
                            {' · '}
                            {t.tacticSupplies}{' '}
                            {tacticForecasts.get(unit.id)?.suppliesTransferred.toLocaleString()}
                          </>
                        ) : null}
                        {tacticForecasts.get(unit.id)?.sourceOnWater ||
                        tacticForecasts.get(unit.id)?.targetOnWater ? (
                          <>
                            {' · '}
                            {tacticForecasts.get(unit.id)?.sourceOnWater
                              ? t.waterAttackPenalty
                              : t.waterTargetDamage}
                          </>
                        ) : null}
                      </small>
                    ) : null}
                  </span>
                  <i>{unit.side === battleState.playerSide ? '●' : '○'}</i>
                </Button>
              );
            })}
        </div>
        {currentUnit ? (
          <div className="v03-card v03-unit-detail">
            <strong>{localizedOfficerName(currentUnit.name)}</strong>
            <p>
              {currentUnit.troops.toLocaleString()} {message(locale, 'ui.troops.75')} ·{' '}
              {currentUnit.morale}% {message(locale, 'ui.morale.4')} ·{' '}
              {unitBattleStatus(currentUnit)}
            </p>
            <Button
              type="button"
              disabled={currentUnit.acted}
              onClick={() =>
                dispatch({
                  type: 'battleAction',
                  battleId: activeBattle.id,
                  action: { type: 'wait', unitId: currentUnit.id },
                })
              }
            >
              {t.waitAction}
            </Button>
          </div>
        ) : null}
        {currentUnit ? (
          <section className="v03-tactics" aria-labelledby="v03-tactics-title">
            <div className="v03-section-title">
              <h3 id="v03-tactics-title">{t.tactics}</h3>
              <small>
                {t.tacticPoints}: {battleState.tacticPoints[battleState.playerSide]}
              </small>
            </div>
            <p className="v03-muted">{t.chooseTactic}</p>
            <div className="v03-tactic-list">
              {availableTactics.map((entry) => {
                const label = tacticLabel(entry.tactic, locale);
                const reason = entry.reason
                  ? localizeTacticReason(entry.reason, locale, state)
                  : null;
                return (
                  <Button
                    key={entry.tactic}
                    type="button"
                    className={selectedTactic === entry.tactic ? 'selected' : ''}
                    aria-pressed={selectedTactic === entry.tactic}
                    aria-describedby={reason ? `v03-tactic-${entry.tactic}-reason` : undefined}
                    title={
                      reason ?? `${t.tacticCost} ${entry.cost} · ${t.rangeLabel} ${entry.range}`
                    }
                    onClick={() => {
                      if (activeBattle.playerDayComplete) {
                        setFeedback({ key: 'battleDaySubmitted' });
                      } else if (!entry.allowed) {
                        setFeedback(reason ?? t.tacticNoTargets);
                      } else {
                        setSelectedTactic(selectedTactic === entry.tactic ? null : entry.tactic);
                      }
                    }}
                  >
                    {label} · {t.tacticCost} {entry.cost}
                  </Button>
                );
              })}
            </div>
            {availableTactics.some((entry) => entry.reason) ? (
              <ul className="v03-tactic-reasons">
                {availableTactics
                  .filter((entry) => entry.reason)
                  .map((entry) => (
                    <li id={`v03-tactic-${entry.tactic}-reason`} key={entry.tactic}>
                      {tacticLabel(entry.tactic, locale)}:{' '}
                      {localizeTacticReason(entry.reason!, locale, state)}
                    </li>
                  ))}
              </ul>
            ) : null}
            {selectedTactic ? (
              <div className="v03-tactic-preview" aria-live="polite">
                <strong>{tacticLabel(selectedTactic, locale)}</strong>
                {selectedTacticAvailability?.reason ? (
                  <span>
                    {localizeTacticReason(selectedTacticAvailability.reason, locale, state)}
                  </span>
                ) : tacticTargets.length === 0 ? (
                  <span>{t.tacticNoTargets}</span>
                ) : (
                  <span>
                    {t.tacticCost} {selectedTacticAvailability?.cost} · {t.rangeLabel}{' '}
                    {selectedTacticAvailability?.range} · {tacticTargets.length} {t.targetCount}
                  </span>
                )}
              </div>
            ) : null}
          </section>
        ) : null}
        {activeBattle.playerDayComplete && activeBattles.length > 1 ? (
          <p className="v03-muted">{t.resolveOtherBattles}</p>
        ) : null}
        <Button type="button" className="v03-block" onClick={() => setViewMode('campaign')}>
          {t.campaign}
        </Button>
        <BattleLog context={context} />
      </div>
      <div className="v03-battle-action-bar">
        <label className="v03-field">
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
          disabled={activeBattle.playerDayComplete}
          onClick={() =>
            activeBattle.autoCommand
              ? dispatch({ type: 'advance', days: 1 })
              : context.requestEndBattleDay()
          }
        >
          {activeBattle.playerDayComplete ? t.battleDaySubmitted : t.advanceBattle}
        </Button>
        <details>
          <summary>{message(locale, 'ui.more.actions.77')}</summary>
          <Button
            className="v03-retreat-action"
            disabled={!currentUnit || activeBattle.playerDayComplete}
            onClick={() => setConfirmation('withdraw')}
          >
            {t.retreat}
          </Button>
          <p>{t.retreatWarning}</p>
        </details>
      </div>
    </div>
  );
}
