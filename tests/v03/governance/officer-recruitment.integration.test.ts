import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { advanceV03 } from '../../../src/v03/engine';
import { executeV03Command } from '../../../src/v03/commands';
import { recruitmentQuote } from '../../../src/v03/campaign/recruitment';
import {
  createPersonnelDay,
  cityPersonnelSummary,
  cityRationCredits,
} from '../../../src/v03/campaign/personnel';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import {
  applyGovernorMonthlyWork,
  planGovernorMonthlyWork,
} from '../../../src/v03/governance/autonomy';
import {
  applyV03CityAction,
  applyNpcCapitalCityAction,
  automaticTalentWorkUsed,
  getV03CityActionAvailability,
} from '../../../src/v03/governance/city-actions';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import type { V03GameState } from '../../../src/v03/types';

const officer = (state: V03GameState, id: string) =>
  state.officers.find((entry) => entry.id === id)!;
const cityAt = (state: V03GameState, id: string) => state.cities.find((entry) => entry.id === id)!;
type Kind = 'capital' | 'local';
/** Controlled previously-recruited Sun Ce in a funded Sun city; identities and ages stay real. */
function fixture(kind: Kind = 'capital', stock = 500) {
  const state = createV03Game('cao', 3);
  const cityId = kind === 'capital' ? 'jianye' : 'shouchun';
  const managerId = kind === 'capital' ? 'sunjian' : 'zuzhao';
  for (const person of state.officers) {
    if (
      person.location.kind === 'city' &&
      person.location.cityId === cityId &&
      person.id !== managerId
    ) {
      person.location = {
        kind: 'city',
        cityId: person.factionId === 'sun' ? 'jiangxia' : 'xiangyang',
      };
      if (person.governorOfCityId) {
        const home = cityAt(state, person.governorOfCityId);
        home.governorId = null;
        home.governanceMode = 'steward';
        person.governorOfCityId = null;
      }
    }
  }
  for (const [id, troops] of [
    ['sunce', 0],
    ['handang', 100],
  ] as const) {
    const person = officer(state, id);
    if (person.governorOfCityId) {
      const home = cityAt(state, person.governorOfCityId);
      home.governorId = null;
      home.governanceMode = 'steward';
      person.governorOfCityId = null;
    }
    Object.assign(person, {
      location: { kind: 'city', cityId },
      troops,
      wounded: 0,
      reorganizationDays: 0,
      troopExperience: 0,
      loyalty: 100,
    });
  }
  const manager = officer(state, managerId);
  Object.assign(manager, {
    location: { kind: 'city', cityId },
    troops: 100,
    wounded: 0,
    reorganizationDays: 0,
    loyalty: 100,
  });
  const city = cityAt(state, cityId);
  if (kind === 'local') {
    city.governorId = manager.id;
    city.governanceMode = 'governor';
    manager.governorOfCityId = city.id;
  }
  Object.assign(city, {
    gold: 20_000,
    food: 100_000,
    loyalty: 100,
    farming: 500,
    commerce: 500,
    population: 10_000,
    reserve: stock,
    reservePools: createReservePools(0, 0, stock),
    autoAssignmentsThisMonth: 0,
    autoSearchesThisMonth: 0,
    workMonthIndex: 0,
    workPointsUsed: 0,
  });
  for (const place of state.cities)
    place.garrisonTroops = state.officers
      .filter(
        (person) =>
          person.alive &&
          person.factionId === place.factionId &&
          person.location.kind === 'city' &&
          person.location.cityId === place.id,
      )
      .reduce((sum, person) => sum + person.troops, 0);
  state.personnelDay = createPersonnelDay(state);
  expect(validateV03State(state)).toBe(true);
  return { state, cityId, managerId, targetId: 'sunce' };
}
function apply(state: V03GameState, cityId: string) {
  const plan = planGovernorMonthlyWork(state, cityId, (state.monthIndex % 12) + 1);
  const result = applyGovernorMonthlyWork(state, plan);
  expect(result.applied, plan.reason).toBe(true);
  return { plan, state: result.state! };
}
function addCandidate(state: V03GameState, cityId: string) {
  const target = officer(state, 'gongsunzan');
  Object.assign(target, {
    factionId: null,
    location: { kind: 'city', cityId },
    troops: 0,
    wounded: 0,
    reorganizationDays: 0,
    troopExperience: 0,
    governorOfCityId: null,
  });
  return target;
}
function approve(state: V03GameState, cityId: string, troops: number, ids?: string[]) {
  state.directives.push({
    id: 'r3-approved',
    factionId: 'sun',
    sourceCityId: cityId,
    targetCityId: 'xiangyang',
    intent: 'conquer',
    requestedTroops: troops,
    proposedTroops: troops,
    requestedByDay: null,
    earliestDepartureDay: 0,
    estimatedArrivalDay: 10,
    status: 'accepted',
    journeyId: null,
    governanceRevision: state.governanceRevision,
    message: 'Approved',
    officerIds: ids,
  });
}

