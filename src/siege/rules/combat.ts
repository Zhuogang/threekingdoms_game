import { SIEGE_TUNING as T } from './tuning';
import { logEvent } from './events';
import { applyCombatDamage, troopDamageMultiplier } from '../../v03/battle/experience';
import type { TacticalBattleUnit } from '../../v03/battle/types';
import {
  GATES,
  RAMPS,
  SHU_ROSTER,
  WEI_ROSTER,
  cellKey,
  layoutSymbol,
  sameCell,
} from '../content/chencang';
import { INITIAL_MORALE, MIN_MORALE, ROUTED_MORALE, WAVERING_MORALE } from './constants';
import { cellTerrain, gateAt, isMapCell, isWallFoot } from './map';
import type { Cell, SiegeEngine, SiegeState, SiegeUnit } from './types';

export const activeUnit = (unit: SiegeUnit): boolean =>
  unit.troops > 0 && !unit.routed && unit.morale >= ROUTED_MORALE;
export const usableEngine = (engine: SiegeEngine): boolean =>
  !engine.wrecked && engine.durability > 0;
export const distance = (a: Cell, b: Cell): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export type ClimbingPosition = keyof typeof T.climbing;

/** Only a live ladder, filled wall foot or completed mound connects to this wall cell. */
export function climbingPosition(
  state: SiegeState,
  below: SiegeUnit,
  above: Pick<SiegeUnit, 'x' | 'y' | 'level'>,
): ClimbingPosition | null {
  if (below.side !== 'shu' || below.level !== 'ground' || above.level !== 'wall') return null;
  if (isWallFoot(state, below.x, below.y) && above.x === below.x && above.y === below.y - 1)
    return state.mounds[cellKey(below)] === T.moundComplete ? 'mound' : 'wallFoot';
  return state.engines.some(
    (engine) =>
      engine.kind === 'ladder' &&
      usableEngine(engine) &&
      sameCell(engine, below) &&
      engine.raisedAt &&
      sameCell(engine.raisedAt, above),
  )
    ? 'ladder'
    : null;
}

export function climbingFrontage(
  state: SiegeState,
  below: SiegeUnit,
  above: SiegeUnit,
): number | null {
  const position = climbingPosition(state, below, above);
  return position ? T.climbing[position].frontage : null;
}

/** Read-only UI helper, including untouched cells. */
export function wallFoothold(state: SiegeState, cell: Cell | string): number {
  return state.footholds[typeof cell === 'string' ? cell : cellKey(cell)] ?? 0;
}

export function changeFoothold(
  state: SiegeState,
  cell: Cell,
  value: number,
  reason: string,
  sourceId: string,
): void {
  const key = cellKey(cell);
  const before = wallFoothold(state, key);
  const after = Math.max(0, Math.min(T.footholdComplete, value)) as 0 | 1 | 2 | 3;
  state.footholds[key] = after;
  if (before !== after)
    logEvent(state, 'footholdChanged', { cell: key, sourceId, before, after, reason });
  if (after > 0) state.stats.firstFootholdDay ??= state.day;
}

export function siegeAttackInRange(
  state: SiegeState,
  source: SiegeUnit,
  target: SiegeUnit,
): boolean {
  if (source.level === target.level)
    return distance(source, target) <= (source.troopType === 'archer' ? T.groundArcherRange : 1);
  if (
    climbingFrontage(state, source, target) !== null ||
    climbingFrontage(state, target, source) !== null
  )
    return true;
  if (source.troopType === 'archer') {
    return (
      distance(source, target) <=
      (source.side === 'wei' && source.level === 'wall'
        ? T.wallArcherRange
        : source.side === 'shu' && source.level === 'ground' && target.level === 'wall'
          ? T.archerToWallRange
          : T.groundArcherRange)
    );
  }
  return source.side === 'wei' && source.level === 'wall' && distance(source, target) === 1;
}

export interface SiegeDamageModifiers {
  parapet: number;
  height: number;
  climbing: number;
  holdFast: number;
  gate: number;
  suppression: number;
}

