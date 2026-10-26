import { describe, expect, it } from 'vitest';
import {
  applyTroopLoss,
  createReservePools,
  mergeTroopPools,
  setReservePool,
  splitTroopPool,
  troopLevel,
} from '../../../src/v03/campaign/troop-experience';
import { recruitmentQuote } from '../../../src/v03/campaign/recruitment';
import { createV03Game } from '../../../src/v03/initial-state';
import { applyV03CityAction } from '../../../src/v03/governance/city-actions';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import { estimateCampaignSupply } from '../../../src/v03/calendar';
import type { V03GameState } from '../../../src/v03/types';

function fixture() {
  const state = createV03Game('cao', 91);
  const city = state.cities.find((c) => c.id === state.playerCapitalCityId)!;
  const officer = state.officers.find((o) => o.id === 'caocao')!;
  city.garrisonTroops += 800 - officer.troops;
  Object.assign(officer, { troops: 800, troopExperience: 1200 });
  city.reserve = 0;
  city.reservePools = createReservePools();
  city.gold = 10000;
  return { state, city, officer };
}

function assign(state: V03GameState, officerId: string, amount: number) {
  state.cities.find((c) => c.id === state.playerCapitalCityId)!.workPointsUsed = 0;
  const result = applyV03CityAction(state, {
    cityId: state.playerCapitalCityId,
    action: 'assign-troops',
    officerId,
    amount,
  });
  expect(result.ok, result.error).toBe(true);
  return result.state;
}

