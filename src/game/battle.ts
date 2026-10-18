import { random } from './random';
import type {
  AttackOrder,
  BattleState,
  BattleUnit,
  GameCommand,
  GameState,
  Officer,
  Terrain,
  TroopType,
} from './types';

type Side = BattleUnit['side'];
type Tile = { x: number; y: number };
const MOVEMENT: Record<TroopType, number> = {
  infantry: 3,
  cavalry: 5,
  archer: 3,
  naval: 4,
  elite: 4,
  guard: 2,
};
const RANGE: Record<TroopType, number> = {
  infantry: 1,
  cavalry: 1,
  archer: 3,
  naval: 2,
  elite: 1,
  guard: 1,
};
const DIRECTIONS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];

export function getBattleUnitRange(unit: BattleUnit): number {
  return RANGE[unit.troopType];
}
export function getBattleUnitMove(unit: BattleUnit): number {
  return MOVEMENT[unit.troopType];
}
const distance = (a: Tile, b: Tile): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const alive = (battle: BattleState, side?: Side): BattleUnit[] =>
  battle.units.filter((unit) => unit.troops > 0 && (!side || unit.side === side));
const other = (side: Side): Side => (side === 'attacker' ? 'defender' : 'attacker');
const cell = (battle: BattleState, tile: Tile): number => tile.y * battle.width + tile.x;
const terrainAt = (battle: BattleState, tile: Tile): Terrain =>
  battle.terrain[cell(battle, tile)] ?? 'plain';
const camp = (battle: BattleState, side: Side): Tile => ({
  x: side === 'attacker' ? 0 : battle.width - 1,
  y: Math.floor(battle.height / 2),
});

function log(battle: BattleState, message: string): void {
  battle.log.push(message);
  if (battle.log.length > 32) battle.log.splice(0, battle.log.length - 32);
}

function stepCost(unit: BattleUnit, terrain: Terrain): number {
  if (terrain === 'water') return unit.troopType === 'naval' ? 1 : Infinity;
  if (unit.troopType === 'naval') return 2;
  if (terrain === 'forest' || terrain === 'hill')
    return unit.troopType === 'elite' ? 1 : unit.troopType === 'cavalry' ? 3 : 2;
  return 1;
}

/** Dijkstra accounts for terrain costs and occupied squares, including friendly units. */
function paths(
  battle: BattleState,
  unit: BattleUnit,
  budget = Infinity,
): { costs: Map<number, number>; previous: Map<number, number> } {
  const start = cell(battle, unit);
  const costs = new Map<number, number>([[start, 0]]);
  const previous = new Map<number, number>();
  const pending = new Set<number>([start]);
  const blocked = new Set(
    alive(battle)
      .filter((candidate) => candidate.id !== unit.id)
      .map((candidate) => cell(battle, candidate)),
  );
  while (pending.size) {
    let current = -1;
    let cost = Infinity;
    for (const index of pending) {
      const candidate = costs.get(index) ?? Infinity;
      if (candidate < cost) {
        current = index;
        cost = candidate;
      }
    }
    if (current < 0) break;
    pending.delete(current);
    const position = { x: current % battle.width, y: Math.floor(current / battle.width) };
    for (const direction of DIRECTIONS) {
      const next = { x: position.x + direction.x, y: position.y + direction.y };
      if (next.x < 0 || next.x >= battle.width || next.y < 0 || next.y >= battle.height) continue;
      const index = cell(battle, next);
      if (blocked.has(index)) continue;
      const candidate = cost + stepCost(unit, terrainAt(battle, next));
      if (candidate > budget || candidate >= (costs.get(index) ?? Infinity)) continue;
      costs.set(index, candidate);
      previous.set(index, current);
      pending.add(index);
    }
  }
  return { costs, previous };
}

export function getReachableTiles(battle: BattleState, unitId: string): Tile[] {
  const unit = battle.units.find((candidate) => candidate.id === unitId);
  if (
    !unit ||
    unit.troops <= 0 ||
    unit.moved ||
    unit.acted ||
    unit.status === 'confused' ||
    battle.outcome
  )
    return [];
  return [...paths(battle, unit, getBattleUnitMove(unit)).costs.keys()]
    .filter((index) => index !== cell(battle, unit))
    .map((index) => ({ x: index % battle.width, y: Math.floor(index / battle.width) }));
}

