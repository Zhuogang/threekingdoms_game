import { message } from '../i18n';
import { nearestLegalBattleCell, battleMovementPreview } from './battle-input';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import { V03_ASSETS, resolvePublicAsset, spriteOffsetFromAnchor } from './assets';
import {
  BATTLE_VIEW_INSETS,
  battlefieldBounds,
  cameraOrigin,
  clientToViewBoxPoint,
  diamondVertices,
  fitScale,
  gridToWorld,
  hitTestWorld,
  type BoardBounds,
  type GridPoint,
  type Point,
} from './geometry';
import {
  fitBattlefieldViewport,
  panBattlefieldViewport,
  zoomBattlefieldViewport,
  type BattlefieldViewBox,
} from './battlefield-viewport';
import {
  formatModifier,
  formatTroopCount,
  isLivingBattleUnitVisual,
  troopGlyph,
  troopName,
  unitIsOnWater,
  type BattleUnitVisual,
  type CellMarker,
} from './presentation';

export type BattlefieldTerrainVisual = 'plain' | 'forest' | 'hill' | 'water' | 'cliff' | string;

export interface BattlefieldVisualMap {
  id?: string;
  width: number;
  height: number;
  terrain: readonly BattlefieldTerrainVisual[];
}

export interface BattlefieldMapViewProps {
  map: BattlefieldVisualMap;
  units?: readonly BattleUnitVisual[];
  camps?: readonly CellMarker[];
  route?: readonly GridPoint[];
  selectedCell?: GridPoint;
  reachableCells?: readonly (GridPoint & { cost?: number })[];
  attackableCells?: readonly GridPoint[];
  tacticTargetCells?: readonly GridPoint[];
  viewport?: BattlefieldViewBox;
  /** Enables drag pan, wheel zoom and keyboard camera controls. */
  interactive?: boolean;
  onViewportChange?: (viewport: BattlefieldViewBox) => void;
  locale?: 'en' | 'zh';
  waterAttackMultiplier?: number;
  waterIncomingDamageMultiplier?: number;
  className?: string;
  style?: CSSProperties;
  onCellClick?: (cell: GridPoint) => void;
  onUnitClick?: (unitId: string, cell: GridPoint) => void;
}

const BASE_URL = import.meta.env.BASE_URL;
const GROUND_HREF = resolvePublicAsset(V03_ASSETS.groundInk01.path, BASE_URL);
const RIDGE_HREF = resolvePublicAsset(V03_ASSETS.ridgePineInk01.path, BASE_URL);
const TRANSPORT_HREF = resolvePublicAsset(V03_ASSETS.transportCraftInk01.path, BASE_URL);
const UNIT_HREFS = {
  infantry: resolvePublicAsset(V03_ASSETS.infantryInk01.path, BASE_URL),
  archer: resolvePublicAsset(V03_ASSETS.archerInk01.path, BASE_URL),
  cavalry: resolvePublicAsset(V03_ASSETS.cavalryInk01.path, BASE_URL),
};

