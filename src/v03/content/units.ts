import { BATTLE as BATTLE_TABLE, RECRUITMENT as RECRUITMENT_TABLE } from '../balance';
import type { MessageKey } from '../i18n/en';
import type { BattleTerrain } from '../battle/types';

// Module-local bindings: see the note at the top of battle/rules.ts.
const BATTLE = BATTLE_TABLE;
const RECRUITMENT = RECRUITMENT_TABLE;

export type UnitArm = 'infantry' | 'cavalry' | 'archer';
type RecruitRegion = 'north' | 'central' | 'south';

export interface UnitDefinition {
  arm: UnitArm;
  nameKey: MessageKey;
  /** Movement points per day. */
  move: number;
  /** Cost of entering a terrain; null is impassable. Water steps are floored separately in rules.ts. */
  terrainMoveCost: Record<BattleTerrain, number | null>;
  attackRange: number;
  /** Row: this arm attacking that arm. */
  matchup: Record<UnitArm, number>;
  /** Unused until B-03. */
  meleeIncoming: number;
  /** Unused until B-03. */
  charge: number | null;
  /** Unused until B-03. */
  brace: number | null;
  /** Food headcount weight; cavalry eats double. */
  foodWeight: number;
  recruit: {
    multiplier: Record<RecruitRegion, number>;
    gold: Record<RecruitRegion, number>;
  };
  eliteKey: 'heavy-infantry' | 'elite-cavalry' | 'strong-archer';
  eliteLevel: 11;
}

const M = BATTLE.movement;
const D = BATTLE.damage;
const A = BATTLE.arms;
const R = RECRUITMENT;

export const UNITS: Readonly<Record<UnitArm, UnitDefinition>> = Object.freeze({
  infantry: {
    arm: 'infantry',
    nameKey: 'unit.infantry',
    move: M.budgetInfantry,
    terrainMoveCost: {
      plain: 1,
      forest: M.roughCostOther,
      hill: M.roughCostOther,
      water: 1,
      cliff: null,
    },
    attackRange: 1,
    matchup: { infantry: 1, cavalry: D.infantryVsCavalry, archer: 1 },
    meleeIncoming: A.meleeIncomingInfantry,
    charge: null,
    brace: A.braceInfantry,
    foodWeight: 1,
    recruit: {
      multiplier: {
        north: R.multiplier.infantry,
        central: R.multiplier.infantry,
        south: R.multiplier.infantry,
      },
      gold: { north: R.gold.infantry, central: R.gold.infantry, south: R.gold.infantry },
    },
    eliteKey: 'heavy-infantry',
    eliteLevel: 11,
  },
  cavalry: {
    arm: 'cavalry',
    nameKey: 'unit.cavalry',
    move: M.budgetCavalry,
    terrainMoveCost: {
      plain: 1,
      forest: M.roughCostCavalry,
      hill: M.roughCostCavalry,
      water: 1,
      cliff: null,
    },
    attackRange: 1,
    matchup: { infantry: 1, cavalry: 1, archer: D.cavalryVsArcher },
    meleeIncoming: A.meleeIncomingCavalry,
    charge: A.chargeCavalry,
    brace: null,
    foodWeight: 2,
    recruit: {
      multiplier: {
        north: R.multiplier.cavalryNorth,
        central: R.multiplier.cavalryCentral,
        south: R.multiplier.cavalrySouth,
      },
      gold: {
        north: R.gold.cavalryNorth,
        central: R.gold.cavalryCentral,
        south: R.gold.cavalrySouth,
      },
    },
    eliteKey: 'elite-cavalry',
    eliteLevel: 11,
  },
  archer: {
    arm: 'archer',
    nameKey: 'unit.archer',
    move: M.budgetArcher,
    terrainMoveCost: {
      plain: 1,
      forest: M.roughCostOther,
      hill: M.roughCostOther,
      water: 1,
      cliff: null,
    },
    attackRange: BATTLE.roster.archerRange,
    matchup: { infantry: D.archerVsInfantry, cavalry: 1, archer: 1 },
    meleeIncoming: A.meleeIncomingArcher,
    charge: null,
    brace: null,
    foodWeight: 1,
    recruit: {
      multiplier: {
        north: R.multiplier.archer,
        central: R.multiplier.archer,
        south: R.multiplier.archer,
      },
      gold: { north: R.gold.archer, central: R.gold.archer, south: R.gold.archer },
    },
    eliteKey: 'strong-archer',
    eliteLevel: 11,
  },
});
