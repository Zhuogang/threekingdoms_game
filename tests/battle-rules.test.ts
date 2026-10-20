import { describe, expect, it } from 'vitest';
import {
  DEPLOY_ROWS,
  autoResolveBattle,
  campTile,
  createBattle,
  fireDamage,
  flankingMultiplier,
  forecastAttack,
  forecastSkill,
  getAttackTargets,
  getAvailableTactics,
  getReachableTiles,
  getTacticRange,
  getThreatTiles,
  getZocStopTiles,
  moraleState,
  normalDamage,
  processBattleCommand,
  startingTacticPoints,
  supplyDaysLeft,
} from '../src/game/battle';
import { battlefieldProfile } from '../src/content/scenario';
import type { BattleState, BattleUnit, Terrain } from '../src/game/types';
import { battlefield, game, gameWithBattle, officer, order, stalemate, unit } from './fixtures';

const at = (battle: BattleState, x: number, y: number) => y * battle.width + x;
const find = (battle: BattleState, id: string): BattleUnit =>
  battle.units.find((candidate) => candidate.id === id)!;

describe('center-out deployment and weather forecast', () => {
  it('fills rows 5, 4, 6, 3, 7... so the camp lanes are closed on day one', () => {
    for (let count = 1; count <= 10; count++) {
      const state = game();
      state.officers = Array.from({ length: count }, (_, index) => [
        officer(`a-${index}`, 'home', 'blue'),
        officer(`b-${index}`, 'target', 'red'),
      ]).flat();
      const army = {
        ...order,
        officerIds: state.officers.filter((o) => o.factionId === 'blue').map((o) => o.id),
      };
      const battle = createBattle(state, army);
      const attackers = battle.units.filter((u) => u.side === 'attacker');
      expect(attackers.map((u) => u.y)).toEqual(DEPLOY_ROWS.slice(0, count));
      expect(attackers[0]!.y).toBe(5);
      for (const u of battle.units) {
        expect(battle.terrain[at(battle, u.x, u.y)]).not.toBe('water');
        for (const side of ['attacker', 'defender'] as const) {
          const camp = campTile(battle, side);
          expect(u.x === camp.x && u.y === camp.y).toBe(false);
        }
      }
    }
  });

  it('places the militia in the next free row after the defending officers', () => {
    const state = game();
    state.officers = [
      officer('a', 'home', 'blue'),
      officer('b', 'target', 'red'),
      officer('c', 'target', 'red'),
    ];
    const battle = createBattle(state, order);
    const rows = battle.units.filter((u) => u.side === 'defender').map((u) => u.y);
    expect(rows).toEqual([5, 4, 6]);
  });

  it('shows tomorrow’s weather and makes it today’s weather on the next day', () => {
    const state = gameWithBattle(stalemate());
    const battle = state.battle!;
    battle.weather = 'clear';
    battle.nextWeather = 'rain';
    expect(processBattleCommand(state, { type: 'battleEndDay' })).toBeNull();
    expect(battle.weather).toBe('rain');
    expect(['clear', 'rain', 'wind']).toContain(battle.nextWeather);
    const generated = createBattle(game(), order);
    expect(['clear', 'rain', 'wind']).toContain(generated.nextWeather);
  });
});

