import {
  forwardRef,
  memo,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  fitBattlefieldViewport,
  panBattlefieldViewport,
  recenterBattlefieldViewport,
  resizeBattlefieldViewport,
  zoomBattlefieldViewport,
  type BattlefieldViewBox,
} from '../../v03/rendering/battlefield-viewport';
import { DEPLOY_SHU, MAP_HEIGHT, MAP_WIDTH, cellKey } from '../content/chencang';
import { cellHeight, cellTerrain, isMapCell } from '../rules/map';
import { activeUnit, distance } from '../rules/combat';
import type { SiegePosition, SiegeState, SiegeUnit } from '../rules/types';
import type { Facing } from '../save';
import { siegeText, type SiegeLocale } from '../i18n';
import {
  ART,
  CAMP,
  FRAME,
  H,
  INNER_WALL_JOB,
  INNER_WALL_MASKS,
  MAP,
  MAP_DIR,
  MAP_FILES,
  W,
  effect,
  sheet,
  sheetImage,
} from './assets';
import { spriteObject, type Sprite } from './mapPieces';
import {
  compareDepth,
  pickCell,
  project,
  rectsOverlap,
  sliceObject,
  type SceneSlice,
  type ScreenRect,
} from './scene';
import {
  climbableCells,
  engineSprite,
  statePatches,
  unitVisual,
  type EngineSprite,
} from './stateArt';
import { composeSiegePainting } from './painting';

