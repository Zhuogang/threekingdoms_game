import type { V03Command, V03GameState } from '../types';
import { isCityCommitted } from '../governance/commitments';
import {
  applyV03CityAction,
  cityWorkQuota,
  cityWorkUsedThisMonth,
} from '../governance/city-actions';
import {
  detachWoundedToCity,
  personnelCount,
  retainPersonnel,
  splitPersonnel,
  transferDayRecord,
} from './personnel';
import { applyTroopLoss, TROOP_TYPES } from './troop-experience';

export function applyCityPersonnelCommand(
  state: V03GameState,
  command: Extract<V03Command, { type: 'returnTroops' | 'disband' }>,
) {
  const fail = (error: string) => ({ ok: false, state, error });
  const city = state.cities.find((entry) => entry.id === command.cityId);
  if (!city || city.factionId !== state.playerFactionId || isCityCommitted(state, city.id))
    return fail('Choose an uncommitted friendly city.');
  if (
    [...state.requisitions, ...state.directives].some(
      (order) =>
        order.sourceCityId === city.id &&
        order.journeyId === null &&
        ['accepted', 'reserved', 'dispatched'].includes(order.status),
    )
  )
    return fail('These soldiers are reserved for an approved order.');
  if (command.type === 'returnTroops') {
    const officer = state.officers.find(
      (entry) =>
        entry.id === command.officerId &&
        entry.alive &&
        entry.factionId === city.factionId &&
        entry.location.kind === 'city' &&
        entry.location.cityId === city.id,
    );
    if (!officer || personnelCount(officer) === 0)
      return fail('Choose a stationed officer with personnel.');
    if (city.id !== state.playerCapitalCityId)
      return fail('Only your directly governed capital accepts city work orders.');
    if (officer.reorganizationDays === 0) {
      const result = applyV03CityAction(state, {
        cityId: city.id,
        action: 'assign-troops',
        officerId: officer.id,
        amount: 0,
      });
      if (!result.ok) return result;
      const source = detachWoundedToCity(result.state, officer.id);
      if (source) source.autoReturn = false;
      return result;
    }
    if (cityWorkUsedThisMonth(state, city) >= cityWorkQuota(state, city))
      return fail('No city work points remain.');
    const next = structuredClone(state),
      target = next.officers.find((entry) => entry.id === officer.id)!;
    const targetCity = next.cities.find((entry) => entry.id === city.id)!;
    const split = splitPersonnel(target, target.troops, target.wounded);
    const id = `troop-source-${next.nextId++}`;
    transferDayRecord(next, `officer:${target.id}`, `source:${id}`, target.troops, target.wounded);
    next.troopSources.push({
      ...split.taken,
      id,
      cityId: city.id,
      factionId: city.factionId,
      sourceOfficerId: target.id,
      autoReturn: false,
      troopType: target.troopType,
    });
    Object.assign(target, split.remaining);
    targetCity.workPointsUsed = cityWorkUsedThisMonth(state, city) + 1;
    targetCity.workMonthIndex = next.monthIndex;
    next.revision++;
    return { ok: true, state: next };
  }
  const { troops, wounded, recordId } = command;
  if (
    ![troops, wounded].every((count) => Number.isSafeInteger(count) && count >= 0) ||
    troops + wounded === 0
  )
    return fail('Choose a positive number of personnel to disband.');
  const next = structuredClone(state),
    targetCity = next.cities.find((entry) => entry.id === city.id)!;
  let rationRecordId = recordId,
    remainingTroops = 0,
    remainingWounded = 0;
  if (recordId.startsWith('reserve:')) {
    const type = TROOP_TYPES.find((entry) => entry === recordId.slice(8));
    if (!type || wounded !== 0 || troops > targetCity.reservePools[type].troops)
      return fail('The city reserve does not contain those soldiers.');
    applyTroopLoss(targetCity.reservePools[type], targetCity.reservePools[type].troops - troops);
    rationRecordId = `reserve:${city.id}:${type}`;
    remainingTroops = targetCity.reservePools[type].troops;
    targetCity.reserve = Object.values(targetCity.reservePools).reduce(
      (sum, pool) => sum + pool.troops,
      0,
    );
  } else {
    const officer = recordId.startsWith('officer:')
      ? next.officers.find((entry) => entry.id === recordId.slice(8))
      : null;
    const source = recordId.startsWith('source:')
      ? next.troopSources.find((entry) => entry.id === recordId.slice(7))
      : null;
    const pool = officer ?? source;
    if (
      !pool ||
      pool.factionId !== city.factionId ||
      (officer &&
        (!officer.alive ||
          officer.location.kind !== 'city' ||
          officer.location.cityId !== city.id)) ||
      (source && source.cityId !== city.id) ||
      troops > pool.troops ||
      wounded > pool.wounded
    )
      return fail('Choose personnel stationed in this city.');
    if (officer && officer.reorganizationDays === 0) targetCity.garrisonTroops -= troops;
    retainPersonnel(pool, pool.troops - troops, pool.wounded - wounded);
    remainingTroops = pool.troops;
    remainingWounded = pool.wounded;
    if (source && personnelCount(source) === 0) {
      next.troopSources = next.troopSources.filter((entry) => entry.id !== source.id);
      next.personnelDay.entries = next.personnelDay.entries.filter(
        (entry) => entry.recordId !== recordId,
      );
      next.personnelDay.rations = next.personnelDay.rations.filter(
        (entry) => entry.recordId !== recordId,
      );
    }
  }
  const paid = next.personnelDay.rations.find((entry) => entry.recordId === rationRecordId);
  if (paid) {
    paid.troops = Math.min(paid.troops, remainingTroops);
    paid.wounded = Math.min(paid.wounded, remainingWounded);
    next.personnelDay.rations = next.personnelDay.rations.filter(
      (entry) => entry.troops + entry.wounded > 0,
    );
  }
  const added = Math.min(9_999_999 - targetCity.population, troops + wounded);
  targetCity.population += added;
  next.log.push(
    `${city.name}: disbanded ${troops + wounded}; population +${added}, population outflow ${troops + wounded - added}.`,
  );
  next.revision++;
  return { ok: true, state: next };
}