export function getAttackTargets(battle: BattleState, unitId: string): string[] {
  const unit = battle.units.find((candidate) => candidate.id === unitId);
  if (!unit || unit.troops <= 0 || unit.acted || unit.status === 'confused' || battle.outcome)
    return [];
  return alive(battle, other(unit.side))
    .filter((target) => distance(unit, target) <= getBattleUnitRange(unit))
    .map((target) => target.id);
}

function checkOutcome(battle: BattleState): void {
  if (battle.outcome) return;
  if (!alive(battle, 'attacker').length) battle.outcome = 'defender';
  else if (!alive(battle, 'defender').length) battle.outcome = 'attacker';
  else {
    for (const unit of alive(battle)) {
      if (distance(unit, camp(battle, other(unit.side))) === 0) {
        battle.outcome = unit.side;
        log(battle, `${unit.name} seized the enemy camp.`);
        break;
      }
    }
  }
  if (battle.outcome)
    log(
      battle,
      `${battle.outcome === 'attacker' ? 'Attacking' : 'Defending'} army wins the battle.`,
    );
}

function makeUnit(officer: Officer, side: Side, index: number, width: number): BattleUnit {
  return {
    id: `${side}-${officer.id}`,
    officerId: officer.id,
    name: officer.name,
    side,
    x: side === 'attacker' ? 1 : width - 2,
    y: index,
    troops: officer.troops,
    initialTroops: officer.troops,
    force: officer.force,
    intellect: officer.intellect,
    troopType: officer.troopType,
    moved: false,
    acted: false,
    morale: 80,
    status: 'normal',
  };
}

/** Battlefield generation consumes the same saved RNG as combat, so reloads reproduce outcomes. */
export function createBattle(draft: GameState, order: AttackOrder): BattleState {
  const target = draft.cities.find((city) => city.id === order.targetId);
  if (!target) throw new Error('Battle destination does not exist.');
  const width = 12;
  const height = 10;
  const terrain: Terrain[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const roll = random(draft, 100);
      terrain.push(
        x === 6 && ![2, 5, 8].includes(y)
          ? 'water'
          : x <= 2 || x >= 9 || [2, 5, 8].includes(y)
            ? 'plain'
            : roll < 22
              ? 'forest'
              : roll < 38
                ? 'hill'
                : 'plain',
      );
    }
  }
  terrain[5 * width] = 'fort';
  terrain[5 * width + width - 1] = 'fort';
  const attackers = order.officerIds
    .map((id) => draft.officers.find((officer) => officer.id === id))
    .filter(
      (officer): officer is Officer =>
        !!officer &&
        !officer.captive &&
        officer.factionId === order.factionId &&
        officer.troops > 0,
    )
    .slice(0, 10)
    .map((officer, index) => makeUnit(officer, 'attacker', index, width));
  const defenders = draft.officers
    .filter(
      (officer) =>
        officer.cityId === target.id &&
        officer.factionId === target.factionId &&
        !officer.captive &&
        officer.troops > 0,
    )
    .slice(0, 10)
    .map((officer, index) => makeUnit(officer, 'defender', index, width));
  if (target.reserve > 0 && defenders.length < 10) {
    defenders.push({
      id: `defender-militia-${target.id}`,
      officerId: `militia-${target.id}`,
      name: `${target.name} garrison`,
      side: 'defender',
      x: width - 2,
      y: defenders.length,
      troops: target.reserve,
      initialTroops: target.reserve,
      force: 40 + Math.floor(target.defense / 10),
      intellect: 40,
      troopType: 'guard',
      moved: false,
      acted: false,
      morale: Math.min(95, 60 + Math.floor(target.loyalty / 3)),
      status: 'normal',
    });
  }
  const battle: BattleState = {
    id: `battle-${order.id}`,
    order: structuredClone(order),
    attackerId: order.factionId,
    defenderId: target.factionId,
    playerSide: order.factionId === draft.playerFactionId ? 'attacker' : 'defender',
    width,
    height,
    terrain,
    units: [...attackers, ...defenders],
    day: 1,
    weather: (['clear', 'rain', 'wind'] as const)[random(draft, 3)]!,
    attackerFood: Math.max(0, order.food),
    defenderFood: Math.max(0, target.food),
    log: [
      `The battle for ${target.name} begins. Capture the enemy camp or defeat every unit.`,
      'Defenders hold the city if the siege lasts 30 days.',
    ],
    outcome: null,
  };
  checkOutcome(battle);
  return battle;
}