describe.each(['capital', 'local'] as const)('R3 %s first armies', (kind) => {
  it.each([99, 100, 499, 500, 501])('uses the correct typed stock threshold: %i', (stock) => {
    const { state, cityId, targetId } = fixture(kind, stock);
    cityAt(state, cityId).reservePools.cavalry.troopExperience = 1375;
    const before = structuredClone(state);
    const plan = planGovernorMonthlyWork(state, cityId, 1);
    expect(state).toEqual(before);
    if (stock < 100) {
      expect(plan).toMatchObject({
        action: 'recruit',
        targetOfficerId: targetId,
        troopType: 'cavalry',
      });
      return;
    }
    expect(plan).toMatchObject({
      action: 'assign-troops',
      targetOfficerId: targetId,
      targetTroops: Math.min(500, stock),
      firstAssignment: true,
      workPoints: 0,
    });
    const beforeSummary = cityPersonnelSummary(state, cityId);
    const result = applyGovernorMonthlyWork(state, plan).state!;
    expect(officer(result, targetId).troops).toBe(Math.min(500, stock));
    expect(officer(result, targetId).troopExperience).toBe(1375);
    expect(cityAt(result, cityId).reserve).toBe(stock - Math.min(500, stock));
    expect(cityAt(result, cityId).garrisonTroops).toBe(
      cityAt(state, cityId).garrisonTroops + Math.min(500, stock),
    );
    expect(cityPersonnelSummary(result, cityId)).toMatchObject({
      troops: beforeSummary.troops,
      foodHeadcount: beforeSummary.foodHeadcount,
    });
    expect(cityAt(result, cityId)).toMatchObject({
      food: 100_000,
      gold: 20_000,
      population: 10_000,
      workPointsUsed: 0,
      autoAssignmentsThisMonth: 1,
    });
    expect(validateV03State(result)).toBe(true);
  });

  it('recruits the target type with manager ability, then assigns separately with no free soldiers', () => {
    const { state, cityId, managerId, targetId } = fixture(kind, 0);
    cityAt(state, cityId).reserve = 10_000;
    cityAt(state, cityId).reservePools = createReservePools(10_000);
    const quote = recruitmentQuote(
      cityAt(state, cityId),
      officer(state, managerId).force,
      'cavalry',
    );
    const recruited = apply(state, cityId);
    expect(recruited.plan).toMatchObject({
      action: 'recruit',
      troopType: 'cavalry',
      goldCost: quote.gold,
    });
    expect(cityAt(recruited.state, cityId)).toMatchObject({
      gold: 20_000 - quote.gold,
      population: 10_000 - quote.troops,
      workPointsUsed: 1,
    });
    expect(cityAt(recruited.state, cityId).reservePools.infantry.troops).toBe(10_000);
    expect(cityAt(recruited.state, cityId).reservePools.cavalry.troops).toBe(quote.troops);
    expect(officer(recruited.state, targetId).troops).toBe(0);
    const organized = apply(recruited.state, cityId);
    expect(organized.plan.action).toBe('assign-troops');
    expect(officer(organized.state, targetId).troops).toBe(Math.min(500, quote.troops));
    expect(cityAt(organized.state, cityId).workPointsUsed).toBe(1);
    expect(cityAt(organized.state, cityId).gold).toBe(20_000 - quote.gold);
    expect(cityPersonnelSummary(organized.state, cityId).troops).toBe(
      cityPersonnelSummary(state, cityId).troops + quote.troops,
    );
    expect(cityPersonnelSummary(organized.state, cityId).foodHeadcount).toBe(
      cityPersonnelSummary(state, cityId).foodHeadcount + quote.troops * 2,
    );
  });

  it('recruits a real free officer, then arms it within two funded monthly budgets', () => {
    let { state, cityId, targetId } = fixture(kind, 1000);
    officer(state, targetId).troops = 100;
    cityAt(state, cityId).garrisonTroops += 100;
    const candidateId = addCandidate(state, cityId).id;
    // Seed 3 deterministically succeeds with these real managers, without changing the success rule.
    const searched = apply(state, cityId);
    expect(searched.plan.action).toBe('search');
    expect(officer(searched.state, candidateId)).toMatchObject({
      factionId: 'sun',
      troops: 0,
      wounded: 0,
      experience: 0,
      level: 0,
      governorOfCityId: null,
    });
    expect(cityAt(searched.state, cityId).autoSearchesThisMonth).toBe(1);
    state = decodeV03Save(encodeV03Save(searched.state));
    state.absoluteDay = 30;
    state.monthIndex = 1;
    state.personnelDay = createPersonnelDay(state);
    const armed = apply(state, cityId);
    expect(armed.plan).toMatchObject({ action: 'assign-troops', targetOfficerId: candidateId });
    expect(officer(armed.state, candidateId).troops).toBe(500);
    expect(cityAt(armed.state, cityId)).toMatchObject({
      workMonthIndex: 1,
      workPointsUsed: 0,
      autoAssignmentsThisMonth: 1,
      autoSearchesThisMonth: 0,
    });
    expect(validateV03State(armed.state)).toBe(true);
  });

  it('keeps monthly talent counts after reload, a return of troops, and a capital relocation', () => {
    const { state, cityId, targetId } = fixture(kind, 1500);
    const armed = apply(state, cityId).state;
    const returned =
      kind === 'capital'
        ? applyNpcCapitalCityAction(armed, 'sun', {
            cityId,
            action: 'assign-troops',
            officerId: targetId,
            amount: 0,
          })
        : executeV03Command(armed, {
            type: 'cityAction',
            cityId,
            action: 'assign-troops',
            officerId: targetId,
            amount: 0,
          });
    if (kind === 'capital') {
      expect(returned.ok).toBe(true);
      const saved = decodeV03Save(encodeV03Save(returned.state));
      expect(automaticTalentWorkUsed(saved, cityAt(saved, cityId), 'assign')).toBe(1);
      expect(planGovernorMonthlyWork(saved, cityId, 1).firstAssignment).toBe(false);
      const faction = saved.factions.find((entry) => entry.id === 'sun')!;
      faction.capitalCityId = 'jiangxia';
      cityAt(saved, cityId).governanceMode = 'steward';
      expect(planGovernorMonthlyWork(saved, cityId, 1).firstAssignment).toBe(false);
    } else {
      expect(returned.ok).toBe(false); // player still cannot issue direct work in a Sun city.
      const saved = decodeV03Save(encodeV03Save(armed));
      expect(planGovernorMonthlyWork(saved, cityId, 1).firstAssignment).toBe(false);
    }
  });

  it('uses the real month scheduler to recruit and arm a newcomer within two months, including reload', () => {
    let { state, cityId, targetId } = fixture(kind, 1000);
    officer(state, targetId).troops = 100;
    cityAt(state, cityId).garrisonTroops += 100;
    const candidate = addCandidate(state, cityId);
    // Keep the controlled candidate the only automatic search pool, so prior cities draw no search RNG.
    for (const person of state.officers)
      if (person.factionId === null && person.id !== candidate.id)
        person.location = { kind: 'city', cityId: 'xiangyang' };
    state.absoluteDay = 29;
    state.personnelDay = createPersonnelDay(state);
    state = advanceV03(state, 1).state;
    expect(officer(state, candidate.id).factionId).toBe('sun');
    expect(officer(state, candidate.id).troops).toBe(500);
    expect(cityAt(state, cityId)).toMatchObject({
      autoSearchesThisMonth: 1,
      autoAssignmentsThisMonth: 1,
    });
    expect(cityAt(state, cityId).workPointsUsed).toBeLessThanOrEqual(3);
    state = decodeV03Save(encodeV03Save(state));
    // Advance one day at a time so battle/notice stops never hide a second resolution.
    for (let day = 0; day < 30 && state.phase !== 'finished'; day++)
      state = advanceV03(state, 1).state;
    expect(state.officers.filter((person) => person.id === candidate.id)).toHaveLength(1);
    expect(officer(state, candidate.id).troops).toBeGreaterThan(0);
    expect(validateV03State(state)).toBe(true);
  });
});

