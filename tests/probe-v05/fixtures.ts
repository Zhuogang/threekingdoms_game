import { reviewBattleState } from '../e2e-v03/playability-fixtures';
import type { BattleTroopType } from '../../src/v03/battle/types';
import type { V03GameState } from '../../src/v03/types';

const MIX: BattleTroopType[] = [
  'infantry',
  'infantry',
  'infantry',
  'cavalry',
  'cavalry',
  'archer',
  'archer',
  'archer',
];

/**
 * Battle tier: a real campaign battle on `bf01-north-plain` with eight
 * formations per side (infantry, cavalry and archers), built from the
 * single-formation `reviewBattleState` battle.
 */
export function battleTierState(): V03GameState {
  const state = reviewBattleState('bf01-north-plain');
  const battle = state.battles.find((entry) => entry.active)!;
  const data = battle.battleData;
  const map = data.map;
  const templates = {
    attacker: data.units.find((unit) => unit.side === 'attacker')!,
    defender: data.units.find((unit) => unit.side === 'defender')!,
  };
  const units: typeof data.units = [];
  // Officers stay assigned to the battle: the original leaders command the first formation.
  const leaders = {
    attacker: Object.values(battle.attackerFormationOfficerIds)[0] ?? [],
    defender: Object.values(battle.defenderFormationOfficerIds)[0] ?? [],
  };
  battle.attackerFormationOfficerIds = {};
  battle.defenderFormationOfficerIds = {};
  for (const side of ['attacker', 'defender'] as const) {
    const positions = side === 'attacker' ? map.attackerDeployment : map.defenderDeployment;
    const formations =
      side === 'attacker' ? battle.attackerFormationOfficerIds : battle.defenderFormationOfficerIds;
    MIX.forEach((troopType, index) => {
      const troops = side === 'attacker' ? 450 : 400;
      const unit = {
        ...structuredClone(templates[side]),
        id: `probe:${side}:${index}:${troopType}`,
        name: `${troopType} ${index + 1}`,
        troopType,
        attackRange: troopType === 'archer' ? 3 : 1,
        troops,
        initialTroops: troops,
        moved: false,
        acted: false,
        ...positions[index]!,
      };
      units.push(unit);
      formations[unit.id] = index === 0 ? leaders[side] : [];
    });
  }
  data.units = units;
  return state;
}
