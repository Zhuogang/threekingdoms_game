import { FACTIONS, INITIAL_CITIES, INITIAL_OFFICERS } from '../content/scenario';
import { autoResolveBattle, createBattle, processBattleCommand } from './battle';
import { addLog, random } from './random';
import type {
  Action,
  ActionInfo,
  AttackOrder,
  City,
  CommandResult,
  GameCommand,
  GameState,
  Officer,
} from './types';

/** The atlas rules preserve Baye's turn structure, with explicit modern balance. */
const ACTIONS: Record<Action, Omit<ActionInfo, 'reason'>> = {
  farm: {
    label: 'Develop farms',
    description:
      'Immediately improve farming by intellect × effort. Farms generate food every month. Maximum 999.',
    gold: 100,
    stamina: 20,
  },
  commerce: {
    label: 'Encourage trade',
    description: 'Improve commerce and monthly tax income. Maximum 999.',
    gold: 100,
    stamina: 20,
  },
  govern: {
    label: 'Restore order',
    description: 'Increase public support and strengthen the city defenses.',
    gold: 80,
    stamina: 15,
  },
  search: {
    label: 'Search for talent',
    description:
      'Seek an unaffiliated officer in this city. Intelligence improves the chance of recruitment.',
    gold: 60,
    stamina: 15,
  },
  recruit: {
    label: 'Recruit soldiers',
    description:
      'Recruit 300 + 5 × force soldiers into the reserve. Recruits come from the city population.',
    gold: 150,
    stamina: 20,
  },
  train: {
    label: 'Drill troops',
    description:
      'Gain 25 experience and improve this officer’s force by 1. Requires assigned troops.',
    gold: 80,
    stamina: 25,
  },
  reward: {
    label: 'Bestow a reward',
    description: 'Give this officer 15 loyalty. Loyalty protects officers from persuasion.',
    gold: 100,
    stamina: 5,
  },
  feast: {
    label: 'Hold a feast',
    description:
      'All serving officers here gain 8 loyalty and 10 stamina. The host spends their monthly action.',
    gold: 180,
    stamina: 10,
  },
  buyFood: {
    label: 'Buy provisions',
    description: 'Buy 800 food for 100 gold.',
    gold: 100,
    stamina: 10,
  },
  sellFood: {
    label: 'Sell provisions',
    description: 'Sell 800 food for 80 gold.',
    gold: 0,
    stamina: 10,
  },
  relieve: {
    label: 'Relieve the people',
    description: 'Spend 600 food and 80 gold to gain 15 public support and 300 population.',
    gold: 80,
    stamina: 15,
  },
  scout: {
    label: 'Reconnaissance',
    description: 'Report a neighboring city’s army, reserves, defenses, and provisions.',
    gold: 40,
    stamina: 10,
  },
  persuade: {
    label: 'Persuade an officer',
    description:
      'Recruit a local free officer or prisoner, or an enemy officer in a neighboring city. Intelligence and target loyalty determine success.',
    gold: 120,
    stamina: 20,
  },
  subvert: {
    label: 'Sow dissent',
    description: 'Reduce a neighboring enemy city’s support and its officers’ loyalty.',
    gold: 150,
    stamina: 20,
  },
  alliance: {
    label: 'Negotiate alliance',
    description: 'Propose six months of peace to another ruler. Intelligence improves the chance.',
    gold: 200,
    stamina: 20,
  },
  equip: {
    label: 'Issue fine arms',
    description: 'Give this officer fine arms: +5 force until confiscated.',
    gold: 180,
    stamina: 10,
  },
  confiscate: {
    label: 'Confiscate equipment',
    description:
      'Sell this officer’s fine arms for 100 gold. Lose the +5 force bonus and 12 loyalty.',
    gold: 0,
    stamina: 5,
  },
  banish: {
    label: 'Dismiss officer',
    description:
      'Dismiss this officer to local unaffiliated status. Their soldiers return to the city reserve.',
    gold: 0,
    stamina: 0,
  },
  appoint: {
    label: 'Appoint governor',
    description:
      'Appoint this officer governor. Intelligence helps maintain public support every month.',
    gold: 0,
    stamina: 5,
  },
};
const MAX_TROOPS = 5000;
const RESOURCE_CAP = 9999999;
const bounded = (n: number, max: number, min = 0) => Math.max(min, Math.min(max, Math.floor(n)));
const factionName = (id: string | null) =>
  FACTIONS.find((f) => f.id === id)?.name ?? 'Independent cities';
const owns = (city: City | undefined, factionId: string): city is City =>
  !!city && city.factionId === factionId;
const serving = (state: GameState, city: City) =>
  state.officers.filter(
    (o) => o.cityId === city.id && o.factionId === city.factionId && !o.captive,
  );
const strength = (state: GameState, city: City) =>
  serving(state, city).reduce((total, o) => total + o.troops, city.reserve);
const allied = (state: GameState, a: string, b: string | null) =>
  b !== null &&
  state.alliances.some(
    (p) => p.untilTurn > state.turn && ((p.a === a && p.b === b) || (p.b === a && p.a === b)),
  );
function chooseGovernor(state: GameState, city: City): void {
  if (city.factionId === null) {
    city.governorId = null;
    return;
  }
  const current = state.officers.find((o) => o.id === city.governorId);
  if (
    !current ||
    current.cityId !== city.id ||
    current.factionId !== city.factionId ||
    current.captive
  ) {
    city.governorId =
      serving(state, city).sort((a, b) => b.intellect - a.intellect || a.id.localeCompare(b.id))[0]
        ?.id ?? null;
  }
}

export function createGame(factionId: string, seed = 190): GameState {
  if (!FACTIONS.some((f) => f.id === factionId))
    throw new Error('Choose a ruler from this scenario.');
  const state: GameState = {
    version: 1,
    ruleset: 'baye-atlas-1',
    revision: 0,
    playerFactionId: factionId,
    year: 190,
    month: 1,
    turn: 0,
    rng: seed >>> 0 || 190,
    nextId: 1,
    cities: structuredClone(INITIAL_CITIES),
    officers: structuredClone(INITIAL_OFFICERS),
    alliances: [],
    phase: 'planning',
    battle: null,
    orders: [],
    resolution: null,
    log: [],
    winner: null,
    stats: { battlesWon: 0, commandsIssued: 0, citiesCaptured: 0 },
  };
  state.cities.forEach((city) => chooseGovernor(state, city));
  addLog(
    state,
    `190 CE. The Han court falters. ${factionName(factionId)} must unite the realm.`,
    'event',
  );
  addLog(
    state,
    'Each officer can perform one order per month. Muster reserves, prepare provisions, and march into neighboring lands.',
    'event',
  );
  return state;
}

