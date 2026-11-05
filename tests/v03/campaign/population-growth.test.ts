import { describe, expect, it } from 'vitest';
import { advanceV03 } from '../../../src/v03/engine';
import { createV03Game } from '../../../src/v03/initial-state';
import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';

/** Loyalty and expected monthly growth rate for each band. */
const BANDS: Array<[number, number]> = [
  [100, 0.003],
  [70, 0.003],
  [69, 0.001],
  [50, 0.001],
  [49, 0],
  [0, 0],
];

function settle(setup: { loyalty: number; food: number; troops?: number; owned?: boolean }) {
  const state = createV03Game('cao', 17);
  state.absoluteDay = 29;
  state.monthIndex = 0;
  for (const faction of state.factions)
    if (faction.id !== 'cao')
      state.alliances.push({ a: 'cao', b: faction.id, expiresMonthIndex: 6 });
  const city = state.cities.find((entry) => entry.id === 'chenliu')!;
  const serving = state.officers.filter(
    (officer) => officer.location.kind === 'city' && officer.location.cityId === city.id,
  );
  for (const officer of serving)
    Object.assign(officer, { troops: 0, wounded: 0, troopExperience: 0 });
  const troops = setup.troops ?? 0;
  if (troops > 0) serving[0]!.troops = troops;
  Object.assign(city, {
    food: setup.food,
    gold: 100_000,
    farming: 0,
    population: 10_000,
    loyalty: setup.loyalty,
    garrisonTroops: troops,
    reserve: 0,
    reservePools: createReservePools(),
    troopServiceDaysThisMonth: troops * 30,
    cavalryServiceDaysThisMonth: 0,
    prisonerServiceDaysThisMonth: 0,
    prisonerCavalryDaysThisMonth: 0,
  });
  if (setup.owned === false) city.factionId = null;
  state.personnelDay = createPersonnelDay(state);
  const next = advanceV03(state, 1).state;
  return next.cities.find((entry) => entry.id === 'chenliu')!;
}

describe('L-02 population growth', () => {
  it.each(BANDS)('loyalty %i grows by %f', (loyalty, rate) => {
    const city = settle({ loyalty, food: 5000 });
    expect(city.population).toBe(10_000 + Math.floor(10_000 * rate));
  });

  it('declines 0.5% in a food shortfall, whatever the loyalty', () => {
    const city = settle({ loyalty: 100, food: 0, troops: 3000 });
    expect(city.population).toBe(10_000 - 50);
  });

  it('leaves unowned cities unchanged', () => {
    expect(settle({ loyalty: 90, food: 5000, owned: false }).population).toBe(10_000);
  });
});
