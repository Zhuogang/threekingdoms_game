import { describe, expect, it } from 'vitest';
import { CITY_RECORDS, CITY_TIER_ROWS } from '../../../src/v03/content/cities';
import { SCENARIOS } from '../../../src/v03/content/scenario';

describe('city records', () => {
  it('has 24 frozen records matching the scenario city ids', () => {
    expect(Object.keys(CITY_RECORDS)).toHaveLength(24);
    expect(Object.isFrozen(CITY_RECORDS)).toBe(true);
    for (const scenario of SCENARIOS) {
      expect(scenario.cities.map((c) => c.id).sort()).toEqual(Object.keys(CITY_RECORDS).sort());
    }
  });

  it('gives each record its tier row values and a provenance line', () => {
    for (const record of Object.values(CITY_RECORDS)) {
      const row = CITY_TIER_ROWS[record.tier];
      expect({
        population: record.population,
        farming: record.farming,
        commerce: record.commerce,
        farmingCap: record.farmingCap,
        commerceCap: record.commerceCap,
      }).toEqual(row);
      expect(record.provenance.length).toBeGreaterThan(10);
      expect(Object.isFrozen(record)).toBe(true);
    }
  });

  it('builds both scenarios from the records', () => {
    for (const scenario of SCENARIOS) {
      for (const city of scenario.cities) {
        const record = CITY_RECORDS[city.id]!;
        expect([city.population, city.farming, city.commerce]).toEqual([
          record.population,
          record.farming,
          record.commerce,
        ]);
        expect(city.loyalty).toBe(
          scenario.id === 'divided-realm-190' && city.factionId === 'dong' ? 55 : record.loyalty,
        );
      }
    }
  });
});