describe('attack forecasts', () => {
  const shuffled = (seed: number) => {
    const state = gameWithBattle();
    const battle = state.battle!;
    state.rng = seed;
    const a = find(battle, 'a');
    const b = find(battle, 'b');
    a.x = 4;
    a.y = 4;
    b.x = 5;
    b.y = 4;
    a.troops = a.initialTroops = 800 + (seed % 7) * 300;
    b.troops = b.initialTroops = 700 + (seed % 5) * 400;
    a.morale = 40 + (seed % 60);
    b.morale = 50 + (seed % 50);
    a.force = 40 + (seed % 60);
    b.force = 40 + ((seed * 3) % 60);
    a.troopType = (['infantry', 'cavalry', 'archer', 'elite', 'guard'] as const)[seed % 5]!;
    b.troopType = (['infantry', 'guard', 'cavalry', 'archer', 'naval'] as const)[seed % 5]!;
    battle.terrain[at(battle, 5, 4)] = (['plain', 'forest', 'hill'] as const)[seed % 3]!;
    battle.weather = (['clear', 'rain', 'wind'] as const)[seed % 3]!;
    return state;
  };

  it('contains the real casualties and counter for 100 seeded attacks and consumes nothing', () => {
    let countered = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const state = shuffled(seed * 7919);
      const battle = state.battle!;
      const forecast = forecastAttack(battle, 'a', 'b')!;
      const snapshot = structuredClone(state);
      forecastAttack(battle, 'a', 'b');
      forecastSkill(battle, 'a', 'fire', 'b');
      expect(state).toEqual(snapshot);
      const beforeTarget = find(battle, 'b').troops;
      const beforeSource = find(battle, 'a').troops;
      expect(
        processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'b' }),
      ).toBeNull();
      const dealt = beforeTarget - find(battle, 'b').troops;
      const taken = beforeSource - find(battle, 'a').troops;
      expect(dealt, `seed ${seed}`).toBeGreaterThanOrEqual(forecast.min);
      expect(dealt, `seed ${seed}`).toBeLessThanOrEqual(forecast.max);
      expect(taken, `seed ${seed}`).toBeGreaterThanOrEqual(forecast.counterMin);
      expect(taken, `seed ${seed}`).toBeLessThanOrEqual(forecast.counterMax);
      if (taken > 0) countered++;
    }
    expect(countered).toBeGreaterThan(20);
  });

  it('returns null for impossible pairings and flags only guaranteed kills as lethal', () => {
    const battle = battlefield();
    expect(forecastAttack(battle, 'a', 'a')).toBeNull();
    expect(forecastAttack(battle, 'missing', 'b')).toBeNull();
    find(battle, 'b').troops = 1;
    expect(forecastAttack(battle, 'a', 'b')!.lethal).toBe(true);
  });

  it('forecasts every tactic', () => {
    const battle = battlefield();
    const fire = forecastSkill(battle, 'a', 'fire', 'b')!;
    expect(fire.min).toBeGreaterThan(0);
    expect(fire.max).toBeGreaterThanOrEqual(fire.min);
    expect(forecastSkill(battle, 'a', 'confuse', 'b')!.chance).toBeGreaterThanOrEqual(20);
    expect(forecastSkill(battle, 'a', 'rally')!.moraleGain).toBeGreaterThan(0);
    expect(forecastSkill(battle, 'a', 'raidSupply', 'b')!.foodTaken).toBe(500);
    expect(forecastSkill(battle, 'a', 'rockfall', 'b')!.moraleGain).toBe(-10);
  });
});

describe('counterattacks', () => {
  const adjacent = () => {
    const state = gameWithBattle();
    const battle = state.battle!;
    find(battle, 'a').x = 4;
    find(battle, 'a').y = 4;
    find(battle, 'b').x = 5;
    find(battle, 'b').y = 4;
    return { state, battle };
  };

  it('answers a normal attack once at half strength and costs the defender no action', () => {
    const { state, battle } = adjacent();
    expect(
      processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'b' }),
    ).toBeNull();
    expect(find(battle, 'a').troops).toBeLessThan(1000);
    expect(find(battle, 'b').acted).toBe(false);
    expect(battle.log.filter((line) => line.includes('counterattacks'))).toHaveLength(1);
  });

  it('guards counter harder than other troops', () => {
    const plain = adjacent();
    const guard = adjacent();
    find(guard.battle, 'b').troopType = 'guard';
    find(plain.battle, 'b').troopType = 'infantry';
    // Isolate the rate: same damage multipliers except the guard's own damage reduction.
    for (const { state } of [plain, guard])
      processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'b' });
    const lossPlain = 1000 - find(plain.battle, 'a').troops;
    const lossGuard = 1000 - find(guard.battle, 'a').troops;
    const rate = (target: BattleUnit) => (target.troopType === 'guard' ? 0.7 : 0.5);
    expect(rate(find(guard.battle, 'b'))).toBeGreaterThan(rate(find(plain.battle, 'b')));
    expect(lossGuard).toBeGreaterThan(0);
    expect(lossPlain).toBeGreaterThan(0);
  });

  it('does not answer from beyond the defender’s range, when the defender dies, or when confused', () => {
    const far = adjacent();
    find(far.battle, 'a').troopType = 'archer';
    find(far.battle, 'a').x = 3; // distance 2
    expect(
      processBattleCommand(far.state, { type: 'battleAttack', unitId: 'a', targetId: 'b' }),
    ).toBeNull();
    expect(find(far.battle, 'a').troops).toBe(1000);

    const dying = adjacent();
    find(dying.battle, 'b').troops = 5;
    processBattleCommand(dying.state, { type: 'battleAttack', unitId: 'a', targetId: 'b' });
    expect(find(dying.battle, 'a').troops).toBe(1000);

    const confused = adjacent();
    find(confused.battle, 'b').status = 'confused';
    processBattleCommand(confused.state, { type: 'battleAttack', unitId: 'a', targetId: 'b' });
    expect(find(confused.battle, 'a').troops).toBe(1000);
  });

  it('never answers tactics and never triggers counters of its own', () => {
    const { state, battle } = adjacent();
    find(battle, 'a').x = 3;
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'fire',
        targetId: 'b',
      }),
    ).toBeNull();
    expect(find(battle, 'a').troops).toBe(1000);
    expect(battle.log.some((line) => line.includes('counterattacks'))).toBe(false);
  });

  it('ends the battle when a counter destroys the attacker', () => {
    const { state, battle } = adjacent();
    find(battle, 'a').troops = 5;
    find(battle, 'a').initialTroops = 5;
    processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'b' });
    expect(find(battle, 'a').troops).toBe(0);
    expect(battle.outcome).toBe('defender');
  });
});

