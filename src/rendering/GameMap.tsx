import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { FACTIONS } from '../content/scenario';
import { getAttackTargets, getReachableTiles } from '../game/battle';
import type { BattleState, BattleUnit, City, GameState, Terrain } from '../game/types';
import { translateText, type Locale } from '../i18n/core';
import {
  ATLAS_HEIGHT,
  ATLAS_WIDTH,
  LAND_OUTLINE,
  MOUNTAIN_RANGES,
  REGION_LABELS,
  RIVERS,
  decorativeRandom,
  influencePolygon,
  smoothLine,
} from './mapGeometry';

export interface GameMapProps {
  state: GameState;
  selectedCityId: string | null;
  onSelectCity: (id: string) => void;
  selectedUnitId: string | null;
  onSelectUnit: (id: string) => void;
  onBattleTile: (x: number, y: number) => void;
  reducedMotion?: boolean;
  locale: Locale;
}

const INK = 0x3c4540;
const PAPER = 0xe9e7d8;
const GOLD = 0xb58c51;
const SERIF = 'Georgia, "Times New Roman", serif';
const SANS = 'Inter, "Segoe UI", sans-serif';
const TERRAIN: Record<Terrain, number> = {
  plain: 0xd2d4b8,
  forest: 0xa9b79d,
  hill: 0xc5c0a4,
  water: 0xa5bdb7,
  fort: 0xc5bba1,
};

