import { describe, expect, it } from 'vitest';
import {
  BATTLE_HEIGHT,
  BATTLE_WIDTH,
  MAX_UNITS_PER_SIDE,
  WATER_ATTACK_MULTIPLIER,
  WATER_INCOMING_DAMAGE_MULTIPLIER,
  advanceBattleDay,
  applyBattleAction,
  applyWaterDamageModifiers,
  battleTerrainDefenseMultiplier,
  battleStepCost,
  battleTerrainAt,
  casualtyCountAfterWater,
  createBattleMap,
  createTacticalBattle,
  findBattlePath,
  getReachableBattleTiles,
  getUnitReachableTiles,
  getBattleTimeoutOutcome,
  isBattleAttackInRange,
  objectiveAt,
  objectiveDefenseMultiplier,
  validateBattleMap,
  validateBattleUnits,
  waterCombatModifiers,
  runBattleAiTurn,
  type BattleMap,
  type BattlePosition,
  type BattleRegion,
  type BattleTroopType,
} from '../../src/v03/battle';

const regions: BattleRegion[] = ['hanzhong', 'shouchun', 'xiapi', 'chengdu'];
const troopTypes: BattleTroopType[] = ['infantry', 'cavalry', 'archer', 'naval', 'elite', 'guard'];
const pos = (x: number, y: number): BattlePosition => ({ x, y });
const index = (map: BattleMap, x: number, y: number) => y * map.width + x;

describe('v0.3 logical battlefield templates', () => {
  it('creates four validated 24×20 maps with distinct regional terrain and no siege cells', () => {
    const maps = regions.map((regionId) => createBattleMap({ regionId, seed: 19 }));
    for (const map of maps) {
      expect(map.width).toBe(BATTLE_WIDTH);
      expect(map.height).toBe(BATTLE_HEIGHT);
      expect(map.terrain).toHaveLength(480);
      expect(map.attackerDeployment).toHaveLength(MAX_UNITS_PER_SIDE);
      expect(map.defenderDeployment).toHaveLength(MAX_UNITS_PER_SIDE);
      expect(validateBattleMap(map)).toEqual([]);
      expect(map.terrain).not.toContain('wall');
      expect(map.terrain).not.toContain('gate');
      expect(map.objectives.map((objective) => objective.kind)).toEqual(['camp', 'camp']);
    }
    expect(new Set(maps.map((map) => map.terrain.join(','))).size).toBe(maps.length);
  });

  it('keeps all four region templates valid for every incoming edge direction', () => {
    for (const regionId of regions)
      for (const approachDirection of ['north', 'east', 'south', 'west'] as const) {
        const map = createBattleMap({ regionId, approachDirection, seed: 5 });
        expect(validateBattleMap(map), `${regionId}/${approachDirection}`).toEqual([]);
      }
  });

  it('is deterministic for an identical map key and safely changes seeded decoration', () => {
    const one = createBattleMap({ regionId: 'shouchun', approachDirection: 'east', seed: 12 });
    const same = createBattleMap({ regionId: 'shouchun', approachDirection: 'east', seed: 12 });
    const other = createBattleMap({ regionId: 'shouchun', approachDirection: 'east', seed: 13 });
    expect(same).toEqual(one);
    expect(other.mapId).not.toBe(one.mapId);
    expect(validateBattleMap(other)).toEqual([]);
  });

  it('keeps deployment zones separated and positions the camps as plain objective overlays', () => {
    const map = createBattleMap({ regionId: 'xiapi', approachDirection: 'north' });
    expect(
      map.attackerDeployment.some((a) =>
        map.defenderDeployment.some((d) => a.x === d.x && a.y === d.y),
      ),
    ).toBe(false);
    for (const camp of map.objectives) {
      expect(battleTerrainAt(map, camp.position)).toBe('plain');
      expect(objectiveDefenseMultiplier(map, camp.position)).toBe(1);
      expect(objectiveAt(map, camp.position)?.id).toBe(camp.id);
    }
  });

  it('uses the underlying land terrain at a camp and adds no camp defense bonus', () => {
    const source = createBattleMap({ regionId: 'hanzhong' });
    const camp = source.objectives[0]!;
    const terrain = [...source.terrain];
    terrain[index(source, camp.position.x, camp.position.y)] = 'hill';
    const map = { ...source, terrain };
    expect(objectiveAt(map, camp.position)?.id).toBe(camp.id);
    expect(battleTerrainAt(map, camp.position)).toBe('hill');
    expect(battleTerrainDefenseMultiplier(map, camp.position)).toBe(0.8);
    expect(objectiveDefenseMultiplier(map, camp.position)).toBe(1);
  });
});

