import { it } from 'vitest';
import { createGame, validateState } from '../src/game/campaign';

it('guandu debug', () => {
  const state = createGame('cao', 7, 'balanced', { scenarioId: 'guandu-200' });
  const sj = state.officers.find((o) => o.id === 'sunjian')!;
  console.log(JSON.stringify(sj), validateState(state));
});
