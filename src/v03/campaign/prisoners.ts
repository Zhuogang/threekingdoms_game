import {
  custodyHolder,
  personnelCount,
  PERSONNEL_RULES,
  disbandOrphanedSources,
} from './personnel';
import { createV03OrderServices } from '../governance/services';
import type { V03GameState, V03Officer } from '../types';
import { recordEvent } from './reports';
import { cancelPendingGovernorAppointment } from '../governance/appointments';

export type PrisonerAction = 'release' | 'recruit' | 'exchange' | 'execute';

export function prisonerHolder(state: V03GameState, officer: V03Officer): string | null {
  return custodyHolder(state, officer);
}

/** A captured ruler stays a prisoner. Loyalty, then stable ID, chooses succession. */
export function resolveSuccessions(state: V03GameState): void {
  for (const faction of state.factions) {
    if (faction.eliminated) continue;
    const ruler = state.officers.find((officer) => officer.id === faction.leaderOfficerId);
    if (ruler?.alive && ruler.factionId === faction.id && ruler.location.kind !== 'captured')
      continue;
    const successor = state.officers
      .filter(
        (officer) =>
          officer.alive && officer.factionId === faction.id && officer.location.kind !== 'captured',
      )
      .sort((a, b) => b.loyalty - a.loyalty || a.id.localeCompare(b.id))[0];
    if (!successor) {
      faction.eliminated = true;
      for (const city of state.cities.filter((entry) => entry.factionId === faction.id)) {
        cancelPendingGovernorAppointment(state, city.id, 'the house has no free officers');
        city.factionId = null;
        city.governorId = null;
        city.governanceMode = 'steward';
      }
      for (const officer of state.officers.filter((entry) => entry.factionId === faction.id))
        officer.governorOfCityId = null;
    } else {
      faction.leaderOfficerId = successor.id;
      const successorCity =
        successor.location.kind === 'city'
          ? state.cities.find(
              (city) =>
                successor.location.kind === 'city' &&
                city.id === successor.location.cityId &&
                city.factionId === faction.id,
            )
          : undefined;
      const capital =
        successorCity ??
        state.cities.find(
          (city) => city.id === faction.capitalCityId && city.factionId === faction.id,
        ) ??
        state.cities.find((city) => city.factionId === faction.id);
      for (const city of state.cities.filter(
        (entry) => entry.factionId === faction.id && entry.governanceMode === 'ruler',
      ))
        city.governanceMode = city.governorId ? 'governor' : 'steward';
      if (capital) {
        cancelPendingGovernorAppointment(state, capital.id, 'the new ruler takes direct command');
        for (const officer of state.officers)
          if (officer.governorOfCityId === capital.id) officer.governorOfCityId = null;
        capital.governorId = null;
        capital.governanceMode = 'ruler';
        faction.capitalCityId = capital.id;
        if (faction.isPlayer) state.playerCapitalCityId = capital.id;
      }
    }
    recordEvent(state, {
      kind: 'succession',
      code: successor ? 'ruler.succession' : 'ruler.eliminated',
      title: successor ? 'A new ruler succeeds' : 'House eliminated',
      detail: successor
        ? `${successor.name} succeeds ${ruler?.name ?? faction.name}.`
        : 'No free officer remains.',
      entityId: faction.id,
      tier: faction.isPlayer ? 'critical' : 'chronicle',
      params: {
        factionId: faction.id,
        previousOfficerId: ruler?.id ?? null,
        successorOfficerId: successor?.id ?? null,
      },
    });
  }
  disbandOrphanedSources(state);
}

export function prisonerRecruitChance(officer: Pick<V03Officer, 'loyalty'>): number {
  return Math.max(5, Math.min(90, 100 - officer.loyalty));
}

