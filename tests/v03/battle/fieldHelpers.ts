import {
  applyBattleAction,
  createBattleMap,
  createTacticalBattle,
  type BattleFacing,
  type BattleTroopType,
  type V03TacticalBattleState,
} from '../../../src/v03/battle';

export interface Spec {
  id: string;
  side: 'attacker' | 'defender';
  type: BattleTroopType;
  x: number;
  y: number;
  troops?: number;
  force?: number;
  facing?: BattleFacing;
  attackRange?: number;
}

/** A plain-terrain battle with units placed exactly; the attacker is the player. */
export function field(specs: Spec[], facing = true): V03TacticalBattleState {
  const map = createBattleMap({ regionId: 'xiapi', seed: 7 });
  map.terrain.fill('plain');
  const roster = (side: Spec['side']) =>
    specs
      .filter((spec) => spec.side === side)
      .map((spec) => ({
        id: spec.id,
        name: spec.id,
        troopType: spec.type,
        troops: spec.troops ?? 1000,
        force: spec.force ?? 70,
        intellect: 40,
        attackRange: spec.attackRange,
      }));
  const battle = createTacticalBattle({
    id: 'facing',
    map,
    seed: 7,
    playerSide: 'attacker',
    supplies: { attacker: 100_000, defender: 100_000 },
    attackerUnits: roster('attacker'),
    defenderUnits: roster('defender'),
    facing,
  });
  for (const spec of specs) {
    const placed = battle.units.find((entry) => entry.id === spec.id)!;
    Object.assign(placed, { x: spec.x, y: spec.y }, spec.facing ? { facing: spec.facing } : {});
  }
  battle.weather = 'clear';
  battle.tacticPoints = { attacker: 0, defender: 0 };
  return battle;
}
export const unit = (battle: V03TacticalBattleState, id: string) =>
  battle.units.find((entry) => entry.id === id)!;

/** The same state with every facing, charge and brace rule switched off. */
export function neutral(battle: V03TacticalBattleState): V03TacticalBattleState {
  const copy = structuredClone(battle);
  for (const entry of copy.units) {
    delete entry.facing;
    delete entry.charging;
    delete entry.braced;
  }
  return copy;
}

/** Casualties of the attack and of the counterattack (null when none) from the log. */
export function strike(battle: V03TacticalBattleState, attackerId: string, targetId: string) {
  const result = applyBattleAction(battle, { type: 'attack', unitId: attackerId, targetId });
  if (!result.ok) throw new Error(result.error);
  const entries = (result.state.logEntries ?? []).filter((entry) => entry.code === 'log.attack');
  const primary = entries.find((entry) => !entry.params.counter);
  const counter = entries.find((entry) => entry.params.counter);
  return {
    state: result.state,
    primary: Number(primary!.params.casualties),
    primaryParams: primary!.params,
    counter: counter ? Number(counter.params.casualties) : null,
    counterParams: counter?.params ?? null,
  };
}
