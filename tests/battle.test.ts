import { describe, expect, it } from 'vitest';
import {
  autoResolveBattle,
  createBattle,
  getAttackTargets,
  getBattleUnitMove,
  getBattleUnitRange,
  getReachableTiles,
  processBattleCommand,
} from '../src/game/battle';
import type {
  AttackOrder,
  BattleState,
  BattleUnit,
  City,
  GameState,
  Officer,
} from '../src/game/types';

function city(id: string, factionId: string): City {
  return {
    id,
    name: id,
    chinese: '',
    region: 'Central Plains',
    x: 0,
    y: 0,
    neighbors: ['home', 'target'].filter((other) => other !== id),
    factionId,
    population: 100000,
    farming: 60,
    commerce: 60,
    defense: 60,
    loyalty: 80,
    gold: 1000,
    food: 5000,
    reserve: 400,
    governorId: null,
    plunderCooldownUntil: 0,
  };
}

function officer(id: string, cityId: string, factionId: string): Officer {
  return {
    id,
    name: id,
    chinese: '',
    factionId,
    cityId,
    force: 75,
    intellect: 70,
    loyalty: 90,
    stamina: 100,
    age: 30,
    troops: 2500,
    troopType: 'infantry',
    busy: false,
    captive: false,
    experience: 0,
    level: 0,
    equipment: null,
    fate: 'active',
  };
}

const order: AttackOrder = {
  id: 'attack-1',
  factionId: 'blue',
  sourceId: 'home',
  targetId: 'target',
  officerIds: ['a'],
  food: 4000,
  intent: 'conquer',
};

function game(): GameState {
  return {
    version: 2,
    ruleset: 'baye-atlas-2',
    revision: 0,
    playerFactionId: 'blue',
    rivalAggression: 'balanced',
    reports: { pending: null, latest: null },
    year: 190,
    month: 1,
    turn: 0,
    rng: 987654321,
    nextId: 1,
    cities: [city('home', 'blue'), city('target', 'red')],
    officers: [officer('a', 'home', 'blue'), officer('b', 'target', 'red')],
    alliances: [],
    phase: 'battle',
    battle: null,
    orders: [],
    resolution: null,
    log: [],
    winner: null,
    stats: { battlesWon: 0, commandsIssued: 0, citiesCaptured: 0 },
    truceUntilTurn: 0,
    lastBattle: null,
    reputation: {},
  };
}

function unit(id: string, side: BattleUnit['side'], x: number, y: number): BattleUnit {
  return {
    id,
    officerId: id,
    name: id,
    side,
    x,
    y,
    troops: 1000,
    initialTroops: 1000,
    force: 70,
    intellect: 70,
    troopType: 'infantry',
    level: 0,
    moved: false,
    acted: false,
    hurt: false,
    morale: 80,
    status: 'normal',
  };
}

function battlefield(width = 12, height = 10): BattleState {
  return {
    id: 'battle-1',
    order,
    attackerId: 'blue',
    defenderId: 'red',
    playerSide: 'attacker',
    width,
    height,
    terrain: Array.from({ length: width * height }, () => 'plain'),
    units: [unit('a', 'attacker', 1, 1), unit('b', 'defender', width - 2, height - 2)],
    day: 1,
    dayLimit: 30,
    weather: 'clear',
    nextWeather: 'clear',
    attackerFood: 3000,
    defenderFood: 3000,
    tacticPoints: { attacker: 20, defender: 20 },
    log: [],
    outcome: null,
  };
}

function gameWithBattle(battle = battlefield()): GameState {
  const state = game();
  state.battle = battle;
  return state;
}

function stalemate(): BattleState {
  const battle = battlefield();
  // Two isolated land tiles. Melee units cannot cross the river or attack at a distance.
  battle.terrain.fill('water');
  for (const candidate of battle.units)
    battle.terrain[candidate.y * battle.width + candidate.x] = 'plain';
  return battle;
}

