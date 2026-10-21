import { describe, expect, it } from 'vitest';
import {
  BATTLE_VIEW_INSETS,
  battlefieldBounds,
  cameraOrigin,
  clipPolygonToGrid,
  clientToViewBoxPoint,
  diamondVertices,
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

describe('v0.3 2:1 battlefield projection and hit testing', () => {
  it('round trips all 480 logical cell centers through the fixed 2:1 projection', () => {
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 24; x++) {
        const world = gridToWorld({ x, y });
        expect(worldToGrid(world)).toEqual({ x, y });
        expect(hitTestWorld(world, 24, 20)).toEqual({ x, y });
      }
    }
  });

  it('uses stable row-first ownership at a shared diamond vertex', () => {
    const vertex = diamondVertices(gridToWorld({ x: 1, y: 1 }))[0];
    expect(vertex).toBeDefined();
    expect(hitTestWorld(vertex!, 24, 20)).toEqual({ x: 0, y: 0 });
  });

  it('rejects locations beyond the outer diamond boundary', () => {
    expect(hitTestWorld({ x: -1281, y: -32 }, 24, 20)).toBeNull();
    expect(hitTestWorld({ x: 1537, y: 672 }, 24, 20)).toBeNull();
    expect(() => battlefieldBounds(0, 20)).toThrow(RangeError);
  });

  it('builds bounds from the full diamond vertices instead of the old rectangular board', () => {
    expect(battlefieldBounds(24, 20)).toMatchObject({
      left: -1280,
      right: 1536,
      top: -32,
      bottom: 1376,
      width: 2816,
      height: 1408,
    });
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
