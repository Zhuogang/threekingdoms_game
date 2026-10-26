import { troopLevel } from '../campaign/troop-experience';
import type { BattleOutcome, TacticalBattleUnit } from './types';

/** Normal attacks and counterattacks only; tactics keep their officer-derived damage. */
export function troopDamageMultiplier(sourceExperience: number, targetExperience: number): number {
  return (
    (1 + (troopLevel(sourceExperience) - 1) * 0.02) *
    (1 - (troopLevel(targetExperience) - 1) * 0.01)
  );
}

/** Count actual enemy casualties after clipping damage, including counterattacks and tactics. */
export function recordCombatCasualties(
  source: TacticalBattleUnit,
  target: TacticalBattleUnit,
  casualties: number,
): void {
  source.combatCasualtiesDealt += casualties;
  target.combatCasualtiesReceived += casualties;
}

/** Pure reward calculation; campaign settlement applies it once, after allocating survivors. */
export function battleExperienceGain(unit: TacticalBattleUnit, outcome: BattleOutcome): number {
  if (
    unit.troops === 0 ||
    unit.initialTroops === 0 ||
    unit.combatCasualtiesDealt + unit.combatCasualtiesReceived === 0
  )
    return 0;
  return (
    40 +
    80 * Math.min(1, unit.combatCasualtiesDealt / unit.initialTroops) +
    (outcome.winner === unit.side ? 20 : 0)
  );
}