export interface SiegeEngagement {
  kind: 'field' | 'volley' | 'ladder' | 'wallFoot' | 'mound' | 'gate' | 'tower' | 'height';
  frontage: number | null;
  countedTroops: number;
  modifiers: SiegeDamageModifiers;
}

export function holdFastMultiplier(state: SiegeState, target: SiegeUnit): number {
  return target.side === 'wei' &&
    target.level === 'wall' &&
    state.holdFast?.day === state.day &&
    state.holdFast.cells.some((cell) => sameCell(cell, target))
    ? T.holdFastMultiplier
    : 1;
}

function engagement(
  state: SiegeState,
  source: SiegeUnit,
  target: SiegeUnit,
  tower = false,
  counter = false,
  assault = false,
): SiegeEngagement {
  let kind: SiegeEngagement['kind'] = 'field';
  let frontage: number | null = null;
  const modifiers: SiegeDamageModifiers = {
    parapet: 1,
    height: 1,
    climbing: 1,
    holdFast: holdFastMultiplier(state, target),
    gate: 1,
    suppression: counter && source.suppressedDay === state.day ? T.suppressedCounterMultiplier : 1,
  };
  const climb = climbingPosition(state, source, target);
  if (tower) {
    kind = 'tower';
    frontage = T.towerFrontage;
  } else if (climb !== null) {
    kind = climb;
    frontage = assault ? T.climbing[climb].assaultFrontage : T.climbing[climb].frontage;
  } else if (
    source.side === 'shu' &&
    source.level === 'ground' &&
    source.troopType === 'archer' &&
    target.side === 'wei' &&
    target.level === 'wall'
  ) {
    kind = 'volley';
    frontage = T.volleyFrontage;
    modifiers.parapet = T.parapetMultiplier;
  } else if (
    source.level === 'ground' &&
    target.level === 'ground' &&
    source.troopType === 'infantry' &&
    [source, target].some((cell) => {
      const gate = gateAt(cell.x, cell.y);
      return gate !== undefined && state.gates[gate].broken;
    })
  ) {
    kind = 'gate';
    frontage = T.gateFrontage;
  } else if (source.side === 'wei' && source.level === 'wall' && target.level === 'ground') {
    kind = 'height';
    modifiers.height = 1.3;
  }
  const counterPosition = climbingPosition(state, target, source);
  if (counter && counterPosition)
    modifiers.climbing = assault
      ? T.climbing[counterPosition].assaultCounter
      : T.climbing[counterPosition].counter;
  return {
    kind,
    frontage,
    countedTroops: Math.min(source.troops, frontage ?? source.troops),
    modifiers,
  };
}

/** Field baseDamage, with frontage substituted only for the source's troop count. */
export function siegeBaseDamage(
  state: SiegeState,
  source: SiegeUnit,
  target: SiegeUnit,
  countedTroops = source.troops,
): number {
  const terrain = cellTerrain(state, target.x, target.y);
  const terrainDefense = terrain === 'hill' ? 0.8 : terrain === 'wood' ? 0.82 : 1;
  return Math.max(
    20,
    countedTroops *
      0.3 *
      ((source.force + 55) / (target.force + 65)) *
      (0.65 + source.morale / 170) *
      (source.troopType === 'archer' && target.troopType === 'infantry' ? 1.15 : 1) *
      terrainDefense *
      (source.morale < WAVERING_MORALE ? 0.85 : 1) *
      (target.routed || target.morale < ROUTED_MORALE ? 1.2 : 1),
  );
}

function damage(
  state: SiegeState,
  source: SiegeUnit,
  target: SiegeUnit,
  clash: SiegeEngagement,
): number {
  return Math.min(
    target.troops,
    Math.max(
      1,
      Math.floor(
        siegeBaseDamage(state, source, target, clash.countedTroops) *
          troopDamageMultiplier(source.troopExperience ?? 0, target.troopExperience ?? 0) *
          Object.values(clash.modifiers).reduce((product, value) => product * value, 1),
      ),
    ),
  );
}

