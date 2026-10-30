import { campaignBattleDays } from '../battle/types';
import { estimateCampaignSupply } from '../calendar';
import { detachWoundedToCity } from '../campaign/personnel';
import type { V03Command, V03GameState } from '../types';
import { isCityCommitted } from './commitments';
import { createV03OrderServices } from './services';
import { requestCampaignDirective } from './orders';
import { availableCityResources } from './authority';

export function armyPreview(
  state: V03GameState,
  sourceCityId: string,
  targetCityId: string,
  officerIds: string[],
  intent: 'conquer' | 'raid' | 'sack',
) {
  const officers = state.officers.filter((officer) => officerIds.includes(officer.id));
  const troops = officers.reduce((sum, officer) => sum + officer.troops, 0);
  const composition = {
    troopTypes: [...new Set(officers.map((officer) => officer.troopType))],
    cavalryTroops: officers
      .filter((o) => o.troopType === 'cavalry')
      .reduce((sum, o) => sum + o.troops, 0),
  };
  const route = createV03OrderServices().planRoute({
    state,
    sourceCityId,
    targetCityId,
    departureDay: state.absoluteDay,
    troopCount: troops,
    kind: 'campaign',
    composition,
  });
  const food = route
    ? estimateCampaignSupply({
        troopCount: troops,
        cavalryTroops: composition.cavalryTroops,
        outboundDays: route.estimatedDays,
        battleDays: campaignBattleDays(intent),
        returnDays: route.estimatedDays,
      }).totalFood
    : 0;
  return { officers, troops, composition, route, food };
}

/**
 * Destination checks a capital march applies before dispatch, shared with the march form so a
 * blocked destination explains itself before Confirm. Party, route and food are checked later.
 */
export function marchDestinationBlock(
  state: V03GameState,
  sourceCityId: string,
  targetCityId: string,
  intent: Extract<V03Command, { type: 'marchArmy' }>['intent'],
): string | null {
  const source = state.cities.find((city) => city.id === sourceCityId);
  const target = state.cities.find((city) => city.id === targetCityId);
  if (!source || !target) return 'Choose a friendly source and a different destination.';
  if (isCityCommitted(state, target.id)) return 'This city is committed to an active battle.';
  if (target.factionId === state.playerFactionId)
    return 'A campaign directive must target an enemy or independent city.';
  if (
    state.alliances.some(
      (alliance) =>
        alliance.expiresMonthIndex > state.monthIndex &&
        ((alliance.a === source.factionId && alliance.b === target.factionId) ||
          (alliance.b === source.factionId && alliance.a === target.factionId)),
    )
  )
    return 'An active alliance prevents this attack.';
  if (intent !== 'conquer' && state.absoluteDay < (target.plunderCooldownUntilDay ?? 0))
    return 'This city is recovering from a recent raid or sack.';
  if (
    state.directives.some(
      (order) =>
        order.sourceCityId === source.id &&
        ['proposed', 'waiting', 'accepted', 'reserved', 'dispatched'].includes(order.status),
    )
  )
    return 'This source city already has an active campaign directive.';
  return null;
}

export function marchArmy(
  state: V03GameState,
  command: Extract<V03Command, { type: 'marchArmy' }>,
) {
  const fail = (error: string) => ({ ok: false, state, error });
  const source = state.cities.find((city) => city.id === command.sourceCityId);
  const target = state.cities.find((city) => city.id === command.targetCityId);
  if (!source || source.factionId !== state.playerFactionId || !target || source.id === target.id)
    return fail('Choose a friendly source and a different destination.');
  if (isCityCommitted(state, source.id) || isCityCommitted(state, target.id))
    return fail('This city is committed to an active battle.');
  if (
    new Set(command.officerIds).size !== command.officerIds.length ||
    command.officerIds.length === 0
  )
    return fail('Choose at least one available officer.');
  const preview = armyPreview(state, source.id, target.id, command.officerIds, command.intent);
  if (
    preview.officers.length !== command.officerIds.length ||
    preview.officers.some(
      (officer) =>
        !officer.alive ||
        officer.factionId !== state.playerFactionId ||
        officer.troops <= 0 ||
        officer.reorganizationDays > 0 ||
        officer.location.kind !== 'city' ||
        officer.location.cityId !== source.id,
    )
  )
    return fail('Choose living officers with troops stationed in the source city.');
  if (
    command.food !== undefined &&
    (!Number.isSafeInteger(command.food) || command.food < preview.food)
  )
    return fail('The selected army needs enough food for the march, battle and return.');
  const services = createV03OrderServices();
  if (source.id !== state.playerCapitalCityId) {
    const result = requestCampaignDirective(
      state,
      {
        sourceCityId: source.id,
        targetCityId: target.id,
        requestedTroops: preview.troops,
        intent: command.intent,
        requestedByDay: null,
        officerIds: command.officerIds,
        ...(command.food !== undefined ? { food: command.food } : {}),
      },
      services,
    );
    return { ...result, error: result.ok ? undefined : result.message, orderId: result.order?.id };
  }
  const blocked = marchDestinationBlock(state, source.id, target.id, command.intent);
  if (blocked) return fail(blocked);
  const food = command.food ?? preview.food;
  const available = availableCityResources(state, source.id);
  if (!preview.route) return fail('There is no currently usable route to the destination.');
  if (!Number.isSafeInteger(food) || food < preview.food || food > available.food)
    return fail('The selected army needs enough food for the march, battle and return.');
  if (preview.troops > available.troops) return fail('The source city cannot supply these troops.');
  const next = structuredClone(state);
  const id = `${state.scenarioId}:army:${next.nextId++}`;
  const orderId = `${state.scenarioId}:directive:${next.nextId++}`;
  const journey = services.createJourney({
    id,
    executionId: orderId,
    ownerFactionId: state.playerFactionId,
    kind: 'campaign',
    intent: command.intent,
    sourceCityId: source.id,
    targetCityId: target.id,
    departureDay: state.absoluteDay,
    arrivalDay: state.absoluteDay + preview.route.estimatedDays,
    route: preview.route,
    party: {
      officerIds: command.officerIds,
      troopCount: preview.troops,
      composition: preview.composition,
    },
    cargo: { gold: 0, food: 0, troops: 0 },
    carriedFood: food,
  });
  next.journeys.push(journey);
  next.directives.push({
    id: orderId,
    factionId: state.playerFactionId,
    sourceCityId: source.id,
    targetCityId: target.id,
    intent: command.intent,
    requestedTroops: preview.troops,
    proposedTroops: preview.troops,
    officerIds: command.officerIds,
    requestedByDay: null,
    earliestDepartureDay: state.absoluteDay,
    estimatedArrivalDay: journey.expectedArrivalDay,
    status: 'dispatched',
    journeyId: id,
    governanceRevision: state.governanceRevision,
    message: 'The campaign force and its provisions have departed.',
  });
  const city = next.cities.find((entry) => entry.id === source.id)!;
  city.food -= food;
  city.garrisonTroops -= preview.troops;
  for (const officer of next.officers.filter((entry) => command.officerIds.includes(entry.id))) {
    detachWoundedToCity(next, officer.id);
    officer.location = { kind: 'journey', journeyId: id };
  }
  next.revision++;
  return { ok: true, state: next, orderId };
}
