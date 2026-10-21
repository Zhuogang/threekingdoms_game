import {
  advanceBattleDay,
  applyBattleAction,
  createTacticalBattle,
  runBattleAiTurn,
  type BattleRegion,
  type BattleRosterEntry,
  type TacticalBattleUnit,
  type V03TacticalBattleState,
} from './battle';
import { createBattleMap } from './battle/maps';
import {
  advanceTimeline,
  completeMonthSettlement,
  type AdvanceMode,
  type StrategicTimeline,
} from './calendar/day-resolution';
import {
  beginJourneyReturn,
  calendarDateAt,
  DAYS_PER_MONTH,
  estimateCampaignSupply,
  PILOT_LOGISTICS_RATES,
  type ScheduledEvent,
} from './calendar';
import { CITY_GEOGRAPHY_BY_ID, ROUTE_DEFINITIONS, type CityId } from './geography';
import { createV03OrderServices } from './governance/services';
import { refreshWaitingOrders } from './governance/orders';
import { applyGovernanceMonthBoundary } from './governance/appointments';
import { planStrategicRivalCampaigns, type StrategicRivalCampaignPlan } from './strategic-ai';
import type {
  V03BattleState,
  V03CampaignDirective,
  V03City,
  V03DomainEvent,
  V03GameState,
  V03Journey,
  V03Officer,
  TroopType,
} from './types';

const RESOURCE_CAP = 9_999_999;
const FOOD_MICRO = 1_000_000;
const ACTIVE_CAMPAIGN_ORDER_STATUSES = [
  'requested',
  'proposed',
  'waiting',
  'accepted',
  'reserved',
  'dispatched',
] as const;

function isActiveCampaignStatus(status: V03CampaignDirective['status']): boolean {
  return ACTIVE_CAMPAIGN_ORDER_STATUSES.includes(
    status as (typeof ACTIVE_CAMPAIGN_ORDER_STATUSES)[number],
  );
}

function cloneState(state: V03GameState): V03GameState {
  return structuredClone(state);
}

function pushLog(state: V03GameState, message: string): void {
  state.log.push(message);
  if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}

function addEvent(
  state: V03GameState,
  kind: V03DomainEvent['kind'],
  title: string,
  detail: string,
  entityId: string | null,
  absoluteDay = state.absoluteDay,
): void {
  const id = `${state.scenarioId}:${kind}:${absoluteDay}:${state.nextId}`;
  state.events.push({ id, absoluteDay, kind, title, detail, entityId, acknowledged: false });
  state.nextId++;
}

function toTimeline(state: V03GameState): StrategicTimeline {
  const events: ScheduledEvent[] = state.events
    .filter((event) => !event.acknowledged)
    .map((event) => ({
      id: event.id,
      absoluteDay: event.absoluteDay,
      kind:
        event.kind === 'journeyArrival'
          ? 'arrival'
          : event.kind === 'battleReady'
            ? 'battle'
            : 'decision',
      pause: true,
      visibleToPlayer: true,
    }));
  for (const journey of state.journeys) {
    if (journey.status !== 'outbound' && journey.status !== 'returning') continue;
    const id = `arrival:${journey.id}`;
    if (events.some((event) => event.id === id)) continue;
    events.push({
      id,
      absoluteDay: journey.expectedArrivalDay,
      kind: 'arrival',
      pause: true,
      visibleToPlayer: true,
    });
  }
  return {
    startYear: state.startYear,
    absoluteDay: state.absoluteDay,
    journeys: state.journeys,
    dayResolution: state.dayResolution,
    events,
  };
}

function applyTimeline(state: V03GameState, timeline: StrategicTimeline): void {
  state.absoluteDay = timeline.absoluteDay;
  state.monthIndex = Math.floor(timeline.absoluteDay / DAYS_PER_MONTH);
  state.journeys = timeline.journeys as V03Journey[];
  state.dayResolution = timeline.dayResolution;
}

function cityRegion(cityId: string): BattleRegion {
  if (['hanzhong', 'changan', 'tianshui'].includes(cityId)) return 'hanzhong';
  if (
    ['shouchun', 'jianye', 'wu', 'chaisang', 'jiangxia', 'jiangling', 'xiangyang'].includes(cityId)
  )
    return 'shouchun';
  if (['chengdu', 'jiangzhou', 'zitong'].includes(cityId)) return 'chengdu';
  return 'xiapi';
}

function approachBetween(
  sourceCityId: string,
  targetCityId: string,
): 'north' | 'east' | 'south' | 'west' {
  const source = CITY_GEOGRAPHY_BY_ID.get(sourceCityId as CityId);
  const target = CITY_GEOGRAPHY_BY_ID.get(targetCityId as CityId);
  if (!source || !target) return 'west';
  const dx = target.longitude - source.longitude;
  const dy = target.latitude - source.latitude;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'west' : 'east';
  return dy > 0 ? 'south' : 'north';
}

interface FormationGroup {
  type: TroopType;
  officers: V03Officer[];
  troops: number;
}

function groupOfficers(officers: readonly V03Officer[]): FormationGroup[] {
  const groups = new Map<TroopType, FormationGroup>();
  for (const officer of officers) {
    if (officer.troops <= 0) continue;
    const group = groups.get(officer.troopType) ?? {
      type: officer.troopType,
      officers: [],
      troops: 0,
    };
    group.officers.push(officer);
    group.troops += officer.troops;
    groups.set(officer.troopType, group);
  }
  return [...groups.values()].sort((a, b) => a.type.localeCompare(b.type));
}