/** UI previews and execution share the same costs and basic eligibility rules. */
export function getActionInfo(
  state: GameState,
  action: Action,
  cityId: string,
  officerId?: string,
): ActionInfo {
  return actionInfoFor(state, action, cityId, officerId, state.playerFactionId);
}
function actionInfoFor(
  state: GameState,
  action: Action,
  cityId: string,
  officerId: string | undefined,
  factionId: string,
): ActionInfo {
  const definition = ACTIONS[action];
  if (!definition)
    return {
      label: 'Unknown order',
      description: '',
      gold: 0,
      stamina: 0,
      reason: 'This order is not supported.',
    };
  const city = state.cities.find((c) => c.id === cityId);
  const officer = state.officers.find((o) => o.id === officerId);
  let reason: string | null = null;
  if (state.phase !== 'planning') reason = 'Finish the current battle before issuing city orders.';
  else if (!owns(city, factionId)) reason = 'Select a city under your control.';
  else if (
    !officer ||
    officer.cityId !== city.id ||
    officer.factionId !== factionId ||
    officer.captive
  )
    reason = 'Choose one of your serving officers in this city.';
  else if (officer.busy) reason = 'This officer has already received an order this month.';
  else if (officer.stamina < definition.stamina) reason = `Requires ${definition.stamina} stamina.`;
  else if (city.gold < definition.gold) reason = `Requires ${definition.gold} gold.`;
  else if (action === 'farm' && city.farming >= 999) reason = 'Farming is already at its maximum.';
  else if (action === 'commerce' && city.commerce >= 999)
    reason = 'Commerce is already at its maximum.';
  else if (action === 'govern' && city.loyalty >= 100 && city.defense >= 100)
    reason = 'Public support and defense are already at their maximum.';
  else if (action === 'recruit' && city.population < 1500)
    reason = 'The city needs at least 1,500 people before recruitment.';
  else if (action === 'train' && officer.troops === 0)
    reason = 'Assign troops to this officer before drilling.';
  else if (action === 'reward' && officer.loyalty >= 100)
    reason = 'This officer is already completely loyal.';
  else if (action === 'sellFood' && city.food < 800) reason = 'Requires 800 food.';
  else if (action === 'relieve' && city.food < 600) reason = 'Requires 600 food.';
  else if (action === 'equip' && officer.equipment) reason = 'This officer already has fine arms.';
  else if (action === 'confiscate' && !officer.equipment)
    reason = 'This officer has no equipment to confiscate.';
  else if (action === 'appoint' && city.governorId === officer.id)
    reason = 'This officer is already governor.';
  return { ...definition, reason };
}

