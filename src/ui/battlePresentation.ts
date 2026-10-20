import type { BattleState, BattleUnit } from '../game/types';

export function unitReadiness(unit: BattleUnit): string {
  if (unit.status === 'confused') return 'Confused · unavailable';
  if (unit.acted) return 'Finished for today';
  if (unit.moved) return 'Moved · action ready';
  return 'Ready';
}

/** Stable roster order; camera/selection callers never issue a simulation command. */
export function nextReadyUnit(battle: BattleState, selectedId: string | null): BattleUnit | null {
  const start = battle.units.findIndex((unit) => unit.id === selectedId);
  for (let offset = 1; offset <= battle.units.length; offset++) {
    const unit = battle.units[(start + offset + battle.units.length) % battle.units.length]!;
    if (
      unit.side === battle.playerSide &&
      unit.troops > 0 &&
      !unit.acted &&
      unit.status !== 'confused'
    )
      return unit;
  }
  return null;
}