export function moraleAfterCasualties(unit: SiegeUnit, casualties: number): number {
  const loss =
    casualties > 0
      ? Math.min(45, Math.max(1, Math.ceil((casualties / Math.max(1, unit.troops)) * 55)))
      : 0;
  return Math.max(MIN_MORALE, unit.morale - loss);
}

/** No crew roster is specified: use Zhuge Liang's command and the tuned platform frontage. */
function towerSource(state: SiegeState, engine: SiegeEngine): SiegeUnit {
  const deployedCommander = state.units.find((unit) => unit.officer.id === 'zhugeliang');
  const commander = deployedCommander ?? SHU_ROSTER[0]!;
  return {
    ...engine,
    id: engine.id,
    side: 'shu',
    level: 'ground',
    troopType: 'archer',
    troops: T.towerFrontage,
    officer: { id: engine.id, name: 'Siege tower', chinese: '井阑', portraitId: null },
    force: commander.force,
    intellect: commander.intellect,
    morale: deployedCommander?.morale ?? INITIAL_MORALE,
    wounded: 0,
    moved: false,
    acted: false,
    routed: false,
  };
}

export interface SiegeAttackForecast extends SiegeEngagement {
  sourceId: string;
  targetId: string;
  gateDamage?: number;
  footholdGain: number;
  footholdAfter: number;
  wouldMount: boolean;
  inRange: boolean;
  casualties: number;
  targetMoraleAfter: number;
  sourceMoraleAfter: number;
  counterattack: SiegeEngagement & { possible: boolean; casualties: number };
}

/** Pure forecast; accepts IDs or the corresponding state objects, and consumes no RNG. */
export function predictSiegeAttack(
  state: SiegeState,
  attacker: string | SiegeUnit | SiegeEngine,
  defender: string | SiegeUnit,
  options: { assault?: boolean } = {},
): SiegeAttackForecast | null {
  const sourceId = typeof attacker === 'string' ? attacker : attacker.id;
  const targetId = typeof defender === 'string' ? defender : defender.id;
  const engine = state.engines.find((candidate) => candidate.id === sourceId);
  const source = engine
    ? towerSource(state, engine)
    : state.units.find((unit) => unit.id === sourceId);
  if (
    !source ||
    !activeUnit(source) ||
    !isMapCell(source.x, source.y) ||
    (engine && (engine.kind !== 'tower' || !usableEngine(engine)))
  )
    return null;
  if (Object.hasOwn(GATES, targetId)) {
    const id = targetId as keyof typeof GATES;
    if (
      options.assault ||
      engine ||
      source.side !== 'shu' ||
      source.level !== 'ground' ||
      state.gates[id].broken
    )
      return null;
    // Gates have no officer statistics: use Hao Zhao's defending command attributes.
    const defender = state.units.find((unit) => unit.officer.id === 'haozhao');
    const target: SiegeUnit = {
      ...source,
      ...(defender ?? WEI_ROSTER[0]!),
      ...GATES[id].cells[0]!,
      level: 'ground',
      side: 'wei',
      morale: defender?.morale ?? INITIAL_MORALE,
      troopExperience: defender?.troopExperience ?? 0,
      routed: defender?.routed ?? false,
    };
    const inRange = GATES[id].cells.some(
      (cell) => distance(source, cell) <= (source.troopType === 'archer' ? T.groundArcherRange : 1),
    );
    const clash = engagement(state, source, target);
    clash.kind = 'gate';
    // Plan §4.5: only rams damage gates effectively; hand attacks share a 100-troop frontage.
    clash.frontage = T.gateHandFrontage;
    clash.countedTroops = Math.min(source.troops, clash.frontage);
    clash.modifiers.gate = T.gateHandMultiplier;
    return {
      ...clash,
      sourceId,
      targetId,
      inRange,
      casualties: 0,
      footholdGain: 0,
      footholdAfter: 0,
      wouldMount: false,
      gateDamage: inRange
        ? Math.min(
            state.gates[id].durability,
            Math.max(
              1,
              Math.floor(
                siegeBaseDamage(state, source, target, clash.countedTroops) *
                  troopDamageMultiplier(source.troopExperience ?? 0, target.troopExperience ?? 0) *
                  T.gateHandMultiplier,
              ),
            ),
          )
        : 0,
      targetMoraleAfter: target.morale,
      sourceMoraleAfter: source.morale,
      counterattack: { ...engagement(state, target, source), possible: false, casualties: 0 },
    };
  }
  const target = state.units.find((unit) => unit.id === targetId);
  if (
    !target ||
    source.side === target.side ||
    target.troops <= 0 ||
    !isMapCell(target.x, target.y)
  )
    return null;
  const position = climbingPosition(state, source, target);
  if (options.assault && (engine || !position)) return null;
  const tower = engine !== undefined;
  const inRange = tower
    ? distance(source, target) <= T.towerRange
    : siegeAttackInRange(state, source, target);
  const clash = engagement(state, source, target, tower, false, options.assault);
  const casualties = inRange ? damage(state, source, target, clash) : 0;
  const targetMoraleAfter = moraleAfterCasualties(target, casualties);
  const survivor = { ...target, troops: target.troops - casualties, morale: targetMoraleAfter };
  const possible =
    inRange && !tower && activeUnit(survivor) && siegeAttackInRange(state, survivor, source);
  const counter = engagement(state, survivor, source, false, true, options.assault);
  const counterCasualties = possible ? damage(state, survivor, source, counter) : 0;
  const counterMorale = moraleAfterCasualties(source, counterCasualties);
  const footholdGain =
    inRange &&
    position &&
    activeUnit({ ...source, troops: source.troops - counterCasualties, morale: counterMorale })
      ? options.assault
        ? T.climbing[position].assaultFoothold
        : T.climbing[position].foothold
      : 0;
  const footholdAfter = position
    ? Math.min(T.footholdComplete, wallFoothold(state, target) + footholdGain)
    : 0;
  return {
    ...clash,
    footholdGain,
    footholdAfter,
    wouldMount: footholdGain > 0 && footholdAfter === T.footholdComplete,
    sourceId,
    targetId,
    inRange,
    casualties,
    targetMoraleAfter,
    sourceMoraleAfter: Math.max(
      MIN_MORALE,
      counterMorale - (options.assault ? T.assaultMoraleLoss : 0),
    ),
    counterattack: { ...counter, possible, casualties: counterCasualties },
  };
}