function rosterFromGroups(
  groups: readonly FormationGroup[],
  prefix: string,
): {
  roster: BattleRosterEntry[];
  membership: Record<string, string[]>;
} {
  const membership: Record<string, string[]> = {};
  const roster = groups.map((group) => {
    const id = `${prefix}:${group.type}`;
    membership[id] = group.officers.map((officer) => officer.id);
    const leaders = group.officers.map((officer) => officer.name).join(', ');
    const name =
      group.type === 'infantry'
        ? 'Infantry'
        : group.type === 'cavalry'
          ? 'Cavalry'
          : group.type === 'archer'
            ? 'Archers'
            : group.type;
    return {
      id,
      name: leaders ? `${name} · ${leaders}` : name,
      troopType: group.type,
      troops: group.troops,
      force: group.officers.length
        ? Math.round(
            group.officers.reduce((sum, officer) => sum + officer.force, 0) / group.officers.length,
          )
        : 45,
      attackRange: group.type === 'archer' ? 3 : undefined,
    } satisfies BattleRosterEntry;
  });
  return { roster, membership };
}

function allocateSurvivors(
  unit: TacticalBattleUnit,
  memberIds: readonly string[],
  officers: V03Officer[],
): void {
  if (memberIds.length === 0) return;
  const members = memberIds
    .map((id) => officers.find((officer) => officer.id === id))
    .filter((officer): officer is V03Officer => Boolean(officer));
  const original = members.map((officer) => officer.troops);
  const originalTotal = original.reduce((sum, troops) => sum + troops, 0);
  if (originalTotal <= 0) return;
  const surviving = Math.max(0, Math.min(originalTotal, unit.troops));
  const shares = members.map((officer, index) => {
    const exact = (original[index]! * surviving) / originalTotal;
    return { officer, troops: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remainder = surviving - shares.reduce((sum, share) => sum + share.troops, 0);
  shares.sort((a, b) => b.fraction - a.fraction || a.officer.id.localeCompare(b.officer.id));
  for (const share of shares) {
    if (remainder <= 0) break;
    share.troops++;
    remainder--;
  }
  for (const share of shares) share.officer.troops = share.troops;
}

function chargeBattleRations(battle: V03BattleState): void {
  const data = battle.battleData;
  for (const side of ['attacker', 'defender'] as const) {
    const living = data.units.filter((unit) => unit.side === side && unit.troops > 0);
    const totalTroops = living.reduce((sum, unit) => sum + unit.troops, 0);
    const foodKey = side === 'attacker' ? 'attackerFood' : 'defenderFood';
    const remainderKey =
      side === 'attacker' ? 'attackerFoodRemainderMicro' : 'defenderFoodRemainderMicro';
    const demandMicro =
      Math.round(PILOT_LOGISTICS_RATES.battleFoodPerTroopDay * FOOD_MICRO) * totalTroops +
      battle[remainderKey];
    const demandFood = Math.floor(demandMicro / FOOD_MICRO);
    const paid = Math.min(battle[foodKey], demandFood);
    battle[foodKey] -= paid;
    const shortage = demandFood - paid;
    battle[remainderKey] = shortage > 0 ? 0 : demandMicro - paid * FOOD_MICRO;
    if (shortage > 0 && living.length > 0) {
      battle.foodShortfallDays++;
      for (const unit of living) {
        unit.troops = Math.max(0, unit.troops - Math.max(1, Math.ceil(unit.troops * 0.01)));
        unit.morale = Math.max(0, unit.morale - 5);
      }
      data.log.push(`${side} forces lack rations; the hungry units lose men and morale.`);
    }
  }
}

function finishBattle(state: V03GameState, battle: V03BattleState): void {
  const outcome = battle.battleData.outcome;
  if (battle.resolved || !outcome) return;
  const data = battle.battleData;
  const attackerWon = outcome.winner === 'attacker';
  const defenderWon = outcome.winner === 'defender';
  const targetJourney = state.journeys.find((journey) => journey.id === battle.attackerJourneyId);
  const target =
    targetJourney && state.cities.find((city) => city.id === targetJourney.destinationCityId);
  const attackerFaction = state.factions.find((faction) => faction.id === battle.attackerFactionId);
  const defenderFactionId = battle.defenderFactionId;
  if (!target || !targetJourney || !attackerFaction) {
    battle.active = false;
    battle.resolved = true;
    battle.outcome = outcome.winner ?? 'draw';
    return;
  }

  const attackerGroups = data.units.filter((unit) => unit.side === 'attacker');
  const defenderGroups = data.units.filter((unit) => unit.side === 'defender');
  for (const unit of attackerGroups)
    allocateSurvivors(unit, battle.attackerFormationOfficerIds[unit.id] ?? [], state.officers);
  for (const unit of defenderGroups)
    allocateSurvivors(unit, battle.defenderFormationOfficerIds[unit.id] ?? [], state.officers);

  const attackerSurvivors = attackerGroups.reduce((sum, unit) => sum + unit.troops, 0);
  const defenderSurvivors = defenderGroups.reduce((sum, unit) => sum + unit.troops, 0);
  const oldOwner = target.factionId;
  const returnAttackers = (loot: { gold: number; food: number } | null = null) => {
    const returnManifest = {
      ...targetJourney.manifest,
      troopCount: attackerSurvivors,
      officerIds: targetJourney.manifest.officerIds.filter((id) => {
        const officer = state.officers.find((entry) => entry.id === id);
        return Boolean(officer && officer.troops > 0);
      }),
      carriedFood: battle.attackerFood,
      cargo: {
        ...targetJourney.manifest.cargo,
        gold: (targetJourney.manifest.cargo.gold ?? 0) + (loot?.gold ?? 0),
        food: (targetJourney.manifest.cargo.food ?? 0) + (loot?.food ?? 0),
        troops: 0,
      },
    };
    if (attackerSurvivors > 0) {
      const returning = beginJourneyReturn(targetJourney, state.absoluteDay, returnManifest);
      targetJourney.status = 'cancelled';
      const returnJourney = {
        ...returning,
        id: `${targetJourney.id}:return`,
        executionId: `${targetJourney.executionId}:return`,
        kind: 'return' as const,
      };
      state.journeys.push(returnJourney);
      for (const officerId of returnManifest.officerIds) {
        const officer = state.officers.find((entry) => entry.id === officerId);
        if (officer) officer.location = { kind: 'journey', journeyId: returnJourney.id };
      }
    }
    for (const officer of state.officers) {
      if (
        officer.location.kind === 'battle' &&
        officer.location.battleId === battle.id &&
        officer.factionId === battle.attackerFactionId
      ) {
        officer.location =
          attackerSurvivors > 0 && officer.troops > 0
            ? { kind: 'journey', journeyId: `${targetJourney.id}:return` }
            : { kind: 'captured', cityId: target.id };
      }
    }
  };
  const applyPlunder = (recipient: V03City): { gold: number; food: number } | null => {
    if (state.absoluteDay < (target.plunderCooldownUntilDay ?? 0)) return null;
    const leaders = state.officers.filter(
      (officer) =>
        officer.factionId === battle.attackerFactionId &&
        battle.attackerFormationOfficerIds &&
        Object.values(battle.attackerFormationOfficerIds).some((ids) => ids.includes(officer.id)),
    );
    const leader = leaders.sort(
      (a, b) => b.force + b.intellect - (a.force + a.intellect) || a.id.localeCompare(b.id),
    )[0];
    if (!leader) return null;
    const power = leader.force + leader.intellect;
    const gold = Math.floor(2 * power + Math.floor(target.commerce * 1.5));
    const food = 5 * power + Math.floor(target.farming * 4);
    recipient.gold = Math.min(RESOURCE_CAP, recipient.gold + gold);
    recipient.food = Math.min(RESOURCE_CAP, recipient.food + food);
    target.loyalty = Math.floor(target.loyalty / 2);
    target.farming = Math.floor(target.farming / 2);
    target.commerce = Math.floor(target.commerce / 2);
    target.population = Math.min(
      target.population,
      Math.max(500, Math.floor(target.population * 0.92)),
    );
    target.plunderCooldownUntilDay = state.absoluteDay + 90;
    return { gold, food };
  };

  if (attackerWon && battle.intent === 'raid') {
    target.garrisonTroops = defenderSurvivors;
    target.food = Math.min(RESOURCE_CAP, battle.defenderFood);
    for (const officer of state.officers) {
      if (
        officer.location.kind === 'battle' &&
        officer.location.battleId === battle.id &&
        officer.factionId === defenderFactionId
      ) {
        officer.location =
          officer.troops > 0
            ? { kind: 'city', cityId: target.id }
            : { kind: 'captured', cityId: target.id };
      }
    }
    const home =
      state.cities.find(
        (city) =>
          city.id === targetJourney.sourceCityId && city.factionId === battle.attackerFactionId,
      ) ??
      state.cities
        .filter((city) => city.factionId === battle.attackerFactionId)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
    battle.loot = home ? applyPlunder(home) : null;
    returnAttackers(battle.loot);
  } else if (attackerWon) {
    target.factionId = battle.attackerFactionId;
    target.governorId = null;
    target.governanceMode = target.id === attackerFaction.capitalCityId ? 'ruler' : 'steward';
    target.pendingAppointment = null;
    target.garrisonTroops = attackerSurvivors;
    target.food = Math.min(RESOURCE_CAP, target.food + battle.attackerFood + battle.defenderFood);
    if (battle.intent === 'sack') battle.loot = applyPlunder(target);
    const formerOwner = state.factions.find((faction) => faction.id === oldOwner);
    if (
      formerOwner &&
      oldOwner !== battle.attackerFactionId &&
      formerOwner.capitalCityId === target.id
    ) {
      const newCapital = state.cities.find(
        (city) => city.factionId === formerOwner.id && city.id !== target.id,
      );
      if (newCapital) {
        formerOwner.capitalCityId = newCapital.id;
        newCapital.governanceMode = 'ruler';
        newCapital.governorId = null;
        newCapital.pendingAppointment = null;
        if (formerOwner.id === state.playerFactionId) {
          state.playerCapitalCityId = newCapital.id;
        }
      } else formerOwner.eliminated = true;
    }
    if (oldOwner) {
      const formerOwner = state.factions.find((faction) => faction.id === oldOwner);
      if (formerOwner && !state.cities.some((city) => city.factionId === oldOwner))
        formerOwner.eliminated = true;
    }
    for (const officer of state.officers) {
      if (officer.location.kind === 'battle' && officer.location.battleId === battle.id) {
        if (officer.factionId === battle.attackerFactionId && officer.troops > 0)
          officer.location = { kind: 'city', cityId: target.id };
        else officer.location = { kind: 'captured', cityId: target.id };
      }
    }
    attackerFaction.isPlayer &&
      pushLog(state, `${target.name} is captured after the field battle.`);
  } else {
    target.food = Math.min(RESOURCE_CAP, target.food + battle.defenderFood);
    target.garrisonTroops = defenderSurvivors;
    for (const officer of state.officers) {
      if (
        officer.location.kind === 'battle' &&
        officer.location.battleId === battle.id &&
        officer.factionId === defenderFactionId
      ) {
        officer.location =
          officer.troops > 0
            ? { kind: 'city', cityId: target.id }
            : { kind: 'captured', cityId: target.id };
      }
    }
    if (attackerSurvivors > 0) returnAttackers();
    else {
      target.food = Math.min(RESOURCE_CAP, target.food + battle.attackerFood);
      for (const officer of state.officers) {
        if (
          officer.location.kind === 'battle' &&
          officer.location.battleId === battle.id &&
          officer.factionId === battle.attackerFactionId
        ) {
          officer.location = { kind: 'captured', cityId: target.id };
        }
      }
    }
  }
  battle.active = false;
  battle.resolved = true;
  battle.outcome = outcome.winner ?? 'draw';
  battle.absoluteDay = state.absoluteDay;
  addEvent(
    state,
    'battleResolved',
    attackerWon ? 'Field victory' : defenderWon ? 'Field defeat' : 'Battle drawn',
    attackerWon
      ? `${attackerFaction.name} wins the field at ${target.name}.`
      : defenderWon
        ? `${attackerFactionName(state, defenderFactionId)} wins the field at ${target.name}.`
        : `The forces draw at ${target.name}; the defender keeps control of the city.`,
    battle.id,
  );
}

function openBattle(state: V03GameState, journey: V03Journey): void {
  const target = state.cities.find((city) => city.id === journey.destinationCityId);
  if (!target || target.factionId === journey.ownerFactionId || journey.kind !== 'campaign') return;
  const attackers = journey.manifest.officerIds
    .map((id) => state.officers.find((officer) => officer.id === id))
    .filter((officer): officer is V03Officer => Boolean(officer && officer.alive));
  if (!attackers.length) {
    journey.status = 'waiting';
    addEvent(
      state,
      'journeyArrival',
      'Army arrived without a commander',
      `The army reached ${target.name}, but no living commander is available.`,
      journey.id,
    );
    return;
  }
  const defenders = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.factionId === target.factionId &&
      officer.location.kind === 'city' &&
      officer.location.cityId === target.id &&
      officer.troops > 0,
  );
  const attacker = rosterFromGroups(groupOfficers(attackers), `${journey.id}:attack`);
  const defenderGroups = groupOfficers(defenders);
  const staffedTroops = defenderGroups.reduce((sum, group) => sum + group.troops, 0);
  const militia = Math.max(0, target.garrisonTroops - staffedTroops);
  if (militia > 0 || defenderGroups.length === 0) {
    defenderGroups.push({
      type: 'infantry',
      officers: [],
      troops: Math.max(
        militia,
        defenderGroups.length === 0 ? Math.max(500, target.garrisonTroops) : 0,
      ),
    });
  }
  const defender = rosterFromGroups(defenderGroups, `${journey.id}:defend`);
  const id = `battle-${state.nextId}`;
  const region = cityRegion(target.id);
  const map = createBattleMap({
    regionId: region,
    approachDirection: approachBetween(journey.sourceCityId, journey.destinationCityId),
    seed: state.rng + state.nextId,
  });
  const tactical = createTacticalBattle({
    id,
    map,
    attackerUnits: attacker.roster,
    defenderUnits: defender.roster,
    playerSide: journey.ownerFactionId === state.playerFactionId ? 'attacker' : 'defender',
    dayLimit: journey.intent === 'raid' ? 10 : 30,
    timeoutPolicy: 'survivor-count',
  });
  const battle: V03BattleState = {
    id,
    mapId: map.mapId,
    mapVersion: map.templateVersion,
    seed: map.seed,
    absoluteDay: state.absoluteDay,
    attackerFactionId: journey.ownerFactionId,
    defenderFactionId: target.factionId,
    attackerJourneyId: journey.id,
    defenderJourneyId: null,
    intent: journey.intent ?? 'conquer',
    active: true,
    resolved: false,
    outcome: null,
    loot: null,
    battleData: tactical,
    attackerFood: journey.manifest.carriedFood,
    defenderFood: target.food,
    attackerFoodRemainderMicro: 0,
    defenderFoodRemainderMicro: 0,
    foodShortfallDays: 0,
    attackerFormationOfficerIds: attacker.membership,
    defenderFormationOfficerIds: defender.membership,
  };
  journey.manifest = { ...journey.manifest, carriedFood: 0 };
  target.food = 0;
  for (const officer of [...attackers, ...defenders])
    officer.location = { kind: 'battle', battleId: id };
  state.battles.push(battle);
  state.phase = 'battle';
  state.nextId++;
  addEvent(
    state,
    'battleReady',
    'Field battle begins',
    `${attackerFactionName(state, battle.attackerFactionId)} has met ${attackerFactionName(state, battle.defenderFactionId)} near ${target.name}.`,
    battle.id,
  );
}

function attackerFactionName(state: V03GameState, factionId: string | null): string {
  return (
    (factionId && state.factions.find((faction) => faction.id === factionId)?.name) ??
    'Independent defenders'
  );
}

/** Pick a deterministic first hop along the shortest geography route to any friendly city. */
function friendlyRefugeHop(
  state: V03GameState,
  fromCityId: string,
  factionId: string,
): string | null {
  const frontier = new Set([fromCityId]);
  const distance = new Map([[fromCityId, 0]]);
  const firstHop = new Map<string, string>();
  const settled = new Set<string>();
  while (frontier.size) {
    const current = [...frontier].sort(
      (a, b) => distance.get(a)! - distance.get(b)! || a.localeCompare(b),
    )[0]!;
    frontier.delete(current);
    if (settled.has(current)) continue;
    settled.add(current);
    if (
      current !== fromCityId &&
      state.cities.find((city) => city.id === current)?.factionId === factionId
    )
      return firstHop.get(current) ?? null;
    for (const route of ROUTE_DEFINITIONS.filter(
      (entry) => entry.fromCityId === current || entry.toCityId === current,
    ).sort((a, b) => a.id.localeCompare(b.id))) {
      const next = route.fromCityId === current ? route.toCityId : route.fromCityId;
      if (settled.has(next)) continue;
      const candidate = distance.get(current)! + route.roadKmNominal;
      const previous = distance.get(next);
      const hop = current === fromCityId ? next : firstHop.get(current)!;
      if (
        previous === undefined ||
        candidate < previous ||
        (candidate === previous && hop.localeCompare(firstHop.get(next) ?? '\uffff') < 0)
      ) {
        distance.set(next, candidate);
        firstHop.set(next, hop);
        frontier.add(next);
      }
    }
  }
  return null;
}

/** Keep a returning party and its cargo when the named refuge changed hands. */
function redirectJourneyToFriendlyCity(state: V03GameState, journey: V03Journey): boolean {
  const hop = friendlyRefugeHop(state, journey.destinationCityId, journey.ownerFactionId);
  if (!hop) return false;
  const services = createV03OrderServices();
  const route = services.planRoute({
    state,
    sourceCityId: journey.destinationCityId,
    targetCityId: hop,
    departureDay: state.absoluteDay,
    troopCount: journey.manifest.troopCount,
    kind: 'requisition',
    composition: journey.manifest.composition,
  });
  if (!route) return false;
  const id = `${journey.id}:redirect:${state.nextId}`;
  const redirected = services.createJourney({
    id,
    executionId: `${journey.executionId}:redirect`,
    ownerFactionId: journey.ownerFactionId,
    kind: 'requisition',
    sourceCityId: journey.destinationCityId,
    targetCityId: hop,
    departureDay: state.absoluteDay,
    arrivalDay: state.absoluteDay + route.estimatedDays,
    route,
    party: {
      officerIds: journey.manifest.officerIds,
      troopCount: journey.manifest.troopCount,
      composition: journey.manifest.composition,
    },
    cargo: {
      gold: journey.manifest.cargo.gold ?? 0,
      food: journey.manifest.cargo.food ?? 0,
      troops: journey.manifest.cargo.troops ?? 0,
    },
    carriedFood: journey.manifest.carriedFood,
  });
  journey.status = 'cancelled';
  state.journeys.push({ ...redirected, kind: 'return' });
  for (const officerId of journey.manifest.officerIds) {
    const officer = state.officers.find((entry) => entry.id === officerId);
    if (officer) officer.location = { kind: 'journey', journeyId: id };
  }
  state.nextId++;
  return true;
}

function handleArrivals(state: V03GameState, previous: readonly V03Journey[]): void {
  const previousStatuses = new Map(previous.map((journey) => [journey.id, journey.status]));
  for (const journey of state.journeys) {
    if (journey.status !== 'waiting') continue;
    if (
      state.cities.find((city) => city.id === journey.destinationCityId)?.factionId ===
      journey.ownerFactionId
    ) {
      journey.status = 'delivered';
    }
  }
  const arriving = state.journeys
    .filter(
      (journey) =>
        journey.status === 'delivered' && previousStatuses.get(journey.id) !== 'delivered',
    )
    .sort((a, b) => a.expectedArrivalDay - b.expectedArrivalDay || a.id.localeCompare(b.id));
  for (const journey of arriving) {
    const target = state.cities.find((city) => city.id === journey.destinationCityId);
    if (!target) {
      journey.status = 'waiting';
      addEvent(
        state,
        'journeyArrival',
        'Destination unavailable',
        'The destination no longer exists; the party and cargo remain recorded in a waiting journey.',
        journey.id,
      );
      continue;
    }
    if (journey.kind === 'campaign') {
      const directive = state.directives.find((entry) => entry.journeyId === journey.id);
      if (target.factionId === journey.ownerFactionId) {
        target.gold = Math.min(RESOURCE_CAP, target.gold + (journey.manifest.cargo.gold ?? 0));
        target.food = Math.min(
          RESOURCE_CAP,
          target.food + (journey.manifest.cargo.food ?? 0) + journey.manifest.carriedFood,
        );
        target.garrisonTroops += Math.max(
          journey.manifest.troopCount,
          journey.manifest.cargo.troops ?? 0,
        );
        for (const officerId of journey.manifest.officerIds) {
          const officer = state.officers.find((entry) => entry.id === officerId);
          if (officer) officer.location = { kind: 'city', cityId: target.id };
        }
        if (directive) directive.status = 'delivered';
        addEvent(
          state,
          'journeyArrival',
          'March arrived safely',
          `The campaign party joined friendly ${target.name}; the city changed hands before the battle began.`,
          journey.id,
        );
        continue;
      }
      if (directive) directive.status = 'delivered';
      openBattle(state, journey);
      continue;
    }
    if (target.factionId !== journey.ownerFactionId) {
      const order = state.requisitions.find((entry) => entry.journeyId === journey.id);
      if (order) {
        order.status = 'failed';
        order.message =
          'The destination changed hands during travel; the cargo is returning to friendly territory.';
      }
      if (redirectJourneyToFriendlyCity(state, journey)) {
        addEvent(
          state,
          'journeyArrival',
          'Route redirected',
          `The party reached ${target.name}, which is no longer friendly. It is returning to friendly territory.`,
          journey.id,
        );
      } else {
        journey.status = 'waiting';
        addEvent(
          state,
          'journeyArrival',
          'Party awaiting refuge',
          `The party reached ${target.name}, but no friendly city is currently reachable. Its cargo and officers remain in a waiting journey.`,
          journey.id,
        );
      }
      continue;
    }
    const cargo = journey.manifest.cargo;
    target.gold = Math.min(RESOURCE_CAP, target.gold + (cargo.gold ?? 0));
    target.food = Math.min(
      RESOURCE_CAP,
      target.food + (cargo.food ?? 0) + journey.manifest.carriedFood,
    );
    target.garrisonTroops += Math.max(journey.manifest.troopCount, cargo.troops ?? 0);
    for (const officerId of journey.manifest.officerIds) {
      const officer = state.officers.find((entry) => entry.id === officerId);
      if (officer) officer.location = { kind: 'city', cityId: target.id };
    }
    if (target.pendingAppointment?.journeyId === journey.id) {
      target.pendingAppointment.effectiveDay = Math.max(
        target.pendingAppointment.effectiveDay,
        Math.ceil((state.absoluteDay + 1) / DAYS_PER_MONTH) * DAYS_PER_MONTH,
      );
    }
    const requisition = state.requisitions.find((entry) => entry.journeyId === journey.id);
    if (requisition) requisition.status = 'delivered';
    addEvent(
      state,
      'journeyArrival',
      'Journey arrived',
      `A party has arrived in ${target.name}.`,
      journey.id,
    );
  }
}

function reservedCampaignTroops(state: V03GameState, cityId: string): number {
  const activeReservation = (status: string) =>
    status === 'accepted' || status === 'reserved' || status === 'dispatched';
  const requisitions = state.requisitions
    .filter(
      (order) =>
        order.sourceCityId === cityId &&
        order.journeyId === null &&
        activeReservation(order.status),
    )
    .reduce((sum, order) => sum + order.proposed.troops, 0);
  const directives = state.directives
    .filter(
      (order) =>
        order.sourceCityId === cityId &&
        order.journeyId === null &&
        activeReservation(order.status),
    )
    .reduce((sum, order) => sum + order.proposedTroops, 0);
  return requisitions + directives;
}

function reservedCampaignFood(state: V03GameState, cityId: string): number {
  return state.requisitions
    .filter(
      (order) =>
        order.sourceCityId === cityId &&
        order.journeyId === null &&
        (order.status === 'accepted' ||
          order.status === 'reserved' ||
          order.status === 'dispatched'),
    )
    .reduce((sum, order) => sum + order.proposed.food, 0);
}

function isCampaignJourneyActive(journey: V03Journey): boolean {
  return (
    journey.kind === 'campaign' &&
    (journey.status === 'outbound' ||
      journey.status === 'returning' ||
      journey.status === 'waiting')
  );
}

function hasConflictingRivalOperation(
  state: V03GameState,
  sourceCityId: string,
  targetCityId: string,
): boolean {
  if (
    state.directives.some(
      (directive) =>
        isActiveCampaignStatus(directive.status) &&
        (directive.sourceCityId === sourceCityId || directive.targetCityId === targetCityId),
    )
  )
    return true;
  if (
    state.journeys.some(
      (journey) =>
        isCampaignJourneyActive(journey) &&
        (journey.sourceCityId === sourceCityId || journey.destinationCityId === targetCityId),
    )
  )
    return true;
  return state.battles.some((battle) => {
    if (!battle.active || battle.resolved) return false;
    return [battle.attackerJourneyId, battle.defenderJourneyId].some((journeyId) => {
      if (!journeyId) return false;
      return (
        state.journeys.find((journey) => journey.id === journeyId)?.destinationCityId ===
        targetCityId
      );
    });
  });
}

function dispatchRivalCampaignPlan(
  state: V03GameState,
  plan: StrategicRivalCampaignPlan,
  alreadyAssignedOfficerIds: Set<string>,
): boolean {
  const faction = state.factions.find((entry) => entry.id === plan.factionId);
  const source = state.cities.find((entry) => entry.id === plan.sourceCityId);
  const target = state.cities.find((entry) => entry.id === plan.targetCityId);
  if (
    !faction ||
    faction.isPlayer ||
    faction.eliminated ||
    plan.factionId === state.playerFactionId ||
    !source ||
    source.factionId !== plan.factionId ||
    !target ||
    !target.factionId ||
    target.factionId === plan.factionId ||
    state.factions.find((entry) => entry.id === target.factionId)?.eliminated ||
    plan.departureDay !== state.absoluteDay ||
    plan.intent !== 'conquer' ||
    hasConflictingRivalOperation(state, plan.sourceCityId, plan.targetCityId)
  )
    return false;

  const officerIds = [...plan.party.officerIds];
  if (
    officerIds.length === 0 ||
    officerIds.length > 10 ||
    new Set(officerIds).size !== officerIds.length ||
    officerIds.some((id) => alreadyAssignedOfficerIds.has(id)) ||
    plan.officerIds.length !== officerIds.length ||
    plan.officerIds.some((id, index) => id !== officerIds[index]) ||
    plan.party.troopCount !== plan.requestedTroops ||
    plan.requestedTroops !== plan.proposedTroops ||
    !Number.isSafeInteger(plan.requestedTroops) ||
    plan.requestedTroops <= 0 ||
    plan.party.composition.troopTypes.length !== officerIds.length ||
    plan.party.composition.heavySupplyTrain !== true
  )
    return false;

  const officers = officerIds.map((id) => state.officers.find((entry) => entry.id === id));
  if (
    officers.some(
      (officer) =>
        !officer ||
        !officer.alive ||
        officer.factionId !== plan.factionId ||
        officer.location.kind !== 'city' ||
        officer.location.cityId !== plan.sourceCityId ||
        officer.troops <= 0,
    )
  )
    return false;
  const rosteredTroops = officers.reduce((sum, officer) => sum + (officer?.troops ?? 0), 0);
  if (
    rosteredTroops !== plan.requestedTroops ||
    officers.some(
      (officer, index) => officer?.troopType !== plan.party.composition.troopTypes[index],
    )
  )
    return false;

  const protectedGarrison = Math.min(1000, Math.ceil(source.garrisonTroops * 0.35));
  if (
    source.garrisonTroops - reservedCampaignTroops(state, source.id) - plan.requestedTroops <
    protectedGarrison
  )
    return false;

  const supply = estimateCampaignSupply({
    troopCount: plan.requestedTroops,
    outboundDays: plan.route.estimatedDays,
    battleDays: 30,
    returnDays: plan.route.estimatedDays,
  });
  if (
    plan.food !== supply.totalFood ||
    plan.supply.totalFood !== supply.totalFood ||
    source.food - reservedCampaignFood(state, source.id) < plan.food
  )
    return false;

  const directiveId = `${state.scenarioId}:directive:${state.nextId}`;
  const journeyId = `${state.scenarioId}:journey:${state.nextId + 1}`;
  let journey: V03Journey;
  try {
    journey = createV03OrderServices().createJourney({
      id: journeyId,
      executionId: directiveId,
      ownerFactionId: plan.factionId,
      kind: 'campaign',
      intent: plan.intent,
      sourceCityId: plan.sourceCityId,
      targetCityId: plan.targetCityId,
      departureDay: state.absoluteDay,
      arrivalDay: plan.estimatedArrivalDay,
      route: plan.route,
      party: plan.party,
      cargo: { gold: 0, food: 0, troops: plan.requestedTroops },
      carriedFood: plan.food,
    });
  } catch {
    return false;
  }
  if (
    journey.id !== journeyId ||
    journey.executionId !== directiveId ||
    journey.ownerFactionId !== plan.factionId ||
    journey.kind !== 'campaign' ||
    journey.expectedArrivalDay !== plan.estimatedArrivalDay ||
    journey.manifest.troopCount !== plan.requestedTroops ||
    journey.manifest.carriedFood !== plan.food ||
    journey.manifest.officerIds.length !== officerIds.length ||
    journey.manifest.officerIds.some((id, index) => id !== officerIds[index])
  )
    return false;

  const directive: V03CampaignDirective = {
    id: directiveId,
    factionId: plan.factionId,
    sourceCityId: plan.sourceCityId,
    targetCityId: plan.targetCityId,
    intent: plan.intent,
    requestedTroops: plan.requestedTroops,
    proposedTroops: plan.proposedTroops,
    requestedByDay: null,
    earliestDepartureDay: state.absoluteDay,
    estimatedArrivalDay: plan.estimatedArrivalDay,
    status: 'dispatched',
    journeyId,
    governanceRevision: state.governanceRevision,
    message: 'The rival faction dispatched its campaign force from this city.',
  };

  source.food -= plan.food;
  source.garrisonTroops -= plan.requestedTroops;
  for (const officer of officers) {
    officer!.location = { kind: 'journey', journeyId };
    alreadyAssignedOfficerIds.add(officer!.id);
  }
  state.directives.push(directive);
  state.journeys.push(journey);
  state.nextId += 2;
  pushLog(
    state,
    `${faction.name} dispatched ${plan.requestedTroops} troops from ${source.name} toward ${target.name}; ${plan.food} food is committed for the march and campaign.`,
  );
  return true;
}

function dispatchMonthlyRivalCampaigns(state: V03GameState): void {
  // Monthly strategic decisions continue while the global UI is in a manual battle.
  const planningSnapshot =
    state.phase === 'planning' ? state : { ...state, phase: 'planning' as const };
  const plans = planStrategicRivalCampaigns(planningSnapshot);
  const assignedOfficerIds = new Set<string>();
  for (const plan of plans) dispatchRivalCampaignPlan(state, plan, assignedOfficerIds);
}

function settleMonth(state: V03GameState, year: number, month: number): V03GameState {
  const next = cloneState(state);
  for (const city of next.cities) {
    if (!city.factionId) continue;
    const serving = next.officers.filter(
      (officer) =>
        officer.alive &&
        officer.factionId === city.factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    );
    const troopCount = serving.reduce((sum, officer) => sum + officer.troops, 0);
    const harvest = Math.floor(city.farming * (month === 9 ? 4 : 2.2) + city.population / 80);
    const income = Math.floor(city.population / 150 + city.commerce * 0.55);
    const foodUpkeep = Math.ceil(troopCount * 0.12);
    const goldUpkeep = Math.ceil(troopCount * 0.025);
    city.food = Math.min(RESOURCE_CAP, city.food + harvest);
    city.gold = Math.min(RESOURCE_CAP, city.gold + income);
    if (city.food < foodUpkeep) {
      city.food = 0;
      city.loyalty = Math.max(0, city.loyalty - 8);
      city.garrisonTroops = Math.floor(city.garrisonTroops * 0.85);
      for (const officer of serving) {
        officer.troops = Math.floor(officer.troops * 0.85);
        officer.loyalty = Math.max(0, officer.loyalty - 4);
      }
      pushLog(next, `${city.name} runs short of provisions; soldiers desert.`);
    } else city.food -= foodUpkeep;
    if (city.gold < goldUpkeep) {
      city.gold = 0;
      for (const officer of serving) officer.loyalty = Math.max(0, officer.loyalty - 3);
    } else city.gold -= goldUpkeep;
    if (
      city.governanceMode !== 'ruler' &&
      city.gold >= 80 &&
      city.food >= Math.max(500, foodUpkeep * 2)
    ) {
      if (city.farming <= city.commerce) city.farming = Math.min(100, city.farming + 1);
      else city.commerce = Math.min(100, city.commerce + 1);
      city.gold -= 80;
    }
    city.garrisonTroops = serving.reduce((sum, officer) => sum + officer.troops, 0);
  }
  for (const faction of next.factions) {
    const owned = next.cities.filter((city) => city.factionId === faction.id);
    if (owned.length === 0) faction.eliminated = true;
    else if (!owned.some((city) => city.id === faction.capitalCityId))
      faction.capitalCityId = owned[0]!.id;
  }
  const effectiveDay = next.absoluteDay;
  const governed = applyGovernanceMonthBoundary(next, effectiveDay);
  const refreshed = refreshWaitingOrders(governed, createV03OrderServices());
  dispatchMonthlyRivalCampaigns(refreshed);
  addEvent(
    refreshed,
    'monthBoundary',
    'Monthly settlement complete',
    `The monthly economy and governance changes for ${year}/${month} have settled.`,
    null,
    effectiveDay,
  );
  refreshed.revision++;
  return refreshed;
}

function advanceBattleDayWithSupplies(state: V03GameState, battleId: string): boolean {
  const battle = state.battles.find((entry) => entry.id === battleId);
  if (!battle || !battle.active) return true;
  if (battle.battleData.outcome) {
    finishBattle(state, battle);
    return true;
  }
  const playerFights =
    battle.attackerFactionId === state.playerFactionId ||
    battle.defenderFactionId === state.playerFactionId;
  let tactical = battle.battleData;
  if (!playerFights) tactical = runBattleAiTurn(tactical, tactical.playerSide);
  tactical = advanceBattleDay(tactical);
  battle.battleData = tactical;
  chargeBattleRations(battle);
  if (tactical.outcome) finishBattle(state, battle);
  return true;
}

export interface V03AdvanceResult {
  state: V03GameState;
  daysAdvanced: number;
  stoppedFor: 'requested-days' | 'event' | 'manual-battle' | 'step-limit' | 'active-battle';
  eventId: string | null;
  error?: string;
}

/** Advance the v0.3 world through the shared day-resolution state machine. */
export function advanceV03(initial: V03GameState, mode: AdvanceMode): V03AdvanceResult {
  if (initial.phase === 'finished')
    return { state: initial, daysAdvanced: 0, stoppedFor: 'requested-days', eventId: null };
  const hasManualBattle = initial.battles.some(
    (battle) =>
      battle.active &&
      (battle.attackerFactionId === initial.playerFactionId ||
        battle.defenderFactionId === initial.playerFactionId),
  );
  if (hasManualBattle && mode !== 1) {
    return {
      state: initial,
      daysAdvanced: 0,
      stoppedFor: 'active-battle',
      eventId: null,
      error: 'Advance one day at a time while a player battle is active.',
    };
  }
  let state = cloneState(initial);
  const previousJourneys = structuredClone(state.journeys);
  let timeline = toTimeline(state);
  const result = advanceTimeline(timeline, mode, {
    battleIdsAtDaybreak: () =>
      state.battles.filter((battle) => battle.active).map((battle) => battle.id),
    resolveBattleDay: (current, battleId) => {
      applyTimeline(state, current);
      const completed = advanceBattleDayWithSupplies(state, battleId);
      return {
        timeline: { ...current, journeys: state.journeys, dayResolution: current.dayResolution },
        completed,
      };
    },
    settleMonth: (current, year, month) => {
      applyTimeline(state, current);
      state = settleMonth(state, year, month);
      const completed = completeMonthSettlement({
        ...current,
        journeys: state.journeys,
        dayResolution: current.dayResolution,
      });
      applyTimeline(state, completed);
      return completed;
    },
  });
  timeline = result.timeline;
  applyTimeline(state, timeline);
  handleArrivals(state, previousJourneys);
  if (!state.battles.some((battle) => battle.active)) state.phase = 'planning';
  if (state.factions.find((faction) => faction.id === state.playerFactionId)?.eliminated) {
    state.phase = 'finished';
    if (state.winnerFactionId === null) {
      state.winnerFactionId =
        state.cities.find((city) => city.id === state.playerCapitalCityId)?.factionId ?? null;
    }
    if (
      !state.events.some(
        (event) => event.kind === 'factionEliminated' && event.entityId === state.playerFactionId,
      )
    ) {
      addEvent(
        state,
        'factionEliminated',
        'Your faction has fallen',
        'No cities remain under your banner.',
        state.playerFactionId,
      );
    }
    if (
      !state.events.some(
        (event) => event.kind === 'victory' && event.entityId === state.winnerFactionId,
      )
    ) {
      addEvent(
        state,
        'victory',
        'The campaign has ended',
        `${attackerFactionName(state, state.winnerFactionId)} controls your former capital.`,
        state.winnerFactionId,
      );
    }
  } else if (
    state.cities.length > 0 &&
    state.cities.every((city) => city.factionId === state.playerFactionId)
  ) {
    state.phase = 'finished';
    state.winnerFactionId = state.playerFactionId;
    if (
      !state.events.some(
        (event) => event.kind === 'victory' && event.entityId === state.playerFactionId,
      )
    ) {
      addEvent(
        state,
        'victory',
        'The realm is united',
        `${attackerFactionName(state, state.playerFactionId)} controls every city.`,
        state.playerFactionId,
      );
    }
  }
  state.revision++;
  const domainEvent = result.event
    ? state.events.find((event) => event.id === result.event!.id)
    : undefined;
  return {
    state,
    daysAdvanced: result.daysAdvanced,
    stoppedFor:
      hasManualBattle && result.stoppedFor === 'manual-battle'
        ? 'active-battle'
        : result.stoppedFor,
    eventId: domainEvent?.id ?? result.event?.id ?? null,
  };
}

export function applyV03BattleAction(
  state: V03GameState,
  battleId: string,
  action: Parameters<typeof applyBattleAction>[1],
): { ok: boolean; state: V03GameState; error?: string } {
  const current = state.battles.find((battle) => battle.id === battleId && battle.active);
  if (!current) return { ok: false, state, error: 'This battle is no longer active.' };
  if (
    current.battleData.playerSide !==
    (current.attackerFactionId === state.playerFactionId ? 'attacker' : 'defender')
  ) {
    return { ok: false, state, error: 'This is not the player-controlled side.' };
  }
  const applied = applyBattleAction(current.battleData, action);
  if (!applied.ok) return { ok: false, state, error: applied.error };
  const next = cloneState(state);
  const battle = next.battles.find((entry) => entry.id === battleId)!;
  battle.battleData = applied.state;
  if (applied.state.outcome) finishBattle(next, battle);
  next.phase = next.battles.some((entry) => entry.active) ? 'battle' : 'planning';
  next.revision++;
  return { ok: true, state: next };
}

export function acknowledgeV03Event(state: V03GameState, eventId: string): V03GameState {
  const next = cloneState(state);
  const event = next.events.find((entry) => entry.id === eventId);
  if (event) event.acknowledged = true;
  next.revision++;
  return next;
}

/** Read-only helpers used by the campaign view and tests. */
export function v03BattleForState(
  state: V03GameState,
  battleId: string,
): V03TacticalBattleState | null {
  return state.battles.find((battle) => battle.id === battleId)?.battleData ?? null;
}

export function v03CurrentDate(state: V03GameState) {
  return calendarDateAt(state.startYear, state.absoluteDay);
}

export function v03CitySummary(city: V03City) {
  return `${city.name} · ${city.garrisonTroops.toLocaleString()} · ${city.food.toLocaleString()} food · ${city.gold.toLocaleString()} gold`;
}
