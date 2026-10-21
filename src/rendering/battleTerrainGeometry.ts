import type { BattleState, Terrain } from '../game/types';

const DIRECTIONS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

/** Crossings and banks come only from actual tiles, including imported saves. */
export function battleTileVisual(
  battle: Pick<BattleState, 'width' | 'height' | 'terrain'>,
  x: number,
  y: number,
) {
  const at = (dx: number, dy: number): Terrain | undefined => {
    const px = x + dx,
      py = y + dy;
    return px < 0 || py < 0 || px >= battle.width || py >= battle.height
      ? undefined
      : battle.terrain[py * battle.width + px];
  };
  const terrain = at(0, 0) ?? 'plain';
  const water = DIRECTIONS.map(([dx, dy]) => at(dx, dy) === 'water');
  const ford =
    terrain === 'plain'
      ? water[0] && water[2]
        ? 'horizontal'
        : water[1] && water[3]
          ? 'vertical'
          : null
      : null;
  return { terrain, water, ford };
}