describe('tactic requirements, ranges and points', () => {
  it('gates Fire, Confuse and Rally by intellect or force and limits range', () => {
    const state = gameWithBattle();
    const battle = state.battle!;
    const a = find(battle, 'a');
    a.intellect = 55;
    a.force = 60;
    const by = (skill: string) => getAvailableTactics(battle, 'a').find((t) => t.skill === skill)!;
    expect(by('fire').allowed).toBe(false);
    expect(by('fire').reason).toBe('Fire requires intellect 60.');
    expect(by('confuse').reason).toBe('Confuse requires intellect 70.');
    expect(by('rally').allowed).toBe(true);
    a.intellect = 40;
    expect(by('rally').reason).toBe('Rally requires intellect 50 or force 85.');
    a.force = 90;
    expect(by('rally').allowed).toBe(true);
    // Veterans meet intellect requirements ten points lower.
    a.force = 60;
    a.intellect = 52;
    expect(by('fire').allowed).toBe(false);
    a.level = 3;
    expect(by('fire').allowed).toBe(true);
    expect(getTacticRange({ troopType: 'infantry', intellect: 79 })).toBe(2);
    expect(getTacticRange({ troopType: 'infantry', intellect: 80 })).toBe(3);
    expect(getTacticRange({ troopType: 'archer', intellect: 50 })).toBe(3);
  });

  it('rejects disallowed tactics atomically with the reason and bars garrison troops', () => {
    const state = gameWithBattle();
    const battle = state.battle!;
    find(battle, 'a').intellect = 40;
    find(battle, 'b').x = 3;
    find(battle, 'b').y = 1;
    const before = structuredClone(state);
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'fire',
        targetId: 'b',
      }),
    ).toBe('Fire requires intellect 60.');
    expect(state).toEqual(before);
    find(battle, 'a').intellect = 70;
    find(battle, 'a').x = 1;
    find(battle, 'b').x = 5;
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'fire',
        targetId: 'b',
      }),
    ).toBe('This tactic has a range of 2 tiles.');
    const garrison = unit('militia-x', 'attacker', 2, 2);
    battle.units.push(garrison);
    expect(getAvailableTactics(battle, 'militia-x').every((t) => !t.allowed)).toBe(true);
  });

  it('starts with INT/10 points per officer, spends costs atomically and refills 2 per day', () => {
    const units = [
      unit('x', 'attacker', 0, 0),
      unit('y', 'attacker', 0, 1),
      unit('militia-q', 'attacker', 0, 2),
    ];
    expect(startingTacticPoints(units, 'attacker')).toBe(14); // militia excluded
    expect(
      startingTacticPoints(
        Array.from({ length: 9 }, (_, i) => unit(`u${i}`, 'attacker', 0, i)),
        'attacker',
      ),
    ).toBe(30);

    const state = gameWithBattle(stalemate());
    const battle = state.battle!;
    battle.tacticPoints.attacker = 5;
    battle.tacticPoints.defender = 0; // keep the defending AI from casting back
    find(battle, 'b').x = 2;
    find(battle, 'b').y = 1;
    battle.terrain.fill('plain');
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'fire',
        targetId: 'b',
      }),
    ).toBeNull();
    expect(battle.tacticPoints.attacker).toBe(1);
    processBattleCommand(state, { type: 'battleEndDay' });
    expect(battle.tacticPoints.attacker).toBe(3);
    battle.tacticPoints.attacker = 1;
    const before = structuredClone(state);
    expect(processBattleCommand(state, { type: 'battleSkill', unitId: 'a', skill: 'rally' })).toBe(
      'Requires 2 tactic points.',
    );
    expect(state).toEqual(before);
    expect(battle.tacticPoints.attacker).toBe(1);
  });
});

