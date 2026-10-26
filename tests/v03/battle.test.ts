import { describe, expect, it } from 'vitest';
import {
  BATTLE_TACTIC_COST,
  BATTLE_TACTIC_POINT_CAP,
  BATTLE_TACTIC_POINT_REGEN,
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
  getBattleRouteDistanceField,
  getReachableBattleTiles,
  getUnitReachableTiles,
  getEnemyZoneOfControl,
  getAvailableBattleTactics,
  getBattleTacticTargets,
  predictBattleAttack,
  predictBattleTactic,
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
const troopTypes: BattleTroopType[] = ['infantry', 'cavalry', 'archer'];
const pos = (x: number, y: number): BattlePosition => ({ x, y });
const index = (map: BattleMap, x: number, y: number) => y * map.width + x;

function hasDeploymentRoute(
  map: BattleMap,
  { allowWater, requireWater = false }: { allowWater: boolean; requireWater?: boolean },
): boolean {
  const targetCells = new Set(map.defenderDeployment.map(({ x, y }) => index(map, x, y)));
  const visited = new Set<string>();
  const queue: Array<{ cell: number; crossedWater: boolean }> = [];
  for (const { x, y } of map.attackerDeployment) {
    const cell = index(map, x, y);
    const crossedWater = map.terrain[cell] === 'water';
    const state = `${cell}:${Number(crossedWater)}`;
    visited.add(state);
    queue.push({ cell, crossedWater });
  }

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    if (targetCells.has(current.cell) && (!requireWater || current.crossedWater)) return true;
    const x = current.cell % map.width;
    const y = Math.floor(current.cell / map.width);
    for (const [nextX, nextY] of [
      [x, y - 1],
      [x + 1, y],
      [x, y + 1],
      [x - 1, y],
    ] as const) {
      if (nextX < 0 || nextX >= map.width || nextY < 0 || nextY >= map.height) continue;
      const nextCell = index(map, nextX, nextY);
      const terrain = map.terrain[nextCell];
      if (terrain === 'cliff' || (!allowWater && terrain === 'water')) continue;
      const crossedWater = current.crossedWater || terrain === 'water';
      const state = `${nextCell}:${Number(crossedWater)}`;
      if (visited.has(state)) continue;
      visited.add(state);
      queue.push({ cell: nextCell, crossedWater });
    }
  }
  return false;
}

