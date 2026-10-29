import {
  rivalCampaignSourceBlock,
  rivalCampaignTargetBlock,
  isRivalCampaignOfficerAvailable,
} from './ai/campaign-legality';
import { assessCampaignDeparture } from './ai/campaign-assessment';
import { recordAiDecision, type CampaignDecisionReason } from './ai/decision-trace';
import { FOOD_MICRO } from './calendar/rations';
import { forecastBattleRations } from './battle/supply';
import { cityAccruedUpkeep, cityProduction, cityServiceHeadcounts } from './campaign/economy';
import { recoverPersonnelDay } from './campaign/personnel-recovery';
import { planOfficerDebuts } from './campaign/officer-lifecycle';
import { isCityCommitted } from './governance/commitments';
import { applyTroopLoss } from './campaign/troop-experience';
import { battleExperienceGain } from './battle/experience';
import type { V03TroopGrowthReport } from './types';
import { eventTier, isCriticalReport } from './campaign/reports';
import {
  resolveSuccessions,
  resolveAiPrisoners,
  syncFactionRulerNames,
} from './campaign/prisoners';
import {
  createPersonnelDay,
  mergePersonnel,
  detachWoundedToCity,
  cityPersonnelSummary,
  retainPersonnel,
  availableTroops,
  refreshJourneyPersonnel,
} from './campaign/personnel';
import {
  allocatePersonnel,
  settleBattlePersonnel,
  retreatDestination,
} from './campaign/battle-aftermath';
import {
  appendBattleLog,
  getBattleTimeoutOutcome,
  getForcedBattleOutcome,
  advanceBattleDay,
  applyBattleAction,
  createCanvasBattleMap,
  createTacticalBattle,
  runBattleAiTurn,
  selectCampaignBattlefield,
  type TacticalBattleUnit,
  type V03TacticalBattleState,
} from './battle';
import { cityBattleRoster, groupOfficers, rosterFromGroups } from './campaign/roster';
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
  installPersonalRule,
} from './governance/appointments';
import { applyGovernorMonthlyWork, planGovernorMonthlyWork } from './governance/autonomy';
import {
  reconcileFactionObjectives,
  updateFactionObjectives,
  supportFactionObjectives,
  recordFactionCampaign,
} from './ai/faction-objectives';
import {
  CITY_WORK_PERIOD_DAYS,
  initializeCityWorkPeriods,
  committedCityStock,
} from './governance/city-actions';
import { availableCityResources } from './governance/authority';
import { planStrategicRivalCampaigns, type StrategicRivalCampaignPlan } from './strategic-ai';
import type {
  V03BattleState,
  V03CampaignDirective,
  V03City,
  V03DomainEvent,
  V03GameState,
  V03Journey,
  V03Officer,
} from './types';

const RESOURCE_CAP = 9_999_999;
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

function allocateSurvivors(
  unit: TacticalBattleUnit,
  memberIds: readonly string[],
  officers: V03Officer[],
  experienceGain: number,
): void {
  if (memberIds.length === 0) return;
  const members = memberIds
    .map((id) => officers.find((officer) => officer.id === id))
    .filter((officer): officer is V03Officer => Boolean(officer));
  const original = members.map((officer) => officer.troops);
  const originalTotal = original.reduce((sum, troops) => sum + troops, 0);
  if (originalTotal <= 0) return;
  const surviving = Math.max(0, Math.min(originalTotal, unit.troops));
  const retained = allocatePersonnel(Math.min(originalTotal, surviving + unit.wounded), original);
  const healthy = allocatePersonnel(surviving, retained);
  members.forEach((officer, index) => {
    officer.troops = healthy[index]!;
    officer.wounded = retained[index]! - healthy[index]!;
    officer.troopExperience =
      retained[index]! > 0 ? Math.min(1900, officer.troopExperience + experienceGain) : 0;
  });
}