describe('new deterministic tactics', () => {
  it('Raid supplies steals half of what it removes and cannot take more than exists', () => {
    const state = gameWithBattle();
    const battle = state.battle!;
    find(battle, 'a').x = 4;
    find(battle, 'b').x = 5;
    find(battle, 'b').y = 1;
    find(battle, 'a').y = 1;
    find(battle, 'b').troops = 3000;
    const defenderFood = battle.defenderFood;
    const attackerFood = battle.attackerFood;
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'raidSupply',
        targetId: 'b',
      }),
    ).toBeNull();
    expect(battle.defenderFood).toBe(defenderFood - 1500);
    expect(battle.attackerFood).toBe(attackerFood + 750);
    battle.defenderFood = 10;
    find(battle, 'a').acted = false;
    battle.tacticPoints.attacker = 20;
    processBattleCommand(state, {
      type: 'battleSkill',
      unitId: 'a',
      skill: 'raidSupply',
      targetId: 'b',
    });
    expect(battle.defenderFood).toBe(0);
  });

  it('Ambush needs a forest and an unmoved caster, ignores counters and hits 1.4 times as hard', () => {
    const state = gameWithBattle();
    const battle = state.battle!;
    const a = find(battle, 'a');
    a.x = 4;
    a.y = 4;
    find(battle, 'b').x = 6;
    find(battle, 'b').y = 4;
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'ambush',
        targetId: 'b',
      }),
    ).toBe('Ambush requires standing in a forest.');
    battle.terrain[at(battle, 4, 4)] = 'forest';
    a.moved = true;
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'ambush',
        targetId: 'b',
      }),
    ).toBe('Ambush requires a unit that has not moved today.');
    a.moved = false;
    const forecast = forecastSkill(battle, 'a', 'ambush', 'b')!;
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'ambush',
        targetId: 'b',
      }),
    ).toBeNull();
    const lost = 1000 - find(battle, 'b').troops;
    expect(lost).toBeGreaterThanOrEqual(forecast.min);
    expect(lost).toBeLessThanOrEqual(forecast.max);
    expect(a.troops).toBe(1000);
  });

  it('Rockfall needs a hill, ignores terrain defense and cannot hit a unit on a hill', () => {
    const state = gameWithBattle();
    const battle = state.battle!;
    const a = find(battle, 'a');
    a.x = 4;
    a.y = 4;
    a.intellect = 80;
    const b = find(battle, 'b');
    b.x = 5;
    b.y = 4;
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'rockfall',
        targetId: 'b',
      }),
    ).toBe('Rockfall requires standing on a hill.');
    battle.terrain[at(battle, 4, 4)] = 'hill';
    battle.terrain[at(battle, 5, 4)] = 'hill';
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'rockfall',
        targetId: 'b',
      }),
    ).toBe('Rockfall cannot strike a unit standing on a hill.');
    battle.terrain[at(battle, 5, 4)] = 'forest';
    const forecast = forecastSkill(battle, 'a', 'rockfall', 'b')!;
    const morale = b.morale;
    expect(
      processBattleCommand(state, {
        type: 'battleSkill',
        unitId: 'a',
        skill: 'rockfall',
        targetId: 'b',
      }),
    ).toBeNull();
    expect(1000 - b.troops).toBe(forecast.min);
    expect(b.morale).toBeLessThan(morale);
  });
});

