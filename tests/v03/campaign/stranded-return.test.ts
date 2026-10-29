import { describe, expect, it } from 'vitest';
import { executeV03Command } from '../../../src/v03/commands';
import { reconcileV03Rulers } from '../../../src/v03/engine';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import { surrenderStrandedReturn } from '../../../src/v03/campaign/stranded-return';
import { decodeV03Save, encodeV03Save } from '../../../src/v03/platform/storage';
import type { V03BattleState } from '../../../src/v03/types';
import { formatEvent } from '../../../src/v03/i18n/events';
import { strandedReturnFixture as fixture } from '../helpers/stranded-return-fixture';

describe('stranded return surrender', () => {
  it('captures actual healthy/wounded contingents and remaining cargo exactly once', () => {
    const { state, journey, target, officer } = fixture();
    const before = structuredClone(officer);
    const stock = { gold: target.gold, food: target.food, garrison: target.garrisonTroops };
    const rng = state.rng;
    expect(surrenderStrandedReturn(state, journey, target)).toBe(true);
    expect(officer).toMatchObject({
      troops: before.troops,
      wounded: before.wounded,
      troopExperience: before.troopExperience,
      troopType: before.troopType,
      factionId: 'cao',
      location: { kind: 'captured', cityId: target.id },
    });
    expect(target.gold).toBe(stock.gold + 157);
    expect(target.food).toBe(stock.food + 1233);
    expect(target.garrisonTroops).toBe(stock.garrison);
    expect(state.rng).toBe(rng);
    const settled = structuredClone(state);
    expect(surrenderStrandedReturn(state, journey, target)).toBe(false);
    expect(state).toEqual(settled);
    const reconciled = reconcileV03Rulers(state);
    expect(reconciled.factions.find((f) => f.id === 'cao')!.eliminated).toBe(true);
    expect(decodeV03Save(encodeV03Save(reconciled))).toEqual(reconciled);
  });

  it.each(['cao', 'yuan'])(
    'resolves through the real day boundary with reload parity (%s player)',
    (player) => {
      const { state } = fixture(player);
      const input = structuredClone(state);
      const resumed = decodeV03Save(encodeV03Save(state));
      const first = executeV03Command(state, { type: 'advance', days: 1 });
      const loaded = executeV03Command(resumed, { type: 'advance', days: 1 });
      expect(first.ok, first.error).toBe(true);
      expect(loaded.state).toEqual(first.state);
      expect(state).toEqual(input);
      expect(first.state.officers.find((o) => o.id === 'caocao')!.location).toEqual({
        kind: 'captured',
        cityId: 'xuchang',
      });
      expect(first.state.factions.find((f) => f.id === 'cao')!.eliminated).toBe(true);
      expect(first.state.phase).toBe(player === 'cao' ? 'finished' : 'planning');
      expect(first.state.events.filter((e) => e.code === 'journey.strandedSurrender')).toHaveLength(
        1,
      );
      expect(decodeV03Save(encodeV03Save(first.state))).toEqual(first.state);
    },
  );

  it('settles a newly arriving return and explains surrender in both languages', () => {
    const { state, journey } = fixture('cao');
    journey.status = 'returning';
    const last = journey.routeSnapshot.length - 1;
    journey.segmentProgressKm[last] = Math.max(0, journey.routeSnapshot[last]!.lengthKm - 1);
    const result = executeV03Command(state, { type: 'advance', days: 1 });
    expect(result.ok, result.error).toBe(true);
    const event = result.state.events.find((entry) => entry.code === 'journey.strandedSurrender')!;
    expect(event).toBeDefined();
    expect(formatEvent(event, result.state, 'en')?.detail).toContain(
      'no cities, active campaigns or battles',
    );
    expect(formatEvent(event, result.state, 'zh')?.detail).toContain('已无城池');
    expect(result.state.journeys.find((entry) => entry.id === journey.id)!.status).toBe(
      'cancelled',
    );
    expect(result.state.phase).toBe('finished');
    expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
  });

  it('closes a last-officer surrender at a monthly boundary with reload parity', () => {
    const { state, journey } = fixture('cao');
    state.absoluteDay = 29;
    journey.elapsedDays = 29;
    state.personnelDay = createPersonnelDay(state);
    const resumed = decodeV03Save(encodeV03Save(state));
    const result = executeV03Command(state, { type: 'advance', days: 1 });
    expect(result.ok, result.error).toBe(true);
    expect(executeV03Command(resumed, { type: 'advance', days: 1 }).state).toEqual(result.state);
    expect(result.state.phase).toBe('finished');
    expect(result.state.dayResolution).toBeNull();
    expect(
      result.state.events.filter((event) => event.code === 'journey.strandedSurrender'),
    ).toHaveLength(1);
    expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
  });

  it.each(['cao', 'yuan'])(
    'waits for same-day recovery and restores a valid capital (%s player)',
    (player) => {
      const { state, journey, officer, target } = fixture(player);
      const rescuer = state.officers.find((entry) => entry.id === 'xiahoudun')!;
      const campaign = structuredClone(journey);
      campaign.id = 'recover-city';
      campaign.executionId = 'recover-city:execution';
      campaign.kind = 'campaign';
      campaign.status = 'outbound';
      campaign.manifest.officerIds = [rescuer.id];
      campaign.manifest.troopCount = rescuer.troops + rescuer.wounded;
      campaign.manifest.composition = { troopTypes: [rescuer.troopType] };
      const last = campaign.routeSnapshot.length - 1;
      campaign.segmentProgressKm[last] = campaign.routeSnapshot[last]!.lengthKm - 1;
      rescuer.location = { kind: 'journey', journeyId: campaign.id };
      state.journeys.push(campaign);
      state.directives.push({
        id: campaign.executionId,
        factionId: 'cao',
        sourceCityId: campaign.sourceCityId,
        targetCityId: campaign.destinationCityId,
        intent: 'conquer',
        requestedTroops: rescuer.troops,
        proposedTroops: rescuer.troops,
        requestedByDay: null,
        earliestDepartureDay: 0,
        estimatedArrivalDay: campaign.expectedArrivalDay,
        status: 'dispatched',
        journeyId: campaign.id,
        governanceRevision: state.governanceRevision,
        message: 'Recovery expedition already dispatched.',
        officerIds: [rescuer.id],
      });
      state.personnelDay = createPersonnelDay(state);
      const resumed = decodeV03Save(encodeV03Save(state));
      const result = executeV03Command(state, { type: 'advance', days: 1 });
      expect(result.ok, result.error).toBe(true);
      expect(result.state.events.filter((e) => e.code === 'journey.strandedSurrender')).toEqual([]);
      expect(result.state.officers.find((o) => o.id === officer.id)!.location.kind).not.toBe(
        'captured',
      );
      expect(result.state.cities.find((city) => city.id === target.id)?.factionId).toBe('cao');
      expect(result.state.factions.find((faction) => faction.id === 'cao')?.capitalCityId).toBe(
        target.id,
      );
      if (player === 'cao') expect(result.state.playerCapitalCityId).toBe(target.id);
      expect(executeV03Command(resumed, { type: 'advance', days: 1 }).state).toEqual(result.state);
      expect(decodeV03Save(encodeV03Save(result.state))).toEqual(result.state);
    },
  );

  it('defers surrender during a third-party battle at the destination', () => {
    const { state, journey, target } = fixture();
    state.journeys.push({
      ...structuredClone(journey),
      id: 'besieger',
      kind: 'campaign',
      ownerFactionId: 'dong',
    });
    // Eligibility-only fixture: settlement must not change any contested-city resources.
    state.battles.push({
      active: true,
      attackerFactionId: 'dong',
      defenderFactionId: 'yuan',
      attackerJourneyId: 'besieger',
    } as V03BattleState);
    const before = structuredClone(state);
    expect(surrenderStrandedReturn(state, journey, target)).toBe(false);
    expect(state).toEqual(before);
    state.battles[0]!.active = false;
    expect(surrenderStrandedReturn(state, journey, target)).toBe(true);
  });

  it.each(['outbound', 'waiting', 'returning'] as const)(
    'waits while another campaign is %s',
    (status) => {
      const { state, journey, target } = fixture();
      state.journeys.push({
        ...structuredClone(journey),
        id: 'recover-city',
        kind: 'campaign',
        status,
      });
      const before = structuredClone(state);
      expect(surrenderStrandedReturn(state, journey, target)).toBe(false);
      expect(state).toEqual(before);
    },
  );

  it.each(['city', 'friendly', 'independent', 'allied', 'in-transit', 'not-return'] as const)(
    'does not surrender with %s protection',
    (protection) => {
      const { state, journey, target } = fixture();
      if (protection === 'city')
        state.cities.find((city) => city.id === 'chenliu')!.factionId = 'cao';
      if (protection === 'friendly') target.factionId = 'cao';
      if (protection === 'independent') target.factionId = null;
      if (protection === 'allied')
        state.alliances.push({ a: 'cao', b: 'yuan', expiresMonthIndex: 3 });
      if (protection === 'in-transit') journey.status = 'returning';
      if (protection === 'not-return') journey.kind = 'transfer';
      const before = structuredClone(state);
      expect(surrenderStrandedReturn(state, journey, target)).toBe(false);
      expect(state).toEqual(before);
    },
  );

  it.each(['attacker', 'defender'] as const)(
    'waits for a surviving %s battle to finish',
    (side) => {
      const { state, journey, target } = fixture();
      // Only faction/activity fields enter this eligibility check; no tactical turn is executed.
      const battle = {
        active: true,
        attackerFactionId: side === 'attacker' ? 'cao' : 'dong',
        defenderFactionId: side === 'defender' ? 'cao' : 'dong',
      } as V03BattleState;
      state.battles.push(battle);
      const before = structuredClone(state);
      expect(surrenderStrandedReturn(state, journey, target)).toBe(false);
      expect(state).toEqual(before);
      battle.active = false;
      expect(surrenderStrandedReturn(state, journey, target)).toBe(true);
    },
  );

  it('liberates the receiving house’s escorted prisoner without changing the contingent', () => {
    const { state, journey, target } = fixture();
    const prisoner = state.officers.find((officer) => officer.id === 'yuanshao')!;
    const home = state.cities.find(
      (city) => prisoner.location.kind === 'city' && city.id === prisoner.location.cityId,
    )!;
    home.garrisonTroops -= prisoner.troops;
    prisoner.location = {
      kind: 'captured',
      cityId: null,
      journeyId: journey.id,
      holderFactionId: 'cao',
    };
    prisoner.capturedRulerFactionId = 'yuan';
    const before = structuredClone(prisoner);
    const garrison = target.garrisonTroops;
    expect(surrenderStrandedReturn(state, journey, target)).toBe(true);
    expect(prisoner.location).toEqual({ kind: 'city', cityId: target.id });
    expect(prisoner.capturedRulerFactionId).toBeNull();
    expect(prisoner.troops).toBe(before.troops);
    expect(prisoner.wounded).toBe(before.wounded);
    expect(prisoner.troopExperience).toBe(before.troopExperience);
    expect(target.garrisonTroops).toBe(garrison + before.troops);
    const reconciled = reconcileV03Rulers(state);
    expect(decodeV03Save(encodeV03Save(reconciled))).toEqual(reconciled);
  });

  it('retains seized cargo outside a full warehouse without preventing capture', () => {
    const { state, journey, target } = fixture();
    target.gold = 9_999_999 - 7;
    target.food = 9_999_999 - 13;
    expect(surrenderStrandedReturn(state, journey, target)).toBe(true);
    expect(target.gold).toBe(9_999_999);
    expect(target.food).toBe(9_999_999);
    const prize = state.journeys.find((entry) => entry.id !== journey.id)!;
    expect(prize).toMatchObject({
      status: 'waiting',
      ownerFactionId: 'yuan',
      destinationCityId: target.id,
      manifest: {
        officerIds: [],
        troopCount: 0,
        carriedFood: 0,
        cargo: { gold: 150, food: 1220, troops: 0 },
      },
    });
    let current = reconcileV03Rulers(state);
    current.events.forEach((event) => {
      event.acknowledged = true;
    });
    expect(decodeV03Save(encodeV03Save(current))).toEqual(current);
    current.cities.find((city) => city.id === target.id)!.gold -= 150;
    current.cities.find((city) => city.id === target.id)!.food -= 1220;
    current = executeV03Command(current, { type: 'advance', days: 1 }).state;
    expect(current.journeys.find((entry) => entry.id === prize.id)!.status).toBe('delivered');
    expect(current.cities.find((city) => city.id === target.id)!.gold).toBe(9_999_999);
    expect(current.cities.find((city) => city.id === target.id)!.food).toBe(9_999_999);
    expect(decodeV03Save(encodeV03Save(current))).toEqual(current);
  });
});
