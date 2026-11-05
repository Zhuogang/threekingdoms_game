import { ARMY_MORALE as ARMY_MORALE_TABLE, ECONOMY as ECONOMY_TABLE } from '../balance';
import type { V03BattleState, V03GameState, V03Officer } from '../types';
import type { BattleOutcome, BattleSide } from '../battle';
import { createV03OrderServices } from '../governance/services';
import { PERSONNEL_RULES, personnelCount } from './personnel';
import { beginJourneyReturn } from '../calendar';
import { createReservePools } from './troop-experience';
import { getForcedBattleOutcome } from '../battle/engine';

// Module-local bindings: reading an imported table through the module namespace costs a getter call per access in hot loops.
const ECONOMY = ECONOMY_TABLE;
const PURSUIT = ARMY_MORALE_TABLE.pursuit;

/**
 * What a pursuit adds to the loser's fate (B-05), in percentage points: each pursuing formation
 * adds 5 points to the capture chance and 10 to the share of its men left wounded, at most 30 each,
 * halved when the loser named a rear guard. Formations of the rear guard itself take none.
 */
export function pursuitEffects(pursuit: BattleOutcome['pursuit'] | undefined): {
  capturePoints: number;
  woundedPoints: number;
} {
  if (!pursuit) return { capturePoints: 0, woundedPoints: 0 };
  const count = pursuit.pursuers.length;
  const factor = pursuit.rearGuard ? PURSUIT.rearGuardFactor : 1;
  return {
    capturePoints: Math.min(PURSUIT.cap, count * PURSUIT.capturePerPursuer) * factor,
    woundedPoints: Math.min(PURSUIT.cap, count * PURSUIT.woundedPerPursuer) * factor,
  };
}

/** Largest remainder with each source's original headcount as its hard upper bound. */
export function allocatePersonnel(total: number, capacities: readonly number[]): number[] {
  const sum = capacities.reduce((a, b) => a + b, 0);
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    total > sum ||
    capacities.some((value) => !Number.isSafeInteger(value) || value < 0)
  )
    throw new RangeError('Invalid personnel allocation.');
  if (sum === 0) return capacities.map(() => 0);
  const exact = capacities.map((value) => (value * total) / sum);
  const result = exact.map(Math.floor);
  let remaining = total - result.reduce((a, b) => a + b, 0);
  const order = capacities
    .map((_, i) => i)
    .sort((a, b) => exact[b]! - result[b]! - (exact[a]! - result[a]!) || a - b);
  for (const i of order) {
    if (remaining === 0) break;
    result[i]!++;
    remaining--;
  }
  return result;
}

export function battleCityId(state: V03GameState, battle: V03BattleState): string | undefined {
  return state.journeys.find((journey) => journey.id === battle.attackerJourneyId)
    ?.destinationCityId;
}

export function retreatDestination(state: V03GameState, battle: V03BattleState, side: BattleSide) {
  const original = state.journeys.find((journey) => journey.id === battle.attackerJourneyId);
  const from = original?.destinationCityId;
  const factionId = side === 'attacker' ? battle.attackerFactionId : battle.defenderFactionId;
  if (!original || !from || !factionId) return null;
  const units = battle.battleData.units.filter(
    (unit) =>
      unit.side === side &&
      !unit.isMilitia &&
      unit.role !== 'baggage' &&
      unit.troops + unit.wounded > 0,
  );
  const troopCount = units.reduce((sum, unit) => sum + unit.troops + unit.wounded, 0);
  const composition = {
    troopTypes: [...new Set(units.map((unit) => unit.troopType))],
    cavalryTroops: units
      .filter((unit) => unit.troopType === 'cavalry')
      .reduce((sum, unit) => sum + unit.troops + unit.wounded, 0),
    woundedTroops: units.reduce((sum, unit) => sum + unit.wounded, 0),
  };
  const services = createV03OrderServices();
  const choices = state.cities
    .filter((city) => city.factionId === factionId && city.id !== from)
    .flatMap((city) => {
      const route = services.planRoute({
        state,
        sourceCityId: from,
        targetCityId: city.id,
        movingFactionId: factionId,
        departureDay: state.absoluteDay + 1,
        troopCount,
        kind: 'requisition',
        composition,
      });
      if (!route) return [];
      return [
        {
          city,
          route,
          busy: state.battles.some(
            (other) =>
              other.active && other.id !== battle.id && battleCityId(state, other) === city.id,
          ),
          original: side === 'attacker' && city.id === original.sourceCityId,
        },
      ];
    });
  choices.sort(
    (a, b) =>
      Number(a.busy) - Number(b.busy) ||
      Number(b.original) - Number(a.original) ||
      a.route.estimatedDays - b.route.estimatedDays ||
      a.city.id.localeCompare(b.city.id),
  );
  return choices[0] ?? null;
}

