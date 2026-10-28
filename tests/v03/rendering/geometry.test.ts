import { describe, expect, it } from 'vitest';
import {
  BATTLE_VIEW_INSETS,
  battlefieldBounds,
  cameraOrigin,
  clipPolygonToGrid,
  cellVertices,
  clientToViewBoxPoint,
  fitScale,
  gridToScreen,
  gridToWorld,
  hitTestScreen,
  hitTestWorld,
  minimapCellAt,
  minimapPoint,
  routeBounds,
  routePolyline,
  screenToGrid,
  worldToGrid,
} from '../../../src/v03/rendering/geometry';

describe('v0.3 top-down square battlefield projection and hit testing', () => {
  it('round trips every cell center of 24×20 and 48×32 boards', () => {
    for (const [width, height] of [
      [24, 20],
      [48, 32],
    ] as const)
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const world = gridToWorld({ x, y });
          expect(world).toEqual({ x: x * 64, y: y * 64 });
          expect(worldToGrid(world)).toEqual({ x, y });
          expect(hitTestWorld(world, width, height)).toEqual({ x, y });
        }
      }
  });

  it('picks the cell under any point inside its square', () => {
    const center = gridToWorld({ x: 5, y: 7 });
    for (const [dx, dy] of [
      [-31, -31],
      [31, -31],
      [31, 31],
      [-31, 31],
      [0, 0],
    ] as const)
      expect(hitTestWorld({ x: center.x + dx, y: center.y + dy }, 24, 20)).toEqual({ x: 5, y: 7 });
  });

  it('uses stable row-first ownership at a shared cell corner', () => {
    const corner = cellVertices(gridToWorld({ x: 1, y: 1 }))[0];
    expect(corner).toEqual({ x: 32, y: 32 });
    expect(hitTestWorld(corner!, 24, 20)).toEqual({ x: 0, y: 0 });
  });

  it('rejects locations beyond the outer board edge', () => {
    expect(hitTestWorld({ x: -33, y: 0 }, 24, 20)).toBeNull();
    expect(hitTestWorld({ x: 0, y: 1249 }, 24, 20)).toBeNull();
    expect(hitTestWorld({ x: 1505, y: 0 }, 24, 20)).toBeNull();
    expect(() => battlefieldBounds(0, 20)).toThrow(RangeError);
  });

  it('builds bounds from the square cell edges plus padding', () => {
    expect(battlefieldBounds(24, 20)).toMatchObject({
      left: -32,
      right: 1504,
      top: -32,
      bottom: 1248,
      width: 1536,
      height: 1280,
    });
    expect(battlefieldBounds(48, 32, 24)).toMatchObject({ width: 3120, height: 2096 });
  });

  it.each([
    [966, 600],
    [1480, 912],
    [390, 780],
  ])(
    'keeps cell picks stable through fit, pan, and zoom at %i×%i',
    (viewportWidth, viewportHeight) => {
      const bounds = battlefieldBounds(24, 20, 140);
      const baseScale = fitScale(viewportWidth, viewportHeight, bounds, BATTLE_VIEW_INSETS);
      for (const zoom of [0.7, 1, 1.6, 2.8]) {
        const scale = baseScale * zoom;
        const origin = cameraOrigin(
          viewportWidth,
          viewportHeight,
          bounds,
          BATTLE_VIEW_INSETS,
          scale,
          { x: 91, y: -43 },
        );
        for (const cell of [
          { x: 0, y: 0 },
          { x: 23, y: 0 },
          { x: 0, y: 19 },
          { x: 23, y: 19 },
          { x: 11, y: 10 },
        ]) {
          const screen = gridToScreen(gridToWorld(cell), origin, scale);
          expect(hitTestScreen(screen, { origin, scale }, 24, 20)).toEqual(cell);
          const grid = screenToGrid(screen, origin, scale);
          expect(grid.x).toBeCloseTo(cell.x, 8);
          expect(grid.y).toBeCloseTo(cell.y, 8);
        }
      }
    },
  );

  it('handles SVG letterboxing when mapping pointer coordinates into the viewBox', () => {
    const view = { left: -10, top: -5, width: 100, height: 50 };
    expect(
      clientToViewBoxPoint(
        { x: 150, y: 100 },
        { left: 100, top: 50, width: 200, height: 200 },
        view,
      ),
    ).toEqual({ x: 15, y: -5 });
  });
});

describe('v0.3 overview geometry', () => {
  const minimap = { left: 10, top: 10, right: 230, bottom: 190, width: 220, height: 180 };

  it('round trips every cell center in the top-down minimap', () => {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 24; x++) {
        const point = minimapPoint({ x, y }, 24, 20, minimap);
        expect(minimapCellAt(point, 24, 20, minimap)).toEqual({ x, y });
      }
    }
  });

  it('clips the view polygon to board edges and builds route bounds from supplied points', () => {
    const polygon = clipPolygonToGrid(
      [
        { x: -3, y: 1 },
        { x: 8, y: 1 },
        { x: 8, y: 8 },
        { x: -3, y: 8 },
      ],
      24,
      20,
    );
    expect(
      polygon.every(
        (point) => point.x >= -0.5 && point.x <= 23.5 && point.y >= -0.5 && point.y <= 19.5,
      ),
    ).toBe(true);
    expect(
      routePolyline([
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ]),
    ).toEqual([gridToWorld({ x: 1, y: 2 }), gridToWorld({ x: 3, y: 4 })]);
    expect(routeBounds([])).toBeNull();
    expect(
      routeBounds(
        routePolyline([
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ]),
      ),
    ).not.toBeNull();
  });
});
