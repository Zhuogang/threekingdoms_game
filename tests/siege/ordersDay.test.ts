import { describe, expect, it } from 'vitest';
import { CAMP_CELLS, COURTYARD } from '../../src/siege/content/chencang';
import { predictSiegeAttack } from '../../src/siege/rules/combat';
import { endDay } from '../../src/siege/rules/day';
import { createSiegeState } from '../../src/siege/rules/state';
import { act, engine, refused } from './rulesFixtures';

describe('daily commander orders', () => {
  it('rallies either side by fifteen, capped at 100, with one order per side per day', () => {
    let state = createSiegeState(1);
    const shu = state.units[1]!;
    const wei = state.units[11]!;
    shu.morale = 65;
    wei.morale = 95;
    state = act(state, { type: 'order', side: 'shu', kind: 'rally', target: shu.id });
    expect(state.units[1]!.morale).toBe(80);
    refused(state, { type: 'order', side: 'shu', kind: 'rotate', target: shu.id });
    state = act(state, { type: 'order', side: 'wei', kind: 'rally', target: wei.id });
    expect(state.units[11]!.morale).toBe(100);
    refused(state, { type: 'order', side: 'wei', kind: 'nightRepair', target: 'south' });
    state = endDay(state);
    expect(state.units[11]!.morale).toBe(100);
    state = act(state, { type: 'order', side: 'shu', kind: 'rally', target: shu.id });
    expect(state.units[1]!.morale).toBe(95);
  });

  it('does not spend an order on invalid targets or let a defeated commander issue it', () => {
    const state = createSiegeState(2);
    refused(state, { type: 'order', side: 'shu', kind: 'rally', target: state.units[10]!.id });
    expect(state.ordersUsed.shu[1]).toBe(false);
    state.units[10]!.routed = true;
    refused(state, { type: 'order', side: 'wei', kind: 'rally', target: state.units[11]!.id });
  });

  it('supervises a workshop by one day and completes a ladder at that day end', () => {
    let state = createSiegeState(3);
    refused(state, { type: 'order', side: 'shu', kind: 'supervise', target: 'workshop-1' });
    state = act(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'ladder' });
    state = act(state, { type: 'order', side: 'shu', kind: 'supervise', target: 'workshop-1' });
    expect(state.workshops[0]!.daysRemaining).toBe(1);
    expect(endDay(state).engines[0]!.kind).toBe('ladder');
  });

  it('rotates into free camp ground, prevents actions, and recovers half the wounded next day only once', () => {
    let state = createSiegeState(4);
    const unitId = state.units[1]!.id;
    state.units[1]!.wounded = 101;
    const troops = state.units[1]!.troops;
    state.engines = [engine('ram', CAMP_CELLS[0]!.x, CAMP_CELLS[0]!.y)];
    state = act(state, { type: 'order', side: 'shu', kind: 'rotate', target: unitId });
    expect(state.units[1]).toMatchObject({
      ...CAMP_CELLS[1]!,
      moved: true,
      acted: true,
      wounded: 101,
      rotateRecoveryDay: 2,
    });
    refused(state, { type: 'move', unitId, x: 12, y: 27, level: 'ground' });
    state = endDay(state);
    expect(state.units[1]).toMatchObject({
      troops: troops + 50,
      wounded: 51,
      moved: false,
      acted: false,
    });
    expect(state.units[1]!.rotateRecoveryDay).toBeUndefined();
    expect(endDay(state).units[1]!.wounded).toBe(51);
  });

  it('holds only the selected wall run for the current day', () => {
    let state = createSiegeState(5);
    const shu = state.units[1]!;
    const wei = state.units[11]!;
    Object.assign(shu, { x: 22, y: 18, troopType: 'archer' });
    const normal = predictSiegeAttack(state, shu.id, wei.id)!;
    state = act(state, { type: 'order', side: 'wei', kind: 'holdFast', target: wei.id });
    expect(state.holdFast!.cells.map((cell) => cell.x)).toEqual([15, 16, 17, 18, 19, 20, 21, 22]);
    const held = predictSiegeAttack(state, shu.id, wei.id)!;
    expect(held.modifiers.holdFast).toBe(0.7);
    expect(held.casualties).toBeLessThan(normal.casualties);
    expect(predictSiegeAttack(state, shu.id, state.units[13]!.id)!.modifiers.holdFast).toBe(1);
    expect(endDay(state).holdFast).toBeUndefined();
  });

  it('repairs an intact gate by 100 with a maximum and damaged-art update, never a broken gate', () => {
    const state = createSiegeState(6);
    state.gates.south.durability = 350;
    state.gates.south.damaged = true;
    const repaired = act(state, {
      type: 'order',
      side: 'wei',
      kind: 'nightRepair',
      target: 'south',
    });
    expect(repaired.gates.south).toMatchObject({ durability: 450, damaged: false });
    state.gates.south.durability = 750;
    expect(
      act(state, { type: 'order', side: 'wei', kind: 'nightRepair', target: 'south' }).gates.south
        .durability,
    ).toBe(800);
    Object.assign(state.gates.south, { durability: 0, broken: true });
    refused(state, { type: 'order', side: 'wei', kind: 'nightRepair', target: 'south' });
  });
});

