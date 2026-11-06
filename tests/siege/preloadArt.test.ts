import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAP_FILES,
  SHEET_IMAGES,
  PATCH_IMAGES,
  INNER_WALL_MASKS,
  EFFECT_IMAGES,
  POSE_SETS,
} from '../../src/siege/render/assets';
import { storyArtUrls } from '../../src/siege/ui/storyAssets';
import { portraitArtUrls, portraitOf } from '../../src/siege/render/portraits';
import { SHU_ROSTER, WEI_ROSTER } from '../../src/siege/content/chencang';
import {
  runtimeArtUrls,
  startArtPreload,
  artPreloadProgress,
  subscribeArtPreload,
} from '../../src/siege/render/preloadArt';

afterEach(() => vi.unstubAllGlobals());

describe('runtime art preload', () => {
  it('includes every runtime source once, excluding the review grid and unused pose variants', () => {
    const expected = [
      ...Object.entries(MAP_FILES)
        .filter(([p]) => !p.endsWith('/grid.png'))
        .map(([, u]) => u),
      ...Object.values(SHEET_IMAGES),
      ...Object.values(PATCH_IMAGES),
      ...Object.values(INNER_WALL_MASKS),
      ...Object.values(EFFECT_IMAGES),
      ...Object.values(POSE_SETS).flatMap(({ poses }) => [...poses.values()].map((p) => p.href)),
      ...storyArtUrls,
      ...portraitArtUrls,
      ...[...SHU_ROSTER, ...WEI_ROSTER].map(portraitOf).filter((u) => u !== undefined),
    ];
    expect(new Set(runtimeArtUrls).size).toBe(runtimeArtUrls.length);
    expect(new Set(runtimeArtUrls)).toEqual(new Set(expected));
    expect(runtimeArtUrls.every((u) => typeof u === 'string' && u.length > 0)).toBe(true);
    expect(runtimeArtUrls).not.toContain(
      Object.entries(MAP_FILES).find(([p]) => p.endsWith('/grid.png'))![1],
    );
    const bytes = runtimeArtUrls.reduce((sum, url) => {
      const path = url.split('?')[0]!;
      return (
        sum + statSync(resolve(path.startsWith('/docs/') ? `.${path}` : `public/${path}`)).size
      );
    }, 0);
    console.info(
      `Art preload: ${runtimeArtUrls.length} URLs, ${bytes} bytes, ${(bytes / 1e6).toFixed(6)} MB`,
    );
  });

  it('runs once with at most eight decodes, retries once, and accepts usable decode failures', async () => {
    let active = 0,
      peak = 0;
    const attempts = new Map<string, number>();
    class FakeImage {
      src = '';
      naturalWidth = 0;
      async decode() {
        const n = (attempts.get(this.src) ?? 0) + 1;
        attempts.set(this.src, n);
        peak = Math.max(peak, ++active);
        await Promise.resolve();
        active--;
        if (this.src === runtimeArtUrls[0] && n === 1) throw new Error('retry');
        if (this.src === runtimeArtUrls[1]) throw new Error('permanent failure');
        this.naturalWidth = 32;
        if (this.src === runtimeArtUrls[2]) throw new Error('usable image');
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const listener = vi.fn(),
      unsubscribe = subscribeArtPreload(listener);
    const pending = startArtPreload();
    expect(startArtPreload()).toBe(pending);
    await pending;
    expect(startArtPreload()).toBe(pending);
    expect(peak).toBe(8);
    expect(artPreloadProgress()).toEqual({
      loaded: runtimeArtUrls.length - 1,
      total: runtimeArtUrls.length,
      failed: 1,
    });
    expect(attempts.get(runtimeArtUrls[0]!)).toBe(2);
    expect(attempts.get(runtimeArtUrls[1]!)).toBe(2);
    expect(attempts.get(runtimeArtUrls[2]!)).toBe(1);
    expect([...attempts.values()].reduce((a, b) => a + b, 0)).toBe(runtimeArtUrls.length + 2);
    expect(listener).toHaveBeenCalledTimes(runtimeArtUrls.length);
    unsubscribe();
    await startArtPreload();
    expect(listener).toHaveBeenCalledTimes(runtimeArtUrls.length);
    console.info(
      `Preload mock: peak ${peak}, ${runtimeArtUrls.length + 2} attempts, ${runtimeArtUrls.length - 1} loaded, 1 failed`,
    );
  });
});
