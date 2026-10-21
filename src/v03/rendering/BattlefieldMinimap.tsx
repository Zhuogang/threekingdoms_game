import {
  clientToViewBoxPoint,
  clipPolygonToGrid,
  minimapCellAt,
  minimapPoint,
  type Point,
} from './geometry';
import type { BattlefieldVisualMap } from './BattlefieldMapView';
import type { BattleUnitVisual, CellMarker } from './presentation';
import type { MouseEvent } from 'react';

export interface BattlefieldMinimapProps {
  map: BattlefieldVisualMap;
  units?: readonly BattleUnitVisual[];
  camps?: readonly CellMarker[];
  viewportPolygon?: readonly Point[];
  locale?: 'en' | 'zh';
  className?: string;
  onNavigate?: (cell: { x: number; y: number }) => void;
}

const WIDTH = 240;
const HEIGHT = 200;
const VIEWPORT = { left: 10, top: 10, right: 230, bottom: 190, width: 220, height: 180 };

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

/** Compact top-down navigator; the large map keeps its 2:1 isometric view. */
export function BattlefieldMinimap({
  map,
  units = [],
  camps = [],
  viewportPolygon = [],
  locale = 'en',
  className,
  onNavigate,
}: BattlefieldMinimapProps) {
  const cellWidth = VIEWPORT.width / map.width;
  const cellHeight = VIEWPORT.height / map.height;
  const clippedViewport = clipPolygonToGrid(viewportPolygon, map.width, map.height);
  const viewportPoints = clippedViewport.map((point) =>
    minimapPoint(point, map.width, map.height, VIEWPORT),
  );
  const viewportPath = viewportPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const click = (event: MouseEvent<SVGSVGElement>) => {
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
  return (
    <svg
      className={className}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={locale === 'zh' ? '战场小地图' : 'Battlefield minimap'}
      onClick={click}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        cursor: onNavigate ? 'crosshair' : 'default',
        touchAction: 'manipulation',
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
            <title>{terrain}</title>
          </rect>
        );
      })}
      {camps.map((camp, index) => {
        const point = minimapPoint(camp.position, map.width, map.height, VIEWPORT);
        return (
          <path
            key={camp.id ?? `camp-${index}`}
            d={`M ${point.x} ${point.y - 3} l 3 5 h -6 Z`}
            fill="#e7c174"
            stroke="#524632"
            strokeWidth="1"
          />
        );
      })}
      {units.map((unit) => {
        const point = minimapPoint(unit.position, map.width, map.height, VIEWPORT);
        const player = unit.faction === 'player';
        return (
          <g key={unit.id} aria-label={unit.label ?? unit.troopType}>
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
