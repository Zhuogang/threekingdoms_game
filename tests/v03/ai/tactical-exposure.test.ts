import { describe, expect, it } from 'vitest';
import * as engine from '../../../src/v03/battle';
import { decisionBattle } from '../helpers/ai-fixtures';
import { compareOrdinaryAttackExposure } from '../../../tools/v04-tactical-exposure.mjs';

function fixture() {
  const state = decisionBattle();
  state.units.find((u) => u.id === 'strong')!.y = 8;
  return state;
}

describe('independent ordinary-attack exposure diagnostic', () => {
  it('finds a legal identical finishing hit beyond the remaining enemy’s current-day reach', () => {
    const state = fixture(),
      before = structuredClone(state);
    const result = compareOrdinaryAttackExposure(engine, state, 'actor', 'weak');
    expect(result.status).toBe('measured');
    if (result.status !== 'measured') return;
    expect(result.best).not.toBeNull();
    expect(result.best!.reduction).toBeGreaterThan(0);
    expect(result.best!.reply.casualties).toBe(0);
    const moved = engine.applyBattleAction(state, {
      type: 'move',
      unitId: 'actor',
      ...result.best!.position,
    });
    expect(moved.ok).toBe(true);
    const chosen = engine.applyBattleAction(state, {
      type: 'attack',
      unitId: 'actor',
      targetId: 'weak',
    });
    const alternative = engine.applyBattleAction(moved.state, {
      type: 'attack',
      unitId: 'actor',
      targetId: 'weak',
    });
    expect(alternative.ok).toBe(true);
    expect(alternative.state.units.find((u) => u.id === 'weak')).toEqual(
      chosen.state.units.find((u) => u.id === 'weak'),
    );
    expect(alternative.state.rngState).toBe(state.rngState);
    expect(state).toEqual(before);
  });

  it('does not invent an enemy activation after that side has acted', () => {
    const state = fixture();
    state.units.filter((u) => u.side === 'defender').forEach((u) => (u.acted = true));
    expect(compareOrdinaryAttackExposure(engine, state, 'actor', 'weak')).toEqual({
      status: 'excluded',
      reason: 'no-opponent-activation-left-today',
    });
  });

  it('requires an observed movement origin and accounts for its actual legal alternatives', () => {
    const origin = fixture();
    const moved = engine.applyBattleAction(origin, { type: 'move', unitId: 'actor', x: 6, y: 5 });
    expect(moved.ok).toBe(true);
    expect(compareOrdinaryAttackExposure(engine, moved.state, 'actor', 'weak')).toEqual({
      status: 'excluded',
      reason: 'movement-origin-unobserved',
    });
    const result = compareOrdinaryAttackExposure(engine, moved.state, 'actor', 'weak', origin);
    expect(result.status).toBe('measured');
    const changed = structuredClone(moved.state);
    changed.units.find((u) => u.id === 'strong')!.troops--;
    expect(compareOrdinaryAttackExposure(engine, changed, 'actor', 'weak', origin)).toEqual({
      status: 'excluded',
      reason: 'intervening-state-change',
    });
  });

  it('keeps an ended battle out of reply-exposure comparisons', () => {
    const state = fixture();
    state.units.find((u) => u.id === 'strong')!.troops = 0;
    expect(compareOrdinaryAttackExposure(engine, state, 'actor', 'weak')).toEqual({
      status: 'excluded',
      reason: 'battle-ended',
    });
  });

  it('treats a confused enemy as unable to make a normal reply this activation', () => {
    const state = fixture();
    state.units.find((u) => u.id === 'strong')!.status = 'confused';
    const result = compareOrdinaryAttackExposure(engine, state, 'actor', 'weak');
    expect(result.status).toBe('measured');
    if (result.status !== 'measured') return;
    expect(result.chosenReply.casualties).toBe(0);
    expect(result.best).toBeNull();
  });
  it('does not call a weaker water-modified attack an identical safer alternative', () => {
    const state = fixture();
    state.map.terrain.fill('water');
    state.map.terrain[5 * state.map.width + 5] = 'plain';
    Object.assign(
      state.units.find((u) => u.id === 'weak')!,
      { troops: 1000, initialTroops: 1000 },
    );
    const result = compareOrdinaryAttackExposure(engine, state, 'actor', 'weak');
    expect(result.status).toBe('measured');
    if (result.status !== 'measured') return;
    expect(result.positions).toBeGreaterThan(1);
    expect(result.equivalentPositions).toBe(0);
    expect(result.best).toBeNull();
  });

  it('rejects equivalent attacks that remove a remaining ally’s legal movement choices', () => {
    const state = fixture();
    state.units.push({
      ...structuredClone(state.units[0]!),
      id: 'ally',
      name: 'Ally',
      x: 5,
      y: 3,
      troopType: 'infantry',
      attackRange: 1,
    });
    const result = compareOrdinaryAttackExposure(engine, state, 'actor', 'weak');
    expect(result.status).toBe('measured');
    if (result.status !== 'measured') return;
    expect(result.equivalentPositions).toBeGreaterThan(result.protectedPositions);
    if (result.best) {
      const moved = engine.applyBattleAction(state, {
        type: 'move',
        unitId: 'actor',
        ...result.best.position,
      });
      expect(moved.ok).toBe(true);
      const alternative = engine.applyBattleAction(moved.state, {
        type: 'attack',
        unitId: 'actor',
        targetId: 'weak',
      }).state;
      const chosen = engine.applyBattleAction(state, {
        type: 'attack',
        unitId: 'actor',
        targetId: 'weak',
      }).state;
      const available = new Set(
        engine.getUnitReachableTiles(alternative, 'ally').map((p) => `${p.x},${p.y}`),
      );
      expect(
        engine.getUnitReachableTiles(chosen, 'ally').every((p) => available.has(`${p.x},${p.y}`)),
      ).toBe(true);
    }
  });
});
