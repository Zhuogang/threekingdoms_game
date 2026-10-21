import { attackThreshold, policyOf } from '../src/game/aiPolicy';
import { dispatch } from '../src/game/campaign';
import { supplyFood } from '../src/game/supply';
import type { City, GameCommand, GameState, Officer } from '../src/game/types';
import { allied, HEGEMON_CAPITAL } from '../src/game/world';

/** Diagnostic player logistics use the same commands, costs and busy flags as human play. */
export const BOT_INTERIOR_RESERVE = 500;
export const BOT_MIN_HOME_OFFICERS = 1;
const BOT_FRONTIER_TARGET = 3200;
const BOT_INTERIOR_TARGET = 1800;
const BOT_MARCH_RATIO = 1.2;
const BOT_SAFE_PRESSURE = 0.75;
const BOT_JOINT_SHARE = 0.6;
const BOT_TRANSPORT_FOOD_MONTHS = 4;

export const botServing = (state: GameState, cityId: string) =>
  state.officers.filter(
    (officer) =>
      officer.cityId === cityId &&
      officer.factionId === state.playerFactionId &&
      !officer.captive &&
      officer.fate === 'active',
  );
export const botStrength = (state: GameState, city: City) =>
  city.reserve +
  state.officers
    .filter(
      (officer) =>
        officer.cityId === city.id &&
        officer.factionId === city.factionId &&
        !officer.captive &&
        officer.fate === 'active',
    )
    .reduce((sum, officer) => sum + officer.troops, 0);
export const botPower = (army: Officer[]) =>
  army.reduce((sum, officer) => sum + officer.troops * (0.6 + officer.force / 100), 0);
export const botEnemies = (state: GameState, city: City) =>
  city.neighbors
    .map((id) => state.cities.find((candidate) => candidate.id === id)!)
    .filter(
      (candidate) =>
        candidate.factionId !== state.playerFactionId &&
        !allied(state, state.playerFactionId, candidate.factionId),
    );

/** Pressure from every other border, allowing an attack to remove its own threat. */
export function botPressure(
  state: GameState,
  source: City,
  defenders: number,
  ignore?: string,
): number {
  const neighbors = botEnemies(state, source).filter(
    (city) => city.id !== ignore && city.factionId !== null,
  );
  let worst = 0;
  for (const factionId of new Set(neighbors.map((city) => city.factionId!))) {
    const powers = neighbors
      .filter((city) => city.factionId === factionId)
      .map((city) => {
        const officers = state.officers.filter(
          (officer) =>
            officer.cityId === city.id &&
            officer.factionId === factionId &&
            !officer.captive &&
            officer.fate === 'active',
        );
        return officers.length
          ? botPower(officers) +
              Math.max(0, city.reserve - 500) *
                (0.6 + Math.max(...officers.map((officer) => officer.force)) / 100)
          : 0;
      });
    const power = Math.max(
      0,
      ...powers,
      BOT_JOINT_SHARE * powers.reduce((sum, value) => sum + value, 0),
    );
    const threshold = attackThreshold(
      {
        turn: state.turn,
        factionId,
        sourceId: '',
        targetId: source.id,
        attackingPower: power,
        defendingTroops: defenders,
        defense: source.defense,
        attackingTroops: 0,
        sourceTroops: 0,
        reserve: 0,
        food: 0,
      },
      state.rivalAggression,
      state.aiPersonalities ? policyOf(factionId) : undefined,
    );
    worst = Math.max(worst, power / threshold);
  }
  return worst;
}

