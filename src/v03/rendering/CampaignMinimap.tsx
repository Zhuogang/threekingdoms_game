import { message } from '../i18n';
import { useId, type KeyboardEvent, type PointerEvent } from 'react';
import { clientToViewBoxPoint } from './geometry';
import type { CampaignViewBox } from './campaign-viewport';
import type { CampaignCityVisual, WorldPolyline } from './presentation';

export interface CampaignMinimapProps {
  bounds: CampaignViewBox;
  viewport: CampaignViewBox;
  cities: readonly CampaignCityVisual[];
  routes?: readonly WorldPolyline[];
  locale?: 'en' | 'zh';
  className?: string;
  onNavigate?: (center: { x: number; y: number }) => void;
}

const WIDTH = 240;
const HEIGHT = 200;
const MAP = { left: 11, top: 11, width: 218, height: 178 };

/** Overview navigator for the campaign atlas; the frame shows the current camera. */
export function CampaignMinimap({
  bounds,
  viewport,
  cities,
  routes = [],
  locale = 'en',
  className,
  onNavigate,
}: CampaignMinimapProps) {
  const clipId = `v03-campaign-minimap-clip-${useId().replaceAll(':', '')}`;
  const toMap = (point: { x: number; y: number }) => ({
    x: MAP.left + ((point.x - bounds.left) / bounds.width) * MAP.width,
    y: MAP.top + ((point.y - bounds.top) / bounds.height) * MAP.height,
  });
  const moveTo = (event: PointerEvent<SVGSVGElement>) => {
    if (!onNavigate) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = clientToViewBoxPoint({ x: event.clientX, y: event.clientY }, rect, {
      left: 0,
      top: 0,
      width: WIDTH,
      height: HEIGHT,
    });
    if (
      point.x < MAP.left ||
      point.y < MAP.top ||
      point.x > MAP.left + MAP.width ||
      point.y > MAP.top + MAP.height
    ) {
      return;
    }
    onNavigate({
      x: bounds.left + ((point.x - MAP.left) / MAP.width) * bounds.width,
      y: bounds.top + ((point.y - MAP.top) / MAP.height) * bounds.height,
    });
  };
  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!onNavigate) return;
    const stepX = bounds.width * (event.shiftKey ? 0.12 : 0.035);
    const stepY = bounds.height * (event.shiftKey ? 0.12 : 0.035);
    const center = { x: viewport.left + viewport.width / 2, y: viewport.top + viewport.height / 2 };
    const delta =
      event.key === 'ArrowLeft'
        ? { x: -stepX, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: stepX, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: -stepY }
            : event.key === 'ArrowDown'
              ? { x: 0, y: stepY }
              : null;
    if (!delta) return;
    event.preventDefault();
    onNavigate({ x: center.x + delta.x, y: center.y + delta.y });
  };
  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!onNavigate || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(event);
  };
  const viewLeft = MAP.left + ((viewport.left - bounds.left) / bounds.width) * MAP.width;
  const viewTop = MAP.top + ((viewport.top - bounds.top) / bounds.height) * MAP.height;
  const viewWidth = (viewport.width / bounds.width) * MAP.width;
  const viewHeight = (viewport.height / bounds.height) * MAP.height;
  const routeColor = (route: WorldPolyline) =>
    route.display === 'selected'
      ? '#a54537'
      : route.display === 'transport'
        ? '#426f8b'
        : '#89795f';

  return (
    <svg
      className={className}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role={onNavigate ? 'application' : 'img'}
      aria-label={message(locale, 'ui.campaign.map.overview.click.or.drag.to.move.the..152')}
      tabIndex={onNavigate ? 0 : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) moveTo(event);
      }}
      onKeyDown={onKeyDown}
      style={{
        display: 'block',
        cursor: onNavigate ? 'crosshair' : 'default',
        touchAction: 'none',
      }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={MAP.left} y={MAP.top} width={MAP.width} height={MAP.height} />
        </clipPath>
      </defs>
      <rect
        x="0"
        y="0"
        width={WIDTH}
        height={HEIGHT}
        rx="8"
        fill="#f1e8d5"
        stroke="#574d3e"
        strokeWidth="2"
      />
      <g clipPath={`url(#${clipId})`}>
        <rect x={MAP.left} y={MAP.top} width={MAP.width} height={MAP.height} fill="#e6dec9" />
        {routes.map((route) => (
          <polyline
            key={route.id}
            points={route.points
              .map((point) => {
                const projected = toMap(point);
                return `${projected.x},${projected.y}`;
              })
              .join(' ')}
            fill="none"
            stroke={routeColor(route)}
            strokeWidth={route.display === 'selected' ? 1.6 : 0.75}
            strokeDasharray={
              route.display === 'marching' || route.display === 'waiting' ? '2 2' : 'none'
            }
          />
        ))}
        {cities.map((city) => {
          const point = toMap(city.position);
          return (
            <circle
              key={city.id}
              cx={point.x}
              cy={point.y}
              r={city.scale === 'imperial' ? 3.5 : city.scale === 'major' ? 2.8 : 1.8}
              fill={city.controllerColor ?? '#6a5e4c'}
              stroke="#fff8e8"
              strokeWidth="0.8"
            >
              <title>{city.name}</title>
            </circle>
          );
        })}
        <rect
          x={viewLeft}
          y={viewTop}
          width={viewWidth}
          height={viewHeight}
          fill="#e4b951"
          fillOpacity="0.12"
          stroke="#9a4d2f"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
      </g>
      <rect
        x={MAP.left}
        y={MAP.top}
        width={MAP.width}
        height={MAP.height}
        fill="none"
        stroke="#756b59"
        strokeWidth="1"
        pointerEvents="none"
      />
    </svg>
  );
}