interface Viewport {
  x: number;
  y: number;
  zoom: number;
  fit: number;
  width: number;
  height: number;
}
interface BoardGeometry {
  left: number;
  top: number;
  tile: number;
  width: number;
  height: number;
}
interface LabelHitArea {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function factionColor(id: string | null): number {
  const hex = FACTIONS.find((faction) => faction.id === id)?.color ?? '#8b8c79';
  return Number.parseInt(hex.replace('#', ''), 16);
}

function label(
  parent: Container,
  text: string,
  x: number,
  y: number,
  style: Partial<TextStyleOptions> = {},
  anchor = 0.5,
): Text {
  const item = new Text({ text, style: { fontFamily: SERIF, fill: INK, fontSize: 15, ...style } });
  item.anchor.set(anchor, 0.5);
  item.position.set(x, y);
  parent.addChild(item);
  return item;
}

function traceRiver(
  graphics: Graphics,
  points: number[],
  width: number,
  color: number,
  alpha = 1,
): void {
  graphics.moveTo(points[0] ?? 0, points[1] ?? 0);
  for (const segment of smoothLine(points)) {
    graphics.quadraticCurveTo(segment[0] ?? 0, segment[1] ?? 0, segment[2] ?? 0, segment[3] ?? 0);
  }
  graphics.lineTo(points[points.length - 2] ?? 0, points[points.length - 1] ?? 0);
  graphics.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

function drawMountain(graphics: Graphics, x: number, y: number, size: number, alpha: number): void {
  graphics
    .moveTo(x - size, y + size * 0.5)
    .lineTo(x - size * 0.3, y - size * 0.12)
    .lineTo(x, y - size * 0.8)
    .lineTo(x + size * 0.28, y - size * 0.25)
    .lineTo(x + size * 0.55, y - size * 0.46)
    .lineTo(x + size, y + size * 0.5)
    .stroke({ color: 0x667063, width: 0.8, alpha });
  graphics
    .moveTo(x, y - size * 0.8)
    .lineTo(x + size * 0.14, y + size * 0.42)
    .stroke({ color: 0x667063, width: 0.6, alpha: alpha * 0.6 });
  graphics
    .moveTo(x + size * 0.22, y - size * 0.27)
    .lineTo(x + size * 0.55, y + size * 0.42)
    .stroke({ color: 0x667063, width: 0.6, alpha: alpha * 0.5 });
  graphics
    .moveTo(x - size * 0.8, y + size * 0.64)
    .lineTo(x + size * 0.8, y + size * 0.64)
    .stroke({ color: 0x667063, width: 0.6, alpha: alpha * 0.25 });
}

function drawTree(graphics: Graphics, x: number, y: number, size: number, alpha = 0.4): void {
  graphics
    .moveTo(x, y + size * 0.5)
    .lineTo(x, y - size * 0.8)
    .stroke({ color: INK, width: 0.7, alpha });
  graphics
    .poly([x - size * 0.65, y, x, y - size, x + size * 0.65, y])
    .fill({ color: 0x5d7461, alpha });
  graphics
    .poly([x - size * 0.8, y + size * 0.35, x, y - size * 0.7, x + size * 0.8, y + size * 0.35])
    .fill({ color: 0x5d7461, alpha });
}

function drawAtlasBackground(parent: Container, locale: Locale): void {
  const tx = (text: string) => translateText(text, locale);
  const g = new Graphics();
  parent.addChild(g);
  g.rect(-2000, -2000, 5000, 5000).fill(PAPER);
  g.rect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT).fill(0xd9e1d7);
  // Faint coastal contours make the sea feel like an etched atlas.
  const coastline = LAND_OUTLINE.slice(2, -1).flatMap((point) => [point.x, point.y]);
  for (let i = 4; i >= 1; i--) {
    const offset = coastline.map((value, index) => value + (index % 2 === 0 ? i * 8 : i * 2));
    traceRiver(g, offset, 0.7, 0x7b9b91, 0.12);
  }
  g.poly(LAND_OUTLINE.flatMap((point) => [point.x, point.y])).fill(PAPER);
  // Stroke only the coastline; the land polygon's off-map closing edges would
  // otherwise appear as a rectangular border in a wide, letterboxed viewport.
  g.moveTo(coastline[0] ?? 0, coastline[1] ?? 0);
  for (let i = 2; i < coastline.length; i += 2) g.lineTo(coastline[i] ?? 0, coastline[i + 1] ?? 0);
  g.stroke({ color: 0x8b9988, width: 1.15, alpha: 0.7 });
  const random = decorativeRandom();
  for (let i = 0; i < 2600; i++) {
    const x = random() * ATLAS_WIDTH;
    const y = random() * ATLAS_HEIGHT;
    const length = 0.2 + random() * 1.2;
    g.moveTo(x, y)
      .lineTo(x + length, y + 0.3)
      .stroke({ color: 0x64664c, width: 0.6, alpha: 0.035 + random() * 0.05 });
  }
  for (let x = 55; x < 1000; x += 100) {
    g.moveTo(x, 0).lineTo(x, 720).stroke({ color: 0x7e846c, width: 0.5, alpha: 0.055 });
  }
  for (let y = 45; y < 720; y += 100) {
    g.moveTo(0, y).lineTo(1000, y).stroke({ color: 0x7e846c, width: 0.5, alpha: 0.055 });
  }
  // Low, broad washes sit beneath mountain engraving.
  for (const range of MOUNTAIN_RANGES) {
    g.ellipse(range.x + range.width / 2, range.y, range.width * 0.63, range.spread * 0.7).fill({
      color: 0x7e8e74,
      alpha: 0.045,
    });
    for (let i = 0; i < range.count; i++) {
      const x = range.x + random() * range.width;
      const y = range.y + (random() - 0.5) * range.spread;
      drawMountain(g, x, y, 8 + random() * 10, 0.17 + random() * 0.18);
    }
  }
  for (let i = 0; i < 130; i++) {
    const x = 270 + random() * 500;
    const y = 450 + random() * 180;
    drawTree(g, x, y, 2.2 + random() * 2.5, 0.12);
  }
  RIVERS.forEach((river, index) => {
    traceRiver(g, river, index < 2 ? 6 : 3.8, 0x8da89d, 0.12);
    traceRiver(g, river, index < 2 ? 2.5 : 1.3, 0x809c93, index < 2 ? 0.7 : 0.48);
    traceRiver(g, river, index < 2 ? 0.75 : 0.4, 0xdbe5d9, 0.75);
  });
  g.ellipse(576, 610, 12, 7).fill({ color: 0x8fa79a, alpha: 0.38 });
  g.ellipse(738, 596, 8, 11).fill({ color: 0x8fa79a, alpha: 0.35 });
  for (const region of REGION_LABELS) {
    const chinese = label(parent, region.chinese, region.x, region.y, {
      fontSize: 26,
      fill: 0x6e7566,
      letterSpacing: 5,
    });
    chinese.alpha = 0.22;
    chinese.rotation = region.rotation;
    const english = label(parent, locale === 'zh' ? '' : region.name, region.x, region.y + 23, {
      fontFamily: SANS,
      fontSize: 9,
      letterSpacing: 4,
      fill: 0x7d8476,
    });
    english.alpha = 0.43;
    english.rotation = region.rotation;
  }
  const yellow = label(parent, tx('YELLOW RIVER'), 536, 253, {
    fontSize: 8,
    fontStyle: 'italic',
    letterSpacing: 2,
    fill: 0x6f8a81,
  });
  yellow.rotation = -0.12;
  const yangtze = label(parent, tx('Y A N G T Z E'), 620, 614, {
    fontSize: 9,
    fontStyle: 'italic',
    fill: 0x6f8a81,
  });
  yangtze.rotation = -0.18;
  const sea = label(parent, tx('E A S T E R N  S E A'), 984, 437, {
    fontSize: 10,
    fill: 0x7e978c,
    lineHeight: 23,
    align: 'center',
  });
  sea.alpha = 0.6;
  sea.rotation = Math.PI / 2;
  // Compass and cartographer's mark.
  const cx = 84;
  const cy = 89;
  g.circle(cx, cy, 25).stroke({ color: 0x728173, width: 0.7, alpha: 0.35 });
  g.circle(cx, cy, 29).stroke({ color: 0x728173, width: 0.5, alpha: 0.15 });
  g.poly([cx, cy - 28, cx + 5, cy, cx, cy + 28, cx - 5, cy]).fill({ color: 0x647666, alpha: 0.55 });
  g.poly([cx - 25, cy, cx, cy - 4, cx + 25, cy, cx, cy + 4]).fill({ color: 0x647666, alpha: 0.3 });
  label(parent, tx('N'), cx, cy - 39, { fontSize: 10, fill: 0x627565 });
  label(
    parent,
    tx('THE HAN REALM'),
    67,
    685,
    { fontFamily: SANS, fontSize: 8, letterSpacing: 2.2, fill: 0x7d8270 },
    0,
  );
  label(
    parent,
    tx('An atlas of a divided empire'),
    67,
    701,
    { fontSize: 11, fontStyle: 'italic', fill: 0x8b8b76 },
    0,
  );
  g.moveTo(67, 671).lineTo(171, 671).stroke({ color: 0x8c927b, width: 0.7, alpha: 0.5 });
}

function drawDashedRoad(
  g: Graphics,
  a: City,
  b: City,
  color: number,
  alpha: number,
  width = 0.9,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.floor(length / 7));
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = Math.min(1, t0 + 0.5 / steps);
    const bend0 = Math.sin(t0 * Math.PI) * 4;
    const bend1 = Math.sin(t1 * Math.PI) * 4;
    g.moveTo(a.x + dx * t0 - (dy / length) * bend0, a.y + dy * t0 + (dx / length) * bend0)
      .lineTo(a.x + dx * t1 - (dy / length) * bend1, a.y + dy * t1 + (dx / length) * bend1)
      .stroke({ color, width, alpha });
  }
}