describe('shared water movement', () => {
  it('lets every troop type wade into, across and out of water with the same edge minimum', () => {
    const map = createBattleMap({ regionId: 'shouchun' });
    const from = pos(4, 7);
    const inWater = pos(4, 8);
    const throughWater = pos(4, 9);
    const shore = pos(4, 10);
    for (const troopType of troopTypes) {
      const unit = { troopType };
      expect(battleStepCost(map, unit, from, inWater)).toBe(2);
      expect(battleStepCost(map, unit, inWater, throughWater)).toBe(2);
      expect(battleStepCost(map, unit, throughWater, shore)).toBe(2);
      expect(findBattlePath(map, unit, from, shore)).toEqual([from, inWater, throughWater, shore]);
    }
  });

  it('does not lower cavalry land-entry cost when leaving water', () => {
    const source = createBattleMap({ regionId: 'shouchun' });
    const terrain = [...source.terrain];
    terrain[index(source, 5, 8)] = 'forest';
    const map = { ...source, terrain };
    const water = pos(4, 8);
    const forest = pos(5, 8);
    expect(battleTerrainAt(map, water)).toBe('water');
    expect(battleTerrainAt(map, forest)).toBe('forest');
    expect(battleStepCost(map, { troopType: 'cavalry' }, water, forest)).toBe(3);
    expect(battleStepCost(map, { troopType: 'infantry' }, water, forest)).toBe(2);
  });

  it('blocks cliffs and bounds while allowing blockers to make a route unreachable', () => {
    const map = createBattleMap({ regionId: 'hanzhong' });
    const cliff = pos(4, 3);
    const start = pos(3, 3);
    expect(battleTerrainAt(map, cliff)).toBe('cliff');
    expect(battleStepCost(map, { troopType: 'infantry' }, start, cliff)).toBe(
      Number.POSITIVE_INFINITY,
    );
    expect(findBattlePath(map, { troopType: 'infantry' }, start, cliff)).toBeNull();
    expect(findBattlePath(map, { troopType: 'infantry' }, pos(-1, 0), pos(0, 0))).toBeNull();

    const plain: BattleMap = {
      ...map,
      terrain: Array.from({ length: 480 }, () => 'plain' as const),
    };
    const barrier = Array.from({ length: BATTLE_HEIGHT }, (_, y) => ({ x: 12, y }));
    expect(
      findBattlePath(plain, { troopType: 'infantry' }, pos(10, 10), pos(14, 10), barrier),
    ).toBeNull();
  });

  it('returns the same movement allowance for water cells regardless of troop type', () => {
    const map = createBattleMap({ regionId: 'shouchun' });
    const start = pos(4, 7);
    const end = pos(4, 8);
    const costs = troopTypes.map((troopType) => battleStepCost(map, { troopType }, start, end));
    expect(costs).toEqual([2, 2, 2, 2, 2, 2]);
    expect(getReachableBattleTiles(map, { troopType: 'guard' }, start, 2)).toContainEqual({
      x: 4,
      y: 8,
      cost: 2,
    });
  });
});

