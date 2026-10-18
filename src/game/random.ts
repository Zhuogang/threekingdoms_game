import type { GameState } from './types';
/** Xorshift32. Presentation never shares this saved gameplay random stream. */
export function random(state: Pick<GameState, 'rng'>, max: number): number {
  let x = state.rng || 190;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng % max;
}
export function addLog(
  state: GameState,
  text: string,
  kind: GameState['log'][number]['kind'] = 'event',
): void {
  state.log.push({ id: state.nextId++, turn: state.turn, text, kind });
  if (state.log.length > 100) state.log.splice(0, state.log.length - 100);
}