function cityAction(
  state: GameState,
  command: Extract<GameCommand, { type: 'action' }>,
  factionId: string,
): string | null {
  const info = actionInfoFor(state, command.action, command.cityId, command.officerId, factionId);
  if (info.reason) return info.reason;
  const city = state.cities.find((c) => c.id === command.cityId)!;
  const officer = state.officers.find((o) => o.id === command.officerId)!;
  const targetCity = state.cities.find((c) => c.id === command.targetId);
  const targetOfficer = state.officers.find((o) => o.id === command.targetId);
  const neighbor = targetCity && city.neighbors.includes(targetCity.id);
  let targetFaction = FACTIONS.find((f) => f.id === command.targetId)?.id ?? targetCity?.factionId;
  // Validate every target before deducting a resource or consuming random numbers.
  if (command.action === 'scout' && !neighbor) return 'Choose a neighboring city to scout.';
  if (
    command.action === 'subvert' &&
    (!neighbor || !targetCity.factionId || targetCity.factionId === factionId)
  )
    return 'Choose a neighboring enemy city.';
  if (command.action === 'alliance') {
    if (
      !targetFaction ||
      targetFaction === factionId ||
      !state.cities.some((c) => c.factionId === targetFaction)
    )
      return 'Choose another active faction.';
    if (allied(state, factionId, targetFaction))
      return 'An alliance with this ruler is already active.';
  }
  if (command.action === 'persuade') {
    if (
      !targetOfficer ||
      targetOfficer.id === officer.id ||
      (targetOfficer.factionId === factionId && !targetOfficer.captive)
    )
      return 'Choose a free, captive, or enemy officer.';
    const local = targetOfficer.cityId === city.id;
    if (
      !local &&
      (!city.neighbors.includes(targetOfficer.cityId) ||
        targetOfficer.captive ||
        !targetOfficer.factionId)
    )
      return 'The target must be a local free officer or prisoner, or an officer in a neighboring enemy city.';
    if (targetOfficer.busy && !targetOfficer.captive)
      return 'That officer is already committed to an order.';
  }
  city.gold -= info.gold;
  officer.stamina -= info.stamina;
  officer.busy = true;
  state.stats.commandsIssued += factionId === state.playerFactionId ? 1 : 0;
  const announce = (text: string, kind: GameState['log'][number]['kind'] = 'economy') =>
    addLog(state, `${city.name}: ${text}`, kind);
  switch (command.action) {
    case 'farm': {
      // Source-inspired AssartMake integer operation order; modern cap and multiplier=1.
      const gain =
        Math.floor(officer.intellect / 10) * (2 + random(state, 4)) + (officer.intellect >> 1);
      const before = city.farming;
      city.farming = bounded(city.farming + gain, 999);
      announce(`${officer.name} improves farming by ${city.farming - before}.`);
      break;
    }
    case 'commerce': {
      const gain =
        Math.floor(officer.intellect / 10) * (2 + random(state, 4)) +
        Math.floor(officer.intellect / 3);
      const before = city.commerce;
      city.commerce = bounded(city.commerce + gain, 999);
      announce(`${officer.name} expands commerce by ${city.commerce - before}.`);
      break;
    }
    case 'govern':
      city.loyalty = bounded(city.loyalty + 8 + officer.intellect / 20, 100);
      city.defense = bounded(city.defense + 5 + officer.intellect / 25, 100);
      announce(`${officer.name} restores public order and fortifies the walls.`);
      break;
    case 'search': {
      const candidates = state.officers
        .filter((o) => o.cityId === city.id && !o.factionId && !o.captive)
        .sort((a, b) => a.id.localeCompare(b.id));
      const candidate = candidates.length
        ? candidates[random(state, candidates.length)]
        : undefined;
      if (candidate && random(state, 100) < 40 + Math.floor(officer.intellect / 2)) {
        candidate.factionId = factionId;
        candidate.loyalty = 65 + random(state, 16);
        candidate.busy = true;
        announce(`${officer.name} discovers ${candidate.name}, who joins your cause.`, 'good');
      } else
        announce(
          `${officer.name} searches the countryside, but no new officer joins this month.`,
          'event',
        );
      break;
    }
    case 'recruit': {
      const gain = Math.min(city.population - 1000, 300 + officer.force * 5);
      city.population -= gain;
      city.reserve = bounded(city.reserve + gain, RESOURCE_CAP);
      city.loyalty = bounded(city.loyalty - 2, 100);
      announce(`${officer.name} recruits ${gain} soldiers into the reserve.`);
      break;
    }
    case 'train':
      officer.experience = bounded(officer.experience + 25, 10000);
      officer.force = bounded(officer.force + 1, officer.equipment ? 105 : 100);
      announce(
        `${officer.name} drills ${officer.troops} soldiers: +25 experience, +1 force.`,
        'military',
      );
      break;
    case 'reward':
      officer.loyalty = bounded(officer.loyalty + 15, 100);
      announce(`${officer.name} receives a reward and renews their allegiance.`, 'diplomacy');
      break;
    case 'feast':
      serving(state, city).forEach((o) => {
        o.loyalty = bounded(o.loyalty + 8, 100);
        o.stamina = bounded(o.stamina + 10, 100);
      });
      announce(`${officer.name} hosts a feast. Officers gain loyalty and recover stamina.`, 'good');
      break;
    case 'buyFood':
      city.food = bounded(city.food + 800, RESOURCE_CAP);
      announce('Merchants deliver 800 food.');
      break;
    case 'sellFood':
      city.food -= 800;
      city.gold = bounded(city.gold + 80, RESOURCE_CAP);
      announce('Merchants purchase 800 food for 80 gold.');
      break;
    case 'relieve':
      city.food -= 600;
      city.loyalty = bounded(city.loyalty + 15, 100);
      city.population = bounded(city.population + 300, RESOURCE_CAP);
      announce(
        `${officer.name} distributes grain. Public support and population increase.`,
        'good',
      );
      break;
    case 'scout':
      announce(
        `${targetCity!.name} reports ${strength(state, targetCity!)} soldiers, ${targetCity!.defense} defense, ${targetCity!.food} food and ${targetCity!.loyalty} support.`,
        'military',
      );
      break;
    case 'persuade': {
      const target = targetOfficer!;
      const chance =
        target.factionId === null
          ? 50 + Math.floor(officer.intellect / 3)
          : bounded(
              35 + officer.intellect * 0.6 - target.loyalty * 0.55 + (target.captive ? 20 : 0),
              90,
              10,
            );
      if (random(state, 100) < chance) {
        const oldCity = state.cities.find((c) => c.id === target.cityId)!;
        // Soldiers who defect join the receiving reserve; prisoners have no troops.
        city.reserve = bounded(city.reserve + target.troops, RESOURCE_CAP);
        target.troops = 0;
        target.cityId = city.id;
        target.factionId = factionId;
        target.captive = false;
        target.busy = true;
        target.loyalty = 65 + random(state, 21);
        chooseGovernor(state, oldCity);
        announce(
          `${officer.name} persuades ${target.name} to join ${factionName(factionId)}.`,
          'good',
        );
      } else announce(`${target.name} declines ${officer.name}'s offer.`, 'diplomacy');
      break;
    }
    case 'subvert': {
      const loss = 6 + Math.floor(officer.intellect / 8);
      targetCity!.loyalty = bounded(targetCity!.loyalty - loss, 100);
      serving(state, targetCity!).forEach((o) => {
        o.loyalty = bounded(o.loyalty - Math.ceil(loss / 2), 100);
      });
      announce(
        `${officer.name} spreads dissent in ${targetCity!.name}: −${loss} public support.`,
        'diplomacy',
      );
      break;
    }
    case 'alliance': {
      targetFaction = targetFaction!;
      if (random(state, 100) < 40 + Math.floor(officer.intellect / 2)) {
        state.alliances.push({ a: factionId, b: targetFaction, untilTurn: state.turn + 6 });
        announce(`${factionName(targetFaction)} agrees to six months of peace.`, 'diplomacy');
      } else announce(`${factionName(targetFaction)} declines the alliance.`, 'diplomacy');
      break;
    }
    case 'equip':
      officer.equipment = 'Fine arms';
      officer.force = bounded(officer.force + 5, 105);
      announce(`${officer.name} receives fine arms (+5 force).`, 'military');
      break;
    case 'confiscate':
      officer.equipment = null;
      officer.force = bounded(officer.force - 5, 100, 1);
      officer.loyalty = bounded(officer.loyalty - 12, 100);
      city.gold = bounded(city.gold + 100, RESOURCE_CAP);
      announce(`${officer.name}'s arms are sold for 100 gold. Their loyalty falls.`, 'bad');
      break;
    case 'banish':
      city.reserve = bounded(city.reserve + officer.troops, RESOURCE_CAP);
      officer.troops = 0;
      officer.factionId = null;
      officer.loyalty = 35;
      officer.captive = false;
      chooseGovernor(state, city);
      announce(`${officer.name} is dismissed from service.`, 'diplomacy');
      break;
    case 'appoint':
      city.governorId = officer.id;
      announce(`${officer.name} becomes governor.`, 'diplomacy');
      break;
  }
  return null;
}

function assignTroops(
  state: GameState,
  command: Extract<GameCommand, { type: 'assignTroops' }>,
  factionId: string,
): string | null {
  const city = state.cities.find((c) => c.id === command.cityId);
  const officer = state.officers.find((o) => o.id === command.officerId);
  if (
    !owns(city, factionId) ||
    !officer ||
    officer.cityId !== city.id ||
    officer.factionId !== factionId ||
    officer.captive
  )
    return 'Choose a serving officer in a city you control.';
  if (officer.busy) return 'This officer has already received an order this month.';
  if (!Number.isSafeInteger(command.amount) || command.amount < 0 || command.amount > MAX_TROOPS)
    return `An officer can command 0–${MAX_TROOPS} soldiers.`;
  const change = command.amount - officer.troops;
  if (change > city.reserve) return 'There are not enough soldiers in reserve.';
  if (city.reserve - change > RESOURCE_CAP)
    return 'The city reserve cannot hold that many soldiers.';
  city.reserve -= change;
  officer.troops = command.amount;
  return null;
}

