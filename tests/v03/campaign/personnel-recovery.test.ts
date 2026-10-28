import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { recoverPersonnelDay } from '../../../src/v03/campaign/personnel-recovery';
import { advanceV03 } from '../../../src/v03/engine';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';

function fixture() {
  const state = createV03Game('cao', 91);
  const officer = state.officers.find((entry) => entry.id === 'caocao')!;
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  city.garrisonTroops -= officer.troops;
  Object.assign(officer, { troops: 0, wounded: 3000, troopExperience: 1200 });
  city.food = 100_000;
  state.personnelDay = createPersonnelDay(state);
  return { state, officer, city };
}

describe('daily recovery and reorganization', () => {
  it('treats captive wounded without advancing reorganization owed to their own house', () => {
    const { state, officer } = fixture();
    const prison = state.cities.find((city) => city.id === 'ye')!;
    officer.location = { kind: 'captured', cityId: prison.id };
    officer.reorganizationDays = 7;
    state.personnelDay = createPersonnelDay(state);
    const garrison = prison.garrisonTroops;
    recoverPersonnelDay(state);
    expect(officer).toMatchObject({
      troops: 300,
      wounded: 2700,
      reorganizationDays: 7,
      location: { kind: 'captured', cityId: prison.id },
    });
    expect(prison.garrisonTroops).toBe(garrison);
  });

  it('recovers 300 of 3000 once per day, preserves experience and survives a reload', () => {
    const { state, officer } = fixture();
    recoverPersonnelDay(state);
    expect(officer).toMatchObject({ troops: 300, wounded: 2700, troopExperience: 1200 });
    recoverPersonnelDay(state);
    expect(officer.troops).toBe(300);
    const restored = decodeV03Save(encodeV03Save(state));
    recoverPersonnelDay(restored);
    expect(restored.officers.find((entry) => entry.id === officer.id)?.troops).toBe(300);
  });

  it('reaches ninety percent after 22 effective days without a reset on new wounds', () => {
    const { state, officer } = fixture();
    for (let day = 0; day < 22; day++) {
      state.absoluteDay = day;
      state.personnelDay = createPersonnelDay(state);
      recoverPersonnelDay(state);
    }
    expect(officer.wounded).toBe(291);
    officer.wounded += 100;
    state.absoluteDay++;
    state.personnelDay = createPersonnelDay(state);
    recoverPersonnelDay(state);
    expect(officer.wounded).toBe(351);
  });

  it('rounds recovery once per city/type, so splitting a source does not create a second healed soldier', () => {
    const { state, officer, city } = fixture();
    Object.assign(officer, { wounded: 0, troopExperience: 0 });
    const source = {
      cityId: city.id,
      factionId: city.factionId,
      sourceOfficerId: officer.id,
      autoReturn: false,
      troopType: officer.troopType,
      troops: 0,
      wounded: 1,
      troopExperience: 1200,
      reorganizationDays: 0,
    };
    state.troopSources = [
      { ...source, id: 'a' },
      { ...source, id: 'b', wounded: 9 },
    ];
    state.personnelDay = createPersonnelDay(state);
    recoverPersonnelDay(state);
    expect(state.troopSources.reduce((sum, entry) => sum + entry.troops, 0)).toBe(1);
    expect(state.troopSources.reduce((sum, entry) => sum + entry.wounded, 0)).toBe(9);
    expect(validateV03State(state)).toBe(true);
  });

  it('pauses without food and gives no treatment credit for moving into another city today', () => {
    const { state, officer, city } = fixture();
    city.food = 0;
    recoverPersonnelDay(state);
    expect(officer.wounded).toBe(3000);
    state.absoluteDay++;
    state.personnelDay = createPersonnelDay(state);
    const another = state.cities.find(
      (entry) => entry.factionId === 'cao' && entry.id !== city.id,
    )!;
    officer.location = { kind: 'city', cityId: another.id };
    recoverPersonnelDay(state);
    expect(officer.wounded).toBe(3000);
  });

  it('counts ten full city days of reorganization before supplying a usable garrison', () => {
    let { state, officer, city } = fixture();
    Object.assign(officer, { troops: 3000, wounded: 0, reorganizationDays: 10 });
    state.personnelDay = createPersonnelDay(state);
    const originalGarrison = city.garrisonTroops;
    for (let i = 1; i <= 10; i++) {
      state = advanceV03(state, 1).state;
      expect(state.officers.find((entry) => entry.id === officer.id)?.reorganizationDays).toBe(
        10 - i,
      );
      expect(state.cities.find((entry) => entry.id === city.id)?.garrisonTroops).toBe(
        originalGarrison + (i === 10 ? 3000 : 0),
      );
    }
    expect(validateV03State(state)).toBe(true);
  });

  it('automatically rejoins recovered source veterans only when the original commander is present', () => {
    const { state, officer, city } = fixture();
    Object.assign(officer, { wounded: 0, troopExperience: 0 });
    state.troopSources = [
      {
        id: 'old-wounded',
        cityId: city.id,
        factionId: city.factionId,
        sourceOfficerId: officer.id,
        autoReturn: true,
        troopType: officer.troopType,
        troops: 0,
        wounded: 3000,
        troopExperience: 1200,
        reorganizationDays: 0,
      },
    ];
    state.personnelDay = createPersonnelDay(state);
    recoverPersonnelDay(state);
    expect(officer).toMatchObject({ troops: 300, wounded: 0, troopExperience: 1200 });
    expect(state.troopSources[0]).toMatchObject({
      troops: 0,
      wounded: 2700,
      troopExperience: 1200,
    });
    expect(validateV03State(state)).toBe(true);
  });
});