/** Capture chance in percent of a retreating formation; a pursuit adds to it unless the formation was the rear guard. */
export function retreatRisk(battle: V03BattleState, hasRoute: boolean, rearGuard = false): number {
  if (!hasRoute) return 100;
  const forced = getForcedBattleOutcome(battle.battleData);
  const reason = forced?.reason;
  if (reason === 'elimination' || reason === 'rout')
    return (
      PERSONNEL_RULES.forcedCapturePercent +
      (reason === 'rout' && !rearGuard ? pursuitEffects(forced?.pursuit).capturePoints : 0)
    );
  return battle.battleData.engaged ? PERSONNEL_RULES.orderlyCapturePercent : 0;
}

export function previewRetreat(state: V03GameState, battle: V03BattleState, side: BattleSide) {
  const destination = retreatDestination(state, battle, side);
  const risk = retreatRisk(battle, destination !== null);
  const factionId = side === 'attacker' ? battle.attackerFactionId : battle.defenderFactionId;
  const cityId = battleCityId(state, battle);
  const officers = state.officers.filter(
    (officer) =>
      officer.alive &&
      factionId !== null &&
      officer.factionId === factionId &&
      ((officer.location.kind === 'battle' && officer.location.battleId === battle.id) ||
        (side === 'defender' &&
          battle.intent !== 'raid' &&
          officer.location.kind === 'city' &&
          officer.location.cityId === cityId)),
  );
  return {
    destination,
    risk,
    officers,
    atLeastOnePercent: 100 * (1 - (1 - risk / 100) ** officers.length),
    personnel: battle.battleData.units
      .filter((unit) => unit.side === side && !unit.isMilitia && unit.role !== 'baggage')
      .reduce((sum, unit) => sum + unit.troops + unit.wounded, 0),
  };
}

