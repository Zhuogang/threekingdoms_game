import { createPersonnelDay } from '../../../src/v03/campaign/personnel';
import type { V03GameState } from '../../../src/v03/types';

/** Controlled campaign tests need a dispatchable force; the reviewed opening no longer
 * starts Cheng Yu in Cao Cao's service. Configure soldiers explicitly, without
 * relying on an unrelated historical officer's original seed allocation. */
export function preparePuyangArmy(state: V03GameState): void {
  const city = state.cities.find((city) => city.id === 'puyang')!;
  // Model a previously recruited subordinate: the incumbent governor stays behind.
  const commander = state.officers.find((officer) => officer.id === 'chengyu')!;
  commander.factionId = city.factionId;
  const added = 2000 - commander.troops;
  commander.troops = 2000;
  city.garrisonTroops += added;
  city.population -= added;
  state.personnelDay = createPersonnelDay(state);
}