describe('v0.3 logical battlefield templates', () => {
  it('creates the four 24×20 rules-test templates with distinct terrain and no siege cells', () => {
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

  it('keeps all deployment cells and both camps connected across 20 seeds and four approaches', () => {
    for (const regionId of regions)
      for (let seed = 0; seed < 20; seed++)
        for (const approachDirection of ['north', 'east', 'south', 'west'] as const) {
          const map = createBattleMap({ regionId, approachDirection, seed });
          const start = map.attackerDeployment[0]!;
          const reached = new Set<number>([index(map, start.x, start.y)]);
          const queue = [start];
          while (queue.length) {
            const current = queue.shift()!;
            for (const next of [
              { x: current.x, y: current.y - 1 },
              { x: current.x + 1, y: current.y },
              { x: current.x, y: current.y + 1 },
              { x: current.x - 1, y: current.y },
            ]) {
              if (next.x < 0 || next.x >= map.width || next.y < 0 || next.y >= map.height) continue;
              const nextIndex = index(map, next.x, next.y);
              if (map.terrain[nextIndex] === 'cliff' || reached.has(nextIndex)) continue;
              reached.add(nextIndex);
              queue.push(next);
            }
          }
          for (const position of [...map.attackerDeployment, ...map.defenderDeployment])
            expect(reached.has(index(map, position.x, position.y))).toBe(true);
          for (const objective of map.objectives)
            expect(reached.has(index(map, objective.position.x, objective.position.y))).toBe(true);
        }
  });

  it('rejects a disconnected deployment cell even when the first opposing pair can reach each other', () => {
    const source = createBattleMap({ regionId: 'xiapi', approachDirection: 'west' });
    const terrain = [...source.terrain];
    const isolatedSpawn = pos(10, 10);
    source.attackerDeployment[9] = isolatedSpawn;
    for (const neighbor of [pos(10, 9), pos(11, 10), pos(10, 11), pos(9, 10)])
      terrain[index(source, neighbor.x, neighbor.y)] = 'cliff';
    const map = { ...source, terrain };
    expect(validateBattleMap(map)).toContain(
      'attacker deployment at (10, 10) has no passable route.',
    );
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

  it('preserves both a water crossing and a land alternative across 20 seeds and four approaches', () => {
    for (const regionId of regions)
      for (let seed = 0; seed < 20; seed++)
        for (const approachDirection of ['north', 'east', 'south', 'west'] as const) {
          const map = createBattleMap({ regionId, approachDirection, seed });
          expect(map.terrain).toContain('water');
          expect(
            hasDeploymentRoute(map, { allowWater: true, requireWater: true }),
            `${regionId}/${approachDirection}/seed-${seed} has no traversable water crossing between deployment zones`,
          ).toBe(true);
          expect(
            hasDeploymentRoute(map, { allowWater: false }),
            `${regionId}/${approachDirection}/seed-${seed} has no land-only route between deployment zones`,
          ).toBe(true);
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
    expect(costs).toEqual([2, 2, 2]);
    expect(getReachableBattleTiles(map, { troopType: 'infantry' }, start, 2)).toContainEqual({
      x: 4,
      y: 8,
      cost: 2,
    });
  });

  it('uses the exact movement budget for a complete water crossing', () => {
    const source = createBattleMap({ regionId: 'shouchun' });
    const terrain = [...source.terrain];
    for (const position of [pos(4, 8), pos(4, 9)])
      terrain[index(source, position.x, position.y)] = 'water';
    const map = { ...source, terrain };
    const start = pos(4, 7);
    const shore = pos(4, 10);
    const troop = { troopType: 'infantry' as const };
    expect(findBattlePath(map, troop, start, shore)).toEqual([start, pos(4, 8), pos(4, 9), shore]);
    expect(getReachableBattleTiles(map, troop, start, 5)).not.toContainEqual({
      ...shore,
      cost: 6,
    });
    expect(getReachableBattleTiles(map, troop, start, 6)).toContainEqual({
      ...shore,
      cost: 6,
    });
  });

  it('uses weighted terrain routes and blockers in its reverse distance field', () => {
    const map = createBattleMap({ regionId: 'shouchun' });
    const unit = { troopType: 'cavalry' as const };
    const start = pos(4, 7);
    const goal = pos(8, 7);
    const blockers = [
      { x: 5, y: 7 },
      { x: 6, y: 7 },
    ];
    const path = findBattlePath(map, unit, start, goal, blockers);
    expect(path).not.toBeNull();
    let pathCost = 0;
    for (let index = 1; index < path!.length; index++)
      pathCost += battleStepCost(map, unit, path![index - 1]!, path![index]!);
    const field = getBattleRouteDistanceField(map, unit, [goal], blockers);
    expect(field[index(map, start.x, start.y)]).toBe(pathCost);
    expect(field[index(map, goal.x, goal.y)]).toBe(0);
  });
});

describe('enemy control zones', () => {
  it('projects orthogonal control across a water edge and stops movement on entry', () => {
    const base = createBattleMap({ regionId: 'shouchun' });
    const terrain = [...base.terrain];
    terrain[index(base, 5, 5)] = 'water';
    const state = createTacticalBattle({
      id: 'zoc-water',
      map: { ...base, terrain },
      attackerUnits: [
        { id: 'a1', name: 'Attacker', troopType: 'infantry', troops: 1000, force: 80 },
      ],
      defenderUnits: [
        { id: 'd1', name: 'Defender', troopType: 'infantry', troops: 1000, force: 75 },
      ],
    });
    state.units[0]!.x = 5;
    state.units[0]!.y = 6;
    state.units[1]!.x = 4;
    state.units[1]!.y = 5;
    const enemyZone = getEnemyZoneOfControl(state, 'defender');
    expect(enemyZone).toContainEqual({ x: 5, y: 5 });
    expect(getUnitReachableTiles(state, 'a1')).toContainEqual({ x: 5, y: 5, cost: 2 });

    state.units[0]!.x = 5;
    state.units[0]!.y = 5;
    expect(getUnitReachableTiles(state, 'a1')).toEqual([]);
  });

  it('does not allow a route to pass through a narrow controlled corridor', () => {
    const source = createBattleMap({ regionId: 'xiapi' });
    const state = createTacticalBattle({
      id: 'zoc-choke',
      map: source,
      attackerUnits: [
        { id: 'a1', name: 'Attacker', troopType: 'infantry', troops: 1000, force: 80 },
      ],
      defenderUnits: [
        { id: 'd1', name: 'Defender', troopType: 'infantry', troops: 1000, force: 75 },
      ],
    });
    state.map.terrain = Array.from({ length: source.width * source.height }, () => 'plain');
    for (let y = 0; y < source.height; y++) {
      state.map.terrain[index(source, 3, y)] = 'cliff';
      state.map.terrain[index(source, 5, y)] = 'cliff';
    }
    state.units[0]!.x = 4;
    state.units[0]!.y = 3;
    state.units[1]!.x = 4;
    state.units[1]!.y = 7;
    const reachable = getUnitReachableTiles(state, 'a1');
    expect(reachable).toContainEqual({ x: 4, y: 6, cost: 3 });
    expect(reachable.some((tile) => tile.x === 4 && tile.y > 6)).toBe(false);
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

  it('covers every attacker/defender unit pairing across all four shore-water outcomes', () => {
    const conditions = [
      { sourceOnWater: false, targetOnWater: false, attack: 1, incoming: 1 },
      {
        sourceOnWater: false,
        targetOnWater: true,
        attack: 1,
        incoming: WATER_INCOMING_DAMAGE_MULTIPLIER,
      },
      {
        sourceOnWater: true,
        targetOnWater: false,
        attack: WATER_ATTACK_MULTIPLIER,
        incoming: 1,
      },
      {
        sourceOnWater: true,
        targetOnWater: true,
        attack: WATER_ATTACK_MULTIPLIER,
        incoming: WATER_INCOMING_DAMAGE_MULTIPLIER,
      },
    ] as const;

    for (const sourceType of troopTypes)
      for (const targetType of troopTypes)
        for (const condition of conditions) {
          const state = createTacticalBattle({
            id: `${sourceType}-${targetType}-${Number(condition.sourceOnWater)}-${Number(condition.targetOnWater)}`,
            map: createBattleMap({ regionId: 'shouchun', seed: 19 }),
            attackerUnits: [
              {
                id: 'a1',
                name: 'Attacker',
                troopType: sourceType,
                troops: 2000,
                force: 80,
                attackRange: 2,
              },
            ],
            defenderUnits: [
              {
                id: 'd1',
                name: 'Defender',
                troopType: targetType,
                troops: 2000,
                force: 80,
                attackRange: 2,
              },
            ],
          });
          state.map.terrain = Array.from(
            { length: state.map.width * state.map.height },
            () => 'plain',
          );
          const source = state.units[0]!;
          const target = state.units[1]!;
          source.x = 5;
          source.y = condition.sourceOnWater ? 6 : 5;
          target.x = 6;
          target.y = condition.targetOnWater ? 6 : 5;
          if (condition.sourceOnWater)
            state.map.terrain[index(state.map, source.x, source.y)] = 'water';
          if (condition.targetOnWater)
            state.map.terrain[index(state.map, target.x, target.y)] = 'water';

          const forecast = predictBattleAttack(state, source.id, target.id);
          expect(forecast).toMatchObject({
            inRange: true,
            sourceOnWater: condition.sourceOnWater,
            targetOnWater: condition.targetOnWater,
            attackMultiplier: condition.attack,
            incomingDamageMultiplier: condition.incoming,
            counterattack: {
              possible: true,
              sourceOnWater: condition.targetOnWater,
              targetOnWater: condition.sourceOnWater,
              attackMultiplier: condition.targetOnWater ? WATER_ATTACK_MULTIPLIER : 1,
              incomingDamageMultiplier: condition.sourceOnWater
                ? WATER_INCOMING_DAMAGE_MULTIPLIER
                : 1,
            },
          });
          const result = applyBattleAction(state, {
            type: 'attack',
            unitId: source.id,
            targetId: target.id,
          });
          expect(result.ok, `${sourceType} vs ${targetType} ${JSON.stringify(condition)}`).toBe(
            true,
          );
          if (result.ok) {
            expect(result.state.units.find((unit) => unit.id === target.id)!.troops).toBeLessThan(
              target.troops,
            );
            expect(result.state.units.find((unit) => unit.id === source.id)!.troops).toBeLessThan(
              source.troops,
            );
          }
        }
  });

  it('does not give the land troop types different water exemptions', () => {
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

  it('forecasts the same primary and counterattack casualties without changing the battle', () => {
    const state = battle();
    state.units[0]!.x = 4;
    state.units[0]!.y = 7;
    state.units[1]!.x = 4;
    state.units[1]!.y = 8;
    const before = structuredClone(state);
    const forecast = predictBattleAttack(state, 'a1', 'd1');
    expect(forecast).toMatchObject({
      inRange: true,
      sourceOnWater: false,
      targetOnWater: true,
      attackMultiplier: 1,
      incomingDamageMultiplier: 1.25,
      counterattack: {
        possible: true,
        sourceOnWater: true,
        targetOnWater: false,
        attackMultiplier: 0.75,
      },
    });
    expect(state).toEqual(before);
    const applied = applyBattleAction(state, { type: 'attack', unitId: 'a1', targetId: 'd1' });
    expect(applied.ok).toBe(true);
    if (!applied.ok || !forecast) return;
    expect(before.units[1]!.troops - applied.state.units[1]!.troops).toBe(
      forecast.estimatedCasualties,
    );
    expect(before.units[0]!.troops - applied.state.units[0]!.troops).toBe(
      forecast.counterattack.estimatedCasualties,
    );
  });

  it('matches execution for every troop pairing and all four shore/water combinations', () => {
    for (const sourceType of troopTypes)
      for (const targetType of troopTypes)
        for (const sourceOnWater of [false, true])
          for (const targetOnWater of [false, true]) {
            const state = battle({
              attackerUnits: [
                { id: 'a1', name: 'Source', troopType: sourceType, troops: 1200, force: 82 },
              ],
              defenderUnits: [
                { id: 'd1', name: 'Target', troopType: targetType, troops: 1100, force: 74 },
              ],
            });
            state.map.terrain = Array.from(
              { length: state.map.width * state.map.height },
              () => 'plain',
            );
            state.map.terrain[index(state.map, 5, 5)] = sourceOnWater ? 'water' : 'plain';
            state.map.terrain[index(state.map, 6, 5)] = targetOnWater ? 'water' : 'plain';
            state.units[0]!.x = 5;
            state.units[0]!.y = 5;
            state.units[1]!.x = 6;
            state.units[1]!.y = 5;
            const before = structuredClone(state);
            const forecast = predictBattleAttack(state, 'a1', 'd1');
            const result = applyBattleAction(state, {
              type: 'attack',
              unitId: 'a1',
              targetId: 'd1',
            });
            expect(result.ok).toBe(true);
            if (!result.ok || !forecast) continue;
            expect(before.units[1]!.troops - result.state.units[1]!.troops).toBe(
              forecast.estimatedCasualties,
            );
            expect(before.units[0]!.troops - result.state.units[0]!.troops).toBe(
              forecast.counterattack.estimatedCasualties,
            );
          }
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
    state.units[1]!.troopExperience = 1900;
    const result = applyBattleAction(state, { type: 'attack', unitId: 'a1', targetId: 'd1' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.outcome).toEqual({ winner: 'attacker', reason: 'elimination' });
    expect(result.state.units[0]!.troops).toBe(1000);
    expect(result.state.units[1]!.troopExperience).toBe(0);
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

  it('lets AI use ordinary ranged attacks across a shore without a water-only target block', () => {
    const state = battle({
      attackerUnits: [
        { id: 'a1', name: 'Shore archers', troopType: 'archer', troops: 1000, force: 80 },
      ],
    });
    state.map.terrain = Array.from({ length: state.map.width * state.map.height }, () => 'plain');
    state.units[0]!.x = 5;
    state.units[0]!.y = 5;
    state.units[1]!.x = 7;
    state.units[1]!.y = 5;
    state.map.terrain[index(state.map, 7, 5)] = 'water';
    const before = state.units[1]!.troops;
    const result = runBattleAiTurn(state, 'attacker');
    expect(result.units[1]!.troops).toBeLessThan(before);
    expect(result.log.some((line) => line.includes('water 1.00× attack × 1.25×'))).toBe(true);
  });

  it('lets AI advance through an exclusive water corridor using weighted route distance', () => {
    const state = battle();
    state.map.terrain = Array.from({ length: state.map.width * state.map.height }, () => 'cliff');
    for (let x = 1; x <= 22; x++) state.map.terrain[index(state.map, x, 10)] = 'water';
    state.map.objectives = [
      { id: 'attacker-camp', kind: 'camp', owner: 'attacker', position: pos(1, 10) },
      { id: 'defender-camp', kind: 'camp', owner: 'defender', position: pos(22, 10) },
    ];
    state.units[0]!.x = 2;
    state.units[0]!.y = 10;
    state.units[1]!.x = 12;
    state.units[1]!.y = 10;

    const result = runBattleAiTurn(state, 'attacker');

    expect(result.units[0]).toMatchObject({ y: 10, moved: true, acted: true });
    expect(result.units[0]!.x).toBeGreaterThan(2);
    expect(result.units[0]!.x).toBeLessThan(11);
  });

  it('routes around a blocked water crossing and lets the AI use the detour', () => {
    const state = battle({
      attackerUnits: [
        { id: 'a1', name: 'Pathfinder', troopType: 'infantry', troops: 1000, force: 80 },
        { id: 'a2', name: 'Blocker', troopType: 'infantry', troops: 1000, force: 80 },
      ],
      defenderUnits: [
        { id: 'd1', name: 'Defender', troopType: 'infantry', troops: 1000, force: 75 },
      ],
    });
    state.map.terrain = Array.from({ length: state.map.width * state.map.height }, () => 'cliff');
    for (let x = 1; x <= 22; x++) state.map.terrain[index(state.map, x, 10)] = 'water';
    for (let x = 8; x <= 13; x++) state.map.terrain[index(state.map, x, 9)] = 'plain';
    for (const x of [8, 13]) state.map.terrain[index(state.map, x, 10)] = 'plain';
    state.units.find((unit) => unit.id === 'a1')!.x = 2;
    state.units.find((unit) => unit.id === 'a1')!.y = 10;
    state.units.find((unit) => unit.id === 'a2')!.x = 10;
    state.units.find((unit) => unit.id === 'a2')!.y = 10;
    state.units.find((unit) => unit.id === 'a2')!.acted = true;
    state.units.find((unit) => unit.id === 'a2')!.moved = true;
    state.units.find((unit) => unit.id === 'd1')!.x = 20;
    state.units.find((unit) => unit.id === 'd1')!.y = 10;

    const detour = findBattlePath(state.map, { troopType: 'infantry' }, pos(2, 10), pos(19, 10), [
      { id: 'a2', x: 10, y: 10 },
    ]);
    expect(detour).not.toBeNull();
    expect(detour!.some((position) => position.y === 9)).toBe(true);
    expect(detour).not.toContainEqual(pos(10, 10));

    let current = state;
    const pathHistory: BattlePosition[] = [];
    for (let day = 0; day < 8; day++) {
      const pathfinder = current.units.find((unit) => unit.id === 'a1')!;
      pathfinder.acted = false;
      pathfinder.moved = false;
      current = runBattleAiTurn(current, 'attacker');
      const moved = current.units.find((unit) => unit.id === 'a1')!;
      pathHistory.push({ x: moved.x, y: moved.y });
    }
    const pathfinder = current.units.find((unit) => unit.id === 'a1')!;
    expect(pathHistory.some((position) => position.y === 9)).toBe(true);
    expect(pathfinder.x).toBeGreaterThan(12);
    expect(pathfinder.x).toBeLessThan(15);
  });

  it('moves an AI unit off water onto the shore to reach a land target', () => {
    const state = battle({
      attackerUnits: [
        { id: 'a1', name: 'Stranded infantry', troopType: 'infantry', troops: 1000, force: 80 },
      ],
      defenderUnits: [
        { id: 'd1', name: 'Shore guard', troopType: 'infantry', troops: 1000, force: 75 },
      ],
    });
    state.map.terrain = Array.from({ length: state.map.width * state.map.height }, () => 'plain');
    state.map.terrain[index(state.map, 5, 10)] = 'water';
    state.units[0]!.x = 5;
    state.units[0]!.y = 10;
    state.units[1]!.x = 9;
    state.units[1]!.y = 10;

    const result = runBattleAiTurn(state, 'attacker');

    expect(result.units[0]!.x).toBe(7);
    expect(result.units[0]!.y).toBe(10);
    expect(battleTerrainAt(result.map, result.units[0]!)).toBe('plain');
  });

  it('does not oscillate between shore and water over repeated AI turns', () => {
    let state = battle({
      attackerUnits: [
        { id: 'a1', name: 'Shore patrol', troopType: 'infantry', troops: 10000, force: 80 },
      ],
      defenderUnits: [
        { id: 'd1', name: 'Land target', troopType: 'infantry', troops: 10000, force: 75 },
      ],
    });
    state.map.terrain = Array.from({ length: state.map.width * state.map.height }, () => 'plain');
    state.map.terrain[index(state.map, 5, 10)] = 'water';
    state.units[0]!.x = 5;
    state.units[0]!.y = 10;
    state.units[1]!.x = 9;
    state.units[1]!.y = 10;

    let leftWater = false;
    for (let turn = 0; turn < 8 && !state.outcome; turn++) {
      const unit = state.units.find((entry) => entry.id === 'a1')!;
      unit.acted = false;
      unit.moved = false;
      state = runBattleAiTurn(state, 'attacker');
      const updated = state.units.find((entry) => entry.id === 'a1')!;
      const onWater = battleTerrainAt(state.map, updated) === 'water';
      if (!onWater) leftWater = true;
      if (leftWater) expect(onWater, `turn ${turn + 1}: unit returned to water`).toBe(false);
    }
    expect(leftWater).toBe(true);
  });

  it('advances deterministically without a stalled AI across fixed map seeds', () => {
    const seeds = [3, 11, 23, 47, 89, 131];
    for (const seed of seeds) {
      let state = battle({
        id: `no-deadlock-${seed}`,
        map: createBattleMap({
          regionId: regions[seed % regions.length]!,
          approachDirection: (['north', 'east', 'south', 'west'] as const)[seed % 4]!,
          seed,
        }),
        seed,
        attackerUnits: [
          { id: 'a1', name: 'Attacker', troopType: 'infantry', troops: 1800, force: 80 },
          { id: 'a2', name: 'Attacker archers', troopType: 'archer', troops: 1200, force: 74 },
        ],
        defenderUnits: [
          { id: 'd1', name: 'Defender', troopType: 'infantry', troops: 1700, force: 76 },
          { id: 'd2', name: 'Defender archers', troopType: 'archer', troops: 1100, force: 72 },
        ],
      });
      let previousBoard: string | null = null;
      let consecutiveStalls = 0;
      let aiProgressed = false;
      for (let turn = 0; turn < state.dayLimit && !state.outcome; turn++) {
        const beforeDay = state.day;
        const beforeBoard = state.units
          .map((unit) => [unit.id, unit.x, unit.y, unit.troops, unit.morale].join(':'))
          .join('|');
        state = advanceBattleDay(state);
        expect(
          state.outcome || state.day === beforeDay + 1,
          `seed ${seed} stalled at battle day ${beforeDay}`,
        ).toBeTruthy();
        const afterBoard = state.units
          .map((unit) => [unit.id, unit.x, unit.y, unit.troops, unit.morale].join(':'))
          .join('|');
        if (afterBoard !== beforeBoard || state.outcome) aiProgressed = true;
        consecutiveStalls = afterBoard === previousBoard ? consecutiveStalls + 1 : 0;
        expect(
          consecutiveStalls,
          `seed ${seed} stalled for ${consecutiveStalls} consecutive turns at day ${state.day}`,
        ).toBeLessThan(3);
        previousBoard = afterBoard;
      }
      expect(aiProgressed, `seed ${seed} AI never made progress`).toBe(true);
      expect(state.outcome || state.day === state.dayLimit).toBeTruthy();
    }
  });

  it('redirects an advancing AI unit to defend its threatened camp', () => {
    const state = battle();
    state.map.terrain = Array.from({ length: state.map.width * state.map.height }, () => 'plain');
    state.map.objectives = [
      { id: 'attacker-camp', kind: 'camp', owner: 'attacker', position: pos(1, 9) },
      { id: 'defender-camp', kind: 'camp', owner: 'defender', position: pos(22, 9) },
    ];
    state.units[0]!.x = 10;
    state.units[0]!.y = 10;
    state.units[1]!.x = 4;
    state.units[1]!.y = 9;

    const result = runBattleAiTurn(state, 'attacker');

    expect(result.units[0]!.moved).toBe(true);
    expect(result.units[0]!.x).toBeLessThan(10);
    expect(result.units[0]!.x).toBeGreaterThan(1);
  });

  it('ports the six legacy tactic costs, eligibility, veteran thresholds, and cunning discount', () => {
    const state = battle({
      attackerUnits: [
        {
          id: 'a1',
          name: 'Tactician',
          troopType: 'archer',
          troops: 1000,
          force: 80,
          intellect: 50,
          level: 3,
          cunning: true,
        },
      ],
    });
    state.map.terrain = Array.from({ length: state.map.width * state.map.height }, () => 'plain');
    state.units[0]!.x = 5;
    state.units[0]!.y = 5;
    state.map.terrain[index(state.map, 5, 5)] = 'forest';
    state.tacticPoints.attacker = BATTLE_TACTIC_POINT_CAP;

    const tactics = getAvailableBattleTactics(state, 'a1');
    expect(Object.fromEntries(tactics.map((entry) => [entry.tactic, entry.cost]))).toEqual({
      fire: 3,
      rally: 1,
      confuse: 2,
      raidSupply: 3,
      ambush: 2,
      rockfall: 3,
    });
    expect(BATTLE_TACTIC_COST).toEqual({
      fire: 4,
      confuse: 3,
      rally: 2,
      raidSupply: 4,
      ambush: 3,
      rockfall: 4,
    });
    expect(tactics.find((entry) => entry.tactic === 'fire')).toMatchObject({ allowed: true });
    expect(tactics.find((entry) => entry.tactic === 'confuse')).toMatchObject({
      allowed: false,
      reason: 'Confuse requires intellect 60.',
    });
    expect(tactics.find((entry) => entry.tactic === 'ambush')).toMatchObject({ allowed: true });
    expect(tactics.find((entry) => entry.tactic === 'rockfall')).toMatchObject({
      allowed: false,
      reason: 'Rockfall requires intellect 55.',
    });

    state.units[0]!.intellect = 60;
    const senior = getAvailableBattleTactics(state, 'a1');
    expect(senior.find((entry) => entry.tactic === 'confuse')).toMatchObject({ allowed: true });
    expect(senior.find((entry) => entry.tactic === 'rockfall')).toMatchObject({
      allowed: false,
      reason: 'Rockfall requires standing on a hill.',
    });
    state.units[0]!.morale = 39;
    expect(getAvailableBattleTactics(state, 'a1').every((entry) => !entry.allowed)).toBe(true);
  });

  it('uses legacy intellect-difference confuse chances with a saved deterministic roll', () => {
    const state = battle({
      attackerUnits: [
        {
          id: 'a1',
          name: 'Confuser',
          troopType: 'infantry',
          troops: 1000,
          force: 80,
          intellect: 120,
        },
      ],
      defenderUnits: [
        {
          id: 'd1',
          name: 'Target',
          troopType: 'infantry',
          troops: 1000,
          force: 75,
          intellect: 40,
        },
      ],
    });
    state.units[0]!.x = 5;
    state.units[0]!.y = 5;
    state.units[1]!.x = 6;
    state.units[1]!.y = 5;
    state.tacticPoints.attacker = 10;
    state.rngState = 1; // first LCG roll is 48, below the 90% cap
    const before = structuredClone(state);
    const forecast = predictBattleTactic(state, 'a1', 'confuse', 'd1');
    expect(forecast).toMatchObject({ chance: 90, inRange: true });
    expect(state).toEqual(before);

    const result = applyBattleAction(state, {
      type: 'tactic',
      unitId: 'a1',
      tactic: 'confuse',
      targetId: 'd1',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.units[1]!.status).toBe('confused');
    expect(result.state.tacticPoints.attacker).toBe(7);
    const opposingTurn = runBattleAiTurn(result.state, 'defender');
    expect(opposingTurn.units[1]).toMatchObject({ status: 'normal', moved: true, acted: true });
    expect(opposingTurn.log.at(-1)).toContain('loses its turn to confusion');

    const lowChance = structuredClone(state);
    lowChance.units[0]!.intellect = 70;
    lowChance.units[1]!.intellect = 120;
    lowChance.rngState = 2; // next LCG roll is 73, above the 20% floor
    const lowForecast = predictBattleTactic(lowChance, 'a1', 'confuse', 'd1');
    expect(lowForecast?.chance).toBe(20);
    const failure = applyBattleAction(lowChance, {
      type: 'tactic',
      unitId: 'a1',
      tactic: 'confuse',
      targetId: 'd1',
    });
    expect(failure.ok).toBe(true);
    if (failure.ok) expect(failure.state.units[1]!.status).toBe('normal');
  });

  it('does not offer confusion against an enemy that already acted this day', () => {
    const state = battle({
      attackerUnits: [
        {
          id: 'a1',
          name: 'Confuser',
          troopType: 'infantry',
          troops: 1000,
          force: 80,
          intellect: 90,
        },
      ],
      defenderUnits: [{ id: 'd1', name: 'Target', troopType: 'infantry', troops: 1000, force: 75 }],
    });
    state.units[0]!.x = 5;
    state.units[0]!.y = 5;
    state.units[1]!.x = 6;
    state.units[1]!.y = 5;
    state.units[1]!.acted = true;
    state.tacticPoints.attacker = 10;

    expect(getBattleTacticTargets(state, 'a1', 'confuse')).toEqual([]);
    expect(predictBattleTactic(state, 'a1', 'confuse', 'd1')).toBeNull();
    const before = structuredClone(state);
    const result = applyBattleAction(state, {
      type: 'tactic',
      unitId: 'a1',
      tactic: 'confuse',
      targetId: 'd1',
    });
    expect(result).toMatchObject({ ok: false, error: 'Choose a valid target for this tactic.' });
    expect(state).toEqual(before);
  });

  it('uses the legacy fire weather range while keeping water on the shared damage modifiers', () => {
    const state = battle({
      attackerUnits: [
        {
          id: 'a1',
          name: 'Fire officer',
          troopType: 'infantry',
          troops: 1000,
          force: 80,
          intellect: 80,
        },
      ],
      defenderUnits: [
        {
          id: 'd1',
          name: 'Target',
          troopType: 'infantry',
          troops: 1000,
          force: 75,
          intellect: 40,
        },
      ],
    });
    state.map.terrain = Array.from({ length: state.map.width * state.map.height }, () => 'plain');
    state.units[0]!.x = 5;
    state.units[0]!.y = 5;
    state.units[1]!.x = 6;
    state.units[1]!.y = 5;
    state.map.terrain[index(state.map, 5, 5)] = 'water';
    state.map.terrain[index(state.map, 6, 5)] = 'water';
    state.tacticPoints.attacker = 10;
    state.weather = 'clear';
    const clear = predictBattleTactic(state, 'a1', 'fire', 'd1')!;
    expect(clear).toMatchObject({
      sourceOnWater: true,
      targetOnWater: true,
      attackMultiplier: 0.75,
      incomingDamageMultiplier: 1.25,
    });
    state.weather = 'rain';
    const rain = predictBattleTactic(state, 'a1', 'fire', 'd1')!;
    state.weather = 'wind';
    const wind = predictBattleTactic(state, 'a1', 'fire', 'd1')!;
    expect(rain.maxCasualties).toBeLessThan(clear.minCasualties);
    expect(wind.minCasualties).toBeGreaterThan(clear.maxCasualties);
  });

  it('keeps damaging tactic forecasts within the actual seeded resolution', () => {
    const cases = [
      { tactic: 'fire' as const, sourceTerrain: 'plain' as const },
      { tactic: 'ambush' as const, sourceTerrain: 'forest' as const },
      { tactic: 'rockfall' as const, sourceTerrain: 'hill' as const },
    ];

    for (const { tactic, sourceTerrain } of cases) {
      const state = battle({
        attackerUnits: [
          {
            id: 'a1',
            name: 'Tactician',
            troopType: 'infantry',
            troops: 1200,
            force: 86,
            intellect: 100,
            level: 3,
          },
        ],
        defenderUnits: [
          {
            id: 'd1',
            name: 'River defender',
            troopType: 'infantry',
            troops: 1200,
            force: 78,
            intellect: 45,
          },
        ],
      });
      state.map.terrain = Array.from({ length: state.map.width * state.map.height }, () => 'plain');
      state.units[0]!.x = 5;
      state.units[0]!.y = 5;
      state.units[1]!.x = 6;
      state.units[1]!.y = 5;
      state.map.terrain[index(state.map, 5, 5)] = sourceTerrain;
      state.map.terrain[index(state.map, 6, 5)] = 'water';
      state.tacticPoints.attacker = 20;

      const beforeForecast = structuredClone(state);
      const forecast = predictBattleTactic(state, 'a1', tactic, 'd1');
      expect(forecast?.inRange).toBe(true);
      expect(state).toEqual(beforeForecast);
      if (!forecast) continue;

      const result = applyBattleAction(state, {
        type: 'tactic',
        unitId: 'a1',
        tactic,
        targetId: 'd1',
      });
      expect(result.ok, tactic).toBe(true);
      if (!result.ok) continue;
      const casualties = beforeForecast.units[1]!.troops - result.state.units[1]!.troops;
      expect(casualties).toBeGreaterThanOrEqual(forecast.minCasualties);
      expect(casualties).toBeLessThanOrEqual(forecast.maxCasualties);
      if (tactic === 'rockfall') expect(casualties).toBe(forecast.minCasualties);
    }
  });

  it('applies rally, inspiration, and rockfall morale effects without consuming forecast state', () => {
    const state = battle({
      attackerUnits: [
        {
          id: 'a1',
          name: 'Rallying officer',
          troopType: 'infantry',
          troops: 1000,
          force: 80,
          intellect: 60,
        },
        { id: 'a2', name: 'Ally', troopType: 'infantry', troops: 1000, force: 80 },
      ],
    });
    state.units[0]!.x = 5;
    state.units[0]!.y = 5;
    state.units[1]!.x = 6;
    state.units[1]!.y = 5;
    state.units[2]!.x = 7;
    state.units[2]!.y = 5;
    state.units[1]!.morale = 35;
    state.units[1]!.status = 'confused';
    state.tacticPoints.attacker = 10;
    const rally = predictBattleTactic(state, 'a1', 'rally', 'a2');
    expect(rally).toMatchObject({ moraleChange: 27, endsConfusion: true });
    const beforeInspiredAttack = predictBattleAttack(state, 'a2', 'd1')!.estimatedCasualties!;
    const rallied = applyBattleAction(state, {
      type: 'tactic',
      unitId: 'a1',
      tactic: 'rally',
      targetId: 'a2',
    });
    expect(rallied.ok).toBe(true);
    if (!rallied.ok) return;
    expect(rallied.state.units[1]).toMatchObject({ morale: 62, status: 'inspired' });
    expect(predictBattleAttack(rallied.state, 'a2', 'd1')!.estimatedCasualties).toBeGreaterThan(
      beforeInspiredAttack,
    );

    const rockfall = battle({
      attackerUnits: [
        {
          id: 'a1',
          name: 'Rockfall unit',
          troopType: 'infantry',
          troops: 1000,
          force: 80,
          intellect: 70,
        },
      ],
    });
    rockfall.map.terrain = Array.from(
      { length: rockfall.map.width * rockfall.map.height },
      () => 'plain',
    );
    rockfall.units[0]!.x = 5;
    rockfall.units[0]!.y = 5;
    rockfall.units[1]!.x = 6;
    rockfall.units[1]!.y = 5;
    rockfall.map.terrain[index(rockfall.map, 5, 5)] = 'hill';
    rockfall.map.terrain[index(rockfall.map, 6, 5)] = 'water';
    rockfall.units[1]!.morale = 40;
    rockfall.tacticPoints.attacker = 10;
    const rockPreview = predictBattleTactic(rockfall, 'a1', 'rockfall', 'd1');
    expect(rockPreview).toMatchObject({
      inRange: true,
      targetOnWater: true,
      incomingDamageMultiplier: 1.25,
      moraleChange: -10,
    });
    expect(rockPreview?.minCasualties).toBe(rockPreview?.maxCasualties);
    const rocked = applyBattleAction(rockfall, {
      type: 'tactic',
      unitId: 'a1',
      tactic: 'rockfall',
      targetId: 'd1',
    });
    expect(rocked.ok).toBe(true);
    if (rocked.ok) expect(rocked.state.units[1]!.morale).toBeLessThan(40);
  });

  it('keeps all six tactics targetable on or against water, with terrain-gated ambush and rockfall', () => {
    const availableFromWater = (tactic: 'fire' | 'confuse' | 'raidSupply' | 'rally') => {
      const state = battle({
        attackerUnits: [
          {
            id: 'a1',
            name: 'Water unit',
            troopType: 'archer',
            troops: 1000,
            force: 80,
            intellect: 90,
            level: 3,
          },
          { id: 'a2', name: 'Ally', troopType: 'infantry', troops: 1000, force: 80 },
        ],
      });
      state.map.terrain = Array.from({ length: state.map.width * state.map.height }, () => 'plain');
      state.units[0]!.x = 5;
      state.units[0]!.y = 5;
      state.units[1]!.x = 6;
      state.units[1]!.y = 5;
      state.units[2]!.x = 7;
      state.units[2]!.y = 5;
      state.map.terrain[index(state.map, 5, 5)] = 'water';
      state.map.terrain[index(state.map, 6, 5)] = 'water';
      state.tacticPoints.attacker = 20;
      state.supplies.defender = 1000;
      const targetId = tactic === 'rally' ? 'a2' : 'd1';
      if (tactic !== 'rally') {
        state.units[2]!.x = 6;
        state.units[2]!.y = 5;
        state.units[1]!.x = 7;
        state.units[1]!.y = 5;
      }
      return { state, targetId, targets: getBattleTacticTargets(state, 'a1', tactic) };
    };
    for (const tactic of ['fire', 'confuse', 'raidSupply', 'rally'] as const) {
      const { state, targetId, targets } = availableFromWater(tactic);
      expect(targets.map((target) => target.id)).toContain(targetId);
      expect(predictBattleTactic(state, 'a1', tactic, targetId)?.inRange).toBe(true);
      const beforePoints = state.tacticPoints.attacker;
      const result = applyBattleAction(state, { type: 'tactic', unitId: 'a1', tactic, targetId });
      expect(result.ok, `${tactic} from water`).toBe(true);
      if (result.ok) {
        expect(result.state.tacticPoints.attacker).toBe(beforePoints - BATTLE_TACTIC_COST[tactic]);
        if (tactic === 'raidSupply')
          expect(result.state.supplies).toEqual({ attacker: 250, defender: 500 });
      }
    }
    for (const tactic of ['ambush', 'rockfall'] as const) {
      const state = battle({
        attackerUnits: [
          {
            id: 'a1',
            name: 'Terrain unit',
            troopType: 'archer',
            troops: 1000,
            force: 80,
            intellect: 90,
            level: 3,
          },
        ],
      });
      state.map.terrain = Array.from({ length: state.map.width * state.map.height }, () => 'plain');
      state.units[0]!.x = 5;
      state.units[0]!.y = 5;
      state.units[1]!.x = 6;
      state.units[1]!.y = 5;
      state.map.terrain[index(state.map, 5, 5)] = tactic === 'ambush' ? 'forest' : 'hill';
      state.map.terrain[index(state.map, 6, 5)] = 'water';
      state.tacticPoints.attacker = 20;
      expect(getBattleTacticTargets(state, 'a1', tactic).map((target) => target.id)).toContain(
        'd1',
      );
      expect(predictBattleTactic(state, 'a1', tactic, 'd1')).toMatchObject({
        inRange: true,
        targetOnWater: true,
        incomingDamageMultiplier: 1.25,
      });
      const result = applyBattleAction(state, {
        type: 'tactic',
        unitId: 'a1',
        tactic,
        targetId: 'd1',
      });
      expect(result.ok, `${tactic} against water`).toBe(true);
      if (result.ok && tactic === 'ambush') {
        expect(result.state.log.at(-1)).toContain('1.00× attack × 1.25× damage received');
        expect(result.state.units[0]!.troops).toBe(state.units[0]!.troops);
      }
    }
  });

  it('regenerates tactic points and weather deterministically; rout ends the field battle', () => {
    const state = battle({ dayLimit: 4 });
    state.tacticPoints.attacker = BATTLE_TACTIC_POINT_CAP - 1;
    state.tacticPoints.defender = 0;
    state.units[0]!.x = 2;
    state.units[0]!.y = 2;
    state.units[1]!.x = 21;
    state.units[1]!.y = 17;
    const first = advanceBattleDay(state);
    const repeat = advanceBattleDay(structuredClone(state));
    expect(first).toEqual(repeat);
    expect(first.day).toBe(2);
    expect(first.tacticPoints).toEqual({
      attacker: BATTLE_TACTIC_POINT_CAP,
      defender: BATTLE_TACTIC_POINT_REGEN,
    });
    expect(first.weather).toBe(state.nextWeather);
    expect(first.rngState).not.toBe(state.rngState);

    const routed = battle({ dayLimit: 4 });
    routed.units[0]!.morale = 10;
    routed.units[1]!.morale = 80;
    routed.units[0]!.x = 2;
    routed.units[0]!.y = 2;
    routed.units[1]!.x = 21;
    routed.units[1]!.y = 17;
    const routResult = advanceBattleDay(routed);
    expect(routResult.outcome).toEqual({ winner: 'defender', reason: 'rout' });
  });

  it('lets the battle AI spend a tactic when its forecast beats the ordinary attack', () => {
    const state = battle({
      playerSide: 'defender',
      attackerUnits: [
        {
          id: 'a1',
          name: 'AI fire officer',
          troopType: 'infantry',
          troops: 1000,
          force: 80,
          intellect: 100,
          level: 3,
        },
      ],
    });
    state.map.terrain = Array.from({ length: state.map.width * state.map.height }, () => 'plain');
    state.units[0]!.x = 5;
    state.units[0]!.y = 5;
    state.units[1]!.x = 6;
    state.units[1]!.y = 5;
    state.map.terrain[index(state.map, 6, 5)] = 'forest';
    state.tacticPoints.attacker = 20;
    const result = runBattleAiTurn(state, 'attacker');
    expect(result.log.some((line) => line.includes('fire tactic strikes'))).toBe(true);
    expect(result.tacticPoints.attacker).toBe(16);
  });

  it('allows the player to retreat and ends the battle once with the opposing side holding the field', () => {
    const state = battle();
    const before = structuredClone(state);
    const result = applyBattleAction(state, { type: 'retreat', unitId: 'a1' });
    expect(result.ok).toBe(true);
    expect(state).toEqual(before);
    if (!result.ok) return;
    expect(result.state.outcome).toEqual({ winner: 'defender', reason: 'retreat' });
    expect(result.state.log.at(-1)).toContain('attacker forces retreat');
    expect(applyBattleAction(result.state, { type: 'wait', unitId: 'a1' })).toMatchObject({
      ok: false,
      error: 'This battle has ended.',
    });
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