describe('zone of control', () => {
  it('ends a path on a tile next to an enemy but lets a unit start there and leave', () => {
    const battle = battlefield(9, 5);
    battle.units = [unit('a', 'attacker', 0, 2), unit('b', 'defender', 3, 2)];
    const reach = getReachableTiles(battle, 'a');
    expect(reach).toContainEqual({ x: 2, y: 2 });
    expect(reach.some((tile) => tile.x > 2 && tile.y === 2)).toBe(false);
    expect(reach.some((tile) => tile.x >= 3 && tile.y !== 2 && tile.x !== 2)).toBe(false);
    expect(getZocStopTiles(battle, 'a')).toContainEqual({ x: 2, y: 2 });
    // Starting inside the zone, a unit may move away normally.
    find(battle, 'a').x = 2;
    expect(getReachableTiles(battle, 'a')).toContainEqual({ x: 0, y: 2 });
  });

  it('lets cavalry slip through exactly one zone tile per move', () => {
    const battle = battlefield(10, 5);
    battle.units = [unit('a', 'attacker', 0, 2), unit('b', 'defender', 3, 2)];
    battle.units[0]!.troopType = 'cavalry';
    const reach = getReachableTiles(battle, 'a');
    expect(reach).toContainEqual({ x: 2, y: 1 }); // enters the zone
    expect(reach).toContainEqual({ x: 4, y: 1 }); // slips through (3,1)
    battle.units.push(unit('c', 'defender', 5, 1));
    // (4,1) is now also in a second enemy's zone, so the path must end there.
    expect(getReachableTiles(battle, 'a').some((tile) => tile.x >= 5 && tile.y === 0)).toBe(false);
  });

  it('keeps AI routes legal when ZOC truncates a long march', () => {
    const state = gameWithBattle(stalemate());
    const battle = state.battle!;
    battle.terrain.fill('plain');
    find(battle, 'a').x = 1;
    find(battle, 'a').y = 5;
    find(battle, 'b').x = 9;
    find(battle, 'b').y = 5;
    for (let day = 0; day < 6 && !battle.outcome; day++)
      expect(processBattleCommand(state, { type: 'battleEndDay' })).toBeNull();
    const living = battle.units.filter((u) => u.troops > 0);
    expect(new Set(living.map((u) => `${u.x},${u.y}`)).size).toBe(living.length);
  });
});

describe('morale, flanking and rout', () => {
  it('derives wavering and routed from morale', () => {
    expect(moraleState({ morale: 40 })).toBe('steady');
    expect(moraleState({ morale: 39 })).toBe('wavering');
    expect(moraleState({ morale: 20 })).toBe('wavering');
    expect(moraleState({ morale: 19 })).toBe('routed');
  });

  it('wavering units hit 15% softer and cannot cast; routed units cannot attack and take 20% more', () => {
    const battle = battlefield();
    const a = find(battle, 'a');
    const b = find(battle, 'b');
    a.x = 4;
    a.y = 4;
    b.x = 5;
    b.y = 4;
    const steady = normalDamage(battle, a, b, 1);
    a.morale = 80;
    const waveringSource = { ...a, morale: 39 };
    const steadyMorale =
      normalDamage(battle, { ...a, morale: 39 }, b, 1) /
      normalDamage(battle, { ...a, morale: 40 }, b, 1);
    expect(steadyMorale).toBeLessThan(0.9); // morale factor and the wavering penalty
    expect(waveringSource.morale).toBe(39);
    const rout =
      normalDamage(battle, a, { ...b, morale: 19 }, 1) /
      normalDamage(battle, a, { ...b, morale: 20 }, 1);
    expect(rout).toBeCloseTo(1.2, 5);
    expect(steady).toBeGreaterThan(0);
    const state = gameWithBattle(battle);
    a.morale = 15;
    expect(getAttackTargets(battle, 'a')).toEqual([]);
    expect(processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'b' })).toBe(
      'Routed units can only move or hold.',
    );
    expect(getAvailableTactics(battle, 'a').every((t) => !t.allowed)).toBe(true);
    a.morale = 30;
    expect(getAvailableTactics(battle, 'a').find((t) => t.skill === 'fire')!.reason).toBe(
      'Wavering units cannot use tactics.',
    );
    a.morale = 15;
    expect(getReachableTiles(battle, 'a').length).toBeGreaterThan(0);
  });

  it('adds 10% per adjacent friendly flanker up to 30% and shows it in the forecast', () => {
    const battle = battlefield();
    const a = find(battle, 'a');
    const b = find(battle, 'b');
    a.x = 4;
    a.y = 4;
    b.x = 5;
    b.y = 4;
    expect(flankingMultiplier(battle, a, b)).toBe(1);
    const flat = forecastAttack(battle, 'a', 'b')!;
    for (const [i, [x, y]] of (
      [
        [5, 3],
        [5, 5],
        [6, 4],
        [7, 4],
      ] as const
    ).entries()) {
      const flanker = unit(`f${i}`, 'attacker', x, y);
      battle.units.push(flanker);
    }
    // (7,4) is not adjacent, so only three flankers count.
    expect(flankingMultiplier(battle, a, b)).toBeCloseTo(1.3, 10);
    battle.units.pop();
    battle.units.pop();
    battle.units.pop();
    expect(flankingMultiplier(battle, a, b)).toBeCloseTo(1.1, 10);
    expect(forecastAttack(battle, 'a', 'b')!.max).toBeGreaterThan(flat.max);
    battle.units.push(unit('g', 'attacker', 6, 4), unit('h', 'attacker', 5, 5));
    battle.units.push(unit('i', 'attacker', 5, 3));
    expect(flankingMultiplier(battle, a, b)).toBeCloseTo(1.3, 10);
  });

  it('shakes witnesses when a unit falls, never drops morale below 5, and recovers fed fresh units', () => {
    const state = gameWithBattle();
    const battle = state.battle!;
    const a = find(battle, 'a');
    const b = find(battle, 'b');
    a.x = 4;
    a.y = 4;
    b.x = 5;
    b.y = 4;
    const ally = unit('ally', 'attacker', 3, 4);
    const enemyNear = unit('e2', 'defender', 6, 4);
    const faraway = unit('far', 'defender', 11, 9);
    battle.units.push(ally, enemyNear, faraway);
    b.troops = 5;
    ally.morale = 90;
    enemyNear.morale = 12;
    processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'b' });
    expect(b.troops).toBe(0);
    // The fallen unit's comrades lose 10 morale (never below 5); its enemies gain 5.
    expect(enemyNear.morale).toBe(5);
    expect(ally.morale).toBe(95);
    expect(faraway.morale).toBe(80);
    // Undamaged, fed units regain 3 morale at day end; the one that was hit does not.
    ally.morale = 60;
    ally.hurt = false;
    a.hurt = true;
    a.morale = 60;
    processBattleCommand(state, { type: 'battleEndDay' });
    expect(ally.morale).toBe(63);
    expect(a.morale).toBe(60);
    expect(a.hurt).toBe(false);
  });
});