function terrainDefense(battle: BattleState, target: BattleUnit): number {
  const terrain = terrainAt(battle, target);
  if (terrain === 'fort') return 0.65;
  if (terrain === 'hill') return 0.8;
  if (terrain === 'forest') return 0.82;
  if (terrain === 'water' && target.troopType === 'naval') return 0.82;
  return 1;
}

function matchup(source: BattleUnit, target: BattleUnit): number {
  if (source.troopType === 'cavalry' && target.troopType === 'archer') return 1.3;
  if (source.troopType === 'infantry' && target.troopType === 'cavalry') return 1.2;
  if (source.troopType === 'archer' && target.troopType === 'infantry') return 1.15;
  if (source.troopType === 'elite') return 1.15;
  return 1;
}

function damageUnit(battle: BattleState, target: BattleUnit, damage: number): number {
  const casualties = Math.min(target.troops, Math.max(1, Math.floor(damage)));
  target.troops -= casualties;
  target.morale = Math.max(
    15,
    target.morale - Math.ceil((casualties / Math.max(1, target.initialTroops)) * 45),
  );
  if (target.troops === 0) log(battle, `${target.name}'s unit was defeated.`);
  return casualties;
}

function attack(
  draft: GameState,
  battle: BattleState,
  source: BattleUnit,
  target: BattleUnit,
): void {
  const force = (source.force + 55) / (target.force + 65);
  const morale = 0.65 + source.morale / 170;
  const weather = battle.weather === 'rain' && source.troopType === 'archer' ? 0.82 : 1;
  const footing =
    source.troopType === 'cavalry' && ['forest', 'hill'].includes(terrainAt(battle, source))
      ? 0.8
      : 1;
  const guard = target.troopType === 'guard' ? 0.8 : 1;
  const inspiration = source.status === 'inspired' ? 1.2 : 1;
  const variation = (88 + random(draft, 25)) / 100;
  const casualties = damageUnit(
    battle,
    target,
    Math.max(
      20,
      source.troops *
        0.25 *
        force *
        morale *
        weather *
        footing *
        guard *
        inspiration *
        variation *
        matchup(source, target) *
        terrainDefense(battle, target),
    ),
  );
  source.acted = true;
  source.moved = true;
  log(
    battle,
    `${source.name} attacked ${target.name}: ${casualties.toLocaleString('en-US')} casualties.`,
  );
  checkOutcome(battle);
}

function skill(
  draft: GameState,
  battle: BattleState,
  source: BattleUnit,
  kind: 'fire' | 'rally' | 'confuse',
  target: BattleUnit,
): void {
  source.acted = true;
  source.moved = true;
  if (kind === 'rally') {
    target.morale = Math.min(100, target.morale + 15 + Math.floor(source.intellect / 5));
    target.status = 'inspired';
    log(battle, `${source.name} rallied ${target.name}, strengthening morale and the next attack.`);
  } else if (kind === 'confuse') {
    const chance = Math.min(90, Math.max(20, 55 + source.intellect - target.intellect));
    if (random(draft, 100) < chance) {
      target.status = 'confused';
      log(battle, `${source.name} confused ${target.name}; their next turn is lost.`);
    } else log(battle, `${target.name} saw through ${source.name}'s confusion tactic.`);
  } else {
    const weather = battle.weather === 'rain' ? 0.4 : battle.weather === 'wind' ? 1.25 : 1;
    const forest =
      terrainAt(battle, target) === 'forest'
        ? 1.4
        : terrainAt(battle, target) === 'water'
          ? 0.35
          : 1;
    const intelligence = Math.max(0.35, (source.intellect + 30) / (target.intellect + 55));
    const casualties = damageUnit(
      battle,
      target,
      Math.max(
        12,
        (source.troops * 0.22 * intelligence * weather * forest * (90 + random(draft, 21))) / 100,
      ),
    );
    log(
      battle,
      `${source.name}'s fire tactic struck ${target.name}: ${casualties.toLocaleString('en-US')} casualties${battle.weather === 'rain' ? ' (dampened by rain)' : ''}.`,
    );
  }
  checkOutcome(battle);
}

