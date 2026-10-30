import { describe, expect, it } from 'vitest';
import { getUnitReachableTiles } from '../../src/v03/battle';
import { reportBlocksAdvance, stopsBattleDay } from '../../src/v03/campaign/reports';
import { playtestFixture } from '../../src/v03/dev/fixtures';
import { advanceV03, completeV03BattleDay } from '../../src/v03/engine';
import {
  applyNpcCapitalCityAction,
  applyV03CityAction,
  cityWorkBusyDays,
  getV03CityActionAvailability,
  officerBusyDays,
} from '../../src/v03/governance/city-actions';
import { createV03Game } from '../../src/v03/initial-state';
import { decodeV03Save, encodeV03Save } from '../../src/v03/platform/storage';
import { standOnPendingMove } from '../../src/v03/ui/hooks/battle-controls';
import { localizeAppMessage } from '../../src/v03/ui/shared/app-copy-2';
import type { V03DomainEvent, V03GameState } from '../../src/v03/types';

// First play session after Phase 3 (October 30, 2026): reports that need no orders no
// longer hold up a battle, and moves stay provisional until the formation acts.

function councilReport(state: V03GameState): V03DomainEvent {
  return {
    id: 'council-report',
    kind: 'diplomacy',
    code: 'diplomacy',
    params: {},
    title: 'Council report',
    detail: 'A council report awaits acknowledgement.',
    absoluteDay: state.absoluteDay,
    entityId: state.playerFactionId,
    acknowledged: false,
    tier: 'critical',
  };
}

describe('reports during a battle the player commands', () => {
  it('ends the battle day past a report that needs no battle orders, leaving it unread', () => {
    const state = playtestFixture('battle');
    const battle = state.battles.find((entry) => entry.active)!;
    expect(battle.autoCommand).toBeFalsy();
    const report = councilReport(state);
    state.events.push(report);
    expect(stopsBattleDay(state, report)).toBe(false);
    expect(reportBlocksAdvance(state, report)).toBe(false);

    const result = completeV03BattleDay(state, battle.id);
    expect(result.ok, result.error).toBe(true);
    expect(result.advancedWorldDay).toBe(true);
    expect(result.state.absoluteDay).toBe(state.absoluteDay + 1);
    expect(result.state.events.find((event) => event.id === report.id)?.acknowledged).toBe(false);
  });

  it('still stops the battle day for an unread battle report', () => {
    const state = playtestFixture('battle');
    const battle = state.battles.find((entry) => entry.active)!;
    const report: V03DomainEvent = {
      ...councilReport(state),
      id: 'second-battle',
      kind: 'battleReady',
      entityId: battle.id,
    };
    state.events.push(report);
    expect(stopsBattleDay(state, report)).toBe(true);
    const result = completeV03BattleDay(state, battle.id);
    expect(result.ok).toBe(false);
    expect(result.state).toBe(state);
  });

  it('keeps every critical report blocking once no battle is commanded', () => {
    const state = createV03Game('cao', 7);
    const report = councilReport(state);
    state.events.push(report);
    expect(reportBlocksAdvance(state, report)).toBe(true);
    const result = advanceV03(state, 1);
    expect(result.daysAdvanced).toBe(0);
    expect(result.stoppedFor).toBe('event');
  });
});

describe('provisional battle moves', () => {
  const setup = () => {
    const state = playtestFixture('battle');
    const battle = state.battles.find((entry) => entry.active)!;
    const unit = battle.battleData.units.find(
      (entry) => entry.side === battle.battleData.playerSide && entry.troops > 0,
    )!;
    const tile = getUnitReachableTiles(battle.battleData, unit.id).find(
      (entry) => entry.x !== unit.x || entry.y !== unit.y,
    )!;
    const pending = { battleId: battle.id, unitId: unit.id, x: tile.x, y: tile.y };
    return { state, battle, unit, pending };
  };

  it('applies the move before the formation’s order, so the order acts from the new cell', () => {
    const { state, battle, unit, pending } = setup();
    const { base, battleCommand } = standOnPendingMove(state, pending, {
      type: 'battleAction',
      battleId: battle.id,
      action: { type: 'wait', unitId: unit.id },
    });
    expect(battleCommand).toBe(true);
    const moved = base.battles
      .find((entry) => entry.id === battle.id)!
      .battleData.units.find((entry) => entry.id === unit.id)!;
    expect(moved).toMatchObject({ x: pending.x, y: pending.y, moved: true });
    // The committed game is untouched until the order is carried out.
    expect(
      state.battles
        .find((entry) => entry.id === battle.id)!
        .battleData.units.find((entry) => entry.id === unit.id),
    ).toMatchObject({ x: unit.x, y: unit.y, moved: false });
  });

  it('leaves the move pending through orders that do not settle it', () => {
    const { state, pending } = setup();
    const unrelated = standOnPendingMove(state, pending, {
      type: 'acknowledgeEvents',
      eventIds: [],
    });
    expect(unrelated).toEqual({ base: state, battleCommand: false });
    const commit = standOnPendingMove(state, pending, {
      type: 'battleAction',
      battleId: pending.battleId,
      action: { type: 'move', unitId: pending.unitId, x: pending.x, y: pending.y },
    });
    expect(commit.base).toBe(state);
  });
});

