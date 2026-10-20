import { attackThreshold, policyOf } from '../src/game/aiPolicy';
import { getPersuadeChance } from '../src/game/campaign';
import { PLUNDER_MIN_SUPPORT } from '../src/game/plunder';
import { supplyFood } from '../src/game/supply';
import type { Action, City, GameCommand, GameState, Officer, SupplyDays } from '../src/game/types';
import { allied } from '../src/game/world';

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
  /** Months in which a city stayed home because a stronger enemy borders it. */
  heldByThreat: number;
  /** The bot's memory: turn of each city's last own-city plunder. */
  lastOwnPlunder: Record<string, number>;
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
  heldByThreat: 0,
  lastOwnPlunder: {},
});

type Apply = (command: GameCommand) => boolean;

const MARCH_POWER_RATIO = 1.2;
const RAID_POWER_RATIO = 1.3;
const PERSUADE_THRESHOLD = 50;
/** Share of a city's strength that must stay home (the same rule as AI_JOINT_COMMIT). */
const GARRISON_SHARE = 0.4;
/** Late in the game, or when far ahead of every neighbour, the bot keeps a thinner garrison. */
const OFFENSIVE_GARRISON_SHARE = 0.25;
const OFFENSIVE_FROM_TURN = 24;
const OFFENSIVE_LEAD = 2;
/** Sack only when support stays at least this high after it is halved. */
const SACK_MIN_SUPPORT_AFTER = 30;
const OWN_PLUNDER_INTERVAL = 12;
/** Treat a rival as able to strike once it has this share of the power it needs. */
const SAFETY = 0.75;

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
/** Share of each city's army an AI joint attack commits (AI_JOINT_COMMIT). */
const JOINT_COMMIT = 0.6;
/** Attacking power the owner of `cityId` could field from it once it musters its reserve. */
const enemyPower = (state: GameState, cityId: string): number => {
  const city = state.cities.find((c) => c.id === cityId)!;
  const officers = state.officers.filter(
    (o) =>
      o.cityId === cityId && o.factionId === city.factionId && !o.captive && o.fate === 'active',
  );
  if (!officers.length) return 0;
  const bestForce = Math.max(...officers.map((o) => o.force));
  return power(officers) + Math.max(0, city.reserve - 500) * (0.6 + bestForce / 100);
};

/**
 * 
ormal plays to win; 	urtle (review R6) never marches, raids or sacks, but musters,
 * recruits, develops and decides prisoners like the normal bot.
 */
export type BotMode = 'normal' | 'turtle';