function move(battle: BattleState, unit: BattleUnit, destination: Tile): void {
  unit.x = destination.x;
  unit.y = destination.y;
  unit.moved = true;
  checkOutcome(battle);
}

/** Find an affordable prefix of a real path to firing range, so rivers never trap AI. */
function aiMove(battle: BattleState, unit: BattleUnit): void {
  if (unit.moved) return;
  const route = paths(battle, unit);
  const enemyCamp = camp(battle, other(unit.side));
  const campCost = route.costs.get(cell(battle, enemyCamp)) ?? Infinity;
  if (campCost <= getBattleUnitMove(unit)) {
    move(battle, unit, enemyCamp);
    return;
  }
  if (getAttackTargets(battle, unit.id).length) return;
  let bestCell = -1;
  let bestScore = Infinity;
  const enemies = alive(battle, other(unit.side));
  for (const [index, cost] of route.costs) {
    const tile = { x: index % battle.width, y: Math.floor(index / battle.width) };
    for (const enemy of enemies) {
      if (distance(tile, enemy) > getBattleUnitRange(unit)) continue;
      const score = cost + enemy.troops / 100000;
      if (score < bestScore) {
        bestScore = score;
        bestCell = index;
      }
    }
  }
  if (bestCell < 0) bestCell = cell(battle, enemyCamp);
  if (!route.costs.has(bestCell)) {
    unit.moved = true;
    return;
  }
  let destination = bestCell;
  while ((route.costs.get(destination) ?? Infinity) > getBattleUnitMove(unit)) {
    const previous = route.previous.get(destination);
    if (previous === undefined) return;
    destination = previous;
  }
  move(battle, unit, { x: destination % battle.width, y: Math.floor(destination / battle.width) });
}

function aiTurn(draft: GameState, battle: BattleState, side: Side): void {
  for (const unit of alive(battle, side)) {
    if (battle.outcome) break;
    if (unit.acted) continue;
    if (unit.status === 'confused') {
      unit.status = 'normal';
      unit.acted = true;
      unit.moved = true;
      log(battle, `${unit.name} lost a turn to confusion.`);
      continue;
    }
    aiMove(battle, unit);
    if (battle.outcome) break;
    const enemies = alive(battle, other(side));
    const target = enemies
      .filter((enemy) => distance(unit, enemy) <= getBattleUnitRange(unit))
      .sort((a, b) => a.troops - b.troops)[0];
    const skillTarget = enemies
      .filter((enemy) => distance(unit, enemy) <= 3)
      .sort((a, b) => a.troops - b.troops)[0];
    if (
      skillTarget &&
      unit.intellect >= 75 &&
      (unit.intellect > unit.force + 15 || !target) &&
      battle.weather !== 'rain'
    )
      skill(draft, battle, unit, 'fire', skillTarget);
    else if (target) attack(draft, battle, unit, target);
    else if (skillTarget && unit.intellect >= 85 && skillTarget.status !== 'confused')
      skill(draft, battle, unit, 'confuse', skillTarget);
    else if (unit.morale < 65) skill(draft, battle, unit, 'rally', unit);
    else {
      unit.acted = true;
      unit.moved = true;
    }
  }
}

function finishDay(draft: GameState, battle: BattleState): void {
  if (battle.outcome) return;
  for (const side of ['attacker', 'defender'] as const) {
    const soldiers = alive(battle, side).reduce((total, unit) => total + unit.troops, 0);
    const foodKey = side === 'attacker' ? 'attackerFood' : 'defenderFood';
    const consumption = Math.ceil(soldiers / 65);
    const shortage = battle[foodKey] < consumption;
    battle[foodKey] = Math.max(0, battle[foodKey] - consumption);
    if (shortage) {
      log(
        battle,
        `${side === 'attacker' ? 'Attacking' : 'Defending'} troops lack provisions and suffer desertion.`,
      );
      for (const unit of alive(battle, side)) {
        damageUnit(battle, unit, Math.max(15, unit.troops * 0.12));
        unit.morale = Math.max(15, unit.morale - 15);
      }
    }
  }
  checkOutcome(battle);
  if (battle.outcome) return;
  if (battle.day >= 30) {
    battle.outcome = 'defender';
    log(battle, 'The 30-day siege limit was reached. The defenders hold the city.');
    return;
  }
  battle.day++;
  battle.weather = (['clear', 'rain', 'wind'] as const)[random(draft, 3)]!;
  for (const unit of battle.units) {
    unit.moved = false;
    unit.acted = false;
    if (unit.status === 'inspired') unit.status = 'normal';
  }
  log(battle, `Day ${battle.day}: ${battle.weather} skies.`);
}

