import { describe, expect, it } from 'vitest';
import {
  advanceBattleDay,
  applyBattleAction,
  canvasBattlefieldIds,
  createCanvasBattleMap,
  createTacticalBattle,
  getForcedBattleOutcome,
  getUnitReachableTiles,
  runBattleAiTurn,
  type BattleSide,
} from '../../src/v03/battle';
import { previewRetreat } from '../../src/v03/campaign/battle-aftermath';
import { reviewBattleState } from '../e2e-v03/playability-fixtures';

describe('battle rules after camp removal', () => {
  it.each<BattleSide>(['attacker', 'defender'])(
    '%s can cross both former objective cells without ending battle',
    (side) => {
      for (const destination of [
        { x: 5, y: 15 },
        { x: 42, y: 15 },
      ]) {
        const state = createTacticalBattle({
          id: `ordinary-rear-${side}-${destination.x}`,
          map: createCanvasBattleMap('bf01-north-plain'),
          playerSide: side,
          attackerUnits: [{ id: 'a', name: 'A', troopType: 'infantry', troops: 1000, force: 70 }],
          defenderUnits: [{ id: 'd', name: 'D', troopType: 'infantry', troops: 1000, force: 70 }],
        });
        const unit = state.units.find((entry) => entry.side === side)!;
        Object.assign(unit, { x: destination.x - 1, y: destination.y });
        expect(getUnitReachableTiles(state, unit.id)).toContainEqual(
          expect.objectContaining(destination),
        );
        const moved = applyBattleAction(state, { type: 'move', unitId: unit.id, ...destination });
        expect(moved.ok).toBe(true);
        expect(moved.state.outcome).toBeNull();
        expect(getForcedBattleOutcome(moved.state)).toBeNull();
        expect(moved.state.engaged).toBe(false);
      }
    },
  );

  it('reaching a former enemy objective does not manufacture a forced retreat or capture risk', () => {
    const state = reviewBattleState('bf01-north-plain');
    const battle = state.battles.find((entry) => entry.active)!;
    const unit = battle.battleData.units.find(
      (entry) => entry.side === battle.battleData.playerSide,
    )!;
    Object.assign(unit, { x: 41, y: 15 });
    const moved = applyBattleAction(battle.battleData, {
      type: 'move',
      unitId: unit.id,
      x: 42,
      y: 15,
    });
    expect(moved.ok).toBe(true);
    battle.battleData = moved.state;
    const before = structuredClone(state);
    const preview = previewRetreat(state, battle, battle.battleData.playerSide);
    expect(preview.destination).not.toBeNull();
    expect(preview.risk).toBe(0);
    expect(preview.atLeastOnePercent).toBe(0);
    expect(state).toEqual(before);
  });

  it('AI ordinary attacks count as engagement and give a subsequent orderly retreat 5% capture risk', () => {
    const state = reviewBattleState('bf01-north-plain');
    const battle = state.battles.find((entry) => entry.active)!;
    const player = battle.battleData.units.find((entry) => entry.side === 'attacker')!;
    const enemy = battle.battleData.units.find((entry) => entry.side === 'defender')!;
    // Make an ordinary exchange worthwhile; this tests engagement bookkeeping,
    // not whether weak militia should charge an elite cavalry formation.
    Object.assign(player, { x: 12, y: 15, troopType: 'infantry', force: 45 });
    Object.assign(enemy, { x: 13, y: 15, force: 85, isMilitia: true });
    expect(battle.battleData.engaged).toBe(false);
    expect(previewRetreat(state, battle, 'attacker').risk).toBe(0);
    battle.battleData = runBattleAiTurn(battle.battleData, 'defender');
    expect(battle.battleData.logEntries?.some((entry) => entry.code === 'log.attack')).toBe(true);
    expect(battle.battleData.logEntries?.some((entry) => entry.code === 'log.tactic')).toBe(false);
    expect(battle.battleData.engaged).toBe(true);
    expect(getForcedBattleOutcome(battle.battleData)).toBeNull();
    expect(previewRetreat(state, battle, 'attacker').risk).toBe(5);
  });

  it.each(canvasBattlefieldIds())(
    'AI armies on %s make contact and finish without a camp objective',
    (id) => {
      for (const seed of [0, 1, 2]) {
        const roster = (prefix: string) =>
          (['infantry', 'cavalry', 'archer'] as const).map((troopType, index) => ({
            id: `${prefix}-${index}`,
            name: prefix,
            troopType,
            troops: 1200,
            force: 70,
            intellect: 65,
          }));
        let state = createTacticalBattle({
          id: `camp-free-${id}-${seed}`,
          map: createCanvasBattleMap(id, { seed }),
          seed,
          attackerUnits: roster('a'),
          defenderUnits: roster('d'),
        });
        for (let day = 0; day < state.dayLimit && !state.outcome; day++) {
          state = runBattleAiTurn(state, 'attacker');
          state = advanceBattleDay(state);
        }
        expect(state.engaged, `${id}/${seed}: armies never made contact`).toBe(true);
        expect(state.outcome, `${id}/${seed}: battle failed to resolve`).not.toBeNull();
        expect(['elimination', 'rout', 'dayLimit']).toContain(state.outcome!.reason);
        expect(state.units.some((unit) => unit.combatCasualtiesReceived > 0)).toBe(true);
      }
    },
  );
});
