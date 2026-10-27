import { message } from '../i18n';
import { troopLevel } from '../campaign/troop-experience';
import type { GridPoint } from './geometry';
import { officerPortraitPath } from './officer-portraits';

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
  troopExperience?: number;
  label?: string;
  selected?: boolean;
  status?: string;
  /** Highest-level officer in this formation; shown beside the squad art. */
  portraitKey?: string;
  /** The portrait's commanding officer can use tower warships on water. */
  navalTraining?: boolean;
  /** Troops at the start of the battle, for the strength bar. */
  maxStrength?: number;
  /** Officers in the formation; tokens show ×N from two upward. */
  formationSize?: number;
  /** Already acted this battle day: drawn greyed out. */
  acted?: boolean;
  condition?: 'confused' | 'inspired';
  /** Morale below the rout threshold: drawn semi-transparent. */
  routed?: boolean;
}

export interface WaterCombatDisplay {
  isOnWater: boolean;
  attackMultiplier?: number;
  incomingDamageMultiplier?: number;
}

export function battlePortraitPath(portraitKey: string): string {
  return officerPortraitPath(portraitKey, 128) ?? 'assets/portraits/garrison-small.webp';
}

export const TROOP_NAMES: Record<string, { en: string; zh: string; glyph: string }> = {
  infantry: { en: 'Infantry', zh: '步兵', glyph: '步' },
  cavalry: { en: 'Cavalry', zh: '骑兵', glyph: '骑' },
  archer: { en: 'Archer', zh: '弓兵', glyph: '弓' },
  'heavy-infantry': { en: 'Heavy infantry', zh: '重步兵', glyph: '重' },
  'elite-cavalry': { en: 'Elite cavalry', zh: '精锐骑兵', glyph: '精' },
  'strong-archer': { en: 'Strong archers', zh: '强弓兵', glyph: '强' },
  water: { en: 'Waterborne unit', zh: '水上单位', glyph: '舟' },
  warship: { en: 'Navy (tower warship)', zh: '水军（楼船）', glyph: '舰' },
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

/** Display stage only: the three base troop types and naval eligibility never change. */
export function troopDisplayType(troopType: string, experience = 0): string {
  if (troopLevel(experience) < 11) return troopType;
  return (
    (
      { infantry: 'heavy-infantry', cavalry: 'elite-cavalry', archer: 'strong-archer' } as Record<
        string,
        string
      >
    )[troopType] ?? troopType
  );
}

export function formatTroopExperience(experience: number, locale: 'en' | 'zh'): string {
  // Avoid displaying 1000 experience while a fractional mean still belongs to level 10.
  return (Math.floor(experience * 100) / 100).toLocaleString(locale, { maximumFractionDigits: 2 });
}

export function troopExperienceText(experience: number, locale: 'en' | 'zh'): string {
  const level = troopLevel(experience);
  const remaining = (Math.ceil((level * 100 - experience) * 100) / 100).toLocaleString(locale, {
    maximumFractionDigits: 2,
  });
  return `${locale === 'zh' ? '兵员经验' : 'Soldier XP'} ${formatTroopExperience(experience, locale)} / 1,900 · ${
    level === 20
      ? locale === 'zh'
        ? '已满级'
        : 'Max level'
      : locale === 'zh'
        ? `距下一级 ${remaining}`
        : `${remaining} to next level`
  }`;
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
