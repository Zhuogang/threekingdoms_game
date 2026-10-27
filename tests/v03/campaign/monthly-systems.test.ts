import { createReservePools } from '../../../src/v03/campaign/troop-experience';
import { describe, expect, it } from 'vitest';
import {
  V03_ALLIANCE_DURATION_MONTHS,
  V03_HEGEMON_HOLD_MONTHS,
  V03_HEGEMON_CITIES,
  acceptV03CoalitionInvitation,
  advanceV03Hegemon,
  createV03Alliance,
  expireV03Alliances,
  getV03AttackAllianceBlock,
  isV03AllianceActive,
  resolveV03MonthlyEvents,
  type V03MonthlyEventCity,
  type V03MonthlyEventOfficer,
  type V03MonthlyEventsInput,
} from '../../../src/v03/campaign/monthly-systems';

function city(overrides: Partial<V03MonthlyEventCity> = {}): V03MonthlyEventCity {
  return {
    id: 'city',
    factionId: 'player',
    population: 10_000,
    farming: 60,
    commerce: 80,
    loyalty: 70,
    gold: 1_000,
    food: 5_000,
    reserve: 0,
    garrisonTroops: 0,
    neighbors: [],
    ...overrides,
    reservePools: overrides.reservePools ?? createReservePools(overrides.reserve ?? 0),
  };
}

function officer(overrides: Partial<V03MonthlyEventOfficer> = {}): V03MonthlyEventOfficer {
  return {
    id: 'officer',
    factionId: 'player',
    location: { kind: 'city', cityId: 'city' },
    force: 50,
    intellect: 50,
    loyalty: 70,
    age: 30,
    troops: 500,
    wounded: 0,
    reorganizationDays: 0,
    alive: true,
    ...overrides,
  };
}

function monthlyInput(overrides: Partial<V03MonthlyEventsInput> = {}): V03MonthlyEventsInput {
  return {
    monthIndex: 0,
    startYear: 190,
    playerFactionId: 'player',
    rng: 190,
    firedEventIds: [],
    alliances: [],
    cities: [city()],
    officers: [officer()],
    ...overrides,
  };
}

describe('v0.3 retained diplomacy rules', () => {
  it('creates six-month treaties, blocks attacks in either direction, and expires at the exclusive end month', () => {
    const created = createV03Alliance([], 'wei', 'shu', 8, ['wei', 'shu']);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(created.alliance.expiresMonthIndex).toBe(8 + V03_ALLIANCE_DURATION_MONTHS);
    expect(isV03AllianceActive(created.alliances, 'shu', 'wei', 13)).toBe(true);
    expect(getV03AttackAllianceBlock(created.alliances, 'wei', 'shu', 13)).toEqual(
      created.alliance,
    );
    expect(getV03AttackAllianceBlock(created.alliances, 'shu', 'wei', 14)).toBeNull();
    expect(isV03AllianceActive(created.alliances, 'wei', 'shu', 14)).toBe(false);
    expect(createV03Alliance(created.alliances, 'shu', 'wei', 13).ok).toBe(false);
    expect(createV03Alliance([], 'wei', 'wei', 13)).toEqual({ ok: false, reason: 'same-faction' });
    expect(expireV03Alliances(created.alliances, 14)).toEqual({
      active: [],
      expired: [created.alliance],
    });
  });

  it('uses the legacy Luoyang, sixteen-city, twelve-consecutive-month Hegemon threshold', () => {
    const owners = Array.from({ length: V03_HEGEMON_CITIES }, (_, index) => ({
      id: index === 0 ? 'luoyang' : `city-${index}`,
      factionId: 'wei',
    }));
    expect(
      advanceV03Hegemon({
        cityOwners: owners.slice(0, V03_HEGEMON_CITIES - 1),
        previousFactionId: 'wei',
        previousMonths: 11,
        playerFactionId: 'player',
      }).months,
    ).toBe(0);

    const start = advanceV03Hegemon({
      cityOwners: owners,
      previousFactionId: null,
      previousMonths: 0,
      playerFactionId: 'player',
    });
    expect(start).toMatchObject({
      factionId: 'wei',
      months: 1,
      monthsLeft: 11,
      rivalWarning: 'claim-started',
    });

    const near = advanceV03Hegemon({
      cityOwners: owners,
      previousFactionId: 'wei',
      previousMonths: 8,
      playerFactionId: 'player',
    });
    expect(near).toMatchObject({ months: 9, monthsLeft: 3, rivalWarning: 'three-months-left' });

    const win = advanceV03Hegemon({
      cityOwners: owners,
      previousFactionId: 'wei',
      previousMonths: V03_HEGEMON_HOLD_MONTHS - 1,
      playerFactionId: 'player',
    });
    expect(win).toMatchObject({ months: 12, winnerFactionId: 'wei', declared: true });
    expect(
      advanceV03Hegemon({
        cityOwners: owners,
        previousFactionId: 'wei',
        previousMonths: 11,
        playerFactionId: 'player',
        alreadyFinished: true,
      }).winnerFactionId,
    ).toBeNull();
  });
});

