import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { executeV03Command } from '../../../src/v03/commands';
import {
  applyV03CityAction,
  getV03CityActionAvailability,
  type OfficerGroupAction,
} from '../../../src/v03/governance/city-actions';
import { encodeV03Save, decodeV03Save } from '../../../src/v03/platform/storage';
import { localizeRoutineFeedback } from '../../../src/v03/ui/feedback';

function fixture() {
  const state = createV03Game('cao', 1);
  const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
  city.gold = 5000;
  const officers = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.factionId === 'cao' &&
      officer.location.kind === 'city' &&
      officer.location.cityId === city.id,
  );
  officers.forEach((officer, i) =>
    Object.assign(officer, { loyalty: 40 + i, force: 60 + i, equipment: null }),
  );
  expect(officers.length).toBeGreaterThan(2);
  return { state, city, officers };
}

describe('selected officer city actions', () => {
  it.each(['feast', 'reward', 'equip'] as OfficerGroupAction[])(
    'applies %s only to selected officers, charging the complete order once',
    (action) => {
      const { state, city, officers } = fixture();
      city.workPointsUsed = action === 'feast' ? 1 : 2;
      const before = structuredClone(state);
      const officerIds = officers.slice(0, 2).map((officer) => officer.id);
      const input = { cityId: city.id, action, officerIds };
      expect(getV03CityActionAvailability(state, input).ok).toBe(true);
      const result = executeV03Command(state, { type: 'cityAction', ...input });
      expect(result.ok, result.error).toBe(true);
      for (const officer of before.officers) {
        const after = result.state.officers.find((entry) => entry.id === officer.id)!;
        if (!officerIds.includes(officer.id)) expect(after).toEqual(officer);
        else if (action === 'equip')
          expect(after).toEqual({ ...officer, force: officer.force + 5, equipment: 'Fine arms' });
        else
          expect(after).toEqual({
            ...officer,
            loyalty: officer.loyalty + (action === 'feast' ? 8 : 15),
          });
      }
      expect(result.state.cities.find((entry) => entry.id === city.id)).toMatchObject({
        workPointsUsed: 2,
        gold: 5000 - (action === 'reward' ? 200 : action === 'equip' ? 360 : 0),
        food: city.food,
      });
      expect(result.state.revision).toBe(state.revision + 1);
      expect(result.state.rng).toBe(state.rng);
      expect(state).toEqual(before);
      expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
      expect(localizeRoutineFeedback(result.message!, 'zh', result.state)).toMatch(
        /[\u3400-\u9fff]/,
      );
    },
  );

  it('lets every local officer attend one feast for one work point', () => {
    const { state, city, officers } = fixture();
    const result = applyV03CityAction(state, {
      cityId: city.id,
      action: 'feast',
      officerIds: officers.map((officer) => officer.id),
    });
    expect(result.ok).toBe(true);
    expect(result.state.cities.find((entry) => entry.id === city.id)!.workPointsUsed).toBe(1);
    for (const officer of officers)
      expect(result.state.officers.find((entry) => entry.id === officer.id)!.loyalty).toBe(
        officer.loyalty + 8,
      );
  });

  it.each(['reward', 'equip'] as const)(
    'rejects an unaffordable %s group without partially paying or improving officers',
    (action) => {
      const { state, city, officers } = fixture();
      city.gold = action === 'reward' ? 150 : 250;
      const input = {
        cityId: city.id,
        action,
        officerIds: officers.slice(0, 2).map((officer) => officer.id),
      };
      const before = structuredClone(state);
      const availability = getV03CityActionAvailability(state, input);
      const result = applyV03CityAction(state, input);
      expect(availability.ok).toBe(false);
      expect(result.error).toBe(availability.reason);
      expect(result.error).toContain('gold');
      expect(result.state).toBe(state);
      expect(state).toEqual(before);
    },
  );

  it.each(['reward', 'equip'] as const)(
    'protects reserved gold against the total %s cost',
    (action) => {
      const { state, city, officers } = fixture();
      const price = action === 'reward' ? 100 : 180;
      city.gold = price * 2 + 50;
      state.requisitions.push({
        id: 'protected-group-gold',
        factionId: 'cao',
        sourceCityId: city.id,
        targetCityId: 'puyang',
        requested: { gold: 100, food: 0, troops: 0 },
        proposed: { gold: 100, food: 0, troops: 0 },
        createdDay: 0,
        requestedByDay: null,
        earliestDepartureDay: null,
        estimatedArrivalDay: null,
        status: 'reserved',
        journeyId: null,
        governanceRevision: 0,
        message: '',
      });
      const result = applyV03CityAction(state, {
        cityId: city.id,
        action,
        officerIds: officers.slice(0, 2).map((officer) => officer.id),
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('reserved');
      expect(result.state).toBe(state);
    },
  );

  it.each([
    'empty',
    'duplicate',
    'missing',
    'foreign',
    'away',
    'dead',
    'captured',
    'blank',
    'sparse',
  ] as const)('rejects a %s selection atomically', (kind) => {
    const { state, city, officers } = fixture();
    let officerIds = officers.slice(0, 2).map((officer) => officer.id);
    if (kind === 'empty') officerIds = [];
    if (kind === 'duplicate') officerIds = [officers[0]!.id, officers[0]!.id];
    if (kind === 'missing') officerIds[1] = 'missing-officer';
    if (kind === 'blank') officerIds[1] = '';
    if (kind === 'sparse') officerIds = new Array<string>(1);
    if (kind === 'foreign') officerIds[1] = 'yuanshao';
    if (kind === 'away') officerIds[1] = 'caoren';
    if (kind === 'dead') officers[1]!.alive = false;
    if (kind === 'captured') officers[1]!.location = { kind: 'captured', cityId: city.id };
    const before = structuredClone(state);
    const result = applyV03CityAction(state, { cityId: city.id, action: 'feast', officerIds });
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
    expect(state).toEqual(before);
  });

  it('allows full-loyalty guests alongside others, but blocks an entirely ineffective selected feast', () => {
    const { state, city, officers } = fixture();
    officers[0]!.loyalty = 100;
    const ineffective = applyV03CityAction(state, {
      cityId: city.id,
      action: 'feast',
      officerIds: [officers[0]!.id],
    });
    expect(ineffective.ok).toBe(false);
    expect(ineffective.state).toBe(state);
    const result = applyV03CityAction(state, {
      cityId: city.id,
      action: 'feast',
      officerIds: officers.slice(0, 2).map((officer) => officer.id),
    });
    expect(result.ok).toBe(true);
    expect(result.state.officers.find((entry) => entry.id === officers[0]!.id)!.loyalty).toBe(100);
    expect(result.state.officers.find((entry) => entry.id === officers[1]!.id)!.loyalty).toBe(
      officers[1]!.loyalty + 8,
    );
    expect(result.state.officers.find((entry) => entry.id === officers[2]!.id)!.loyalty).toBe(
      officers[2]!.loyalty,
    );
  });

  it.each(['reward', 'equip'] as const)(
    'preserves per-officer %s caps and rejects a group containing an ineligible recipient',
    (action) => {
      const { state, city, officers } = fixture();
      if (action === 'reward') officers[1]!.loyalty = 100;
      else officers[1]!.equipment = 'Fine arms';
      const input = {
        cityId: city.id,
        action,
        officerIds: officers.slice(0, 2).map((officer) => officer.id),
      };
      expect(applyV03CityAction(state, input).state).toBe(state);
      Object.assign(officers[1]!, { loyalty: 99, force: 104, equipment: null });
      const result = applyV03CityAction(state, input);
      expect(result.ok).toBe(true);
      expect(result.state.officers.find((entry) => entry.id === officers[1]!.id)).toMatchObject(
        action === 'reward' ? { loyalty: 100 } : { force: 105, equipment: 'Fine arms' },
      );
    },
  );

  it('does not permit bulk training or grant extra feast work after exhaustion', () => {
    const { state, city, officers } = fixture();
    const officerIds = officers.slice(0, 2).map((officer) => officer.id);
    expect(applyV03CityAction(state, { cityId: city.id, action: 'train', officerIds }).ok).toBe(
      false,
    );
    city.workPointsUsed = 2;
    expect(
      applyV03CityAction(state, { cityId: city.id, action: 'feast', officerIds }).error,
    ).toContain('ten-day period');
  });
});
