import { battleArtUrls } from './assets';
import { portraitArtUrls } from './portraits';
import { storyArtUrls } from '../ui/storyAssets';

export const runtimeArtUrls = [...new Set([...battleArtUrls, ...storyArtUrls, ...portraitArtUrls])];

// Keep decoded sources alive for the entire page, including across React remounts.
const retainedImages: HTMLImageElement[] = [];
let progress = { loaded: 0, total: runtimeArtUrls.length, failed: 0 };
let pending: Promise<void> | undefined;
const listeners = new Set<() => void>();
export const artPreloadProgress = () => progress;
export function subscribeArtPreload(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function load(url: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const image = new Image();
    retainedImages.push(image);
    image.src = url;
    try {
      await image.decode();
      return true;
    } catch {
      // Some browsers reject decode for an otherwise usable image.
      if (image.naturalWidth) return true;
    }
  }
  return false;
}

/** Background singleton; callers may subscribe but never need to await it. */
export function startArtPreload(): Promise<void> {
  return (pending ??= (async () => {
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(8, runtimeArtUrls.length) }, async () => {
        while (next < runtimeArtUrls.length) {
          const ok = await load(runtimeArtUrls[next++]!);
          progress = {
            ...progress,
            loaded: progress.loaded + Number(ok),
            failed: progress.failed + Number(!ok),
          };
          listeners.forEach((listener) => listener());
        }
      }),
    );
  })());
}
