import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import {
  capturedRulerFaction,
  decidePrisoner,
  resolveAiPrisoners,
  resolveSuccessions,
} from '../../../src/v03/campaign/prisoners';
import { decodeV03Save, encodeV03Save, validateV03State } from '../../../src/v03/platform/storage';
import { formatEvent } from '../../../src/v03/i18n/events';
import { advanceV03, reconcileV03Rulers } from '../../../src/v03/engine';
import { reviewBattleState } from '../../e2e-v03/playability-fixtures';
import type { V03GameState, V03Officer } from '../../../src/v03/types';

const officerAt = (state: V03GameState, id: string) =>
  state.officers.find((officer) => officer.id === id)!;
const reload = (state: V03GameState) => decodeV03Save(encodeV03Save(state));
function capture(state: V03GameState, officer: V03Officer, cityId: string) {
  if (officer.location.kind === 'city') {
    const city = state.cities.find(
      (entry) => officer.location.kind === 'city' && entry.id === officer.location.cityId,
    )!;
    city.garrisonTroops -= officer.reorganizationDays ? 0 : officer.troops;
  }
  if (officer.governorOfCityId) {
    const city = state.cities.find((entry) => entry.id === officer.governorOfCityId)!;
    city.governorId = null;
    city.governanceMode = 'steward';
    officer.governorOfCityId = null;
  }
  officer.location = { kind: 'captured', cityId };
}
function fixture(holderId = 'cao', rulerId = 'dongzhuo') {
  const state = createV03Game('cao', 1);
  const ruler = officerAt(state, rulerId);
  const oldFactionId = ruler.factionId!;
  const cityId = state.factions.find((faction) => faction.id === holderId)!.capitalCityId;
  capture(state, ruler, cityId);
  Object.assign(ruler, { loyalty: 10, wounded: 40, troopExperience: 1200 });
  const peer = state.officers.find(
    (entry) => entry.alive && entry.factionId === oldFactionId && entry.id !== ruler.id,
  )!;
  peer.loyalty = 3;
  state.cities.find((entry) => entry.factionId === oldFactionId)!.loyalty = 6;
  state.personnelDay = createPersonnelDay(state);
  state.rng = 1; // Recruitment roll 48 succeeds at 90%, and fails at 5%.
  const beforeCaptureSettlement = structuredClone(state);
  resolveSuccessions(state);
  expect(validateV03State(state)).toBe(true);
  return { state, ruler, holderId, oldFactionId, beforeCaptureSettlement };
}
function expectMoraleUnchanged(before: V03GameState, after: V03GameState) {
  expect(after.officers.map((officer) => [officer.id, officer.loyalty])).toEqual(
    before.officers.map((officer) => [officer.id, officer.loyalty]),
  );
  expect(after.cities.map((city) => [city.id, city.loyalty])).toEqual(
    before.cities.map((city) => [city.id, city.loyalty]),
  );
}
function expectShock(
  before: V03GameState,
  after: V03GameState,
  rulerId: string,
  oldFactionId: string,
) {
  for (const officer of before.officers) {
    const expected =
      officer.id === rulerId
        ? 60
        : officer.alive && officer.factionId === oldFactionId
          ? Math.max(0, officer.loyalty - 10)
          : officer.loyalty;
    expect(officerAt(after, officer.id).loyalty, officer.id).toBe(expected);
  }
  for (const city of before.cities)
    expect(after.cities.find((entry) => entry.id === city.id)!.loyalty, city.id).toBe(
      city.factionId === oldFactionId ? Math.max(0, city.loyalty - 10) : city.loyalty,
    );
}