function march(
  state: GameState,
  command: Extract<GameCommand, { type: 'march' }>,
  factionId: string,
): string | null {
  const source = state.cities.find((c) => c.id === command.sourceId);
  const target = state.cities.find((c) => c.id === command.targetId);
  if (!owns(source, factionId) || !target || !source.neighbors.includes(target.id))
    return 'Armies must march from your city to a neighboring city.';
  if (target.factionId === factionId)
    return 'Use transport to move troops between your own cities.';
  if (allied(state, factionId, target.factionId)) return 'An active alliance prevents this attack.';
  if (
    !Array.isArray(command.officerIds) ||
    command.officerIds.length < 1 ||
    command.officerIds.length > 10 ||
    new Set(command.officerIds).size !== command.officerIds.length
  )
    return 'Select between one and ten distinct commanders.';
  const officers = command.officerIds.map((id) => state.officers.find((o) => o.id === id));
  if (
    officers.some(
      (o) =>
        !o ||
        o.cityId !== source.id ||
        o.factionId !== factionId ||
        o.captive ||
        o.busy ||
        o.troops <= 0,
    )
  )
    return 'Every commander must be available here and lead soldiers.';
  if (officers.some((o) => o!.stamina < 15))
    return 'Every commander needs at least 15 stamina to march.';
  const food = Math.ceil(officers.reduce((total, o) => total + o!.troops, 0) * 0.65) + 200;
  if (source.food < food) return `This army needs ${food} food for the campaign.`;
  source.food -= food;
  officers.forEach((o) => {
    o!.busy = true;
    o!.stamina -= 15;
  });
  state.orders.push({
    id: `army-${state.nextId++}`,
    factionId,
    sourceId: source.id,
    targetId: target.id,
    officerIds: [...command.officerIds],
    food,
  });
  addLog(
    state,
    `${factionName(factionId)} prepares to march from ${source.name} to ${target.name}. The army departs at month end.`,
    'military',
  );
  state.stats.commandsIssued += factionId === state.playerFactionId ? 1 : 0;
  return null;
}

function transfer(
  state: GameState,
  command: Extract<GameCommand, { type: 'transfer' }>,
  factionId: string,
): string | null {
  const source = state.cities.find((c) => c.id === command.sourceId);
  const target = state.cities.find((c) => c.id === command.targetId);
  const officer = state.officers.find((o) => o.id === command.officerId);
  if (!owns(source, factionId) || !owns(target, factionId) || !source.neighbors.includes(target.id))
    return 'Transport requires two neighboring cities under your control.';
  if (
    !officer ||
    officer.cityId !== source.id ||
    officer.factionId !== factionId ||
    officer.captive ||
    officer.busy
  )
    return 'Choose an available officer to lead the convoy.';
  if (officer.stamina < 15) return 'The convoy commander needs 15 stamina.';
  if (![command.gold, command.food, command.troops].every((n) => Number.isSafeInteger(n) && n >= 0))
    return 'Convoy amounts must be nonnegative whole numbers.';
  if (source.gold < command.gold || source.food < command.food || source.reserve < command.troops)
    return 'The city cannot supply this convoy.';
  source.gold -= command.gold;
  source.food -= command.food;
  source.reserve -= command.troops;
  target.gold = bounded(target.gold + command.gold, RESOURCE_CAP);
  target.food = bounded(target.food + command.food, RESOURCE_CAP);
  target.reserve = bounded(target.reserve + command.troops, RESOURCE_CAP);
  officer.cityId = target.id;
  officer.busy = true;
  officer.stamina -= 15;
  chooseGovernor(state, source);
  chooseGovernor(state, target);
  addLog(
    state,
    `${officer.name} transports ${command.gold} gold, ${command.food} food and ${command.troops} reserves from ${source.name} to ${target.name}. Their own army travels with them.`,
    'military',
  );
  state.stats.commandsIssued += factionId === state.playerFactionId ? 1 : 0;
  return null;
}

/** AI gets no free resources: it uses exactly the same action, muster and march rules. */
function planAi(state: GameState): void {
  for (const faction of FACTIONS) {
    if (faction.id === state.playerFactionId) continue;
    const cities = state.cities
      .filter((c) => c.factionId === faction.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const city of cities) {
      const officers = serving(state, city)
        .filter((o) => !o.busy)
        .sort((a, b) => b.force - a.force || a.id.localeCompare(b.id));
      if (!officers.length) continue;
      for (const officer of officers) {
        const desired = Math.min(
          MAX_TROOPS,
          officer.troops + city.reserve,
          officer.force > 80 ? 2200 : 1500,
        );
        if (desired > officer.troops)
          assignTroops(
            state,
            { type: 'assignTroops', cityId: city.id, officerId: officer.id, amount: desired },
            faction.id,
          );
      }
      const enemies = state.cities
        .filter(
          (c) =>
            city.neighbors.includes(c.id) &&
            c.factionId !== faction.id &&
            !allied(state, faction.id, c.factionId),
        )
        .sort((a, b) => strength(state, a) - strength(state, b) || a.id.localeCompare(b.id));
      const army = officers.filter((o) => o.troops > 0 && o.stamina >= 15).slice(0, 10);
      const power = army.reduce((sum, o) => sum + o.troops * (0.6 + o.force / 100), 0);
      const target = enemies.find((c) => power > strength(state, c) * 1.35 + c.defense * 7 + 300);
      if (target && army.length && state.turn > 0)
        march(
          state,
          {
            type: 'march',
            sourceId: city.id,
            targetId: target.id,
            officerIds: army.map((o) => o.id),
          },
          faction.id,
        );
      for (const officer of officers.filter((o) => !o.busy)) {
        let action: Action;
        if (officer.loyalty < 55 && city.gold >= 100) action = 'reward';
        else if (city.loyalty < 60) action = city.food > 1500 ? 'relieve' : 'govern';
        else if (city.food < strength(state, city) * 0.8 + 800)
          action = city.gold >= 200 ? 'buyFood' : 'farm';
        else if (city.reserve < 700 && city.population > 2500 && city.gold > 250)
          action = 'recruit';
        else if (city.commerce < 300 || (state.turn + officer.force) % 3 === 0) action = 'commerce';
        else if (city.farming < 450 || state.turn % 3 === 1) action = 'farm';
        else if (!officer.equipment && city.gold > 500) action = 'equip';
        else if (officer.troops > 0) action = 'train';
        else action = 'search';
        cityAction(
          state,
          { type: 'action', action, cityId: city.id, officerId: officer.id },
          faction.id,
        );
      }
    }
  }
}