/** Favors the capital and cities whose capture reduces the number of hostile border links. */
export function botTargetScore(state: GameState, target: City): number {
  const neighbors = target.neighbors.map((id) => state.cities.find((city) => city.id === id)!);
  const friendly = neighbors.filter((city) => city.factionId === state.playerFactionId).length;
  const hostile = neighbors.filter(
    (city) =>
      city.factionId !== state.playerFactionId &&
      !allied(state, state.playerFactionId, city.factionId),
  ).length;
  // Alliances do not store their cause. Treat them as a coordinated threat only when
  // the player is a large realm and both allied rivals actually border that realm.
  const playerLeads =
    state.cities.filter((city) => city.factionId === state.playerFactionId).length >= 10;
  const bordersPlayer = (faction: string) =>
    state.cities.some(
      (city) =>
        city.factionId === faction &&
        city.neighbors.some(
          (id) =>
            state.cities.find((neighbor) => neighbor.id === id)?.factionId ===
            state.playerFactionId,
        ),
    );
  const coalition = playerLeads
    ? state.alliances.filter(
        (alliance) =>
          alliance.untilTurn > state.turn &&
          alliance.a !== state.playerFactionId &&
          alliance.b !== state.playerFactionId &&
          bordersPlayer(alliance.a) &&
          bordersPlayer(alliance.b),
      )
    : [];
  const member =
    target.factionId !== null &&
    coalition.some(
      (alliance) => alliance.a === target.factionId || alliance.b === target.factionId,
    );
  const memberCities = state.cities.filter((city) => city.factionId === target.factionId).length;
  return (
    (target.id === HEGEMON_CAPITAL ? 4000 : 0) +
    (friendly - hostile) * 400 +
    (member ? 1000 / Math.max(1, memberCities) : 0) -
    botStrength(state, target) * 0.1
  );
}

export interface FrontierStats {
  transfers: number;
  jointAttacks: number;
  marches: number;
  marchesBySupplyDays: Record<number, number>;
}
type Apply = (command: GameCommand) => boolean;

/** A rehearsal rejects the complete sequence before the first real order is committed. */
export function rehearseBotOrders(state: GameState, commands: GameCommand[]): boolean {
  let rehearsal = structuredClone(state);
  for (const command of commands) {
    const result = dispatch(rehearsal, command);
    if (!result.ok) return false;
    rehearsal = result.state;
  }
  return true;
}

