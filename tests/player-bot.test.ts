import { describe, expect, it } from 'vitest';
import { createGame, dispatch, validateState } from '../src/game/campaign';
import { newBotStats } from '../tools/playerBot';
import {
  BOT_INTERIOR_RESERVE,
  botServing,
  prepareFrontierOrders,
  rehearseBotOrders,
} from '../tools/playerBotStrategy';
import { supplyFood } from '../src/game/supply';
import type { GameCommand, GameState } from '../src/game/types';

const assignGovernors = (state: GameState) =>
  state.cities.forEach((city) => {
    city.governorId =
      state.officers.find(
        (officer) =>
          officer.cityId === city.id &&
          officer.factionId === city.factionId &&
          !officer.captive &&
          officer.fate === 'active',
      )?.id ?? null;
  });

function controlledRealm() {
  const state = createGame('cao', 2041);
  state.cities.forEach((city) => {
    city.factionId = city.id === 'ye' ? 'yuan' : 'cao';
    city.food = 30000;
    city.gold = 5000;
    city.reserve = 500;
  });
  state.officers.forEach((officer) => {
    officer.factionId = state.cities.find((city) => city.id === officer.cityId)!.factionId;
    officer.busy = false;
    officer.stamina = 100;
  });
  assignGovernors(state);
  return state;
}

function runPreparation(initial: GameState) {
  let state = structuredClone(initial);
  expect(validateState(state)).toBeNull();
  const commands: GameCommand[] = [];
  const stats = { ...newBotStats(), transfers: 0, jointAttacks: 0 };
  prepareFrontierOrders(
    () => state,
    (command) => {
      const result = dispatch(state, command);
      expect(result.ok).toBe(true);
      if (!result.ok) return false;
      state = result.state;
      expect(validateState(state)).toBeNull();
      commands.push(command);
      return true;
    },
    stats,
  );
  return { state, commands, stats };
}

describe('diagnostic player logistics', () => {
  it('ships an interior army by legal adjacent convoys, preserving an officer and reserve', () => {
    const initial = controlledRealm();
    const source = initial.cities.find((city) => city.id === 'xuchang')!;
    source.reserve = 3000;
    const beforeOfficers = botServing(initial, source.id);
    expect(beforeOfficers.length).toBeGreaterThan(1);
    const result = runPreparation(initial);
    const convoy = result.commands.find(
      (command) => command.type === 'transfer' && command.sourceId === source.id,
    );
    expect(convoy).toBeDefined();
    if (convoy?.type !== 'transfer') throw new Error('Expected convoy.');
    expect(source.neighbors).toContain(convoy.targetId);
    expect(botServing(result.state, source.id).length).toBeGreaterThanOrEqual(1);
    expect(
      result.state.cities.find((city) => city.id === source.id)!.reserve,
    ).toBeGreaterThanOrEqual(BOT_INTERIOR_RESERVE);
    expect(result.state.officers.find((officer) => officer.id === convoy.officerId)!.busy).toBe(
      true,
    );
    const resources = (state: GameState, key: 'gold' | 'food') =>
      state.cities.reduce((sum, city) => sum + city[key], 0);
    expect(resources(result.state, 'gold')).toBe(resources(initial, 'gold'));
    expect(resources(result.state, 'food')).toBe(resources(initial, 'food'));
    const soldiers = (state: GameState) =>
      state.cities.reduce((sum, city) => sum + city.reserve, 0) +
      state.officers.reduce((sum, officer) => sum + officer.troops, 0);
    expect(soldiers(result.state)).toBe(soldiers(initial));
    expect(result.state.rng).toBe(initial.rng);
    expect(runPreparation(initial)).toEqual(result);
  });

  it('rejects an invalid joint sequence before touching the live state', () => {
    const state = createGame('cao', 2041);
    state.turn = 3;
    state.month = 4;
    const before = structuredClone(state);
    const officer = state.officers.find((candidate) => candidate.id === 'caocao')!;
    const command: GameCommand = {
      type: 'march',
      sourceId: officer.cityId,
      targetId: 'luoyang',
      officerIds: [officer.id],
    };
    expect(rehearseBotOrders(state, [command, command])).toBe(false);
    expect(state).toEqual(before);
    expect(rehearseBotOrders(state, [command])).toBe(true);
    expect(state).toEqual(before);
  });

  it('coordinates two individually insufficient armies and pays both supply costs', () => {
    const initial = controlledRealm();
    initial.turn = 3;
    initial.month = 4;
    initial.officers.forEach((officer) => {
      officer.troops = 0;
      officer.busy = true;
    });
    const ids = ['caocao', 'xunyu', 'xiahoudun', 'caoren'];
    ids.forEach((id, index) => {
      const officer = initial.officers.find((candidate) => candidate.id === id)!;
      officer.cityId = index < 2 ? 'jinyang' : 'puyang';
      officer.factionId = 'cao';
      officer.troops = 2500;
      officer.force = 75;
      officer.busy = false;
    });
    const target = initial.cities.find((city) => city.id === 'ye')!;
    target.reserve = 4000;
    target.defense = 20;
    assignGovernors(initial);
    const result = runPreparation(initial);
    const marches = result.commands.filter((command) => command.type === 'march');
    expect(marches).toHaveLength(2);
    expect(new Set(marches.map((command) => command.sourceId))).toEqual(
      new Set(['jinyang', 'puyang']),
    );
    expect(marches.every((command) => command.targetId === 'ye')).toBe(true);
    expect(result.stats.jointAttacks).toBe(1);
    for (const sourceId of ['jinyang', 'puyang']) {
      expect(result.state.cities.find((city) => city.id === sourceId)!.food).toBe(
        30000 - supplyFood(2500, 20),
      );
      expect(
        result.state.officers.filter(
          (officer) => officer.cityId === sourceId && !officer.busy && officer.troops > 0,
        ),
      ).toHaveLength(1);
    }
    expect(result.state.rng).toBe(initial.rng);
  });
});
