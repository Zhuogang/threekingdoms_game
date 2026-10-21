import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { BattleState } from '../game/types';
import { battleBoard } from './cameraGeometry';
import { decorativeRandom } from './mapGeometry';
import { battleGeography, type Landscape } from './battleGeography';
import { battleTileVisual } from './battleTerrainGeometry';

export type TerrainArt = Partial<Record<'pine' | 'grove' | 'ridge' | 'loess', Texture>>;
const INK = 0x465049;
const PAPER = 0xe9e7d8;
const GROUND: Record<Landscape, number> = {
  alluvial: 0xe5dfc6,
  dry: 0xe3d4b6,
  basin: 0xdde0c9,
  highland: 0xd7d7ca,
  southern: 0xdde3d0,
};
export function drawBattleTerrain(
  parent: Container,
  battle: BattleState,
  fit: number,
  art: TerrainArt,
  campColors: { attacker: number; defender: number },
): void {
  const board = battleBoard(battle.width, battle.height);
  const landscape = battleGeography(battle.order.targetId).landscape;
  const fertile = landscape === 'basin' || landscape === 'southern';
  const ground = new Graphics(),
    detail = new Container(),
    lines = new Graphics();
  parent.addChild(ground, detail, lines);
  ground
    .roundRect(board.left - 10, board.top - 10, board.width + 20, board.height + 20, 3)
    .fill(PAPER)
    .stroke({ color: INK, width: 1, alpha: 0.6 });
  ground.rect(board.left, board.top, board.width, board.height).fill(GROUND[landscape]);

  for (let y = 0; y < battle.height; y++)
    for (let x = 0; x < battle.width; x++) {
      const { terrain, water, ford } = battleTileVisual(battle, x, y);
      const size = board.tile,
        tx = board.left + x * size,
        ty = board.top + y * size;
      const random = decorativeRandom(3457 + y * 131 + x * 17);
      const g = new Graphics();
      detail.addChild(g);
      if (terrain === 'water') {
        // Adjacent water shares a continuous fill; only land-facing edges get banks.
        ground.rect(tx, ty, size, size).fill(0x9fbfba);
        ground.rect(tx + 3, ty + 3, size - 6, size - 6).fill({ color: 0x7da6a2, alpha: 0.12 });
        for (let row = 0; row < 5; row++) {
          const py = ty + 8 + row * 11,
            px = tx + 6 + random() * 8;
          g.moveTo(px, py)
            .bezierCurveTo(px + 12, py - 3, px + 27, py + 3, tx + size - 5, py)
            .stroke({ color: 0xf3f0de, width: 1.1, alpha: 0.7 });
        }
        const edges = [
          [tx + 2, ty + 2, tx + size - 2, ty + 2],
          [tx + size - 2, ty + 2, tx + size - 2, ty + size - 2],
          [tx + 2, ty + size - 2, tx + size - 2, ty + size - 2],
          [tx + 2, ty + 2, tx + 2, ty + size - 2],
        ];
        edges.forEach(([ax, ay, bx, by], i) => {
          if (water[i]) return;
          g.moveTo(ax!, ay!).lineTo(bx!, by!).stroke({ color: 0xd9d3b8, width: 4, alpha: 0.95 });
          g.moveTo(ax!, ay!).lineTo(bx!, by!).stroke({ color: 0x617e70, width: 0.9, alpha: 0.65 });
        });
      } else if (terrain === 'plain') {
        // Field contours describe open ground without implying a forest or water obstacle.
        if ((x + y) % 3 !== 0 && !ford) {
          g.poly([tx + 7, ty + 13, tx + 48, ty + 7, tx + 56, ty + 42, tx + 14, ty + 49]).fill({
            color: fertile ? 0xa4b68a : 0xbfb28c,
            alpha: 0.1,
          });
          for (let row = 0; row < 4; row++)
            g.moveTo(tx + 10, ty + 16 + row * 8)
              .lineTo(tx + 50, ty + 10 + row * 8)
              .stroke({ color: fertile ? 0x849879 : 0x9c9273, width: 0.7, alpha: 0.25 });
        }
        if (ford) {
          // A pale gravel causeway stays visibly dry and walkable, unlike blue water.
          const horizontal = ford === 'horizontal';
          g.rect(
            tx + (horizontal ? 0 : 20),
            ty + (horizontal ? 20 : 0),
            horizontal ? size : 24,
            horizontal ? 24 : size,
          ).fill({ color: 0xf4eed9, alpha: 0.9 });
          for (let i = 0; i < 10; i++) {
            const a = 4 + i * 5.7,
              b = 25 + (i % 3) * 5;
            g.ellipse(tx + (horizontal ? a : b), ty + (horizontal ? b : a), 2.3, 1.4).fill({
              color: 0x8b8d78,
              alpha: 0.65,
            });
          }
        }
      } else if (terrain === 'hill' || terrain === 'forest') {
        const key =
          terrain === 'forest'
            ? fertile
              ? 'grove'
              : 'pine'
            : landscape === 'highland'
              ? 'ridge'
              : 'loess';
        const texture = art[key];
        ground
          .rect(tx, ty, size, size)
          .fill({ color: terrain === 'forest' ? 0x9aa88e : 0xa9a18b, alpha: 0.19 });
        if (texture) {
          const sprite = new Sprite(texture);
          sprite.position.set(tx + 3, ty + 3);
          sprite.width = size - 6;
          sprite.height = size - 6;
          sprite.alpha = terrain === 'forest' ? 0.83 : 0.9;
          detail.addChild(sprite);
        } else {
          // Readable vector fallback uses precisely the same terrain classification.
          for (let i = 0; i < 3; i++) {
            const cx = tx + 14 + i * 17,
              cy = ty + 40 + (i % 2) * 8;
            if (terrain === 'forest') {
              g.moveTo(cx, cy + 8)
                .lineTo(cx, cy - 18)
                .stroke({ color: INK, width: 1.2 });
              g.poly([cx - 11, cy, cx, cy - 27, cx + 11, cy]).fill({
                color: 0x637762,
                alpha: 0.65,
              });
            } else {
              g.poly([cx - 12, cy + 9, cx - 2, cy - 25, cx + 13, cy + 9])
                .fill({ color: 0x8d9284, alpha: 0.4 })
                .stroke({ color: INK, width: 0.9, alpha: 0.7 });
              g.moveTo(cx - 2, cy - 25)
                .lineTo(cx + 3, cy + 7)
                .stroke({ color: INK, width: 1, alpha: 0.5 });
            }
          }
        }
      } else if (terrain === 'fort') {
        g.roundRect(tx + 8, ty + 9, size - 16, size - 18, 2)
          .fill({ color: 0xc9b999, alpha: 0.65 })
          .stroke({ color: INK, width: 1.2 });
        for (let i = 0; i < 8; i++) {
          g.moveTo(tx + 9 + i * 6, ty + 6)
            .lineTo(tx + 9 + i * 6, ty + 12)
            .moveTo(tx + 9 + i * 6, ty + size - 12)
            .lineTo(tx + 9 + i * 6, ty + size - 6)
            .stroke({ color: INK, width: 1.4, alpha: 0.7 });
        }
        for (const ox of [19, 41])
          g.poly([tx + ox - 9, ty + 42, tx + ox, ty + 23, tx + ox + 10, ty + 42])
            .fill(PAPER)
            .stroke({ color: INK, width: 1 });
        g.moveTo(tx + 31, ty + 13)
          .lineTo(tx + 31, ty + 31)
          .stroke({ color: INK, width: 1.5 });
        g.poly([tx + 31, ty + 13, tx + 44, ty + 17, tx + 31, ty + 22]).fill(
          x === 0 ? campColors.attacker : x === battle.width - 1 ? campColors.defender : INK,
        );
      } else if (terrain === 'wall' || terrain === 'gate') {
        // A continuous defensive line, with open passages only on real gate tiles.
        const wall = (dx: number, dy: number) => {
          const nx = x + dx,
            ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= battle.width || ny >= battle.height) return false;
          return ['wall', 'gate'].includes(battle.terrain[ny * battle.width + nx] ?? '');
        };
        const vertical = wall(0, -1) || wall(0, 1) || !(wall(-1, 0) || wall(1, 0));
        const masonry = new Graphics();
        masonry.position.set(tx + size / 2, ty + size / 2);
        if (!vertical) masonry.rotation = Math.PI / 2;
        detail.addChild(masonry);
        masonry
          .rect(-15, -size / 2, 30, size)
          .fill(0xb5b1a0)
          .stroke({ color: INK, width: 1.1 });
        masonry.rect(8, -size / 2, 7, size).fill({ color: INK, alpha: 0.2 });
        for (let row = 0; row < 8; row++) {
          const py = -size / 2 + row * 8;
          masonry
            .moveTo(-15, py)
            .lineTo(15, py)
            .moveTo(row % 2 ? -5 : 4, py)
            .lineTo(row % 2 ? -5 : 4, py + 8)
            .stroke({ color: INK, width: 0.65, alpha: 0.45 });
          masonry.rect(-19, py, 7, 4).fill(0x73786c);
          masonry.rect(12, py, 7, 4).fill(0x73786c);
        }
        if (terrain === 'gate') {
          masonry.rect(-20, -11, 40, 22).fill(0xe8dfc5).stroke({ color: INK, width: 1.2 });
          for (const px of [-14, 14]) masonry.rect(px - 3, -16, 6, 32).fill(0x71776a);
          masonry
            .moveTo(-12, -6)
            .lineTo(12, -6)
            .moveTo(-12, 6)
            .lineTo(12, 6)
            .stroke({ color: 0x9f9679, width: 0.9 });
        }
      }
      // Visible grid remains authoritative over decorative details and adjacent washes.
      lines.rect(tx, ty, size, size).stroke({ color: 0x636d60, width: 0.8 / fit, alpha: 0.36 });
    }
}