describe('officer capture', () => {
  const setup = (killerType: BattleUnit['troopType'], distance: number) => {
    const state = gameWithBattle();
    const battle = state.battle!;
    const a = find(battle, 'a');
    const b = find(battle, 'b');
    a.troopType = killerType;
    a.x = 4;
    a.y = 4;
    b.x = 4 + distance;
    b.y = 4;
    b.troops = 5;
    return { state, battle, a, b };
  };

  it('captures an officer felled by an adjacent normal attack', () => {
    const { state, b } = setup('infantry', 1);
    processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'b' });
    expect(b.troops).toBe(0);
    expect(b.capturedBy).toBe('attacker');
  });

  it('lets an officer felled from range escape unless he is encircled', () => {
    const escape = setup('archer', 3);
    processBattleCommand(escape.state, { type: 'battleAttack', unitId: 'a', targetId: 'b' });
    expect(escape.b.troops).toBe(0);
    expect(escape.b.capturedBy).toBeUndefined();

    const trapped = setup('archer', 3);
    trapped.battle.units.push(
      unit('n', 'attacker', 7, 3),
      unit('s', 'attacker', 7, 5),
      unit('e', 'attacker', 8, 4),
      unit('w', 'attacker', 6, 4),
    );
    trapped.b.x = 7;
    trapped.a.x = 4;
    processBattleCommand(trapped.state, { type: 'battleAttack', unitId: 'a', targetId: 'b' });
    expect(trapped.b.capturedBy).toBe('attacker');
  });

  it('treats impassable terrain and the map edge as part of an encirclement', () => {
    const { state, battle, a, b } = setup('archer', 3);
    b.x = 11;
    b.y = 0;
    a.x = 9;
    a.y = 0;
    battle.units.push(unit('e', 'attacker', 11, 1));
    battle.terrain[at(battle, 10, 0)] = 'water';
    a.troopType = 'archer';
    processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'b' });
    expect(b.capturedBy).toBe('attacker');
  });

  it('never captures the militia', () => {
    const { state, battle, a } = setup('infantry', 1);
    const militia = unit('militia-target', 'defender', 5, 5);
    militia.troops = 3;
    a.x = 5;
    a.y = 4;
    battle.units = battle.units.filter((u) => u.id !== 'b');
    battle.units.push(militia);
    processBattleCommand(state, { type: 'battleAttack', unitId: 'a', targetId: 'militia-target' });
    expect(militia.troops).toBe(0);
    expect(militia.capturedBy).toBeUndefined();
  });
});