function useImageAvailability(path: string): boolean {
  const [readyPath, setReadyPath] = useState<string | null>(null);
  useEffect(() => {
    if (typeof Image === 'undefined') return;
    let live = true;
    const image = new Image();
    image.onload = () => {
      if (live) setReadyPath(path);
    };
    image.onerror = () => {
      if (live) setReadyPath((current) => (current === path ? null : current));
    };
    image.src = path;
    return () => {
      live = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [path]);
  return readyPath === path;
}

function viewBoxFor(
  bounds: BoardBounds,
  viewport?: BattlefieldMapViewProps['viewport'],
): BoardBounds {
  if (!viewport) return bounds;
  if (
    !Number.isFinite(viewport.left) ||
    !Number.isFinite(viewport.top) ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  )
    return bounds;
  return {
    left: viewport.left,
    top: viewport.top,
    right: viewport.left + viewport.width,
    bottom: viewport.top + viewport.height,
    width: viewport.width,
    height: viewport.height,
  };
}

interface PanStart {
  pointerId: number;
  clientX: number;
  clientY: number;
  world: Point;
  viewport: BattlefieldViewBox;
}

function cellPath(center: Point): string {
  const vertices = diamondVertices(center);
  const first = vertices[0];
  if (!first) return '';
  return `M ${first.x} ${first.y} ${vertices
    .slice(1)
    .map((point) => `L ${point.x} ${point.y}`)
    .join(' ')} Z`;
}

function terrainName(terrain: string, locale: 'en' | 'zh'): string {
  const labels: Record<string, { en: string; zh: string }> = {
    plain: { en: 'Open ground', zh: '平地' },
    forest: { en: 'Forest', zh: '林地' },
    hill: { en: 'Walkable hill', zh: '可通行山坡' },
    water: { en: 'Water', zh: '水域' },
    cliff: { en: 'Impassable cliff', zh: '不可通行峭壁' },
  };
  return labels[terrain]?.[locale] ?? terrain;
}

function CampSymbol({ camp, locale }: { camp: CellMarker; locale: 'en' | 'zh' }) {
  const center = gridToWorld(camp.position);
  const { x, y } = center;
  return (
    <g
      transform={`translate(${x} ${y})`}
      aria-label={camp.label ?? message(locale, 'ui.field.camp.objective.138')}
    >
      <ellipse
        cx="0"
        cy="9"
        rx="27"
        ry="12"
        fill="#e6d9bd"
        fillOpacity="0.72"
        stroke="#716346"
        strokeWidth="2"
      />
      <path d="M -17 6 L 0 -13 L 17 6 Z" fill="#e9dcc1" stroke="#554b3d" strokeWidth="2" />
      <path d="M 0 -13 L 0 7" stroke="#554b3d" strokeWidth="2" />
      <path d="M 1 -14 L 11 -20 L 11 -11 Z" fill="#a34e3b" stroke="#6c3b31" strokeWidth="1.5" />
      <title>{camp.label ?? message(locale, 'ui.field.camp.objective.138')}</title>
    </g>
  );
}

function NativeUnitToken({ unit, locale }: { unit: BattleUnitVisual; locale: 'en' | 'zh' }) {
  const glyph = troopGlyph(unit.troopType);
  const title = [
    troopName(unit.troopType, locale),
    unit.label,
    unit.strength === undefined ? undefined : String(unit.strength),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <g transform="translate(0 -30)" aria-label={title}>
      <path
        d="M 0 -20 L 18 -9 L 15 11 L 0 20 L -15 11 L -18 -9 Z"
        fill="#f6f0e3"
        stroke="#2e2923"
        strokeWidth="2.5"
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="17"
        fontWeight="700"
        fill="#2e2923"
      >
        {glyph}
      </text>
    </g>
  );
}

function UnitSprite({
  unit,
  map,
  locale,
  imageReady,
  transportReady,
  waterAttackMultiplier,
  waterIncomingDamageMultiplier,
  onClick,
}: {
  unit: BattleUnitVisual;
  map: BattlefieldVisualMap;
  locale: 'en' | 'zh';
  imageReady: boolean;
  transportReady: boolean;
  waterAttackMultiplier?: number;
  waterIncomingDamageMultiplier?: number;
  onClick?: (unitId: string, cell: GridPoint) => void;
}) {
  const { x, y } = gridToWorld(unit.position);
  const onWater = unitIsOnWater(unit, map);
  const unitHref =
    unit.troopType in UNIT_HREFS
      ? UNIT_HREFS[unit.troopType as keyof typeof UNIT_HREFS]
      : undefined;
  const unitSize = unit.troopType === 'cavalry' ? V03_ASSETS.cavalryInk01.renderWidth : 84;
  const unitAnchor = [0.5, 0.86] as const;
  const spriteOffset = spriteOffsetFromAnchor(unitSize, unitSize, unitAnchor);
  const selected = unit.selected;
  const factionStroke = unit.faction === 'player' ? '#376f73' : '#a6493d';
  const localeName = troopName(unit.troopType, locale);
  const attackText = formatModifier(onWater ? waterAttackMultiplier : undefined, locale);
  const damageText = formatModifier(onWater ? waterIncomingDamageMultiplier : undefined, locale);
  const countLabel =
    unit.strength === undefined ? undefined : formatTroopCount(unit.strength, locale);
  const countWidth = countLabel ? countLabel.length * 6.4 + 14 : 0;
  const details = [
    localeName,
    unit.label,
    unit.strength === undefined ? undefined : String(unit.strength),
    unit.status,
  ]
    .filter(Boolean)
    .join(' · ');
  const aria = [
    details,
    onWater ? message(locale, 'ui.afloat.139') : undefined,
    attackText ? `${message(locale, 'ui.water.attack.140')} ${attackText}` : undefined,
    damageText ? `${message(locale, 'ui.incoming.damage.141')} ${damageText}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <g
      className="v03-unit-token"
      data-unit-id={unit.id}
      transform={`translate(${x} ${y})`}
      role="button"
      tabIndex={0}
      aria-label={aria}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(unit.id, unit.position);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.(unit.id, unit.position);
        }
      }}
      style={{ cursor: 'pointer', outline: 'none' }}
    >
      {onWater && transportReady ? (
        <image
          href={TRANSPORT_HREF}
          x={-V03_ASSETS.transportCraftInk01.renderWidth / 2}
          y={-V03_ASSETS.transportCraftInk01.renderHeight * 0.6}
          width={V03_ASSETS.transportCraftInk01.renderWidth}
          height={V03_ASSETS.transportCraftInk01.renderHeight}
          preserveAspectRatio="none"
          aria-hidden="true"
        />
      ) : null}
      {selected ? <circle r={49} fill="none" stroke="#f5c45b" strokeWidth={5} /> : null}
      <circle
        cx={0}
        cy={2}
        r={34}
        fill="#f6f0e3"
        fillOpacity={0.9}
        stroke={factionStroke}
        strokeWidth={selected ? 5 : 3}
      />
      {imageReady && unitHref ? (
        <image
          href={unitHref}
          x={spriteOffset.x}
          y={spriteOffset.y}
          width={unitSize}
          height={unitSize}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        />
      ) : (
        <NativeUnitToken unit={unit} locale={locale} />
      )}
      {onWater ? (
        <g transform="translate(0 35)" aria-label={message(locale, 'ui.afloat.139')}>
          <rect
            x={-24}
            y={-10}
            width={48}
            height={20}
            rx={9}
            fill="#3b7881"
            stroke="#f8f1df"
            strokeWidth={2}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={11}
            fontWeight="700"
            fill="#fffaf0"
          >
            {message(locale, 'ui.afloat.142')}
          </text>
        </g>
      ) : null}
      {countLabel !== undefined ? (
        <g transform="translate(24 -32)">
          <rect
            x={-countWidth / 2}
            y={-12}
            width={countWidth}
            height={24}
            rx={10}
            fill="#f7efe0"
            stroke={factionStroke}
            strokeWidth={2}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={10}
            fontWeight="700"
            fill="#29251f"
          >
            {countLabel}
          </text>
        </g>
      ) : null}
      <title>{aria}</title>
    </g>
  );
}

/**
 * Read-only SVG view of a supplied rules snapshot. It never computes movement,
 * range, damage, or water modifiers; highlights and values are caller-owned.
 */
export function BattlefieldMapView({
  map,
  units = [],
  camps = [],
  route = [],
  selectedCell,
  reachableCells = [],
  attackableCells = [],
  tacticTargetCells = [],
  viewport,
  interactive = false,
  onViewportChange,
  locale = 'en',
  waterAttackMultiplier,
  waterIncomingDamageMultiplier,
  className,
  style,
  onCellClick,
  onUnitClick,
}: BattlefieldMapViewProps) {
  const [focusedCell, setFocusedCell] = useState<GridPoint>(
    () => selectedCell ?? { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) },
  );
  const [mapHasFocus, setMapHasFocus] = useState(false);
  const [mapIsPanning, setMapIsPanning] = useState(false);
  const panStartRef = useRef<PanStart | null>(null);
  const didPanRef = useRef(false);
  useEffect(() => {
    setFocusedCell(selectedCell ?? { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) });
  }, [selectedCell?.x, selectedCell?.y, map.width, map.height]);
  const groundReady = useImageAvailability(GROUND_HREF);
  const ridgeReady = useImageAvailability(RIDGE_HREF);
  const transportReady = useImageAvailability(TRANSPORT_HREF);
  const infantryReady = useImageAvailability(UNIT_HREFS.infantry);
  const archerReady = useImageAvailability(UNIT_HREFS.archer);
  const cavalryReady = useImageAvailability(UNIT_HREFS.cavalry);
  const imageAssets = {
    ground: groundReady,
    ridge: ridgeReady,
    transport: transportReady,
    infantry: infantryReady,
    archer: archerReady,
    cavalry: cavalryReady,
  };
  const board = useMemo(
    () => battlefieldBounds(map.width, map.height, 140),
    [map.width, map.height],
  );
  const view = viewBoxFor(board, viewport);
  const canNavigate = interactive && Boolean(onViewportChange);
  const safeLength = map.width * map.height;
  const terrain = Array.from({ length: safeLength }, (_, index) => map.terrain[index] ?? 'plain');
  const reachable = new Set(reachableCells.map(({ x, y }) => `${x},${y}`));
  const attackable = new Set(attackableCells.map(({ x, y }) => `${x},${y}`));
  const tacticTargetable = new Set(tacticTargetCells.map(({ x, y }) => `${x},${y}`));
  const [hoverCell, setHoverCell] = useState<GridPoint | null>(null);
  const previewPath = route.length
    ? route
    : battleMovementPreview(selectedCell, hoverCell, reachableCells);
  const routePoints = previewPath.map((point) => gridToWorld(point));
  const routePath = routePoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const selectedId = selectedCell ? `${selectedCell.x},${selectedCell.y}` : null;
  const backgroundId = `v03-ground-${map.id ?? 'map'}`.replace(/[^a-zA-Z0-9_-]/g, '-');

  const clickCell = (event: MouseEvent<SVGSVGElement>) => {
    if (didPanRef.current) {
      didPanRef.current = false;
      return;
    }
    if (!onCellClick) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const world = clientToViewBoxPoint({ x: event.clientX, y: event.clientY }, rect, {
      left: view.left,
      top: view.top,
      width: view.width,
      height: view.height,
    });
    const cell = hitTestWorld(world, map.width, map.height);
    const snapped = nearestLegalBattleCell(world, reachableCells);
    if (snapped || cell) onCellClick(snapped ?? cell!);
  };
  const pointerWorldPoint = (clientX: number, clientY: number, camera: BattlefieldViewBox) =>
    clientToViewBoxPoint(
      { x: clientX, y: clientY },
      svgRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 },
      camera,
    );
  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    didPanRef.current = false;
    if (!canNavigate || event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest?.('[role="button"]')) return;
    const camera = viewport ?? board;
    panStartRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      world: pointerWorldPoint(event.clientX, event.clientY, camera),
      viewport: camera,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const hoverWorld = pointerWorldPoint(event.clientX, event.clientY, viewport ?? board);
    setHoverCell(
      nearestLegalBattleCell(hoverWorld, reachableCells) ??
        hitTestWorld(hoverWorld, map.width, map.height),
    );
    const drag = panStartRef.current;
    if (!canNavigate || !drag || drag.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) > 4) {
      didPanRef.current = true;
      setMapIsPanning(true);
    }
    if (!didPanRef.current) return;
    const current = pointerWorldPoint(event.clientX, event.clientY, drag.viewport);
    onViewportChange?.(
      panBattlefieldViewport(
        drag.viewport,
        { x: current.x - drag.world.x, y: current.y - drag.world.y },
        board,
      ),
    );
  };
  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (panStartRef.current?.pointerId !== event.pointerId) return;
    panStartRef.current = null;
    setMapIsPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    if (!canNavigate) return;
    event.preventDefault();
    const camera = viewport ?? board;
    onViewportChange?.(
      zoomBattlefieldViewport(
        camera,
        board,
        pointerWorldPoint(event.clientX, event.clientY, camera),
        Math.exp(-event.deltaY * 0.001),
      ),
    );
  };
  const handleMapKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget || (!onCellClick && !canNavigate)) return;
    const camera = viewport ?? board;
    if (canNavigate && event.shiftKey && event.key.startsWith('Arrow')) {
      const pan = {
        x: camera.width * 0.08,
        y: camera.height * 0.08,
      };
      const delta =
        event.key === 'ArrowLeft'
          ? { x: pan.x, y: 0 }
          : event.key === 'ArrowRight'
            ? { x: -pan.x, y: 0 }
            : event.key === 'ArrowUp'
              ? { x: 0, y: pan.y }
              : { x: 0, y: -pan.y };
      event.preventDefault();
      onViewportChange?.(panBattlefieldViewport(camera, delta, board));
      return;
    }
    if (canNavigate && ['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      onViewportChange?.(
        zoomBattlefieldViewport(
          camera,
          board,
          { x: camera.left + camera.width / 2, y: camera.top + camera.height / 2 },
          event.key === '-' ? 0.8 : 1.25,
        ),
      );
      return;
    }
    if (canNavigate && event.key === 'Home') {
      event.preventDefault();
      const rect = svgRef.current?.getBoundingClientRect();
      onViewportChange?.(
        fitBattlefieldViewport(board, rect && rect.height > 0 ? rect.width / rect.height : 1),
      );
      return;
    }
    if (!onCellClick) return;
    let next: GridPoint | null = null;
    if (event.key === 'ArrowLeft') next = { ...focusedCell, x: Math.max(0, focusedCell.x - 1) };
    else if (event.key === 'ArrowRight')
      next = { ...focusedCell, x: Math.min(map.width - 1, focusedCell.x + 1) };
    else if (event.key === 'ArrowUp') next = { ...focusedCell, y: Math.max(0, focusedCell.y - 1) };
    else if (event.key === 'ArrowDown')
      next = { ...focusedCell, y: Math.min(map.height - 1, focusedCell.y + 1) };
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCellClick(focusedCell);
      return;
    }
    if (next) {
      event.preventDefault();
      setFocusedCell(next);
    }
  };

  const svgRef = useRef<SVGSVGElement | null>(null);
  return (
    <svg
      ref={svgRef}
      className={`v03-battlefield-map ${className ?? ''}`.trim()}
      viewBox={`${view.left} ${view.top} ${view.width} ${view.height}`}
      preserveAspectRatio="xMidYMid meet"
      role={onCellClick || canNavigate ? 'application' : 'img'}
      tabIndex={onCellClick || canNavigate ? 0 : undefined}
      aria-label={message(locale, 'ui.by.land.and.water.battlefield.map.arrow.keys.mov.143', {
        p0: map.width,
        p1: map.height,
        p2: focusedCell.y,
        p3: focusedCell.x,
      })}
      onClick={clickCell}
      onKeyDown={handleMapKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverCell(null)}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onFocus={() => setMapHasFocus(true)}
      onBlur={() => setMapHasFocus(false)}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        touchAction: canNavigate ? 'none' : 'manipulation',
        cursor: mapIsPanning ? 'grabbing' : canNavigate ? 'grab' : undefined,
        background: '#e8dfcc',
        ...style,
      }}
    >
      <defs>
        <pattern id={backgroundId} patternUnits="userSpaceOnUse" width={512} height={512}>
          {imageAssets.ground ? <image href={GROUND_HREF} width={512} height={512} /> : null}
        </pattern>
        <linearGradient id="v03-water-wash" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#93b5ae" />
          <stop offset="1" stopColor="#628d8e" />
        </linearGradient>
        <linearGradient id="v03-cliff-wash" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#777368" />
          <stop offset="1" stopColor="#4b4b46" />
        </linearGradient>
      </defs>
      {terrain.map((kind, index) => {
        const x = index % map.width;
        const y = Math.floor(index / map.width);
        const key = `${x},${y}`;
        const center = gridToWorld({ x, y });
        const d = cellPath(center);
        const fill =
          kind === 'water'
            ? 'url(#v03-water-wash)'
            : kind === 'cliff'
              ? 'url(#v03-cliff-wash)'
              : kind === 'forest'
                ? '#a7ad8b'
                : kind === 'hill'
                  ? '#c4b894'
                  : '#eee6d5';
        const description = terrainName(kind, locale);
        return (
          <g key={key}>
            <path
              d={d}
              fill={kind === 'plain' && imageAssets.ground ? `url(#${backgroundId})` : fill}
              stroke="#766e5e"
              strokeOpacity={0.42}
              strokeWidth={1.8}
            >
              <title>{`${description} · ${x + 1},${y + 1}`}</title>
            </path>
            {kind === 'water' ? (
              <path
                d={d}
                fill="none"
                stroke="#d2e0d0"
                strokeOpacity={0.5}
                strokeWidth={2}
                strokeDasharray="2 9"
              />
            ) : null}
            {kind === 'cliff' ? (
              <g pointerEvents="none">
                <path
                  d={`M ${center.x - 29} ${center.y + 8} L ${center.x - 8} ${center.y - 12} L ${center.x + 8} ${center.y + 5} L ${center.x + 25} ${center.y - 11}`}
                  fill="none"
                  stroke="#ece2cf"
                  strokeWidth={3}
                />
                <path
                  d={`M ${center.x - 25} ${center.y + 19} L ${center.x + 25} ${center.y + 19}`}
                  stroke="#302f2b"
                  strokeWidth={4}
                />
              </g>
            ) : null}
            {kind === 'forest' ? (
              <g fill="#546b55" stroke="#354e42" strokeWidth={1} pointerEvents="none">
                <circle cx={center.x - 16} cy={center.y - 3} r={11} />
                <circle cx={center.x} cy={center.y - 11} r={13} />
                <circle cx={center.x + 16} cy={center.y + 3} r={10} />
              </g>
            ) : null}
            {kind === 'hill' && imageAssets.ridge ? (
              <image
                href={RIDGE_HREF}
                x={center.x - 92}
                y={center.y - 94}
                width={184}
                height={184}
                preserveAspectRatio="xMidYMid meet"
                pointerEvents="none"
              />
            ) : null}
            {reachable.has(key) ? (
              <path
                d={d}
                fill="#a4c9a2"
                fillOpacity={0.32}
                stroke="#4b8c71"
                strokeWidth={3}
                pointerEvents="none"
              />
            ) : null}
            {attackable.has(key) ? (
              <path
                d={d}
                fill="#d8835b"
                fillOpacity={0.18}
                stroke="#a94c37"
                strokeWidth={4}
                strokeDasharray="8 6"
                pointerEvents="none"
              />
            ) : null}
            {tacticTargetable.has(key) ? (
              <path
                d={d}
                fill="#9d83b2"
                fillOpacity={0.2}
                stroke="#6d4a91"
                strokeWidth={4}
                strokeDasharray="3 4"
                pointerEvents="none"
              />
            ) : null}
            {hoverCell?.x === x && hoverCell?.y === y ? (
              <path d={d} fill="none" stroke="var(--accent)" strokeWidth={5} pointerEvents="none" />
            ) : null}
            {selectedId === key ? (
              <path
                d={d}
                fill="#f5c45b"
                fillOpacity={0.18}
                stroke="#946828"
                strokeWidth={5}
                pointerEvents="none"
              />
            ) : null}
          </g>
        );
      })}
      {routePath ? (
        <path
          d={routePath}
          fill="none"
          stroke="#9c4e37"
          strokeWidth={9}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="11 8"
          opacity={0.9}
          pointerEvents="none"
        />
      ) : null}
      {mapHasFocus ? (
        <path
          d={cellPath(gridToWorld(focusedCell))}
          fill="#d4a94e"
          fillOpacity={0.1}
          stroke="#4d6e87"
          strokeWidth={5}
          strokeDasharray="5 4"
          pointerEvents="none"
          aria-hidden="true"
        />
      ) : null}
      {camps.map((camp, index) => (
        <CampSymbol
          key={camp.id ?? `${camp.position.x}-${camp.position.y}-${index}`}
          camp={camp}
          locale={locale}
        />
      ))}
      {units.filter(isLivingBattleUnitVisual).map((unit) => {
        const isWater = unitIsOnWater(unit, map);
        const imageReady =
          unit.troopType === 'infantry'
            ? imageAssets.infantry
            : unit.troopType === 'archer'
              ? imageAssets.archer
              : unit.troopType === 'cavalry'
                ? imageAssets.cavalry
                : false;
        return (
          <UnitSprite
            key={unit.id}
            unit={{ ...unit, isOnWater: isWater }}
            map={map}
            locale={locale}
            imageReady={imageReady}
            transportReady={isWater && imageAssets.transport}
            waterAttackMultiplier={waterAttackMultiplier}
            waterIncomingDamageMultiplier={waterIncomingDamageMultiplier}
            onClick={onUnitClick}
          />
        );
      })}
      <rect
        x={board.left}
        y={board.top}
        width={board.width}
        height={board.height}
        fill="none"
        stroke="#4e473d"
        strokeWidth={3}
        pointerEvents="none"
      />
    </svg>
  );
}

export function battleCameraForViewport(
  viewportWidth: number,
  viewportHeight: number,
  width = 24,
  height = 20,
  pan: Point = { x: 0, y: 0 },
) {
  const bounds = battlefieldBounds(width, height, 140);
  const scale = fitScale(viewportWidth, viewportHeight, bounds, BATTLE_VIEW_INSETS);
  return {
    bounds,
    scale,
    origin: cameraOrigin(viewportWidth, viewportHeight, bounds, BATTLE_VIEW_INSETS, scale, pan),
  };
}
