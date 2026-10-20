import { FACTIONS } from '../content/scenario';
import { random, addLog } from './random';
import { recordMonthlyEvent } from './reports';
import type { CampaignObserver } from './aiPolicy';
import type { City, GameState, Officer } from './types';
import {
  RESOURCE_CAP,
  allied,
  applyPlunder,
  bounded,
  chooseGovernor,
  factionName,
  serving,
  strength,
} from './world';
import { isActiveOfficer } from './officers';

/**
 * Data-driven events. A historical event fires only when every one of its conditions
 * holds in *this* game (design decision D10): nothing is forced. Systemic events add
 * everyday texture and roll a monthly chance once their conditions are met.
 */
export type EventCondition =
  | { kind: 'yearAtMost'; year: number }
  | { kind: 'cityHeldBy'; city: string; faction: string }
  | { kind: 'otherActiveFactions'; except: string; min: number }
  | { kind: 'cityAttackedOrThreatened'; city: string; months: number; ratio: number }
  | { kind: 'monthIn'; months: number[] };

export type SystemicEffect =
  | 'plague'
  | 'bumperHarvest'
  | 'locusts'
  | 'bandits'
  | 'wanderingOfficer'
  | 'comeOfAge'
  | 'festival'
  | 'drought'
  | 'scholar';
export type EventEffect =
  | { kind: 'coalition'; against: string }
  | { kind: 'burnCity'; city: string; retreatTo: string }
  | { kind: 'systemic'; effect: SystemicEffect };

export interface GameEventDef {
  id: string;
  once: boolean;
  /** Percent chance per month, rolled only after the conditions hold. */
  chance?: number;
  conditions: EventCondition[];
  effect: EventEffect;
}

export const EVENTS: readonly GameEventDef[] = [
  {
    id: 'anti-dong-coalition',
    once: true,
    conditions: [
      { kind: 'yearAtMost', year: 191 },
      { kind: 'cityHeldBy', city: 'luoyang', faction: 'dong' },
      { kind: 'otherActiveFactions', except: 'dong', min: 3 },
    ],
    effect: { kind: 'coalition', against: 'dong' },
  },
  {
    id: 'dong-burns-luoyang',
    once: true,
    conditions: [
      { kind: 'cityHeldBy', city: 'luoyang', faction: 'dong' },
      { kind: 'cityHeldBy', city: 'changan', faction: 'dong' },
      { kind: 'cityAttackedOrThreatened', city: 'luoyang', months: 2, ratio: 1.8 },
    ],
    effect: { kind: 'burnCity', city: 'luoyang', retreatTo: 'changan' },
  },
  { id: 'plague', once: false, chance: 3, conditions: [], effect: sys('plague') },
  {
    id: 'bumper-harvest',
    once: false,
    chance: 12,
    conditions: [{ kind: 'monthIn', months: [9, 10] }],
    effect: sys('bumperHarvest'),
  },
  {
    id: 'locusts',
    once: false,
    chance: 6,
    conditions: [{ kind: 'monthIn', months: [6, 7, 8] }],
    effect: sys('locusts'),
  },
  { id: 'bandits', once: false, chance: 4, conditions: [], effect: sys('bandits') },
  {
    id: 'wandering-officer',
    once: false,
    chance: 5,
    conditions: [],
    effect: sys('wanderingOfficer'),
  },
  {
    id: 'come-of-age',
    once: false,
    conditions: [{ kind: 'monthIn', months: [1] }],
    effect: sys('comeOfAge'),
  },
  {
    id: 'festival',
    once: false,
    chance: 8,
    conditions: [{ kind: 'monthIn', months: [1, 2] }],
    effect: sys('festival'),
  },
  {
    id: 'drought',
    once: false,
    chance: 4,
    conditions: [{ kind: 'monthIn', months: [6, 7, 8] }],
    effect: sys('drought'),
  },
  { id: 'scholar', once: false, chance: 3, conditions: [], effect: sys('scholar') },
];
function sys(effect: SystemicEffect): EventEffect {
  return { kind: 'systemic', effect };
}

const COALITION_MONTHS = 6;
const INVITATION_MONTHS = 3;

function activeFactionIds(state: GameState): string[] {
  return FACTIONS.map((f) => f.id).filter((id) => state.cities.some((c) => c.factionId === id));
}

function recentlyAttacked(state: GameState, cityId: string, defenderId: string): boolean {
  // The pending report covers this month, the published one last month.
  return [state.reports.pending, state.reports.latest].some((report) =>
    report?.events.some(
      (event) =>
        (event.kind === 'battle' && event.targetId === cityId && event.attackerId !== defenderId) ||
        (event.kind === 'raid' && event.cityId === cityId && event.attackerId !== defenderId),
    ),
  );
}