/** Suppression is a half volley even if the archer stands at a climbing position. */
export function suppressionCasualties(
  state: SiegeState,
  actor: SiegeUnit | SiegeEngine,
  target: SiegeUnit,
): number {
  const tower = 'kind' in actor;
  const source = tower ? towerSource(state, actor) : actor;
  const clash = engagement(state, source, target, tower);
  if (!tower) {
    clash.kind = 'volley';
    clash.frontage = T.volleyFrontage;
    clash.countedTroops = Math.min(source.troops, T.volleyFrontage);
    clash.modifiers.parapet = T.parapetMultiplier;
  }
  return Math.floor(damage(state, source, target, clash) * T.suppressionDamageMultiplier);
}

/** Pure personnel calculation, including the field wounded remainder and wall retreat. */
export function inflictCasualties(
  state: SiegeState,
  target: SiegeUnit,
  casualties: number,
): SiegeUnit {
  const morale = moraleAfterCasualties(target, Math.min(target.troops, casualties));
  // The field helper only accesses these four personnel fields. Adapt its broader battle-unit type.
  const personnel = {
    troops: target.troops,
    wounded: target.wounded,
    casualtyRemainder: target.casualtyRemainder ?? 0,
    troopExperience: target.troopExperience ?? 0,
  };
  const actual = applyCombatDamage(personnel as TacticalBattleUnit, casualties);
  return settleUnitRout(state, {
    ...target,
    ...personnel,
    morale,
    lostTroopsToday: (target.lostTroopsToday ?? 0) + actual,
  });
}