export function botMonth(
  get: () => GameState,
  apply: Apply,
  stats: BotStats,
  mode: BotMode = 'normal',
): void {
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
    const home = strengthOf(state(), id);
    const enemies = city.neighbors
      .map((n) => state().cities.find((c) => c.id === n)!)
      .filter((c) => c.factionId !== me && !allied(state(), me, c.factionId))
      .sort((a, b) => strengthOf(state(), a.id) - strengthOf(state(), b.id));
    const hostile = enemies.filter((c) => c.factionId !== null);
    // How far each bordering rival's best single or joint attack exceeds the AI's attack
    // threshold against `defenders` soldiers (above 1: it can march on this city).
    // `ignore` leaves out the city the bot is about to attack.
    const pressure = (defenders: number, ignore?: string): number => {
      let worst = 0;
      for (const factionId of new Set(hostile.map((c) => c.factionId!))) {
        const powers = hostile
          .filter((c) => c.factionId === factionId && c.id !== ignore)
          .map((c) => enemyPower(state(), c.id));
        const attack = Math.max(0, ...powers, JOINT_COMMIT * powers.reduce((a, b) => a + b, 0));
        const threshold = attackThreshold(
          {
            turn: state().turn,
            factionId,
            sourceId: '',
            targetId: id,
            attackingPower: attack,
            defendingTroops: defenders,
            defense: city.defense,
            attackingTroops: 0,
            sourceTroops: 0,
            reserve: 0,
            food: 0,
          },
          state().rivalAggression,
          policyOf(factionId),
        );
        worst = Math.max(worst, attack / threshold);
      }
      return worst;
    };
    // Keep a garrison: one officer and 40% of the city's strength stay home, and a city
    // bordering a stronger enemy does not march at all.
    const threatened = hostile.some((c) => strengthOf(state(), c.id) > home);
    if (threatened) stats.heldByThreat++;
    const strongestNeighbour = Math.max(0, ...hostile.map((c) => strengthOf(state(), c.id)));
    const offensive =
      state().turn >= OFFENSIVE_FROM_TURN || home > OFFENSIVE_LEAD * strongestNeighbour;
    const garrisonShare = offensive ? OFFENSIVE_GARRISON_SHARE : GARRISON_SHARE;
    const army: Officer[] = [];
    if (!threatened) {
      const ready = serving(state(), id)
        .filter((o) => !o.busy && o.troops > 0 && o.stamina >= 15)
        .sort((a, b) => b.force - a.force || a.id.localeCompare(b.id));
      const officers = serving(state(), id).length;
      let committed = 0;
      for (const o of ready.slice(0, 10)) {
        if (army.length + 1 >= officers) break;
        if (committed + o.troops > home * (1 - garrisonShare)) continue;
        army.push(o);
        committed += o.troops;
      }
    }
    const garrison = home - army.reduce((sum, o) => sum + o.troops, 0);
    // The garrison left behind must not invite an attack from any other neighbour.
    const exposed = (target: City) => pressure(garrison, target.id) > SAFETY;
    const myPower = power(army);
    const upkeep = Math.ceil(home * 0.12);
    let attacked = false;
    if (army.length && state().turn > 0 && mode !== 'turtle') {
      const target = enemies.find(
        (c) =>
          myPower > strengthOf(state(), c.id) * MARCH_POWER_RATIO + c.defense * 7 + 300 &&
          !exposed(c),
      );
      const troops = army.reduce((sum, o) => sum + o.troops, 0);
      if (target) {
        const defenders = strengthOf(state(), target.id);
        // Short sieges save food; stubborn defenders deserve a longer supply line.
        const supplyDays: SupplyDays =
          myPower > defenders * 3 ? 10 : myPower < defenders * 1.8 ? 30 : 20;
        // Sacking halves support; only sack a rich city that stays governable afterwards.
        const intent =
          target.commerce + target.farming > 700 &&
          target.factionId !== null &&
          Math.floor(target.loyalty / 2) >= SACK_MIN_SUPPORT_AFTER &&
          state().turn >= target.plunderCooldownUntil
            ? 'sack'
            : 'conquer';
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
          !exposed(richest) &&
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
    // Plunder a city only when it would otherwise fall this month: a rival can strike with
    // twice the power it needs. At most once per city per year.
    stats.eligibleCityMonths++;
    const doomed = pressure(strengthOf(state(), id)) > 2;
    const last = stats.lastOwnPlunder[id];
    if (
      doomed &&
      !attacked &&
      city.loyalty >= PLUNDER_MIN_SUPPORT &&
      state().turn >= city.plunderCooldownUntil &&
      (last === undefined || state().turn - last >= OWN_PLUNDER_INTERVAL)
    ) {
      const looter = available().sort((a, b) => b.intellect + b.force - (a.intellect + a.force))[0];
      if (looter && free('plunder', looter.id)) {
        stats.ownPlunders++;
        stats.lastOwnPlunder[id] = state().turn;
      }
    }
    // Everyone else develops the city. A border city that a neighbour could take first
    // recruits until no neighbour can strike it.
    let searched = false;
    for (const o of available()) {
      const c = state().cities.find((x) => x.id === id)!;
      const atRisk = threatened || pressure(strengthOf(state(), id)) > SAFETY;
      const canRecruit = c.population > 2500 && c.gold >= 150;
      let action: Action;
      if (!searched && serving(state(), id, true).length && o.intellect >= 60) {
        action = 'search';
        searched = true;
      } else if (o.loyalty < 55 && c.gold >= 100) action = 'reward';
      // Unrest starts below 30 support; keep a margin above it.
      else if (c.loyalty < 40) action = c.food > 1500 ? 'relieve' : 'govern';
      else if (c.food < strengthOf(state(), id) * 0.8 + 800)
        action = c.gold >= 200 ? 'buyFood' : 'farm';
      else if (atRisk && canRecruit) action = 'recruit';
      else if (hostile.length && c.reserve < 1500 && canRecruit) action = 'recruit';
      else if (c.loyalty < 60) action = c.food > 1500 ? 'relieve' : 'govern';
      else if (c.reserve < 700 && canRecruit) action = 'recruit';
      // Surplus gold is worth more as soldiers than in the treasury.
      else if (c.gold >= 2000 && c.reserve < 3000 && canRecruit) action = 'recruit';
      else if (c.commerce < 300 || (state().turn + o.force) % 3 === 0) action = 'commerce';
      else if (c.farming < 450 || state().turn % 3 === 1) action = 'farm';
      else if (o.troops > 0) action = 'train';
      else action = 'govern';
      free(action, o.id);
    }
  }
}
