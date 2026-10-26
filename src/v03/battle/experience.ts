import { troopLevel } from '../campaign/troop-experience';
import type { BattleOutcome, TacticalBattleUnit } from './types';
import { PERSONNEL_RULES } from '../campaign/personnel';

/** Combat loss means unavailable, not all dead. Keep fractional wounded across attacks. */
export function applyCombatDamage(unit: TacticalBattleUnit, damage: number): number {
  if (!Number.isSafeInteger(damage) || damage < 0) throw new RangeError('Invalid combat damage.');
  const casualties = Math.min(unit.troops, damage);
  const numerator = casualties * PERSONNEL_RULES.woundedPercent + unit.casualtyRemainder;
  unit.wounded += Math.floor(numerator / 100);
  unit.casualtyRemainder = numerator % 100;
  unit.troops -= casualties;
  if (unit.troops + unit.wounded === 0) unit.troopExperience = 0;
  return casualties;
}

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
    unit.troops + unit.wounded === 0 ||
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