function drawCampaign(
  parent: Container,
  props: GameMapProps,
  fit: number,
  labelHitAreas: Map<string, LabelHitArea>,
): Graphics | null {
  const { state, selectedCityId } = props;
  // Keep names readable on a laptop without making neighboring labels collide
  // in a very narrow pane. Zoom continues to scale the whole atlas naturally.
  const labelScale = Math.min(1.85, Math.max(1, 12.5 / (13 * fit)));
  const territories = new Graphics();
  parent.addChild(territories);
  for (const city of state.cities) {
    if (!city.factionId) continue;
    const polygon = influencePolygon(city, state.cities);
    if (polygon.length < 3) continue;
    const points = polygon.flatMap((point) => [point.x, point.y]);
    territories.poly(points).fill({ color: factionColor(city.factionId), alpha: 0.035 });
  }
  const roads = new Graphics();
  parent.addChild(roads);
  const selected = state.cities.find((city) => city.id === selectedCityId);
  for (const city of state.cities) {
    for (const neighborId of city.neighbors) {
      if (neighborId < city.id) continue;
      const neighbor = state.cities.find((item) => item.id === neighborId);
      if (!neighbor) continue;
      const emphasized = city.id === selectedCityId || neighborId === selectedCityId;
      drawDashedRoad(
        roads,
        city,
        neighbor,
        emphasized ? GOLD : 0x6e7566,
        emphasized ? 0.72 : 0.24,
        emphasized ? 1.2 : 0.85,
      );
    }
  }
  // Queued marches are visible independently of city selection.
  for (const order of state.orders) {
    const from = state.cities.find((city) => city.id === order.sourceId);
    const to = state.cities.find((city) => city.id === order.targetId);
    if (!from || !to) continue;
    roads
      .moveTo(from.x, from.y)
      .lineTo(to.x, to.y)
      .stroke({ color: factionColor(order.factionId), width: 2, alpha: 0.7 });
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const x = from.x + (to.x - from.x) * 0.64;
    const y = from.y + (to.y - from.y) * 0.64;
    roads
      .poly([
        x + Math.cos(angle) * 6,
        y + Math.sin(angle) * 6,
        x + Math.cos(angle + 2.4) * 6,
        y + Math.sin(angle + 2.4) * 6,
        x + Math.cos(angle - 2.4) * 6,
        y + Math.sin(angle - 2.4) * 6,
      ])
      .fill(factionColor(order.factionId));
  }
  let selectionRing: Graphics | null = null;
  for (const city of state.cities) {
    const active = city.id === selectedCityId;
    const own = city.factionId === state.playerFactionId;
    const neighbor = selected?.neighbors.includes(city.id) ?? false;
    const color = factionColor(city.factionId);
    const marker = new Graphics();
    parent.addChild(marker);
    if (active) {
      selectionRing = new Graphics();
      selectionRing.position.set(city.x, city.y);
      selectionRing.circle(0, 0, 18).stroke({ color: GOLD, width: 1.2, alpha: 0.7 });
      selectionRing.circle(0, 0, 23).stroke({ color: GOLD, width: 0.6, alpha: 0.28 });
      parent.addChild(selectionRing);
      marker.circle(city.x, city.y, 16).fill({ color: GOLD, alpha: 0.12 });
    } else if (neighbor) {
      marker.circle(city.x, city.y, 14).stroke({ color: GOLD, width: 0.8, alpha: 0.45 });
    }
    marker.circle(city.x + 0.5, city.y + 1.5, 9).fill({ color: 0x3c493d, alpha: 0.12 });
    marker
      .circle(city.x, city.y, active ? 10 : 8)
      .fill(0xf4f0df)
      .stroke({ color, width: 1.5 });
    marker.circle(city.x, city.y, active ? 6.5 : 5).fill(color);
    // Small keep silhouette differentiates settlements from decorative dots.
    marker.rect(city.x - 3, city.y - 2, 6, 4).fill({ color: 0xf7f1df, alpha: 0.94 });
    marker.rect(city.x - 3, city.y - 4, 1.4, 2).fill(0xf7f1df);
    marker.rect(city.x - 0.7, city.y - 4, 1.4, 2).fill(0xf7f1df);
    marker.rect(city.x + 1.6, city.y - 4, 1.4, 2).fill(0xf7f1df);
    const textY = city.y + (active ? 30 : 25);
    const name = label(parent, props.locale === 'zh' ? city.chinese : city.name, city.x, textY, {
      fontSize: (active ? 15 : 13) * labelScale,
      fontWeight: active || own ? '600' : '400',
      fill: active ? 0x70532e : INK,
      stroke: { color: PAPER, width: 3, join: 'round' },
    });
    name.alpha = city.factionId ? 1 : 0.74;
    labelHitAreas.set(city.id, {
      left: city.x - name.width / 2 - 7,
      right: city.x + name.width / 2 + 7,
      top: textY - name.height / 2 - 5,
      bottom: textY + name.height / 2 + 5,
    });
    if (active) {
      label(parent, props.locale === 'zh' ? '' : city.chinese, city.x, city.y - 32, {
        fontSize: 12 * labelScale,
        fill: 0x7c623d,
      });
      const underlineY = textY + Math.max(12, name.height / 2 + 3);
      marker
        .moveTo(city.x - 22, underlineY)
        .lineTo(city.x + 22, underlineY)
        .stroke({ color: GOLD, width: 0.9, alpha: 0.7 });
    }
    if (own)
      marker
        .circle(city.x + 10, city.y - 8, 2.4)
        .fill(0xe9e6d6)
        .stroke({ color, width: 1.2 });
  }
  return selectionRing;
}