/** Routed wall defenders vacate their cell and retreat up to one move toward the nearest ramp. */
export function settleUnitRout(state: SiegeState, original: SiegeUnit): SiegeUnit {
  const unit = { ...original };
  unit.routed = unit.routed || unit.morale < ROUTED_MORALE;
  if (unit.troops > 0 && !unit.routed) return unit;
  unit.moved = true;
  unit.acted = true;
  if (unit.side !== 'wei' || unit.level !== 'wall') return unit;
  if (unit.troops > 0) {
    const occupied = (cell: Cell, level: 'wall' | 'ground') =>
      state.units.some(
        (other) =>
          other.id !== unit.id &&
          other.troops > 0 &&
          other.level === level &&
          sameCell(other, cell),
      );
    const queue = [{ x: unit.x, y: unit.y, path: [] as Cell[] }];
    const seen = new Set([cellKey(unit)]);
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]!;
      const ramp = RAMPS.find((entry) => sameCell(entry.wall, current));
      if (ramp && !occupied(ramp.cells.at(-1)!, 'ground')) {
        const path = current.path;
        if (path.length < 3) Object.assign(unit, ramp.cells.at(-1)!, { level: 'ground' });
        else Object.assign(unit, path[Math.min(3, path.length) - 1]!);
        return unit;
      }
      for (const next of [
        { x: current.x, y: current.y - 1 },
        { x: current.x + 1, y: current.y },
        { x: current.x, y: current.y + 1 },
        { x: current.x - 1, y: current.y },
      ]) {
        if (
          !isMapCell(next.x, next.y) ||
          !['wall', 'gate'].includes(cellTerrain(state, next.x, next.y)) ||
          occupied(next, 'wall') ||
          seen.has(cellKey(next))
        )
          continue;
        seen.add(cellKey(next));
        queue.push({ ...next, path: [...current.path, next] });
      }
    }
  }
  // A destroyed or completely surrounded formation leaves the walkway entirely.
  return { ...unit, x: -1, y: -1, level: 'ground' };
}

/** Pure engine damage. Consumed carts are removed separately and do not count as combat losses. */
export function damageEngine(state: SiegeState, target: SiegeEngine, amount: number): SiegeState {
  if (!usableEngine(target)) return state;
  const engine = { ...target, durability: Math.max(0, target.durability - amount) };
  const result = {
    ...state,
    engines: state.engines.map((entry) => (entry.id === engine.id ? engine : entry)),
    stats: { ...state.stats },
    log: [...state.log],
  };
  if (engine.durability > 0) return result;
  result.stats.enginesLost++;
  logEvent(result, 'engineLost', {
    engineId: engine.id,
    kind: engine.kind,
    before: target.durability,
    after: 0,
    damage: amount,
  });
  engine.wrecked = true;
  engine.burning = false;
  if (state.act === 1) {
    result.enginesLostAct1 = (state.enginesLostAct1 ?? 0) + 1;
    if (result.enginesLostAct1 >= T.earlyAct2Losses) result.act2Day ??= state.day + 1;
  }
  return result;
}

/** Pure gate damage; the morale shock happens exactly once per broken gate. */
export function damageGate(state: SiegeState, id: keyof typeof GATES, amount: number): SiegeState {
  if (state.gates[id].broken) return state;
  const gate = { ...state.gates[id], durability: Math.max(0, state.gates[id].durability - amount) };
  gate.damaged = gate.durability < gate.max / 2;
  const result = { ...state, stats: { ...state.stats }, gates: { ...state.gates, [id]: gate } };
  if (gate.durability !== 0) return result;
  gate.broken = true;
  result.stats.gateEverBroken = true;
  result.units = state.units.map((unit) => (unit.side === 'wei' ? { ...unit } : unit));
  for (const unit of result.units.filter(
    (candidate) => candidate.side === 'wei' && candidate.troops > 0,
  )) {
    unit.morale = Math.max(MIN_MORALE, unit.morale - 10);
    Object.assign(unit, settleUnitRout(result, unit));
  }
  return result;
}

