import { getThreatTiles } from '../game/battle';
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

/**
 * True once the armies are within striking distance of each other: an enemy could hit
 * one of our units next turn, or one of ours could hit an enemy. Pure, RNG-free.
 */
export function contactMade(battle: BattleState): boolean {
  if (battle.outcome) return true;
  const enemySide = battle.playerSide === 'attacker' ? 'defender' : 'attacker';
  const key = (tile: { x: number; y: number }) => `${tile.x},${tile.y}`;
  const threatened = new Set(getThreatTiles(battle, battle.playerSide).map(key));
  const ours = new Set(getThreatTiles(battle, enemySide).map(key));
  return battle.units.some(
    (unit) =>
      unit.troops > 0 && (unit.side === battle.playerSide ? threatened : ours).has(key(unit)),
  );
}
/** Lines appended to a capped log between two snapshots (for choosing sound cues). */
export function appendedLines(before: readonly string[], after: readonly string[]): string[] {
  for (let overlap = Math.min(before.length, after.length); overlap >= 0; overlap--) {
    let same = true;
    for (let i = 0; i < overlap && same; i++)
      same = before[before.length - overlap + i] === after[i];
    if (same) return after.slice(overlap);
  }
  return [...after];
}
