import type { BetaDraw } from '../render/betaCity';
import type { ScreenRect } from '../render/scene';

export interface BetaSources {
  size: [number, number];
  ground: string;
  gate: string;
  kit: string;
  /** The chosen α painting and its object masks, for objects that have no piece yet. */
  painting: string;
  mask: (objectId: string) => string;
  bbox: (objectId: string) => ScreenRect;
}

/**
 * Paints the β city into one picture the size of the S1-01 frame, so the
 * preview can cut it into layers with the same masks as the α painting.
 * Returns an object URL; the caller revokes it.
 */
export async function composeBeta(
  draws: BetaDraw[],
  sources: BetaSources,
  fillFromPainting: boolean,
): Promise<string> {
  const [width, height] = sources.size;
  const [ground, gate, kit, painting] = await Promise.all(
    [sources.ground, sources.gate, sources.kit, sources.painting].map(load),
  );
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(ground!, 0, 0, width, height);
  for (const draw of draws) {
    if (draw.type === 'sheet') {
      const [sx0, sy0, sx1, sy1] = draw.src;
      const [dx0, dy0, dx1, dy1] = draw.dest;
      context.drawImage(
        draw.sheet === 'gate' ? gate! : kit!,
        sx0,
        sy0,
        sx1 - sx0,
        sy1 - sy0,
        dx0,
        dy0,
        dx1 - dx0,
        dy1 - dy0,
      );
    } else if (fillFromPainting) {
      const box = sources.bbox(draw.objectId);
      const cut = cutOut(painting!, await load(sources.mask(draw.objectId)), box);
      context.drawImage(cut, box[0], box[1]);
    }
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('could not encode the β city');
  return URL.createObjectURL(blob);
}

/** The painting inside one box, with the grey mask turned into alpha. */
function cutOut(painting: HTMLImageElement, mask: HTMLImageElement, box: ScreenRect) {
  const [x0, y0, x1, y1] = box;
  const pixels = (image: HTMLImageElement) => {
    const layer = document.createElement('canvas');
    layer.width = x1 - x0;
    layer.height = y1 - y0;
    const context = layer.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(image, -x0, -y0);
    return { layer, context, data: context.getImageData(0, 0, layer.width, layer.height) };
  };
  const paint = pixels(painting);
  const { data: cover } = pixels(mask);
  for (let i = 3; i < paint.data.data.length; i += 4)
    paint.data.data[i] = (paint.data.data[i]! * cover.data[i - 3]!) / 255;
  paint.context.putImageData(paint.data, 0, 0);
  return paint.layer;
}

function load(href: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${href}`));
    image.src = href;
  });
}