describe('battlefield creation', () => {
  it('is deterministic, preserves campaign resources, and represents the exact reserve garrison', () => {
    const first = game();
    const second = game();
    const before = structuredClone(first);
    const battle = createBattle(first, order);
    expect(battle).toEqual(createBattle(second, order));
    expect(first.rng).toBe(second.rng);
    expect(first.cities).toEqual(before.cities);
    expect(first.officers).toEqual(before.officers);
    expect(battle.units.find((candidate) => candidate.officerId === 'militia-target')?.troops).toBe(
      400,
    );
    expect(battle.defenderFood).toBe(first.cities[1]!.food);
    expect(battle.terrain).toHaveLength(battle.width * battle.height);
    expect(
      battle.units.every(
        (candidate) => battle.terrain[candidate.y * battle.width + candidate.x] !== 'water',
      ),
    ).toBe(true);
  });

  it('supports a defended city with only reserves and immediately resolves an empty city', () => {
    const state = game();
    state.officers = state.officers.filter((candidate) => candidate.factionId === 'blue');
    expect(
      createBattle(state, order).units.filter((candidate) => candidate.side === 'defender'),
    ).toHaveLength(1);
    state.cities[1]!.reserve = 0;
    expect(createBattle(state, order).outcome).toBe('attacker');
  });

  it('identifies a player defending against an AI invasion', () => {
    const state = game();
    state.playerFactionId = 'red';
    expect(createBattle(state, order).playerSide).toBe('defender');
  });

  it('fields ten distinct commanders per side without overflowing deployment rows', () => {
    const state = game();
    state.officers = Array.from({ length: 10 }, (_, index) => [
      officer(`a-${index}`, 'home', 'blue'),
      officer(`b-${index}`, 'target', 'red'),
    ]).flat();
    const fullOrder = {
      ...order,
      officerIds: state.officers
        .filter((candidate) => candidate.factionId === 'blue')
        .map((candidate) => candidate.id),
    };
    const battle = createBattle(state, fullOrder);
    expect(battle.units).toHaveLength(20);
    expect(new Set(battle.units.map((candidate) => `${candidate.x},${candidate.y}`)).size).toBe(20);
    expect(battle.units.every((candidate) => candidate.y >= 0 && candidate.y < battle.height)).toBe(
      true,
    );
    // Reserves remain in the city when the ten defending commander slots are full.
    expect(battle.units.some((candidate) => candidate.officerId.startsWith('militia-'))).toBe(
      false,
    );
    expect(state.cities[1]!.reserve).toBe(400);
  });
});

