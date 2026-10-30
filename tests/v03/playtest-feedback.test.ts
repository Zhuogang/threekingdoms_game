import { describe, expect, it } from 'vitest';
import { getUnitReachableTiles } from '../../src/v03/battle';
import { reportBlocksAdvance, stopsBattleDay } from '../../src/v03/campaign/reports';
import { playtestFixture } from '../../src/v03/dev/fixtures';
import { advanceV03, completeV03BattleDay } from '../../src/v03/engine';
import { createV03Game } from '../../src/v03/initial-state';
import { standOnPendingMove } from '../../src/v03/ui/hooks/battle-controls';
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