export function conditionHolds(state: GameState, condition: EventCondition): boolean {
  switch (condition.kind) {
    case 'yearAtMost':
      return state.year <= condition.year;
    case 'cityHeldBy':
      return state.cities.find((c) => c.id === condition.city)?.factionId === condition.faction;
    case 'otherActiveFactions':
      return (
        activeFactionIds(state).filter((id) => id !== condition.except).length >= condition.min
      );
    case 'monthIn':
      return condition.months.includes(state.month);
    case 'cityAttackedOrThreatened': {
      const city = state.cities.find((c) => c.id === condition.city);
      if (!city?.factionId) return false;
      if (recentlyAttacked(state, city.id, city.factionId)) return true;
      const own = strength(state, city);
      const strongestNeighbor = Math.max(
        0,
        ...city.neighbors
          .map((id) => state.cities.find((c) => c.id === id)!)
          .filter(
            (c) =>
              c.factionId !== null &&
              c.factionId !== city.factionId &&
              !allied(state, city.factionId!, c.factionId),
          )
          .map((c) => strength(state, c)),
      );
      return strongestNeighbor > condition.ratio * own;
    }
  }
}

/** Pure: every condition of an event holds right now. */
export function eventIsEligible(state: GameState, event: GameEventDef): boolean {
  if (event.once && state.firedEvents.includes(event.id)) return false;
  return event.conditions.every((condition) => conditionHolds(state, condition));
}

const isPlayersCity = (state: GameState, city: City) => city.factionId === state.playerFactionId;
const mood = (state: GameState, city: City) => (isPlayersCity(state, city) ? 'bad' : 'event');

/** A random city (stable order, one saved-RNG draw) among those matching `filter`. */
function pickCity(state: GameState, filter: (city: City) => boolean): City | undefined {
  const pool = state.cities.filter(filter).sort((a, b) => a.id.localeCompare(b.id));
  return pool.length ? pool[random(state, pool.length)] : undefined;
}

function applySystemic(state: GameState, effect: SystemicEffect): void {
  const owned = (city: City) => city.factionId !== null;
  switch (effect) {
    case 'plague': {
      const city = pickCity(state, owned);
      if (!city) return;
      const dead = Math.floor(city.population * 0.08);
      city.population = bounded(city.population - dead, RESOURCE_CAP, 500);
      city.loyalty = bounded(city.loyalty - 3, 100);
      addLog(
        state,
        `A plague sweeps through ${city.name}: ${dead.toLocaleString('en-US')} people perish.`,
        mood(state, city),
      );
      return;
    }
    case 'bumperHarvest': {
      const city = pickCity(state, owned);
      if (!city) return;
      const gain = Math.floor(city.farming * 5);
      city.food = bounded(city.food + gain, RESOURCE_CAP);
      addLog(
        state,
        `A bumper harvest fills the granaries of ${city.name} with ${gain.toLocaleString('en-US')} extra food.`,
        'good',
      );
      return;
    }
    case 'locusts': {
      const city = pickCity(state, owned);
      if (!city) return;
      const loss = Math.floor(city.food * 0.25);
      city.food -= loss;
      addLog(
        state,
        `Locusts devour ${loss.toLocaleString('en-US')} food in ${city.name}.`,
        mood(state, city),
      );
      return;
    }
    case 'bandits': {
      const city = pickCity(state, owned);
      if (!city) return;
      const stolen = Math.floor(city.gold * 0.12);
      city.gold -= stolen;
      city.reserve = Math.floor(city.reserve * 0.94);
      city.loyalty = bounded(city.loyalty - 2, 100);
      addLog(
        state,
        `Bandits plunder ${city.name}, carrying off ${stolen.toLocaleString('en-US')} gold.`,
        mood(state, city),
      );
      return;
    }
    case 'wanderingOfficer': {
      const free = state.officers
        .filter((o) => o.factionId === null && !o.captive && isActiveOfficer(o))
        .sort((a, b) => a.id.localeCompare(b.id));
      if (!free.length) return;
      const officer = free[random(state, free.length)]!;
      const destination = pickCity(state, (c) => c.id !== officer.cityId);
      if (!destination) return;
      officer.cityId = destination.id;
      addLog(
        state,
        `${officer.name} wanders into ${destination.name}, looking for a lord worth serving.`,
        'event',
      );
      return;
    }
    case 'comeOfAge': {
      for (const officer of state.officers) {
        if (officer.age !== 18 || !isActiveOfficer(officer)) continue;
        officer.force = bounded(officer.force + 3, officer.equipment ? 105 : 100);
        officer.intellect = bounded(officer.intellect + 2, 100);
        addLog(state, `${officer.name} comes of age: +3 force and +2 intellect.`, 'event');
      }
      return;
    }
    case 'festival': {
      const city = pickCity(state, (c) => owned(c) && c.gold >= 150);
      if (!city) return;
      city.gold -= 150;
      city.loyalty = bounded(city.loyalty + 6, 100);
      addLog(state, `A festival in ${city.name} lifts the people's spirits.`, 'good');
      return;
    }
    case 'drought': {
      const city = pickCity(state, (c) => owned(c) && c.farming > 100);
      if (!city) return;
      city.farming = bounded(city.farming - 15, 999, 100);
      addLog(
        state,
        `Drought withers the fields of ${city.name}: farming falls by 15.`,
        mood(state, city),
      );
      return;
    }
    case 'scholar': {
      const pool = state.officers
        .filter(
          (o) => o.factionId !== null && !o.captive && isActiveOfficer(o) && o.intellect < 100,
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      if (!pool.length) return;
      const officer = pool[random(state, pool.length)]!;
      officer.intellect += 1;
      addLog(state, `A visiting scholar tutors ${officer.name}: +1 intellect.`, 'event');
      return;
    }
  }
}

function formCoalition(state: GameState, against: string, observer?: CampaignObserver): void {
  const members = activeFactionIds(state).filter(
    (id) => id !== against && id !== state.playerFactionId,
  );
  for (let i = 0; i < members.length; i++)
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i]!;
      const b = members[j]!;
      const existing = state.alliances.find(
        (p) => (p.a === a && p.b === b) || (p.a === b && p.b === a),
      );
      if (existing) existing.untilTurn = state.turn + COALITION_MONTHS;
      else state.alliances.push({ a, b, untilTurn: state.turn + COALITION_MONTHS });
    }
  addLog(
    state,
    `The lords of the realm raise a coalition against ${factionName(against)}.`,
    against === state.playerFactionId ? 'bad' : 'diplomacy',
  );
  recordMonthlyEvent(state, {
    kind: 'coalition',
    leaderId: against,
    involvesPlayer: against === state.playerFactionId,
  });
  observer?.coalition?.({ leaderId: against });
  if (against !== state.playerFactionId && members.length) {
    state.invitations.push({
      id: `invitation-${state.nextId++}`,
      eventId: 'anti-dong-coalition',
      targetId: against,
      members,
      untilTurn: state.turn + INVITATION_MONTHS,
    });
    addLog(
      state,
      `You are invited to join the coalition against ${factionName(against)}.`,
      'diplomacy',
    );
  }
}