describe('tactical movement', () => {
  it('uses routes instead of Manhattan distance and cannot cross an occupied wall', () => {
    const battle = battlefield(5, 3);
    battle.units = [
      unit('a', 'attacker', 0, 1),
      unit('wall-0', 'attacker', 1, 0),
      unit('wall-1', 'defender', 1, 1),
      unit('wall-2', 'attacker', 1, 2),
    ];
    const reachable = getReachableTiles(battle, 'a');
    expect(reachable).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0 },
        { x: 0, y: 2 },
      ]),
    );
    expect(reachable.some((tile) => tile.x > 0)).toBe(false);
  });

  it('lets naval troops cross water while requiring land troops to find a bridge', () => {
    const battle = battlefield(5, 3);
    battle.units = [unit('a', 'attacker', 0, 1)];
    for (let y = 0; y < 3; y++) battle.terrain[y * 5 + 1] = 'water';
    expect(getReachableTiles(battle, 'a').some((tile) => tile.x >= 2)).toBe(false);
    battle.units[0]!.troopType = 'naval';
    expect(getReachableTiles(battle, 'a')).toContainEqual({ x: 2, y: 1 });
  });

  it('charges terrain movement costs and gives the six troop types distinct roles', () => {
    const battle = battlefield(6, 1);
    battle.units = [unit('a', 'attacker', 0, 0)];
    battle.terrain[1] = 'hill';
    battle.terrain[2] = 'forest';
    const source = battle.units[0]!;
    source.troopType = 'cavalry';
    expect(getBattleUnitMove(source)).toBe(5);
    expect(getReachableTiles(battle, source.id)).toContainEqual({ x: 1, y: 0 });
    expect(getReachableTiles(battle, source.id)).not.toContainEqual({ x: 2, y: 0 });
    source.troopType = 'elite';
    expect(getReachableTiles(battle, source.id)).toContainEqual({ x: 4, y: 0 });
    source.troopType = 'archer';
    expect(getBattleUnitRange(source)).toBe(3);
    source.troopType = 'naval';
    expect(getBattleUnitRange(source)).toBe(2);
    source.troopType = 'guard';
    expect(getBattleUnitMove(source)).toBe(2);
    source.troopType = 'infantry';
    expect(getBattleUnitRange(source)).toBe(1);
  });

  it('rejects illegal moves atomically, prevents enemy control, and limits units to one move', () => {
    const state = gameWithBattle();
    const before = structuredClone(state);
    expect(processBattleCommand(state, { type: 'battleMove', unitId: 'b', x: 9, y: 8 })).toMatch(
      /own units/,
    );
    expect(processBattleCommand(state, { type: 'battleMove', unitId: 'a', x: 11, y: 1 })).toMatch(
      /blocked/,
    );
    expect(processBattleCommand(state, { type: 'battleMove', unitId: 'a', x: NaN, y: 1 })).toMatch(
      /valid/,
    );
    expect(state).toEqual(before);
    expect(processBattleCommand(state, { type: 'battleMove', unitId: 'a', x: 2, y: 1 })).toBeNull();
    expect(processBattleCommand(state, { type: 'battleMove', unitId: 'a', x: 3, y: 1 })).toMatch(
      /already moved/,
    );
  });

  it('awards victory for occupying the enemy camp', () => {
    const state = gameWithBattle();
    state.battle!.units[0]!.x = 10;
    state.battle!.units[0]!.y = 5;
    expect(
      processBattleCommand(state, { type: 'battleMove', unitId: 'a', x: 11, y: 5 }),
    ).toBeNull();
    expect(state.battle!.outcome).toBe('attacker');
  });

  it('routes the AI toward a distant bridge even when the first steps lead away from its enemy', () => {
    const battle = battlefield(7, 7);
    battle.units = [unit('a', 'attacker', 1, 0), unit('b', 'defender', 5, 0)];
    for (let y = 0; y < 6; y++) battle.terrain[y * battle.width + 3] = 'water';
    const state = gameWithBattle(battle);
    expect(processBattleCommand(state, { type: 'battleEndDay' })).toBeNull();
    expect(battle.units[1]!.y).toBeGreaterThanOrEqual(2);
    expect(processBattleCommand(state, { type: 'battleEndDay' })).toBeNull();
    expect(battle.units[1]!.y).toBeGreaterThanOrEqual(4);
    for (let day = 0; day < 5 && !battle.outcome; day++) {
      expect(processBattleCommand(state, { type: 'battleEndDay' })).toBeNull();
      expect(
        battle.units.every(
          (candidate) => battle.terrain[candidate.y * battle.width + candidate.x] !== 'water',
        ),
      ).toBe(true);
    }
    expect(battle.units[1]!.x).toBeLessThan(3);
  });
});

