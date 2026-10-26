import { message } from '../i18n';
import {
  clientToViewBoxPoint,
  clipPolygonToGrid,
  minimapCellAt,
  minimapPoint,
  type Point,
} from './geometry';
import type { BattlefieldVisualMap } from './BattlefieldMapView';
import { isLivingBattleUnitVisual, type BattleUnitVisual } from './presentation';
import type { KeyboardEvent, PointerEvent } from 'react';

export interface BattlefieldMinimapProps {
  map: BattlefieldVisualMap;
  units?: readonly BattleUnitVisual[];
  viewportPolygon?: readonly Point[];
  locale?: 'en' | 'zh';
  className?: string;
  onNavigate?: (cell: { x: number; y: number }) => void;
}

const WIDTH = 240;
const HEIGHT = 200;
const MARGIN = 10;

/** The largest square-celled board area that fits the minimap, centered. */
function minimapViewport(map: BattlefieldVisualMap) {
  const cell = Math.min((WIDTH - MARGIN * 2) / map.width, (HEIGHT - MARGIN * 2) / map.height);
  const width = cell * map.width;
  const height = cell * map.height;
  const left = (WIDTH - width) / 2;
  const top = (HEIGHT - height) / 2;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function terrainFill(terrain: string): string {
  switch (terrain) {
    case 'water':
      return '#6f9994';
    case 'cliff':
      return '#484943';
    case 'forest':
      return '#829076';
    case 'hill':
      return '#b8aa84';
    default:
      return '#e8ddc8';
  }
}

function terrainLabel(terrain: string, locale: 'en' | 'zh'): string {
  const labels: Record<string, { en: string; zh: string }> = {
    plain: { en: 'Open ground', zh: '平地' },
    forest: { en: 'Forest', zh: '林地' },
    hill: { en: 'Walkable hill', zh: '可通行山坡' },
    water: { en: 'Water', zh: '水域' },
    cliff: { en: 'Impassable cliff', zh: '不可通行峭壁' },
  };
  return labels[terrain]?.[locale] ?? terrain;
}

/** Compact top-down navigator for the large battlefield view. */
export function BattlefieldMinimap({
  map,
  units = [],
  viewportPolygon = [],
  locale = 'en',
  className,
  onNavigate,
}: BattlefieldMinimapProps) {
  const VIEWPORT = minimapViewport(map);
  const cellWidth = VIEWPORT.width / map.width;
  const cellHeight = VIEWPORT.height / map.height;
  const clippedViewport = clipPolygonToGrid(viewportPolygon, map.width, map.height);
  const viewportPoints = clippedViewport.map((point) =>
    minimapPoint(point, map.width, map.height, VIEWPORT),
  );
  const viewportPath = viewportPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const moveTo = (event: PointerEvent<SVGSVGElement>) => {
    if (!onNavigate) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = clientToViewBoxPoint({ x: event.clientX, y: event.clientY }, rect, {
      left: 0,
      top: 0,
      width: WIDTH,
      height: HEIGHT,
    });
    const cell = minimapCellAt(point, map.width, map.height, VIEWPORT);
    if (cell) onNavigate(cell);
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!onNavigate || !event.key.startsWith('Arrow')) return;
    const center = viewportPolygon.length
      ? viewportPolygon.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
          x: 0,
          y: 0,
        })
      : { x: map.width / 2, y: map.height / 2 };
    if (viewportPolygon.length) {
      center.x /= viewportPolygon.length;
      center.y /= viewportPolygon.length;
    }
    const step = event.shiftKey ? 5 : 1;
    const delta =
      event.key === 'ArrowLeft'
        ? { x: -step, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: step, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: -step }
            : { x: 0, y: step };
    event.preventDefault();
    onNavigate({
      x: Math.max(0, Math.min(map.width - 1, Math.round(center.x + delta.x))),
      y: Math.max(0, Math.min(map.height - 1, Math.round(center.y + delta.y))),
    });
  };
  const startNavigate = (event: PointerEvent<SVGSVGElement>) => {
    if (!onNavigate || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event);
  };
  return (
    <svg
      className={className}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role={onNavigate ? 'application' : 'img'}
      tabIndex={onNavigate ? 0 : undefined}
      aria-label={message(locale, 'ui.battlefield.minimap.click.or.drag.to.recenter.th.144')}
      onPointerDown={startNavigate}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) moveTo(event);
      }}
      onKeyDown={onKeyDown}
      style={{
        display: 'block',
        width: '100%',
        height: 'auto',
        cursor: onNavigate ? 'crosshair' : 'default',
        touchAction: onNavigate ? 'none' : 'manipulation',
      }}
    >
      <rect
        x="0"
        y="0"
        width={WIDTH}
        height={HEIGHT}
        rx="9"
        fill="#f5efdf"
        stroke="#4e473d"
        strokeWidth="2"
      />
      {Array.from({ length: map.width * map.height }, (_, index) => {
        const x = index % map.width;
        const y = Math.floor(index / map.width);
        const terrain = map.terrain[index] ?? 'plain';
        return (
          <rect
            key={`${x}-${y}`}
            x={VIEWPORT.left + x * cellWidth}
            y={VIEWPORT.top + y * cellHeight}
            width={cellWidth + 0.25}
            height={cellHeight + 0.25}
            fill={terrainFill(terrain)}
            stroke="#fff9eb"
            strokeWidth="0.35"
          >
            <title>{terrainLabel(terrain, locale)}</title>
          </rect>
        );
      })}
      {units.filter(isLivingBattleUnitVisual).map((unit) => {
        const point = minimapPoint(unit.position, map.width, map.height, VIEWPORT);
        const player = unit.faction === 'player';
        return (
          <g key={unit.id} data-unit-id={unit.id} aria-label={unit.label ?? unit.troopType}>
            <circle
              cx={point.x}
              cy={point.y}
              r={Math.max(2.5, Math.min(4, cellWidth * 0.36))}
              fill={player ? '#376f73' : '#a6493d'}
              stroke="#fffdf6"
              strokeWidth="1.1"
            />
            {unitIsOnWater(unit, map) ? (
              <path
                d={`M ${point.x - 3.1} ${point.y + 4} q 3.1 2.5 6.2 0`}
                fill="none"
                stroke="#2b666b"
                strokeWidth="1.4"
              />
            ) : null}
          </g>
        );
      })}
      {viewportPath ? (
        <polygon
          points={viewportPath}
          fill="#f3c65b"
          fillOpacity="0.15"
          stroke="#8d5e18"
          strokeWidth="2.4"
          pointerEvents="none"
        />
      ) : null}
      <rect
        x={VIEWPORT.left}
        y={VIEWPORT.top}
        width={VIEWPORT.width}
        height={VIEWPORT.height}
        fill="none"
        stroke="#645b4b"
        strokeWidth="1.2"
        pointerEvents="none"
      />
    </svg>
  );
}

function unitIsOnWater(unit: BattleUnitVisual, map: BattlefieldVisualMap): boolean {
  if (unit.isOnWater !== undefined) return unit.isOnWater;
  const { x, y } = unit.position;
  return (
    x >= 0 &&
    y >= 0 &&
    x < map.width &&
    y < map.height &&
    map.terrain[y * map.width + x] === 'water'
  );
}