function boardGeometry(battle: BattleState): BoardGeometry {
  const tile = Math.min(74, 834 / battle.width, 548 / battle.height);
  return {
    tile,
    left: (ATLAS_WIDTH - tile * battle.width) / 2,
    top: (ATLAS_HEIGHT - tile * battle.height) / 2,
    width: tile * battle.width,
    height: tile * battle.height,
  };
}

function drawBattleUnit(
  parent: Container,
  unit: BattleUnit,
  battle: BattleState,
  board: BoardGeometry,
  selected: boolean,
  target: boolean,
  textScale: number,
): Graphics | null {
  const color = factionColor(unit.side === 'attacker' ? battle.attackerId : battle.defenderId);
  const x = board.left + (unit.x + 0.5) * board.tile;
  const y = board.top + (unit.y + 0.5) * board.tile;
  // Reserve room between stacked units for readable counts at laptop fit.
  const size = Math.min(20, board.tile * (textScale > 1.8 ? 0.27 : 0.31));
  const g = new Graphics();
  parent.addChild(g);
  let ring: Graphics | null = null;
  if (selected) {
    ring = new Graphics();
    parent.addChild(ring);
    ring.position.set(x, y);
    ring.circle(0, 0, size + 8).stroke({ color: GOLD, width: 1.7, alpha: 0.95 });
  }
  if (target) {
    g.circle(x, y, size + 6).stroke({ color: 0xa54438, width: 1.5, alpha: 0.85 });
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 2) * i;
      g.moveTo(x + Math.cos(angle) * (size + 4), y + Math.sin(angle) * (size + 4))
        .lineTo(x + Math.cos(angle) * (size + 10), y + Math.sin(angle) * (size + 10))
        .stroke({ color: 0xa54438, width: 1.5 });
    }
  }
  g.ellipse(x, y + size * 0.8, size + 2, size * 0.4).fill({ color: INK, alpha: 0.15 });
  const shield = [
    x - size * 0.85,
    y - size * 0.82,
    x + size * 0.85,
    y - size * 0.82,
    x + size * 0.85,
    y + size * 0.2,
    x,
    y + size * 0.93,
    x - size * 0.85,
    y + size * 0.2,
  ];
  g.poly(shield).fill(color).stroke({ color: 0xf2e9cf, width: 1.8 });
  g.poly([
    x - size * 0.65,
    y - size * 0.61,
    x + size * 0.65,
    y - size * 0.61,
    x + size * 0.65,
    y + size * 0.1,
    x,
    y + size * 0.68,
    x - size * 0.65,
    y + size * 0.1,
  ]).stroke({ color: 0xf2e9cf, width: 0.5, alpha: 0.55 });
  const glyphs: Record<BattleUnit['troopType'], string> = {
    infantry: '兵',
    cavalry: '騎',
    archer: '弓',
    naval: '舟',
    elite: '勇',
    guard: '衛',
  };
  const typeText = label(parent, glyphs[unit.troopType], x, y - 2, {
    fontSize: size * 0.9,
    fill: 0xf5eedb,
  });
  if (unit.acted) {
    g.alpha = 0.6;
    typeText.alpha = 0.65;
  }
  const ratio = Math.max(0, Math.min(1, unit.troops / Math.max(1, unit.initialTroops)));
  g.roundRect(x - size, y + size + 2, size * 2, 3, 1).fill({ color: 0x3d4439, alpha: 0.22 });
  g.roundRect(x - size, y + size + 2, size * 2 * ratio, 3, 1).fill(color);
  const countFontSize = 9 * textScale;
  label(parent, unit.troops.toLocaleString(), x, y + size + 7 + countFontSize / 2, {
    fontFamily: SANS,
    fontSize: countFontSize,
    fontWeight: '600',
    fill: 0x354137,
    stroke: { color: 0xe9e7d8, width: 2.5, join: 'round' },
  });
  if (unit.status !== 'normal') {
    label(parent, unit.status === 'inspired' ? '↑' : '?', x + size, y - size, {
      fontFamily: SANS,
      fontSize: 13,
      fontWeight: '700',
      fill: unit.status === 'inspired' ? 0x487950 : 0x904d36,
    });
  }
  return ring;
}

