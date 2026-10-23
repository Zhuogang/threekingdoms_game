import { describe, expect, it } from 'vitest';
import {
  battlefieldBounds,
  gridToWorld,
  V03_BATTLEFIELD_PADDING,
  worldToGrid,
} from '../../../src/v03/rendering/geometry';
import {
  battlefieldViewportGridPolygon,
  fitBattlefieldViewport,
  focusBattlefieldPointsViewport,
  focusBattlefieldViewport,
  panBattlefieldViewport,
  recenterBattlefieldViewport,
  resizeBattlefieldViewport,
  zoomBattlefieldViewport,
} from '../../../src/v03/rendering/battlefield-viewport';

const bounds = battlefieldBounds(24, 20, V03_BATTLEFIELD_PADDING);

describe('battlefield camera and minimap geometry', () => {
  it('fits the full square-grid board to the frame aspect ratio', () => {
    const viewport = fitBattlefieldViewport(bounds, 16 / 9);
    expect(viewport.width / viewport.height).toBeCloseTo(16 / 9);
    expect(viewport.left).toBeLessThan(bounds.left);
    expect(viewport.top).toBeLessThan(bounds.top);
    expect(viewport.left + viewport.width).toBeGreaterThan(bounds.right);
    expect(viewport.top + viewport.height).toBeGreaterThan(bounds.bottom);
  });

  it('zooms toward a pointer while keeping the same world point under it', () => {
    const start = fitBattlefieldViewport(bounds, 16 / 9);
    const focus = { x: start.left + start.width * 0.62, y: start.top + start.height * 0.41 };
    const zoomed = zoomBattlefieldViewport(start, bounds, focus, 2);
    expect(zoomed.width).toBeCloseTo(start.width / 2);
    expect(zoomed.height).toBeCloseTo(start.height / 2);
    expect((focus.x - zoomed.left) / zoomed.width).toBeCloseTo(0.62);
    expect((focus.y - zoomed.top) / zoomed.height).toBeCloseTo(0.41);
  });

  it('re-centers at the same zoom and clamps panning at board edges', () => {
    const start = focusBattlefieldViewport(
      bounds,
      fitBattlefieldViewport(bounds, 1.5),
      { x: 20, y: 20 },
      2.5,
    );
    const centered = recenterBattlefieldViewport(start, bounds, { x: 450, y: 620 });
    expect(centered.width).toBe(start.width);
    expect(centered.height).toBe(start.height);
    expect(centered.left + centered.width / 2).toBeCloseTo(450);
    expect(centered.top + centered.height / 2).toBeCloseTo(620);

    const clamped = panBattlefieldViewport(start, { x: 50_000, y: 50_000 }, bounds);
    expect(clamped.left).toBe(bounds.left);
    expect(clamped.top).toBe(bounds.top);
  });

  it('preserves camera center and relative zoom when the frame changes shape', () => {
    const start = focusBattlefieldViewport(
      bounds,
      fitBattlefieldViewport(bounds, 16 / 9),
      { x: 500, y: 600 },
      2.25,
    );
    const center = { x: start.left + start.width / 2, y: start.top + start.height / 2 };
    const resized = resizeBattlefieldViewport(bounds, start, 4 / 3);
    const resizedFit = fitBattlefieldViewport(bounds, 4 / 3);
    expect(resized.width / resized.height).toBeCloseTo(4 / 3);
    expect(resized.left + resized.width / 2).toBeCloseTo(center.x);
    expect(resized.top + resized.height / 2).toBeCloseTo(center.y);
    expect(resizedFit.width / resized.width).toBeCloseTo(2.25);
  });

  it('frames two camps together and maps the view box into minimap grid coordinates', () => {
    const current = fitBattlefieldViewport(bounds, 16 / 9);
    const camps = [gridToWorld({ x: 2, y: 2 }), gridToWorld({ x: 21, y: 17 })];
    const focused = focusBattlefieldPointsViewport(bounds, current, camps, 140);
    for (const camp of camps) {
      expect(camp.x).toBeGreaterThanOrEqual(focused.left);
      expect(camp.x).toBeLessThanOrEqual(focused.left + focused.width);
      expect(camp.y).toBeGreaterThanOrEqual(focused.top);
      expect(camp.y).toBeLessThanOrEqual(focused.top + focused.height);
    }
    const polygon = battlefieldViewportGridPolygon(focused);
    expect(polygon).toHaveLength(4);
    expect(polygon[0]).toEqual(worldToGrid({ x: focused.left, y: focused.top }));
    expect(polygon[2]).toEqual(
      worldToGrid({ x: focused.left + focused.width, y: focused.top + focused.height }),
    );
  });
});
