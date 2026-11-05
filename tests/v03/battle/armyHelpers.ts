import {
  createBattleMap,
  createTacticalBattle,
  type BattleRosterEntry,
  type BattleTroopType,
  type V03TacticalBattleState,
} from '../../../src/v03/battle';

export interface ArmySpec {
  id: string;
  side: 'attacker' | 'defender';
  type?: BattleTroopType;
  role?: 'baggage';
  x: number;
  y: number;
  troops?: number;
  force?: number;
  morale?: number;
  leadership?: number;
  fierce?: boolean;
}

/** A plain-terrain battle with units placed exactly. Army morale is on unless `armyMorale` is false. */
export function army(
  specs: ArmySpec[],
  options: {
    playerSide?: 'attacker' | 'defender';
    armyMorale?: boolean;
    facing?: boolean;
    seed?: number;
  } = {},
): V03TacticalBattleState {
  const map = createBattleMap({ regionId: 'xiapi', seed: 7 });
  map.terrain.fill('plain');
  const roster = (side: ArmySpec['side']): BattleRosterEntry[] =>
    specs
      .filter((spec) => spec.side === side)
      .map((spec) => ({
        id: spec.id,
        name: spec.id,
        troopType: spec.type ?? 'infantry',
        troops: spec.troops ?? 1000,
        force: spec.force ?? 70,
        intellect: 40,
        ...(spec.role ? { role: spec.role, attackRange: 0 } : {}),
        ...(spec.leadership !== undefined ? { leadership: spec.leadership } : {}),
        ...(spec.fierce ? { fierce: true } : {}),
      }));
  const battle = createTacticalBattle({
    id: 'army',
    map,
    seed: options.seed ?? 7,
    playerSide: options.playerSide ?? 'attacker',
    supplies: { attacker: 100_000, defender: 100_000 },
    attackerUnits: roster('attacker'),
    defenderUnits: roster('defender'),
    facing: options.facing ?? true,
    ...(options.armyMorale === false ? {} : { armyMorale: true }),
  });
  for (const spec of specs) {
    const placed = battle.units.find((entry) => entry.id === spec.id)!;
    Object.assign(placed, { x: spec.x, y: spec.y }, spec.morale ? { morale: spec.morale } : {});
  }
  battle.weather = 'clear';
  battle.tacticPoints = { attacker: 0, defender: 0 };
  return battle;
}

export const find = (battle: V03TacticalBattleState, id: string) =>
  battle.units.find((entry) => entry.id === id)!;

export const logged = (battle: V03TacticalBattleState, code: string) =>
  (battle.logEntries ?? []).filter((entry) => entry.code === code);