const BOUNDS = { left: 0, top: 0, right: W, bottom: H, width: W, height: H };
interface Layer {
  slice: SceneSlice;
  sprite?: Sprite;
  mask?: { href: string; rect: ScreenRect };
}
export interface SiegeMapHandle {
  zoom: (scale: number) => void;
  focus: (position?: SiegePosition) => void;
  full: () => void;
}
interface Props {
  state: SiegeState;
  locale: SiegeLocale;
  selected?: string | null;
  reachable?: SiegePosition[];
  targets?: SiegePosition[];
  deploy?: boolean;
  xray?: boolean;
  showRange?: boolean;
  facings?: Record<string, Facing>;
  activity?: { id: string; type: string } | null;
  effectAction?: { from: SiegePosition; to: SiegePosition; type: string } | null;
  onSelect?: (id: string) => void;
  onCell?: (cell: SiegePosition) => void;
  onZoom?: (scale: number) => void;
}
export const SiegeMapView = memo(
  forwardRef<SiegeMapHandle, Props>(function SiegeMapView(
    {
      state,
      locale,
      selected,
      reachable = [],
      targets = [],
      deploy = false,
      xray = false,
      showRange = true,
      facings = {},
      activity,
      effectAction,
      onSelect,
      onCell,
      onZoom,
    },
    ref,
  ) {
    const prefix = useId().replace(/:/g, '');
    const frame = useRef<HTMLDivElement>(null);
    const svg = useRef<SVGSVGElement>(null);
    const drag = useRef<{ x: number; y: number; view: BattlefieldViewBox; moved: boolean } | null>(
      null,
    );
    const [view, setView] = useState<BattlefieldViewBox>({
      left: 1036,
      top: 490,
      width: 1000,
      height: 700,
    });
    const viewRef = useRef(view);
    viewRef.current = view;
    const [hover, setHover] = useState<SiegePosition | null>(null);
    const patches = useMemo(() => statePatches(state), [state]);
    const signature = JSON.stringify(patches);
    const [composed, setComposed] = useState<{ signature: string; href: string } | null>(null);
    const painting =
      composed?.signature === signature ? composed.href : MAP_FILES[`${MAP_DIR}/composite.webp`]!;
    useEffect(() => {
      if (!patches.length) {
        setComposed(null);
        return;
      }
      let cancelled = false;
      let href: string | undefined;
      void composeSiegePainting(patches).then((url) => {
        if (cancelled) URL.revokeObjectURL(url);
        else {
          href = url;
          setComposed({ signature, href: url });
        }
      });
      return () => {
        cancelled = true;
        if (href) URL.revokeObjectURL(href);
      };
      // The signature covers only painting changes; troop motion never rasterizes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signature]);
    useEffect(() => {
      const element = frame.current!;
      let first = true;
      const observer = new ResizeObserver(() => {
        const width = element.clientWidth,
          height = element.clientHeight;
        if (!width || !height) return;
        const initial = first;
        first = false;
        setView((current) =>
          initial
            ? { left: 1536 - width / 2, top: 900 - height / 2, width, height }
            : resizeBattlefieldViewport(BOUNDS, current, width / height),
        );
      });
      observer.observe(element);
      return () => observer.disconnect();
    }, []);
    useEffect(() => {
      if (frame.current) onZoom?.(frame.current.clientWidth / view.width);
    }, [view.width, onZoom]);
    const focus = (position?: SiegePosition) => {
      const [x, y] = position
        ? project(
            FRAME,
            position.x + 0.5,
            position.y + 0.5,
            cellHeight(state, position.x, position.y, position.level),
          )
        : [1536, 840];
      setView((current) => recenterBattlefieldViewport(current, BOUNDS, { x, y }));
    };
    useImperativeHandle(ref, () => ({
      zoom(scale) {
        const width = frame.current?.clientWidth ?? view.width;
        const focus = { x: view.left + view.width / 2, y: view.top + view.height / 2 };
        setView(zoomBattlefieldViewport(view, BOUNDS, focus, scale / (width / view.width)));
      },
      focus,
      full() {
        setView(fitBattlefieldViewport(BOUNDS, view.width / view.height, 0));
      },
    }));
    const pointAt = (clientX: number, clientY: number) => {
      const rect = svg.current!.getBoundingClientRect(),
        current = viewRef.current;
      return {
        x: current.left + ((clientX - rect.left) / rect.width) * current.width,
        y: current.top + ((clientY - rect.top) / rect.height) * current.height,
      };
    };
    const pickAt = (clientX: number, clientY: number): SiegePosition | null => {
      const p = pointAt(clientX, clientY);
      const cell = pickCell(FRAME, p.x, p.y, [0, 1, 2, 3], (x, y, h) => {
        if (!isMapCell(x, y)) return false;
        const wall = ['wall', 'gate'].includes(cellTerrain(state, x, y));
        return wall
          ? h === cellHeight(state, x, y, 'wall')
          : h === cellHeight(state, x, y, 'ground');
      });
      return cell
        ? {
            x: cell.x,
            y: cell.y,
            level: ['wall', 'gate'].includes(cellTerrain(state, cell.x, cell.y))
              ? 'wall'
              : 'ground',
          }
        : null;
    };
    useEffect(() => {
      const element = frame.current!;
      const wheel = (event: WheelEvent) => {
        event.preventDefault();
        const p = pointAt(event.clientX, event.clientY);
        setView((current) =>
          zoomBattlefieldViewport(current, BOUNDS, p, event.deltaY < 0 ? 1.2 : 1 / 1.2),
        );
      };
      element.addEventListener('wheel', wheel, { passive: false });
      return () => element.removeEventListener('wheel', wheel);
    }, []);

    const engines = useMemo(
      () => state.engines.map((e) => engineSprite(e, facings[e.id])),
      [state.engines, facings],
    );
    const layers = useMemo(() => {
      const list: Layer[] = MAP.objects.flatMap((object) =>
        sliceObject(FRAME, object).map((slice) => ({
          slice,
          mask: { href: MAP_FILES[`${MAP_DIR}/${object.mask}`]!, rect: [0, 0, W, H] as ScreenRect },
        })),
      );
      for (const patch of patches)
        if (patch.occluder) {
          const variant = INNER_WALL_JOB.states.find((s) => s.id === patch.state)!;
          const href = INNER_WALL_MASKS[`${ART}/s3-07-inner-wall/${variant.mask}`]!;
          for (const slice of sliceObject(FRAME, patch.occluder))
            list.push({
              slice,
              mask: {
                href,
                rect: [
                  INNER_WALL_JOB.crop[0],
                  INNER_WALL_JOB.crop[1],
                  INNER_WALL_JOB.crop[0] + 1536,
                  INNER_WALL_JOB.crop[1] + 1024,
                ],
              },
            });
        }
      for (const sprite of [...CAMP, ...engines])
        for (const slice of sliceObject(FRAME, spriteObject(sprite))) list.push({ slice, sprite });
      return list;
    }, [patches, engines]);
    const units = useMemo(
      () =>
        state.units
          .filter((u) => u.troops > 0 && isMapCell(u.x, u.y))
          .map((unit) => ({
            unit,
            visual: unitVisual(
              state,
              unit,
              facings[unit.id],
              activity?.id === unit.id ? activity.type : undefined,
            ),
          })),
      [state, facings, activity],
    );
    const items = useMemo(
      () =>
        [
          ...layers.map((layer) => ({ kind: 'layer' as const, layer, depth: layer.slice })),
          ...units.map((u) => ({ kind: 'unit' as const, ...u, depth: u.visual.depth })),
        ].sort((a, b) => compareDepth(a.depth, b.depth)),
      [layers, units],
    );
    const occluders = (visual: ReturnType<typeof unitVisual>) =>
      layers.filter(
        (l) =>
          l.slice.kind !== 'parapet' &&
          l.slice.kind !== 'tree' &&
          compareDepth(l.slice, visual.depth) > 0 &&
          rectsOverlap(l.slice.rect, visual.rect),
      );
    const focusedVisual = units.find((u) => u.unit.id === selected)?.visual;
    const fadedLayers = new Set(focusedVisual ? occluders(focusedVisual) : []);
    const layerKey = (l: Layer) => `${prefix}-${l.slice.objectId}-${l.slice.row}`;
    const spriteImage = (sprite: Sprite) => (
      <SpriteImage sprite={sprite} flip={'flip' in sprite && Boolean(sprite.flip)} />
    );
    const maskImage = (layer: Layer) =>
      layer.mask ? (
        <image
          href={layer.mask.href}
          x={layer.mask.rect[0]}
          y={layer.mask.rect[1]}
          width={layer.mask.rect[2] - layer.mask.rect[0]}
          height={layer.mask.rect[3] - layer.mask.rect[1]}
        />
      ) : (
        <g filter={`url(#${prefix}-white)`}>{spriteImage(layer.sprite!)}</g>
      );
    const drawUnit = (
      unit: SiegeUnit,
      visual: ReturnType<typeof unitVisual>,
      silhouette = false,
    ) => {
      const max = unit.troops + unit.wounded;
      return (
        <g
          data-select={unit.id}
          data-unit={unit.id}
          data-x={unit.x}
          data-y={unit.y}
          data-troops={unit.troops}
          transform={`translate(${visual.foot[0]} ${visual.foot[1]})`}
          className="siege-unit-motion"
          style={{
            transition: activity?.id === unit.id ? 'transform 220ms linear' : 'none',
            cursor: 'pointer',
          }}
        >
          <title>{locale === 'zh' ? unit.officer.chinese : unit.officer.name}</title>
          {!silhouette && (
            <ellipse
              rx={19}
              ry={7}
              fill={unit.side === 'shu' ? '#58865b' : '#365778'}
              fillOpacity={0.65}
              stroke={selected === unit.id ? '#e7b84e' : '#ece4d2'}
              strokeWidth={selected === unit.id ? 3 : 1}
            />
          )}
          <image
            href={visual.pose.href}
            x={-visual.pose.anchor[0]}
            y={-visual.pose.anchor[1]}
            width={visual.pose.size[0]}
            height={visual.pose.size[1]}
            transform={visual.flip ? 'scale(-1 1)' : undefined}
            filter={silhouette ? `url(#${prefix}-silhouette)` : undefined}
          />
          {!silhouette && (
            <g pointerEvents="none">
              <rect x={-18} y={9} width={36} height={4} fill="#453d33" />
              <rect
                x={-18}
                y={9}
                width={(36 * unit.troops) / Math.max(1, max)}
                height={4}
                fill={unit.side === 'shu' ? '#8fb27a' : '#829fbf'}
              />
            </g>
          )}
        </g>
      );
    };
    const cellOutline = (
      cell: SiegePosition,
      color: string,
      kind: string,
      fill = 0.16,
    ): ReactNode => {
      const [x, y] = project(FRAME, cell.x, cell.y, cellHeight(state, cell.x, cell.y, cell.level));
      return (
        <rect
          key={`${kind}-${cellKey(cell)}-${cell.level}`}
          data-cell={`${cell.x},${cell.y},${cell.level}`}
          data-overlay={kind}
          pointerEvents={kind === 'hover' || kind === 'climb' ? 'none' : undefined}
          x={x + 1}
          y={y + 1}
          width={FRAME.cw - 2}
          height={FRAME.cd - 2}
          fill={color}
          fillOpacity={fill}
          stroke={color}
          strokeWidth={2}
        />
      );
    };
    const extendedRange = useMemo(() => {
      if (!showRange) return [];
      const archers = state.units.filter(
        (u) => u.side === 'wei' && u.troopType === 'archer' && u.level === 'wall' && activeUnit(u),
      );
      return Array.from({ length: MAP_WIDTH * MAP_HEIGHT }, (_, i) => ({
        x: i % MAP_WIDTH,
        y: Math.floor(i / MAP_WIDTH),
        level: 'ground' as const,
      })).filter(
        (c) =>
          archers.some((a) => distance(a, c) <= 3) &&
          !['wall', 'gate', 'building', 'water'].includes(cellTerrain(state, c.x, c.y)),
      );
    }, [state, showRange]);
    // Keep hundreds of cut-out masks and sprites out of camera/pointer updates.
    const drawing = useMemo(
      () => (
        <>
          <defs>
            <filter id={`${prefix}-white`}>
              <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
            </filter>
            <filter id={`${prefix}-silhouette`}>
              <feColorMatrix
                in="SourceAlpha"
                type="matrix"
                values="0 0 0 0 .13 0 0 0 0 .17 0 0 0 0 .13 0 0 0 1 0"
              />
              <feMorphology operator="dilate" radius="0.6" />
            </filter>
            {layers.map((layer) => {
              const key = layerKey(layer),
                [x0, y0, x1, y1] = layer.slice.rect;
              return (
                <g key={key}>
                  <clipPath id={`${key}-clip`}>
                    <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} />
                  </clipPath>
                  {layer.mask && (
                    <mask
                      id={`${key}-mask`}
                      maskUnits="userSpaceOnUse"
                      x={x0}
                      y={y0}
                      width={x1 - x0}
                      height={y1 - y0}
                    >
                      {maskImage(layer)}
                    </mask>
                  )}
                </g>
              );
            })}
            <mask
              id={`${prefix}-ground`}
              maskUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={W}
              height={H}
            >
              <rect width={W} height={H} fill="white" />
              {layers
                .filter((layer) => layer.mask)
                .map((layer) => (
                  <g
                    key={layerKey(layer)}
                    clipPath={`url(#${layerKey(layer)}-clip)`}
                    mask={`url(#${layerKey(layer)}-mask)`}
                  >
                    <rect width={W} height={H} fill="black" />
                  </g>
                ))}
            </mask>
            {units.map(({ unit, visual }) => (
              <mask
                key={unit.id}
                id={`${prefix}-cover-${unit.id}`}
                maskUnits="userSpaceOnUse"
                x={visual.rect[0]}
                y={visual.rect[1]}
                width={visual.rect[2] - visual.rect[0]}
                height={visual.rect[3] - visual.rect[1]}
              >
                {occluders(visual).map((layer) => (
                  <g key={layerKey(layer)} clipPath={`url(#${layerKey(layer)}-clip)`}>
                    {layer.mask ? (
                      <g mask={`url(#${layerKey(layer)}-mask)`}>
                        <rect width={W} height={H} fill="white" />
                      </g>
                    ) : (
                      maskImage(layer)
                    )}
                  </g>
                ))}
              </mask>
            ))}
          </defs>
          <image href={painting} width={W} height={H} mask={`url(#${prefix}-ground)`} />
          <g pointerEvents="none">
            {extendedRange.map((c) => cellOutline(c, '#ae5a4f', 'range', 0.09))}
          </g>
          {items.map((item) => {
            if (item.kind === 'unit')
              return <g key={item.unit.id}>{drawUnit(item.unit, item.visual)}</g>;
            const layer = item.layer,
              key = layerKey(layer);
            return (
              <g
                key={key}
                clipPath={`url(#${key}-clip)`}
                mask={layer.mask ? `url(#${key}-mask)` : undefined}
                opacity={
                  (xray || fadedLayers.has(layer)) && layer.slice.kind !== 'engine' ? 0.4 : 1
                }
                data-select={layer.sprite?.kind === 'engine' ? layer.sprite.id : undefined}
              >
                {layer.sprite ? (
                  spriteImage(layer.sprite)
                ) : (
                  <image href={painting} width={W} height={H} />
                )}
              </g>
            );
          })}
          {units.map(({ unit, visual }) =>
            occluders(visual).length ? (
              <g key={unit.id} mask={`url(#${prefix}-cover-${unit.id})`} opacity={xray ? 1 : 0.75}>
                {drawUnit(unit, visual, true)}
              </g>
            ) : null,
          )}
          <g pointerEvents="none">
            {engines
              .filter((e) => e.burning)
              .map((e) => (
                <EngineFire key={e.id} sprite={e} />
              ))}
          </g>
          {engines.map((e) => (
            <g key={e.id} pointerEvents="none">
              <rect x={e.rect[0]} y={e.rect[3] + 3} width={50} height={4} fill="#564635" />
              <rect
                x={e.rect[0]}
                y={e.rect[3] + 3}
                width={(50 * e.engine.durability) / e.engine.max}
                height={4}
                fill="#bc9348"
              />
              {selected === e.id && (
                <rect
                  x={e.rect[0]}
                  y={e.rect[1]}
                  width={e.rect[2] - e.rect[0]}
                  height={e.rect[3] - e.rect[1]}
                  stroke="#e7b84e"
                  strokeWidth={3}
                  fill="none"
                />
              )}
            </g>
          ))}
          <g>
            {deploy && DEPLOY_SHU.map((c) => cellOutline(c, '#51835c', 'deploy', 0.12))}
            {climbableCells(state).map((c) => cellOutline(c, '#dfb347', 'climb'))}
            {reachable.map((c) => cellOutline(c, '#609d80', 'reachable'))}
            {targets.map((c) => cellOutline(c, '#b74e3c', 'target', 0.22))}
          </g>
          {effectAction && (
            <BattleEffect key={`${state.log.length}-${effectAction.type}`} action={effectAction} />
          )}
          {state.weather === 'snow' && (
            <g pointerEvents="none" opacity={0.45} fill="#fffdf2">
              {Array.from({ length: 36 }, (_, i) => (
                <circle key={i} cx={(i * 113) % W} cy={(i * 211) % H} r={2}>
                  <animate
                    attributeName="cy"
                    from={((i * 211) % H) - 70}
                    to={((i * 211) % H) + 70}
                    dur={`${3 + (i % 4)}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              ))}
            </g>
          )}
        </>
      ),
      [
        prefix,
        state,
        locale,
        selected,
        xray,
        effectAction,
        reachable,
        targets,
        deploy,
        painting,
        engines,
        layers,
        units,
        items,
        extendedRange,
      ],
    );
    return (
      <div className="siege-map-frame" ref={frame}>
        <svg
          ref={svg}
          data-testid="siege-map"
          data-ready={!patches.length || composed?.signature === signature}
          data-zoom={frame.current ? (frame.current.clientWidth / view.width).toFixed(2) : '1.00'}
          aria-label={siegeText(locale, 'map')}
          role="img"
          viewBox={`${view.left} ${view.top} ${view.width} ${view.height}`}
          width="100%"
          height="100%"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            svg.current?.setPointerCapture(event.pointerId);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              view: viewRef.current,
              moved: false,
            };
          }}
          onPointerMove={(event) => {
            const d = drag.current;
            if (d && event.buttons === 1) {
              const dx = event.clientX - d.x,
                dy = event.clientY - d.y;
              if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
              if (d.moved) {
                const r = svg.current!.getBoundingClientRect();
                setView(
                  panBattlefieldViewport(
                    d.view,
                    { x: (dx / r.width) * d.view.width, y: (dy / r.height) * d.view.height },
                    BOUNDS,
                  ),
                );
              }
              return;
            }
            setHover(pickAt(event.clientX, event.clientY));
          }}
          onPointerUp={(event) => {
            const d = drag.current;
            drag.current = null;
            if (d?.moved) return;
            const marker = document
              .elementFromPoint(event.clientX, event.clientY)
              ?.closest('[data-cell]');
            if (
              marker &&
              ['deploy', 'reachable'].includes(marker.getAttribute('data-overlay') ?? '')
            ) {
              const [x, y, level] = marker.getAttribute('data-cell')!.split(',');
              onCell?.({ x: Number(x), y: Number(y), level: level === 'wall' ? 'wall' : 'ground' });
              return;
            }
            // Pointer capture retargets events: hit-test the scene coordinates as well
            // as DOM tokens, including silhouettes above occluding walls.
            const point = pointAt(event.clientX, event.clientY);
            const hit = [...units]
              .reverse()
              .find(
                (u) =>
                  point.x >= u.visual.rect[0] &&
                  point.x <= u.visual.rect[2] &&
                  point.y >= u.visual.rect[1] &&
                  point.y <= u.visual.rect[3],
              );
            if (hit) {
              onSelect?.(hit.unit.id);
              return;
            }
            const engine = [...engines]
              .reverse()
              .find(
                (e) =>
                  point.x >= e.rect[0] &&
                  point.x <= e.rect[2] &&
                  point.y >= e.rect[1] &&
                  point.y <= e.rect[3],
              );
            if (engine) {
              onSelect?.(engine.id);
              return;
            }
            const cell = pickAt(event.clientX, event.clientY);
            if (cell) onCell?.(cell);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onPointerLeave={() => setHover(null)}
        >
          {drawing}
          {hover && cellOutline(hover, '#e0ad3d', 'hover', 0.1)}
        </svg>
        <svg
          className="siege-minimap"
          viewBox={`0 0 ${W} ${H}`}
          aria-label={siegeText(locale, 'minimap')}
          onClick={(event) => {
            const r = event.currentTarget.getBoundingClientRect();
            setView((current) =>
              recenterBattlefieldViewport(current, BOUNDS, {
                x: ((event.clientX - r.left) / r.width) * W,
                y: ((event.clientY - r.top) / r.height) * H,
              }),
            );
          }}
        >
          <image href={painting} width={W} height={H} />
          {state.units
            .filter((u) => activeUnit(u) && isMapCell(u.x, u.y))
            .map((u) => (
              <circle
                key={u.id}
                cx={(u.x + 0.5) * FRAME.cw}
                cy={(u.y + 0.5) * FRAME.cd}
                r={13}
                fill={u.side === 'shu' ? '#467344' : '#344d7c'}
              />
            ))}
          <rect
            x={view.left}
            y={view.top}
            width={view.width}
            height={view.height}
            stroke="#a64025"
            strokeWidth={12}
            fill="none"
          />
        </svg>
      </div>
    );
  }),
);

function SpriteImage({ sprite, flip = false }: { sprite: Sprite; flip?: boolean }) {
  const [x0, y0, x1, y1] = sprite.rect,
    [c0, c1, c2, c3] = sprite.crop;
  const size = sheet(sprite.sheet).size;
  return (
    <g transform={flip ? `translate(${x0 + x1} 0) scale(-1 1)` : undefined}>
      <svg
        x={x0}
        y={y0}
        width={x1 - x0}
        height={y1 - y0}
        viewBox={`${c0} ${c1} ${c2 - c0} ${c3 - c1}`}
        preserveAspectRatio="none"
        overflow="hidden"
      >
        <image href={sheetImage(sprite.sheet)} width={size[0]} height={size[1]} />
      </svg>
    </g>
  );
}
function EngineFire({ sprite }: { sprite: EngineSprite }) {
  const [x0, y0, x1, y1] = sprite.rect,
    cx = (x0 + x1) / 2;
  return (
    <g>
      <image
        href={effect('smoke-column')}
        x={cx - 20}
        y={y0 - 100}
        width={100}
        height={130}
        opacity={0.6}
      >
        <animate attributeName="opacity" values=".4;.7;.4" dur="3s" repeatCount="indefinite" />
      </image>
      <image href={effect('flame-large')} x={cx - 40} y={y1 - 100} width={80} height={100}>
        <animate attributeName="opacity" values="1;.6;1" dur=".8s" repeatCount="indefinite" />
      </image>
    </g>
  );
}
function BattleEffect({ action }: { action: NonNullable<Props['effectAction']> }) {
  const [x, y] = project(
      FRAME,
      action.from.x + 0.5,
      action.from.y + 0.5,
      action.from.level === 'wall' ? 3 : 0,
    ),
    [tx, ty] = project(
      FRAME,
      action.to.x + 0.5,
      action.to.y + 0.5,
      action.to.level === 'wall' ? 3 : 0,
    );
  const fire = action.type === 'fireArrows';
  return (
    <g pointerEvents="none">
      <line
        x1={x}
        y1={y - 20}
        x2={tx}
        y2={ty - 20}
        stroke={fire ? '#c35c27' : '#66533d'}
        strokeWidth={fire ? 3 : 2}
        strokeDasharray="10 12"
      >
        <animate attributeName="stroke-dashoffset" from="100" to="0" dur=".3s" />
      </line>
      <image
        href={effect(
          fire
            ? 'flame-small'
            : action.type === 'dropBoulders' || action.type === 'dropMillstone'
              ? 'boulders'
              : 'arrows-wall',
        )}
        x={tx - 28}
        y={ty - 50}
        width={56}
        height={56}
      >
        <animate attributeName="opacity" values="0;1;0" dur=".3s" />
      </image>
    </g>
  );
}