/** Applied by the campaign's once-only settlement, after original member allocation. */
export function settleBattlePersonnel(
  state: V03GameState,
  battle: V03BattleState,
  loot: { gold: number; food: number } | null,
): void {
  const original = state.journeys.find((journey) => journey.id === battle.attackerJourneyId)!;
  const city = state.cities.find((entry) => entry.id === original.destinationCityId)!;
  const outcome = battle.battleData.outcome!;
  const occupied = outcome.winner === 'attacker' && battle.intent !== 'raid';
  const forced = ['elimination', 'rout'].includes(outcome.reason);
  const putFood = (food: number) => {
    battle.foodOverflow =
      (battle.foodOverflow ?? 0) + Math.max(0, city.food + food - ECONOMY.resourceCap);
    city.food = Math.min(ECONOMY.resourceCap, city.food + food);
  };
  const putPopulation = (people: number) => {
    battle.populationOutflow =
      (battle.populationOutflow ?? 0) + Math.max(0, city.population + people - ECONOMY.resourceCap);
    city.population = Math.min(ECONOMY.resourceCap, city.population + people);
  };
  const membersFor = (side: BattleSide) =>
    state.officers
      .filter(
        (officer) =>
          officer.alive &&
          (side === 'attacker' || battle.defenderFactionId !== null) &&
          officer.factionId ===
            (side === 'attacker' ? battle.attackerFactionId : battle.defenderFactionId) &&
          ((officer.location.kind === 'battle' && officer.location.battleId === battle.id) ||
            (side === 'defender' &&
              occupied &&
              officer.location.kind === 'city' &&
              officer.location.cityId === city.id)),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
  const attackers = membersFor('attacker'),
    defenders = membersFor('defender');
  if (occupied) {
    let dispersed = city.reserve;
    const removed = new Set<string>();
    for (const source of state.troopSources.filter((entry) => entry.cityId === city.id)) {
      dispersed += personnelCount(source);
      removed.add(`source:${source.id}`);
    }
    state.troopSources = state.troopSources.filter((entry) => entry.cityId !== city.id);
    state.personnelDay.entries = state.personnelDay.entries.filter(
      (entry) => !removed.has(entry.recordId),
    );
    state.personnelDay.rations = state.personnelDay.rations.filter(
      (entry) => !removed.has(entry.recordId) && !entry.recordId.startsWith(`reserve:${city.id}:`),
    );
    for (const officer of defenders.filter((entry) => entry.location.kind === 'city')) {
      dispersed += personnelCount(officer);
      Object.assign(officer, { troops: 0, wounded: 0, troopExperience: 0, reorganizationDays: 0 });
    }
    battle.rearDispersed = dispersed;
    putPopulation(dispersed);
    city.reservePools = createReservePools();
    city.reserve = 0;
  }
  const returnParty = (officers: V03Officer[], side: BattleSide, food: number) => {
    if (!officers.length) {
      putFood(food);
      return;
    }
    const refuge = retreatDestination(state, battle, side);
    const total = officers.reduce((sum, officer) => sum + personnelCount(officer), 0);
    const composition = {
      troopTypes: [...new Set(officers.map((officer) => officer.troopType))],
      cavalryTroops: officers
        .filter((officer) => officer.troopType === 'cavalry')
        .reduce((sum, officer) => sum + personnelCount(officer), 0),
      woundedTroops: officers.reduce((sum, officer) => sum + officer.wounded, 0),
      soloOfficer: total === 0 && officers.length === 1,
    };
    const id = side === 'attacker' ? `${original.id}:return` : `${battle.id}:defender-return`;
    const services = createV03OrderServices();
    const route =
      refuge &&
      services.planRoute({
        state,
        movingFactionId: officers[0]!.factionId!,
        sourceCityId: city.id,
        targetCityId: refuge.city.id,
        departureDay: state.absoluteDay + 1,
        troopCount: total,
        kind: 'requisition',
        composition,
      });
    const manifest = {
      officerIds: officers.map((officer) => officer.id),
      troopCount: total,
      composition,
      carriedFood: food,
      cargo: {
        gold: side === 'attacker' ? (original.manifest.cargo.gold ?? 0) + (loot?.gold ?? 0) : 0,
        food: side === 'attacker' ? (original.manifest.cargo.food ?? 0) + (loot?.food ?? 0) : 0,
        troops: 0,
      },
    };
    const returning = route
      ? {
          ...services.createJourney({
            id,
            executionId: `${id}:execution`,
            ownerFactionId: officers[0]!.factionId!,
            kind: 'requisition',
            sourceCityId: city.id,
            targetCityId: refuge!.city.id,
            departureDay: state.absoluteDay + 1,
            arrivalDay: state.absoluteDay + 1 + route.estimatedDays,
            route,
            party: manifest,
            cargo: manifest.cargo,
            carriedFood: food,
          }),
          kind: 'return' as const,
          status: 'returning' as const,
        }
      : {
          ...beginJourneyReturn(original, state.absoluteDay + 1, manifest),
          id,
          executionId: `${id}:execution`,
          ownerFactionId: officers[0]!.factionId!,
          kind: 'return' as const,
          routeCityIds: original.routeCityIds?.slice().reverse(),
        };
    state.journeys.push(returning);
    for (const officer of officers) officer.location = { kind: 'journey', journeyId: id };
  };
  city.garrisonTroops = 0;
  for (const side of ['attacker', 'defender'] as const) {
    const members = side === 'attacker' ? attackers : defenders;
    const stay = side === 'attacker' ? occupied : !occupied;
    let food = side === 'attacker' ? battle.attackerFood : battle.defenderFood;
    const lost =
      outcome.winner !== null &&
      outcome.winner !== side &&
      !(side === 'defender' && battle.intent === 'raid');
    const hasRoute = retreatDestination(state, battle, side) !== null;
    const risk = lost ? retreatRisk(battle, hasRoute) : 0;
    // A pursuit presses the loser's formations except the rear guard that covered them (B-05).
    const pursuit = lost ? outcome.pursuit : undefined;
    const rearGuardIds = new Set(
      pursuit?.rearGuard
        ? ((side === 'attacker'
            ? battle.attackerFormationOfficerIds
            : battle.defenderFormationOfficerIds)[pursuit.rearGuard] ?? [])
        : [],
    );
    const guardedRisk = pursuit ? retreatRisk(battle, hasRoute, true) : risk;
    const escaped: V03Officer[] = [],
      captured: V03Officer[] = [];
    for (const officer of members) {
      const officerRisk = rearGuardIds.has(officer.id) ? guardedRisk : risk;
      let caught = officerRisk === 100;
      if (officerRisk > 0 && officerRisk < 100) {
        state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
        caught = state.rng % 100 < officerRisk;
      }
      if (caught) {
        officer.location = { kind: 'captured', cityId: city.id };
        captured.push(officer);
      } else {
        if (lost && forced) officer.wounded = Math.floor((officer.wounded * 2) / 3);
        if (pursuit && !rearGuardIds.has(officer.id)) {
          // The pursuit leaves more of the survivors too hurt to march.
          const hurt = Math.floor((officer.troops * pursuitEffects(pursuit).woundedPoints) / 100);
          officer.troops -= hurt;
          officer.wounded += hurt;
        }
        if (personnelCount(officer) === 0) officer.troopExperience = 0;
        escaped.push(officer);
      }
    }
    const captiveCount = captured.reduce((sum, officer) => sum + personnelCount(officer), 0);
    const escapeCount = escaped.reduce((sum, officer) => sum + personnelCount(officer), 0);
    if (lost && (captiveCount > 0 || escapeCount === 0)) {
      const returnedFood =
        captiveCount + escapeCount > 0
          ? Math.floor((food * escapeCount) / (captiveCount + escapeCount))
          : 0;
      putFood(food - returnedFood);
      food = returnedFood;
    }
    if (stay) {
      putFood(food);
      for (const officer of escaped) {
        officer.location = { kind: 'city', cityId: city.id };
        if (officer.reorganizationDays === 0) city.garrisonTroops += officer.troops;
      }
    } else returnParty(escaped, side, food);
  }
  if (!occupied) {
    for (const unit of battle.battleData.units.filter(
      (unit) => unit.side === 'defender' && unit.isMilitia,
    )) {
      city.garrisonTroops += unit.troops;
      city.garrisonExperience = unit.troops > 0 ? unit.troopExperience : 0;
      if (unit.troops > 0) {
        const paid = state.personnelDay.rations.find(
          (entry) => entry.recordId === `militia:${city.id}`,
        );
        if (paid) paid.troops += unit.troops;
        else
          state.personnelDay.rations.push({
            recordId: `militia:${city.id}`,
            troops: unit.troops,
            wounded: 0,
          });
      }
      if (unit.wounded > 0) {
        const id = `troop-source-${state.nextId++}`;
        state.troopSources.push({
          id,
          cityId: city.id,
          factionId: city.factionId,
          sourceOfficerId: null,
          autoReturn: false,
          troopType: 'infantry',
          troops: 0,
          wounded: unit.wounded,
          troopExperience: unit.troopExperience,
          reorganizationDays: 0,
        });
        state.personnelDay.rations.push({
          recordId: `source:${id}`,
          troops: 0,
          wounded: unit.wounded,
        });
      }
    }
  } else {
    const militia = battle.battleData.units
      .filter((unit) => unit.side === 'defender' && unit.isMilitia)
      .reduce((sum, unit) => sum + unit.troops + unit.wounded, 0);
    putPopulation(militia);
    for (const prisoner of state.officers.filter(
      (officer) => officer.location.kind === 'captured' && officer.location.cityId === city.id,
    )) {
      if (prisoner.factionId === city.factionId) {
        if (prisoner.capturedRulerFactionId) prisoner.capturedRulerFactionId = null;
        prisoner.location = { kind: 'city', cityId: city.id };
        if (prisoner.reorganizationDays === 0) city.garrisonTroops += prisoner.troops;
      } else if (prisoner.location.kind === 'captured') delete prisoner.location.holderFactionId;
    }
  }
  city.garrisonTroops =
    state.officers
      .filter(
        (officer) =>
          officer.alive &&
          officer.factionId === city.factionId &&
          officer.reorganizationDays === 0 &&
          officer.location.kind === 'city' &&
          officer.location.cityId === city.id,
      )
      .reduce((sum, officer) => sum + officer.troops, 0) +
    (!occupied
      ? battle.battleData.units
          .filter((unit) => unit.side === 'defender' && unit.isMilitia)
          .reduce((sum, unit) => sum + unit.troops, 0)
      : 0);
  original.status = 'cancelled';
  original.manifest = { ...original.manifest, carriedFood: 0 };
}