export function chargeBattleRations(battle: V03BattleState, absoluteDay: number): void {
  const data = battle.battleData;
  if (
    battle.lastRationDay === absoluteDay ||
    !data.units.some((unit) => unit.side === 'attacker') ||
    !data.units.some((unit) => unit.side === 'defender')
  )
    return;
  battle.lastRationDay = absoluteDay;
  for (const side of ['attacker', 'defender'] as const) {
    const living = data.units.filter(
      (unit) => unit.side === side && unit.troops + unit.wounded > 0,
    );
    const foodKey = side === 'attacker' ? 'attackerFood' : 'defenderFood';
    const remainderKey =
      side === 'attacker' ? 'attackerFoodRemainderMicro' : 'defenderFoodRemainderMicro';
    const demand = forecastBattleRations(data, side, battle[remainderKey]);
    const { demandMicro, wholeFood: demandFood, shortage } = demand;
    const paid = Math.min(data.supplies[side], demandFood);
    data.supplies[side] -= paid;
    battle[foodKey] = data.supplies[side];
    battle[remainderKey] = shortage ? 0 : demandMicro - paid * FOOD_MICRO;
    if (shortage && living.length > 0) {
      battle.foodShortfallDays++;
      for (const unit of living) {
        unit.troops = Math.max(0, unit.troops - Math.ceil(unit.troops * 0.01));
        unit.wounded = Math.max(0, unit.wounded - Math.ceil(unit.wounded * 0.01));
        if (unit.troops + unit.wounded === 0) unit.troopExperience = 0;
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
  // Daily hunger can defeat an army after tactical actions have finished.
  if (!data.outcome) {
    const forced = getForcedBattleOutcome(data);
    if (forced && (forced.reason === 'elimination' || forced.reason === 'rout')) {
      data.outcome = forced;
      appendBattleLog(
        data,
        'The hungry army can no longer hold the field.',
        forced.reason === 'elimination' ? 'log.elimination' : 'log.rout',
        { winner: forced.winner, side: forced.winner === 'attacker' ? 'defender' : 'attacker' },
      );
    }
  }
}

function finishBattle(state: V03GameState, battle: V03BattleState): void {
  const outcome = battle.battleData.outcome;
  if (battle.resolved || !outcome) return;
  chargeBattleRations(battle, state.absoluteDay);
  const data = battle.battleData;
  const attackerWon = outcome.winner === 'attacker';
  const targetJourney = state.journeys.find((journey) => journey.id === battle.attackerJourneyId);
  const target =
    targetJourney && state.cities.find((city) => city.id === targetJourney.destinationCityId);
  const attackerFaction = state.factions.find((faction) => faction.id === battle.attackerFactionId);
  if (!target || !targetJourney || !attackerFaction) {
    battle.active = false;
    battle.resolved = true;
    battle.outcome = outcome.winner ?? 'draw';
    return;
  }

  const troopGrowth: Record<'attacker' | 'defender', V03TroopGrowthReport[]> = {
    attacker: [],
    defender: [],
  };
  for (const unit of data.units) {
    const gain = battleExperienceGain(unit, outcome);
    const membership =
      unit.side === 'attacker'
        ? battle.attackerFormationOfficerIds
        : battle.defenderFormationOfficerIds;
    const memberIds = membership[unit.id] ?? [];
    const members = state.officers.filter((officer) => memberIds.includes(officer.id));
    const beforeExperience = new Map(
      members.map((officer) => [officer.id, officer.troopExperience]),
    );
    allocateSurvivors(unit, memberIds, state.officers, gain);
    for (const officer of members) {
      const recordId = `officer:${officer.id}`;
      state.personnelDay.rations = state.personnelDay.rations.filter(
        (entry) => entry.recordId !== recordId,
      );
      state.personnelDay.rations.push({
        recordId,
        troops: officer.troops,
        wounded: officer.wounded,
      });
    }
    if (members.length) unit.troopExperience = mergePersonnel(...members).troopExperience;
    else if (unit.troops + unit.wounded > 0)
      unit.troopExperience = Math.min(1900, unit.troopExperience + gain);
    const participated = unit.combatCasualtiesDealt + unit.combatCasualtiesReceived > 0;
    troopGrowth[unit.side].push(
      ...(members.length
        ? members.map((officer) => ({
            officerId: officer.id,
            troopType: officer.troopType,
            survivingTroops: officer.troops,
            woundedTroops: officer.wounded,
            beforeExperience: beforeExperience.get(officer.id)!,
            afterExperience: officer.troopExperience,
            participated,
          }))
        : [
            {
              officerId: null,
              troopType: unit.troopType,
              survivingTroops: unit.troops,
              woundedTroops: unit.wounded,
              beforeExperience: unit.initialTroopExperience,
              afterExperience: unit.troopExperience,
              participated,
            },
          ]),
    );
  }

  const oldOwner = target.factionId;
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

  if (attackerWon && battle.intent !== 'raid') {
    for (const report of state.events)
      if (report.battleOutcome?.cityId === target.id && report.params?.governancePending)
        report.params.governancePending = false;
    for (const officer of state.officers)
      if (officer.governorOfCityId === target.id) officer.governorOfCityId = null;
    target.factionId = battle.attackerFactionId;
    target.troopServiceDaysThisMonth = 0;
    target.cavalryServiceDaysThisMonth = 0;
    target.prisonerServiceDaysThisMonth = 0;
    target.prisonerCavalryDaysThisMonth = 0;
    cancelPendingGovernorAppointment(
      state,
      target.id,
      'the city was captured before the candidate took office',
    );
    target.governorId = null;
    target.governanceMode = target.id === attackerFaction.capitalCityId ? 'ruler' : 'steward';
    target.garrisonExperience = 0;
    const formerOwner = state.factions.find((faction) => faction.id === oldOwner);
    if (formerOwner?.capitalCityId === target.id) {
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
        newCapital.governorId = null;
        for (const officer of state.officers)
          if (officer.governorOfCityId === newCapital.id) officer.governorOfCityId = null;
        if (formerOwner.isPlayer) state.playerCapitalCityId = newCapital.id;
      }
    }
    if (battle.intent === 'sack') battle.loot = applyPlunder(target);
  } else if (attackerWon && battle.intent === 'raid') battle.loot = applyPlunder();
  settleBattlePersonnel(state, battle, battle.loot);
  for (const side of ['attacker', 'defender'] as const)
    for (const entry of troopGrowth[side]) {
      const officer = state.officers.find((candidate) => candidate.id === entry.officerId);
      if (officer)
        Object.assign(entry, {
          survivingTroops: officer.troops,
          woundedTroops: officer.wounded,
          afterExperience: officer.troopExperience,
        });
      else if (side === 'defender' && target.factionId !== oldOwner)
        Object.assign(entry, { survivingTroops: 0, woundedTroops: 0, afterExperience: 0 });
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
      survivingTroops:
        officers.reduce((sum, officer) => sum + officer.troops, 0) +
        (side === 'defender' && target.factionId === oldOwner
          ? units.filter((unit) => unit.isMilitia).reduce((sum, unit) => sum + unit.troops, 0)
          : 0),
      woundedTroops:
        officers.reduce((sum, officer) => sum + officer.wounded, 0) +
        (side === 'defender' && target.factionId === oldOwner
          ? units.filter((unit) => unit.isMilitia).reduce((sum, unit) => sum + unit.wounded, 0)
          : 0),
      returned: officers
        .filter((officer) => officer.alive && officer.location.kind !== 'captured')
        .map((officer) => officer.id),
      captured: officers
        .filter((officer) => officer.alive && officer.location.kind === 'captured')
        .map((officer) => officer.id),
      killed: officers.filter((officer) => !officer.alive).map((officer) => officer.id),
      troopGrowth: troopGrowth[side],
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
  if (target.factionId !== oldOwner && battle.attackerFactionId === state.playerFactionId)
    report.params.governancePending = true;
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
  for (const officer of state.officers.filter(
    (entry) =>
      entry.alive &&
      entry.location.kind === 'city' &&
      entry.location.cityId === target.id &&
      target.factionId !== null &&
      entry.factionId === target.factionId,
  ))
    detachWoundedToCity(state, officer.id);
  const attacker = rosterFromGroups(groupOfficers(attackers), `${journey.id}:attack`);
  const defender = cityBattleRoster(state, target.id, `${journey.id}:defend`);
  const { officers: defenders, militia } = defender;
  const id = `battle-${state.nextId}`;
  const battleDays = journey.intent === 'raid' ? 10 : 30;
  const fieldFoodCount = defenders.reduce(
    (sum, officer) => sum + officer.troops * (officer.troopType === 'cavalry' ? 2 : 1),
    militia,
  );
  const rearFoodCount = Math.max(
    0,
    cityPersonnelSummary(state, target.id).foodHeadcount - fieldFoodCount,
  );
  const frontDemand = Math.ceil(
    fieldFoodCount * PILOT_LOGISTICS_RATES.battleFoodPerTroopDay * battleDays,
  );
  const rearDemand = Math.ceil(
    (rearFoodCount * battleDays +
      (target.troopServiceDaysThisMonth ?? 0) +
      (target.cavalryServiceDaysThisMonth ?? 0) +
      (target.prisonerServiceDaysThisMonth ?? 0) +
      (target.prisonerCavalryDaysThisMonth ?? 0)) *
      PILOT_LOGISTICS_RATES.cityFoodPerTroopDay,
  );
  const defenderFood =
    target.food >= frontDemand + rearDemand
      ? frontDemand
      : Math.floor((target.food * frontDemand) / Math.max(1, frontDemand + rearDemand));
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
    supplies: { attacker: journey.manifest.carriedFood, defender: defenderFood },
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
    defenderFood,
    attackerFoodRemainderMicro: 0,
    defenderFoodRemainderMicro: 0,
    foodShortfallDays: 0,
    attackerFormationOfficerIds: attacker.membership,
    defenderFormationOfficerIds: defender.membership,
  };
  tactical.log[0] = `The battle at ${target.name} begins.`;
  tactical.logEntries = [{ day: 1, index: 0, code: 'log.begin', params: { cityId: target.id } }];
  journey.manifest = { ...journey.manifest, carriedFood: 0 };
  target.food -= defenderFood;
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
  if (tactical.outcome) {
    finishBattle(state, battle);
    if (state.winnerFactionId === null)
      state.phase = state.battles.some((entry) => entry.active) ? 'battle' : 'planning';
  }
}

function attackerFactionName(state: V03GameState, factionId: string | null): string {
  return (
    (factionId && state.factions.find((faction) => faction.id === factionId)?.name) ??
    'Independent defenders'
  );
}

/** Pick a deterministic first hop along the shortest geography route to any friendly city. */
function friendlyRefugeHop(state: V03GameState, journey: V03Journey): string | null {
  const fromCityId = journey.destinationCityId,
    factionId = journey.ownerFactionId;
  const services = createV03OrderServices();
  const choices = state.cities
    .filter((city) => city.factionId === factionId && city.id !== fromCityId)
    .flatMap((city) => {
      const route = services.planRoute({
        state,
        sourceCityId: fromCityId,
        targetCityId: city.id,
        movingFactionId: factionId,
        departureDay: state.absoluteDay,
        troopCount: journey.manifest.troopCount,
        kind: 'requisition',
        composition: journey.manifest.composition,
      });
      return route
        ? [
            {
              cityId: city.id,
              days: route.estimatedDays,
              busy: state.battles.some(
                (battle) =>
                  battle.active &&
                  state.journeys.find((entry) => entry.id === battle.attackerJourneyId)
                    ?.destinationCityId === city.id,
              ),
            },
          ]
        : [];
    })
    .sort(
      (a, b) =>
        Number(a.busy) - Number(b.busy) || a.days - b.days || a.cityId.localeCompare(b.cityId),
    );
  return choices[0]?.cityId ?? null;
}

/** Keep a returning party and its cargo when the named refuge changed hands. */
function redirectJourneyToFriendlyCity(state: V03GameState, journey: V03Journey): boolean {
  const hop = friendlyRefugeHop(state, journey);
  if (!hop) return false;
  const services = createV03OrderServices();
  const route = services.planRoute({
    state,
    sourceCityId: journey.destinationCityId,
    targetCityId: hop,
    movingFactionId: journey.ownerFactionId,
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
  for (const officer of state.officers)
    if (officer.location.kind === 'captured' && officer.location.journeyId === journey.id)
      officer.location = {
        kind: 'captured',
        cityId: null,
        holderFactionId: journey.ownerFactionId,
        journeyId: id,
      };
  for (const officerId of journey.manifest.officerIds) {
    const officer = state.officers.find((entry) => entry.id === officerId);
    if (officer) officer.location = { kind: 'journey', journeyId: id };
  }
  state.nextId++;
  return true;
}

function startRequestedJourneyReturn(state: V03GameState, journey: V03Journey): boolean {
  if (journey.status !== 'waiting' && journey.status !== 'delivered') return false;
  // An appointee may be replaced after arrival. Reload their current contingent
  // and withdraw the provisions already deposited, rather than duplicating them.
  if (journey.kind === 'appointment' && journey.deliveredCargo.personnel === 1) {
    const city = state.cities.find((entry) => entry.id === journey.destinationCityId);
    const members = state.officers.filter(
      (officer) =>
        journey.manifest.officerIds.includes(officer.id) &&
        officer.alive &&
        officer.factionId === journey.ownerFactionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city?.id,
    );
    if (
      !city ||
      city.factionId !== journey.ownerFactionId ||
      members.length !== journey.manifest.officerIds.length
    ) {
      // Capture or a later transfer already took responsibility for this party.
      journey.returnRequested = false;
      return true;
    }
    const food = Math.min(
      availableCityResources(state, city.id).food,
      journey.manifest.carriedFood,
    );
    const count = members.reduce((sum, officer) => sum + officer.troops + officer.wounded, 0);
    journey.manifest = {
      ...journey.manifest,
      troopCount: count,
      carriedFood: food,
      composition: {
        ...journey.manifest.composition,
        cavalryTroops: members
          .filter((officer) => officer.troopType === 'cavalry')
          .reduce((sum, officer) => sum + officer.troops + officer.wounded, 0),
        woundedTroops: members.reduce((sum, officer) => sum + officer.wounded, 0),
      },
      cargo: { gold: 0, food: 0, troops: 0 },
    };
    city.garrisonTroops -= members.reduce((sum, officer) => sum + availableTroops(officer), 0);
    city.food -= food;
    for (const officer of members) officer.location = { kind: 'journey', journeyId: journey.id };
    journey.deliveredCargo = {};
    journey.status = 'waiting';
  }
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
  for (const officer of state.officers)
    if (officer.location.kind === 'captured' && officer.location.journeyId === journey.id)
      officer.location = {
        kind: 'captured',
        cityId: null,
        holderFactionId: journey.ownerFactionId,
        journeyId: returnJourney.id,
      };
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
    !['requisition', 'campaign', 'appointment', 'transfer'].includes(journey.kind) ||
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
    if (target && journey.kind !== 'campaign' && target.factionId !== journey.ownerFactionId) {
      redirectJourneyToFriendlyCity(state, journey);
      continue;
    }
    const battleAtDestination = state.battles.some((battle) => {
      if (!battle.active) return false;
      const attackerJourney = state.journeys.find((entry) => entry.id === battle.attackerJourneyId);
      return attackerJourney?.destinationCityId === journey.destinationCityId;
    });
    const queuedCampaignCanStart =
      journey.kind === 'campaign' &&
      target?.factionId !== journey.ownerFactionId &&
      !battleAtDestination;
    if (
      (target?.factionId === journey.ownerFactionId && !battleAtDestination) ||
      queuedCampaignCanStart
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
    if (
      target.factionId === journey.ownerFactionId &&
      state.battles.some(
        (battle) =>
          battle.active &&
          state.journeys.find((entry) => entry.id === battle.attackerJourneyId)
            ?.destinationCityId === target.id,
      )
    ) {
      journey.status = 'waiting';
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
    const captives = state.officers.filter(
      (officer) =>
        officer.alive &&
        officer.location.kind === 'captured' &&
        officer.location.journeyId === journey.id,
    );
    const captiveHealthy = captives.reduce((sum, officer) => sum + officer.troops, 0);
    const reorganizing = journey.manifest.officerIds.reduce((sum, officerId) => {
      const officer = state.officers.find((entry) => entry.id === officerId && entry.alive);
      return sum + (officer && officer.reorganizationDays > 0 ? officer.troops : 0);
    }, 0);
    const troops = Math.max(
      0,
      Math.max(
        journey.manifest.troopCount -
          (journey.manifest.composition.woundedTroops ?? 0) -
          captiveHealthy,
        cargo.troops ?? 0,
      ) - reorganizing,
    );
    target.garrisonTroops += troops;
    for (const officer of captives) officer.location = { kind: 'captured', cityId: target.id };
    journey.deliveredCargo.troops = troops;
    for (const officerId of journey.manifest.officerIds) {
      const officer = state.officers.find((entry) => entry.id === officerId);
      if (officer) officer.location = { kind: 'city', cityId: target.id };
    }
    journey.deliveredCargo.personnel = 1;
  }
  return true;
}

/** Internal monthly commit boundary: failed plans preserve state and assigned IDs. */
export function dispatchRivalCampaignPlan(
  state: V03GameState,
  plan: StrategicRivalCampaignPlan,
  alreadyAssignedOfficerIds: Set<string> = new Set(),
): boolean {
  const reject = (reason: CampaignDecisionReason) => {
    recordAiDecision({
      kind: 'campaign',
      day: state.absoluteDay,
      factionId: plan.factionId,
      sourceCityId: plan.sourceCityId,
      targetCityId: plan.targetCityId,
      status: 'execution-rejected',
      reason,
    });
    return false;
  };
  const block =
    rivalCampaignSourceBlock(state, plan.factionId, plan.sourceCityId) ??
    rivalCampaignTargetBlock(state, plan.factionId, plan.targetCityId);
  if (block) return reject(block);
  const faction = state.factions.find((entry) => entry.id === plan.factionId)!;
  const source = state.cities.find((entry) => entry.id === plan.sourceCityId)!;
  const target = state.cities.find((entry) => entry.id === plan.targetCityId)!;
  if (
    state.phase === 'finished' ||
    plan.departureDay !== state.absoluteDay ||
    plan.intent !== 'conquer'
  )
    return reject('stale-plan');

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
    return reject('invalid-party');

  const officers = officerIds.map((id) => state.officers.find((entry) => entry.id === id));
  if (
    officers.some(
      (officer) =>
        !isRivalCampaignOfficerAvailable(state, officer, plan.factionId, plan.sourceCityId),
    )
  )
    return reject('invalid-party');
  const rosteredTroops = officers.reduce((sum, officer) => sum + (officer?.troops ?? 0), 0);
  if (
    rosteredTroops !== plan.requestedTroops ||
    officers.reduce(
      (sum, officer) => sum + (officer?.troopType === 'cavalry' ? officer.troops : 0),
      0,
    ) !== plan.party.composition.cavalryTroops ||
    officers.some(
      (officer, index) => officer?.troopType !== plan.party.composition.troopTypes[index],
    )
  )
    return reject('invalid-party');

  const protectedGarrison = Math.min(1000, Math.ceil(source.garrisonTroops * 0.35));
  if (
    source.garrisonTroops - committedCityStock(state, source.id).troops - plan.requestedTroops <
    protectedGarrison
  )
    return reject('invalid-party');

  try {
    const currentRoute = createV03OrderServices().planRoute({
      state,
      sourceCityId: source.id,
      targetCityId: target.id,
      departureDay: state.absoluteDay,
      troopCount: plan.requestedTroops,
      kind: 'campaign',
      composition: plan.party.composition,
    });
    if (
      !currentRoute ||
      JSON.stringify(currentRoute) !== JSON.stringify(plan.route) ||
      plan.estimatedArrivalDay !== state.absoluteDay + currentRoute.estimatedDays
    )
      return reject('invalid-route');
  } catch {
    return reject('invalid-route');
  }

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
    source.food - committedCityStock(state, source.id).food < plan.food
  )
    return reject('unaffordable');

  const assessment = assessCampaignDeparture(
    state,
    source.id,
    target.id,
    plan.party,
    plan.food,
    plan.route.estimatedDays,
  );
  if (assessment.reason) return reject(assessment.reason);

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
    return reject('invalid-route');
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
    return reject('invalid-party');

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
    detachWoundedToCity(state, officer!.id);
    officer!.location = { kind: 'journey', journeyId };
    alreadyAssignedOfficerIds.add(officer!.id);
  }
  state.directives.push(directive);
  state.journeys.push(journey);
  state.nextId += 2;
  recordFactionCampaign(state, plan.factionId, source.id, target.id, officerIds[0]!, directiveId);
  pushLog(
    state,
    `${faction.name} dispatched ${plan.requestedTroops} troops from ${source.name} toward ${target.name}; ${plan.food} food is committed for the march and campaign.`,
  );
  recordAiDecision({
    kind: 'campaign',
    day: state.absoluteDay,
    factionId: plan.factionId,
    sourceCityId: source.id,
    targetCityId: target.id,
    status: 'committed',
    reason: 'dispatch-revalidation',
    troops: plan.requestedTroops,
    food: plan.food,
    travelDays: plan.route.estimatedDays,
    journeyId,
  });
  return true;
}

export function dispatchMonthlyRivalCampaigns(state: V03GameState): void {
  const factions = state.factions
    .filter(
      (faction) => !faction.isPlayer && faction.id !== state.playerFactionId && !faction.eliminated,
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const assignedOfficerIds = new Set<string>();
  for (const faction of factions) {
    const attempted: StrategicRivalCampaignPlan[] = [];
    // Three attempts at most; failed proposals never consume the one successful dispatch allowance.
    for (let attempt = 0; attempt < 3; attempt++) {
      const plan = planStrategicRivalCampaigns(state, {
        factionId: faction.id,
        excludedCandidates: attempted,
      })[0];
      if (!plan) break;
      attempted.push(plan);
      if (dispatchRivalCampaignPlan(state, plan, assignedOfficerIds)) break;
    }
  }
}

function settleAutonomousCityWork(state: V03GameState) {
  updateFactionObjectives(state);
  supportFactionObjectives(state);
  const governorActions = new Map<string, string[]>();
  for (const city of state.cities) {
    if (
      city.factionId === null ||
      isCityCommitted(state, city.id) ||
      (city.governanceMode === 'ruler' && city.factionId === state.playerFactionId)
    )
      continue;
    let completed = 0;
    // Paid work stops at the shared quota. Free work is bounded by available
    // reserves, gold, officer caps and the existing monthly assignment limit.
    for (;;) {
      const plan = planGovernorMonthlyWork(state, city.id);
      const work = applyGovernorMonthlyWork(state, plan);
      if (!work.applied || !work.city) {
        recordAiDecision({
          kind: 'governor',
          day: state.absoluteDay,
          factionId: city.factionId!,
          cityId: city.id,
          action: plan.action,
          workPoints: 0,
          status: plan.action ? 'execution-rejected' : 'blocked',
          reason: plan.action ? 'stale-plan' : plan.reasonCode,
        });
        if (completed === 0) pushLog(state, `${city.name} autonomy: no work (${plan.reason})`);
        break;
      }
      Object.assign(city, work.city);
      if (work.state) {
        state.officers = work.state.officers;
        state.troopSources = work.state.troopSources;
        state.personnelDay = work.state.personnelDay;
        state.rng = work.state.rng;
        state.nextId = work.state.nextId;
        state.log = work.state.log;
        state.revision = work.state.revision;
      }
      if (plan.action)
        governorActions.set(city.id, [...(governorActions.get(city.id) ?? []), plan.action]);
      completed++;
      recordAiDecision({
        kind: 'governor',
        day: state.absoluteDay,
        factionId: city.factionId!,
        cityId: city.id,
        action: plan.action,
        workPoints: plan.workPoints,
        status: 'committed',
        reason: plan.reasonCode,
      });
      pushLog(state, `${city.name} autonomy: ${plan.action} (${plan.reason})`);
    }
  }
  updateFactionObjectives(state);
  return governorActions;
}

function settleMonth(state: V03GameState, year: number, month: number): V03GameState {
  const next = cloneState(state);
  const beforeCities = structuredClone(state.cities);
  const shortages = new Set<string>();
  for (const city of next.cities) {
    const serving = next.officers.filter(
      (officer) =>
        officer.alive &&
        officer.factionId === city.factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id,
    );
    const staffedTroops = serving.reduce((sum, officer) => sum + availableTroops(officer), 0);
    const militiaTroops = Math.max(0, city.garrisonTroops - staffedTroops);
    const { food: harvest, gold: income } = cityProduction(city, month);
    const { food: foodUpkeep, gold: goldUpkeep } = cityAccruedUpkeep(next, city);
    city.cavalryServiceDaysThisMonth = 0;
    city.prisonerServiceDaysThisMonth = 0;
    city.prisonerCavalryDaysThisMonth = 0;
    city.troopServiceDaysThisMonth = 0;
    city.food = Math.min(RESOURCE_CAP, city.food + harvest);
    city.gold = Math.min(RESOURCE_CAP, city.gold + income);
    if (city.food < foodUpkeep) {
      shortages.add(city.id);
      city.food = 0;
      city.loyalty = Math.max(0, city.loyalty - 8);
      const survivingMilitia = Math.floor(militiaTroops * 0.85);
      for (const officer of serving) {
        retainPersonnel(
          officer,
          Math.floor(officer.troops * 0.85),
          Math.floor(officer.wounded * 0.85),
        );
        officer.loyalty = Math.max(0, officer.loyalty - 4);
      }
      city.garrisonTroops =
        serving.reduce((sum, officer) => sum + availableTroops(officer), 0) + survivingMilitia;
      for (const pool of Object.values(city.reservePools))
        applyTroopLoss(pool, Math.floor(pool.troops * 0.85));
      city.reserve = Object.values(city.reservePools).reduce((sum, pool) => sum + pool.troops, 0);
      for (const source of next.troopSources.filter((entry) => entry.cityId === city.id))
        retainPersonnel(
          source,
          Math.floor(source.troops * 0.85),
          Math.floor(source.wounded * 0.85),
        );
      for (const captive of next.officers.filter(
        (entry) =>
          entry.alive && entry.location.kind === 'captured' && entry.location.cityId === city.id,
      ))
        retainPersonnel(
          captive,
          Math.floor(captive.troops * 0.85),
          Math.floor(captive.wounded * 0.85),
        );
      const removed = new Set(
        next.troopSources
          .filter((entry) => entry.troops + entry.wounded === 0)
          .map((entry) => `source:${entry.id}`),
      );
      next.troopSources = next.troopSources.filter((entry) => entry.troops + entry.wounded > 0);
      next.personnelDay.entries = next.personnelDay.entries.filter(
        (entry) => !removed.has(entry.recordId),
      );
      next.personnelDay.rations = next.personnelDay.rations.filter(
        (entry) => !removed.has(entry.recordId),
      );
      if (survivingMilitia === 0) city.garrisonExperience = 0;
      pushLog(next, `${city.name} runs short of provisions; soldiers desert.`);
    } else {
      city.food -= foodUpkeep;
      city.garrisonTroops =
        serving.reduce((sum, officer) => sum + availableTroops(officer), 0) + militiaTroops;
    }
    if (city.gold < goldUpkeep) {
      shortages.add(city.id);
      city.gold = 0;
      for (const officer of serving) officer.loyalty = Math.max(0, officer.loyalty - 3);
    } else city.gold -= goldUpkeep;
  }
  // Every city bill is now paid. Governor forecasts must see the new month's
  // boundary, even though the outer timeline is still completing its callback.
  next.dayResolution = null;
  const governorActions = settleAutonomousCityWork(next);
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
    lastOfficerGrowthYear: governed.lastOfficerDebutYear,
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
      equipment: officer.equipment,
      troops: officer.troops,
      wounded: officer.wounded,
      reorganizationDays: officer.reorganizationDays,
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
    if (officer.troops + officer.wounded === 0) officer.troopExperience = 0;
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
  if (refreshed.phase !== 'finished') {
    updateFactionObjectives(refreshed);
    dispatchMonthlyRivalCampaigns(refreshed);
  }
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
  const debuts = planOfficerDebuts(refreshed);
  refreshed.officers.push(...debuts.officers);
  for (const notice of debuts.notices) {
    addEvent(
      refreshed,
      'campaignEvent',
      'New officers appeared',
      JSON.stringify({
        key: 'officer-debut',
        entityIds: notice.officerIds,
        values: { year: notice.year },
      }),
      null,
      effectiveDay,
    );
    const noticeEvent = refreshed.events.at(-1)!;
    noticeEvent.code = 'officer.debut';
    noticeEvent.params = { year: notice.year, officerIds: notice.officerIds.join(',') };
    noticeEvent.tier = 'notice';
  }
  refreshed.lastOfficerDebutYear = debuts.throughYear;
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
  tactical.retreatAllowed = {
    attacker: retreatDestination(state, battle, 'attacker') !== null,
    defender: retreatDestination(state, battle, 'defender') !== null,
  };
  const rationRemainders = {
    attacker: battle.attackerFoodRemainderMicro,
    defender: battle.defenderFoodRemainderMicro,
  };
  if (!playerFights || battle.autoCommand)
    tactical = runBattleAiTurn(tactical, tactical.playerSide, rationRemainders);
  tactical = advanceBattleDay(tactical, rationRemainders);
  battle.battleData = tactical;
  battle.playerDayComplete = false;
  chargeBattleRations(battle, state.absoluteDay);
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
  initializeCityWorkPeriods(state);
  refreshJourneyPersonnel(state);
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
      for (const city of state.cities) {
        const {
          own: troopCount,
          cavalry: cavalryTroops,
          prisoners: captiveCount,
          prisonerCavalry,
        } = cityServiceHeadcounts(state, city.id);
        const elapsed = state.absoluteDay % DAYS_PER_MONTH;
        city.troopServiceDaysThisMonth =
          (city.troopServiceDaysThisMonth ?? troopCount * elapsed) + troopCount;
        city.cavalryServiceDaysThisMonth =
          (city.cavalryServiceDaysThisMonth ?? cavalryTroops * elapsed) + cavalryTroops;
        city.prisonerServiceDaysThisMonth = (city.prisonerServiceDaysThisMonth ?? 0) + captiveCount;
        city.prisonerCavalryDaysThisMonth =
          (city.prisonerCavalryDaysThisMonth ?? 0) + prisonerCavalry;
      }
      recoverPersonnelDay(state);
      return current;
    },
    settleMonth: (current, year, month) => {
      // Movement may deliver a party on the month boundary. Consume those arrivals
      // before replacing the old journey statuses, or the final refresh misses them.
      const previousJourneys = structuredClone(state.journeys);
      applyTimeline(state, current);
      if (state.personnelDay.absoluteDay !== state.absoluteDay)
        state.personnelDay = createPersonnelDay(state);
      handleArrivals(state, previousJourneys);
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
      if (state.personnelDay.absoluteDay !== state.absoluteDay)
        state.personnelDay = createPersonnelDay(state);
      handleArrivals(state, previousJourneys);
      state = reconcileFactionObjectives(reconcileV03Rulers(state));
      if (
        state.absoluteDay % CITY_WORK_PERIOD_DAYS === 0 &&
        state.absoluteDay % DAYS_PER_MONTH !== 0
      )
        settleAutonomousCityWork(state);
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

/** Reconcile earlier v3 ruler state without replaying a campaign day. */
export function reconcileV03Rulers(source: V03GameState): V03GameState {
  const faction = source.factions.find((entry) => entry.id === source.playerFactionId)!;
  const ruler = source.officers.find((entry) => entry.id === faction.leaderOfficerId);
  // An effective governor office is authoritative; a pending appointment or the
  // ruler's physical location alone must never relocate the capital on load.
  const rulerCity =
    !faction.eliminated &&
    ruler?.alive &&
    ruler.factionId === faction.id &&
    ruler.location.kind !== 'captured'
      ? source.cities.find((city) => city.factionId === faction.id && city.governorId === ruler.id)
      : undefined;
  const needsSuccession = source.factions.some(
    (faction) =>
      !faction.eliminated &&
      source.officers.some(
        (officer) =>
          officer.id === faction.leaderOfficerId &&
          (!officer.alive ||
            officer.location.kind === 'captured' ||
            officer.factionId !== faction.id),
      ),
  );
  const staleRulerNames = source.factions.some((faction) => {
    const leader = source.officers.find((officer) => officer.id === faction.leaderOfficerId);
    return (
      !faction.eliminated &&
      leader?.alive &&
      leader.factionId === faction.id &&
      leader.location.kind !== 'captured' &&
      (faction.name !== leader.name || faction.chinese !== leader.chinese)
    );
  });
  if (!needsSuccession && !rulerCity && !staleRulerNames) return source;
  const state = cloneState(source);
  if (rulerCity) {
    cancelPendingGovernorAppointment(state, rulerCity.id, 'the ruler takes direct command');
    installPersonalRule(
      state,
      state.cities.find((city) => city.id === rulerCity.id)!,
    );
    state.governanceRevision++;
  }
  if (needsSuccession) resolveSuccessions(state);
  syncFactionRulerNames(state);
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
