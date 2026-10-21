import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { TROOP_ART_KEY, type TroopArtKey } from '../content/troopArtwork';
import { TROOP_VISUALS } from '../content/troopVisuals';
import type { TroopType } from '../game/types';

export type UnitArt = Partial<Record<TroopArtKey, Texture>>;

export function troopInsignia(type: TroopType, size: number): Graphics {
  const icon = new Graphics().svg(
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#26362c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      TROOP_VISUALS[type].paths.map((d) => '<path d="' + d + '"/>').join('') +
      '</svg>',
  );
  icon.scale.set(size / 24);
  return icon;
}

/** Portraits are decoration: missing assets use the same distinct tactical insignia. */
export function drawUnitFigure(
  parent: Container,
  type: TroopType,
  art: UnitArt,
  x: number,
  y: number,
  width: number,
  height: number,
  faceLeft: boolean,
): void {
  const key = TROOP_ART_KEY[type];
  const texture = key ? art[key] : undefined;
  if (texture) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    const fit = Math.min(width / texture.width, height / texture.height);
    sprite.scale.set(faceLeft ? -fit : fit, fit);
    sprite.position.set(x, y);
    parent.addChild(sprite);
  } else {
    const size = Math.min(width, height) * 0.85;
    const icon = troopInsignia(type, size);
    icon.position.set(x - size / 2, y - size / 2);
    parent.addChild(icon);
  }
}