/** Resolve city ownership and all casualties once, before advancing the cursor. */
function applyBattleAftermath(state: GameState): void {
  const battle = state.battle;
  if (!battle?.outcome) return;
  const target = state.cities.find((c) => c.id === battle.order.targetId)!;
  const source = state.cities.find((c) => c.id === battle.order.sourceId)!;
  const attackerWon = battle.outcome === 'attacker';
  const formerOwner = target.factionId;
  for (const unit of battle.units) {
    if (unit.officerId.startsWith('militia-')) {
      target.reserve = Math.max(0, target.reserve - Math.max(0, unit.initialTroops - unit.troops));
      continue;
    }
    const officer = state.officers.find((o) => o.id === unit.officerId);
    if (!officer) continue;
    officer.troops = Math.max(0, Math.floor(unit.troops));
    officer.experience = bounded(
      officer.experience + (unit.side === battle.outcome ? 20 : 8),
      10000,
    );
    officer.stamina = bounded(officer.stamina - battle.day * 2, 100);
    officer.busy = true;
  }
  target.food = Math.max(0, Math.floor(battle.defenderFood));
  if (attackerWon) {
    target.factionId = battle.attackerId;
    target.defense = Math.floor(target.defense * 0.65);
    target.loyalty = Math.max(35, target.loyalty - 15);
    // Remaining reserve soldiers surrender. Half are retained as the new garrison.
    target.reserve = Math.floor(target.reserve / 2);
    for (const prisoner of state.officers.filter(
      (o) => o.cityId === target.id && o.captive && o.factionId === battle.attackerId,
    )) {
      prisoner.captive = false;
      prisoner.busy = true;
      addLog(state, `${prisoner.name} is freed after the capture of ${target.name}.`, 'good');
    }
    for (const officer of state.officers.filter(
      (o) =>
        o.cityId === target.id && o.factionId === formerOwner && formerOwner !== null && !o.captive,
    )) {
      const refuge = state.cities
        .filter((c) => c.factionId === formerOwner && c.id !== target.id)
        .sort(
          (a, b) =>
            (target.neighbors.includes(a.id) ? 0 : 1) - (target.neighbors.includes(b.id) ? 0 : 1) ||
            a.id.localeCompare(b.id),
        )[0];
      if (refuge && random(state, 100) < 65) {
        officer.cityId = refuge.id;
        officer.troops = Math.floor(officer.troops * 0.8);
      } else {
        officer.captive = true;
        officer.troops = 0;
        officer.loyalty = bounded(officer.loyalty - 10, 100);
      }
      officer.busy = true;
    }
    for (const id of battle.order.officerIds) {
      const officer = state.officers.find((o) => o.id === id);
      if (officer && officer.factionId === battle.attackerId && !officer.captive)
        officer.cityId = target.id;
    }
    target.food = bounded(target.food + battle.attackerFood, RESOURCE_CAP);
    target.governorId = null;
    if (battle.attackerId === state.playerFactionId) {
      state.stats.battlesWon++;
      state.stats.citiesCaptured++;
    }
    addLog(
      state,
      `${factionName(battle.attackerId)} captures ${target.name} after ${battle.day} day${battle.day === 1 ? '' : 's'} of battle.`,
      battle.attackerId === state.playerFactionId ? 'good' : 'military',
    );
  } else {
    const refuge =
      source.factionId === battle.attackerId
        ? source
        : state.cities.find((c) => c.factionId === battle.attackerId);
    for (const id of battle.order.officerIds) {
      const officer = state.officers.find((o) => o.id === id);
      if (!officer || officer.factionId !== battle.attackerId) continue;
      if (refuge) officer.cityId = refuge.id;
      else {
        officer.cityId = target.id;
        officer.captive = true;
        officer.troops = 0;
      }
      officer.busy = true;
    }
    if (refuge) refuge.food = bounded(refuge.food + battle.attackerFood, RESOURCE_CAP);
    if (battle.defenderId === state.playerFactionId) state.stats.battlesWon++;
    addLog(
      state,
      `${target.name} holds. ${factionName(battle.attackerId)}'s army withdraws.`,
      battle.defenderId === state.playerFactionId ? 'good' : 'military',
    );
  }
  state.cities.forEach((city) => chooseGovernor(state, city));
  state.battle = null;
  if (state.resolution) state.resolution.index++;
}

function finishMonth(state: GameState): void {
  state.turn++;
  state.month++;
  if (state.month > 12) {
    state.month = 1;
    state.year++;
    state.officers.forEach((o) => {
      o.age++;
    });
  }
  state.alliances = state.alliances.filter((a) => {
    if (a.untilTurn <= state.turn) {
      addLog(
        state,
        `The alliance between ${factionName(a.a)} and ${factionName(a.b)} expires.`,
        'diplomacy',
      );
      return false;
    }
    return true;
  });
  let playerGold = 0,
    playerFood = 0;
  for (const city of state.cities) {
    if (!city.factionId) continue;
    const army = serving(state, city);
    const troops = army.reduce((sum, o) => sum + o.troops, city.reserve);
    const income = Math.floor(city.population / 150 + city.commerce * 0.55);
    const harvest = Math.floor(city.farming * (state.month === 9 ? 4 : 2.2) + city.population / 80);
    const upkeep = Math.ceil(troops * 0.12);
    const pay = Math.ceil(troops * 0.025);
    const foodBefore = city.food,
      goldBefore = city.gold;
    city.food = bounded(city.food + harvest, RESOURCE_CAP);
    city.gold = bounded(city.gold + income, RESOURCE_CAP);
    if (city.food < upkeep) {
      city.food = 0;
      city.loyalty = bounded(city.loyalty - 8, 100);
      city.reserve = Math.floor(city.reserve * 0.85);
      army.forEach((o) => {
        o.troops = Math.floor(o.troops * 0.85);
        o.loyalty = bounded(o.loyalty - 4, 100);
      });
      addLog(
        state,
        `${city.name} runs short of provisions. Fifteen percent of its soldiers desert.`,
        'bad',
      );
    } else city.food -= upkeep;
    if (city.gold < pay) {
      city.gold = 0;
      army.forEach((o) => {
        o.loyalty = bounded(o.loyalty - 3, 100);
      });
    } else city.gold -= pay;
    const governor = army.find((o) => o.id === city.governorId);
    city.loyalty = bounded(city.loyalty + (governor && governor.intellect >= 65 ? 1 : 0), 100);
    city.population = bounded(
      city.population + Math.floor(city.population * 0.006 * (city.loyalty / 100)),
      RESOURCE_CAP,
      500,
    );
    if (city.factionId === state.playerFactionId) {
      playerGold += city.gold - goldBefore;
      playerFood += city.food - foodBefore;
    }
    // A low-frequency event is drawn in stable city order and remains reproducible.
    const event = random(state, 100);
    if (event === 0) {
      const loss = Math.floor(city.food * 0.12);
      city.food -= loss;
      city.loyalty = bounded(city.loyalty - 3, 100);
      addLog(state, `Floods near ${city.name} destroy ${loss} food.`, 'bad');
    } else if (event === 1) {
      const gift = 150 + Math.floor(city.commerce / 2);
      city.gold = bounded(city.gold + gift, RESOURCE_CAP);
      addLog(state, `A prosperous caravan brings ${gift} gold to ${city.name}.`, 'good');
    } else if (event === 2 && city.loyalty >= 60) {
      city.population = bounded(city.population + 500, RESOURCE_CAP);
      addLog(state, `Five hundred refugees settle peacefully in ${city.name}.`, 'event');
    }
  }
  for (const officer of state.officers) {
    officer.busy = false;
    officer.stamina = bounded(officer.stamina + 35, 100);
    if (officer.captive) officer.loyalty = bounded(officer.loyalty - 2, 100);
    const city = state.cities.find((c) => c.id === officer.cityId)!;
    if (!officer.captive && officer.factionId && city.factionId !== officer.factionId) {
      const refuge = state.cities.find((c) => c.factionId === officer.factionId);
      if (refuge) officer.cityId = refuge.id;
      else {
        officer.captive = true;
        officer.troops = 0;
      }
    }
  }
  state.cities.forEach((city) => chooseGovernor(state, city));
  state.resolution = null;
  state.orders = [];
  state.phase = 'planning';
  addLog(
    state,
    `${state.year} · Month ${state.month}. Your treasury changes by ${playerGold >= 0 ? '+' : ''}${playerGold} gold and ${playerFood >= 0 ? '+' : ''}${playerFood} food after income and upkeep. Officers are ready.`,
    'economy',
  );
  checkVictory(state);
}