describe('combat and tactics', () => {
  it('produces the same casualties and RNG for the same saved state', () => {
    const first = gameWithBattle();
    first.battle!.units[1]!.x = 2;
    first.battle!.units[1]!.y = 1;
    const second = structuredClone(first);
    expect(getAttackTargets(first.battle!, 'a')).toEqual(['b']);
    const beforeTroops = first.battle!.units[1]!.troops;
    const command = { type: 'battleAttack', unitId: 'a', targetId: 'b' } as const;
    expect(processBattleCommand(first, command)).toBeNull();
    expect(processBattleCommand(second, command)).toBeNull();
    expect(first).toEqual(second);
    expect(first.battle!.units[1]!.troops).toBeLessThan(beforeTroops);
    expect(processBattleCommand(first, command)).toMatch(/already acted/);
    expect(first.officers[1]!.troops).toBe(2500); // Campaign aftermath has sole ownership.
  });

  it('rejects out-of-range and friendly attacks without drawing randomness', () => {
    const state = gameWithBattle();
    const before = structuredClone(state);
    expect(
      processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'b' }),
    ).toMatch(/range/);
    expect(
      processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'a' }),
    ).toMatch(/enemy/);
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'rally',
        targetId: 'b',
      }),
    ).toMatch(/friendly/);
    expect(state).toEqual(before);
  });

  it('dampens fire in rain and increases it in wind', () => {
    const rain = gameWithBattle();
    rain.battle!.units[1]!.x = 3;
    rain.battle!.units[1]!.y = 1;
    rain.battle!.weather = 'rain';
    const wind = structuredClone(rain);
    wind.battle!.weather = 'wind';
    const command = { type: 'battleSkill', unitId: 'a', skill: 'fire', targetId: 'b' } as const;
    expect(processBattleCommand(rain, command)).toBeNull();
    expect(processBattleCommand(wind, command)).toBeNull();
    expect(wind.battle!.units[1]!.troops).toBeLessThan(rain.battle!.units[1]!.troops);
  });

  it('rally restores allied morale and releases confusion', () => {
    const state = gameWithBattle();
    state.battle!.units.push(unit('c', 'attacker', 2, 1));
    const ally = state.battle!.units[2]!;
    ally.morale = 30;
    ally.status = 'confused';
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'rally',
        targetId: 'c',
      }),
    ).toBeNull();
    expect(ally.morale).toBeGreaterThan(30);
    expect(ally.status).toBe('inspired');
    expect(state.battle!.units[0]!.acted).toBe(true);
  });

  it('a confused unit loses its turn and recovers on the next day', () => {
    const state = gameWithBattle(stalemate());
    state.battle!.units[0]!.status = 'confused';
    expect(processBattleCommand(state, { type: 'battleWait', unitId: 'a' })).toMatch(/confused/);
    expect(processBattleCommand(state, { type: 'battleEndDay' })).toBeNull();
    expect(state.battle!.units[0]!.status).toBe('normal');
    expect(processBattleCommand(state, { type: 'battleWait', unitId: 'a' })).toBeNull();
  });

  it('allows one attack after a move, but no movement or second action after attacking', () => {
    const state = gameWithBattle();
    state.battle!.units[1]!.x = 3;
    state.battle!.units[1]!.y = 1;
    expect(processBattleCommand(state, { type: 'battleMove', unitId: 'a', x: 2, y: 1 })).toBeNull();
    expect(
      processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'b' }),
    ).toBeNull();
    const afterAttack = structuredClone(state);
    expect(processBattleCommand(state, { type: 'battleMove', unitId: 'a', x: 2, y: 2 })).toMatch(
      /already acted/,
    );
    expect(
      processBattleCommand(state, { type: 'battleSkill', unitId: 'a', skill: 'rally' }),
    ).toMatch(/already acted/);
    expect(state).toEqual(afterAttack);
    expect(getReachableTiles(state.battle!, 'a')).toEqual([]);
    expect(getAttackTargets(state.battle!, 'a')).toEqual([]);
  });

  it('rejects missing, defeated, distant, and wrong-side tactic targets without changing state', () => {
    const state = gameWithBattle();
    const defeated = unit('fallen', 'defender', 2, 1);
    defeated.troops = 0;
    state.battle!.units.push(defeated);
    const commands = [
      { type: 'battleSkill', unitId: 'a', skill: 'fire', targetId: 'missing' },
      { type: 'battleSkill', unitId: 'a', skill: 'fire', targetId: 'fallen' },
      { type: 'battleSkill', unitId: 'a', skill: 'fire', targetId: 'b' },
      { type: 'battleSkill', unitId: 'a', skill: 'confuse', targetId: 'a' },
      { type: 'battleAttack', unitId: 'a', targetId: 'fallen' },
      { type: 'battleWait', unitId: 'fallen' },
    ] as const;
    const before = structuredClone(state);
    for (const command of commands) {
      expect(processBattleCommand(state, command)).not.toBeNull();
      expect(state).toEqual(before);
    }
  });

  it('rally benefits an ally that has not attacked and its inspiration expires at day end', () => {
    const normal = gameWithBattle();
    normal.battle!.units[1]!.x = 3;
    normal.battle!.units[1]!.y = 1;
    normal.battle!.units.push(unit('ally', 'attacker', 2, 1));
    normal.battle!.units[2]!.morale = 100;
    // Keep the AI from casting tactics on the ally so only inspiration is under test.
    normal.battle!.tacticPoints.defender = 0;
    const rallied = structuredClone(normal);
    expect(
      processBattleCommand(rallied, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'rally',
        targetId: 'ally',
      }),
    ).toBeNull();
    expect(rallied.battle!.units[2]!.morale).toBe(100);
    for (const state of [normal, rallied])
      expect(
        processBattleCommand(state, { type: 'battleAttack', unitId: 'ally', targetId: 'b' }),
      ).toBeNull();
    expect(rallied.battle!.units[1]!.troops).toBeLessThan(normal.battle!.units[1]!.troops);
    expect(processBattleCommand(rallied, { type: 'battleEndDay' })).toBeNull();
    expect(rallied.battle!.units[2]!.status).toBe('normal');
  });
});

