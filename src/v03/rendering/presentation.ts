import { message } from '../i18n';
import type { GridPoint } from './geometry';

export type TroopVisualKind = string;
export type FactionVisualKind = 'player' | 'opponent' | string;

export interface BattleUnitVisual {
  id: string;
  troopType: TroopVisualKind;
  position: GridPoint;
  faction: FactionVisualKind;
  /** Optional, and expected to be derived from the battle rules snapshot. */
  isOnWater?: boolean;
  strength?: number;
  label?: string;
  selected?: boolean;
  status?: string;
  /** Portrait of the formation's highest-level officer; display only. */
  portraitKey?: string;
}

/** Public path of the 128px battle-token portrait for an officer identity. */
export function battlePortraitPath(portraitKey: string): string {
  return `assets/portraits/${portraitKey}-small.webp`;
}

export interface WaterCombatDisplay {
  isOnWater: boolean;
  attackMultiplier?: number;
  incomingDamageMultiplier?: number;
}

export const TROOP_NAMES: Record<string, { en: string; zh: string; glyph: string }> = {
  infantry: { en: 'Infantry', zh: '步兵', glyph: '步' },
  cavalry: { en: 'Cavalry', zh: '骑兵', glyph: '骑' },
  archer: { en: 'Archer', zh: '弓兵', glyph: '弓' },
  naval: { en: 'Naval unit', zh: '水上部队', glyph: '舟' },
  elite: { en: 'Elite', zh: '精锐', glyph: '锐' },
  guard: { en: 'Guard', zh: '护卫', glyph: '卫' },
};

export function unitIsOnWater(
  unit: BattleUnitVisual,
  map: { width: number; height: number; terrain: readonly string[] },
): boolean {
  if (unit.isOnWater !== undefined) return unit.isOnWater;
  const { x, y } = unit.position;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  return map.terrain[y * map.width + x] === 'water';
}

export function waterCombatDisplay(
  unit: BattleUnitVisual,
  map: { width: number; height: number; terrain: readonly string[] },
  modifiers: Omit<WaterCombatDisplay, 'isOnWater'> = {},
): WaterCombatDisplay {
  return { isOnWater: unitIsOnWater(unit, map), ...modifiers };
}

export function troopName(troopType: string, locale: 'en' | 'zh'): string {
  const name = TROOP_NAMES[troopType];
  return name?.[locale] ?? troopType;
}

export function troopGlyph(troopType: string): string {
  return TROOP_NAMES[troopType]?.glyph ?? '兵';
}

/** Historical casualties stay in rule/save records, not active map tokens. */
export function isLivingBattleUnitVisual(unit: BattleUnitVisual): boolean {
  return unit.strength === undefined || (Number.isFinite(unit.strength) && unit.strength > 0);
}

/** Exact counts avoid turning a living detachment into a misleading zero badge. */
export function formatTroopCount(strength: number, locale: 'en' | 'zh'): string {
  const count = Number.isFinite(strength) ? Math.max(0, Math.floor(strength)) : 0;
  return count.toLocaleString(message(locale, 'ui.en.us.19'));
}

export function formatModifier(
  multiplier: number | undefined,
  locale: 'en' | 'zh',
): string | undefined {
  if (multiplier === undefined || !Number.isFinite(multiplier)) return undefined;
  const percent = Math.round(multiplier * 100);
  return message(locale, 'ui.text.153', { p0: percent });
}

export interface CellMarker {
  id?: string;
  position: GridPoint;
  label?: string;
}

export interface CampaignCityVisual {
  info?: string;
  id: string;
  name: string;
  position: { x: number; y: number };
  scale: 'imperial' | 'major' | 'standard' | 'humble';
  controllerColor?: string;
  governance?: 'direct' | 'governed' | 'local';
  selected?: boolean;
}

export interface WorldPolyline {
  id: string;
  points: readonly { x: number; y: number }[];
  label?: string;
  /** Presentation-only route/party status; it never affects travel rules. */
  display?: 'route' | 'selected' | 'marching' | 'transport' | 'waiting';
}