describe('water attack and damage rules', () => {
  it('applies the four attacker/target water combinations exactly once', () => {
    const map = createBattleMap({ regionId: 'shouchun' });
    const shore = pos(4, 7);
    const water = pos(4, 8);
    const combos = [
      [shore, shore, 1],
      [shore, water, WATER_INCOMING_DAMAGE_MULTIPLIER],
      [water, shore, WATER_ATTACK_MULTIPLIER],
      [water, water, WATER_ATTACK_MULTIPLIER * WATER_INCOMING_DAMAGE_MULTIPLIER],
    ] as const;
    for (const [source, target, expected] of combos) {
      const modifiers = waterCombatModifiers(map, source, target);
      expect(modifiers.combinedMultiplier).toBe(expected);
      expect(applyWaterDamageModifiers(100, modifiers)).toBe(100 * expected);
    }
  });

  it('does not give the retained naval troop type a special water exemption', () => {
    const map = createBattleMap({ regionId: 'shouchun' });
    const shore = pos(4, 7);
    const water = pos(4, 8);
    for (const troopType of troopTypes) {
      const modifiers = waterCombatModifiers(map, water, shore);
      expect(modifiers.attackMultiplier).toBe(WATER_ATTACK_MULTIPLIER);
      expect(battleStepCost(map, { troopType }, shore, water)).toBe(2);
    }
  });

  it('floors casualties after modifiers once and preserves the positive one-casualty floor', () => {
    expect(casualtyCountAfterWater(500, 100.9)).toBe(100);
    expect(casualtyCountAfterWater(500, 0.5)).toBe(1);
    expect(casualtyCountAfterWater(3, 20)).toBe(3);
    expect(casualtyCountAfterWater(3, 0)).toBe(0);
    expect(casualtyCountAfterWater(3, Number.NaN)).toBe(0);
  });

  it('allows ordinary-range cross-shore attacks and rejects out-of-range targets', () => {
    const map = createBattleMap({ regionId: 'shouchun' });
    const archer = {
      id: 'archer',
      side: 'attacker' as const,
      troopType: 'archer' as const,
      x: 4,
      y: 7,
    };
    const waterTarget = {
      id: 'enemy',
      side: 'defender' as const,
      troopType: 'infantry' as const,
      x: 4,
      y: 8,
    };
    expect(isBattleAttackInRange(map, archer, waterTarget, 3)).toBe(true);
    expect(isBattleAttackInRange(map, archer, { ...waterTarget, x: 4, y: 11 }, 3)).toBe(false);
    expect(isBattleAttackInRange(map, archer, { ...waterTarget, side: 'attacker' }, 3)).toBe(false);
  });
});

describe('v0.3 deployment validity', () => {
  it('accepts ten unique units on valid land deployment cells and rejects overlap or oversize', () => {
    const map = createBattleMap({ regionId: 'chengdu' });
    const attackers = map.attackerDeployment.map((position, index) => ({
      id: `a-${index}`,
      side: 'attacker' as const,
      troopType: troopTypes[index % troopTypes.length]!,
      ...position,
    }));
    const defenders = map.defenderDeployment.map((position, index) => ({
      id: `d-${index}`,
      side: 'defender' as const,
      troopType: troopTypes[index % troopTypes.length]!,
      ...position,
    }));
    expect(validateBattleUnits(map, [...attackers, ...defenders])).toEqual([]);
    expect(
      validateBattleUnits(map, [...attackers, ...defenders, { ...attackers[0]!, id: 'a-extra' }]),
    ).toContain('Attacker has more than 10 units.');
    expect(
      validateBattleUnits(map, [
        ...attackers,
        { ...defenders[0]!, id: 'a-overlap', x: attackers[0]!.x, y: attackers[0]!.y },
      ]),
    ).toContain('Two units cannot occupy the same battlefield cell.');
  });
});

