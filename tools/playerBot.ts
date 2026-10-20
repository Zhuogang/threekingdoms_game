import { getPersuadeChance } from '../src/game/campaign';
import { supplyFood } from '../src/game/supply';
import type { Action, GameCommand, GameState, Officer, SupplyDays } from '../src/game/types';

/**
 * A scripted, competent player used to measure balance the way a human experiences it.
 * It issues ordinary player commands once per month and auto-resolves its own battles.
 */
export interface BotStats {
  marches: number;
  marchesBySupplyDays: Record<number, number>;
  raids: number;
  sacks: number;
  ownPlunders: number;
  eligibleCityMonths: number;
  persuasions: number;
  prisonersReleased: number;
  prisonersExecuted: number;
}
export const newBotStats = (): BotStats => ({
  marches: 0,
  marchesBySupplyDays: {},
  raids: 0,
  sacks: 0,
  ownPlunders: 0,
  eligibleCityMonths: 0,
  persuasions: 0,
  prisonersReleased: 0,
  prisonersExecuted: 0,
});

type Apply = (command: GameCommand) => boolean;

const MARCH_POWER_RATIO = 1.2;
const RAID_POWER_RATIO = 1.3;
const PERSUADE_THRESHOLD = 50;

const serving = (state: GameState, cityId: string, free = false): Officer[] =>
  state.officers.filter(
    (o) =>
      o.cityId === cityId &&
      !o.captive &&
      o.fate === 'active' &&
      (free ? o.factionId === null : o.factionId === state.playerFactionId),
  );
const strengthOf = (state: GameState, cityId: string): number => {
  const city = state.cities.find((c) => c.id === cityId)!;
  return (
    city.reserve +
    state.officers
      .filter((o) => o.cityId === cityId && o.factionId === city.factionId && !o.captive)
      .reduce((sum, o) => sum + o.troops, 0)
  );
};
const power = (army: Officer[]) =>
  army.reduce((sum, o) => sum + o.troops * (0.6 + o.force / 100), 0);