export function prisonerReturnPlan(state: V03GameState, prisoner: V03Officer) {
  if (
    prisoner.location.kind !== 'captured' ||
    !prisoner.location.cityId ||
    prisoner.location.journeyId ||
    !prisoner.factionId
  )
    return null;
  const sourceCityId = prisoner.location.cityId;
  const total = personnelCount(prisoner);
  const composition = {
    troopTypes: [prisoner.troopType],
    woundedTroops: prisoner.wounded,
    cavalryTroops: prisoner.troopType === 'cavalry' ? total : 0,
    soloOfficer: total === 0,
  };
  const services = createV03OrderServices();
  const plans = state.cities
    .filter((city) => city.factionId === prisoner.factionId && city.id !== sourceCityId)
    .flatMap((city) => {
      const route = services.planRoute({
        state,
        movingFactionId: prisoner.factionId!,
        sourceCityId,
        targetCityId: city.id,
        departureDay: state.absoluteDay + 1,
        troopCount: total,
        kind: 'requisition',
        composition,
      });
      const stock = state.cities.find((entry) => entry.id === sourceCityId)?.food ?? 0;
      const food = route
        ? Math.min(
            stock,
            Math.ceil((total + composition.cavalryTroops) * 0.008 * route.estimatedDays),
          )
        : 0;
      return route ? [{ city, route, composition, total, food }] : [];
    })
    .sort(
      (a, b) => a.route.estimatedDays - b.route.estimatedDays || a.city.id.localeCompare(b.city.id),
    );
  return plans[0] ?? null;
}

function disbandCaptiveArmy(state: V03GameState, cityId: string, officer: V03Officer): void {
  const city = state.cities.find((entry) => entry.id === cityId)!;
  const count = personnelCount(officer);
  const added = Math.min(count, 9_999_999 - city.population);
  city.population += added;
  if (count > added)
    state.log.push(
      `${city.name}: ${count - added} disbanded captive personnel left the city at its population limit.`,
    );
}

function releasePersonnel(state: V03GameState, prisoner: V03Officer): void {
  if (prisoner.location.kind !== 'captured' || !prisoner.location.cityId)
    throw new Error('The prisoner is still being escorted.');
  const city = state.cities.find(
    (entry) => prisoner.location.kind === 'captured' && entry.id === prisoner.location.cityId,
  )!;
  const plan = prisonerReturnPlan(state, prisoner);
  const total = personnelCount(prisoner);
  if (!plan) {
    disbandCaptiveArmy(state, city.id, prisoner);
    Object.assign(prisoner, {
      factionId: null,
      troops: 0,
      wounded: 0,
      troopExperience: 0,
      reorganizationDays: 0,
      location: { kind: 'city', cityId: city.id },
    });
    return;
  }
  const recordId = `officer:${prisoner.id}`;
  const paid = state.personnelDay.rations.find((entry) => entry.recordId === recordId);
  const unpaid = Math.max(
    0,
    total -
      (paid
        ? Math.min(paid.troops, prisoner.troops) + Math.min(paid.wounded, prisoner.wounded)
        : 0),
  );
  city.prisonerServiceDaysThisMonth = (city.prisonerServiceDaysThisMonth ?? 0) + unpaid;
  city.prisonerCavalryDaysThisMonth =
    (city.prisonerCavalryDaysThisMonth ?? 0) + (prisoner.troopType === 'cavalry' ? unpaid : 0);
  state.personnelDay.rations = state.personnelDay.rations.filter(
    (entry) => entry.recordId !== recordId,
  );
  state.personnelDay.rations.push({ recordId, troops: prisoner.troops, wounded: prisoner.wounded });
  const food = plan.food;
  city.food -= food;
  const id = `prisoner-return-${state.nextId++}`;
  const journey = createV03OrderServices().createJourney({
    id,
    executionId: id,
    ownerFactionId: prisoner.factionId!,
    kind: 'requisition',
    sourceCityId: city.id,
    targetCityId: plan.city.id,
    departureDay: state.absoluteDay + 1,
    arrivalDay: state.absoluteDay + 1 + plan.route.estimatedDays,
    route: plan.route,
    party: { officerIds: [prisoner.id], troopCount: total, composition: plan.composition },
    cargo: { gold: 0, food: 0, troops: 0 },
    carriedFood: food,
  });
  state.journeys.push({ ...journey, kind: 'return', status: 'returning' });
  prisoner.location = { kind: 'journey', journeyId: id };
}

