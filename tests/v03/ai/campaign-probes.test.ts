import { describe, expect, it } from 'vitest';
import { executeCampaignProbe, prepareProbeCapital } from '../../../tools/v04-campaign-probes.mjs';
import { createV03Game } from '../../../src/v03/initial-state';
import { executeV03Command } from '../../../src/v03/commands';
import { ROUTE_DEFINITIONS } from '../../../src/v03/geography';
import { availableReserveTroops, createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { getV03CityActionAvailability } from '../../../src/v03/governance/city-actions';
import { previewCampaignDirective } from '../../../src/v03/governance/orders';
import { createV03OrderServices } from '../../../src/v03/governance/services';
import { validateV03State } from '../../../src/v03/platform/storage';

const api = {
  executeV03Command,
  ROUTE_DEFINITIONS,
  availableReserveTroops,
  getV03CityActionAvailability,
  previewCampaignDirective,
  services: createV03OrderServices(),
};

describe('V04-09 diagnostic player policies', () => {
  it('buys food with real gold and work while preserving other cities and total personnel', () => {
    const initial = createV03Game('cao', 17);
    const city = initial.cities.find((city) => city.id === initial.playerCapitalCityId)!;
    Object.assign(city, { food: 0, gold: 400 });
    const before = structuredClone(initial);
    const result = prepareProbeCapital(initial, api);
    expect(initial).toEqual(before);
    const after = result.state.cities.find((entry) => entry.id === city.id)!;
    // Two 2,000-food purchases at 200 gold each (PF-RL-02).
    expect(after).toMatchObject({ food: 4000, gold: 0, workPointsUsed: 2 });
    expect(after.reserve + after.garrisonTroops).toBe(city.reserve + city.garrisonTroops);
    expect(result.state.cities.filter((entry) => entry.id !== city.id)).toEqual(
      initial.cities.filter((entry) => entry.id !== city.id),
    );
    expect(validateV03State(result.state)).toBe(true);
    const spent = prepareProbeCapital(result.state, api);
    expect(spent.actions).toEqual([]);
    expect(spent.state).toEqual(result.state);
  });

  it.each(['passive-defense', 'economy-first', 'border-attack'] as const)(
    '%s honors its opening preparation period instead of creating an early expedition',
    (policy) => {
      const initial = createV03Game('liu', 970302);
      const result = executeCampaignProbe(initial, policy, api);
      expect(result.dispatched).toBe(false);
      expect(result.state.directives).toEqual(initial.directives);
      expect(validateV03State(result.state)).toBe(true);
    },
  );

  it('attempts one ready border attack through player orders and does not duplicate it', () => {
    const initial = createV03Game('liu', 970302);
    initial.absoluteDay = 30;
    initial.monthIndex = 1;
    initial.personnelDay = createPersonnelDay(initial);
    const result = executeCampaignProbe(initial, 'border-attack', api);
    expect(result.dispatched).toBe(true);
    expect(result.state.directives.filter((order) => order.factionId === 'liu')).toHaveLength(1);
    const repeated = executeCampaignProbe(result.state, 'border-attack', api);
    expect(repeated.dispatched).toBe(false);
    expect(repeated.state.directives).toEqual(result.state.directives);
    expect(validateV03State(repeated.state)).toBe(true);
  });
});