function burnCity(state: GameState, cityId: string, retreatId: string): void {
  const city = state.cities.find((c) => c.id === cityId)!;
  const refuge = state.cities.find((c) => c.id === retreatId)!;
  const garrison = serving(state, city);
  const leader = [...garrison].sort(
    (a: Officer, b: Officer) =>
      b.intellect + b.force - (a.intellect + a.force) || a.id.localeCompare(b.id),
  )[0];
  const gains = applyPlunder(state, city, refuge, leader ?? { intellect: 60, force: 60 });
  for (const officer of garrison) officer.cityId = refuge.id;
  refuge.reserve = bounded(refuge.reserve + city.reserve, RESOURCE_CAP);
  city.reserve = 0;
  chooseGovernor(state, city);
  chooseGovernor(state, refuge);
  addLog(
    state,
    `${factionName(refuge.factionId)} burns ${city.name} and withdraws to ${refuge.name} with ${gains.gold.toLocaleString('en-US')} gold and ${gains.food.toLocaleString('en-US')} food.`,
    'military',
  );
}

/** Run every eligible event once per month. Draws RNG only for chance events whose conditions hold. */
export function runEvents(state: GameState, observer?: CampaignObserver): void {
  for (const event of EVENTS) {
    if (!eventIsEligible(state, event)) continue;
    if (event.chance !== undefined && random(state, 100) >= event.chance) continue;
    if (event.effect.kind === 'coalition') formCoalition(state, event.effect.against, observer);
    else if (event.effect.kind === 'burnCity')
      burnCity(state, event.effect.city, event.effect.retreatTo);
    else applySystemic(state, event.effect.effect);
    if (event.once) state.firedEvents.push(event.id);
  }
}

/** Accepting an invitation allies the player with every member of the coalition. */
export function answerInvitation(state: GameState, id: string, accept: boolean): string | null {
  const index = state.invitations.findIndex((invitation) => invitation.id === id);
  if (index < 0) return 'That invitation is no longer open.';
  const invitation = state.invitations[index]!;
  state.invitations.splice(index, 1);
  if (!accept) {
    addLog(state, 'You decline the invitation to join the coalition.', 'diplomacy');
    return null;
  }
  for (const member of invitation.members) {
    if (
      !state.cities.some((c) => c.factionId === member) ||
      allied(state, state.playerFactionId, member)
    )
      continue;
    state.alliances = state.alliances.filter(
      (p) =>
        !(
          (p.a === state.playerFactionId && p.b === member) ||
          (p.b === state.playerFactionId && p.a === member)
        ),
    );
    state.alliances.push({
      a: state.playerFactionId,
      b: member,
      untilTurn: state.turn + COALITION_MONTHS,
    });
  }
  addLog(state, 'You join the coalition; its lords pledge six months of peace to you.', 'good');
  return null;
}
