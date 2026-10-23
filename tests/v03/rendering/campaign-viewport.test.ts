import { describe, expect, it } from 'vitest';
import {
  campaignMinimapToWorld,
  campaignWorldToMinimap,
  fitCampaignViewport,
  focusCampaignViewport,
  panCampaignViewport,
  recenterCampaignViewport,
  resizeCampaignViewport,
  zoomCampaignViewport,
} from '../../../src/v03/rendering/campaign-viewport';

const bounds = { left: 0, top: 0, width: 1000, height: 600 };

describe('campaign camera geometry', () => {
  it('fits the whole map with optional padding while matching the display aspect ratio', () => {
    const viewport = fitCampaignViewport(bounds, 2, 0.035);
    expect(viewport.width / viewport.height).toBeCloseTo(2);
    expect(viewport.left).toBeLessThan(bounds.left);
    expect(viewport.top).toBeLessThan(bounds.top);
    expect(viewport.left + viewport.width).toBeGreaterThan(bounds.width);
    expect(viewport.top + viewport.height).toBeGreaterThan(bounds.height);
  });

  it('preserves the approved geographic extent when the frame matches its aspect ratio', () => {
    const regionalBounds = { left: 0, top: 0, width: 1600, height: 1000 };
    expect(fitCampaignViewport(regionalBounds, 16 / 10)).toEqual(regionalBounds);
  });

  it('zooms toward the pointer while retaining its relative location', () => {
    const start = fitCampaignViewport(bounds, 2);
    const focus = { x: start.left + start.width * 0.7, y: start.top + start.height * 0.3 };
    const zoomed = zoomCampaignViewport(start, bounds, focus, 2);
    expect(zoomed.width).toBeCloseTo(start.width / 2);
    expect(zoomed.height).toBeCloseTo(start.height / 2);
    expect((focus.x - zoomed.left) / zoomed.width).toBeCloseTo(0.7);
    expect((focus.y - zoomed.top) / zoomed.height).toBeCloseTo(0.3);
  });

  it('keeps recentering at the current scale and clamps panning to the map', () => {
    const current = { left: 200, top: 100, width: 300, height: 180 };
    expect(recenterCampaignViewport(current, bounds, { x: 500, y: 300 })).toEqual({
      left: 350,
      top: 210,
      width: 300,
      height: 180,
    });
    expect(panCampaignViewport(current, { x: 10_000, y: 10_000 }, bounds)).toEqual({
      left: 0,
      top: 0,
      width: 300,
      height: 180,
    });
  });

  it('preserves campaign camera center and relative zoom when the frame resizes', () => {
    const start = focusCampaignViewport(
      bounds,
      fitCampaignViewport(bounds, 2),
      { x: 520, y: 320 },
      2.5,
    );
    const center = { x: start.left + start.width / 2, y: start.top + start.height / 2 };
    const resized = resizeCampaignViewport(bounds, start, 1);
    const resizedCenter = {
      x: resized.left + resized.width / 2,
      y: resized.top + resized.height / 2,
    };
    const resizedFit = fitCampaignViewport(bounds, 1);
    expect(resized.width / resized.height).toBeCloseTo(1);
    expect(resizedCenter.x).toBeCloseTo(center.x);
    expect(resizedCenter.y).toBeCloseTo(center.y);
    expect(resizedFit.width / resized.width).toBeCloseTo(2.5);
  });

  it('focuses a city at the requested zoom and round-trips minimap coordinates', () => {
    const fit = fitCampaignViewport(bounds, 5 / 3);
    const focus = focusCampaignViewport(bounds, fit, { x: 480, y: 290 }, 2);
    expect(focus.width).toBeCloseTo(fit.width / 2);
    const mini = { left: 10, top: 8, width: 220, height: 176 };
    const world = { x: 381, y: 417 };
    const restored = campaignMinimapToWorld(
      campaignWorldToMinimap(world, bounds, mini),
      mini,
      bounds,
    );
    expect(restored.x).toBeCloseTo(world.x);
    expect(restored.y).toBeCloseTo(world.y);
  });

  it('rejects invalid bounds instead of creating a broken SVG viewBox', () => {
    expect(() => fitCampaignViewport({ ...bounds, width: 0 }, 1)).toThrow(RangeError);
  });
});