describe('day sequence, acts and outcomes', () => {
  it('resolves defender actions before burning, construction, supplies and the next weather entry', () => {
    let state = createSiegeState(7);
    state = act(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'earthCart' });
    state.engines = [engine('ladder', 20, 19, { durability: 15 })];
    state.units[1]!.morale = 60;
    state.units[2]!.morale = 60;
    state.units[2]!.lostTroopsToday = 1;
    const before = structuredClone(state);
    let calls = 0;
    const next = endDay(state, (draft) => {
      calls++;
      expect(draft.day).toBe(1);
      expect(draft.grain).toBe(20);
      expect(draft.engines).toHaveLength(1);
      expect(draft.workshops[0]!.daysRemaining).toBe(1);
      draft.engines[0]!.burning = true;
      draft.units[1]!.acted = true;
    });
    expect(state).toEqual(before);
    expect(calls).toBe(1);
    expect(next.engines[0]).toMatchObject({ durability: 0, wrecked: true });
    expect(next.engines[1]!.kind).toBe('earthCart');
    expect(next).toMatchObject({
      day: 2,
      grain: 19,
      zhangheDistance: 21,
      weather: state.weatherByDay[2],
    });
    expect(next.units[1]).toMatchObject({ morale: 65, acted: false, moved: false });
    expect(next.units[2]!.morale).toBe(60);
    expect(next.log.slice(state.log.length).map((entry) => entry.code)).toEqual([
      'defenderTurnComplete',
      'engineBurning',
      'engineCompleted',
      'daySupplies',
      'dayStarted',
    ]);
  });

  it('accepts a defender callback returning an immutable action result', () => {
    const state = createSiegeState(8);
    const next = endDay(state, (draft) =>
      act(draft, { type: 'order', side: 'wei', kind: 'rally', target: draft.units[11]!.id }),
    );
    expect(next.units[11]!.morale).toBe(95);
    expect(state.units[11]!.morale).toBe(80);
  });

  it('enters act 2 on day 6 without resetting persistent construction', () => {
    let state = createSiegeState(9);
    state.trenchFill['20,18'] = 1.5;
    for (let day = 1; day <= 5; day++) {
      expect(state.act).toBe(1);
      state = endDay(state);
    }
    expect(state).toMatchObject({ day: 6, act: 2 });
    expect(state.trenchFill['20,18']).toBe(1.5);
    state = act(state, { type: 'queueEngine', workshopId: 'workshop-1', kind: 'tower' });
    expect(state.workshops[0]!.daysRemaining).toBe(4);
  });

  it('ends historically on day 20 when grain reaches zero and freezes finished games', () => {
    let state = createSiegeState(10);
    for (let day = 1; day <= 20; day++) {
      expect(state.day).toBe(day);
      expect(state.outcome).toBeNull();
      state = act(state, { type: 'endDay' });
    }
    expect(state).toMatchObject({ day: 20, grain: 0, zhangheDistance: 2, outcome: 'historical' });
    refused(state, { type: 'withdraw' });
    expect(
      endDay(state, () => {
        throw new Error('Finished game must not call AI');
      }),
    ).toEqual(state);
  });

  it('checks courtyard victory only after the defender turn, and allows the defender to remove the occupier', () => {
    const state = createSiegeState(11);
    Object.assign(state.units[1]!, COURTYARD[0]);
    expect(state.outcome).toBeNull();
    expect(endDay(state).outcome).toBe('victory');
    expect(
      endDay(state, (draft) => {
        draft.units[1]!.troops = 0;
      }).outcome,
    ).toBeNull();
  });

  it.each(['shu', 'wei'] as const)(
    'handles all %s routed as defeat/victory before recovery can undo it',
    (side) => {
      const state = createSiegeState(12);
      for (const unit of state.units.filter((unit) => unit.side === side)) {
        unit.morale = 19;
        unit.routed = true;
      }
      expect(endDay(state).outcome).toBe(side === 'shu' ? 'defeat' : 'victory');
    },
  );

  it.each(['destroyed', 'routed'] as const)(
    'loses when the Zhuge Liang main body is %s',
    (condition) => {
      const state = createSiegeState(13);
      if (condition === 'destroyed') state.units[0]!.troops = 0;
      else {
        state.units[0]!.routed = true;
        state.units[0]!.morale = 10;
      }
      expect(endDay(state).outcome).toBe('defeat');
    },
  );

  it('records voluntary withdrawal as the lower-rated historical ending', () => {
    const state = createSiegeState(14);
    expect(act(state, { type: 'withdraw' })).toMatchObject({
      outcome: 'historical',
      withdrawn: true,
      day: 1,
      grain: 20,
    });
  });

  it('produces identical JSON for the same seed and actions, including after save/load', () => {
    const play = () => {
      let state = act(createSiegeState(15), {
        type: 'queueEngine',
        workshopId: 'workshop-1',
        kind: 'ram',
      });
      for (let day = 1; day <= 7; day++) {
        state = act(state, {
          type: 'order',
          side: 'shu',
          kind: 'rally',
          target: state.units[1]!.id,
        });
        state = act(state, { type: 'endDay' });
        if (day === 3) state = JSON.parse(JSON.stringify(state));
      }
      return state;
    };
    expect(play()).toEqual(play());
  });
});
