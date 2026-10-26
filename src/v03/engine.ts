import { isCityCommitted } from './governance/commitments';
import { applyTroopLoss, mergeTroopPools } from './campaign/troop-experience';
import { eventTier, isCriticalReport } from './campaign/reports';
import { resolveSuccessions, resolveAiPrisoners } from './campaign/prisoners';
import {
  appendBattleLog,
  getBattleTimeoutOutcome,
  advanceBattleDay,
  applyBattleAction,
  createCanvasBattleMap,
  createTacticalBattle,
  runBattleAiTurn,
  selectCampaignBattlefield,
  type BattleRosterEntry,
  type TacticalBattleUnit,
  type V03TacticalBattleState,
} from './battle';
import { hasTrait } from './content/traits';
import {
  advanceV03Hegemon,
  getV03AttackAllianceBlock,
  resolveV03MonthlyEvents,
} from './campaign/monthly-systems';
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
import {
  applyGovernanceMonthBoundary,
  cancelPendingGovernorAppointment,
} from './governance/appointments';
import { applyGovernorMonthlyWork, planGovernorMonthlyWork } from './governance/autonomy';
import { cityWorkQuota } from './governance/city-actions';
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
  state.events.push({
    id,
    absoluteDay,
    kind,
    code: kind,
    params: { entityId },
    title,
    detail,
    entityId,
    acknowledged: false,
  });
  const event = state.events.at(-1)!;
  if (kind === 'journeyArrival' && entityId) {
    const journey = state.journeys.find((journey) => journey.id === entityId);
    const captured = state.officers.filter(
      (officer) =>
        officer.alive &&
        journey?.manifest.officerIds.includes(officer.id) &&
        officer.location.kind === 'captured',
    );
    if (captured.length) {
      event.code = 'journey.captured';
      event.params = {
        officerIds: captured.map((officer) => officer.id).join(','),
        cityId: captured[0]!.location.kind === 'captured' ? captured[0]!.location.cityId : null,
      };
      event.tier = journey?.ownerFactionId === state.playerFactionId ? 'critical' : 'chronicle';
    }
  }

  if (kind === 'campaignEvent') {
    try {
      const structured = JSON.parse(detail) as { key?: string; entityIds?: string[] };
      event.params = { entityId, key: structured.key ?? '' };
      const relevant =
        structured.key === 'coalition-invitation' ||
        (structured.entityIds ?? []).some(
          (id) =>
            id === state.playerFactionId ||
            state.cities.some(
              (city) => city.id === id && city.factionId === state.playerFactionId,
            ) ||
            state.officers.some(
              (officer) => officer.id === id && officer.factionId === state.playerFactionId,
            ),
        );
      event.tier = relevant ? 'critical' : 'chronicle';
    } catch {
      event.tier = 'notice';
    }
  }
  state.nextId++;
}

function completeHegemonVictoryIfReady(state: V03GameState): void {
  const claimant = state.hegemon.factionId;
  if (
    state.phase === 'finished' ||
    !claimant ||
    state.hegemon.months < 12 ||
    state.battles.some((battle) => battle.active)
  )
    return;
  const stillQualifies =
    state.cities.find((city) => city.id === 'luoyang')?.factionId === claimant &&
    state.cities.filter((city) => city.factionId === claimant).length >= 16;
  if (!stillQualifies) return;
  state.phase = 'finished';
  state.winnerFactionId = claimant;
  if (!state.events.some((event) => event.kind === 'victory' && event.entityId === claimant)) {
    addEvent(
      state,
      'victory',
      'Proclaimed Hegemon',
      `${attackerFactionName(state, claimant)} held Luoyang and sixteen cities for twelve consecutive months.`,
      claimant,
    );
  }
}