export function botMonth(get: () => GameState, apply: Apply, stats: BotStats): void {
  const me = get().playerFactionId;
  for (const city0 of get().cities.filter((c) => c.factionId === me)) {
    const id = city0.id;
    // Decide the fate of prisoners first.
    for (const prisoner of get().officers.filter(
      (o) => o.captive && o.cityId === id && o.factionId !== me,
    )) {
      const adviser = serving(get(), id)
        .filter((o) => !o.busy)
        .sort((a, b) => b.intellect - a.intellect)[0];
      const chance = adviser ? (getPersuadeChance(get(), adviser.id, prisoner.id) ?? 0) : 0;
      if (adviser && chance >= PERSUADE_THRESHOLD) {
        if (
          apply({
            type: 'action',
            action: 'persuade',
            cityId: id,
            officerId: adviser.id,
            targetId: prisoner.id,
          })
        )
          stats.persuasions++;
      } else if (
        apply({ type: 'prisoner', cityId: id, prisonerId: prisoner.id, decision: 'release' })
      )
        stats.prisonersReleased++;
    }
    const state = () => get();
    const free = (action: Action, officerId: string, targetId?: string) =>
      apply({ type: 'action', action, cityId: id, officerId, targetId });
    const available = () =>
      serving(state(), id)
        .filter((o) => !o.busy)
        .sort((a, b) => b.intellect - a.intellect || a.id.localeCompare(b.id));
    // Muster every reserve soldier into the officers.
    for (const o of available()) {
      const city = state().cities.find((c) => c.id === id)!;
      const desired = Math.min(
        5000,
        o.troops + Math.max(0, city.reserve - 300),
        o.force > 80 ? 2200 : 1500,
      );
      if (desired > o.troops)
        apply({ type: 'assignTroops', cityId: id, officerId: o.id, amount: desired });
    }
    // March when the odds are good; otherwise raid a rich neighbour or fall back to development.
    const city = state().cities.find((c) => c.id === id)!;
    const army = serving(state(), id)
      .filter((o) => !o.busy && o.troops > 0 && o.stamina >= 15)
      .sort((a, b) => b.force - a.force)
      .slice(0, 10);
    const myPower = power(army);
    const enemies = city.neighbors
      .map((n) => state().cities.find((c) => c.id === n)!)
      .filter((c) => c.factionId !== me)
      .sort((a, b) => strengthOf(state(), a.id) - strengthOf(state(), b.id));
    const upkeep = Math.ceil(strengthOf(state(), id) * 0.12);
    let attacked = false;
    if (army.length && state().turn > 0) {
      const target = enemies.find(
        (c) => myPower > strengthOf(state(), c.id) * MARCH_POWER_RATIO + c.defense * 7 + 300,
      );
      const troops = army.reduce((sum, o) => sum + o.troops, 0);
      if (target) {
        const defenders = strengthOf(state(), target.id);
        // Short sieges save food; stubborn defenders deserve a longer supply line.
        const supplyDays: SupplyDays =
          myPower > defenders * 3 ? 10 : myPower < defenders * 1.8 ? 30 : 20;
        const intent =
          target.commerce + target.farming > 700 && target.factionId !== null ? 'sack' : 'conquer';
        if (
          city.food - supplyFood(troops, supplyDays) >= upkeep &&
          apply({
            type: 'march',
            sourceId: id,
            targetId: target.id,
            officerIds: army.map((o) => o.id),
            intent,
            supplyDays,
          })
        ) {
          stats.marches++;
          stats.marchesBySupplyDays[supplyDays] = (stats.marchesBySupplyDays[supplyDays] ?? 0) + 1;
          if (intent === 'sack') stats.sacks++;
          attacked = true;
        }
      } else {
        const richest = [...enemies].sort(
          (a, b) => b.commerce + b.farming - (a.commerce + a.farming),
        )[0];
        if (
          richest &&
          state().turn >= richest.plunderCooldownUntil &&
          myPower > strengthOf(state(), richest.id) * RAID_POWER_RATIO &&
          city.food - supplyFood(troops, 10) >= upkeep &&
          apply({
            type: 'march',
            sourceId: id,
            targetId: richest.id,
            officerIds: army.map((o) => o.id),
            intent: 'raid',
          })
        ) {
          stats.raids++;
          attacked = true;
        }
      }
    }
    // Persuade a strong neighbouring officer when it is likely to work.
    const adviser = available()[0];
    if (adviser && !attacked) {
      const neighbors = new Set(city.neighbors);
      const target = state()
        .officers.filter(
          (o) =>
            o.factionId !== null &&
            o.factionId !== me &&
            !o.captive &&
            o.fate === 'active' &&
            neighbors.has(o.cityId) &&
            o.troops >= 800 &&
            (getPersuadeChance(state(), adviser.id, o.id) ?? 0) >= PERSUADE_THRESHOLD,
        )
        .sort((a, b) => b.troops - a.troops)[0];
      if (target && free('persuade', adviser.id, target.id)) stats.persuasions++;
    }
    // Plunder a city that is about to fall rather than hand it over intact.
    const threat = Math.max(0, ...enemies.map((c) => strengthOf(state(), c.id)));
    stats.eligibleCityMonths++;
    if (
      threat > 1.8 * strengthOf(state(), id) &&
      city.loyalty >= 10 &&
      state().turn >= city.plunderCooldownUntil
    ) {
      const looter = available().sort((a, b) => b.intellect + b.force - (a.intellect + a.force))[0];
      if (looter && free('plunder', looter.id)) stats.ownPlunders++;
    }
    // Everyone else develops the city.
    for (const o of available()) {
      const c = state().cities.find((x) => x.id === id)!;
      let action: Action;
      if (serving(state(), id, true).length && o.intellect >= 60) action = 'search';
      else if (o.loyalty < 55 && c.gold >= 100) action = 'reward';
      else if (c.loyalty < 60) action = c.food > 1500 ? 'relieve' : 'govern';
      else if (c.food < strengthOf(state(), id) * 0.8 + 800)
        action = c.gold >= 200 ? 'buyFood' : 'farm';
      else if (c.reserve < 700 && c.population > 2500 && c.gold > 250) action = 'recruit';
      else if (c.commerce < 300 || (state().turn + o.force) % 3 === 0) action = 'commerce';
      else if (c.farming < 450 || state().turn % 3 === 1) action = 'farm';
      else if (o.troops > 0) action = 'train';
      else action = 'govern';
      free(action, o.id);
    }
  }
}
