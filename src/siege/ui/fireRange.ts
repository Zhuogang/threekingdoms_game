import { MAP_WIDTH, MAP_HEIGHT } from '../content/chencang';
import { activeUnit } from '../rules/combat';
import { cellTerrain } from '../rules/map';
import { fireArrowsReason } from '../rules/preparations';
import type { SiegeSide, SiegeState } from '../rules/types';

/** A hypothetical ladder uses the actual fire-arrow validator. Movement and
 * occupancy are irrelevant to range; suppression and preparation readiness are not. */
export function fireRangeCells(state: SiegeState, firingSide: SiegeSide = 'wei') {
  const archers = state.units.filter(
    (u) =>
      u.side === firingSide &&
      activeUnit(u) &&
      !u.acted &&
      u.level === 'wall' &&
      u.troopType === 'archer',
  );
  return Array.from({ length: MAP_WIDTH * MAP_HEIGHT }, (_, i) => ({
    x: i % MAP_WIDTH,
    y: Math.floor(i / MAP_WIDTH),
    level: 'ground' as const,
  })).filter(
    (c) =>
      !['wall', 'gate', 'building', 'water'].includes(cellTerrain(state, c.x, c.y)) &&
      archers.some(
        (u) =>
          fireArrowsReason(state, u, {
            ...c,
            id: 'range-probe',
            kind: 'ladder',
            durability: 1,
            max: 1,
            moved: false,
            acted: false,
            burning: false,
            wrecked: false,
          }) === null,
      ),
  );
}