describe('serializable tactical battle operations', () => {
  const battle = (overrides: Partial<Parameters<typeof createTacticalBattle>[0]> = {}) =>
    createTacticalBattle({
      id: 'test-battle',
      map: createBattleMap({ regionId: 'shouchun' }),
      attackerUnits: [
        { id: 'a1', name: 'Attacker', troopType: 'infantry', troops: 1000, force: 80 },
      ],
      defenderUnits: [{ id: 'd1', name: 'Defender', troopType: 'archer', troops: 1000, force: 75 }],
      ...overrides,
    });

  it('creates a JSON-roundtrippable v0.3 tactical state with valid initial deployment', () => {
    const state = battle();
    const restored = JSON.parse(JSON.stringify(state));
    expect(restored).toEqual(state);
    expect(state.day).toBe(1);
    expect(state.units.map((unit) => [unit.side, unit.x, unit.y])).toHaveLength(2);
    expect(state.outcome).toBeNull();
  });

  it('moves within shared reachability, rejects invalid movement atomically, and records water stance', () => {
    const state = battle();
    const attacker = state.units[0]!;
    attacker.x = 4;
    attacker.y = 7;
    state.units[1]!.x = 10;
    state.units[1]!.y = 6;
    const snapshot = structuredClone(state);
    const invalid = applyBattleAction(state, { type: 'move', unitId: attacker.id, x: 23, y: 19 });
    expect(invalid.ok).toBe(false);
    expect(invalid.state).toEqual(snapshot);

    const waterStep = getUnitReachableTiles(state, attacker.id).find(
      (tile) => tile.x === 4 && tile.y === 8,
    );
    expect(waterStep).toBeDefined();
    const moved = applyBattleAction(state, { type: 'move', unitId: attacker.id, x: 4, y: 8 });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.state.units[0]).toMatchObject({ x: 4, y: 8, moved: true, acted: false });
    expect(moved.state.log.at(-1)).toContain('attack −25%, damage received +25%');
  });

  it('resolves a legal shore attack with water damage and counterattack rules', () => {
    const state = battle();
    state.units[0]!.x = 4;
    state.units[0]!.y = 7;
    state.units[1]!.x = 4;
    state.units[1]!.y = 8;
    const beforeAttacker = state.units[0]!.troops;
    const beforeDefender = state.units[1]!.troops;
    const result = applyBattleAction(state, { type: 'attack', unitId: 'a1', targetId: 'd1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.units[1]!.troops).toBeLessThan(beforeDefender);
    expect(result.state.units[0]!.troops).toBeLessThan(beforeAttacker);
    expect(
      result.state.log.some((entry) =>
        entry.includes('water 1.00× attack × 1.25× damage received'),
      ),
    ).toBe(true);
  });

  it('lets a unit capture the enemy camp and ends the battle immediately', () => {
    const state = battle();
    state.units[0]!.x = 21;
    state.units[0]!.y = 9;
    state.units[1]!.x = 20;
    state.units[1]!.y = 6;
    const camp = state.map.objectives.find((objective) => objective.owner === 'defender')!;
    const result = applyBattleAction(state, {
      type: 'move',
      unitId: 'a1',
      x: camp.position.x,
      y: camp.position.y,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.outcome).toEqual({ winner: 'attacker', reason: 'camp' });
  });

  it('declares elimination after a killing attack and does not counterattack a destroyed unit', () => {
    const state = battle();
    state.units[0]!.x = 4;
    state.units[0]!.y = 7;
    state.units[1]!.x = 4;
    state.units[1]!.y = 8;
    state.units[1]!.troops = 1;
    const result = applyBattleAction(state, { type: 'attack', unitId: 'a1', targetId: 'd1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.outcome).toEqual({ winner: 'attacker', reason: 'elimination' });
    expect(result.state.units[0]!.troops).toBe(1000);
  });

  it('runs a stable AI turn without advancing time, then advances exactly one battle day', () => {
    const state = battle();
    const first = runBattleAiTurn(state, 'defender');
    const repeat = runBattleAiTurn(state, 'defender');
    expect(first).toEqual(repeat);
    expect(first.day).toBe(1);
    expect(first.units.find((unit) => unit.side === 'defender')!.acted).toBe(true);

    const next = advanceBattleDay(state);
    expect(next.day).toBe(2);
    expect(next.units.every((unit) => !unit.acted && !unit.moved)).toBe(true);
  });

  it('uses the approved survivor-count timeout rule, with ties awarded to the defender', () => {
    const state = battle({ dayLimit: 1, timeoutPolicy: 'draw' });
    expect(battle().timeoutPolicy).toBe('survivor-count');
    expect(getBattleTimeoutOutcome(state, 'draw')).toEqual({ winner: null, reason: 'dayLimit' });
    expect(getBattleTimeoutOutcome(state, 'defender-holds')).toEqual({
      winner: 'defender',
      reason: 'dayLimit',
    });
    expect(getBattleTimeoutOutcome(state, 'survivor-count')).toEqual({
      winner: 'defender',
      reason: 'dayLimit',
    });
    const attackerHasMore = structuredClone(state);
    attackerHasMore.units[0]!.troops = 1001;
    expect(getBattleTimeoutOutcome(attackerHasMore, 'survivor-count')).toEqual({
      winner: 'attacker',
      reason: 'dayLimit',
    });
    expect(advanceBattleDay(state).outcome).toEqual({ winner: null, reason: 'dayLimit' });
  });
});
