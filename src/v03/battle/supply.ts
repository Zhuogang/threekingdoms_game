import { PILOT_LOGISTICS_RATES } from '../calendar';
import { FOOD_MICRO, rationDemand } from '../calendar/rations';
import type { BattleSide, V03TacticalBattleState } from './types';

/** Campaign-owned fractions are passed in, never duplicated in tactical saves. */
export type BattleRationRemainders = Partial<Record<BattleSide, number>>;

export function forecastBattleRations(
  battle: V03TacticalBattleState,
  side: BattleSide,
  remainderMicro = 0,
) {
  const demand = rationDemand(
    battle.units.filter((unit) => unit.side === side),
    PILOT_LOGISTICS_RATES.battleFoodPerTroopDay,
    remainderMicro,
  );
  return {
    ...demand,
    supplyDays:
      demand.dailyFood > 0
        ? Math.max(0, battle.supplies[side] - remainderMicro / FOOD_MICRO) / demand.dailyFood
        : Infinity,
    shortage: battle.supplies[side] * FOOD_MICRO < demand.demandMicro,
  };
}
