import type { V03City, V03GameState, V03Journey } from '../types';
import { isCityCommitted } from '../governance/commitments';
import { getV03AttackAllianceBlock } from './monthly-systems';
import { availableTroops } from './personnel';
import { recordEvent } from './reports';

const RESOURCE_CAP = 9_999_999;

/** A return has no remaining recovery prospect only after every city and campaign is gone. */
export function surrenderStrandedReturn(
  state: V03GameState,
  journey: V03Journey,
  target: V03City,
): boolean {
  const factionId = journey.ownerFactionId;
  if (
    journey.kind !== 'return' ||
    !['waiting', 'delivered'].includes(journey.status) ||
    !target.factionId ||
    target.factionId === factionId ||
    getV03AttackAllianceBlock(state.alliances, factionId, target.factionId, state.monthIndex) ||
    state.cities.some((city) => city.factionId === factionId) ||
    state.journeys.some(
      (entry) =>
        entry.ownerFactionId === factionId &&
        entry.kind === 'campaign' &&
        (['outbound', 'returning', 'waiting'].includes(entry.status) ||
          // Movement marks arrivals delivered before their battles open. A
          // living commander still in that journey can recover a city today.
          (entry.status === 'delivered' &&
            state.officers.some(
              (officer) =>
                officer.alive &&
                officer.factionId === factionId &&
                officer.location.kind === 'journey' &&
                officer.location.journeyId === entry.id,
            ))),
    ) ||
    state.battles.some(
      (battle) =>
        battle.active &&
        (battle.attackerFactionId === factionId || battle.defenderFactionId === factionId),
    ) ||
    isCityCommitted(state, target.id)
  )
    return false;

  const officers = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.factionId === factionId &&
      officer.location.kind === 'journey' &&
      officer.location.journeyId === journey.id &&
      journey.manifest.officerIds.includes(officer.id),
  );
  for (const officer of officers) {
    officer.location = { kind: 'captured', cityId: target.id };
    officer.governorOfCityId = null;
  }
  // Captives travelling with the surrendered party change custody at the same place.
  // A captive of the receiving house is liberated, just as after a city capture.
  for (const officer of state.officers) {
    if (
      !officer.alive ||
      officer.location.kind !== 'captured' ||
      officer.location.journeyId !== journey.id
    )
      continue;
    if (officer.factionId === target.factionId) {
      officer.location = { kind: 'city', cityId: target.id };
      officer.capturedRulerFactionId = null;
      target.garrisonTroops += availableTroops(officer);
    } else officer.location = { kind: 'captured', cityId: target.id };
  }

  const gold = Math.max(0, (journey.manifest.cargo.gold ?? 0) - (journey.deliveredCargo.gold ?? 0));
  const food = Math.max(
    0,
    (journey.manifest.cargo.food ?? 0) +
      journey.manifest.carriedFood -
      (journey.deliveredCargo.food ?? 0),
  );
  const storedGold = Math.min(gold, Math.max(0, RESOURCE_CAP - target.gold));
  const storedFood = Math.min(food, Math.max(0, RESOURCE_CAP - target.food));
  target.gold += storedGold;
  target.food += storedFood;
  journey.deliveredCargo.gold = (journey.deliveredCargo.gold ?? 0) + storedGold;
  journey.deliveredCargo.food = (journey.deliveredCargo.food ?? 0) + storedFood;
  journey.deliveredCargo.personnel = 1;
  journey.status = 'cancelled';
  journey.returnRequested = false;

  const waitingGold = gold - storedGold;
  const waitingFood = food - storedFood;
  if (waitingGold || waitingFood) {
    // The cargo has already reached this city. Retain an owner-held warehouse
    // queue using the existing waiting-journey contract; never move or duplicate people.
    const id = `${state.scenarioId}:captured-cargo:${state.nextId++}`;
    state.journeys.push({
      ...journey,
      id,
      executionId: `${id}:execution`,
      ownerFactionId: target.factionId,
      kind: 'return',
      status: 'waiting',
      manifest: {
        officerIds: [],
        troopCount: 0,
        composition: { troopTypes: [] },
        carriedFood: 0,
        cargo: { gold: waitingGold, food: waitingFood, troops: 0 },
      },
      deliveredCargo: {},
      consumedFood: 0,
      supplyRemainderMicro: 0,
      accumulatedFoodShortfall: 0,
    });
  }
  recordEvent(state, {
    kind: 'journeyArrival',
    code: 'journey.strandedSurrender',
    title: 'Stranded return party surrendered',
    detail: `The returning party surrendered at ${target.name}: its house has no cities, active campaigns or battles. Officers retain their contingents in captivity; remaining cargo belongs to the receiving city.`,
    entityId: journey.id,
    tier:
      factionId === state.playerFactionId || target.factionId === state.playerFactionId
        ? 'critical'
        : 'chronicle',
    params: {
      factionId,
      cityId: target.id,
      officerIds: officers.map((officer) => officer.id).join(','),
      gold,
      food,
      waitingGold,
      waitingFood,
    },
  });
  return true;
}