describe('captured rulers and faction morale', () => {
  it('keeps immediate succession at capture, without changing officer or city loyalty', () => {
    const { state, ruler, oldFactionId, beforeCaptureSettlement } = fixture();
    expect(state.factions.find((faction) => faction.id === oldFactionId)!.leaderOfficerId).not.toBe(
      ruler.id,
    );
    expect(ruler.capturedRulerFactionId).toBe(oldFactionId);
    expectMoraleUnchanged(beforeCaptureSettlement, state);
    expect(reload(state)).toEqual(state);
  });

  it('applies a clamped ten-point loss only after a ruler joins, preserving the existing successor and army', () => {
    const { state, ruler, holderId, oldFactionId } = fixture();
    const before = structuredClone(state);
    const successor = state.factions.find(
      (faction) => faction.id === oldFactionId,
    )!.leaderOfficerId;
    const result = decidePrisoner(reload(state), holderId, ruler.id, 'recruit');
    expect(result.ok, result.error).toBe(true);
    expectShock(before, result.state, ruler.id, oldFactionId);
    expect(
      result.state.factions.find((faction) => faction.id === oldFactionId)!.leaderOfficerId,
    ).toBe(successor);
    expect(officerAt(result.state, ruler.id)).toMatchObject({
      factionId: holderId,
      troops: ruler.troops,
      wounded: 40,
      troopExperience: 1200,
      reorganizationDays: 10,
      capturedRulerFactionId: null,
    });
    expect(result.state.events.filter((event) => event.code === 'ruler.succession')).toHaveLength(
      1,
    );
    expect(result.state.events.at(-1)?.params).toMatchObject({
      rulerDefection: true,
      formerFactionId: oldFactionId,
      officerLoyaltyLoss: 10,
      cityLoyaltyLoss: 10,
    });
    for (const locale of ['zh', 'en'] as const)
      expect(formatEvent(result.state.events.at(-1)!, result.state, locale)!.detail).toContain(
        '10',
      );
    expect(reload(result.state)).toEqual(result.state);
    expect(decidePrisoner(result.state, holderId, ruler.id, 'recruit').ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('leaves dead retainers untouched by a defection', () => {
    const { state, ruler, holderId, oldFactionId } = fixture();
    const current = state.factions.find((faction) => faction.id === oldFactionId)!.leaderOfficerId;
    const dead = state.officers.find(
      (officer) =>
        officer.factionId === oldFactionId && officer.id !== ruler.id && officer.id !== current,
    )!;
    capture(state, dead, 'chenliu');
    Object.assign(dead, {
      alive: false,
      troops: 0,
      wounded: 0,
      troopExperience: 0,
      reorganizationDays: 0,
      loyalty: 17,
    });
    state.personnelDay = createPersonnelDay(state);
    const result = decidePrisoner(state, holderId, ruler.id, 'recruit');
    expect(result.ok).toBe(true);
    expect(officerAt(result.state, dead.id).loyalty).toBe(17);
    expect(reload(result.state)).toEqual(result.state);
  });

  it('does not lower morale after refusal, and still permits execution without a loss', () => {
    const { state, ruler, holderId } = fixture();
    ruler.loyalty = 100;
    const refused = decidePrisoner(state, holderId, ruler.id, 'recruit');
    expect(refused.ok).toBe(true);
    expect(refused.state.events.at(-1)?.params?.accepted).toBe(false);
    expectMoraleUnchanged(state, refused.state);
    expect(decidePrisoner(refused.state, holderId, ruler.id, 'recruit').ok).toBe(false);
    const executed = decidePrisoner(reload(refused.state), holderId, ruler.id, 'execute');
    expect(executed.ok).toBe(true);
    expectMoraleUnchanged(state, executed.state);
    expect(officerAt(executed.state, ruler.id)).toMatchObject({
      alive: false,
      capturedRulerFactionId: null,
    });
    expect(reload(executed.state)).toEqual(executed.state);
  });

  it('keeps all loyalty unchanged when a captured ruler is executed directly', () => {
    const { state, ruler, holderId, oldFactionId } = fixture();
    const successor = state.factions.find(
      (faction) => faction.id === oldFactionId,
    )!.leaderOfficerId;
    const result = decidePrisoner(state, holderId, ruler.id, 'execute');
    expect(result.ok).toBe(true);
    expectMoraleUnchanged(state, result.state);
    expect(
      result.state.factions.find((faction) => faction.id === oldFactionId)!.leaderOfficerId,
    ).toBe(successor);
    expect(result.state.events.at(-1)?.params?.rulerDefection).toBeUndefined();
    expect(reload(result.state)).toEqual(result.state);
  });

  it('does not apply the ruler penalty to an ordinary officer', () => {
    const state = createV03Game('cao', 1);
    const ordinary = state.officers.find(
      (officer) => officer.alive && officer.factionId === 'dong' && officer.id !== 'dongzhuo',
    )!;
    capture(state, ordinary, 'chenliu');
    ordinary.loyalty = 10;
    state.rng = 1;
    state.personnelDay = createPersonnelDay(state);
    expect(capturedRulerFaction(state, ordinary)).toBeNull();
    const result = decidePrisoner(state, 'cao', ordinary.id, 'recruit');
    expect(result.ok).toBe(true);
    for (const officer of state.officers.filter((entry) => entry.id !== ordinary.id))
      expect(officerAt(result.state, officer.id).loyalty).toBe(officer.loyalty);
    expect(result.state.cities).toEqual(state.cities);
    expect(result.state.events.at(-1)?.params?.rulerDefection).toBeUndefined();
    expect(reload(result.state)).toEqual(result.state);
  });

  it('clears this captivity identity on release and does not mistake a recaptured former ruler for the current ruler', () => {
    const { state, ruler, holderId } = fixture();
    const released = decidePrisoner(state, holderId, ruler.id, 'release');
    expect(released.ok).toBe(true);
    expectMoraleUnchanged(state, released.state);
    const next = released.state;
    const returned = officerAt(next, ruler.id);
    expect(returned.capturedRulerFactionId).toBeNull();
    for (const journey of next.journeys)
      if (journey.manifest.officerIds.includes(ruler.id)) journey.status = 'cancelled';
    returned.location = { kind: 'captured', cityId: 'chenliu' };
    expect(capturedRulerFaction(next, returned)).toBeNull();
    const result = decidePrisoner(reload(next), holderId, ruler.id, 'recruit');
    expect(result.ok).toBe(true);
    for (const officer of next.officers.filter((entry) => entry.id !== ruler.id))
      expect(officerAt(result.state, officer.id).loyalty).toBe(officer.loyalty);
    expect(result.state.events.at(-1)?.params?.rulerDefection).toBeUndefined();
  });

  it('backfills an older captured-ruler save before removing acknowledged succession history', () => {
    const { state, ruler, holderId, oldFactionId } = fixture();
    delete ruler.capturedRulerFactionId;
    state.events.forEach((event) => (event.acknowledged = true));
    for (let i = 0; i < 2000; i++)
      state.events.push({
        id: `old-ruler-history-${i}`,
        absoluteDay: state.absoluteDay,
        kind: 'campaignEvent',
        title: 'History',
        detail: '',
        entityId: null,
        acknowledged: true,
      });
    const next = reload(state);
    expect(next.events.some((event) => event.code === 'ruler.succession')).toBe(false);
    expect(officerAt(next, ruler.id).capturedRulerFactionId).toBe(oldFactionId);
    expect(ruler.capturedRulerFactionId).toBeUndefined();
    const result = decidePrisoner(next, holderId, ruler.id, 'recruit');
    expect(result.ok).toBe(true);
    expectShock(next, result.state, ruler.id, oldFactionId);
  });

  it('applies the same rule when the AI recruits the captured player ruler', () => {
    const { state, ruler, oldFactionId } = fixture('liu', 'caocao');
    const next = resolveAiPrisoners(state);
    expect(officerAt(next, ruler.id).factionId).toBe('liu');
    expectShock(state, next, ruler.id, oldFactionId);
    expect(reload(next)).toEqual(next);
  });

  it('rejects forged captured-ruler identities', () => {
    const { state, ruler } = fixture();
    ruler.capturedRulerFactionId = 'missing-house';
    expect(validateV03State(state)).toBe(false);
    ruler.capturedRulerFactionId = 'cao';
    expect(validateV03State(state)).toBe(false);
    ruler.capturedRulerFactionId = 'dong';
    ruler.alive = false;
    expect(validateV03State(state)).toBe(false);
  });

  it('keeps Yuan Shao’s surviving house under its successor, and uses the successor’s name after execution', () => {
    const { state, ruler, holderId, oldFactionId } = fixture('liu', 'yuanshao');
    const successorId = state.factions.find(
      (faction) => faction.id === oldFactionId,
    )!.leaderOfficerId;
    const successor = officerAt(state, successorId);
    const result = decidePrisoner(state, holderId, ruler.id, 'execute');
    expect(result.ok).toBe(true);
    expect(result.state.factions.find((faction) => faction.id === oldFactionId)).toMatchObject({
      eliminated: false,
      leaderOfficerId: successorId,
      name: successor.name,
      chinese: successor.chinese,
    });
    expect(result.state.cities.some((city) => city.factionId === oldFactionId)).toBe(true);
    expectMoraleUnchanged(state, result.state);
    expect(reload(result.state)).toEqual(result.state);
  });

  it('repairs an older executed-Yuan-Shao save’s label without changing morale or creating another succession', () => {
    const { state, ruler, holderId, oldFactionId } = fixture('liu', 'yuanshao');
    const executed = decidePrisoner(state, holderId, ruler.id, 'execute').state;
    const faction = executed.factions.find((entry) => entry.id === oldFactionId)!;
    faction.name = 'Yuan Shao';
    faction.chinese = '袁绍';
    const next = reload(executed);
    const successor = officerAt(next, faction.leaderOfficerId);
    expect(next.factions.find((entry) => entry.id === oldFactionId)).toMatchObject({
      name: successor.name,
      chinese: successor.chinese,
    });
    expectMoraleUnchanged(executed, next);
    expect(next.events).toEqual(executed.events);
    expect(next.absoluteDay).toBe(executed.absoluteDay);
    expect(reconcileV03Rulers(next)).toBe(next);
  });

  it('clears ruler captivity identity when both captured rulers are successfully exchanged', () => {
    const { state, ruler, holderId } = fixture();
    const ownRuler = officerAt(state, 'caocao');
    capture(state, ownRuler, 'luoyang');
    resolveSuccessions(state);
    state.personnelDay = createPersonnelDay(state);
    const result = decidePrisoner(state, holderId, ruler.id, 'exchange', ownRuler.id);
    expect(result.ok, result.error).toBe(true);
    expect(
      result.state.events.find((event) => event.code === 'prisoner.decision')!.params?.accepted,
    ).toBe(true);
    expect(officerAt(result.state, ruler.id).capturedRulerFactionId).toBeNull();
    expect(officerAt(result.state, ownRuler.id).capturedRulerFactionId).toBeNull();
    expectMoraleUnchanged(state, result.state);
    expect(reload(result.state)).toEqual(result.state);
  });

  it('clears the captivity marker when a city conquest liberates its former ruler', () => {
    const state = reviewBattleState();
    const ruler = officerAt(state, 'caocao');
    capture(state, ruler, 'xiapi');
    resolveSuccessions(state);
    state.personnelDay = createPersonnelDay(state);
    const battle = state.battles.find((entry) => entry.active)!;
    battle.battleData.outcome = { winner: 'attacker', reason: 'dayLimit' };
    battle.playerDayComplete = true;
    state.events.forEach((event) => (event.acknowledged = true));
    const result = advanceV03(state, 1);
    expect(result.error).toBeUndefined();
    expect(result.daysAdvanced).toBe(1);
    const next = result.state;
    expect(officerAt(next, ruler.id)).toMatchObject({
      location: { kind: 'city', cityId: 'xiapi' },
      capturedRulerFactionId: null,
    });
    expect(reload(next)).toEqual(next);
  });
});