function toTimeline(state: V03GameState): StrategicTimeline {
  const events: ScheduledEvent[] = state.events
    .filter(
      (event) =>
        isCriticalReport(state, event) ||
        (!event.acknowledged &&
          event.absoluteDay > state.absoluteDay &&
          eventTier(state, event) === 'critical'),
    )
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
    if (
      (journey.status !== 'outbound' && journey.status !== 'returning') ||
      journey.ownerFactionId !== state.playerFactionId ||
      journey.expectedArrivalDay <= state.absoluteDay
    )
      continue;
    const id = `arrival:${journey.id}`;
    if (events.some((event) => event.id === id)) continue;
    events.push({
      id,
      absoluteDay: journey.expectedArrivalDay,
      kind: 'arrival',
      pause: false,
      visibleToPlayer: false,
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
  militia?: boolean;
  troopExperience?: number;
}

function groupOfficers(officers: readonly V03Officer[], limit = 10): FormationGroup[] {
  const groups: FormationGroup[] = [];
  const sorted = officers
    .filter((entry) => entry.troops > 0)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const representatives = [...new Set(sorted.map((officer) => officer.troopType))].map((type) =>
    sorted.find((officer) => officer.troopType === type)!,
  );
  for (const officer of [
    ...representatives,
    ...sorted.filter((officer) => !representatives.includes(officer)),
  ]) {
    if (groups.length < limit)
      groups.push({ type: officer.troopType, officers: [officer], troops: officer.troops });
    else {
      const weakest = groups
        .filter((group) => group.type === officer.troopType)
        .sort((a, b) => a.troops - b.troops)[0];
      if (!weakest) throw new Error('Battle roster overflow has no matching troop type.');
      weakest.officers.push(officer);
      weakest.troops += officer.troops;
    }
  }
  return groups;
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
    const id = `${prefix}:${group.type}:${group.militia ? 'militia' : group.officers[0]!.id}`;
    membership[id] = group.officers.map((officer) => officer.id);
    const leaders = group.officers.map((officer) => officer.name).join(', ');
    const name =
      group.type === 'infantry'
        ? group.militia
          ? 'Militia'
          : 'Infantry'
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
      troopExperience: group.militia
        ? (group.troopExperience ?? 0)
        : mergeTroopPools(...group.officers).troopExperience,
      force: group.officers.length
        ? Math.round(
            group.officers.reduce((sum, officer) => sum + officer.force * officer.troops, 0) /
              Math.max(1, group.troops),
          )
        : 45,
      intellect: group.officers.length
        ? Math.round(
            group.officers.reduce((sum, officer) => sum + officer.intellect * officer.troops, 0) /
              Math.max(1, group.troops),
          )
        : 40,
      level: group.officers.length
        ? Math.max(...group.officers.map((officer) => officer.level))
        : 0,
      isMilitia: Boolean(group.militia),
      cunning: group.officers.some((officer) => hasTrait(officer.id, 'cunning')),
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
  for (const share of shares) applyTroopLoss(share.officer, share.troops);
}

function chargeBattleRations(battle: V03BattleState): void {
  const data = battle.battleData;
  for (const side of ['attacker', 'defender'] as const) {
    const living = data.units.filter((unit) => unit.side === side && unit.troops > 0);
    const totalTroops = living.reduce(
      (sum, unit) => sum + unit.troops * (unit.troopType === 'cavalry' ? 2 : 1),
      0,
    );
    const foodKey = side === 'attacker' ? 'attackerFood' : 'defenderFood';
    const remainderKey =
      side === 'attacker' ? 'attackerFoodRemainderMicro' : 'defenderFoodRemainderMicro';
    const demandMicro =
      Math.round(PILOT_LOGISTICS_RATES.battleFoodPerTroopDay * FOOD_MICRO) * totalTroops +
      battle[remainderKey];
    const demandFood = Math.floor(demandMicro / FOOD_MICRO);
    const paid = Math.min(data.supplies[side], demandFood);
    data.supplies[side] -= paid;
    battle[foodKey] = data.supplies[side];
    const shortage = demandFood - paid;
    battle[remainderKey] = shortage > 0 ? 0 : demandMicro - paid * FOOD_MICRO;
    if (shortage > 0 && living.length > 0) {
      battle.foodShortfallDays++;
      for (const unit of living) {
        applyTroopLoss(unit, Math.max(0, unit.troops - Math.max(1, Math.ceil(unit.troops * 0.01))));
        unit.morale = Math.max(0, unit.morale - 5);
      }
      appendBattleLog(
        data,
        `${side} forces lack rations; the hungry units lose men and morale.`,
        'log.shortage',
        { side },
      );
    }
  }
}

function finishBattle(state: V03GameState, battle: V03BattleState): void {
  const outcome = battle.battleData.outcome;
  if (battle.resolved || !outcome) return;
  const data = battle.battleData;
  const attackerWon = outcome.winner === 'attacker';
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
  const survivingMilitia = mergeTroopPools(...defenderGroups.filter((unit) => unit.isMilitia));
  const oldOwner = target.factionId;
  const returnAttackers = (loot: { gold: number; food: number } | null = null) => {
    const returnManifest = {
      ...targetJourney.manifest,
      troopCount: attackerSurvivors,
      composition: {
        ...targetJourney.manifest.composition,
        cavalryTroops: attackerGroups
          .filter((u) => u.troopType === 'cavalry')
          .reduce((sum, u) => sum + u.troops, 0),
      },
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
        routeCityIds: targetJourney.routeCityIds?.slice().reverse(),
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
  const applyPlunder = (recipient?: V03City): { gold: number; food: number } | null => {
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
    if (recipient) {
      recipient.gold = Math.min(RESOURCE_CAP, recipient.gold + gold);
      recipient.food = Math.min(RESOURCE_CAP, recipient.food + food);
    }
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
    target.garrisonExperience = survivingMilitia.troopExperience;
    target.garrisonTroops += defenderSurvivors;
    target.food = Math.min(RESOURCE_CAP, target.food + battle.defenderFood);
    for (const officer of state.officers) {
      if (
        officer.location.kind === 'battle' &&
        officer.location.battleId === battle.id &&
        officer.factionId === defenderFactionId
      ) {
        officer.location = { kind: 'city', cityId: target.id };
      }
    }
    battle.loot = applyPlunder();
    returnAttackers(battle.loot);
  } else if (attackerWon) {
    // Capture ends the former governor's appointment even when that officer
    // survives into captivity. Keep the city/officer relationship reciprocal
    // so the resulting campaign remains valid for save and reload.
    for (const officer of state.officers) {
      if (officer.governorOfCityId === target.id) officer.governorOfCityId = null;
    }
    target.factionId = battle.attackerFactionId;
    if (oldOwner !== battle.attackerFactionId) {
      target.troopServiceDaysThisMonth = 0;
      target.cavalryServiceDaysThisMonth = 0;
    }
    cancelPendingGovernorAppointment(
      state,
      target.id,
      'the city was captured before the candidate took office',
    );
    target.governorId = null;
    target.governanceMode = target.id === attackerFaction.capitalCityId ? 'ruler' : 'steward';
    target.garrisonTroops = attackerSurvivors;
    target.garrisonExperience = 0;
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
        cancelPendingGovernorAppointment(
          state,
          newCapital.id,
          'the city became the capital before the candidate took office',
        );
        newCapital.governanceMode = 'ruler';
        for (const officer of state.officers) {
          if (officer.governorOfCityId === newCapital.id) officer.governorOfCityId = null;
        }
        newCapital.governorId = null;
        if (formerOwner.id === state.playerFactionId) {
          state.playerCapitalCityId = newCapital.id;
        }
      }
    }
    if (oldOwner) {
      const formerOwner = state.factions.find((faction) => faction.id === oldOwner);
      if (formerOwner && !state.cities.some((city) => city.factionId === oldOwner)) {
        // Officers still free in transit retain their house until resolved.
      }
    }
    for (const officer of state.officers) {
      if (officer.location.kind === 'battle' && officer.location.battleId === battle.id) {
        if (officer.factionId === battle.attackerFactionId)
          officer.location = { kind: 'city', cityId: target.id };
        else officer.location = { kind: 'captured', cityId: target.id };
      }
    }
    attackerFaction.isPlayer &&
      pushLog(state, `${target.name} is captured after the field battle.`);
  } else {
    target.food = Math.min(RESOURCE_CAP, target.food + battle.defenderFood);
    target.garrisonExperience = survivingMilitia.troopExperience;
    target.garrisonTroops += defenderSurvivors;
    for (const officer of state.officers) {
      if (
        officer.location.kind === 'battle' &&
        officer.location.battleId === battle.id &&
        officer.factionId === defenderFactionId
      ) {
        officer.location = { kind: 'city', cityId: target.id };
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
  const playerSide =
    battle.attackerFactionId === state.playerFactionId
      ? 'attacker'
      : battle.defenderFactionId === state.playerFactionId
        ? 'defender'
        : null;
  const sideReport = (side: 'attacker' | 'defender') => {
    const units = data.units.filter((unit) => unit.side === side);
    const ids = Object.values(
      side === 'attacker' ? battle.attackerFormationOfficerIds : battle.defenderFormationOfficerIds,
    ).flat();
    const officers = state.officers.filter((officer) => ids.includes(officer.id));
    return {
      startingTroops: units.reduce((sum, unit) => sum + unit.initialTroops, 0),
      survivingTroops: units.reduce((sum, unit) => sum + unit.troops, 0),
      returned: officers
        .filter((officer) => officer.alive && officer.location.kind !== 'captured')
        .map((officer) => officer.id),
      captured: officers
        .filter((officer) => officer.alive && officer.location.kind === 'captured')
        .map((officer) => officer.id),
      killed: officers.filter((officer) => !officer.alive).map((officer) => officer.id),
    };
  };
  addEvent(
    state,
    'battleResolved',
    !playerSide
      ? `Battle at ${target.name}`
      : outcome.winner === null
        ? 'Battle drawn'
        : outcome.winner === playerSide
          ? 'Field victory'
          : 'Field defeat',
    `${attackerFactionName(state, outcome.winner === 'attacker' ? battle.attackerFactionId : battle.defenderFactionId)} holds the field at ${target.name}.`,
    battle.id,
  );
  const report = state.events.at(-1)!;
  report.tier = playerSide ? 'critical' : 'chronicle';
  report.code = 'battle.outcome';
  report.params = { cityId: target.id, playerSide, winner: battle.outcome };
  report.battleOutcome = {
    cityId: target.id,
    cityCaptured: target.factionId !== oldOwner,
    winner: battle.outcome,
    attacker: sideReport('attacker'),
    defender: sideReport('defender'),
    loot: battle.loot ?? { gold: 0, food: 0 },
    returnArrivalDay:
      state.journeys.find((journey) => journey.id === `${targetJourney.id}:return`)
        ?.expectedArrivalDay ?? null,
  };
  for (const officer of state.officers.filter((entry) => entry.location.kind === 'captured')) {
    if (officer.governorOfCityId) {
      const city = state.cities.find((entry) => entry.id === officer.governorOfCityId);
      if (city?.governorId === officer.id) {
        city.governorId = null;
        if (city.governanceMode === 'governor') city.governanceMode = 'steward';
      }
      officer.governorOfCityId = null;
    }
  }
  resolveSuccessions(state);
  if (state.factions.find((faction) => faction.id === state.playerFactionId)?.eliminated) {
    // The final field-control dispositions close every saved battle cursor.
    for (const remaining of state.battles.filter((entry) => entry.active)) {
      remaining.battleData.outcome = getBattleTimeoutOutcome(remaining.battleData);
      finishBattle(state, remaining);
    }
    state.phase = 'finished';
    const battlefieldVictor =
      battle.outcome === 'attacker' ? battle.attackerFactionId : battle.defenderFactionId;
    state.winnerFactionId =
      battlefieldVictor && battlefieldVictor !== state.playerFactionId
        ? battlefieldVictor
        : (state.factions
            .filter((faction) => faction.id !== state.playerFactionId && !faction.eliminated)
            .sort(
              (a, b) =>
                state.cities.filter((city) => city.factionId === b.id).length -
                  state.cities.filter((city) => city.factionId === a.id).length ||
                a.id.localeCompare(b.id),
            )[0]?.id ?? battle.attackerFactionId);
  }
  completeHegemonVictoryIfReady(state);
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
  const defenderGroups = groupOfficers(
    defenders,
    target.garrisonTroops > defenders.reduce((sum, officer) => sum + officer.troops, 0) ? 9 : 10,
  );
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
      militia: true,
      troopExperience: militia > 0 ? target.garrisonExperience : 0,
    });
  }
  const defender = rosterFromGroups(defenderGroups, `${journey.id}:defend`);
  const id = `battle-${state.nextId}`;
  // The last route leg (and the attack direction) picks the canvas battlefield.
  const map = createCanvasBattleMap(
    selectCampaignBattlefield(
      journey.routeCityIds ?? [journey.sourceCityId, journey.destinationCityId],
    ),
    {
      approachDirection: approachBetween(journey.sourceCityId, journey.destinationCityId),
      seed: state.rng + state.nextId,
    },
  );
  const tactical = createTacticalBattle({
    id,
    map,
    attackerUnits: attacker.roster,
    defenderUnits: defender.roster,
    playerSide: journey.ownerFactionId === state.playerFactionId ? 'attacker' : 'defender',
    dayLimit: journey.intent === 'raid' ? 10 : 30,
    timeoutPolicy: 'survivor-count',
    supplies: { attacker: journey.manifest.carriedFood, defender: target.food },
    seed: state.rng + state.nextId,
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
    playerDayComplete: false,
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
  tactical.log[0] = `The battle at ${target.name} begins.`;
  tactical.logEntries = [{ day: 1, index: 0, code: 'log.begin', params: { cityId: target.id } }];
  journey.manifest = { ...journey.manifest, carriedFood: 0 };
  target.food = 0;
  // Defending troops are now accounted by battle rations and the battlefield
  // roster until the result returns survivors to the city.
  target.garrisonTroops = 0;
  target.garrisonExperience = 0;
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
  journey.returnRequested = false;
  // This replacement path was planned from the current destination outward,
  // so its own routeCityIds are already in travel order.
  state.journeys.push({ ...redirected, kind: 'return' });
  for (const officerId of journey.manifest.officerIds) {
    const officer = state.officers.find((entry) => entry.id === officerId);
    if (officer) officer.location = { kind: 'journey', journeyId: id };
  }
  state.nextId++;
  return true;
}

function startRequestedJourneyReturn(state: V03GameState, journey: V03Journey): boolean {
  if (journey.status !== 'waiting' && journey.status !== 'delivered') return false;
  const source = state.cities.find((city) => city.id === journey.sourceCityId);
  const routeCityIds = journey.routeCityIds ?? [journey.sourceCityId, journey.destinationCityId];
  const legalReverseRoute =
    source?.factionId === journey.ownerFactionId &&
    routeCityIds
      .slice(1, -1)
      .every(
        (cityId) =>
          state.cities.find((city) => city.id === cityId)?.factionId === journey.ownerFactionId,
      );
  if (!legalReverseRoute) {
    if (!redirectJourneyToFriendlyCity(state, journey)) return false;
    const requisition = state.requisitions.find((entry) => entry.journeyId === journey.id);
    if (requisition) {
      requisition.status = 'cancelled';
      requisition.message =
        'The dispatched party is returning to friendly territory with its cargo.';
    }
    const directive = state.directives.find((entry) => entry.journeyId === journey.id);
    if (directive) {
      directive.status = 'cancelled';
      directive.message = 'The campaign party is returning to friendly territory before battle.';
    }
    for (const city of state.cities)
      if (city.pendingAppointment?.journeyId === journey.id) city.pendingAppointment = null;
    addEvent(
      state,
      'journeyArrival',
      'Journey recalled',
      'The original route is no longer safe; the party is returning by a currently friendly route.',
      journey.id,
    );
    return true;
  }

  const returning = beginJourneyReturn(journey, state.absoluteDay);
  const returnId = `${journey.id}:recall:${state.nextId}`;
  journey.status = 'cancelled';
  journey.returnRequested = false;
  const returnJourney: V03Journey = {
    ...returning,
    id: returnId,
    executionId: `${journey.executionId}:recall`,
    kind: 'return',
    returnRequested: false,
    routeCityIds: routeCityIds.slice().reverse(),
  };
  state.journeys.push(returnJourney);
  for (const officerId of returnJourney.manifest.officerIds) {
    const officer = state.officers.find((entry) => entry.id === officerId);
    if (officer) officer.location = { kind: 'journey', journeyId: returnJourney.id };
  }
  const requisition = state.requisitions.find((entry) => entry.journeyId === journey.id);
  if (requisition) {
    requisition.status = 'cancelled';
    requisition.message = 'The dispatched party is returning with all remaining cargo.';
  }
  const directive = state.directives.find((entry) => entry.journeyId === journey.id);
  if (directive) {
    directive.status = 'cancelled';
    directive.message = 'The campaign party is returning before battle.';
  }
  for (const city of state.cities)
    if (city.pendingAppointment?.journeyId === journey.id) city.pendingAppointment = null;
  state.nextId++;
  addEvent(
    state,
    'journeyArrival',
    'Journey recalled',
    `The party has turned back from ${journey.destinationCityId} and is returning with its remaining cargo.`,
    returnJourney.id,
  );
  return true;
}

/** Request a safe return for an already-dispatched player journey. */
export function recallV03Journey(
  state: V03GameState,
  journeyId: string,
): { ok: boolean; state: V03GameState; error?: string } {
  const journey = state.journeys.find((entry) => entry.id === journeyId);
  if (state.phase === 'finished')
    return { ok: false, state, error: 'Journeys can only be recalled during campaign planning.' };
  if (
    !journey ||
    journey.ownerFactionId !== state.playerFactionId ||
    !['requisition', 'campaign', 'appointment'].includes(journey.kind) ||
    !['outbound', 'waiting'].includes(journey.status)
  )
    return { ok: false, state, error: 'This journey cannot be recalled.' };
  if (journey.returnRequested)
    return { ok: false, state, error: 'A return is already requested for this journey.' };
  if (
    state.battles.some(
      (battle) =>
        battle.active && [battle.attackerJourneyId, battle.defenderJourneyId].includes(journey.id),
    )
  )
    return { ok: false, state, error: 'A force already engaged in battle cannot be recalled.' };

  const next = cloneState(state);
  const recalled = next.journeys.find((entry) => entry.id === journeyId)!;
  recalled.returnRequested = true;
  if (recalled.status === 'waiting') startRequestedJourneyReturn(next, recalled);
  next.revision++;
  return {
    ok: true,
    state: next,
  };
}

function handleArrivals(state: V03GameState, previous: readonly V03Journey[]): void {
  const previousStatuses = new Map(previous.map((journey) => [journey.id, journey.status]));
  for (const journey of state.journeys) {
    if (journey.status !== 'waiting') continue;
    const target = state.cities.find((city) => city.id === journey.destinationCityId);
    const battleAtDestination = state.battles.some((battle) => {
      if (!battle.active) return false;
      const attackerJourney = state.journeys.find((entry) => entry.id === battle.attackerJourneyId);
      return attackerJourney?.destinationCityId === journey.destinationCityId;
    });
    const queuedCampaignCanStart =
      journey.kind === 'campaign' &&
      target?.factionId !== journey.ownerFactionId &&
      !battleAtDestination;
    if (target?.factionId === journey.ownerFactionId || queuedCampaignCanStart) {
      journey.status = 'delivered';
    }
  }
  const arriving = state.journeys
    .filter(
      (journey) =>
        journey.status === 'delivered' && previousStatuses.get(journey.id) !== 'delivered',
    )
    .sort((a, b) => a.expectedArrivalDay - b.expectedArrivalDay || a.id.localeCompare(b.id));
  for (const journey of state.journeys) {
    if (journey.returnRequested && journey.status === 'waiting') {
      if (!startRequestedJourneyReturn(state, journey)) continue;
    }
    // A delivered appointment transfer can be replaced before the monthly
    // boundary. Start its safe return from the destination on the next arrival
    // refresh instead of leaving the officer stranded there.
    if (
      journey.returnRequested &&
      journey.status === 'delivered' &&
      previousStatuses.get(journey.id) === 'delivered'
    ) {
      if (!startRequestedJourneyReturn(state, journey)) journey.status = 'waiting';
    }
  }
  for (const journey of arriving) {
    if (journey.returnRequested) {
      if (!startRequestedJourneyReturn(state, journey)) journey.status = 'waiting';
      continue;
    }
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
        const unloaded = unloadJourneyAtCity(state, journey, target);
        if (!unloaded) {
          journey.status = 'waiting';
          if (directive) directive.status = 'waiting';
          if (previousStatuses.get(journey.id) !== 'waiting')
            addEvent(
              state,
              'journeyArrival',
              'Warehouse full',
              `The party reached ${target.name}, but its stores cannot hold the cargo yet. The full cargo remains with the party until capacity is available.`,
              journey.id,
            );
          continue;
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
      const battleAtTarget = state.battles.some((battle) => {
        if (!battle.active) return false;
        const activeJourney = state.journeys.find((entry) => entry.id === battle.attackerJourneyId);
        return activeJourney?.destinationCityId === target.id;
      });
      if (battleAtTarget) {
        journey.status = 'waiting';
        // Keep the already-dispatched order out of the answer/redispatch path.
        if (directive) directive.status = 'waiting';
        if (previousStatuses.get(journey.id) !== 'waiting')
          addEvent(
            state,
            'journeyArrival',
            'Army awaiting battle queue',
            `The army reached ${target.name}, where another field battle is in progress. It is waiting outside the city; supplies continue to be consumed.`,
            journey.id,
          );
        continue;
      }
      if (
        target.factionId &&
        getV03AttackAllianceBlock(
          state.alliances,
          journey.ownerFactionId,
          target.factionId,
          state.monthIndex,
        )
      ) {
        journey.returnRequested = true;
        if (!startRequestedJourneyReturn(state, journey)) journey.status = 'waiting';
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
    if (!unloadJourneyAtCity(state, journey, target)) {
      journey.status = 'waiting';
      const order = state.requisitions.find((entry) => entry.journeyId === journey.id);
      if (order) {
        order.status = 'waiting';
        order.message = 'The destination warehouse is full; the cargo is waiting for capacity.';
      }
      if (previousStatuses.get(journey.id) !== 'waiting')
        addEvent(
          state,
          'journeyArrival',
          'Warehouse full',
          `The cargo reached ${target.name}, but its stores cannot hold the full delivery yet. It remains with the party until capacity is available.`,
          journey.id,
        );
      continue;
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

/** Transfer a journey's remaining manifest atomically so capped stores never erase cargo. */
function unloadJourneyAtCity(state: V03GameState, journey: V03Journey, target: V03City): boolean {
  const cargo = journey.manifest.cargo;
  const gold = Math.max(0, (cargo.gold ?? 0) - (journey.deliveredCargo.gold ?? 0));
  const food = Math.max(
    0,
    (cargo.food ?? 0) + journey.manifest.carriedFood - (journey.deliveredCargo.food ?? 0),
  );
  if (target.gold + gold > RESOURCE_CAP || target.food + food > RESOURCE_CAP) return false;

  target.gold += gold;
  target.food += food;
  journey.deliveredCargo.gold = (journey.deliveredCargo.gold ?? 0) + gold;
  journey.deliveredCargo.food = (journey.deliveredCargo.food ?? 0) + food;
  if (journey.deliveredCargo.personnel !== 1) {
    const troops = Math.max(journey.manifest.troopCount, cargo.troops ?? 0);
    target.garrisonTroops += troops;
    journey.deliveredCargo.troops = troops;
    for (const officerId of journey.manifest.officerIds) {
      const officer = state.officers.find((entry) => entry.id === officerId);
      if (officer) officer.location = { kind: 'city', cityId: target.id };
    }
    journey.deliveredCargo.personnel = 1;
  }
  return true;
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
    target.factionId === plan.factionId ||
    (target.factionId !== null &&
      (getV03AttackAllianceBlock(
        state.alliances,
        plan.factionId,
        target.factionId,
        state.monthIndex,
      ) !== null ||
        state.factions.find((entry) => entry.id === target.factionId)?.eliminated)) ||
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
    cavalryTroops: plan.party.composition.cavalryTroops,
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
  const planningSnapshot = state;
  // Keep each rival to one new campaign per monthly boundary. The planner
  // validates supply, routes and reserves from one snapshot.
  const plans = planStrategicRivalCampaigns(planningSnapshot);
  const assignedOfficerIds = new Set<string>();
  for (const plan of plans) dispatchRivalCampaignPlan(state, plan, assignedOfficerIds);
}

function settleMonth(state: V03GameState, year: number, month: number): V03GameState {
  const next = cloneState(state);
  const beforeCities = structuredClone(state.cities);
  const governorActions = new Map<string, string[]>();
  const shortages = new Set<string>();
  for (const city of next.cities) {
    if (!city.factionId) {
      city.troopServiceDaysThisMonth = 0;
      city.cavalryServiceDaysThisMonth = 0;
      continue;
    }
    const serving = next.officers.filter(
      (officer) =>
        officer.alive &&
        officer.factionId === city.factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    );
    const staffedTroops = serving.reduce((sum, officer) => sum + officer.troops, 0);
    const militiaTroops = Math.max(0, city.garrisonTroops - staffedTroops);
    const troopCount = staffedTroops + militiaTroops;
    const harvest = Math.floor(city.farming * (month === 9 ? 4 : 2.2) + city.population / 80);
    const income = Math.floor(city.population / 150 + city.commerce * 0.55);
    const troopServiceDays = city.troopServiceDaysThisMonth ?? troopCount * DAYS_PER_MONTH;
    const cavalryDays =
      city.cavalryServiceDaysThisMonth ??
      serving.filter((o) => o.troopType === 'cavalry').reduce((sum, o) => sum + o.troops, 0) *
        DAYS_PER_MONTH;
    const foodUpkeep = Math.ceil(
      (troopServiceDays + cavalryDays) * PILOT_LOGISTICS_RATES.cityFoodPerTroopDay,
    );
    city.cavalryServiceDaysThisMonth = 0;
    const goldUpkeep = Math.ceil((troopServiceDays * 0.025) / DAYS_PER_MONTH);
    city.troopServiceDaysThisMonth = 0;
    city.food = Math.min(RESOURCE_CAP, city.food + harvest);
    city.gold = Math.min(RESOURCE_CAP, city.gold + income);
    if (city.food < foodUpkeep) {
      shortages.add(city.id);
      city.food = 0;
      city.loyalty = Math.max(0, city.loyalty - 8);
      const survivingMilitia = Math.floor(militiaTroops * 0.85);
      for (const officer of serving) {
        applyTroopLoss(officer, Math.floor(officer.troops * 0.85));
        officer.loyalty = Math.max(0, officer.loyalty - 4);
      }
      city.garrisonTroops =
        serving.reduce((sum, officer) => sum + officer.troops, 0) + survivingMilitia;
      if (survivingMilitia === 0) city.garrisonExperience = 0;
      pushLog(next, `${city.name} runs short of provisions; soldiers desert.`);
    } else {
      city.food -= foodUpkeep;
      city.garrisonTroops =
        serving.reduce((sum, officer) => sum + officer.troops, 0) + militiaTroops;
    }
    if (city.gold < goldUpkeep) {
      shortages.add(city.id);
      city.gold = 0;
      for (const officer of serving) officer.loyalty = Math.max(0, officer.loyalty - 3);
    } else city.gold -= goldUpkeep;
  }
  for (const city of next.cities) {
    if (
      city.factionId === null ||
      isCityCommitted(next, city.id) ||
      city.governanceMode === 'ruler'
    )
      continue;
    const quota = cityWorkQuota(next, city);
    let completed = 0;
    for (let point = 0; point < quota; point++) {
      const plan = planGovernorMonthlyWork(next, city.id, month);
      const work = applyGovernorMonthlyWork(next, plan);
      if (!work.applied || !work.city) {
        if (completed === 0) pushLog(next, `${city.name} autonomy: no work (${plan.reason})`);
        break;
      }
      Object.assign(city, work.city);
      if (work.state) {
        next.officers = work.state.officers;
        next.rng = work.state.rng;
        next.nextId = work.state.nextId;
        next.log = work.state.log;
        next.revision = work.state.revision;
      }
      if (plan.action)
        governorActions.set(city.id, [...(governorActions.get(city.id) ?? []), plan.action]);
      completed++;
      pushLog(next, `${city.name} autonomy: ${plan.action} (${plan.reason})`);
    }
  }
  for (const faction of next.factions) {
    const owned = next.cities.filter((city) => city.factionId === faction.id);
    if (owned.length > 0 && !owned.some((city) => city.id === faction.capitalCityId))
      faction.capitalCityId = owned[0]!.id;
  }
  const effectiveDay = next.absoluteDay;
  const governed = applyGovernanceMonthBoundary(next, effectiveDay);
  const systems = resolveV03MonthlyEvents({
    monthIndex: governed.monthIndex,
    startYear: governed.startYear,
    playerFactionId: governed.playerFactionId,
    rng: governed.rng,
    firedEventIds: governed.firedMonthlyEventIds,
    alliances: governed.alliances,
    cities: governed.cities.map((city) => ({
      id: city.id,
      factionId: city.factionId,
      population: city.population,
      farming: city.farming,
      commerce: city.commerce,
      loyalty: city.loyalty,
      gold: city.gold,
      food: city.food,
      reserve: city.reserve,
      reservePools: city.reservePools,
      garrisonTroops: city.garrisonTroops,
      neighbors: ROUTE_DEFINITIONS.filter(
        (route) => route.fromCityId === city.id || route.toCityId === city.id,
      ).map((route) => (route.fromCityId === city.id ? route.toCityId : route.fromCityId)),
    })),
    officers: governed.officers.map((officer) => ({
      id: officer.id,
      factionId: officer.factionId,
      location:
        officer.location.kind === 'city'
          ? { kind: 'city' as const, cityId: officer.location.cityId }
          : officer.location.kind === 'captured'
            ? { kind: 'captured' as const }
            : officer.location.kind === 'battle'
              ? { kind: 'battle' as const }
              : { kind: 'journey' as const },
      force: officer.force,
      intellect: officer.intellect,
      loyalty: officer.loyalty,
      age: officer.age,
      troops: officer.troops,
      alive: officer.alive,
    })),
    attackedWithinLastTwoMonths: governed.battles
      .filter((battle) => !battle.active && effectiveDay - battle.absoluteDay <= 60)
      .map(
        (battle) =>
          governed.journeys.find((journey) => journey.id === battle.attackerJourneyId)
            ?.destinationCityId,
      )
      .filter((cityId): cityId is string => Boolean(cityId)),
  });
  governed.rng = systems.rng;
  governed.firedMonthlyEventIds = systems.firedEventIds;
  governed.alliances = systems.alliances;
  governed.coalitionInvitations = governed.coalitionInvitations.filter(
    (invitation) => invitation.expiresMonthIndex > governed.monthIndex,
  );
  for (const updated of systems.cities) {
    const city = governed.cities.find((entry) => entry.id === updated.id)!;
    Object.assign(city, {
      factionId: updated.factionId,
      population: updated.population,
      farming: updated.farming,
      commerce: updated.commerce,
      loyalty: updated.loyalty,
      gold: updated.gold,
      food: updated.food,
      reserve: updated.reserve,
      reservePools: updated.reservePools,
      garrisonTroops: updated.garrisonTroops,
    });
  }
  for (const updated of systems.officers) {
    const officer = governed.officers.find((entry) => entry.id === updated.id)!;
    officer.force = updated.force;
    officer.intellect = updated.intellect;
    officer.loyalty = updated.loyalty;
    officer.age = updated.age;
    officer.troops = updated.troops;
    if (officer.troops === 0) officer.troopExperience = 0;
    if (updated.location.kind === 'city') {
      const oldCityId = officer.location.kind === 'city' ? officer.location.cityId : null;
      if (oldCityId !== updated.location.cityId) {
        if (oldCityId) {
          const oldCity = governed.cities.find((city) => city.id === oldCityId);
          if (oldCity?.governorId === officer.id) {
            oldCity.governorId = null;
            if (oldCity.governanceMode === 'governor') oldCity.governanceMode = 'steward';
          }
        }
        officer.governorOfCityId = null;
        officer.location = { kind: 'city', cityId: updated.location.cityId };
      }
    }
  }
  for (const invitation of systems.invitations) {
    if (!governed.coalitionInvitations.some((entry) => entry.id === invitation.id))
      governed.coalitionInvitations.push(invitation);
  }
  for (const monthlyEvent of systems.events) {
    if (monthlyEvent.key === 'dong-burns-luoyang') {
      const dong = governed.factions.find((faction) => faction.id === 'dong');
      const luoyang = governed.cities.find((city) => city.id === 'luoyang');
      const changan = governed.cities.find((city) => city.id === 'changan');
      if (dong && changan && dong.capitalCityId === 'luoyang') {
        dong.capitalCityId = 'changan';
        if (governed.playerFactionId === dong.id) governed.playerCapitalCityId = 'changan';
        if (luoyang) {
          luoyang.governorId = null;
          luoyang.pendingAppointment = null;
          luoyang.governanceMode = 'steward';
        }
        changan.governorId = null;
        changan.pendingAppointment = null;
        changan.governanceMode = 'ruler';
        for (const officer of governed.officers) {
          if (officer.governorOfCityId === 'luoyang' || officer.governorOfCityId === 'changan')
            officer.governorOfCityId = null;
        }
      }
    }
    addEvent(
      governed,
      'campaignEvent',
      `Monthly campaign event: ${monthlyEvent.key}`,
      JSON.stringify({
        key: monthlyEvent.key,
        entityIds: monthlyEvent.entityIds,
        values: monthlyEvent.values,
      }),
      null,
      effectiveDay,
    );
  }
  for (const invitation of systems.invitations) {
    if (invitation.targetFactionId === governed.playerFactionId) {
      addEvent(
        governed,
        'campaignEvent',
        'Coalition invitation',
        JSON.stringify({
          key: 'coalition-invitation',
          invitationId: invitation.id,
          targetFactionId: invitation.targetFactionId,
        }),
        null,
        effectiveDay,
      );
    }
  }
  const hegemon = advanceV03Hegemon({
    cityOwners: governed.cities.map((city) => ({ id: city.id, factionId: city.factionId })),
    previousFactionId: governed.hegemon.factionId,
    previousMonths: governed.hegemon.months,
    playerFactionId: governed.playerFactionId,
    alreadyFinished:
      governed.phase === 'finished' || governed.battles.some((battle) => battle.active),
  });
  governed.hegemon = { factionId: hegemon.factionId, months: hegemon.months };
  if (hegemon.rivalWarning && hegemon.factionId) {
    addEvent(
      governed,
      'hegemonWarning',
      hegemon.rivalWarning === 'claim-started'
        ? 'Rival Hegemon claim started'
        : 'Rival Hegemon warning',
      `${hegemon.months}`,
      hegemon.factionId,
      effectiveDay,
    );
  }
  if (hegemon.declared) completeHegemonVictoryIfReady(governed);
  resolveSuccessions(governed);
  const refreshed = resolveAiPrisoners(refreshWaitingOrders(governed, createV03OrderServices()));
  if (refreshed.phase !== 'finished') dispatchMonthlyRivalCampaigns(refreshed);
  addEvent(
    refreshed,
    'monthBoundary',
    'Monthly summary',
    `The monthly economy and governance changes for ${year}/${month} have settled.`,
    null,
    effectiveDay,
  );
  const summary = refreshed.events.at(-1)!;
  summary.code = 'month.summary';
  summary.tier = [...shortages].some(
    (id) => beforeCities.find((city) => city.id === id)?.factionId === state.playerFactionId,
  )
    ? 'critical'
    : 'notice';
  summary.monthlySummary = refreshed.cities
    .filter(
      (city) =>
        beforeCities.find((before) => before.id === city.id)?.factionId === state.playerFactionId,
    )
    .map((city) => {
      const before = beforeCities.find((entry) => entry.id === city.id)!;
      return {
        cityId: city.id,
        gold: city.gold - before.gold,
        food: city.food - before.food,
        troops: city.garrisonTroops - before.garrisonTroops,
        governorActions: governorActions.get(city.id) ?? [],
        shortage: shortages.has(city.id),
      };
    });
  refreshed.revision++;
  return refreshed;
}

function advanceBattleDayWithSupplies(state: V03GameState, battleId: string): boolean {
  const battle = state.battles.find((entry) => entry.id === battleId);
  if (!battle || !battle.active) return true;
  if (battle.battleData.outcome) {
    finishBattle(state, battle);
    battle.playerDayComplete = false;
    return true;
  }
  const playerFights =
    battle.attackerFactionId === state.playerFactionId ||
    battle.defenderFactionId === state.playerFactionId;
  let tactical = battle.battleData;
  if (!playerFights || battle.autoCommand)
    tactical = runBattleAiTurn(tactical, tactical.playerSide);
  tactical = advanceBattleDay(tactical);
  battle.battleData = tactical;
  battle.playerDayComplete = false;
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
      !battle.autoCommand &&
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
  if (
    hasManualBattle &&
    initial.battles.some(
      (battle) =>
        battle.active &&
        !battle.autoCommand &&
        (battle.attackerFactionId === initial.playerFactionId ||
          battle.defenderFactionId === initial.playerFactionId) &&
        !battle.playerDayComplete,
    )
  ) {
    return {
      state: initial,
      daysAdvanced: 0,
      stoppedFor: 'active-battle',
      eventId: null,
      error: 'Complete the day in every active player battle before advancing the world.',
    };
  }
  let state = cloneState(initial);
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
    accountCityServiceDay: (current) => {
      const citiesInBattle = new Set(
        (current.dayResolution?.battleIds ?? [])
          .map((battleId) => {
            const battle = state.battles.find((entry) => entry.id === battleId);
            return state.journeys.find((entry) => entry.id === battle?.attackerJourneyId)
              ?.destinationCityId;
          })
          .filter((cityId): cityId is string => Boolean(cityId)),
      );
      for (const city of state.cities) {
        if (!city.factionId || citiesInBattle.has(city.id)) continue;
        const staffedTroops = state.officers
          .filter(
            (officer) =>
              officer.alive &&
              officer.factionId === city.factionId &&
              officer.location.kind === 'city' &&
              officer.location.cityId === city.id,
          )
          .reduce((sum, officer) => sum + officer.troops, 0);
        const troopCount = Math.max(city.garrisonTroops, staffedTroops);
        const cavalryTroops = state.officers
          .filter(
            (o) =>
              o.alive &&
              o.factionId === city.factionId &&
              o.location.kind === 'city' &&
              o.location.cityId === city.id &&
              o.troopType === 'cavalry',
          )
          .reduce((sum, o) => sum + o.troops, 0);
        const elapsedDaysInMonth = state.absoluteDay % DAYS_PER_MONTH;
        city.cavalryServiceDaysThisMonth =
          (city.cavalryServiceDaysThisMonth ?? cavalryTroops * elapsedDaysInMonth) + cavalryTroops;
        city.troopServiceDaysThisMonth =
          (city.troopServiceDaysThisMonth ?? troopCount * elapsedDaysInMonth) + troopCount;
      }
      return current;
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
    refreshTimeline: (current) => {
      const previousJourneys = structuredClone(state.journeys);
      applyTimeline(state, current);
      handleArrivals(state, previousJourneys);
      state = reconcileV03Rulers(state);
      return toTimeline(state);
    },
  });
  timeline = result.timeline;
  applyTimeline(state, timeline);
  if (state.phase !== 'finished')
    state.phase = state.battles.some((battle) => battle.active) ? 'battle' : 'planning';
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
        'No free officer remains under your banner.',
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
        `${attackerFactionName(state, state.winnerFactionId)} outlasted your house.`,
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
  if (current.playerDayComplete)
    return {
      ok: false,
      state,
      error: 'This battle day is already complete; wait for the other battles.',
    };
  const playerParticipates =
    current.attackerFactionId === state.playerFactionId ||
    current.defenderFactionId === state.playerFactionId;
  if (!playerParticipates)
    return { ok: false, state, error: 'This is not the player-controlled side.' };
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
  battle.attackerFood = applied.state.supplies.attacker;
  battle.defenderFood = applied.state.supplies.defender;
  if (applied.state.outcome) finishBattle(next, battle);
  if (next.phase !== 'finished')
    next.phase = next.battles.some((entry) => entry.active) ? 'battle' : 'planning';
  next.revision++;
  return { ok: true, state: next };
}

/** Mark one active player battle ready; the world advances only when every player battle is ready. */
export function completeV03BattleDay(
  state: V03GameState,
  battleId: string,
): { ok: boolean; state: V03GameState; error?: string; advancedWorldDay?: boolean } {
  const current = state.battles.find((battle) => battle.id === battleId && battle.active);
  if (!current) return { ok: false, state, error: 'This battle is no longer active.' };
  const playerParticipates =
    current.attackerFactionId === state.playerFactionId ||
    current.defenderFactionId === state.playerFactionId;
  if (!playerParticipates)
    return { ok: false, state, error: 'This is not the player-controlled side.' };
  if (current.playerDayComplete)
    return { ok: false, state, error: 'This battle day is already complete.' };
  if (state.events.some((event) => isCriticalReport(state, event)))
    return {
      ok: false,
      state,
      error: 'Acknowledge the current report before completing the battle day.',
    };

  const next = cloneState(state);
  next.battles.find((battle) => battle.id === battleId)!.playerDayComplete = true;
  const manual = next.battles.filter(
    (battle) =>
      battle.active &&
      !battle.autoCommand &&
      (battle.attackerFactionId === next.playerFactionId ||
        battle.defenderFactionId === next.playerFactionId),
  );
  if (manual.every((battle) => battle.playerDayComplete)) {
    const advanced = advanceV03(next, 1);
    if (advanced.error) return { ok: false, state, error: advanced.error };
    return { ok: true, state: advanced.state, advancedWorldDay: advanced.daysAdvanced > 0 };
  }
  next.revision++;
  return { ok: true, state: next, advancedWorldDay: false };
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

/** Reconcile captured rulers in earlier v3 saves without replaying a campaign day. */
export function reconcileV03Rulers(source: V03GameState): V03GameState {
  if (
    !source.factions.some(
      (faction) =>
        !faction.eliminated &&
        source.officers.some(
          (officer) =>
            officer.id === faction.leaderOfficerId &&
            (!officer.alive ||
              officer.location.kind === 'captured' ||
              officer.factionId !== faction.id),
        ),
    )
  )
    return source;
  const state = cloneState(source);
  resolveSuccessions(state);
  if (state.factions.find((faction) => faction.id === state.playerFactionId)?.eliminated) {
    for (const battle of state.battles.filter((battle) => battle.active)) {
      battle.battleData.outcome = getBattleTimeoutOutcome(battle.battleData);
      finishBattle(state, battle);
    }
    state.phase = 'finished';
    state.winnerFactionId =
      state.factions.find((faction) => !faction.eliminated && faction.id !== state.playerFactionId)
        ?.id ?? state.factions.find((faction) => faction.id !== state.playerFactionId)!.id;
    state.dayResolution = null;
  }
  state.revision++;
  return state;
}