describe('soldier experience and typed reserves', () => {
  it.each(['divided-realm-190', 'guandu-200'])(
    'starts every soldier at level one in %s',
    (scenario) => {
      const state = createV03Game('cao', 1, scenario);
      expect(state.officers.every((o) => o.troopExperience === 0)).toBe(true);
      for (const city of state.cities) {
        expect(Object.values(city.reservePools).reduce((sum, p) => sum + p.troops, 0)).toBe(
          city.reserve,
        );
        expect(Object.values(city.reservePools).every((p) => p.troopExperience === 0)).toBe(true);
      }
      expect(validateV03State(state)).toBe(true);
    },
  );

  it('derives levels from unrounded mean experience and enforces the 1–20 bounds', () => {
    expect([0, 99.99, 100, 999.99, 1000, 1200, 1900].map(troopLevel)).toEqual([
      1, 1, 2, 10, 11, 13, 20,
    ]);
    for (const bad of [-1, 1901, NaN, Infinity]) expect(() => troopLevel(bad)).toThrow(RangeError);
    expect(() => splitTroopPool({ troops: 10, troopExperience: 500 }, 11)).toThrow(RangeError);
  });

  it.each([
    [100, 11],
    [200, 10],
    [400, 9],
  ])('averages 800 veterans with %i new recruits into level %i', (recruits, level) => {
    const { state, city, officer } = fixture();
    setReservePool(city, officer.troopType, { troops: recruits!, troopExperience: 0 });
    const personal = { experience: officer.experience, level: officer.level, force: officer.force };
    const next = assign(state, officer.id, 800 + recruits!);
    const after = next.officers.find((o) => o.id === officer.id)!;
    expect(after.troopExperience).toBeCloseTo((800 * 1200) / (800 + recruits!), 10);
    expect(troopLevel(after.troopExperience)).toBe(level);
    expect(after).toMatchObject(personal);
    expect(next.cities.find((c) => c.id === city.id)!.reservePools[officer.troopType]).toEqual({
      troops: 0,
      troopExperience: 0,
    });
    expect(officer.troopExperience).toBe(1200);
    expect(decodeV03Save(encodeV03Save(next))).toEqual(next);
  });

  it('splits veterans through their same-type reserve and transfers experience to another commander', () => {
    const { state, city, officer } = fixture();
    const recipient = state.officers.find((o) => o.id === 'xiahoudun')!;
    expect(recipient.troopType).toBe(officer.troopType);
    const originalRecipient = recipient.troops;
    let next = assign(state, officer.id, 500);
    const remaining = next.officers.find((o) => o.id === officer.id)!;
    expect(remaining).toMatchObject({ troops: 500, troopExperience: 1200 });
    expect(next.cities.find((c) => c.id === city.id)!.reservePools[officer.troopType]).toEqual({
      troops: 300,
      troopExperience: 1200,
    });
    next = assign(next, recipient.id, originalRecipient + 300);
    expect(next.officers.find((o) => o.id === recipient.id)!.troopExperience).toBeCloseTo(
      360000 / (originalRecipient + 300),
    );
    expect(next.officers.find((o) => o.id === officer.id)!.troopExperience).toBe(1200);
    next = assign(next, officer.id, 0);
    expect(next.officers.find((o) => o.id === officer.id)).toMatchObject({
      troops: 0,
      troopExperience: 0,
    });
    next = assign(next, officer.id, 500);
    expect(next.officers.find((o) => o.id === officer.id)).toMatchObject({
      troops: 500,
      troopExperience: 1200,
    });
    expect(validateV03State(next)).toBe(true);
  });

  it('never converts infantry reserves to cavalry, and rejects the order atomically', () => {
    const { state, city, officer } = fixture();
    setReservePool(city, 'infantry', { troops: 1000, troopExperience: 1900 });
    const before = structuredClone(state);
    const result = applyV03CityAction(state, {
      cityId: city.id,
      action: 'assign-troops',
      officerId: officer.id,
      amount: 900,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('this troop type');
    expect(result.state).toEqual(before);
  });

  it('retains experience across repeated splits and resets only an annihilated force', () => {
    const original = mergeTroopPools(
      { troops: 800, troopExperience: 1200 },
      { troops: 100, troopExperience: 0 },
    );
    let pool = original;
    for (let i = 0; i < 100; i++) {
      const { remaining, taken } = splitTroopPool(pool, 137);
      pool = mergeTroopPools(remaining, taken);
    }
    expect(pool.troopExperience).toBeCloseTo(original.troopExperience, 9);
    applyTroopLoss(pool, 1);
    expect(pool.troopExperience).toBeCloseTo(original.troopExperience, 9);
    applyTroopLoss(pool, 0);
    expect(pool).toEqual({ troops: 0, troopExperience: 0 });
    expect(mergeTroopPools(pool, { troops: 500, troopExperience: 0 }).troopExperience).toBe(0);
  });

  it('recruitment dilutes only the selected reserve pool and pays the quoted cost', () => {
    const { state, city, officer } = fixture();
    setReservePool(city, 'archer', { troops: 200, troopExperience: 1300 });
    setReservePool(city, 'cavalry', { troops: 300, troopExperience: 1000 });
    const quote = recruitmentQuote(city, officer.force, 'cavalry');
    const before = structuredClone(state);
    const result = applyV03CityAction(state, {
      cityId: city.id,
      action: 'recruit',
      officerId: officer.id,
      troopType: 'cavalry',
    });
    expect(result.ok, result.error).toBe(true);
    const after = result.state.cities.find((c) => c.id === city.id)!;
    expect(after.gold).toBe(city.gold - quote.gold);
    expect(after.population).toBe(city.population - quote.troops);
    expect(after.reservePools.archer).toEqual(city.reservePools.archer);
    expect(after.reservePools.cavalry.troopExperience).toBeCloseTo(300000 / (300 + quote.troops));
    expect(after.reserve).toBe(500 + quote.troops);
    expect(state).toEqual(before);
    expect(validateV03State(result.state)).toBe(true);
    city.gold = quote.gold - 1;
    expect(
      applyV03CityAction(state, {
        cityId: city.id,
        action: 'recruit',
        officerId: officer.id,
        troopType: 'cavalry',
      }).ok,
    ).toBe(false);
  });

  it('prices troop types and northern, central, southern cavalry distinctly', () => {
    const city = { id: 'beiping', population: 10000 };
    expect(recruitmentQuote(city, 80, 'infantry')).toMatchObject({ troops: 700, gold: 200 });
    expect(recruitmentQuote(city, 80, 'archer')).toMatchObject({ troops: 525, gold: 350 });
    expect(recruitmentQuote(city, 80, 'cavalry')).toMatchObject({ troops: 420, gold: 400 });
    expect(recruitmentQuote({ ...city, id: 'chenliu' }, 80, 'cavalry')).toMatchObject({
      troops: 245,
      gold: 600,
    });
    expect(recruitmentQuote({ ...city, id: 'jianye' }, 80, 'cavalry')).toMatchObject({
      troops: 140,
      gold: 800,
    });
    expect(recruitmentQuote({ ...city, population: 1010 }, 80, 'cavalry').troops).toBe(10);
  });

  it('charges twice the provisions for cavalry and weights mixed-army estimates', () => {
    const trip = { troopCount: 1000, outboundDays: 10, battleDays: 30, returnDays: 10 };
    const infantry = estimateCampaignSupply(trip).totalFood;
    expect(estimateCampaignSupply({ ...trip, cavalryTroops: 1000 }).totalFood).toBe(infantry * 2);
    expect(estimateCampaignSupply({ ...trip, cavalryTroops: 500 }).totalFood).toBe(infantry * 1.5);
  });

  it('rejects invalid, missing and inconsistent experience data instead of migrating it', () => {
    const { state, city, officer } = fixture();
    expect(validateV03State(state)).toBe(true);
    const missing = structuredClone(state) as unknown as { officers: Record<string, unknown>[] };
    delete missing.officers[0]!.troopExperience;
    expect(validateV03State(missing)).toBe(false);
    officer.troopExperience = 1901;
    expect(validateV03State(state)).toBe(false);
    officer.troopExperience = 0;
    city.reservePools.infantry.troops = 1;
    expect(validateV03State(state)).toBe(false);
    city.reserve = 1;
    expect(validateV03State(state)).toBe(true);
    city.reservePools.cavalry.troopExperience = 100;
    expect(validateV03State(state)).toBe(false);
  });
});