describe('supply days, terrain profiles and walls', () => {
  it('starts desertion on the day after the committed days of food run out', () => {
    const state = gameWithBattle(stalemate());
    const battle = state.battle!;
    // 1,000 troops eat 40 a day: ten days of rations.
    battle.attackerFood = 400;
    expect(supplyDaysLeft(battle, 'attacker')).toBe(10);
    for (let day = 1; day <= 10; day++) {
      processBattleCommand(state, { type: 'battleEndDay' });
      expect(find(battle, 'a').troops, `day ${day}`).toBe(1000);
    }
    expect(supplyDaysLeft(battle, 'attacker')).toBe(0);
    processBattleCommand(state, { type: 'battleEndDay' });
    expect(find(battle, 'a').troops).toBe(880);
  });

  it('keeps both camps connected for every profile across many seeds', () => {
    for (const cityId of ['jiangxia', 'hanzhong', 'chengdu', 'luoyang']) {
      expect(['river', 'mountain', 'forest', 'plains']).toContain(battlefieldProfile(cityId));
      for (let seed = 1; seed <= 250; seed++) {
        const state = game();
        state.rng = seed * 2654435761;
        state.cities[1]!.id = cityId;
        const battle = createBattle(state, { ...order, targetId: cityId });
        const seen = new Set<number>([at(battle, 0, 5)]);
        const queue = [at(battle, 0, 5)];
        while (queue.length) {
          const index = queue.shift()!;
          const x = index % battle.width;
          const y = Math.floor(index / battle.width);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= battle.width || ny >= battle.height) continue;
            const next = at(battle, nx, ny);
            const terrain: Terrain = battle.terrain[next]!;
            if (seen.has(next) || terrain === 'water' || terrain === 'wall') continue;
            seen.add(next);
            queue.push(next);
          }
        }
        expect(seen.has(at(battle, 11, 5)), `${cityId} seed ${seed}`).toBe(true);
      }
    }
  });

  it('builds profile-specific terrain', () => {
    const count = (cityId: string, terrain: Terrain) => {
      let total = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const state = game();
        state.rng = seed * 40503;
        state.cities[1]!.id = cityId;
        state.cities[1]!.defense = 0;
        total += createBattle(state, { ...order, targetId: cityId }).terrain.filter(
          (t) => t === terrain,
        ).length;
      }
      return total;
    };
    expect(count('jiangxia', 'water')).toBeGreaterThan(count('luoyang', 'water'));
    expect(count('hanzhong', 'hill')).toBeGreaterThan(count('luoyang', 'hill'));
    expect(count('chengdu', 'forest')).toBeGreaterThan(count('luoyang', 'forest'));
  });

  it('turns column 8 into walls with a two-tile gate once the defense reaches 60', () => {
    const open = game();
    open.cities[1]!.defense = 59;
    expect(createBattle(open, order).terrain.includes('wall')).toBe(false);
    const state = game();
    state.cities[1]!.defense = 60;
    const battle = createBattle(state, order);
    for (let y = 0; y < battle.height; y++)
      expect(battle.terrain[at(battle, 8, y)]).toBe(y === 4 || y === 5 ? 'gate' : 'wall');
    // Attackers cannot enter a wall, defenders can; both can use the gate.
    battle.units = [unit('a', 'attacker', 7, 2), unit('b', 'defender', 9, 2)];
    expect(getReachableTiles(battle, 'a')).not.toContainEqual({ x: 8, y: 2 });
    expect(getReachableTiles(battle, 'b')).toContainEqual({ x: 8, y: 2 });
    battle.units = [unit('a', 'attacker', 7, 4), unit('b', 'defender', 9, 4)];
    expect(getReachableTiles(battle, 'a')).toContainEqual({ x: 8, y: 4 });
  });

  it('reduces damage on walls and gates and lets ranged fire cross them', () => {
    const battle = battlefield();
    for (let y = 0; y < battle.height; y++)
      battle.terrain[at(battle, 8, y)] = y === 4 || y === 5 ? 'gate' : 'wall';
    const attacker = unit('a', 'attacker', 7, 2);
    const onWall = unit('b', 'defender', 8, 2);
    const onPlain = unit('c', 'defender', 9, 2);
    battle.units = [attacker, onWall, onPlain];
    const wall = normalDamage(battle, attacker, onWall, 1);
    const plain = normalDamage(battle, attacker, { ...onWall, x: 9 }, 1);
    expect(wall / plain).toBeCloseTo(0.6, 2);
    const archer = { ...attacker, troopType: 'archer' as const, x: 6 };
    battle.units = [archer, onPlain];
    expect(fireDamage(battle, archer, onPlain, 1)).toBeGreaterThan(0);
    battle.units = [{ ...archer }, { ...onPlain, x: 9 }];
    expect(getAttackTargets(battle, 'a')).toContain('c');
  });
});

