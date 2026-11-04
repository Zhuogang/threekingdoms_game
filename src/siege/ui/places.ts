import {
  CITY_BOUNDS as B,
  GATES,
  layoutSymbol,
  CHENCANG_LAYOUT,
  COURTYARD,
  sameCell,
} from '../content/chencang';
import { siegeText, type SiegeLocale, type SiegeTextKey } from '../i18n';
import type { Cell, SiegePosition } from '../rules/types';

export function reportCell(
  value: unknown,
  level: SiegePosition['level'] = 'wall',
): SiegePosition | null {
  if (typeof value !== 'string' || !/^\d+,\d+$/.test(value)) return null;
  const [x, y] = value.split(',').map(Number);
  return { x: x!, y: y!, level };
}

/** Names follow the outer wall runs, whose ends are towers and gatehouses.
 * Ground approaches inherit the run above them; coordinates never enter copy. */
export function placeName(position: Cell | string | null | undefined, locale: SiegeLocale): string {
  const p = typeof position === 'string' ? reportCell(position) : position;
  let key: SiegeTextKey = 'placeBattlefield';
  if (p) {
    const nearest = (['north', 'south', 'west', 'east'] as const).reduce((a, b) => {
      const d = (s: typeof a) => Math.abs((s === 'north' || s === 'south' ? p.y : p.x) - B[s]);
      return d(b) < d(a) ? b : a;
    });
    const side =
      p.y >= B.south
        ? 'south'
        : p.y <= B.north
          ? 'north'
          : p.x <= B.west
            ? 'west'
            : p.x >= B.east
              ? 'east'
              : nearest;
    const gate = GATES[side];
    const horizontal = side === 'north' || side === 'south';
    const along = horizontal ? p.x : p.y;
    const gateAlong = gate.cells.map((c) => (horizontal ? c.x : c.y));
    const atGate = along >= Math.min(...gateAlong) && along <= Math.max(...gateAlong);
    key = atGate
      ? (
          {
            north: 'placeNorthGate',
            south: 'placeSouthGate',
            west: 'placeWestGate',
            east: 'placeEastGate',
          } as const
        )[side]
      : horizontal
        ? side === 'south'
          ? along < gateAlong[0]!
            ? 'placeSouthWest'
            : 'placeSouthEast'
          : along < gateAlong[0]!
            ? 'placeNorthWest'
            : 'placeNorthEast'
        : side === 'west'
          ? along < gateAlong[0]!
            ? 'placeWestNorth'
            : 'placeWestSouth'
          : along < gateAlong[0]!
            ? 'placeEastNorth'
            : 'placeEastSouth';
    if (
      p.y >= CHENCANG_LAYOUT.findIndex((row) => row.includes('P')) ||
      layoutSymbol(p.x, p.y) === 'C'
    )
      key = 'placeCamp';
    else if (COURTYARD.some((cell) => sameCell(cell, p))) key = 'placeCourtyard';
  }
  return siegeText(locale, key);
}