describe('v0.3 monthly event resolver', () => {
  it('is deterministic, returns copied state, and uses the saved random stream', () => {
    const input = monthlyInput({ rng: 1, monthIndex: 6 });
    const first = resolveV03MonthlyEvents(input);
    const second = resolveV03MonthlyEvents(input);
    expect(first).toEqual(second);
    expect(first.rng).not.toBe(input.rng);
    expect(input.cities[0]?.farming).toBe(60);
    expect(input.officers[0]?.age).toBe(30);
  });

  it('forms the legacy anti-Dong coalition once and gives member treaties six months', () => {
    const result = resolveV03MonthlyEvents(
      monthlyInput({
        monthIndex: 0,
        cities: [
          city({ id: 'luoyang', factionId: 'dong' }),
          city({ id: 'dong-city', factionId: 'dong' }),
          city({ id: 'player-city', factionId: 'player' }),
          city({ id: 'wei-city', factionId: 'wei' }),
          city({ id: 'shu-city', factionId: 'shu' }),
        ],
        officers: [],
      }),
    );
    expect(result.firedEventIds).toContain('anti-dong-coalition');
    expect(result.events.some((event) => event.key === 'anti-dong-coalition')).toBe(true);
    expect(result.alliances).toContainEqual({
      a: 'shu',
      b: 'wei',
      expiresMonthIndex: V03_ALLIANCE_DURATION_MONTHS,
    });
    expect(result.alliances.some((entry) => entry.a === 'player' || entry.b === 'player')).toBe(
      false,
    );
    const invitation = result.invitations[0]!;
    expect(invitation).toMatchObject({
      targetFactionId: 'dong',
      memberFactionIds: ['shu', 'wei'],
      expiresMonthIndex: 3,
    });
    const accepted = acceptV03CoalitionInvitation(invitation, result.alliances, 'player', 0, [
      'player',
      'wei',
    ]);
    expect(accepted).toContainEqual({ a: 'player', b: 'wei', expiresMonthIndex: 6 });
    expect(accepted.some((entry) => entry.a === 'player' && entry.b === 'shu')).toBe(false);
    expect(acceptV03CoalitionInvitation(invitation, [], 'player', 3)).toEqual([]);
    expect(
      resolveV03MonthlyEvents({ ...monthlyInput(), firedEventIds: result.firedEventIds })
        .firedEventIds,
    ).toEqual(result.firedEventIds);
  });

  it('evacuates Dong officers and reserve from threatened Luoyang into Chang’an without a siege', () => {
    const luoyang = city({
      id: 'luoyang',
      factionId: 'dong',
      population: 10_000,
      farming: 60,
      commerce: 80,
      loyalty: 80,
      reserve: 700,
      reservePools: {
        infantry: { troops: 400, troopExperience: 1200 },
        archer: { troops: 200, troopExperience: 900 },
        cavalry: { troops: 100, troopExperience: 1600 },
      },
      garrisonTroops: 500,
    });
    const changan = city({ id: 'changan', factionId: 'dong', reserve: 100, garrisonTroops: 100 });
    const stationed = officer({
      id: 'dong-general',
      factionId: 'dong',
      location: { kind: 'city', cityId: 'luoyang' },
      force: 70,
      intellect: 80,
    });
    const input = monthlyInput({
      startYear: 192,
      cities: [luoyang, changan],
      officers: [stationed],
      attackedWithinLastTwoMonths: ['luoyang'],
    });
    const result = resolveV03MonthlyEvents(input);
    const evacuated = result.events.find((event) => event.key === 'dong-burns-luoyang');
    expect(evacuated?.values).toMatchObject({
      evacuatedOfficerCount: 1,
      evacuatedTroops: 500,
      transferredReserve: 700,
      lootGold: 420,
      lootFood: 990,
    });
    expect(result.officers[0]?.location).toEqual({ kind: 'city', cityId: 'changan' });
    expect(result.cities[0]).toMatchObject({
      population: 9_200,
      farming: 30,
      commerce: 40,
      loyalty: 40,
      reserve: 0,
      reservePools: createReservePools(0),
      garrisonTroops: 0,
    });
    expect(result.cities[1]).toMatchObject({
      reserve: 800,
      reservePools: {
        infantry: { troops: 500, troopExperience: 960 },
        archer: { troops: 200, troopExperience: 900 },
        cavalry: { troops: 100, troopExperience: 1600 },
      },
      garrisonTroops: 600,
      gold: 1_420,
      food: 5_990,
    });
    expect(result.firedEventIds).toContain('dong-burns-luoyang');
    expect(result.events.every((event) => !event.key.includes('siege'))).toBe(true);
  });

  it('adapts drought to the v0.3 0–100 farming scale and exposes the remaining legacy event effects', () => {
    const keys = new Set<string>();
    let drought: ReturnType<typeof resolveV03MonthlyEvents> | undefined;
    for (let seed = 1; seed <= 1_000; seed++) {
      const result = resolveV03MonthlyEvents(
        monthlyInput({
          monthIndex: 6,
          startYear: 190,
          rng: seed,
          cities: [
            city({ id: 'luoyang', factionId: 'dong', neighbors: [] }),
            city({ id: 'changan', factionId: 'dong' }),
            city({ id: 'owned', factionId: 'player', farming: 50 }),
          ],
          officers: [
            officer({
              id: 'free',
              factionId: null,
              location: { kind: 'city', cityId: 'owned' },
              age: 18,
            }),
            officer({ id: 'scholar', intellect: 20 }),
          ],
        }),
      );
      for (const event of result.events) keys.add(event.key);
      if (result.events.some((event) => event.key === 'drought')) drought = result;
    }
    const droughtEvent = drought?.events.find((event) => event.key === 'drought');
    expect(droughtEvent).toBeDefined();
    const droughtCityId = droughtEvent?.entityIds[0];
    const droughtCity = drought?.cities.find((entry) => entry.id === droughtCityId);
    expect(droughtCity?.farming).toBe(droughtCityId === 'owned' ? 35 : 45);
    expect([...keys]).toEqual(
      expect.arrayContaining([
        'plague',
        'locusts',
        'bandits',
        'wandering-officer',
        'drought',
        'scholar',
      ]),
    );
  });

  it('increments ages in January and gives each age-18 officer the legacy stat increase', () => {
    const result = resolveV03MonthlyEvents(
      monthlyInput({
        monthIndex: 12,
        officers: [officer({ age: 17, force: 90, intellect: 99 })],
      }),
    );
    expect(result.officers[0]).toMatchObject({ age: 18, force: 93, intellect: 100 });
    expect(result.events).toContainEqual(
      expect.objectContaining({ key: 'come-of-age', entityIds: ['officer'] }),
    );
  });

  it('freezes dead and unknown ages, and skips a year whose growth checkpoint already committed', () => {
    const input = monthlyInput({
      monthIndex: 12,
      officers: [
        officer({ id: 'dead', alive: false, age: 17 }),
        officer({ id: 'unknown', age: null }),
        officer({ id: 'young', age: 17 }),
      ],
    });
    const first = resolveV03MonthlyEvents(input);
    expect(first.officers.find((officer) => officer.id === 'dead')!.age).toBe(17);
    expect(first.officers.find((officer) => officer.id === 'unknown')!.age).toBe(null);
    expect(first.officers.find((officer) => officer.id === 'young')!.age).toBe(18);
    const repeated = resolveV03MonthlyEvents({
      ...input,
      officers: first.officers,
      lastOfficerGrowthYear: 191,
    });
    expect(repeated.officers.find((officer) => officer.id === 'young')!.age).toBe(18);
    expect(repeated.events.filter((event) => event.key === 'come-of-age')).toHaveLength(0);
  });

  it('retains force above 100 from fine arms and never lowers an already capped trained value', () => {
    const result = resolveV03MonthlyEvents(
      monthlyInput({
        monthIndex: 12,
        officers: [
          officer({ id: 'equipped', age: 17, force: 101, intellect: 97, equipment: 'Fine arms' }),
          officer({ id: 'capped', age: 17, force: 105, intellect: 100, equipment: 'Fine arms' }),
        ],
      }),
    );
    expect(result.officers.find((officer) => officer.id === 'equipped')).toMatchObject({
      age: 18,
      force: 104,
      intellect: 99,
      equipment: 'Fine arms',
    });
    expect(result.officers.find((officer) => officer.id === 'capped')).toMatchObject({
      age: 18,
      force: 105,
      intellect: 100,
      equipment: 'Fine arms',
    });
  });
});
