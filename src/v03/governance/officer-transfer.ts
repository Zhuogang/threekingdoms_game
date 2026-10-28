import { estimateCampaignSupply } from '../calendar';
import { availableTroops, personnelCount } from '../campaign/personnel';
import type { V03GameState, V03Officer } from '../types';
import { availableCityResources } from './authority';
import { isCityCommitted, isOfficerReservedForOrder } from './commitments';
import { createV03OrderServices } from './services';

export function officerTransferReason(
  state: V03GameState,
  sourceCityId: string,
  officer: V03Officer,
) {
  if (
    !officer.alive ||
    officer.factionId !== state.playerFactionId ||
    officer.location.kind !== 'city' ||
    officer.location.cityId !== sourceCityId
  )
    return 'Choose living officers stationed in the source city.';
  if (
    state.factions.find((faction) => faction.id === state.playerFactionId)?.leaderOfficerId ===
      officer.id ||
    officer.governorOfCityId ||
    state.cities.some((city) => city.governorId === officer.id)
  )
    return 'Rulers and governors must use governor appointments instead of ordinary officer transfers.';
  if (state.cities.some((city) => city.pendingAppointment?.governorId === officer.id))
    return 'This officer has a pending governor appointment.';
  if (isOfficerReservedForOrder(state, officer.id))
    return 'This officer is reserved for an approved order.';
  return null;
}

export function previewOfficerTransfer(
  state: V03GameState,
  sourceCityId: string,
  targetCityId: string,
  officerIds: string[],
) {
  const fail = (reason: string) => ({ ok: false as const, reason });
  if (state.phase === 'finished') return fail('This campaign has ended.');
  const source = state.cities.find((city) => city.id === sourceCityId);
  const target = state.cities.find((city) => city.id === targetCityId);
  if (!source || source.factionId !== state.playerFactionId)
    return fail('Only cities held by your faction can issue this order.');
  if (!target || target.factionId !== state.playerFactionId)
    return fail('The destination must be held by your faction.');
  if (source.id === target.id) return fail('Choose a different destination city.');
  if (isCityCommitted(state, source.id) || isCityCommitted(state, target.id))
    return fail('This city is committed to an active battle.');
  if (
    !Array.isArray(officerIds) ||
    !officerIds.length ||
    new Set(officerIds).size !== officerIds.length
  )
    return fail('Choose at least one available officer.');
  if (officerIds.length > 100) return fail('Select up to 100 officers per transfer.');
  const officers: V03Officer[] = [];
  for (const id of officerIds) {
    const officer = typeof id === 'string' && state.officers.find((entry) => entry.id === id);
    if (!officer) return fail('Choose living officers stationed in the source city.');
    const reason = officerTransferReason(state, source.id, officer);
    if (reason) return fail(reason);
    officers.push(officer);
  }
  const readyTroops = officers.reduce((sum, officer) => sum + availableTroops(officer), 0);
  if (readyTroops > availableCityResources(state, source.id).troops)
    return fail('These soldiers are reserved for an approved order.');
  const total = officers.reduce((sum, officer) => sum + personnelCount(officer), 0);
  const party = {
    officerIds: [...officerIds],
    troopCount: total,
    composition: {
      troopTypes: [
        ...new Set(
          officers
            .filter((officer) => personnelCount(officer) > 0)
            .map((officer) => officer.troopType),
        ),
      ],
      cavalryTroops: officers
        .filter((officer) => officer.troopType === 'cavalry')
        .reduce((sum, officer) => sum + personnelCount(officer), 0),
      woundedTroops: officers.reduce((sum, officer) => sum + officer.wounded, 0),
      soloOfficer: officers.length === 1 && total === 0,
    },
  };
  const route = createV03OrderServices().planRoute({
    state,
    sourceCityId,
    targetCityId,
    departureDay: state.absoluteDay,
    troopCount: total,
    kind: 'transfer',
    composition: party.composition,
  });
  if (!route) return fail('There is no currently usable route to the destination.');
  const food = estimateCampaignSupply({
    troopCount: total,
    cavalryTroops: party.composition.cavalryTroops,
    outboundDays: route.estimatedDays,
    battleDays: 0,
    returnDays: route.estimatedDays,
  }).totalFood;
  const plan = { party, route, food, readyTroops };
  if (food > availableCityResources(state, source.id).food)
    return {
      ok: false as const,
      reason:
        'The source city needs enough unreserved food for the contingent’s transfer and possible return.',
      ...plan,
    };
  return { ok: true as const, ...plan };
}

export function transferOfficers(
  state: V03GameState,
  sourceCityId: string,
  targetCityId: string,
  officerIds: string[],
) {
  const preview = previewOfficerTransfer(state, sourceCityId, targetCityId, officerIds);
  if (!preview.ok) return { ok: false, state, error: preview.reason };
  const next = structuredClone(state);
  const id = `${state.scenarioId}:transfer:${next.nextId++}`;
  const journey = createV03OrderServices().createJourney({
    id,
    executionId: id,
    ownerFactionId: state.playerFactionId,
    kind: 'transfer',
    sourceCityId,
    targetCityId,
    departureDay: state.absoluteDay,
    arrivalDay: state.absoluteDay + preview.route.estimatedDays,
    route: preview.route,
    party: preview.party,
    cargo: { gold: 0, food: 0, troops: 0 },
    carriedFood: preview.food,
  });
  next.journeys.push(journey);
  const source = next.cities.find((city) => city.id === sourceCityId)!;
  source.food -= preview.food;
  source.garrisonTroops -= preview.readyTroops;
  if (source.garrisonTroops === 0) source.garrisonExperience = 0;
  for (const officer of next.officers.filter((entry) => officerIds.includes(entry.id)))
    officer.location = { kind: 'journey', journeyId: id };
  next.revision++;
  return {
    ok: true,
    state: next,
    message: 'The selected officers have departed for the friendly city.',
  };
}