describe('R3 qualification, budgets and stale plans', () => {
  it('rejects empty searches without RNG/work changes and excludes unavailable identities', () => {
    const state = createV03Game('cao', 1);
    const cityId = state.playerCapitalCityId;
    for (const person of state.officers)
      if (
        person.factionId === null &&
        person.location.kind === 'city' &&
        person.location.cityId === cityId
      )
        person.location = { kind: 'city', cityId: 'xiangyang' };
    const input = { cityId, action: 'search' as const };
    const before = structuredClone(state);
    expect(getV03CityActionAvailability(state, input).ok).toBe(false);
    const result = applyV03CityAction(state, input);
    expect(result).toMatchObject({ ok: false, state });
    expect(state).toEqual(before);
    const free = addCandidate(state, cityId);
    for (const mode of ['dead', 'captured', 'journey', 'battle', 'serving'] as const) {
      const changed = structuredClone(state);
      const candidate = officer(changed, free.id);
      if (mode === 'dead') candidate.alive = false;
      if (mode === 'serving') candidate.factionId = 'sun';
      if (mode === 'captured') candidate.location = { kind: 'captured', cityId };
      if (mode === 'journey') candidate.location = { kind: 'journey', journeyId: 'busy' };
      if (mode === 'battle') candidate.location = { kind: 'battle', battleId: 'busy' };
      expect(getV03CityActionAvailability(changed, input).ok, mode).toBe(false);
    }
    expect(state.officers.some((person) => person.id === 'jiangwei')).toBe(false);
  });

  it('failed automatic searches spend a work point and cannot repeat, while manual searches can', () => {
    let { state, cityId, targetId } = fixture();
    officer(state, targetId).troops = 100;
    cityAt(state, cityId).garrisonTroops += 100;
    addCandidate(state, cityId);
    officer(state, 'sunjian').intellect = 0;
    // Xorshift seed 4: second draw is 40, which fails a 40% chance.
    state.rng = 4;
    const searched = apply(state, cityId);
    expect(officer(searched.state, 'gongsunzan').factionId).toBeNull();
    expect(cityAt(searched.state, cityId)).toMatchObject({
      workPointsUsed: 1,
      autoSearchesThisMonth: 1,
    });
    state = decodeV03Save(encodeV03Save(searched.state));
    expect(planGovernorMonthlyWork(state, cityId, 1).action).not.toBe('search');
    expect(applyGovernorMonthlyWork(state, searched.plan).applied).toBe(false);
    const direct = createV03Game('cao', 4);
    addCandidate(direct, direct.playerCapitalCityId);
    const executor = officer(direct, 'caocao');
    executor.intellect = 0;
    const first = applyV03CityAction(direct, {
      cityId: direct.playerCapitalCityId,
      action: 'search',
      officerId: executor.id,
    });
    expect(first.ok).toBe(true);
    // The first searcher is out for five days; the next free officer searches again.
    const second = applyV03CityAction(first.state, {
      cityId: direct.playerCapitalCityId,
      action: 'search',
    });
    expect(second.ok, second.error).toBe(true);
    expect(cityAt(second.state, direct.playerCapitalCityId).workPointsUsed).toBe(2);
    expect(cityAt(second.state, direct.playerCapitalCityId).autoSearchesThisMonth).toBe(0);
  });

  it.each(['wounded', 'reorganizing', 'captured', 'absent', 'reserved'] as const)(
    'excludes a %s target',
    (mode) => {
      const { state, cityId, targetId } = fixture();
      const target = officer(state, targetId);
      if (mode === 'wounded') target.wounded = 100;
      if (mode === 'reorganizing') target.reorganizationDays = 3;
      if (mode === 'captured') target.location = { kind: 'captured', cityId };
      if (mode === 'absent') target.location = { kind: 'city', cityId: 'jiangxia' };
      if (mode === 'reserved') approve(state, cityId, 100, [targetId]);
      expect(planGovernorMonthlyWork(state, cityId, 1).firstAssignment).toBe(false);
    },
  );

  it.each([
    'ownership',
    'inventory',
    'experience',
    'wounded',
    'reservation',
    'location',
    'work',
    'food',
    'month',
  ] as const)('rejects a plan after a change to %s without any side effect', (mode) => {
    const { state, cityId, targetId } = fixture();
    const plan = planGovernorMonthlyWork(state, cityId, 1);
    const city = cityAt(state, cityId);
    const target = officer(state, targetId);
    if (mode === 'ownership') city.factionId = 'yuan';
    if (mode === 'inventory') {
      city.reservePools.cavalry.troops--;
      city.reserve--;
    }
    if (mode === 'experience') city.reservePools.cavalry.troopExperience = 200;
    if (mode === 'wounded') target.wounded = 1;
    if (mode === 'reservation') approve(state, cityId, 500);
    if (mode === 'location') target.location = { kind: 'city', cityId: 'jiangxia' };
    if (mode === 'work') city.workPointsUsed = 3;
    if (mode === 'food') city.food = 0;
    if (mode === 'month') {
      state.monthIndex++;
      state.absoluteDay = 30;
    }
    const before = structuredClone(state);
    const result = applyGovernorMonthlyWork(state, plan);
    expect(result.applied).toBe(false);
    expect(state).toEqual(before);
  });

  it('shares all automatic work points, preserves approved reserves, and skips unaffordable recruitment', () => {
    const { state, cityId } = fixture('capital', 500);
    cityAt(state, cityId).workPointsUsed = 3;
    expect(planGovernorMonthlyWork(state, cityId, 1)).toMatchObject({
      action: 'assign-troops',
      workPoints: 0,
    });
    cityAt(state, cityId).workPointsUsed = 0;
    approve(state, cityId, 500);
    expect(planGovernorMonthlyWork(state, cityId, 1).firstAssignment).toBe(false);
    state.directives = [];
    cityAt(state, cityId).reservePools = createReservePools(5000);
    cityAt(state, cityId).reserve = 5000;
    cityAt(state, cityId).gold = 0;
    addCandidate(state, cityId);
    expect(planGovernorMonthlyWork(state, cityId, 1).action).toBe('search');
    cityAt(state, cityId).food = 0;
    const starving = planGovernorMonthlyWork(state, cityId, 1);
    expect(['recruit', 'search']).not.toContain(starving.action);
    // Organizing existing reserves adds no mouths, food cost or work point.
    if (starving.action === 'assign-troops') {
      expect(starving).toMatchObject({ foodCost: 0, goldCost: 0, workPoints: 0 });
      const prepared = applyGovernorMonthlyWork(state, starving);
      expect(prepared.applied).toBe(true);
      expect(prepared.city!.food).toBe(0);
      expect(prepared.city!.garrisonTroops + prepared.city!.reserve).toBe(
        cityAt(state, cityId).garrisonTroops + cityAt(state, cityId).reserve,
      );
    }
  });

  it('can search after ordinary work, while keeping the talent counter independent of work usage', () => {
    const { state, cityId, targetId } = fixture();
    officer(state, targetId).troops = 100;
    cityAt(state, cityId).garrisonTroops += 100;
    cityAt(state, cityId).workPointsUsed = 1;
    addCandidate(state, cityId);
    expect(planGovernorMonthlyWork(state, cityId, 1).action).toBe('search');
    const searched = apply(state, cityId).state;
    expect(cityAt(searched, cityId)).toMatchObject({ workPointsUsed: 2, autoSearchesThisMonth: 1 });
    expect(planGovernorMonthlyWork(searched, cityId, 1).action).not.toBe('search');
  });

  it('sorts eligible zero-army officers by combined ability and stable ID, without favoring governors', () => {
    const { state, cityId, targetId, managerId } = fixture('local');
    const manager = officer(state, managerId);
    manager.troops = 0;
    manager.force = 70;
    manager.intellect = 70;
    const target = officer(state, targetId);
    target.force = 80;
    target.intellect = 60;
    expect(planGovernorMonthlyWork(state, cityId, 1).targetOfficerId).toBe(targetId);
    manager.intellect++;
    expect(planGovernorMonthlyWork(state, cityId, 1).targetOfficerId).toBe(managerId);
  });

  it('requires the matching NPC faction and current capital, and ignores a forged automatic command flag', () => {
    const { state, cityId } = fixture();
    const before = structuredClone(state);
    for (const factionId of ['cao', 'yuan'])
      expect(applyNpcCapitalCityAction(state, factionId, { cityId, action: 'security' }).ok).toBe(
        false,
      );
    expect(
      applyNpcCapitalCityAction(state, 'sun', { cityId: 'shouchun', action: 'security' }).ok,
    ).toBe(false);
    expect(
      applyNpcCapitalCityAction(state, 'cao', {
        cityId: state.playerCapitalCityId,
        action: 'security',
      }).ok,
    ).toBe(false);
    const forged = { type: 'cityAction', cityId, action: 'security', automatic: true };
    expect(executeV03Command(state, forged as never).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('validates automatic counters and retains legitimate counts across save round trips', () => {
    const { state, cityId } = fixture();
    const completed = apply(state, cityId).state;
    expect(decodeV03Save(encodeV03Save(completed))).toEqual(completed);
    for (const value of [-1, 2, 0.5]) {
      const invalid = structuredClone(completed);
      cityAt(invalid, cityId).autoAssignmentsThisMonth = value;
      expect(validateV03State(invalid)).toBe(false);
    }
    const invalid = structuredClone(completed);
    cityAt(invalid, cityId).workPointsUsed = 0;
    expect(validateV03State(invalid)).toBe(true);
    cityAt(invalid, cityId).autoSearchesThisMonth = 1;
    expect(validateV03State(invalid)).toBe(true);
    cityAt(invalid, cityId).autoSearchesThisMonth = 2;
    expect(validateV03State(invalid)).toBe(false);
  });
});

describe('R3 personnel experience and food accounting', () => {
  it.each(['capital', 'local'] as const)(
    'resumes a paid returning source through %s settlement without losing its ration credit',
    (kind) => {
      const { state, cityId, targetId } = fixture(kind, 0);
      state.absoluteDay = 30;
      state.monthIndex = 1;
      state.dayResolution = {
        processingAbsoluteDay: 29,
        phase: 'month-settlement',
        battleIds: [],
        completedBattleIds: [],
        daybreakJourneySignatures: {},
        arrivals: [],
        cityServiceAccounted: true,
        settledMonth: { year: 190, month: 1 },
      };
      state.troopSources.push({
        id: 'r3-paid-veterans',
        cityId,
        factionId: 'sun',
        sourceOfficerId: targetId,
        autoReturn: false,
        troopType: 'cavalry',
        troops: 500,
        wounded: 0,
        troopExperience: 1500,
        reorganizationDays: 0,
      });
      state.personnelDay = createPersonnelDay(state);
      state.personnelDay.rations.push({
        recordId: 'source:r3-paid-veterans',
        troops: 500,
        wounded: 0,
      });
      expect(validateV03State(state)).toBe(true);
      const before = cityRationCredits(state, cityId);
      const transfer = apply(state, cityId).state;
      expect(transfer.personnelDay.rations).toContainEqual({
        recordId: 'officer:' + targetId,
        troops: 500,
        wounded: 0,
      });
      expect(cityRationCredits(transfer, cityId)).toEqual(before);
      const after = advanceV03(decodeV03Save(encodeV03Save(state)), 1).state;
      // Resuming finishes the pending month, then advances the one requested new day.
      expect(after.absoluteDay).toBe(31);
      expect(officer(after, targetId)).toMatchObject({ troops: 500, troopExperience: 1500 });
      expect(
        after.personnelDay.rations.some((entry) => entry.recordId === 'source:r3-paid-veterans'),
      ).toBe(false);
      // The already-paid cavalry are exempt for day 30 only; the next day charges them normally.
      expect(cityAt(after, cityId).cavalryServiceDaysThisMonth).toBe(0);
      expect(cityAt(after, cityId).troopServiceDaysThisMonth).toBe(
        cityPersonnelSummary(after, cityId).troops - 500,
      );
      const next = advanceV03(decodeV03Save(encodeV03Save(after)), 1).state;
      expect(cityAt(next, cityId).cavalryServiceDaysThisMonth).toBe(500);
      expect(cityAt(next, cityId).troopServiceDaysThisMonth).toBe(
        cityPersonnelSummary(after, cityId).troops * 2 - 500,
      );
      expect(decodeV03Save(encodeV03Save(after))).toEqual(after);
    },
  );

  it.each(['capital', 'local'] as const)(
    'preserves veteran sources and paid rations through actual %s month settlement',
    (kind) => {
      const { state, cityId, targetId } = fixture(kind, 0);
      const city = cityAt(state, cityId);
      state.absoluteDay = 29;
      state.monthIndex = 0;
      state.troopSources.push({
        id: 'r3-veterans',
        cityId,
        factionId: 'sun',
        sourceOfficerId: targetId,
        autoReturn: false,
        troopType: 'cavalry',
        troops: 500,
        wounded: 0,
        troopExperience: 1500,
        reorganizationDays: 0,
      });
      state.personnelDay = createPersonnelDay(state);
      // These returning veterans have already paid the current day's rations while marching.
      state.personnelDay.rations.push({ recordId: 'source:r3-veterans', troops: 500, wounded: 0 });
      const originalPopulation = city.population;
      const after = advanceV03(state, 1).state;
      expect(officer(after, targetId)).toMatchObject({ troops: 500, troopExperience: 1500 });
      expect(after.troopSources.some((source) => source.id === 'r3-veterans')).toBe(false);
      expect(cityAt(after, cityId).autoAssignmentsThisMonth).toBe(1);
      expect(cityAt(after, cityId).population).toBeLessThanOrEqual(originalPopulation);
      expect(validateV03State(after)).toBe(true);
      const loaded = decodeV03Save(encodeV03Save(after));
      const next = advanceV03(loaded, 1).state;
      expect(officer(next, targetId).troopExperience).toBeGreaterThanOrEqual(1500);
      expect(next.troopSources.some((source) => source.id === 'r3-veterans')).toBe(false);
      expect(cityAt(next, cityId).workPointsUsed).toBe(cityAt(after, cityId).workPointsUsed);
      // Reassignment conserves weighted food headcount; cavalry are charged twice, not duplicated.
      expect(cityAt(next, cityId).cavalryServiceDaysThisMonth).toBe(500);
      expect(cityAt(next, cityId).troopServiceDaysThisMonth).toBe(
        cityPersonnelSummary(after, cityId).troops,
      );
    },
  );

  it('transfers paid reserve rations when organizing an army instead of charging those people again', () => {
    const { state, cityId, targetId } = fixture('capital', 500);
    state.personnelDay.rations.push({
      recordId: 'reserve:' + cityId + ':cavalry',
      troops: 500,
      wounded: 0,
    });
    const before = cityRationCredits(state, cityId);
    const organized = apply(state, cityId).state;
    expect(organized.personnelDay.rations).toContainEqual({
      recordId: 'officer:' + targetId,
      troops: 500,
      wounded: 0,
    });
    expect(cityRationCredits(organized, cityId)).toEqual(before);
  });
});
