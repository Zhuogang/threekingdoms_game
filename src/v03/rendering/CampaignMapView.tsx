import { message } from '../i18n';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { V03_ASSETS, resolvePublicAsset } from './assets';
import { campaignCityArtwork } from './campaign-city-art';
import type { CampaignCityVisual, WorldPolyline } from './presentation';
import { CAMPAIGN_REGION_LABELS } from '../geography/campaign-map';
import { layoutCampaignCityLabels, type CampaignLabelPlacement } from './campaign-city-labels';
import {
  fitCampaignViewport,
  panCampaignViewport,
  zoomCampaignViewport,
  type CampaignViewBox,
} from './campaign-viewport';

export interface CampaignMapViewProps {
  bounds: { left: number; top: number; width: number; height: number };
  /** World-space SVG viewBox. Omit to show the full map bounds. */
  viewport?: CampaignViewBox;
  /** Enables wheel zoom, drag pan, keyboard arrows, +/- and Home. */
  interactive?: boolean;
  onViewportChange?: (viewport: CampaignViewBox) => void;
  cities: readonly CampaignCityVisual[];
  routes?: readonly WorldPolyline[];
  waterways?: readonly WorldPolyline[];
  mountainRanges?: readonly WorldPolyline[];
  backgroundImage?: string;
  locale?: 'en' | 'zh';
  className?: string;
  style?: CSSProperties;
  onCityClick?: (cityId: string) => void;
  onRouteClick?: (routeId: string) => void;
}

interface PanStart {
  pointerId: number;
  start: { x: number; y: number };
  viewport: CampaignViewBox;
}