export function decidePrisoner(
  state: V03GameState,
  holderId: string,
  officerId: string,
  action: PrisonerAction,
  exchangeOfficerId?: string,
): { ok: boolean; state: V03GameState; error?: string } {
  const prisoner = state.officers.find((officer) => officer.id === officerId);
  const fail = (error: string) => ({ ok: false, state, error });
  if (!prisoner || prisonerHolder(state, prisoner) !== holderId || prisoner.factionId === holderId)
    return fail('Choose a prisoner held by your house.');
  if (
    prisoner.location.kind !== 'captured' ||
    !prisoner.location.cityId ||
    prisoner.location.journeyId
  )
    return fail('The prisoner is still being escorted.');
  if (
    (action === 'recruit' || action === 'exchange') &&
    prisoner.prisonerActionMonth === state.monthIndex
  )
    return fail('This prisoner has already received a decision this month.');
  const exchange = state.officers.find((officer) => officer.id === exchangeOfficerId);
  if (
    action === 'exchange' &&
    (!exchange ||
      exchange.factionId !== holderId ||
      prisonerHolder(state, exchange) !== prisoner.factionId ||
      exchange.prisonerActionMonth === state.monthIndex ||
      !prisonerReturnPlan(state, prisoner) ||
      !prisonerReturnPlan(state, exchange))
  )
    return fail(
      'Choose one of your officers held by this prisoner’s house with a usable return route.',
    );
  const next = structuredClone(state);
  const officer = next.officers.find((entry) => entry.id === officerId)!;
  const cityId = prisoner.location.cityId;
  officer.governorOfCityId = null;
  if (action === 'recruit' || action === 'exchange') officer.prisonerActionMonth = next.monthIndex;
  if (action === 'exchange')
    next.officers.find((entry) => entry.id === exchangeOfficerId)!.prisonerActionMonth =
      next.monthIndex;
  let accepted = true;
  if (action === 'execute') {
    disbandCaptiveArmy(next, cityId, officer);
    Object.assign(officer, {
      alive: false,
      troops: 0,
      wounded: 0,
      troopExperience: 0,
      reorganizationDays: 0,
    });
  }
  if (action === 'release') releasePersonnel(next, officer);
  if (action === 'recruit' || action === 'exchange') {
    next.rng = (Math.imul(next.rng, 1664525) + 1013904223) >>> 0;
    accepted = next.rng % 100 < (action === 'recruit' ? prisonerRecruitChance(officer) : 75);
    if (accepted && action === 'recruit') {
      officer.factionId = holderId;
      officer.loyalty = 60;
      officer.location = { kind: 'city', cityId };
      officer.reorganizationDays =
        personnelCount(officer) > 0 ? PERSONNEL_RULES.reorganizationDays : 0;
    }
    if (accepted && action === 'exchange') {
      releasePersonnel(next, officer);
      const returned = next.officers.find((entry) => entry.id === exchangeOfficerId)!;
      returned.governorOfCityId = null;
      releasePersonnel(next, returned);
    }
  }
  recordEvent(next, {
    kind: 'prisonerAction',
    code: 'prisoner.decision',
    title: 'Prisoner decision',
    detail: `${officer.name}: ${action}${accepted ? '' : ' refused'}.`,
    entityId: officer.id,
    tier:
      holderId === state.playerFactionId || prisoner.factionId === state.playerFactionId
        ? 'notice'
        : 'chronicle',
    params: { officerId, action, accepted },
  });
  resolveSuccessions(next);
  next.revision++;
  return { ok: true, state: next };
}

export function resolveAiPrisoners(state: V03GameState): V03GameState {
  let next = state;
  for (const officer of state.officers) {
    const holderId = prisonerHolder(next, officer);
    if (
      !holderId ||
      holderId === state.playerFactionId ||
      officer.factionId === holderId ||
      officer.location.kind !== 'captured' ||
      !officer.location.cityId ||
      officer.location.journeyId
    )
      continue;
    const exchange = next.officers.find(
      (entry) =>
        entry.factionId === holderId &&
        prisonerHolder(next, entry) === officer.factionId &&
        entry.prisonerActionMonth !== next.monthIndex,
    );
    const holdingCity = next.cities.find(
      (city) => officer.location.kind === 'captured' && city.id === officer.location.cityId,
    );
    const burden =
      (officer.troops + officer.wounded) * (officer.troopType === 'cavalry' ? 2 : 1) * 0.004 * 30;
    const action: PrisonerAction =
      (holdingCity?.food ?? 0) < burden
        ? 'release'
        : exchange
          ? 'exchange'
          : officer.loyalty < 75
            ? 'recruit'
            : 'release';
    const result = decidePrisoner(next, holderId, officer.id, action, exchange?.id);
    if (result.ok) next = result.state;
  }
  return next;
}