function checkVictory(state: GameState): void {
  const owned = state.cities.filter((c) => c.factionId === state.playerFactionId).length;
  if (owned === state.cities.length) {
    state.phase = 'finished';
    state.winner = state.playerFactionId;
    addLog(
      state,
      `${factionName(state.playerFactionId)} has united every city. The realm enters a new age of peace.`,
      'good',
    );
  } else if (owned === 0) {
    const counts = FACTIONS.map((f) => ({
      id: f.id,
      cities: state.cities.filter((c) => c.factionId === f.id).length,
    })).sort((a, b) => b.cities - a.cities || a.id.localeCompare(b.id));
    state.phase = 'finished';
    state.winner = counts[0]?.id ?? null;
    addLog(
      state,
      'Your last city has fallen. This campaign ends, but another ruler may yet unite the realm.',
      'bad',
    );
  }
}

function resolveOrders(state: GameState): void {
  const resolution = state.resolution;
  if (!resolution) return;
  while (resolution.index < resolution.queue.length) {
    const order = resolution.queue[resolution.index]!;
    const source = state.cities.find((c) => c.id === order.sourceId)!;
    const target = state.cities.find((c) => c.id === order.targetId)!;
    const commanders = order.officerIds
      .map((id) => state.officers.find((o) => o.id === id))
      .filter(
        (o): o is Officer =>
          !!o && !o.captive && o.factionId === order.factionId && o.cityId === source.id,
      );
    if (source.factionId !== order.factionId || !commanders.some((o) => o.troops > 0)) {
      if (source.factionId === order.factionId)
        source.food = bounded(source.food + order.food, RESOURCE_CAP);
      addLog(
        state,
        `The march on ${target.name} is cancelled: the army or its base is no longer available.`,
        'military',
      );
      resolution.index++;
      continue;
    }
    if (target.factionId === order.factionId || allied(state, order.factionId, target.factionId)) {
      source.food = bounded(source.food + order.food, RESOURCE_CAP);
      addLog(
        state,
        `The army stands down at ${source.name}; ${target.name} is now friendly.`,
        'diplomacy',
      );
      resolution.index++;
      continue;
    }
    // Earlier fighting may remove officers from this committed army.
    order.officerIds = commanders.filter((o) => o.troops > 0).map((o) => o.id);
    state.battle = createBattle(state, order);
    state.phase = 'battle';
    if (state.battle.outcome) {
      applyBattleAftermath(state);
      continue;
    }
    if (order.factionId === state.playerFactionId || target.factionId === state.playerFactionId) {
      addLog(
        state,
        `Battle begins at ${target.name}. Command your troops or delegate to the strategist.`,
        'military',
      );
      return;
    }
    autoResolveBattle(state);
    applyBattleAftermath(state);
  }
  resolution.stage = 'upkeep';
  finishMonth(state);
}

/** Public reducer: invalid commands return the original object and never consume RNG. */
export function dispatch(state: GameState, command: GameCommand): CommandResult {
  if (state.phase === 'finished')
    return {
      ok: false,
      state,
      error: 'This campaign has ended. Start a new chronicle to play again.',
    };
  const draft = structuredClone(state);
  let error: string | null = null;
  const battleCommand = command.type.startsWith('battle');
  if (battleCommand) {
    if (draft.phase !== 'battle' || !draft.battle) error = 'There is no active battle.';
    else {
      error = processBattleCommand(draft, command);
      if (!error && draft.battle.outcome) {
        applyBattleAftermath(draft);
        resolveOrders(draft);
      }
    }
  } else if (draft.phase !== 'planning' || draft.resolution)
    error = 'Finish the current battle before issuing campaign orders.';
  else {
    switch (command.type) {
      case 'action':
        error = cityAction(draft, command, draft.playerFactionId);
        break;
      case 'assignTroops':
        error = assignTroops(draft, command, draft.playerFactionId);
        break;
      case 'transfer':
        error = transfer(draft, command, draft.playerFactionId);
        break;
      case 'march':
        error = march(draft, command, draft.playerFactionId);
        break;
      case 'endMonth':
        planAi(draft);
        draft.resolution = { queue: structuredClone(draft.orders), index: 0, stage: 'orders' };
        draft.orders = [];
        resolveOrders(draft);
        break;
      default:
        error = 'Unknown game command.';
    }
  }
  if (error) return { ok: false, state, error };
  draft.revision++;
  return { ok: true, state: draft };
}