export function autoResolveBattle(draft: GameState): void {
  const battle = draft.battle;
  if (!battle || battle.outcome) return;
  // The 30-day limit also bounds inaccessible or stalemated battlefields.
  for (let iteration = 0; iteration < 30 && !battle.outcome; iteration++) {
    aiTurn(draft, battle, battle.playerSide);
    aiTurn(draft, battle, other(battle.playerSide));
    finishDay(draft, battle);
  }
  if (!battle.outcome) {
    battle.outcome = 'defender';
    log(battle, 'The defenders held the city through the siege.');
  }
}

/** Returns a validation error; the campaign layer discards the draft on failure. */
export function processBattleCommand(draft: GameState, command: GameCommand): string | null {
  const battle = draft.battle;
  if (draft.phase !== 'battle' || !battle) return 'There is no active battle.';
  if (battle.outcome) return 'This battle has already ended.';
  if (command.type === 'battleRetreat') {
    battle.outcome = other(battle.playerSide);
    log(battle, 'You ordered a retreat. Surviving troops withdraw from the battlefield.');
    return null;
  }
  if (command.type === 'battleAuto') {
    autoResolveBattle(draft);
    return null;
  }
  if (command.type === 'battleEndDay') {
    for (const unit of alive(battle, battle.playerSide)) {
      if (unit.status === 'confused') {
        unit.status = 'normal';
        log(battle, `${unit.name} lost a turn to confusion.`);
      }
    }
    aiTurn(draft, battle, other(battle.playerSide));
    finishDay(draft, battle);
    return null;
  }
  if (
    !['battleMove', 'battleAttack', 'battleSkill', 'battleWait'].includes(command.type) ||
    !('unitId' in command)
  )
    return 'This command is not available during a battle.';
  const unit = battle.units.find(
    (candidate) => candidate.id === command.unitId && candidate.troops > 0,
  );
  if (!unit) return 'Select an active unit.';
  if (unit.side !== battle.playerSide) return 'You can command only your own units.';
  if (unit.acted) return 'This unit has already acted today.';
  if (unit.status === 'confused')
    return 'This unit is confused and must recover at the end of the day.';
  if (command.type === 'battleMove') {
    if (unit.moved) return 'This unit has already moved today.';
    if (!Number.isInteger(command.x) || !Number.isInteger(command.y))
      return 'Choose a valid battlefield tile.';
    if (
      !getReachableTiles(battle, unit.id).some(
        (tile) => tile.x === command.x && tile.y === command.y,
      )
    )
      return 'That tile is blocked or beyond this unit’s movement range.';
    move(battle, unit, command);
    return null;
  }
  if (command.type === 'battleWait') {
    unit.moved = true;
    unit.acted = true;
    return null;
  }
  if (command.type === 'battleAttack') {
    const target = battle.units.find(
      (candidate) => candidate.id === command.targetId && candidate.troops > 0,
    );
    if (!target || target.side === unit.side) return 'Select an enemy unit.';
    if (!getAttackTargets(battle, unit.id).includes(target.id))
      return 'The enemy is outside this unit’s attack range.';
    attack(draft, battle, unit, target);
    return null;
  }
  if (command.type === 'battleSkill') {
    if (!['fire', 'rally', 'confuse'].includes(command.skill)) return 'Unknown battle tactic.';
    const target = battle.units.find(
      (candidate) =>
        candidate.id === (command.targetId ?? (command.skill === 'rally' ? unit.id : '')) &&
        candidate.troops > 0,
    );
    if (!target) return 'Choose a target for this tactic.';
    if (command.skill === 'rally' ? target.side !== unit.side : target.side === unit.side)
      return command.skill === 'rally'
        ? 'Rally requires a friendly target.'
        : 'This tactic requires an enemy target.';
    if (distance(unit, target) > 3) return 'Tactics have a range of three tiles.';
    skill(draft, battle, unit, command.skill, target);
    return null;
  }
  return 'Unknown battle command.';
}
