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
  type SVGProps,
  type WheelEvent,
} from 'react';
import { V03_ASSETS, resolvePublicAsset } from './assets';
import { V03_BATTLEFIELD_CANVASES } from './battlefield-canvases.generated';
import { BattleTerrainPatterns, battleTerrainPatternId } from './BattleTerrainPatterns';
import {
  BATTLE_VIEW_INSETS,
  V03_BATTLE_CELL,
  V03_BATTLE_HALF_CELL,
  V03_BATTLEFIELD_PADDING,
  battlefieldBounds,
  cameraOrigin,
  clientToViewBoxPoint,
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
  battlePortraitPath,
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
  /** Canvas battlefield id; its shipped painting is drawn under the grid when there is one. */
  battlefieldId?: string;
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
  /**
   * Painted canvas drawn under the grid, stretched to the board edges. The tiled
   * terrain then shows at `terrainOpacity` (default 0) on top of it. Omitted, the
   * map's shipped canvas is used when it has one; `null` forces the tiles.
   */
  background?: { href: string; terrainOpacity?: number } | null;
  /** Faint cell grid; on by default. */
  showGrid?: boolean;
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
const TRANSPORT_HREF = resolvePublicAsset(V03_ASSETS.transportCraftInk01.path, BASE_URL);
const UNIT_HREFS = {
  infantry: resolvePublicAsset(V03_ASSETS.infantryInk01.path, BASE_URL),
  archer: resolvePublicAsset(V03_ASSETS.archerInk01.path, BASE_URL),
  cavalry: resolvePublicAsset(V03_ASSETS.cavalryInk01.path, BASE_URL),
};

function useImageAvailability(path: string): boolean {
  const [readyPath, setReadyPath] = useState<string | null>(null);
  useEffect(() => {
    if (!path || typeof Image === 'undefined') return;
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

/** Square cell outline, inset so neighbouring highlight strokes do not overlap. */
function CellRect({
  center,
  inset = 0,
  ...rest
}: { center: Point; inset?: number } & SVGRectProps) {
  return (
    <rect
      x={center.x - V03_BATTLE_HALF_CELL + inset}
      y={center.y - V03_BATTLE_HALF_CELL + inset}
      width={V03_BATTLE_CELL - inset * 2}
      height={V03_BATTLE_CELL - inset * 2}
      {...rest}
    />
  );
}
type SVGRectProps = Omit<SVGProps<SVGRectElement>, 'x' | 'y' | 'width' | 'height'>;

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

// Token layout inside one 64-unit cell, centered on the cell center.
const TOKEN_FACE_Y = -5;
const TOKEN_FACE_RADIUS = 23;
const TOKEN_SILHOUETTE = 44;

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
  const portraitHref = unit.portraitKey
    ? resolvePublicAsset(battlePortraitPath(unit.portraitKey), BASE_URL)
    : undefined;
  const clipId = `v03-token-face-${unit.id}`.replace(/[^a-zA-Z0-9_-]/g, '-');
  const selected = unit.selected;
  const factionStroke = unit.faction === 'player' ? '#376f73' : '#a6493d';
  const localeName = troopName(unit.troopType, locale);
  const attackText = formatModifier(onWater ? waterAttackMultiplier : undefined, locale);
  const damageText = formatModifier(onWater ? waterIncomingDamageMultiplier : undefined, locale);
  const countLabel =
    unit.strength === undefined ? undefined : formatTroopCount(unit.strength, locale);
  const countWidth = countLabel ? countLabel.length * 5.6 + 10 : 0;
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
      <clipPath id={clipId}>
        <circle cx={0} cy={TOKEN_FACE_Y} r={TOKEN_FACE_RADIUS - 2} />
      </clipPath>
      {selected ? (
        <rect
          x={-V03_BATTLE_HALF_CELL + 2}
          y={-V03_BATTLE_HALF_CELL + 2}
          width={V03_BATTLE_CELL - 4}
          height={V03_BATTLE_CELL - 4}
          rx={10}
          fill="#f5c45b"
          fillOpacity={0.22}
          stroke="#f5c45b"
          strokeWidth={4}
        />
      ) : null}
      {onWater ? (
        transportReady ? (
          <image
            href={TRANSPORT_HREF}
            x={-31}
            y={TOKEN_FACE_Y + 6}
            width={62}
            height={31}
            preserveAspectRatio="none"
            aria-hidden="true"
          />
        ) : (
          <path
            d={`M -30 ${TOKEN_FACE_Y + 14} Q 0 ${TOKEN_FACE_Y + 40} 30 ${TOKEN_FACE_Y + 14} Z`}
            fill="#7a5a3a"
            stroke="#3e2e20"
            strokeWidth={2}
            aria-hidden="true"
          />
        )
      ) : null}
      <circle
        cx={0}
        cy={TOKEN_FACE_Y}
        r={TOKEN_FACE_RADIUS}
        fill="#f6f0e3"
        stroke={factionStroke}
        strokeWidth={selected ? 4 : 3}
      />
      <g clipPath={`url(#${clipId})`} aria-hidden="true">
        {imageReady && unitHref ? (
          <image
            href={unitHref}
            x={-TOKEN_SILHOUETTE / 2}
            y={TOKEN_FACE_Y - TOKEN_SILHOUETTE / 2}
            width={TOKEN_SILHOUETTE}
            height={TOKEN_SILHOUETTE}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : (
          <text
            y={TOKEN_FACE_Y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={20}
            fontWeight="700"
            fill="#2e2923"
          >
            {troopGlyph(unit.troopType)}
          </text>
        )}
        {/* A missing portrait leaves the silhouette or glyph underneath visible. */}
        {portraitHref ? (
          <image
            href={portraitHref}
            x={-TOKEN_FACE_RADIUS}
            y={TOKEN_FACE_Y - TOKEN_FACE_RADIUS}
            width={TOKEN_FACE_RADIUS * 2}
            height={TOKEN_FACE_RADIUS * 2}
            preserveAspectRatio="xMidYMid slice"
          />
        ) : null}
      </g>
      <g transform="translate(19 -22)" aria-label={localeName}>
        <circle r={9.5} fill={factionStroke} stroke="#f8f1df" strokeWidth={1.6} />
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={11}
          fontWeight="700"
          fill="#fffaf0"
        >
          {troopGlyph(unit.troopType)}
        </text>
      </g>
      {onWater ? (
        <g transform="translate(-19 -22)" aria-label={message(locale, 'ui.afloat.139')}>
          <circle r={9} fill="#3b7881" stroke="#f8f1df" strokeWidth={1.6} />
          <path
            d="M -5 1 q 2.5 -3 5 0 t 5 0"
            fill="none"
            stroke="#fffaf0"
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </g>
      ) : null}
      {countLabel !== undefined ? (
        <g transform={`translate(0 ${TOKEN_FACE_Y + TOKEN_FACE_RADIUS + 4})`}>
          <rect
            x={-countWidth / 2}
            y={-7.5}
            width={countWidth}
            height={15}
            rx={7}
            fill="#f7efe0"
            stroke={factionStroke}
            strokeWidth={1.6}
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
  background,
  showGrid = true,
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
  const shippedCanvas = map.battlefieldId
    ? V03_BATTLEFIELD_CANVASES[map.battlefieldId]?.path
    : undefined;
  const requestedBackground =
    background === undefined && shippedCanvas
      ? { href: resolvePublicAsset(shippedCanvas, BASE_URL) }
      : (background ?? undefined);
  // Tiles stay visible until the painting has loaded, and if it never does.
  const backgroundReady = useImageAvailability(requestedBackground?.href ?? '');
  const canvasBackground = backgroundReady ? requestedBackground : undefined;
  const transportReady = useImageAvailability(TRANSPORT_HREF);
  const infantryReady = useImageAvailability(UNIT_HREFS.infantry);
  const archerReady = useImageAvailability(UNIT_HREFS.archer);
  const cavalryReady = useImageAvailability(UNIT_HREFS.cavalry);
  const imageAssets = {
    transport: transportReady,
    infantry: infantryReady,
    archer: archerReady,
    cavalry: cavalryReady,
  };
  const board = useMemo(
    () => battlefieldBounds(map.width, map.height, V03_BATTLEFIELD_PADDING),
    [map.width, map.height],
  );
  const grid = battlefieldBounds(map.width, map.height);
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
  const patternPrefix = `v03-terrain-${map.id ?? 'map'}`.replace(/[^a-zA-Z0-9_-]/g, '-');

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
        <BattleTerrainPatterns prefix={patternPrefix} />
      </defs>
      <rect
        x={board.left}
        y={board.top}
        width={board.width}
        height={board.height}
        fill="#d9cfb6"
        pointerEvents="none"
      />
      {canvasBackground ? (
        <image
          href={canvasBackground.href}
          x={grid.left}
          y={grid.top}
          width={grid.width}
          height={grid.height}
          preserveAspectRatio="none"
          pointerEvents="none"
        />
      ) : null}
      {terrain.map((kind, index) => {
        const x = index % map.width;
        const y = Math.floor(index / map.width);
        const center = gridToWorld({ x, y });
        const description = terrainName(kind, locale);
        return (
          <CellRect
            key={`${x},${y}`}
            center={center}
            fill={`url(#${battleTerrainPatternId(patternPrefix, kind)})`}
            fillOpacity={canvasBackground ? (canvasBackground.terrainOpacity ?? 0) : undefined}
          >
            <title>{`${description} · ${x + 1},${y + 1}`}</title>
          </CellRect>
        );
      })}
      {/* Faint grid: one line per cell edge, drawn once instead of per cell. */}
      <path
        display={showGrid ? undefined : 'none'}
        d={[
          ...Array.from({ length: map.width + 1 }, (_, i) => {
            const x = grid.left + i * V03_BATTLE_CELL;
            return `M ${x} ${grid.top} V ${grid.bottom}`;
          }),
          ...Array.from({ length: map.height + 1 }, (_, i) => {
            const y = grid.top + i * V03_BATTLE_CELL;
            return `M ${grid.left} ${y} H ${grid.right}`;
          }),
        ].join(' ')}
        stroke="#5e5646"
        strokeOpacity={0.22}
        strokeWidth={1}
        fill="none"
        pointerEvents="none"
      />
      {terrain.map((_, index) => {
        const x = index % map.width;
        const y = Math.floor(index / map.width);
        const key = `${x},${y}`;
        const highlights = [
          reachable.has(key) ? (
            <CellRect
              key="reach"
              center={gridToWorld({ x, y })}
              inset={1}
              fill="#8fbf8d"
              fillOpacity={0.38}
              stroke="#4b8c71"
              strokeOpacity={0.55}
              strokeWidth={1.2}
            />
          ) : null,
          attackable.has(key) ? (
            <CellRect
              key="attack"
              center={gridToWorld({ x, y })}
              inset={2}
              fill="#d8835b"
              fillOpacity={0.22}
              stroke="#a94c37"
              strokeWidth={3}
              strokeDasharray="7 5"
            />
          ) : null,
          tacticTargetable.has(key) ? (
            <CellRect
              key="tactic"
              center={gridToWorld({ x, y })}
              inset={2}
              fill="#9d83b2"
              fillOpacity={0.24}
              stroke="#6d4a91"
              strokeWidth={3}
              strokeDasharray="3 4"
            />
          ) : null,
          hoverCell?.x === x && hoverCell?.y === y ? (
            <CellRect
              key="hover"
              center={gridToWorld({ x, y })}
              inset={1.5}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={3.5}
            />
          ) : null,
          selectedId === key ? (
            <CellRect
              key="selected"
              center={gridToWorld({ x, y })}
              inset={1.5}
              fill="#f5c45b"
              fillOpacity={0.2}
              stroke="#946828"
              strokeWidth={3.5}
            />
          ) : null,
        ].filter(Boolean);
        return highlights.length ? (
          <g key={key} pointerEvents="none">
            {highlights}
          </g>
        ) : null;
      })}
      {routePath ? (
        <path
          d={routePath}
          fill="none"
          stroke="#9c4e37"
          strokeWidth={6}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="11 8"
          opacity={0.9}
          pointerEvents="none"
        />
      ) : null}
      {mapHasFocus ? (
        <CellRect
          center={gridToWorld(focusedCell)}
          inset={1.5}
          fill="#d4a94e"
          fillOpacity={0.1}
          stroke="#4d6e87"
          strokeWidth={3.5}
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
        x={grid.left}
        y={grid.top}
        width={grid.width}
        height={grid.height}
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
  const bounds = battlefieldBounds(width, height, V03_BATTLEFIELD_PADDING);
  const scale = fitScale(viewportWidth, viewportHeight, bounds, BATTLE_VIEW_INSETS);
  return {
    bounds,
    scale,
    origin: cameraOrigin(viewportWidth, viewportHeight, bounds, BATTLE_VIEW_INSETS, scale, pan),
  };
}
