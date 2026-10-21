import type {
  AttackOrder,
  BattleState,
  BattleUnit,
  City,
  GameState,
  Officer,
} from '../src/game/types';

/** Hand-built two-city world and open battlefield shared by the battle-rule tests. */
export function city(id: string, factionId: string): City {
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

export function officer(id: string, cityId: string, factionId: string): Officer {
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

export const order: AttackOrder = {
  id: 'attack-1',
  factionId: 'blue',
  sourceId: 'home',
  targetId: 'target',
  officerIds: ['a'],
  food: 4000,
  intent: 'conquer',
};

export function game(): GameState {
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
    scenarioId: 'divided-realm-190',
    difficulty: 'standard',
    aiPersonalities: true,
    aging: false,
    hegemon: { factionId: null, months: 0 },
    scouted: {},
    firedEvents: [],
    invitations: [],
  };
}

export function unit(id: string, side: BattleUnit['side'], x: number, y: number): BattleUnit {
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

export function battlefield(width = 12, height = 10): BattleState {
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

export function gameWithBattle(battle = battlefield()): GameState {
  const state = game();
  state.battle = battle;
  return state;
}

export function stalemate(): BattleState {
  const battle = battlefield();
  // Two isolated land tiles. Melee units cannot cross the river or attack at a distance.
  battle.terrain.fill('water');
  for (const candidate of battle.units)
    battle.terrain[candidate.y * battle.width + candidate.x] = 'plain';
  return battle;
}
