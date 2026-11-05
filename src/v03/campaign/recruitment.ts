import type { TroopType } from '../content/types';
import { RECRUITMENT as RECRUITMENT_TABLE } from '../balance';
import { UNITS as UNITS_TABLE } from '../content/units';

// Module-local binding: reading an imported table through the module namespace costs a getter call per access in hot loops.
const UNITS = UNITS_TABLE;

// Module-local bindings: reading an imported table through the module namespace costs a getter call per access in hot loops.
const RECRUITMENT = RECRUITMENT_TABLE;

/** Initial game balance, not historical population/currency estimates. */
export const RECRUITMENT_REGIONS = RECRUITMENT.regions;

export function recruitmentQuote(
  city: { id: string; population: number },
  force: number,
  type: TroopType,
) {
  const region = (RECRUITMENT_REGIONS.north as readonly string[]).includes(city.id)
    ? 'north'
    : (RECRUITMENT_REGIONS.central as readonly string[]).includes(city.id)
      ? 'central'
      : 'south';
  // Cavalry stays a premium everywhere, but the south is no longer a trap (PF-RL-04): at
  // force 70 a soldier costs about 1.0 / 1.5 / 2.3 gold north / centre / south (was
  // 1.0 / 2.6 / 6.2), against 0.3 for infantry.
  const multiplier = UNITS[type].recruit.multiplier[region];
  const gold = UNITS[type].recruit.gold[region];
  const troops = Math.max(
    0,
    Math.min(
      city.population - RECRUITMENT.protectedPopulation,
      Math.floor(((RECRUITMENT.base + force * RECRUITMENT.perForce) * multiplier) / 100),
    ),
  );
  return { troops, gold, region };
}
