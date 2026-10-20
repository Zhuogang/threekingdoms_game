import { describe, expect, it } from 'vitest';
import {
  battleBoard,
  cameraFit,
  cameraOrigin,
  screenToWorld,
  worldToScreen,
  BATTLE_INSETS,
} from '../src/rendering/cameraGeometry';
import { getOfficerIdentity, OFFICER_IDENTITIES } from '../src/content/officerIdentity';
import { INITIAL_OFFICERS } from '../src/content/scenario';

describe('battle camera coordinates and presentation identity', () => {
  it.each([
    [966, 600, 48],
    [1480, 912, 64],
    [880, 552, 44],
  ])('fits all cells with unobscured margins at %i x %i', (width, height, minimumTile) => {
    const board = battleBoard(12, 10),
      scale = cameraFit(width, height, board, BATTLE_INSETS);
    const origin = cameraOrigin(width, height, board, BATTLE_INSETS, scale, { x: 0, y: 0 });
    const first = worldToScreen({ x: board.left, y: board.top }, origin, scale);
    const last = worldToScreen(
      { x: board.left + board.width, y: board.top + board.height },
      origin,
      scale,
    );
    expect(board.tile * scale).toBeGreaterThanOrEqual(minimumTile);
    expect(first.x).toBeGreaterThanOrEqual(12);
    expect(first.y).toBeGreaterThanOrEqual(12);
    expect(last.x).toBeLessThanOrEqual(width - 12);
    expect(last.y).toBeLessThanOrEqual(height - 12);
  });
  it('round trips every cell after zoom and pan without changing tile coordinates', () => {
    const board = battleBoard(12, 10);
    for (const scale of [0.7, 1, 1.6, 2.8]) {
      const origin = cameraOrigin(900, 600, board, BATTLE_INSETS, scale, { x: 91, y: -113 });
      for (let y = 0; y < 10; y++)
        for (let x = 0; x < 12; x++) {
          const point = {
            x: board.left + (x + 0.5) * board.tile,
            y: board.top + (y + 0.5) * board.tile,
          };
          const result = screenToWorld(worldToScreen(point, origin, scale), origin, scale);
          expect(Math.floor((result.x - board.left) / board.tile)).toBe(x);
          expect(Math.floor((result.y - board.top) / board.tile)).toBe(y);
        }
    }
  });
  it('covers the exact named roster without inferring identity from IDs', () => {
    expect(Object.keys(OFFICER_IDENTITIES).sort()).toEqual(
      INITIAL_OFFICERS.map((o) => o.id).sort(),
    );
    for (const officer of INITIAL_OFFICERS)
      expect(getOfficerIdentity(officer.id)).toMatchObject({
        name: officer.name,
        chinese: officer.chinese,
      });
    expect(getOfficerIdentity('maliang')?.name).toBe('Ma Teng');
    expect(getOfficerIdentity('zuzhao')?.name).toBe('Zu Mao');
    expect(getOfficerIdentity('xiahoudun')?.surnameZh).toBe('夏侯');
    expect(getOfficerIdentity('taishici')?.surnameEn).toBe('Taishi');
    expect(getOfficerIdentity('liuyan')?.surnameZh).toBe('刘');
    expect(getOfficerIdentity('constructor')).toBeUndefined();
  });
});
