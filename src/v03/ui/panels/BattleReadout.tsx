import { message } from '../../i18n';

import {
  movementBudget,
  terrainDefenseMultiplier,
  fireWeatherMultiplier,
  fireTerrainMultiplier,
} from '../../battle';

import type { GameplayContext } from '../hooks/gameplayView';

export function BattleReadout({
  context,
}: {
  context: GameplayContext & { battleState: NonNullable<GameplayContext['battleState']> };
}) {
  const {
    locale,
    weatherName,
    battleState,
    currentUnit,
    inspectionTerrain,
    inspectionPosition,
    inspectionModifiers,
    terrainName,
    inspectionMovementCost,
  } = context;
  return (
    <div className="v03-readout-grid">
      <div>
        <small>{message(locale, 'ui.weather.next.day.78')}</small>
        <strong>
          {weatherName(battleState.weather)} / {weatherName(battleState.nextWeather)}
        </strong>
      </div>
      <div>
        <small>{message(locale, 'ui.fire.weather.multiplier.79')}</small>
        <strong>×{fireWeatherMultiplier(battleState.weather)}</strong>
      </div>
      <div>
        <small>{message(locale, 'ui.food.yours.enemy.80')}</small>
        <strong>
          {battleState.supplies[battleState.playerSide].toLocaleString()} /{' '}
          {battleState.supplies[
            battleState.playerSide === 'attacker' ? 'defender' : 'attacker'
          ].toLocaleString()}
        </strong>
      </div>
      {currentUnit ? (
        <>
          <div>
            <small>{message(locale, 'ui.movement.budget.range.81')}</small>
            <strong>
              {movementBudget(currentUnit.troopType)} / {currentUnit.attackRange}
            </strong>
          </div>
          <div>
            <small>{message(locale, 'ui.force.intellect.level.82')}</small>
            <strong>
              {currentUnit.force} / {currentUnit.intellect} / {currentUnit.level}
            </strong>
          </div>
        </>
      ) : null}
      {inspectionTerrain && inspectionPosition && inspectionModifiers ? (
        <>
          <div>
            <small>{message(locale, 'ui.inspected.terrain.83')}</small>
            <strong>
              {terrainName(inspectionTerrain)} ({inspectionPosition.x + 1},{' '}
              {inspectionPosition.y + 1})
            </strong>
          </div>
          <div>
            <small>{message(locale, 'ui.base.movement.cost.84')}</small>
            <strong>
              {inspectionMovementCost === null
                ? '—'
                : Number.isFinite(inspectionMovementCost)
                  ? inspectionMovementCost
                  : message(locale, 'ui.impassable.85')}
            </strong>
          </div>
          <div>
            <small>{message(locale, 'ui.normal.hit.terrain.multiplier.86')}</small>
            <strong>×{terrainDefenseMultiplier(inspectionTerrain)}</strong>
          </div>
          <div>
            <small>{message(locale, 'ui.fire.terrain.multiplier.87')}</small>
            <strong>×{fireTerrainMultiplier(inspectionTerrain)}</strong>
          </div>
          <div>
            <small>{message(locale, 'ui.water.attack.incoming.multiplier.88')}</small>
            <strong>
              ×{inspectionModifiers.attackMultiplier} / ×
              {inspectionModifiers.incomingDamageMultiplier}
            </strong>
          </div>
        </>
      ) : null}
    </div>
  );
}