describe('battle completion', () => {
  it('consumes provisions and inflicts starvation only when provisions are insufficient', () => {
    const state = gameWithBattle(stalemate());
    state.battle!.attackerFood = 0;
    const defenderFood = state.battle!.defenderFood;
    expect(processBattleCommand(state, { type: 'battleEndDay' })).toBeNull();
    expect(state.battle!.attackerFood).toBe(0);
    expect(state.battle!.units[0]!.troops).toBe(880);
    expect(state.battle!.units[1]!.troops).toBe(1000);
    expect(state.battle!.defenderFood).toBe(defenderFood - 40);
    expect(state.battle!.day).toBe(2);
  });

  it('does not starve soldiers when the last provisions exactly cover the day', () => {
    const state = gameWithBattle(stalemate());
    state.battle!.attackerFood = 40;
    expect(processBattleCommand(state, { type: 'battleEndDay' })).toBeNull();
    expect(state.battle!.attackerFood).toBe(0);
    expect(state.battle!.units[0]!.troops).toBe(1000);
    expect(processBattleCommand(state, { type: 'battleEndDay' })).toBeNull();
    expect(state.battle!.units[0]!.troops).toBe(880);
  });

  it('bounds an inaccessible siege at 30 days and awards the defender victory', () => {
    const state = gameWithBattle(stalemate());
    autoResolveBattle(state);
    expect(state.battle!.outcome).toBe('defender');
    expect(state.battle!.day).toBe(30);
    expect(state.battle!.units.every((candidate) => candidate.troops === 1000)).toBe(true);
    expect(state.battle!.log.length).toBeLessThanOrEqual(32);
  });

  it('autoresolves generated battlefields deterministically without changing campaign state', () => {
    for (const seed of [1, 190, 90210, 987654321]) {
      const first = game();
      first.rng = seed;
      first.battle = createBattle(first, order);
      const second = structuredClone(first);
      const campaign = structuredClone({
        cities: first.cities,
        officers: first.officers,
        orders: first.orders,
      });
      autoResolveBattle(first);
      autoResolveBattle(second);
      expect(first).toEqual(second);
      expect(first.battle!.outcome).not.toBeNull();
      expect(first.battle!.day).toBeLessThanOrEqual(30);
      expect(
        first.battle!.units.every(
          (candidate) => candidate.troops >= 0 && candidate.troops <= candidate.initialTroops,
        ),
      ).toBe(true);
      expect({ cities: first.cities, officers: first.officers, orders: first.orders }).toEqual(
        campaign,
      );
    }
  });

  it('retreat awards the opposing side and ended battles reject further commands', () => {
    const state = gameWithBattle();
    state.battle!.playerSide = 'defender';
    expect(processBattleCommand(state, { type: 'battleRetreat' })).toBeNull();
    expect(state.battle!.outcome).toBe('attacker');
    const before = structuredClone(state);
    expect(processBattleCommand(state, { type: 'battleEndDay' })).toMatch(/already ended/);
    expect(state).toEqual(before);
  });

  it.each(['attacker', 'defender'] as const)(
    'resumes a partly played %s turn from JSON without repeating movement or changing the result',
    (side) => {
      const uninterrupted = game();
      uninterrupted.playerFactionId = side === 'attacker' ? 'blue' : 'red';
      uninterrupted.battle = createBattle(uninterrupted, order);
      const commander = uninterrupted.battle.units.find((candidate) => candidate.side === side)!;
      const destination = getReachableTiles(uninterrupted.battle, commander.id)[0]!;
      expect(
        processBattleCommand(uninterrupted, {
          type: 'battleMove',
          unitId: commander.id,
          ...destination,
        }),
      ).toBeNull();
      const resumed = JSON.parse(JSON.stringify(uninterrupted)) as GameState;
      expect(getReachableTiles(resumed.battle!, commander.id)).toEqual([]);
      for (const state of [uninterrupted, resumed]) {
        expect(
          processBattleCommand(state, {
            type: 'battleSkill',
            unitId: commander.id,
            skill: 'rally',
          }),
        ).toBeNull();
        expect(processBattleCommand(state, { type: 'battleEndDay' })).toBeNull();
        autoResolveBattle(state);
      }
      expect(resumed).toEqual(uninterrupted);
      expect(resumed.battle!.outcome).not.toBeNull();
    },
  );

  it('keeps crowded mixed-army battles finite, deterministic, and free of overlapping living units', () => {
    const troopTypes = ['infantry', 'cavalry', 'archer', 'naval', 'elite', 'guard'] as const;
    for (let seed = 1; seed <= 32; seed++) {
      const state = game();
      state.rng = seed;
      state.playerFactionId = seed % 2 ? 'blue' : 'red';
      state.officers = Array.from({ length: 10 }, (_, index) => [
        {
          ...officer(`a-${index}`, 'home', 'blue'),
          troopType: troopTypes[index % troopTypes.length]!,
        },
        {
          ...officer(`b-${index}`, 'target', 'red'),
          troopType: troopTypes[(index + 1) % troopTypes.length]!,
        },
      ]).flat();
      const fullOrder = {
        ...order,
        officerIds: state.officers
          .filter((candidate) => candidate.factionId === 'blue')
          .map((candidate) => candidate.id),
      };
      state.battle = createBattle(state, fullOrder);
      const clone = structuredClone(state);
      autoResolveBattle(state);
      autoResolveBattle(clone);
      expect(state, `seed ${seed}`).toEqual(clone);
      const battle = state.battle!;
      const living = battle.units.filter((candidate) => candidate.troops > 0);
      expect(battle.outcome).not.toBeNull();
      expect(battle.day).toBeLessThanOrEqual(30);
      expect(new Set(living.map((candidate) => `${candidate.x},${candidate.y}`)).size).toBe(
        living.length,
      );
      expect(
        battle.units.every(
          (candidate) =>
            Number.isInteger(candidate.troops) &&
            candidate.troops >= 0 &&
            candidate.troops <= candidate.initialTroops,
        ),
      ).toBe(true);
      expect(
        living.every(
          (candidate) =>
            candidate.troopType === 'naval' ||
            battle.terrain[candidate.y * battle.width + candidate.x] !== 'water',
        ),
      ).toBe(true);
      expect(battle.attackerFood).toBeGreaterThanOrEqual(0);
      expect(battle.defenderFood).toBeGreaterThanOrEqual(0);
    }
  });
});
