import { createGame, dispatch } from '../../src/game/campaign';
import type { GameCommand, GameState } from '../../src/game/types';

function apply(state: GameState, command: GameCommand): GameState {
  const result = dispatch(state, command);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

/** A legal maximum-size 10-versus-10 battle, using the target city's authored profile. */
export function fullBattle(targetId = 'xiapi'): GameState {
  let state = createGame('cao', 16);
  const target = state.cities.find((city) => city.id === targetId)!;
  const source = state.cities.find((city) => city.id === target.neighbors[0])!;
  Object.assign(source, { factionId: 'cao', food: 100_000, gold: 10_000 });
  Object.assign(target, { factionId: 'yuan', reserve: 0 });
  const officers = state.officers.filter(
    (officer) => officer.fate === 'active' && !officer.captive,
  );
  const attackers = officers.slice(0, 10);
  const defenders = officers.slice(10, 20);
  for (const [army, factionId, cityId] of [
    [attackers, 'cao', source.id],
    [defenders, 'yuan', target.id],
  ] as const) {
    for (const officer of army)
      Object.assign(officer, { factionId, cityId, troops: 2000, busy: false });
  }
  // Ownership changes above must not strand the original residents in hostile cities.
  for (const officer of officers.slice(20)) {
    if (!officer.factionId) continue;
    const currentCity = state.cities.find((city) => city.id === officer.cityId)!;
    if (currentCity.factionId !== officer.factionId) {
      const home = state.cities.find((city) => city.factionId === officer.factionId);
      if (home) officer.cityId = home.id;
      else Object.assign(officer, { factionId: null, troops: 0 });
    }
  }
  attackers[0]!.experience = 500;
  attackers[0]!.level = 5;
  for (const city of state.cities) city.governorId = null;
  state = apply(state, {
    type: 'march',
    sourceId: source.id,
    targetId: target.id,
    officerIds: attackers.map((officer) => officer.id),
  });
  state = apply(state, { type: 'endMonth' });
  if (state.phase !== 'battle' || state.battle?.order.targetId !== targetId)
    throw new Error('The rendering fixture did not open its intended battle.');
  return state;
}
