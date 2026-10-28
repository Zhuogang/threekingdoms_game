import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { executeV03Command } from '../../../src/v03/commands';
import { availableTroops, createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { decidePrisoner, prisonerReturnPlan } from '../../../src/v03/campaign/prisoners';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import { advanceV03 } from '../../../src/v03/engine';

function fixture() {
  const state = createV03Game('cao', 1);
  const prisoner = state.officers.find((officer) => officer.id === 'yanliang')!;
  const home = state.cities.find(
    (city) => prisoner.location.kind === 'city' && city.id === prisoner.location.cityId,
  )!;
  home.garrisonTroops -= prisoner.troops;
  home.governorId = null;
  home.governanceMode = 'steward';
  prisoner.governorOfCityId = null;
  Object.assign(prisoner, {
    troops: 1800,
    wounded: 1200,
    troopExperience: 1200,
    loyalty: 10,
    location: { kind: 'captured', cityId: 'puyang' },
  });
  state.personnelDay = createPersonnelDay(state);
  return { state, prisoner };
}

describe('captive armies and real release journeys', () => {
  it('keeps a released army unavailable after arrival until its remaining reorganization finishes', () => {
    const { state, prisoner } = fixture();
    prisoner.reorganizationDays = 7;
    const released = decidePrisoner(state, 'cao', prisoner.id, 'release');
    expect(released.ok, released.error).toBe(true);
    let next = released.state;
    const journey = next.journeys.at(-1)!;
    const home = next.cities.find((city) => city.id === journey.destinationCityId)!;
    const garrison = home.garrisonTroops;
    const stationedReady = (state: typeof next) =>
      state.officers
        .filter(
          (officer) =>
            officer.alive &&
            officer.factionId === home.factionId &&
            officer.location.kind === 'city' &&
            officer.location.cityId === home.id,
        )
        .reduce((sum, officer) => sum + availableTroops(officer), 0);
    const unled = garrison - stationedReady(next);
    journey.routeSnapshot = journey.routeSnapshot.map((segment) => ({
      ...segment,
      lengthKm: 1,
      fixedDelayDays: 0,
    }));
    journey.segmentProgressKm.fill(0);
    journey.segmentWaitDays.fill(0);
    for (
      let day = 0;
      day < 4 &&
      next.officers.find((entry) => entry.id === prisoner.id)!.location.kind === 'journey';
      day++
    ) {
      next.events.forEach((event) => (event.acknowledged = true));
      next = advanceV03(next, 1).state;
    }
    expect(next.officers.find((entry) => entry.id === prisoner.id)).toMatchObject({
      troops: 1800,
      wounded: 1200,
      reorganizationDays: 7,
      location: { kind: 'city', cityId: home.id },
    });
    expect(next.cities.find((city) => city.id === home.id)?.garrisonTroops).toBe(garrison);
    expect(decodeV03Save(encodeV03Save(next))).toEqual(next);
    next.events.forEach((event) => (event.acknowledged = true));
    next = advanceV03(next, 1).state; // Arrival day still gives no reorganization credit.
    expect(next.officers.find((entry) => entry.id === prisoner.id)?.reorganizationDays).toBe(7);
    for (let day = 0; day < 7; day++) {
      next.events.forEach((event) => (event.acknowledged = true));
      next = advanceV03(next, 1).state;
    }
    const ready = next.officers.find((entry) => entry.id === prisoner.id)!;
    expect(ready.reorganizationDays).toBe(0);
    expect(next.cities.find((city) => city.id === home.id)?.garrisonTroops).toBe(
      unled + stationedReady(next),
    );
  });

  it('feeds captive troops in a neutral holding city without granting the city new income', () => {
    const { state, prisoner } = fixture();
    const city = state.cities.find((entry) => entry.id === 'beiping')!;
    expect(city.factionId).toBeNull();
    prisoner.location = { kind: 'captured', cityId: city.id };
    city.food = 0;
    city.gold = 0;
    state.absoluteDay = 29;
    state.personnelDay = createPersonnelDay(state);
    const result = advanceV03(state, 1);
    expect(result.error).toBeUndefined();
    expect(result.state.officers.find((entry) => entry.id === prisoner.id)).toMatchObject({
      troops: 1530,
      wounded: 1020,
      troopExperience: 1200,
    });
    expect(result.state.cities.find((entry) => entry.id === city.id)).toMatchObject({
      food: 0,
      gold: 0,
    });
    expect(validateV03State(result.state)).toBe(true);
  });

  it('spends both monthly exchange attempts on refusal but still permits release', () => {
    const { state, prisoner } = fixture();
    const own = state.officers.find((officer) => officer.id === 'xiahoudun')!;
    if (own.location.kind !== 'city') throw new Error('Expected a stationed officer.');
    const cityId = own.location.cityId;
    state.cities.find((city) => city.id === cityId)!.garrisonTroops -= own.troops;
    Object.assign(own, {
      troops: 0,
      troopExperience: 0,
      location: { kind: 'captured', cityId: 'ye' },
    });
    state.rng = 3;
    const result = decidePrisoner(state, 'cao', prisoner.id, 'exchange', own.id);
    expect(result.ok, result.error).toBe(true);
    expect(result.state.officers.find((officer) => officer.id === prisoner.id)).toMatchObject({
      prisonerActionMonth: 0,
      location: { kind: 'captured' },
    });
    expect(result.state.officers.find((officer) => officer.id === own.id)).toMatchObject({
      prisonerActionMonth: 0,
      location: { kind: 'captured' },
    });
    expect(decidePrisoner(result.state, 'cao', prisoner.id, 'exchange', own.id).ok).toBe(false);
    expect(decidePrisoner(result.state, 'cao', prisoner.id, 'release').ok).toBe(true);
  });
  it('recruits the whole force at its existing experience, with ten full days of reorganization', () => {
    const { state, prisoner } = fixture();
    const result = decidePrisoner(state, 'cao', prisoner.id, 'recruit');
    expect(result.ok, result.error).toBe(true);
    let next = result.state;
    expect(next.officers.find((officer) => officer.id === prisoner.id)).toMatchObject({
      factionId: 'cao',
      troops: 1800,
      wounded: 1200,
      troopExperience: 1200,
      reorganizationDays: 10,
    });
    expect(
      executeV03Command(next, {
        type: 'marchArmy',
        sourceCityId: 'puyang',
        targetCityId: 'ye',
        officerIds: [prisoner.id],
        intent: 'conquer',
      }).ok,
    ).toBe(false);
    next = advanceV03(next, 1).state; // Recruitment day gives no treatment/reorganization credit.
    expect(next.officers.find((officer) => officer.id === prisoner.id)?.reorganizationDays).toBe(
      10,
    );
    for (let i = 0; i < 10; i++) {
      next.events.forEach((event) => (event.acknowledged = true));
      next = advanceV03(next, 1).state;
    }
    expect(next.officers.find((officer) => officer.id === prisoner.id)?.reorganizationDays).toBe(0);
    expect(validateV03State(next)).toBe(true);
  });

  it('allows release after a failed recruitment attempt, without another RNG roll or teleport', () => {
    const { state, prisoner } = fixture();
    prisoner.loyalty = 100;
    const rejected = decidePrisoner(state, 'cao', prisoner.id, 'recruit');
    expect(
      rejected.state.officers.find((officer) => officer.id === prisoner.id)?.location.kind,
    ).toBe('captured');
    const rng = rejected.state.rng;
    const result = decidePrisoner(rejected.state, 'cao', prisoner.id, 'release');
    expect(result.ok, result.error).toBe(true);
    expect(result.state.rng).toBe(rng);
    const released = result.state.officers.find((officer) => officer.id === prisoner.id)!;
    expect(released.location.kind).toBe('journey');
    const journey = result.state.journeys.at(-1)!;
    expect(journey.destinationCityId).toBe('ye');
    expect(journey.manifest.troopCount).toBe(3000);
    expect(journey.manifest.composition.woundedTroops).toBe(1200);
    expect(journey.departedAbsoluteDay).toBe(state.absoluteDay + 1);
    expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
  });

  it('provides release and disband when no return route exists', () => {
    const { state, prisoner } = fixture();
    prisoner.location = { kind: 'captured', cityId: 'chenliu' };
    expect(prisonerReturnPlan(state, prisoner)).toBeNull();
    const city = state.cities.find((entry) => entry.id === 'chenliu')!;
    const population = city.population;
    const result = decidePrisoner(state, 'cao', prisoner.id, 'release');
    expect(result.ok).toBe(true);
    expect(result.state.officers.find((officer) => officer.id === prisoner.id)).toMatchObject({
      factionId: null,
      troops: 0,
      wounded: 0,
      troopExperience: 0,
      location: { kind: 'city', cityId: city.id },
    });
    expect(result.state.cities.find((entry) => entry.id === city.id)?.population).toBe(
      population + 3000,
    );
    expect(result.state.journeys).toEqual([]);
    expect(validateV03State(result.state)).toBe(true);
  });

  it('execution disbands soldiers once instead of executing or recruiting the army', () => {
    const { state, prisoner } = fixture();
    const city = state.cities.find((entry) => entry.id === 'puyang')!;
    const result = decidePrisoner(state, 'cao', prisoner.id, 'execute');
    expect(result.ok).toBe(true);
    expect(result.state.officers.find((officer) => officer.id === prisoner.id)).toMatchObject({
      alive: false,
      troops: 0,
      wounded: 0,
      troopExperience: 0,
    });
    expect(result.state.cities.find((entry) => entry.id === city.id)?.population).toBe(
      city.population + 3000,
    );
    expect(result.state.cities.find((entry) => entry.id === city.id)?.garrisonTroops).toBe(
      city.garrisonTroops,
    );
    expect(decidePrisoner(result.state, 'cao', prisoner.id, 'execute').ok).toBe(false);
  });

  it('cannot wash a recruitment restriction by returning the whole army', () => {
    const { state, prisoner } = fixture();
    prisoner.location = { kind: 'captured', cityId: state.playerCapitalCityId };
    const recruited = decidePrisoner(state, 'cao', prisoner.id, 'recruit').state;
    const returned = executeV03Command(recruited, {
      type: 'returnTroops',
      cityId: state.playerCapitalCityId,
      officerId: prisoner.id,
    });
    expect(returned.ok, returned.error).toBe(true);
    expect(returned.state.officers.find((officer) => officer.id === prisoner.id)).toMatchObject({
      troops: 0,
      wounded: 0,
      reorganizationDays: 0,
    });
    expect(returned.state.troopSources.at(-1)).toMatchObject({
      troops: 1800,
      wounded: 1200,
      reorganizationDays: 10,
      autoReturn: false,
    });
    expect(validateV03State(returned.state)).toBe(true);
  });

  it('peacefully disbands wounded and reserves while retaining spent city service days', () => {
    const state = createV03Game('cao', 19);
    const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
    const officer = state.officers.find((entry) => entry.id === 'caocao')!;
    officer.wounded = 500;
    city.troopServiceDaysThisMonth = 12345;
    const originalPopulation = city.population;
    const result = executeV03Command(state, {
      type: 'disband',
      cityId: city.id,
      recordId: `officer:${officer.id}`,
      troops: 0,
      wounded: 500,
    });
    expect(result.ok, result.error).toBe(true);
    expect(result.state.officers.find((entry) => entry.id === officer.id)?.wounded).toBe(0);
    expect(result.state.cities.find((entry) => entry.id === city.id)).toMatchObject({
      population: originalPopulation + 500,
      troopServiceDaysThisMonth: 12345,
    });
    const count = result.state.cities.find((entry) => entry.id === city.id)!.reservePools.cavalry
      .troops;
    const second = executeV03Command(result.state, {
      type: 'disband',
      cityId: city.id,
      recordId: 'reserve:cavalry',
      troops: count,
      wounded: 0,
    });
    expect(second.ok).toBe(true);
    expect(
      second.state.cities.find((entry) => entry.id === city.id)?.reservePools.cavalry.troops,
    ).toBe(0);
    expect(validateV03State(second.state)).toBe(true);
  });
});