function drawBattle(parent: Container, props: GameMapProps, fit: number): Graphics | null {
  const battle = props.state.battle;
  if (!battle) return null;
  const board = boardGeometry(battle);
  // Preserve critical information when fitting a complete board on a laptop.
  const textScale = Math.min(2.4, Math.max(1, 11.5 / (9 * fit)));
  const g = new Graphics();
  parent.addChild(g);
  g.rect(-2000, -2000, 5000, 5000).fill(PAPER);
  g.roundRect(board.left - 10, board.top - 10, board.width + 20, board.height + 20, 3)
    .fill(0xb5b79e)
    .stroke({ color: 0x8a917b, width: 0.8, alpha: 0.7 });
  const random = decorativeRandom(3457);
  for (let y = 0; y < battle.height; y++) {
    for (let x = 0; x < battle.width; x++) {
      const terrain = battle.terrain[y * battle.width + x] ?? 'plain';
      const tx = board.left + x * board.tile;
      const ty = board.top + y * board.tile;
      g.rect(tx + 0.5, ty + 0.5, board.tile - 1, board.tile - 1).fill({
        color: TERRAIN[terrain],
        alpha: 0.96,
      });
      g.rect(tx, ty, board.tile, board.tile).stroke({ color: 0x6f7a62, width: 0.7, alpha: 0.18 });
      for (let d = 0; d < 7; d++) {
        const px = tx + 7 + random() * (board.tile - 14);
        const py = ty + 7 + random() * (board.tile - 14);
        if (terrain === 'forest') drawTree(g, px, py, 4 + random() * 3, 0.28);
        else if (terrain === 'hill' && d < 3) drawMountain(g, px, py, 6 + random() * 4, 0.35);
        else if (terrain === 'water') {
          g.moveTo(px - 3, py)
            .quadraticCurveTo(px, py - 2, px + 4, py)
            .stroke({ color: 0xf2f1da, width: 0.9, alpha: 0.4 });
        } else {
          g.moveTo(px - 2, py + 2)
            .lineTo(px, py - 1)
            .lineTo(px + 2, py + 2)
            .stroke({ color: 0x7b896c, width: 0.6, alpha: 0.19 });
        }
      }
      if (terrain === 'fort') {
        const cx = tx + board.tile / 2;
        const cy = ty + board.tile / 2;
        g.rect(cx - 17, cy - 12, 34, 24)
          .fill({ color: 0x7b7e66, alpha: 0.3 })
          .stroke({ color: 0x6e745e, width: 1, alpha: 0.6 });
        for (const offset of [-17, 10]) {
          g.rect(cx + offset, cy - 16, 7, 32).fill({ color: 0x777c62, alpha: 0.4 });
        }
        g.rect(cx - 4, cy + 2, 8, 10).fill({ color: 0x525d4d, alpha: 0.3 });
      }
    }
  }
  const active = battle.units.find(
    (unit) =>
      unit.id === props.selectedUnitId && unit.side === battle.playerSide && unit.troops > 0,
  );
  if (active) {
    for (const point of getReachableTiles(battle, active.id)) {
      const x = board.left + point.x * board.tile;
      const y = board.top + point.y * board.tile;
      g.rect(x + 2, y + 2, board.tile - 4, board.tile - 4)
        .fill({ color: 0xf9f4d7, alpha: 0.24 })
        .stroke({ color: 0x8c8b58, width: 1, alpha: 0.5 });
      g.circle(x + board.tile / 2, y + board.tile / 2, 2.3).fill({ color: 0x738367, alpha: 0.55 });
    }
  }
  for (let x = 0; x < battle.width; x++) {
    label(
      parent,
      String.fromCharCode(65 + x),
      board.left + (x + 0.5) * board.tile,
      board.top - 24,
      { fontFamily: SANS, fontSize: 9 * textScale, fill: 0x59654f },
    );
  }
  for (let y = 0; y < battle.height; y++) {
    label(parent, String(y + 1), board.left - 23, board.top + (y + 0.5) * board.tile, {
      fontFamily: SANS,
      fontSize: 9 * textScale,
      fill: 0x59654f,
    });
  }
  label(
    parent,
    translateText('ATTACKER CAMP', props.locale),
    board.left,
    board.top + board.height + 27,
    { fontFamily: SANS, fontSize: 8 * textScale, letterSpacing: 1.7, fill: 0x59654f },
    0,
  );
  label(
    parent,
    translateText('DEFENDER CAMP', props.locale),
    board.left + board.width,
    board.top + board.height + 27,
    { fontFamily: SANS, fontSize: 8 * textScale, letterSpacing: 1.7, fill: 0x59654f },
    1,
  );
  const targets = active ? getAttackTargets(battle, active.id) : [];
  let selectionRing: Graphics | null = null;
  for (const unit of battle.units.filter((item) => item.troops > 0)) {
    const ring = drawBattleUnit(
      parent,
      unit,
      battle,
      board,
      unit.id === props.selectedUnitId,
      targets.includes(unit.id),
      textScale,
    );
    if (ring) selectionRing = ring;
  }
  return selectionRing;
}