function pathFromPoints(points: readonly { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function CitySymbol({
  city,
  locale,
  labelPlacement,
  onClick,
}: {
  city: CampaignCityVisual;
  locale: 'en' | 'zh';
  labelPlacement: CampaignLabelPlacement;
  onClick?: (cityId: string) => void;
}) {
  const art = campaignCityArtwork(city);
  const [artFailed, setArtFailed] = useState(false);
  useEffect(() => setArtFailed(false), [art.asset.path]);
  const color = city.controllerColor ?? '#72634d';

  const governance = city.governance;
  const label = city.name;
  const labelX = labelPlacement.x + labelPlacement.width / 2 - city.position.x;
  const labelY = labelPlacement.y + labelPlacement.height / 2 - city.position.y;
  return (
    <g
      className="v03-city-symbol"
      data-city-id={city.id}
      transform={`translate(${city.position.x} ${city.position.y})`}
      data-campaign-interactive={onClick ? 'true' : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(city.id);
      }}
      onKeyDown={(event) => {
        if (onClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onClick(city.id);
        }
      }}
      style={{ cursor: onClick ? 'pointer' : 'default', outline: 'none' }}
    >
      <line
        x1={0}
        y1={0}
        x2={labelX}
        y2={labelY}
        stroke="transparent"
        strokeWidth={20}
        pointerEvents="stroke"
      />
      <rect
        x={labelPlacement.x - city.position.x}
        y={labelPlacement.y - city.position.y}
        width={labelPlacement.width}
        height={labelPlacement.height}
        fill="transparent"
      />
      <line
        x1={0}
        y1={0}
        x2={labelX}
        y2={labelY}
        stroke="#9b8969"
        strokeWidth={0.85}
        opacity={0.6}
        pointerEvents="none"
      />
      <rect x={art.x} y={art.y} width={art.width} height={art.height + 8} fill="transparent" />
      <g className="v03-city-artwork" data-city-art={art.kind}>
        {city.selected ? (
          <ellipse
            cx={0}
            cy={-6}
            rx={art.width / 2 + 5}
            ry={16}
            fill="#edc86e"
            fillOpacity={0.24}
            stroke="#8c6419"
            strokeWidth={1.8}
          />
        ) : null}
        <ellipse
          cx={0}
          cy={-3}
          rx={art.width * 0.35}
          ry={5}
          fill={color}
          fillOpacity={0.18}
          stroke={color}
          strokeWidth={1.5}
        />
        {!artFailed ? (
          <image
            href={resolvePublicAsset(art.asset.path, import.meta.env.BASE_URL)}
            x={art.x}
            y={art.y}
            width={art.width}
            height={art.height}
            onError={() => setArtFailed(true)}
            aria-hidden="true"
          />
        ) : (
          <g aria-hidden="true" fill="#e9ddc8" stroke={color} strokeWidth={2}>
            <path d="M -20 -3 V -21 H -10 V -29 H 10 V -21 H 20 V -3 Z" />
            <path d="M -4 -3 V -14 H 4 V -3" fill="#514a3b" />
          </g>
        )}
        {governance ? (
          <g
            transform={`translate(${art.width * 0.36} ${art.y + art.height * 0.25})`}
            aria-label={
              governance === 'direct'
                ? message(locale, 'ui.ruler.s.capital.126')
                : governance === 'governed'
                  ? message(locale, 'ui.governor.145')
                  : message(locale, 'ui.local.stewardship.13')
            }
          >
            <circle
              r={8}
              fill={
                governance === 'direct'
                  ? '#3c7374'
                  : governance === 'governed'
                    ? '#966c3c'
                    : '#72634d'
              }
              stroke="#fff8e9"
              strokeWidth={1.5}
            />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fill="#fffaf0"
              fontSize={8}
              fontWeight={700}
            >
              {governance === 'direct'
                ? message(locale, 'ui.r.146')
                : governance === 'governed'
                  ? message(locale, 'ui.g.147')
                  : message(locale, 'ui.l.148')}
            </text>
          </g>
        ) : null}
      </g>
      <text
        className="v03-city-label"
        x={labelX}
        y={labelY + 6}
        textAnchor="middle"
        fontSize={18}
        fontWeight={city.scale === 'humble' ? 500 : 700}
        fill="#392f25"
        stroke="#f3ecde"
        strokeWidth={3}
        paintOrder="stroke"
      >
        {label}
      </text>
      <title>{city.info ?? label}</title>
    </g>
  );
}

/**
 * Read-only atlas view. All city positions and route/rivers points come from
 * geography data; this component only draws the supplied layout.
 */
export function CampaignMapView({
  bounds,
  viewport,
  interactive = false,
  onViewportChange,
  cities,
  routes = [],
  waterways = [],
  mountainRanges = [],
  backgroundImage,
  locale = 'en',
  className,
  style,
  onCityClick,
  onRouteClick,
}: CampaignMapViewProps) {
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  const panStartRef = useRef<PanStart | null>(null);
  const canNavigate = interactive && Boolean(onViewportChange);
  useEffect(() => setBackgroundFailed(false), [backgroundImage]);
  const cityOrder = useMemo(
    () => [...cities].sort((a, b) => a.position.y - b.position.y || a.id.localeCompare(b.id)),
    [cities],
  );
  const cityLabels = useMemo(() => layoutCampaignCityLabels(cities), [cities]);
  const activeViewport = viewport ?? bounds;
  const viewBox = `${activeViewport.left} ${activeViewport.top} ${activeViewport.width} ${activeViewport.height}`;
  const pointerWorldPoint = (clientX: number, clientY: number, view: CampaignViewBox) => {
    const svg = svgRef.current;
    if (!svg) return { x: view.left, y: view.top };
    const rect = svg.getBoundingClientRect();
    const scale = Math.min(rect.width / view.width, rect.height / view.height);
    if (!Number.isFinite(scale) || scale <= 0) return { x: view.left, y: view.top };
    const offsetX = (rect.width - view.width * scale) / 2;
    const offsetY = (rect.height - view.height * scale) / 2;
    return {
      x: view.left + (clientX - rect.left - offsetX) / scale,
      y: view.top + (clientY - rect.top - offsetY) / scale,
    };
  };
  const svgRef = useRef<SVGSVGElement | null>(null);
  const startPan = (event: PointerEvent<SVGSVGElement>) => {
    if (!canNavigate || event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest?.('[data-campaign-interactive="true"]')) return;
    event.preventDefault();
    const start = pointerWorldPoint(event.clientX, event.clientY, activeViewport);
    panStartRef.current = { pointerId: event.pointerId, start, viewport: activeViewport };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePan = (event: PointerEvent<SVGSVGElement>) => {
    const drag = panStartRef.current;
    if (!canNavigate || !drag || drag.pointerId !== event.pointerId) return;
    const current = pointerWorldPoint(event.clientX, event.clientY, drag.viewport);
    onViewportChange?.(
      panCampaignViewport(
        drag.viewport,
        { x: current.x - drag.start.x, y: current.y - drag.start.y },
        bounds,
      ),
    );
  };
  const endPan = (event: PointerEvent<SVGSVGElement>) => {
    if (panStartRef.current?.pointerId !== event.pointerId) return;
    panStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    if (!canNavigate) return;
    event.preventDefault();
    const focus = pointerWorldPoint(event.clientX, event.clientY, activeViewport);
    onViewportChange?.(
      zoomCampaignViewport(activeViewport, bounds, focus, Math.exp(-event.deltaY * 0.001)),
    );
  };
  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!canNavigate) return;
    const pan = {
      x: activeViewport.width * 0.08,
      y: activeViewport.height * 0.08,
    };
    const delta =
      event.key === 'ArrowLeft'
        ? { x: pan.x, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: -pan.x, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: pan.y }
            : event.key === 'ArrowDown'
              ? { x: 0, y: -pan.y }
              : null;
    if (delta) {
      event.preventDefault();
      onViewportChange?.(panCampaignViewport(activeViewport, delta, bounds));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      onViewportChange?.(
        zoomCampaignViewport(
          activeViewport,
          bounds,
          {
            x: activeViewport.left + activeViewport.width / 2,
            y: activeViewport.top + activeViewport.height / 2,
          },
          1.25,
        ),
      );
    } else if (event.key === '-') {
      event.preventDefault();
      onViewportChange?.(
        zoomCampaignViewport(
          activeViewport,
          bounds,
          {
            x: activeViewport.left + activeViewport.width / 2,
            y: activeViewport.top + activeViewport.height / 2,
          },
          0.8,
        ),
      );
    } else if (event.key === 'Home') {
      event.preventDefault();
      const rect = svgRef.current?.getBoundingClientRect();
      onViewportChange?.(
        fitCampaignViewport(bounds, rect && rect.height > 0 ? rect.width / rect.height : 1),
      );
    }
  };
  const resolvedBackground =
    backgroundImage ??
    resolvePublicAsset(V03_ASSETS.campaignMapChinaInk01.path, import.meta.env.BASE_URL);
  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      role={canNavigate ? 'application' : 'img'}
      aria-label={message(locale, 'ui.three.kingdoms.campaign.map.use.arrow.keys.to.pa.149')}
      tabIndex={canNavigate ? 0 : undefined}
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        background: '#eee4d0',
        touchAction: canNavigate ? 'none' : undefined,
        userSelect: canNavigate ? 'none' : undefined,
        cursor: canNavigate ? 'grab' : undefined,
        ...style,
      }}
    >
      <defs>
        <linearGradient id="v03-campaign-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3ebd9" />
          <stop offset="1" stopColor="#e8dcc3" />
        </linearGradient>
        <linearGradient id="v03-campaign-river" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#96b6ae" />
          <stop offset="1" stopColor="#6f9896" />
        </linearGradient>
        <pattern id="v03-campaign-grain" width="44" height="44" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="12" r="0.9" fill="#625944" opacity="0.12" />
          <circle cx="30" cy="26" r="0.7" fill="#625944" opacity="0.1" />
          <path
            d="M 13 36 q 9 -3 16 1"
            fill="none"
            stroke="#7d7058"
            strokeWidth="0.8"
            opacity="0.08"
          />
        </pattern>
      </defs>
      <rect
        x={bounds.left}
        y={bounds.top}
        width={bounds.width}
        height={bounds.height}
        fill="url(#v03-campaign-paper)"
      />
      {!backgroundFailed ? (
        <image
          href={resolvedBackground}
          x={bounds.left}
          y={bounds.top}
          width={bounds.width}
          height={bounds.height}
          preserveAspectRatio="none"
          onError={() => setBackgroundFailed(true)}
          aria-hidden="true"
        />
      ) : null}
      <rect
        x={bounds.left}
        y={bounds.top}
        width={bounds.width}
        height={bounds.height}
        fill="url(#v03-campaign-grain)"
      />
      {CAMPAIGN_REGION_LABELS.map((region) => (
        <text
          key={region.en}
          x={region.position.x}
          y={region.position.y}
          fill="#837c68"
          fontSize={28}
          opacity={0.43}
          textAnchor="middle"
          letterSpacing={locale === 'zh' ? 7 : 2}
          pointerEvents="none"
          aria-hidden="true"
        >
          {region[locale]}
        </text>
      ))}
      {mountainRanges.map((range) => (
        <g key={range.id} aria-label={range.label ?? message(locale, 'ui.mountain.range.150')}>
          <path
            d={pathFromPoints(range.points)}
            fill="none"
            stroke="#665f53"
            strokeWidth={17}
            strokeOpacity={0.12}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={pathFromPoints(range.points)}
            fill="none"
            stroke="#635c50"
            strokeWidth={4}
            strokeOpacity={0.34}
            strokeDasharray="4 11"
            strokeLinecap="round"
          />
          {range.label ? <title>{range.label}</title> : null}
        </g>
      ))}
      {waterways.map((waterway) => (
        <g key={waterway.id} aria-label={waterway.label ?? message(locale, 'ui.river.151')}>
          <path
            d={pathFromPoints(waterway.points)}
            fill="none"
            stroke="#537f80"
            strokeWidth={16}
            strokeOpacity={0.16}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={pathFromPoints(waterway.points)}
            fill="none"
            stroke="url(#v03-campaign-river)"
            strokeWidth={7}
            strokeOpacity={0.78}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={pathFromPoints(waterway.points)}
            fill="none"
            stroke="#e3e6d5"
            strokeWidth={1.3}
            strokeDasharray="2 14"
            strokeLinecap="round"
          />
          {waterway.label ? <title>{waterway.label}</title> : null}
        </g>
      ))}
      {routes.map((route) => (
        <g
          key={route.id}
          role={onRouteClick ? 'button' : undefined}
          data-campaign-interactive={onRouteClick ? 'true' : undefined}
          tabIndex={onRouteClick ? 0 : undefined}
          onClick={() => onRouteClick?.(route.id)}
          onKeyDown={(event) => {
            if (onRouteClick && (event.key === 'Enter' || event.key === ' ')) {
              event.preventDefault();
              onRouteClick(route.id);
            }
          }}
          style={{ cursor: onRouteClick ? 'pointer' : 'default' }}
        >
          <path
            d={pathFromPoints(route.points)}
            fill="none"
            stroke={
              route.display === 'selected'
                ? '#a33f32'
                : route.display === 'transport'
                  ? '#3e718d'
                  : route.display === 'waiting'
                    ? '#977849'
                    : route.display === 'marching'
                      ? '#39777a'
                      : '#806c50'
            }
            strokeWidth={route.display === 'selected' ? 6 : route.display === 'route' ? 1.8 : 4}
            strokeOpacity={route.display === 'selected' ? 0.94 : 0.78}
            strokeDasharray={
              route.display === 'marching'
                ? '3 5'
                : route.display === 'waiting'
                  ? '1 5'
                  : route.display === 'transport'
                    ? '8 4 2 4'
                    : route.display === 'selected'
                      ? '10 5'
                      : '5 5'
            }
            strokeLinecap="round"
          />
          {route.display === 'waiting' && route.points.length > 0 ? (
            <circle
              cx={route.points[route.points.length - 1]?.x}
              cy={route.points[route.points.length - 1]?.y}
              r="7"
              fill="#f5e5b9"
              stroke="#977849"
              strokeWidth="2"
            />
          ) : null}
          <title>{route.label ?? route.id}</title>
        </g>
      ))}
      {cityOrder.map((city) => (
        <CitySymbol
          key={city.id}
          city={city}
          locale={locale}
          labelPlacement={cityLabels.get(city.id)!}
          onClick={onCityClick}
        />
      ))}
      {/* Keep geographic anchors clickable above nearby artwork and label connectors. */}
      {onCityClick
        ? cityOrder.map((city) => (
            <circle
              key={`anchor-${city.id}`}
              cx={city.position.x}
              cy={city.position.y}
              r={10}
              fill="transparent"
              data-campaign-interactive="true"
              className="v03-city-anchor"
              data-city-id={city.id}
              role="button"
              tabIndex={0}
              aria-label={city.name}
              style={{ cursor: 'pointer' }}
              onClick={(event) => {
                event.stopPropagation();
                onCityClick(city.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onCityClick(city.id);
                }
              }}
            />
          ))
        : null}
    </svg>
  );
}