/** Semantic import checks complement the save boundary's runtime shape schema. */
export function validateState(state: GameState): string | null {
  if (!state || state.version !== 1 || state.ruleset !== 'baye-atlas-1')
    return 'This save uses an unsupported ruleset.';
  const integral = (value: number, low: number, high: number) =>
    Number.isSafeInteger(value) && value >= low && value <= high;
  if (!FACTIONS.some((f) => f.id === state.playerFactionId))
    return 'The player faction is not part of this scenario.';
  if (
    !integral(state.year, 190, 9999) ||
    !integral(state.month, 1, 12) ||
    !integral(state.turn, 0, 117719) ||
    state.year * 12 + state.month !== 190 * 12 + 1 + state.turn
  )
    return 'The campaign calendar is inconsistent.';
  if (
    !integral(state.rng, 0, 0xffffffff) ||
    !integral(state.nextId, 1, Number.MAX_SAFE_INTEGER) ||
    !integral(state.revision, 0, Number.MAX_SAFE_INTEGER)
  )
    return 'The saved counters are invalid.';
  if (
    !Array.isArray(state.cities) ||
    !Array.isArray(state.officers) ||
    !Array.isArray(state.orders) ||
    !Array.isArray(state.alliances) ||
    !Array.isArray(state.log)
  )
    return 'The save is missing campaign collections.';
  const cityIds = new Set(state.cities.map((c) => c.id)),
    officerIds = new Set(state.officers.map((o) => o.id)),
    factions = new Set(FACTIONS.map((f) => f.id));
  if (cityIds.size !== state.cities.length || officerIds.size !== state.officers.length)
    return 'City and officer IDs must be unique.';
  if (
    state.cities.length !== INITIAL_CITIES.length ||
    INITIAL_CITIES.some((c) => !cityIds.has(c.id))
  )
    return 'The save does not contain this scenario’s complete map.';
  if (
    state.officers.length !== INITIAL_OFFICERS.length ||
    INITIAL_OFFICERS.some((o) => !officerIds.has(o.id))
  )
    return 'The save does not contain this scenario’s officer roster.';
  for (const city of state.cities) {
    const original = INITIAL_CITIES.find((c) => c.id === city.id)!;
    if (city.factionId !== null && !factions.has(city.factionId))
      return `Unknown faction in ${city.name}.`;
    if (
      !Array.isArray(city.neighbors) ||
      new Set(city.neighbors).size !== city.neighbors.length ||
      city.neighbors.includes(city.id) ||
      city.neighbors.some((id) => !cityIds.has(id)) ||
      city.neighbors.length !== original.neighbors.length ||
      original.neighbors.some((id) => !city.neighbors.includes(id))
    )
      return `Invalid map links for ${city.name}.`;
    if (city.x !== original.x || city.y !== original.y)
      return `The saved position of ${city.name} differs from this scenario.`;
    if (
      ![city.gold, city.food, city.reserve, city.population].every((n) =>
        integral(n, 0, RESOURCE_CAP),
      ) ||
      !integral(city.farming, 0, 999) ||
      !integral(city.commerce, 0, 999) ||
      !integral(city.loyalty, 0, 100) ||
      !integral(city.defense, 0, 100)
    )
      return `Invalid resources in ${city.name}.`;
    if (city.governorId !== null) {
      const governor = state.officers.find((o) => o.id === city.governorId);
      if (
        !governor ||
        governor.cityId !== city.id ||
        governor.factionId !== city.factionId ||
        governor.captive
      )
        return `Invalid governor in ${city.name}.`;
    }
  }
  for (const officer of state.officers) {
    if (
      !cityIds.has(officer.cityId) ||
      (officer.factionId !== null && !factions.has(officer.factionId))
    )
      return `Invalid assignment for ${officer.name}.`;
    if (
      !integral(officer.force, 1, 105) ||
      !integral(officer.intellect, 1, 100) ||
      !integral(officer.loyalty, 0, 100) ||
      !integral(officer.stamina, 0, 100) ||
      !integral(officer.troops, 0, MAX_TROOPS) ||
      !integral(officer.experience, 0, 10000) ||
      !integral(officer.age, 1, 9999)
    )
      return `Invalid attributes for ${officer.name}.`;
    if (
      !['infantry', 'cavalry', 'archer', 'naval', 'elite', 'guard'].includes(officer.troopType) ||
      typeof officer.busy !== 'boolean' ||
      typeof officer.captive !== 'boolean' ||
      (officer.equipment !== null && officer.equipment !== 'Fine arms')
    )
      return `Invalid status for ${officer.name}.`;
    const city = state.cities.find((c) => c.id === officer.cityId)!;
    if (
      officer.captive &&
      (officer.troops !== 0 || officer.factionId === null || officer.factionId === city.factionId)
    )
      return `Invalid prisoner status for ${officer.name}.`;
    if (officer.factionId !== null && !officer.captive && city.factionId !== officer.factionId)
      return `${officer.name} is assigned to a hostile city.`;
  }
  const alliancePairs = new Set<string>();
  for (const alliance of state.alliances) {
    if (
      !factions.has(alliance.a) ||
      !factions.has(alliance.b) ||
      alliance.a === alliance.b ||
      !integral(alliance.untilTurn, state.turn + 1, state.turn + 6)
    )
      return 'Invalid alliance duration or faction.';
    const pair = [alliance.a, alliance.b].sort().join(':');
    if (alliancePairs.has(pair)) return 'Duplicate alliance.';
    alliancePairs.add(pair);
  }
  const validateOrder = (order: AttackOrder, current: boolean): string | null => {
    const source = state.cities.find((c) => c.id === order.sourceId),
      target = state.cities.find((c) => c.id === order.targetId);
    if (
      !order.id ||
      !factions.has(order.factionId) ||
      !source ||
      !target ||
      !source.neighbors.includes(target.id) ||
      !integral(order.food, 0, RESOURCE_CAP) ||
      !Array.isArray(order.officerIds) ||
      order.officerIds.length < 1 ||
      order.officerIds.length > 10 ||
      new Set(order.officerIds).size !== order.officerIds.length ||
      order.officerIds.some((id) => !officerIds.has(id))
    )
      return 'Invalid military order.';
    if (
      current &&
      (source.factionId !== order.factionId ||
        order.officerIds.some((id) => {
          const o = state.officers.find((p) => p.id === id)!;
          return (
            o.factionId !== order.factionId ||
            o.cityId !== order.sourceId ||
            o.captive ||
            !o.busy ||
            o.troops === 0
          );
        }))
    )
      return 'A pending army has an unavailable commander.';
    return null;
  };
  const pendingOfficers = new Set<string>(),
    pendingOrderIds = new Set<string>();
  for (const order of state.orders) {
    const error = validateOrder(order, true);
    if (error) return error;
    if (pendingOrderIds.has(order.id)) return 'Duplicate pending order.';
    pendingOrderIds.add(order.id);
    for (const id of order.officerIds) {
      if (pendingOfficers.has(id)) return 'An officer belongs to multiple pending armies.';
      pendingOfficers.add(id);
    }
  }
  if (state.phase === 'battle') {
    const b = state.battle,
      r = state.resolution;
    if (
      !b ||
      !r ||
      r.stage !== 'orders' ||
      !integral(r.index, 0, r.queue.length - 1) ||
      r.queue[r.index]?.id !== b.order.id ||
      state.orders.length
    )
      return 'The battle continuation is missing or inconsistent.';
    if (
      JSON.stringify(b.order) !== JSON.stringify(r.queue[r.index]) ||
      b.id !== `battle-${b.order.id}`
    )
      return 'The battle army differs from its campaign continuation.';
    if (
      b.order.factionId !== b.attackerId ||
      b.defenderId !== state.cities.find((c) => c.id === b.order.targetId)?.factionId ||
      (b.attackerId !== state.playerFactionId && b.defenderId !== state.playerFactionId) ||
      b.playerSide !== (b.attackerId === state.playerFactionId ? 'attacker' : 'defender')
    )
      return 'The battle sides are inconsistent.';
    if (
      b.width !== 12 ||
      b.height !== 10 ||
      !Array.isArray(b.terrain) ||
      b.terrain.length !== b.width * b.height ||
      b.terrain.some((t) => !['plain', 'forest', 'hill', 'water', 'fort'].includes(t)) ||
      !integral(b.day, 1, 30) ||
      b.outcome !== null ||
      !['clear', 'rain', 'wind'].includes(b.weather)
    )
      return 'Invalid battlefield conditions.';
    if (
      ![b.attackerFood, b.defenderFood].every((n) => integral(n, 0, RESOURCE_CAP)) ||
      !Array.isArray(b.units) ||
      b.units.length > 20 ||
      !Array.isArray(b.log) ||
      b.log.length > 200
    )
      return 'Invalid battle resources or roster.';
    const destination = state.cities.find((c) => c.id === b.order.targetId)!;
    if (b.attackerFood > b.order.food || b.defenderFood > destination.food)
      return 'Battle provisions exceed the supplies committed.';
    // Battles retain defeated units, so the entire original roster must remain
    // in a save. Respect the ten-unit deployment limit, including the militia.
    const expectedDefenders = serving(state, destination)
      .filter((officer) => officer.troops > 0)
      .slice(0, 10)
      .map((officer) => officer.id);
    if (destination.reserve > 0 && expectedDefenders.length < 10)
      expectedDefenders.push(`militia-${destination.id}`);
    const defenders = b.units.filter((unit) => unit.side === 'defender');
    if (
      defenders.length !== expectedDefenders.length ||
      expectedDefenders.some((id) => !defenders.some((unit) => unit.officerId === id))
    )
      return 'The defending roster differs from the city garrison.';
    const occupied = new Set<string>(),
      units = new Set<string>(),
      combatOfficers = new Set<string>();
    for (const unit of b.units) {
      const militia = unit.officerId === `militia-${b.order.targetId}`;
      if (
        !unit.id ||
        units.has(unit.id) ||
        combatOfficers.has(unit.officerId) ||
        (!militia && !officerIds.has(unit.officerId)) ||
        !['attacker', 'defender'].includes(unit.side) ||
        (militia && unit.side !== 'defender')
      )
        return 'Invalid or duplicate battle unit.';
      units.add(unit.id);
      combatOfficers.add(unit.officerId);
      if (
        !integral(unit.x, 0, b.width - 1) ||
        !integral(unit.y, 0, b.height - 1) ||
        !integral(unit.initialTroops, 1, RESOURCE_CAP) ||
        !integral(unit.troops, 0, unit.initialTroops) ||
        !integral(unit.morale, 0, 100) ||
        !integral(unit.force, 1, 150) ||
        !integral(unit.intellect, 1, 100) ||
        !['normal', 'confused', 'inspired'].includes(unit.status) ||
        typeof unit.moved !== 'boolean' ||
        typeof unit.acted !== 'boolean'
      )
        return 'Invalid battle unit attributes.';
      if (unit.side === 'attacker' && !b.order.officerIds.includes(unit.officerId))
        return 'An attacking unit is absent from the army order.';
      if (!militia) {
        const o = state.officers.find((x) => x.id === unit.officerId)!;
        if (
          o.captive ||
          o.factionId !== (unit.side === 'attacker' ? b.attackerId : b.defenderId) ||
          o.cityId !== (unit.side === 'attacker' ? b.order.sourceId : b.order.targetId)
        )
          return 'A battle unit belongs to the wrong army.';
        if (
          unit.initialTroops !== o.troops ||
          unit.force !== o.force ||
          unit.intellect !== o.intellect ||
          unit.troopType !== o.troopType
        )
          return 'Battle attributes differ from their committed officer.';
      } else if (
        unit.initialTroops !== destination.reserve ||
        unit.troopType !== 'guard' ||
        unit.force !== 40 + Math.floor(destination.defense / 10) ||
        unit.intellect !== 40
      )
        return 'The militia differs from the city garrison.';
      if (unit.troops > 0) {
        const position = `${unit.x},${unit.y}`;
        if (occupied.has(position)) return 'Living battle units overlap.';
        occupied.add(position);
      }
    }
    if (b.order.officerIds.some((id) => !combatOfficers.has(id)))
      return 'A committed commander is missing from the battlefield.';
    if (
      !b.units.some((u) => u.side === 'attacker' && u.troops > 0) ||
      !b.units.some((u) => u.side === 'defender' && u.troops > 0)
    )
      return 'A completed battle must be resolved before saving.';
  } else if (
    state.battle !== null ||
    state.resolution !== null ||
    !['planning', 'finished'].includes(state.phase)
  )
    return 'The campaign phase is inconsistent.';
  if (state.resolution) {
    const r = state.resolution;
    if (
      !Array.isArray(r.queue) ||
      r.queue.length > state.officers.length ||
      !integral(r.index, 0, r.queue.length)
    )
      return 'Invalid order-resolution cursor.';
    const ids = new Set<string>(),
      commanders = new Set<string>();
    for (const order of r.queue) {
      const error = validateOrder(order, false);
      if (error) return error;
      if (ids.has(order.id)) return 'Duplicate queued order.';
      ids.add(order.id);
      for (const id of order.officerIds) {
        if (commanders.has(id)) return 'An officer belongs to multiple pending armies.';
        commanders.add(id);
      }
    }
  }
  if (state.phase === 'finished') {
    const owned = state.cities.filter((c) => c.factionId === state.playerFactionId).length;
    if (owned !== 0 && owned !== state.cities.length)
      return 'The campaign is marked finished without victory or defeat.';
    if (
      !state.winner ||
      !factions.has(state.winner) ||
      (owned === state.cities.length && state.winner !== state.playerFactionId) ||
      state.orders.length
    )
      return 'Invalid campaign winner.';
  } else if (state.winner !== null) return 'An unfinished campaign cannot have a winner.';
  if (
    !state.stats ||
    !Object.values(state.stats).every((n) => integral(n, 0, Number.MAX_SAFE_INTEGER))
  )
    return 'Invalid campaign statistics.';
  if (
    state.log.length > 100 ||
    state.log.some(
      (entry) =>
        !integral(entry.id, 1, state.nextId - 1) ||
        !integral(entry.turn, 0, state.turn) ||
        typeof entry.text !== 'string' ||
        entry.text.length > 2000 ||
        !['economy', 'military', 'diplomacy', 'event', 'good', 'bad'].includes(entry.kind),
    )
  )
    return 'Invalid chronicle entries.';
  return null;
}