/** A wall run ends before towers or gate tops; cell order is deterministic. */
export function wallRun(state: SiegeState, start: Cell): Cell[] {
  if (
    !isMapCell(start.x, start.y) ||
    cellTerrain(state, start.x, start.y) !== 'wall' ||
    layoutSymbol(start.x, start.y) === 'O'
  )
    return [];
  const run: Cell[] = [{ x: start.x, y: start.y }];
  const seen = new Set([cellKey(start)]);
  for (let index = 0; index < run.length; index++) {
    const current = run[index]!;
    for (const next of [
      { x: current.x, y: current.y - 1 },
      { x: current.x + 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x - 1, y: current.y },
    ]) {
      if (
        cellTerrain(state, next.x, next.y) !== 'wall' ||
        layoutSymbol(next.x, next.y) === 'O' ||
        seen.has(cellKey(next))
      )
        continue;
      seen.add(cellKey(next));
      run.push(next);
    }
  }
  return run.sort((a, b) => a.y - b.y || a.x - b.x);
}

/** One step along the wall toward the nearest reachable ramp; forced off if none is free. */
export function displaceDefender(state: SiegeState, defender: SiegeUnit): void {
  const from = { x: defender.x, y: defender.y };
  const queue = [{ ...from, first: undefined as Cell | undefined }];
  const seen = new Set([cellKey(from)]);
  let retreat: Cell | undefined;
  for (let index = 0; index < queue.length; index++) {
    const cell = queue[index]!;
    if (cell.first && RAMPS.some((ramp) => sameCell(ramp.wall, cell))) {
      retreat = cell.first;
      break;
    }
    const neighbors = [
      { x: cell.x, y: cell.y - 1 },
      { x: cell.x + 1, y: cell.y },
      { x: cell.x, y: cell.y + 1 },
      { x: cell.x - 1, y: cell.y },
    ];
    for (const next of neighbors) {
      if (
        seen.has(cellKey(next)) ||
        !isMapCell(next.x, next.y) ||
        !['wall', 'gate'].includes(cellTerrain(state, next.x, next.y))
      )
        continue;
      seen.add(cellKey(next));
      queue.push({ ...next, first: cell.first ?? next });
    }
  }
  const moraleBefore = defender.morale;
  defender.morale = Math.max(MIN_MORALE, defender.morale - T.displacedMoraleLoss);
  if (
    retreat &&
    !state.units.some(
      (unit) =>
        unit.id !== defender.id &&
        unit.troops > 0 &&
        unit.level === 'wall' &&
        sameCell(unit, retreat),
    )
  ) {
    Object.assign(defender, retreat);
    Object.assign(defender, settleUnitRout(state, defender));
  } else {
    // With no free step toward a ramp, force the v0.1 rout retreat off the walkway.
    const routed = settleUnitRout(state, { ...defender, routed: true });
    if (routed.level === 'wall') Object.assign(routed, { x: -1, y: -1, level: 'ground' });
    Object.assign(defender, routed);
  }
  logEvent(state, 'defenderDisplaced', {
    unitId: defender.id,
    from: cellKey(from),
    to: cellKey(defender),
    level: defender.level,
    moraleBefore,
    moraleAfter: defender.morale,
  });
}

export function gainWall(
  state: SiegeState,
  source: SiegeUnit,
  wallCell: Cell,
  gain: number,
): boolean {
  if (!activeUnit(source) || gain <= 0) return false;
  changeFoothold(state, wallCell, wallFoothold(state, wallCell) + gain, 'attack', source.id);
  if (wallFoothold(state, wallCell) < T.footholdComplete) return false;
  const defender = state.units.find(
    (unit) =>
      unit.side === 'wei' && unit.troops > 0 && unit.level === 'wall' && sameCell(unit, wallCell),
  );
  if (defender) displaceDefender(state, defender);
  const from = cellKey(source);
  Object.assign(source, wallCell, { level: 'wall', moved: true, acted: true, climbing: false });
  changeFoothold(state, wallCell, 0, 'mounted', source.id);
  state.stats.firstWallDay ??= state.day;
  logEvent(state, 'wallGained', { unitId: source.id, from, cell: cellKey(wallCell) });
  return true;
}