export function prepareFrontierOrders(
  get: () => GameState,
  apply: Apply,
  stats: FrontierStats,
): Set<string> {
  const me = get().playerFactionId;
  const cities = get().cities.filter((city) => city.factionId === me);
  const depth = new Map<string, number>();
  const queue = cities.filter((city) => botEnemies(get(), city).length > 0);
  queue.forEach((city) => depth.set(city.id, 0));
  for (let index = 0; index < queue.length; index++) {
    const city = queue[index]!;
    for (const id of city.neighbors) {
      if (depth.has(id)) continue;
      const next = cities.find((candidate) => candidate.id === id);
      if (!next) continue;
      depth.set(id, depth.get(city.id)! + 1);
      queue.push(next);
    }
  }
  // Process interiors first. Busy convoys cannot move again this month.
  for (const original of [...cities].sort(
    (a, b) => (depth.get(b.id) ?? 0) - (depth.get(a.id) ?? 0) || a.id.localeCompare(b.id),
  )) {
    const distance = depth.get(original.id);
    if (!distance) continue;
    const state = get();
    const source = state.cities.find((city) => city.id === original.id)!;
    const officers = botServing(state, source.id);
    if (officers.length <= BOT_MIN_HOME_OFFICERS) continue;
    const forward = source.neighbors
      .map((id) => state.cities.find((city) => city.id === id)!)
      .filter((city) => city.factionId === me && (depth.get(city.id) ?? Infinity) < distance)
      .sort((a, b) => {
        const best = (city: City) =>
          Math.max(0, ...botEnemies(state, city).map((target) => botTargetScore(state, target)));
        return (
          depth.get(a.id)! - depth.get(b.id)! ||
          best(b) - best(a) ||
          botStrength(state, a) - botStrength(state, b) ||
          a.id.localeCompare(b.id)
        );
      })[0];
    const officer = officers
      .filter((candidate) => !candidate.busy && candidate.stamina >= 15)
      .sort(
        (a, b) =>
          b.troops + b.force * 10 - b.intellect * 2 - (a.troops + a.force * 10 - a.intellect * 2) ||
          a.id.localeCompare(b.id),
      )[0];
    if (!forward || !officer) continue;
    const upkeep = Math.ceil(botStrength(state, source) * 0.12);
    if (
      apply({
        type: 'transfer',
        sourceId: source.id,
        targetId: forward.id,
        officerId: officer.id,
        troops: Math.max(0, source.reserve - BOT_INTERIOR_RESERVE),
        gold: Math.max(0, Math.floor((source.gold - 600) / 2)),
        food: Math.max(
          0,
          Math.floor((source.food - upkeep * BOT_TRANSPORT_FOOD_MONTHS - 1500) / 2),
        ),
      })
    )
      stats.transfers++;
  }
  // Muster globally before considering a coordinated attack; no officer action is spent.
  for (const original of cities) {
    const frontline = depth.get(original.id) === 0;
    for (const officer of botServing(get(), original.id)
      .filter((candidate) => !candidate.busy)
      .sort((a, b) => b.force - a.force || a.id.localeCompare(b.id))) {
      const city = get().cities.find((candidate) => candidate.id === original.id)!;
      const desired = Math.min(
        5000,
        officer.troops + Math.max(0, city.reserve - BOT_INTERIOR_RESERVE),
        frontline ? BOT_FRONTIER_TARGET : BOT_INTERIOR_TARGET,
      );
      if (desired > officer.troops)
        apply({ type: 'assignTroops', cityId: city.id, officerId: officer.id, amount: desired });
    }
  }
  const committed = new Set<string>();
  if (get().turn === 0 || get().turn < get().truceUntilTurn) return committed;
  const targets = get()
    .cities.filter((city) => city.factionId !== me && !allied(get(), me, city.factionId))
    .sort(
      (a, b) => botTargetScore(get(), b) - botTargetScore(get(), a) || a.id.localeCompare(b.id),
    );
  for (const original of targets) {
    const state = get();
    const target = state.cities.find((city) => city.id === original.id)!;
    const threshold = botStrength(state, target) * BOT_MARCH_RATIO + target.defense * 7 + 300;
    const sources = state.cities.filter(
      (city) =>
        city.factionId === me && city.neighbors.includes(target.id) && !committed.has(city.id),
    );
    const parts = sources
      .map((city) => {
        const officers = botServing(state, city.id);
        const ready = officers
          .filter((officer) => !officer.busy && officer.troops > 0 && officer.stamina >= 15)
          .sort((a, b) => b.force - a.force || a.id.localeCompare(b.id));
        const total = botStrength(state, city);
        const army: Officer[] = [];
        let troops = 0;
        for (const officer of ready) {
          if (
            army.length >= 10 ||
            army.length + BOT_MIN_HOME_OFFICERS >= officers.length ||
            troops + officer.troops > total * BOT_JOINT_SHARE
          )
            continue;
          army.push(officer);
          troops += officer.troops;
        }
        return { city, army, troops, power: botPower(army) };
      })
      .filter(
        (part) =>
          part.army.length > 0 &&
          part.city.food - supplyFood(part.troops, 20) >=
            Math.ceil(botStrength(state, part.city) * 0.12) &&
          botPressure(state, part.city, botStrength(state, part.city) - part.troops, target.id) <=
            BOT_SAFE_PRESSURE,
      );
    if (parts.length < 2 || parts.some((part) => part.power > threshold)) continue;
    // Pick the smallest sufficient pair; never lock additional cities into the same target.
    let pair: typeof parts = [];
    for (let a = 0; a < parts.length && !pair.length; a++)
      for (let b = a + 1; b < parts.length; b++)
        if (parts[a]!.power + parts[b]!.power > threshold) {
          pair = [parts[a]!, parts[b]!];
          break;
        }
    if (!pair.length) continue;
    const commands: GameCommand[] = pair.map((part) => ({
      type: 'march',
      sourceId: part.city.id,
      targetId: target.id,
      officerIds: part.army.map((officer) => officer.id),
      supplyDays: 20,
      intent: 'conquer',
    }));
    if (!rehearseBotOrders(state, commands)) continue;
    for (const command of commands) {
      if (!apply(command)) throw new Error('A rehearsed bot order unexpectedly failed.');
      if (command.type === 'march') committed.add(command.sourceId);
      stats.marches++;
      stats.marchesBySupplyDays[20] = (stats.marchesBySupplyDays[20] ?? 0) + 1;
    }
    stats.jointAttacks++;
  }
  return committed;
}
