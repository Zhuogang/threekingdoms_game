import { H, MAP_DIR, MAP_FILES, W, patchOf } from './assets';
import type { StatePatch } from './stateArt';

const images = new Map<string, Promise<HTMLImageElement>>();
function load(href: string) {
  let pending = images.get(href);
  if (!pending) {
    pending = (async () => {
      const image = new Image();
      image.src = href;
      await image.decode();
      return image;
    })();
    images.set(href, pending);
  }
  return pending;
}
/** Rasterize once per changed fortification state, never on pan, hover or unit moves. */
export async function composeSiegePainting(patches: StatePatch[]): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const context = canvas.getContext('2d')!;
  context.drawImage(await load(MAP_FILES[`${MAP_DIR}/composite.webp`]!), 0, 0);
  for (const patch of patches) {
    const info = patchOf(patch.state);
    const image = await load(info.href);
    context.save();
    if (patch.clip) {
      const [x0, y0, x1, y1] = patch.clip;
      context.beginPath();
      context.rect(x0, y0, x1 - x0, y1 - y0);
      context.clip();
    }
    context.globalAlpha = patch.opacity ?? 1;
    context.drawImage(image, info.at[0], info.at[1]);
    context.restore();
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas encoding failed'))),
      'image/webp',
      0.95,
    ),
  );
  return URL.createObjectURL(blob);
}