function clearContainer(container: Container): void {
  for (const child of container.removeChildren()) child.destroy({ children: true });
}

/** Pixi owns map drawing; React owns the surrounding controls and game state. */
export default function GameMap(props: GameMapProps) {
  const tx = (text: string) => translateText(text, props.locale);
  const hostRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const redrawRef = useRef<(() => void) | null>(null);
  const controlsRef = useRef<{ zoom: (factor: number) => void; reset: () => void } | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let ready = false;
    let destroyCalled = false;
    const app = new Application();
    let cleanup: (() => void) | undefined;
    const destroy = () => {
      if (ready && !destroyCalled) {
        destroyCalled = true;
        cleanup?.();
        app.destroy(true, { children: true, texture: true, textureSource: true });
      }
    };
    void (async () => {
      try {
        await app.init({
          width: Math.max(1, host.clientWidth),
          height: Math.max(1, host.clientHeight),
          background: PAPER,
          antialias: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          autoDensity: true,
          preference: 'webgl',
          powerPreference: 'low-power',
        });
        ready = true;
        if (cancelled) {
          destroy();
          return;
        }
        app.canvas.setAttribute(
          'aria-label',
          'Interactive map. Select a city or battle unit; drag to pan, scroll to zoom, double-click to reset.',
        );
        app.canvas.setAttribute('role', 'img');
        app.canvas.style.display = 'block';
        app.canvas.style.width = '100%';
        app.canvas.style.height = '100%';
        app.canvas.style.touchAction = 'none';
        host.appendChild(app.canvas);
        const world = new Container();
        const background = new Container();
        const foreground = new Container();
        world.addChild(background, foreground);
        app.stage.addChild(world);
        drawAtlasBackground(background, propsRef.current.locale);
        let drawnLocale = propsRef.current.locale;
        let selectionRing: Graphics | null = null;
        const cityLabelHitAreas = new Map<string, LabelHitArea>();
        let redrawOnResize: (() => void) | null = null;
        let wasBattle = false;
        const view: Viewport = { x: 0, y: 0, zoom: 1, fit: 1, width: 1, height: 1 };
        const applyView = () => {
          const scale = view.fit * view.zoom;
          const maxX = Math.max(0, (ATLAS_WIDTH * scale - view.width) / 2) + view.width * 0.22;
          const maxY = Math.max(0, (ATLAS_HEIGHT * scale - view.height) / 2) + view.height * 0.22;
          view.x = Math.max(-maxX, Math.min(maxX, view.x));
          view.y = Math.max(-maxY, Math.min(maxY, view.y));
          world.scale.set(scale);
          world.position.set(
            (view.width - ATLAS_WIDTH * scale) / 2 + view.x,
            (view.height - ATLAS_HEIGHT * scale) / 2 + view.y,
          );
        };
        const reset = () => {
          view.zoom = 1;
          view.x = 0;
          view.y = 0;
          applyView();
        };
        const resize = () => {
          if (cancelled || destroyCalled) return;
          view.width = Math.max(1, host.clientWidth);
          view.height = Math.max(1, host.clientHeight);
          app.renderer.resize(view.width, view.height);
          const oldFit = view.fit;
          // Reserve room for the map legend and controls at the viewport edges.
          view.fit = Math.min(
            Math.max(1, view.width - 36) / ATLAS_WIDTH,
            Math.max(1, view.height - 52) / ATLAS_HEIGHT,
          );
          applyView();
          if (Math.abs(oldFit - view.fit) > 0.001) redrawOnResize?.();
        };
        const zoomAt = (factor: number, x = view.width / 2, y = view.height / 2) => {
          const previous = view.zoom;
          view.zoom = Math.max(0.8, Math.min(2.7, previous * factor));
          const ratio = view.zoom / previous;
          view.x = (view.x - (x - view.width / 2)) * ratio + (x - view.width / 2);
          view.y = (view.y - (y - view.height / 2)) * ratio + (y - view.height / 2);
          applyView();
        };
        controlsRef.current = { zoom: (factor) => zoomAt(factor), reset };
        const redraw = () => {
          if (cancelled) return;
          const current = propsRef.current;
          if (drawnLocale !== current.locale) {
            clearContainer(background);
            drawAtlasBackground(background, current.locale);
            drawnLocale = current.locale;
          }
          app.canvas.setAttribute(
            'aria-label',
            translateText(
              'Interactive map. Select a city or battle unit; drag to pan, scroll to zoom, double-click to reset.',
              current.locale,
            ),
          );
          const isBattle = current.state.phase === 'battle' && current.state.battle !== null;
          background.visible = !isBattle;
          selectionRing = null;
          clearContainer(foreground);
          cityLabelHitAreas.clear();
          selectionRing = isBattle
            ? drawBattle(foreground, current, view.fit)
            : drawCampaign(foreground, current, view.fit, cityLabelHitAreas);
          if (wasBattle !== isBattle) reset();
          wasBattle = isBattle;
        };
        redrawRef.current = redraw;
        resize();
        redraw();
        redrawOnResize = redraw;
        const observer = new ResizeObserver(resize);
        observer.observe(host);
        const toWorld = (event: { clientX: number; clientY: number }) => {
          const box = app.canvas.getBoundingClientRect();
          return {
            x: (event.clientX - box.left - world.x) / world.scale.x,
            y: (event.clientY - box.top - world.y) / world.scale.y,
          };
        };
        const cityAtPoint = (point: { x: number; y: number }): City | undefined => {
          const cities = [...propsRef.current.state.cities].sort(
            (a, b) =>
              Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y),
          );
          return cities.find((city) => {
            if (Math.hypot(city.x - point.x, city.y - point.y) < 24) return true;
            const area = cityLabelHitAreas.get(city.id);
            return (
              area !== undefined &&
              point.x >= area.left &&
              point.x <= area.right &&
              point.y >= area.top &&
              point.y <= area.bottom
            );
          });
        };
        let drag: {
          x: number;
          y: number;
          vx: number;
          vy: number;
          moved: boolean;
          pointer: number;
        } | null = null;
        const pointerDown = (event: PointerEvent) => {
          if (event.button !== 0) return;
          drag = {
            x: event.clientX,
            y: event.clientY,
            vx: view.x,
            vy: view.y,
            moved: false,
            pointer: event.pointerId,
          };
          app.canvas.setPointerCapture(event.pointerId);
        };
        const pointerMove = (event: PointerEvent) => {
          if (drag) {
            const dx = event.clientX - drag.x;
            const dy = event.clientY - drag.y;
            if (Math.hypot(dx, dy) > 4) drag.moved = true;
            if (drag.moved) {
              view.x = drag.vx + dx;
              view.y = drag.vy + dy;
              applyView();
            }
            app.canvas.style.cursor = drag.moved ? 'grabbing' : 'pointer';
          } else {
            const point = toWorld(event);
            const current = propsRef.current;
            const nearCity = cityAtPoint(point) !== undefined;
            app.canvas.style.cursor =
              current.state.phase === 'battle' || nearCity ? 'pointer' : 'grab';
          }
        };
        const pointerUp = (event: PointerEvent) => {
          if (!drag || event.pointerId !== drag.pointer) return;
          const wasDrag = drag.moved;
          drag = null;
          if (app.canvas.hasPointerCapture(event.pointerId))
            app.canvas.releasePointerCapture(event.pointerId);
          app.canvas.style.cursor = 'grab';
          if (wasDrag) return;
          const current = propsRef.current;
          const point = toWorld(event);
          const battle = current.state.phase === 'battle' ? current.state.battle : null;
          if (battle) {
            const board = boardGeometry(battle);
            const x = Math.floor((point.x - board.left) / board.tile);
            const y = Math.floor((point.y - board.top) / board.tile);
            if (x < 0 || y < 0 || x >= battle.width || y >= battle.height) return;
            const unit = battle.units.find(
              (item) => item.x === x && item.y === y && item.troops > 0,
            );
            if (unit) current.onSelectUnit(unit.id);
            else current.onBattleTile(x, y);
          } else {
            const city = cityAtPoint(point);
            if (city) current.onSelectCity(city.id);
          }
        };
        const pointerCancel = () => {
          drag = null;
          app.canvas.style.cursor = 'grab';
        };
        const wheel = (event: WheelEvent) => {
          event.preventDefault();
          const box = app.canvas.getBoundingClientRect();
          zoomAt(
            Math.exp(-event.deltaY * 0.001),
            event.clientX - box.left,
            event.clientY - box.top,
          );
        };
        app.canvas.addEventListener('pointerdown', pointerDown);
        app.canvas.addEventListener('pointermove', pointerMove);
        app.canvas.addEventListener('pointerup', pointerUp);
        app.canvas.addEventListener('pointercancel', pointerCancel);
        app.canvas.addEventListener('wheel', wheel, { passive: false });
        app.canvas.addEventListener('dblclick', reset);
        let elapsed = 0;
        app.ticker.maxFPS = 30;
        app.ticker.add((ticker) => {
          if (selectionRing && !selectionRing.destroyed) {
            elapsed += ticker.deltaMS;
            const pulse = propsRef.current.reducedMotion ? 1 : 1 + Math.sin(elapsed / 650) * 0.035;
            selectionRing.scale.set(pulse);
            selectionRing.alpha = propsRef.current.reducedMotion
              ? 1
              : 0.83 + Math.sin(elapsed / 650) * 0.17;
          }
        });
        cleanup = () => {
          observer.disconnect();
          redrawOnResize = null;
          redrawRef.current = null;
          controlsRef.current = null;
          app.canvas.removeEventListener('pointerdown', pointerDown);
          app.canvas.removeEventListener('pointermove', pointerMove);
          app.canvas.removeEventListener('pointerup', pointerUp);
          app.canvas.removeEventListener('pointercancel', pointerCancel);
          app.canvas.removeEventListener('wheel', wheel);
          app.canvas.removeEventListener('dblclick', reset);
        };
      } catch (cause) {
        console.error('Unable to initialize the map renderer', cause);
        if (!cancelled) setError(true);
        destroy();
      }
    })();
    return () => {
      cancelled = true;
      destroy();
    };
  }, []);

  useEffect(() => {
    redrawRef.current?.();
  }, [props.state, props.selectedCityId, props.selectedUnitId, props.locale]);

  return (
    <div
      className="game-map"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 320,
        overflow: 'hidden',
      }}
    >
      <div
        ref={hostRef}
        className="map-canvas"
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      />
      {error && (
        <div className="map-error" role="alert">
          {tx(
            'The map could not start. Your browser needs WebGL enabled. City and battle controls remain available in the side panel.',
          )}
        </div>
      )}
      <div className="map-controls" aria-label={tx('Map view controls')}>
        <button
          type="button"
          title={tx('Zoom in')}
          aria-label={tx('Zoom in')}
          onClick={() => controlsRef.current?.zoom(1.2)}
        >
          +
        </button>
        <button
          type="button"
          title={tx('Zoom out')}
          aria-label={tx('Zoom out')}
          onClick={() => controlsRef.current?.zoom(1 / 1.2)}
        >
          −
        </button>
        <button
          type="button"
          title={tx('Reset map view')}
          aria-label={tx('Reset map view')}
          onClick={() => controlsRef.current?.reset()}
        >
          ⌖
        </button>
      </div>
    </div>
  );
}
