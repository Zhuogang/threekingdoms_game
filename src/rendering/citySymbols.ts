import { Container, Graphics } from 'pixi.js';
import type { City } from '../game/types';

type CityStyle = 'imperial' | 'grand' | 'rural' | 'fortress' | 'river' | 'town';
// Authored visual identities, independent of ownership, wealth and game rules.
const CITY_STYLES: Record<string, CityStyle> = {
  luoyang: 'imperial',
  changan: 'imperial',
  ye: 'grand',
  chengdu: 'grand',
  jianye: 'grand',
  pingyuan: 'rural',
  zitong: 'rural',
  tianshui: 'fortress',
  hanzhong: 'fortress',
  beiping: 'fortress',
  jinyang: 'fortress',
  jiangxia: 'river',
  jiangling: 'river',
  chaisang: 'river',
  wu: 'river',
};
const INK = 0x3c4540;
const PLASTER = 0xf3eddb;
const styleOf = (city: City): CityStyle => CITY_STYLES[city.id] ?? 'town';
const SYMBOL_BOUNDS = {
  imperial: { left: 31, right: 36, top: 40, bottom: 20 },
  grand: { left: 30, right: 33, top: 30, bottom: 18 },
  rural: { left: 19, right: 23, top: 17, bottom: 15 },
  fortress: { left: 21, right: 25, top: 24, bottom: 18 },
  river: { left: 22, right: 25, top: 24, bottom: 23 },
  town: { left: 21, right: 25, top: 24, bottom: 18 },
};
export const citySymbolBounds = (city: City) => SYMBOL_BOUNDS[styleOf(city)];

/** CSS-pixel envelope shared by labels, selection rings and pointer hit areas. */
export function citySymbolRadius(city: City): number {
  const style = styleOf(city);
  return style === 'imperial' ? 40 : style === 'grand' ? 32 : style === 'rural' ? 23 : 28;
}

/** Ink silhouettes retain faction roofs/flags across all architectural variants. */
export function drawCityKeep(parent: Container, city: City, color: number, fit: number): void {
  const style = styleOf(city);
  const imperial = style === 'imperial';
  const grand = imperial || style === 'grand';
  const keep = new Graphics();
  keep.position.set(city.x, city.y);
  keep.scale.set((imperial ? 1.45 : grand ? 1.35 : style === 'rural' ? 1.15 : 1.3) / fit);
  parent.addChild(keep);
  const roof = (x: number, y: number, half: number, fill = color) => {
    keep
      .poly([
        x - half - 2,
        y + 1,
        x - half + 1,
        y - 1,
        x,
        y - 5,
        x + half - 1,
        y - 1,
        x + half + 2,
        y + 1,
        x + half,
        y + 2,
        x - half,
        y + 2,
      ])
      .fill(fill)
      .stroke({ color: INK, width: 0.8, join: 'round' });
  };
  const banner = (x: number, y: number) => {
    keep
      .moveTo(x, y + 12)
      .lineTo(x, y)
      .stroke({ color: INK, width: 0.9 });
    keep
      .poly([x, y, x + 6, y + 2, x, y + 5])
      .fill(color)
      .stroke({ color: INK, width: 0.6 });
  };
  keep.ellipse(0, 8, grand ? 21 : 16, 5).fill({ color: INK, alpha: 0.13 });

  if (style === 'rural') {
    // A low earthen enclosure and two modest thatched houses, without a palace.
    keep
      .poly([-14, 3, -10, 1, -5, 3, 2, 2, 8, 3, 14, 2, 14, 10, -14, 10])
      .fill(0xd7cbb1)
      .stroke({ color: INK, width: 0.8 });
    for (const [x, y, half] of [
      [-6, -3, 6],
      [6, 0, 5],
    ] as const) {
      keep
        .rect(x - half + 1, y, half * 2 - 2, 8)
        .fill(PLASTER)
        .stroke({ color: INK, width: 0.8 });
      roof(x, y, half, 0xa79b7e);
      keep.rect(x - 1, y + 3, 2, 5).fill(INK);
      keep
        .moveTo(x - 3, y - 2)
        .lineTo(x - 4, y + 1)
        .moveTo(x + 2, y - 2)
        .lineTo(x + 3, y + 1)
        .stroke({ color: INK, alpha: 0.4, width: 0.6 });
    }
    banner(13, -13);
    return;
  }

  if (grand) {
    // Palace precincts have a second roof tier, side halls and a wider stone wall.
    keep.rect(-8, -16, 16, 13).fill(PLASTER).stroke({ color: INK, width: 1 });
    roof(0, -16, 10);
    if (imperial) {
      keep.rect(-5, -22, 10, 6).fill(PLASTER).stroke({ color: INK, width: 0.8 });
      roof(0, -22, 7);
      keep.moveTo(-6, -20).lineTo(6, -20).stroke({ color: 0xb58c51, width: 1 });
    }
    for (const x of [-14, 14]) {
      keep
        .rect(x - 5, -9, 10, 13)
        .fill(PLASTER)
        .stroke({ color: INK, width: 0.9 });
      roof(x, -9, 6);
      keep.rect(x - 1, -5, 2, 4).fill(color);
    }
  }

  const wall = grand ? 20 : 14;
  keep
    .roundRect(-wall, -2, wall * 2, 12, 1)
    .fill(PLASTER)
    .stroke({ color: INK, width: 1.1 });
  for (let x = -wall; x <= wall - 4; x += 6) {
    keep.rect(x, -5, 4, 5).fill(PLASTER).stroke({ color: INK, width: 0.8 });
  }
  if (style === 'fortress') {
    for (const x of [-11, 11]) {
      keep
        .rect(x - 4, -11, 8, 18)
        .fill(0xd7d6c8)
        .stroke({ color: INK, width: 1 });
      for (const dx of [-4, 1])
        keep
          .rect(x + dx, -14, 3, 4)
          .fill(PLASTER)
          .stroke({ color: INK, width: 0.8 });
      keep.rect(x - 1, -7, 2, 5).fill(INK);
    }
  }
  keep.rect(-6, -10, 12, 11).fill(PLASTER).stroke({ color: INK, width: 1 });
  roof(0, -10, 8);
  keep.roundRect(-3, 2, 6, 8, 3).fill(INK);
  for (const x of [-3, 1]) keep.rect(x, -6, 2, 4).fill(color);
  keep
    .moveTo(-wall + 2, 5)
    .lineTo(-5, 5)
    .moveTo(5, 5)
    .lineTo(wall - 2, 5)
    .stroke({ color: INK, alpha: 0.35, width: 0.6 });
  banner(grand ? 18 : 12, grand ? -21 : -17);
  if (style === 'river') {
    // Small quay and water strokes identify river settlements without adding UI text.
    for (const y of [12, 15])
      keep
        .moveTo(-16, y)
        .quadraticCurveTo(-7, y - 2, 0, y)
        .quadraticCurveTo(8, y + 2, 16, y)
        .stroke({ color: 0x75928c, width: 0.8, alpha: 0.8 });
    keep
      .moveTo(7, 8)
      .lineTo(7, 15)
      .moveTo(12, 8)
      .lineTo(12, 15)
      .moveTo(5, 12)
      .lineTo(14, 12)
      .stroke({ color: INK, width: 0.8 });
  }
}
