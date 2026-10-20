import { useEffect, useRef, useState } from 'react';
import { Application, Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { factionOf } from '../content/scenario';
import { getOfficerIdentity } from '../content/officerIdentity';
import { TROOP_VISUALS } from '../content/troopVisuals';
import { DISPLAY_PRESETS, type DisplayPreset } from '../ui/display';
import {
  battleBoard,
  cameraFit,
  cameraOrigin,
  screenToWorld,
  BATTLE_INSETS,
  CAMPAIGN_INSETS,
} from './cameraGeometry';
import {
  getAttackTargets,
  getReachableTiles,
  getThreatTiles,
  getZocStopTiles,
  moraleState,
} from '../game/battle';
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
  displayPreset?: DisplayPreset;
  cameraFocus?: { kind: 'city' | 'unit'; id: string; serial: number };
  /** Shade every tile an enemy can strike next turn. */
  showThreat?: boolean;
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
  wall: 0x8f8a78,
  gate: 0xb9a57b,
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

function factionColor(state: GameState, id: string | null): number {
  const hex = factionOf(state, id)?.color ?? '#8b8c79';
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
  const tokens = DISPLAY_PRESETS[props.displayPreset ?? 'comfortable'];
  const labelScale = tokens.cityLabel / (13 * fit);
  const territories = new Graphics();
  parent.addChild(territories);
  for (const city of state.cities) {
    if (!city.factionId) continue;
    const polygon = influencePolygon(city, state.cities);
    if (polygon.length < 3) continue;
    const points = polygon.flatMap((point) => [point.x, point.y]);
    territories.poly(points).fill({ color: factionColor(state, city.factionId), alpha: 0.035 });
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
      .stroke({ color: factionColor(state, order.factionId), width: 2, alpha: 0.7 });
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
      .fill(factionColor(state, order.factionId));
  }
  let selectionRing: Graphics | null = null;
  const occupied: LabelHitArea[] = [];
  const cityPriority = (city: City) =>
    city.id === selectedCityId ? 0 : city.factionId === state.playerFactionId ? 1 : 2;
  for (const city of [...state.cities].sort(
    (a, b) => cityPriority(a) - cityPriority(b) || a.id.localeCompare(b.id),
  )) {
    const active = city.id === selectedCityId;
    const own = city.factionId === state.playerFactionId;
    const neighbor = selected?.neighbors.includes(city.id) ?? false;
    const color = factionColor(state, city.factionId);
    const marker = new Graphics();
    parent.addChild(marker);
    if (active) {
      selectionRing = new Graphics();
      selectionRing.position.set(city.x, city.y);
      selectionRing.circle(0, 0, 18).stroke({ color: 0x4b3822, width: 2 / fit, alpha: 1 });
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
    const textY = city.y + (active ? 34 : 28) / fit;
    const name = label(parent, props.locale === 'zh' ? city.chinese : city.name, city.x, textY, {
      fontSize: (active ? 14.5 : 13) * labelScale,
      fontWeight: active || own ? '600' : '400',
      fill: active ? 0x70532e : INK,
      stroke: { color: PAPER, width: 3, join: 'round' },
    });
    const gap = 4 / fit;
    const candidates = [
      { x: city.x, y: textY },
      { x: city.x, y: city.y - 28 / fit },
      { x: city.x + name.width / 2 + 18 / fit, y: city.y },
      { x: city.x - name.width / 2 - 18 / fit, y: city.y },
    ];
    const position = candidates.find((point) => {
      const area = {
        left: point.x - name.width / 2 - gap,
        right: point.x + name.width / 2 + gap,
        top: point.y - name.height / 2 - gap,
        bottom: point.y + name.height / 2 + gap,
      };
      return !occupied.some(
        (other) =>
          area.left < other.right &&
          area.right > other.left &&
          area.top < other.bottom &&
          area.bottom > other.top,
      );
    });
    if (position || active) {
      name.position.set((position ?? candidates[0]!).x, (position ?? candidates[0]!).y);
      const area = {
        left: name.x - name.width / 2 - gap,
        right: name.x + name.width / 2 + gap,
        top: name.y - name.height / 2 - gap,
        bottom: name.y + name.height / 2 + gap,
      };
      occupied.push(area);
      labelHitAreas.set(city.id, area);
    } else name.visible = false;
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
  return battleBoard(battle.width, battle.height);
}

interface DrawnUnit {
  ring: Graphics | null;
  node: Container;
}

function drawBattleUnit(
  layer: Container,
  unit: BattleUnit,
  battle: BattleState,
  board: BoardGeometry,
  selected: boolean,
  target: boolean,
  scale: number,
  props: GameMapProps,
): DrawnUnit {
  // Each unit lives in its own container so the renderer can tween and flash it.
  const parent = new Container();
  layer.addChild(parent);
  const tokens = DISPLAY_PRESETS[props.displayPreset ?? 'comfortable'];
  const factionId = unit.side === 'attacker' ? battle.attackerId : battle.defenderId;
  const faction = factionOf(props.state, factionId);
  const color = factionColor(props.state, factionId);
  const x = board.left + unit.x * board.tile,
    y = board.top + unit.y * board.tile;
  const cssTile = board.tile * scale,
    inset = 3 / scale;
  const g = new Graphics();
  parent.addChild(g);
  g.roundRect(x + inset, y + inset, board.tile - inset * 2, board.tile - inset * 2, 3 / scale)
    .fill(0xf7f0da)
    .stroke({ color: 0x364137, width: 1.3 / scale });
  g.roundRect(x + inset, y + inset, board.tile - inset * 2, board.tile * 0.28, 2 / scale).fill({
    color,
    alpha: 0.26,
  });
  g.rect(x + inset, y + inset, 3 / scale, board.tile - inset * 2).fill(color);
  const iconSize = cssTile >= 60 ? 19 : 14;
  const badgeFont = cssTile >= 60 ? tokens.secondaryText : 12;
  const icon = new Graphics().svg(
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#26362c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      TROOP_VISUALS[unit.troopType].paths.map((d) => '<path d="' + d + '"/>').join('') +
      '</svg>',
  );
  icon.scale.set(iconSize / 24 / scale);
  icon.position.set(x + board.tile * 0.12, y + board.tile * 0.045);
  parent.addChild(icon);
  label(parent, faction?.chinese ?? '守', x + board.tile * 0.62, y + board.tile * 0.17, {
    fontSize: badgeFont / scale,
    fill: 0x26362c,
    fontWeight: '700',
  });
  const readiness = unit.status === 'confused' ? '?' : unit.acted ? '✓' : unit.moved ? '↗' : '•';
  label(parent, readiness, x + board.tile * 0.85, y + board.tile * 0.17, {
    fontFamily: SANS,
    fontSize: badgeFont / scale,
    fill: unit.status === 'confused' ? 0x8b3128 : 0x26362c,
    fontWeight: '700',
  });
  const identity = getOfficerIdentity(unit.officerId);
  const surname = identity
    ? props.locale === 'zh' || cssTile < 60
      ? identity.surnameZh
      : identity.surnameEn
    : props.locale === 'zh'
      ? '守军'
      : 'Guard';
  const surnameFont = Math.min(tokens.mainText, Math.max(12, cssTile * 0.3));
  label(parent, surname, x + board.tile / 2, y + board.tile * 0.47, {
    fontFamily: props.locale === 'zh' ? SERIF : SANS,
    fontSize: surnameFont / scale,
    fontWeight: '700',
    fill: 0x26362c,
  });
  label(parent, unit.troops.toLocaleString('en'), x + board.tile / 2, y + board.tile * 0.76, {
    fontFamily: SANS,
    fontSize: tokens.troopCount / scale,
    fontWeight: '600',
    fill: 0x26362c,
  });
  const ratio = Math.max(0, Math.min(1, unit.troops / Math.max(1, unit.initialTroops)));
  g.rect(
    x + inset + 2 / scale,
    y + board.tile - 6 / scale,
    board.tile - 2 * inset - 4 / scale,
    2 / scale,
  ).fill(0xa3a98f);
  g.rect(
    x + inset + 2 / scale,
    y + board.tile - 6 / scale,
    (board.tile - 2 * inset - 4 / scale) * ratio,
    2 / scale,
  ).fill(0x294a33);
  if (unit.status === 'inspired')
    label(parent, '↑', x + board.tile * 0.89, y + board.tile * 0.49, {
      fontFamily: SANS,
      fontSize: badgeFont / scale,
      fill: 0x294a33,
    });
  // Morale states are redundant-coded: a glyph plus a colored stripe, never color alone.
  const morale = moraleState(unit);
  if (morale !== 'steady') {
    const routed = morale === 'routed';
    g.rect(x + inset + 3 / scale, y + inset, board.tile - inset * 2 - 3 / scale, 2.5 / scale).fill(
      routed ? 0x922f28 : 0xc2832b,
    );
    label(parent, routed ? '✕' : '~', x + board.tile * 0.89, y + board.tile * 0.34, {
      fontFamily: SANS,
      fontSize: badgeFont / scale,
      fontWeight: '800',
      fill: routed ? 0x922f28 : 0x8c5a12,
    });
  }
  if (unit.level > 0)
    label(
      parent,
      '★'.repeat(Math.min(3, Math.ceil(unit.level / 2))),
      x + board.tile * 0.2,
      y + board.tile * 0.62,
      {
        fontFamily: SANS,
        fontSize: (badgeFont * 0.8) / scale,
        fill: 0x8a6a1f,
      },
    );
  if (target)
    g.roundRect(
      x + 1 / scale,
      y + 1 / scale,
      board.tile - 2 / scale,
      board.tile - 2 / scale,
      4 / scale,
    ).stroke({ color: 0x922f28, width: 2.5 / scale });
  if (!selected) return { ring: null, node: parent };
  const ring = new Graphics();
  parent.addChild(ring);
  ring.position.set(x + board.tile / 2, y + board.tile / 2);
  ring
    .roundRect(
      -board.tile / 2 + 1 / scale,
      -board.tile / 2 + 1 / scale,
      board.tile - 2 / scale,
      board.tile - 2 / scale,
      4 / scale,
    )
    .stroke({ color: 0x26362c, width: 4 / scale });
  ring
    .roundRect(
      -board.tile / 2 + 2 / scale,
      -board.tile / 2 + 2 / scale,
      board.tile - 4 / scale,
      board.tile - 4 / scale,
      4 / scale,
    )
    .stroke({ color: 0xf2c268, width: 2 / scale });
  return { ring, node: parent };
}

function drawBattle(
  parent: Container,
  props: GameMapProps,
  fit: number,
  nodes: Map<string, Container>,
): Graphics | null {
  const battle = props.state.battle;
  if (!battle) return null;
  const board = boardGeometry(battle);
  // Preserve critical information when fitting a complete board on a laptop.
  const textScale = 14 / (9 * fit);
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
      g.rect(tx, ty, board.tile, board.tile).stroke({
        color: 0x6f7a62,
        width: 1 / fit,
        alpha: 0.6,
      });
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
      if (terrain === 'wall' || terrain === 'gate') {
        // Brickwork reads as a wall; the gate is an arched opening in it.
        g.rect(tx + 3, ty + 3, board.tile - 6, board.tile - 6).fill({
          color: terrain === 'wall' ? 0x7d7967 : 0xa08f68,
          alpha: 0.85,
        });
        for (let row = 1; row < 4; row++)
          g.moveTo(tx + 3, ty + 3 + (row * (board.tile - 6)) / 4)
            .lineTo(tx + board.tile - 3, ty + 3 + (row * (board.tile - 6)) / 4)
            .stroke({ color: 0x4f4c40, width: 0.8, alpha: 0.55 });
        for (let c = 0; c < 4; c++)
          g.rect(tx + 4 + c * ((board.tile - 8) / 4), ty + 1, (board.tile - 8) / 8, 6).fill({
            color: 0x5d5a4b,
            alpha: 0.7,
          });
        if (terrain === 'gate') {
          const cx = tx + board.tile / 2;
          g.moveTo(cx - 9, ty + board.tile - 4)
            .lineTo(cx - 9, ty + board.tile * 0.45)
            .quadraticCurveTo(cx, ty + board.tile * 0.2, cx + 9, ty + board.tile * 0.45)
            .lineTo(cx + 9, ty + board.tile - 4)
            .fill({ color: 0x3f3a2c, alpha: 0.65 });
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
  if (props.showThreat) {
    // Diagonal hatching plus a red wash: the threat zone is never conveyed by color alone.
    for (const point of getThreatTiles(battle, battle.playerSide)) {
      const x = board.left + point.x * board.tile;
      const y = board.top + point.y * board.tile;
      g.rect(x + 1, y + 1, board.tile - 2, board.tile - 2).fill({ color: 0xb23a2f, alpha: 0.16 });
      for (let k = 1; k < 4; k++) {
        const o = (k * board.tile) / 4;
        g.moveTo(x + o, y + 1)
          .lineTo(x + 1, y + o)
          .stroke({ color: 0x8c2a22, width: 1 / fit, alpha: 0.5 });
        g.moveTo(x + board.tile - 1, y + o)
          .lineTo(x + o, y + board.tile - 1)
          .stroke({ color: 0x8c2a22, width: 1 / fit, alpha: 0.5 });
      }
    }
  }
  if (active) {
    const stops = new Set(
      getZocStopTiles(battle, active.id).map((tile) => tile.y * battle.width + tile.x),
    );
    for (const point of getReachableTiles(battle, active.id)) {
      const x = board.left + point.x * board.tile;
      const y = board.top + point.y * board.tile;
      const stop = stops.has(point.y * battle.width + point.x);
      g.rect(x + 2, y + 2, board.tile - 4, board.tile - 4)
        .fill({ color: 0xf9f4d7, alpha: 0.24 })
        .stroke({
          color: stop ? 0x9a5b16 : 0x2f5739,
          width: (stop ? 3 : 2) / fit,
          alpha: 0.9,
        });
      // A square mark flags a zone-of-control stop: the move ends here.
      if (stop)
        g.rect(x + board.tile / 2 - 3, y + board.tile / 2 - 3, 6, 6).fill({
          color: 0x9a5b16,
          alpha: 0.8,
        });
      else
        g.circle(x + board.tile / 2, y + board.tile / 2, 2.3).fill({
          color: 0x738367,
          alpha: 0.55,
        });
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
  const targets = active ? getAttackTargets(battle, active.id) : [];
  let selectionRing: Graphics | null = null;
  for (const unit of battle.units.filter((item) => item.troops > 0)) {
    const drawn = drawBattleUnit(
      parent,
      unit,
      battle,
      board,
      unit.id === props.selectedUnitId,
      targets.includes(unit.id),
      fit,
      props,
    );
    nodes.set(unit.id, drawn.node);
    if (drawn.ring) selectionRing = drawn.ring;
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
  const controlsRef = useRef<{
    zoom: (factor: number) => void;
    reset: () => void;
    readable: () => void;
    center: () => void;
  } | null>(null);
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
        // Combat feedback lives above the board and survives redraws.
        const fx = new Container();
        world.addChild(background, foreground, fx);
        const unitNodes = new Map<string, Container>();
        let previousBattle: {
          id: string;
          units: Map<string, { x: number; y: number; troops: number }>;
        } | null = null;
        const tweens: { id: string; dx: number; dy: number; start: number; duration: number }[] =
          [];
        const floaters: {
          node: Container;
          start: number;
          duration: number;
          y: number;
          rise: number;
        }[] = [];
        app.stage.addChild(world);
        drawAtlasBackground(background, propsRef.current.locale);
        let drawnLocale = propsRef.current.locale;
        let selectionRing: Graphics | null = null;
        const cityLabelHitAreas = new Map<string, LabelHitArea>();
        let redrawOnResize: (() => void) | null = null;
        let wasBattle = false;
        let lastBattleId: string | null = null;
        let lastPreset = propsRef.current.displayPreset;
        let lastFocusSerial: number | undefined;
        let cameraMode: 'fit' | 'readable' | 'free' = 'fit';
        let campaignCamera = { x: 0, y: 0, zoom: 1 };
        const view: Viewport = { x: 0, y: 0, zoom: 1, fit: 1, width: 1, height: 1 };
        const geometry = () => {
          const battle =
            propsRef.current.state.phase === 'battle' ? propsRef.current.state.battle : null;
          return {
            battle,
            bounds: battle
              ? boardGeometry(battle)
              : { left: 0, top: 0, width: ATLAS_WIDTH, height: ATLAS_HEIGHT },
            insets: battle ? BATTLE_INSETS : CAMPAIGN_INSETS,
          };
        };
        const recalculateFit = () => {
          const { bounds, insets } = geometry();
          view.fit = cameraFit(view.width, view.height, bounds, insets);
        };
        const applyView = () => {
          const { battle, bounds, insets } = geometry();
          const scale = view.fit * view.zoom;
          const availableWidth = view.width - insets.left - insets.right,
            availableHeight = view.height - insets.top - insets.bottom;
          const maxX =
            Math.max(0, (bounds.width * scale - availableWidth) / 2) + availableWidth * 0.22;
          const maxY =
            Math.max(0, (bounds.height * scale - availableHeight) / 2) + availableHeight * 0.22;
          view.x = Math.max(-maxX, Math.min(maxX, view.x));
          view.y = Math.max(-maxY, Math.min(maxY, view.y));
          const origin = cameraOrigin(view.width, view.height, bounds, insets, scale, view);
          world.scale.set(scale);
          world.position.set(origin.x, origin.y);
          const tokens = DISPLAY_PRESETS[propsRef.current.displayPreset ?? 'comfortable'];
          host.parentElement!.dataset.mode = battle ? 'battle' : 'campaign';
          host.parentElement!.dataset.cameraScale = String(scale);
          host.parentElement!.dataset.cityFontSize = String(tokens.cityLabel);
          if (battle) {
            const board = boardGeometry(battle),
              tile = board.tile * scale;
            host.parentElement!.dataset.tileSize = String(tile);
            host.parentElement!.dataset.boardLeft = String(origin.x + board.left * scale);
            host.parentElement!.dataset.boardTop = String(origin.y + board.top * scale);
            host.parentElement!.dataset.boardRight = String(
              origin.x + (board.left + board.width) * scale,
            );
            host.parentElement!.dataset.boardBottom = String(
              origin.y + (board.top + board.height) * scale,
            );
            host.parentElement!.dataset.countFontSize = String(tokens.troopCount);
            host.parentElement!.dataset.crestFontSize = String(
              tile >= 60 ? tokens.secondaryText : 12,
            );
            host.parentElement!.dataset.statusFontSize = String(
              tile >= 60 ? tokens.secondaryText : 12,
            );
            host.parentElement!.dataset.surnameFontSize = String(
              Math.min(tokens.mainText, Math.max(12, tile * 0.3)),
            );
          }
        };
        const focusSelected = (force = true, request?: GameMapProps['cameraFocus']) => {
          const current = propsRef.current,
            { battle, bounds, insets } = geometry();
          const unit = battle?.units.find(
            (item) =>
              item.id === (request?.kind === 'unit' ? request.id : current.selectedUnitId) &&
              item.troops > 0,
          );
          const city = !battle
            ? current.state.cities.find(
                (item) =>
                  item.id === (request?.kind === 'city' ? request.id : current.selectedCityId),
              )
            : undefined;
          const board = battle ? boardGeometry(battle) : null;
          const point =
            unit && board
              ? {
                  x: board.left + (unit.x + 0.5) * board.tile,
                  y: board.top + (unit.y + 0.5) * board.tile,
                }
              : city;
          if (!point) return;
          const scale = view.fit * view.zoom,
            half = board ? (board.tile * scale) / 2 : 24;
          const sx = world.x + point.x * scale,
            sy = world.y + point.y * scale;
          if (
            !force &&
            sx - half >= insets.left - 0.5 &&
            sx + half <= view.width - insets.right + 0.5 &&
            sy - half >= insets.top - 0.5 &&
            sy + half <= view.height - insets.bottom + 0.5
          )
            return;
          view.x = (bounds.left + bounds.width / 2 - point.x) * scale;
          view.y = (bounds.top + bounds.height / 2 - point.y) * scale;
          applyView();
        };
        const reset = () => {
          cameraMode = 'fit';
          recalculateFit();
          view.zoom = 1;
          view.x = 0;
          view.y = 0;
          applyView();
          redrawRef.current?.();
        };
        const readable = () => {
          cameraMode = 'readable';
          recalculateFit();
          const { battle } = geometry();
          view.zoom = battle
            ? Math.max(
                1,
                DISPLAY_PRESETS[propsRef.current.displayPreset ?? 'comfortable'].tileSize /
                  (boardGeometry(battle).tile * view.fit),
              )
            : 1.25;
          view.x = 0;
          view.y = 0;
          applyView();
          focusSelected(false);
        };
        const resize = () => {
          if (cancelled || destroyCalled) return;
          view.width = Math.max(1, host.clientWidth);
          view.height = Math.max(1, host.clientHeight);
          app.renderer.resize(view.width, view.height);
          recalculateFit();
          if (cameraMode === 'readable') {
            const { battle } = geometry();
            if (battle)
              view.zoom = Math.max(
                1,
                DISPLAY_PRESETS[propsRef.current.displayPreset ?? 'comfortable'].tileSize /
                  (boardGeometry(battle).tile * view.fit),
              );
            if (view.zoom === 1) {
              view.x = 0;
              view.y = 0;
            }
          }
          applyView();
          redrawOnResize?.();
        };
        const zoomAt = (factor: number, x = view.width / 2, y = view.height / 2) => {
          cameraMode = 'free';
          const previous = view.zoom;
          view.zoom = Math.max(0.8, Math.min(4, previous * factor));
          const ratio = view.zoom / previous;
          const { insets } = geometry();
          const cx = insets.left + (view.width - insets.left - insets.right) / 2,
            cy = insets.top + (view.height - insets.top - insets.bottom) / 2;
          view.x = (view.x - (x - cx)) * ratio + (x - cx);
          view.y = (view.y - (y - cy)) * ratio + (y - cy);
          applyView();
          redrawRef.current?.();
        };
        controlsRef.current = {
          zoom: (factor) => zoomAt(factor),
          reset,
          readable: () => {
            readable();
            redrawRef.current?.();
          },
          center: () => focusSelected(),
        };
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
          const battleId = isBattle ? current.state.battle!.id : null;
          if (battleId !== lastBattleId) {
            if (isBattle) {
              if (!wasBattle) campaignCamera = { x: view.x, y: view.y, zoom: view.zoom };
              readable();
            } else {
              Object.assign(view, campaignCamera);
              recalculateFit();
              applyView();
            }
            lastBattleId = battleId;
          }
          if (current.displayPreset !== lastPreset) {
            lastPreset = current.displayPreset;
            if (isBattle) readable();
            else {
              applyView();
              focusSelected(false);
            }
          }
          if (current.cameraFocus?.serial !== lastFocusSerial) {
            lastFocusSerial = current.cameraFocus?.serial;
            if (current.cameraFocus) focusSelected(true, current.cameraFocus);
          }
          background.visible = !isBattle;
          selectionRing = null;
          clearContainer(foreground);
          cityLabelHitAreas.clear();
          unitNodes.clear();
          selectionRing = isBattle
            ? drawBattle(foreground, current, view.fit * view.zoom, unitNodes)
            : drawCampaign(foreground, current, view.fit * view.zoom, cityLabelHitAreas);
          wasBattle = isBattle;
          announceCombat(current);
        };
        /** Compare snapshots and add tweens, hit flashes and floating casualty numbers. */
        const announceCombat = (current: GameMapProps) => {
          const battle = current.state.phase === 'battle' ? current.state.battle : null;
          if (!battle) {
            previousBattle = null;
            clearContainer(fx);
            floaters.length = 0;
            tweens.length = 0;
            return;
          }
          const snapshot = new Map(
            battle.units.map((unit) => [unit.id, { x: unit.x, y: unit.y, troops: unit.troops }]),
          );
          const before = previousBattle;
          previousBattle = { id: battle.id, units: snapshot };
          if (!before || before.id !== battle.id) return;
          const board = boardGeometry(battle);
          const scale = view.fit * view.zoom;
          const now = performance.now();
          const still = !!current.reducedMotion;
          for (const unit of battle.units) {
            const old = before.units.get(unit.id);
            if (!old) continue;
            const centerX = board.left + (old.x + 0.5) * board.tile;
            const centerY = board.top + (old.y + 0.5) * board.tile;
            if (!still && unit.troops > 0 && (old.x !== unit.x || old.y !== unit.y))
              tweens.push({
                id: unit.id,
                dx: (old.x - unit.x) * board.tile,
                dy: (old.y - unit.y) * board.tile,
                start: now,
                duration: 300,
              });
            const lost = old.troops - unit.troops;
            if (lost <= 0) continue;
            const node = new Container();
            if (!still) {
              const flash = new Graphics();
              flash.roundRect(
                board.left + unit.x * board.tile + 2,
                board.top + unit.y * board.tile + 2,
                board.tile - 4,
                board.tile - 4,
                4,
              );
              flash.fill({ color: unit.troops > 0 ? 0xb23a2f : 0x3b3b3b, alpha: 0.5 });
              fx.addChild(flash);
              floaters.push({ node: flash, start: now, duration: 380, y: 0, rise: 0 });
            }
            const text = label(node, '−' + lost.toLocaleString('en'), centerX, 0, {
              fontFamily: SANS,
              fontSize: 15 / scale,
              fontWeight: '800',
              fill: 0x922f28,
              stroke: { color: 0xfffbea, width: 3 / scale, join: 'round' },
            });
            text.y = 0;
            node.position.set(0, centerY - board.tile * 0.2);
            fx.addChild(node);
            floaters.push({
              node,
              start: now,
              duration: 1000,
              y: centerY - board.tile * 0.2,
              rise: still ? 0 : board.tile * 0.55,
            });
          }
        };
        redrawRef.current = redraw;
        resize();
        redraw();
        redrawOnResize = redraw;
        const observer = new ResizeObserver(resize);
        observer.observe(host);
        const toWorld = (event: { clientX: number; clientY: number }) => {
          const box = app.canvas.getBoundingClientRect();
          return screenToWorld(
            { x: event.clientX - box.left, y: event.clientY - box.top },
            { x: world.x, y: world.y },
            world.scale.x,
          );
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
          const now = performance.now();
          for (let i = tweens.length - 1; i >= 0; i--) {
            const tween = tweens[i]!;
            const progress = Math.min(1, (now - tween.start) / tween.duration);
            const node = unitNodes.get(tween.id);
            if (node && !node.destroyed) {
              const left = 1 - (1 - (1 - progress) * (1 - progress));
              node.position.set(tween.dx * left, tween.dy * left);
            }
            if (progress >= 1) tweens.splice(i, 1);
          }
          for (let i = floaters.length - 1; i >= 0; i--) {
            const item = floaters[i]!;
            const progress = Math.min(1, (now - item.start) / item.duration);
            if (!item.node.destroyed) {
              item.node.alpha = 1 - progress * progress;
              if (item.rise) item.node.y = item.y - item.rise * progress;
            }
            if (progress >= 1) {
              if (!item.node.destroyed) item.node.destroy({ children: true });
              floaters.splice(i, 1);
            }
          }
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
  }, [
    props.state,
    props.selectedCityId,
    props.selectedUnitId,
    props.locale,
    props.displayPreset,
    props.cameraFocus,
    props.showThreat,
  ]);

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
          className={props.state.phase === 'battle' ? 'map-control-label' : undefined}
          title={tx(props.state.phase === 'battle' ? 'Fit battlefield' : 'Reset map view')}
          aria-label={tx(props.state.phase === 'battle' ? 'Fit battlefield' : 'Reset map view')}
          onClick={() => controlsRef.current?.reset()}
        >
          {props.state.phase === 'battle' ? tx('Fit battlefield') : '⌖'}
        </button>
        {props.state.phase === 'battle' && (
          <>
            <button
              type="button"
              className="map-control-label"
              onClick={() => controlsRef.current?.readable()}
            >
              {tx('Readable tiles')}
            </button>
            <button
              type="button"
              className="map-control-label"
              onClick={() => controlsRef.current?.center()}
            >
              {tx('Center selected unit')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
