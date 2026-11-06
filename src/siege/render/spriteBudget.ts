import { FRAME } from './assets';
import { spriteObject, type Sprite } from './mapPieces';
import { sliceObject } from './scene';
import { SPRITE_CAP } from './v02Art';

/** Count mandatory image instances, including row slices. Never cull scenery
 * or gameplay art. Silhouettes reference stable figure nodes through SVG use;
 * their group draws are reported separately from image-node count.
 * An oversized future state still draws in full, even if it exceeds the cap. */
export function boundSprites(candidates: Sprite[], reserved: number) {
  const used = candidates.reduce(
    (total, sprite) =>
      total +
      sliceObject(FRAME, spriteObject(sprite)).length +
      ('flame' in sprite && sprite.flame ? 1 : 0),
    reserved,
  );
  return { sprites: candidates, used, remaining: Math.max(0, SPRITE_CAP - used), omitted: 0 };
}
