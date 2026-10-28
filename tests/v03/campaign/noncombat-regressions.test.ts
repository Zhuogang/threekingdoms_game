import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { executeV03Command } from '../../../src/v03/commands';
import { advanceV03 } from '../../../src/v03/engine';
import { proposeV03Alliance, breakV03Alliance } from '../../../src/v03/campaign/diplomacy';
import {
  createPersonnelDay,
  detachWoundedToCity,
  cityPersonnelSummary,
} from '../../../src/v03/campaign/personnel';
import {
  previewRequisition,
  requestRequisition,
  answerRequisition,
} from '../../../src/v03/governance/orders';
import { createV03OrderServices } from '../../../src/v03/governance/services';
import { getV03CityActionAvailability } from '../../../src/v03/governance/city-actions';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import type { V03GameState, V03CityAction } from '../../../src/v03/types';

const reload = (state: V03GameState) => decodeV03Save(encodeV03Save(state));
function day(state: V03GameState) {
  state.events.forEach((event) => (event.acknowledged = true));
  const result = advanceV03(state, 1);
  expect(result.daysAdvanced, result.error).toBe(1);
  return result.state;
}

describe('noncombat release regressions', () => {
  it('persists failed diplomacy attempts, rejects retries without rolling, and resets per target next month', () => {
    const initial = createV03Game('cao', 1);
    // A fixed roll of 98 exceeds even the maximum alliance chance of 90%.
    initial.rng = 121;
    const first = proposeV03Alliance(initial, 'liu');
    expect(first.ok).toBe(true);
    expect(first.state.alliances).toHaveLength(0);
    let state = reload(first.state);
    const blocked = proposeV03Alliance(state, 'liu');
    expect(blocked.ok).toBe(false);
    expect(blocked.state).toBe(state);
    expect(proposeV03Alliance(state, 'sun').ok).toBe(true);
    state.absoluteDay = 30;
    state.monthIndex = 1;
    expect(proposeV03Alliance(state, 'liu').ok).toBe(true);
    expect(initial.lastAllianceProposalMonthByTarget).toBeUndefined();
    expect(reload(initial)).toEqual(initial);
  });

  it('cannot break and reform an alliance in the same month, including after loading', () => {
    const accepted = proposeV03Alliance(createV03Game('cao', 1), 'liu');
    expect(accepted.state.alliances).toHaveLength(1);
    const broken = breakV03Alliance(accepted.state, 'liu');
    expect(broken.ok).toBe(true);
    expect(proposeV03Alliance(reload(broken.state), 'liu').ok).toBe(false);
  });

  it.each(['ghost', 'cao'])('rejects invalid saved diplomacy target %s', (target) => {
    const state = createV03Game('cao', 1);
    state.lastAllianceProposalMonthByTarget = { [target]: 0 };
    expect(validateV03State(state)).toBe(false);
  });

  it.each(['security', 'feast', 'assign-troops'] as V03CityAction[])(
    'rejects ineffective %s without spending work, resources or RNG, but permits a real improvement',
    (action) => {
      const state = createV03Game('cao', 1);
      const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
      const officer = state.officers.find((entry) => entry.id === 'caocao')!;
      city.loyalty = 100;
      for (const resident of state.officers)
        if (
          resident.location.kind === 'city' &&
          resident.location.cityId === city.id &&
          resident.factionId === 'cao'
        )
          resident.loyalty = 100;
      const input = { cityId: city.id, action, officerId: officer.id, amount: officer.troops };
      expect(getV03CityActionAvailability(state, input).ok).toBe(false);
      const result = executeV03Command(state, { type: 'cityAction', ...input });
      expect(result.ok).toBe(false);
      expect(result.state).toBe(state);
      if (action === 'security') city.loyalty = 99;
      if (action === 'feast') officer.loyalty = 99;
      if (action === 'assign-troops') input.amount -= 1;
      const effective = executeV03Command(state, { type: 'cityAction', ...input });
      expect(effective.ok, effective.error).toBe(true);
      expect(effective.state.cities.find((entry) => entry.id === city.id)?.workPointsUsed).toBe(
        action === 'assign-troops' ? 0 : 1,
      );
    },
  );

  it.each([0, 8])(
    'returns an autonomous contingent after its work is spent, preserving personnel and reorganization (%s)',
    (reorganizationDays) => {
      const state = createV03Game('cao', 1);
      const officer = state.officers.find((entry) => entry.id === 'caoren')!;
      expect(officer.location).toEqual({ kind: 'city', cityId: 'xuchang' });
      const city = state.cities.find((entry) => entry.id === 'xuchang')!;
      if (reorganizationDays) city.garrisonTroops -= officer.troops;
      Object.assign(officer, { wounded: 100, troopExperience: 1200, reorganizationDays });
      city.workPointsUsed = 3;
      state.personnelDay = createPersonnelDay(state);
      const before = cityPersonnelSummary(state, city.id);
      const result = executeV03Command(state, {
        type: 'returnTroops',
        cityId: city.id,
        officerId: officer.id,
      });
      expect(result.ok, result.error).toBe(true);
      const returned = reload(result.state);
      expect(returned.officers.find((entry) => entry.id === officer.id)).toMatchObject({
        troops: 0,
        wounded: 0,
      });
      const after = cityPersonnelSummary(returned, city.id);
      expect(after.troops + after.wounded).toBe(before.troops + before.wounded);
      expect(after.foodHeadcount).toBe(before.foodHeadcount);
      expect(returned.cities.find((entry) => entry.id === city.id)?.workPointsUsed).toBe(3);
      if (reorganizationDays)
        expect(
          returned.troopSources.find((entry) => entry.sourceOfficerId === officer.id),
        ).toMatchObject({ troopExperience: 1200, reorganizationDays });
      const appoint = executeV03Command(returned, {
        type: 'appointGovernor',
        cityId: 'puyang',
        officerId: officer.id,
      });
      expect(appoint.ok, appoint.error).toBe(true);
      expect(validateV03State(appoint.state)).toBe(true);
    },
  );

  it.each([
    [700, 50],
    [0, 50],
    [0, 0],
  ])(
    'cancels old and new wounded auto-return after save/load with %s healthy and %s attached wounded',
    (troops, wounded) => {
      const state = createV03Game('cao', 1);
      const officer = state.officers.find((entry) => entry.id === 'caocao')!;
      const other = state.officers.find((entry) => entry.id === 'xiahoudun')!;
      const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
      city.garrisonTroops += troops - officer.troops;
      officer.troops = troops;
      officer.wounded = 100;
      detachWoundedToCity(state, officer.id);
      const oldId = state.troopSources.at(-1)!.id;
      other.wounded = 100;
      detachWoundedToCity(state, other.id);
      const otherId = state.troopSources.at(-1)!.id;
      // The empty-officer case must still be allowed to cancel an earlier rear detachment.
      officer.wounded = wounded;
      state.personnelDay = createPersonnelDay(state);
      const result = executeV03Command(state, {
        type: 'returnTroops',
        cityId: city.id,
        officerId: officer.id,
      });
      expect(result.ok, result.error).toBe(true);
      expect(result.state.troopSources.find((entry) => entry.id === oldId)?.autoReturn).toBe(false);
      expect(result.state.troopSources.find((entry) => entry.id === otherId)?.autoReturn).toBe(
        true,
      );
      let next = reload(result.state);
      for (let i = 0; i < 3; i++) next = day(next);
      expect(next.officers.find((entry) => entry.id === officer.id)).toMatchObject({
        troops: 0,
        wounded: 0,
      });
      expect(next.officers.find((entry) => entry.id === other.id)!.troops).toBeGreaterThan(
        other.troops,
      );
      expect(validateV03State(next)).toBe(true);
    },
  );

  function shipment(troops = 700, food = 200) {
    const state = createV03Game('cao', 1);
    const input = {
      sourceCityId: 'chenliu',
      targetCityId: 'puyang',
      requested: { gold: 0, food, troops },
      requestedByDay: null,
    };
    const source = state.cities.find((entry) => entry.id === input.sourceCityId)!;
    const services = createV03OrderServices();
    return { state, input, source, services };
  }

  it('charges cavalry travel provisions separately, consumes them in transit, and delivers cargo once after reload', () => {
    const { state, input, source, services } = shipment();
    const preview = previewRequisition(state, input, services);
    expect(preview.ready).toBe(true);
    expect(preview.party?.composition.cavalryTroops).toBe(700);
    expect(preview.travelFood).toBe(Math.ceil(1400 * 0.008 * preview.route!.estimatedDays));
    const result = requestRequisition(state, input, services);
    expect(result.ok, result.message).toBe(true);
    let next = reload(result.state);
    const id = next.journeys[0]!.id;
    expect(next.cities.find((entry) => entry.id === source.id)!.food).toBe(
      source.food - input.requested.food - preview.travelFood,
    );
    const targetFood = next.cities.find((entry) => entry.id === input.targetCityId)!.food;
    expect(next.journeys[0]!.manifest.carriedFood).toBe(preview.travelFood);
    expect(next.journeys[0]!.manifest.cargo.food).toBe(200);
    for (let i = 0; i < preview.route!.estimatedDays; i++) next = day(reload(next));
    const arrived = next.journeys.find((entry) => entry.id === id)!;
    expect(arrived.status).toBe('delivered');
    expect(arrived.consumedFood).toBeGreaterThan(0);
    expect(arrived.accumulatedFoodShortfall).toBe(0);
    expect(arrived.manifest.troopCount).toBe(700);
    const deliveredFood = targetFood + 200 + preview.travelFood - arrived.consumedFood;
    expect(next.cities.find((entry) => entry.id === input.targetCityId)!.food).toBe(deliveredFood);
    next = day(reload(next));
    expect(next.cities.find((entry) => entry.id === input.targetCityId)!.food).toBe(deliveredFood);
    expect(validateV03State(next)).toBe(true);
  });

  it('offers cargo reduced by provisions, refuses an underfunded acceptance, then dispatches the reduced shipment', () => {
    const { state, input, source, services } = shipment();
    source.food = input.requested.food;
    const result = requestRequisition(state, input, services);
    expect(result.ok).toBe(true);
    expect(result.order?.status).toBe('proposed');
    expect(result.state.journeys).toHaveLength(0);
    const preview = result.preview!;
    expect(preview.executable).toEqual({
      gold: 0,
      food: source.food - preview.travelFood,
      troops: 700,
    });
    const accept = answerRequisition(result.state, result.order!.id, 'accept', services);
    expect(accept.state.journeys).toHaveLength(0);
    const reduced = answerRequisition(
      accept.state,
      result.order!.id,
      'reduce',
      services,
      preview.executable,
    );
    expect(reduced.ok, reduced.message).toBe(true);
    expect(reduced.state.cities.find((entry) => entry.id === source.id)!.food).toBe(0);
    const repeated = answerRequisition(reload(reduced.state), result.order!.id, 'accept', services);
    expect(repeated.reasonCode).toBe('order.already-dispatched');
    expect(repeated.state.journeys).toHaveLength(1);
  });

  it('never dispatches an unfed contingent, and permits a cargo-only reduction without travel food', () => {
    const { state, input, source, services } = shipment();
    source.food = 1;
    const result = requestRequisition(state, input, services);
    expect(result.order?.status).toBe('proposed');
    expect(result.preview!.reasonCodes).toContain('order.travel-food-shortfall');
    expect(result.preview!.executable.troops).toBe(0);
    const cargoOnly = answerRequisition(result.state, result.order!.id, 'reduce', services, {
      gold: 0,
      food: 1,
      troops: 0,
    });
    expect(cargoOnly.ok, cargoOnly.message).toBe(true);
    expect(cargoOnly.state.journeys[0]!.manifest.carriedFood).toBe(0);
    expect(cargoOnly.state.cities.find((entry) => entry.id === source.id)!.food).toBe(0);
  });
});