// Second note from the same session: a capital task takes its executor's time.
describe('capital tasks occupy their executor', () => {
  function capital() {
    const state = createV03Game('cao', 4);
    const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
    Object.assign(city, { gold: 10_000, farming: 100, commerce: 100, loyalty: 50 });
    city.workPointsBanked = 4;
    city.workPeriodIndex = 0;
    city.workMonthIndex = 0;
    city.workPointsUsed = 0;
    const officers = state.officers
      .filter(
        (officer) =>
          officer.alive &&
          officer.factionId === state.playerFactionId &&
          officer.location.kind === 'city' &&
          officer.location.cityId === city.id,
      )
      .sort((a, b) => b.intellect - a.intellect || a.id.localeCompare(b.id));
    return { state, city, officers };
  }

  it('applies the effect at once and keeps the executor busy for the task days', () => {
    const { state, city, officers } = capital();
    const executor = officers[0]!;
    expect(cityWorkBusyDays('develop-farming')).toBe(10);
    const done = applyV03CityAction(state, {
      cityId: city.id,
      action: 'develop-farming',
      officerId: executor.id,
    });
    expect(done.ok, done.error).toBe(true);
    expect(done.state.cities.find((entry) => entry.id === city.id)!.farming).toBe(120);
    const busy = done.state.officers.find((entry) => entry.id === executor.id)!;
    expect(busy.cityWork).toEqual({ action: 'develop-farming', untilDay: state.absoluteDay + 10 });
    expect(officerBusyDays(done.state, busy)).toBe(10);
    const again = applyV03CityAction(done.state, {
      cityId: city.id,
      action: 'security',
      officerId: executor.id,
    });
    expect(again.ok).toBe(false);
    expect(again.error).toBe(`${executor.name} is still busy with city work for 10 more days.`);
    expect(localizeAppMessage(again.error!, 'zh', done.state)).toContain('还需 10 日');
    // Free preparations and rewards do not need the officer's time.
    const reward = applyV03CityAction(done.state, {
      cityId: city.id,
      action: 'reward',
      officerIds: [executor.id],
    });
    expect(reward.ok, reward.error).toBe(true);
    const later = structuredClone(done.state);
    later.absoluteDay += 10;
    expect(officerBusyDays(later, busy)).toBe(0);
    expect(
      getV03CityActionAvailability(later, {
        cityId: city.id,
        action: 'security',
        officerId: executor.id,
      }).ok,
    ).toBe(true);
  });

  it('gives an unnamed task to the next free officer, and feasts occupy no one', () => {
    const { state, city, officers } = capital();
    const first = applyV03CityAction(state, { cityId: city.id, action: 'buy-food' });
    expect(first.ok, first.error).toBe(true);
    const second = applyV03CityAction(first.state, { cityId: city.id, action: 'buy-food' });
    expect(second.ok, second.error).toBe(true);
    const occupied = second.state.officers.filter((officer) => officer.cityWork);
    expect(occupied.map((officer) => officer.id)).toEqual([officers[0]!.id, officers[1]!.id]);
    expect(occupied.every((officer) => officer.cityWork!.untilDay === state.absoluteDay + 2)).toBe(
      true,
    );
    const feast = applyV03CityAction(second.state, {
      cityId: city.id,
      action: 'feast',
      officerIds: officers.map((officer) => officer.id),
    });
    expect(feast.ok, feast.error).toBe(true);
    expect(feast.state.officers.filter((officer) => officer.cityWork)).toHaveLength(2);
    expect(decodeV03Save(encodeV03Save(feast.state))).toEqual(feast.state);
  });

  it('leaves governors and rival capitals on their existing monthly rules', () => {
    const state = createV03Game('cao', 4);
    const rival = state.factions.find((faction) => faction.id !== state.playerFactionId)!;
    const city = state.cities.find((entry) => entry.id === rival.capitalCityId)!;
    Object.assign(city, { gold: 10_000, farming: 100 });
    const done = applyNpcCapitalCityAction(state, rival.id, {
      cityId: city.id,
      action: 'develop-farming',
    });
    expect(done.ok, done.error).toBe(true);
    expect(done.state.officers.some((officer) => officer.cityWork)).toBe(false);
  });
});