describe('threat overlay', () => {
  it('covers exactly the tiles enemies can hit next turn and ignores confused enemies', () => {
    const battle = battlefield(12, 3);
    battle.units = [unit('a', 'attacker', 0, 1), unit('b', 'defender', 8, 1)];
    const threat = new Set(getThreatTiles(battle, 'attacker').map((t) => `${t.x},${t.y}`));
    // b moves 3 and strikes 1: it threatens x >= 4 on the board.
    expect(threat.has('4,1')).toBe(true);
    expect(threat.has('3,1')).toBe(false);
    find(battle, 'b').troopType = 'archer';
    expect(new Set(getThreatTiles(battle, 'attacker').map((t) => `${t.x},${t.y}`)).has('2,1')).toBe(
      true,
    );
    find(battle, 'b').status = 'confused';
    expect(getThreatTiles(battle, 'attacker')).toEqual([]);
    find(battle, 'b').status = 'normal';
    find(battle, 'b').morale = 10;
    expect(getThreatTiles(battle, 'attacker')).toEqual([]);
    const own = getThreatTiles(battle, 'defender').map((t) => `${t.x},${t.y}`);
    expect(own).toContain('3,1');
  });
});

describe('tactical AI v2', () => {
  it('never casts illegally, keeps tactic points non-negative and stays deterministic', () => {
    for (let seed = 1; seed <= 24; seed++) {
      const state = game();
      state.rng = seed * 7;
      state.officers = Array.from({ length: 8 }, (_, i) => [
        {
          ...officer(`a-${i}`, 'home', 'blue'),
          intellect: 40 + i * 8,
          troopType: (['infantry', 'archer', 'cavalry', 'elite'] as const)[i % 4]!,
        },
        {
          ...officer(`b-${i}`, 'target', 'red'),
          intellect: 90 - i * 7,
          troopType: (['guard', 'archer', 'infantry', 'naval'] as const)[i % 4]!,
        },
      ]).flat();
      const army = {
        ...order,
        officerIds: state.officers.filter((o) => o.factionId === 'blue').map((o) => o.id),
      };
      state.battle = createBattle(state, army);
      const twin = structuredClone(state);
      autoResolveBattle(state);
      autoResolveBattle(twin);
      expect(state).toEqual(twin);
      expect(state.battle!.tacticPoints.attacker).toBeGreaterThanOrEqual(0);
      expect(state.battle!.tacticPoints.defender).toBeGreaterThanOrEqual(0);
      expect(state.battle!.outcome).not.toBeNull();
    }
  });

  it('settles a mirrored 6-v-6 battle quickly and decisively most of the time', () => {
    let finished = 0;
    let totalDays = 0;
    const trials = 20;
    for (let seed = 1; seed <= trials; seed++) {
      const state = game();
      state.rng = seed * 131;
      state.cities[1]!.defense = 20;
      state.officers = Array.from({ length: 6 }, (_, i) => [
        officer(`a-${i}`, 'home', 'blue'),
        officer(`b-${i}`, 'target', 'red'),
      ]).flat();
      const army = {
        ...order,
        officerIds: state.officers.filter((o) => o.factionId === 'blue').map((o) => o.id),
      };
      state.battle = createBattle(state, army);
      autoResolveBattle(state);
      totalDays += state.battle!.day;
      if (state.battle!.log.every((line) => !line.includes('siege limit'))) finished++;
    }
    expect(finished).toBeGreaterThanOrEqual(trials * 0.8);
    expect(totalDays / trials).toBeLessThan(18);
  });
});
