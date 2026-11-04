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
  STANDING_EPSILON,
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
import { boundSprites } from './spriteBudget';
import { SPRITE_CAP, moundSprite, preparationSprites, stormingSprite } from './v02Art';
import type { NightPresentation } from './nightReplay';
import {
  Displacement,
  FootholdPips,
  NightOverlay,
  PreparationFlames,
  SortieParty,
} from './v02Effects';

const BOUNDS = { left: 0, top: 0, right: W, bottom: H, width: W, height: H };
const NO_CELLS: SiegePosition[] = [];
const NO_FACINGS: Record<string, Facing> = {};
const NO_IDS: readonly string[] = [];
export const SILHOUETTE_OPACITY = 0.35;
export const SILHOUETTE_TINTS = { shu: '#58865b', wei: '#365778' };
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
  tutorialCells?: SiegePosition[];
  tutorialFill?: boolean;
  deploy?: boolean;
  xray?: boolean;
  showRange?: boolean;
  facings?: Record<string, Facing>;
  activity?: { id: string; type: string } | null;
  effectAction?: { from: SiegePosition; to: SiegePosition; type: string } | null;
  initialFocus?: SiegePosition;
  initialZoom?: number;
  night?: NightPresentation | null;
  forecastCell?: SiegePosition | null;
  repulsedUnits?: readonly string[];
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
      reachable = NO_CELLS,
      targets = NO_CELLS,
      tutorialCells = NO_CELLS,
      tutorialFill = false,
      deploy = false,
      xray = false,
      showRange = true,
      facings = NO_FACINGS,
      activity,
      effectAction,
      night,
      initialFocus,
      initialZoom = 1,
      forecastCell,
      repulsedUnits = NO_IDS,
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
            ? (() => {
                const centre = initialFocus
                  ? project(FRAME, initialFocus.x + 0.5, initialFocus.y + 0.5, 0)
                  : [1536, 900];
                return {
                  left: centre[0]! - width / initialZoom / 2,
                  top: centre[1]! - height / initialZoom / 2,
                  width: width / initialZoom,
                  height: height / initialZoom,
                };
              })()
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
    const preparations = useMemo(() => preparationSprites(state), [state.preparations, state.day]);
    const decorations = useMemo(
      () => [
        ...Object.entries(state.mounds).flatMap(([key, progress]) => {
          const sprite = moundSprite(key, progress);
          return sprite ? [sprite] : [];
        }),
        ...state.units.flatMap((unit) => {
          const sprite = stormingSprite(
            state,
            unit,
            Boolean(night) || repulsedUnits.includes(unit.id),
          );
          return sprite ? [sprite] : [];
        }),
        ...preparations,
      ],
      [state, preparations, Boolean(night), repulsedUnits],
    );
    // All scenery and gameplay images are mandatory. Only silhouettes use
    // the remaining allowance; row slices each count as a visible image.
    const staticLayers = useMemo(
      () =>
        MAP.objects.flatMap((object) =>
          sliceObject(FRAME, object).map((slice) => ({
            slice,
            mask: {
              href: MAP_FILES[`${MAP_DIR}/${object.mask}`]!,
              rect: [0, 0, W, H] as ScreenRect,
            },
          })),
        ),
      [],
    );
    const budget = useMemo(
      () =>
        boundSprites(
          [...engines, ...decorations, ...CAMP],
          staticLayers.length +
            patches.reduce(
              (n, patch) => n + (patch.occluder ? sliceObject(FRAME, patch.occluder).length : 0),
              0,
            ) +
            2 +
            units.reduce((n, u) => n + u.visual.figures.length, 0) +
            engines.filter((e) => e.burning).length * 2 +
            (night?.party ? (night.party.kindle ? 4 : 3) : 0) +
            engines.reduce((n, sprite) => {
              const previous = night?.previousEngine;
              if (previous?.id !== sprite.id) return n;
              // Replay replaces all row slices with one whole sprite, plus
              // the lowered ladder during the raising crossfade.
              return n + 1 + Number(!previous.raisedAt && Boolean(sprite.engine.raisedAt)) -
                sliceObject(FRAME, spriteObject(sprite)).length;
            }, 0) +
            (effectAction ? 1 : 0),
        ),
      [engines, decorations, staticLayers, patches, units, night, effectAction],
    );
    const layers = useMemo(() => {
      const list: Layer[] = [...staticLayers];
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
      for (const sprite of budget.sprites) {
        const ladder = sprite.kind.startsWith('storm')
          ? engines.find(
              (e) =>
                e.engine.raisedAt?.x === sprite.cells[0] &&
                e.engine.raisedAt.y === sprite.cells[1] - 1,
            )
          : undefined;
        for (const slice of sliceObject(FRAME, spriteObject(sprite)))
          list.push({
            slice: ladder
              ? {
                  ...slice,
                  // The whole mass, including repulse, stands in front of every
                  // row of its raised ladder. Its painted registration stays fixed.
                  row: Math.max(slice.row, ladder.cells[3]),
                  height: Math.max(slice.height, ladder.height) + STANDING_EPSILON,
                }
              : slice,
            sprite,
          });
      }
      return list;
    }, [patches, budget, staticLayers, engines]);
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
    const silhouetteUnits = new Set<string>();
    let silhouetteCount = 0;
    for (const entry of [...units].sort(
      (a, b) => Number(b.unit.id === selected) - Number(a.unit.id === selected),
    )) {
      if (
        !occluders(entry.visual).length ||
        silhouetteCount + entry.visual.figures.length > budget.remaining
      )
        continue;
      silhouetteUnits.add(entry.unit.id);
      silhouetteCount += entry.visual.figures.length;
    }
    const spriteCount = budget.used + silhouetteCount;
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
          id={silhouette ? undefined : `${prefix}-${unit.id}-motion`}
          data-select={unit.id}
          data-unit={unit.id}
          data-gate-top={visual.gateTop}
          data-x={unit.x}
          data-y={unit.y}
          data-troops={unit.troops}
          transform={`translate(${visual.foot[0]} ${visual.foot[1]})`}
          className="siege-unit-motion"
          style={{
            transition: activity?.id === unit.id ? 'transform 130ms linear' : 'none',
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
          {visual.figures.map((figure, index) => (
            <image
              key={index}
              data-sprite={silhouette ? 'silhouette' : 'figure'}
              data-pose={figure.name}
              href={figure.pose.href}
              x={figure.offset[0] - figure.pose.anchor[0]}
              y={figure.offset[1] - figure.pose.anchor[1]}
              width={figure.pose.size[0]}
              height={figure.pose.size[1]}
              transform={visual.flip ? 'scale(-1 1)' : undefined}
              filter={silhouette ? `url(#${prefix}-silhouette-${unit.side})` : undefined}
            />
          ))}
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
      strokeWidth = 2,
    ): ReactNode => {
      const [x, y] = project(FRAME, cell.x, cell.y, cellHeight(state, cell.x, cell.y, cell.level));
      return (
        <rect
          key={`${kind}-${cellKey(cell)}-${cell.level}`}
          data-cell={`${cell.x},${cell.y},${cell.level}`}
          data-overlay={kind}
          className={
            kind === 'tutorial' || (kind === 'reachable' && tutorialFill)
              ? 'siege-walk-cell'
              : undefined
          }
          pointerEvents={['hover', 'climb', 'tutorial'].includes(kind) ? 'none' : undefined}
          x={x + 1}
          y={y + 1}
          width={FRAME.cw - 2}
          height={FRAME.cd - 2}
          fill={color}
          fillOpacity={fill}
          stroke={color}
          strokeWidth={strokeWidth}
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
            {Object.entries(SILHOUETTE_TINTS).map(([side, tint]) => (
              <filter key={side} id={`${prefix}-silhouette-${side}`}>
                <feFlood floodColor={tint} />
                <feComposite in2="SourceAlpha" operator="in" />
                <feMorphology operator="dilate" radius="0.6" />
              </filter>
            ))}
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
            if (
              night?.previousEngine &&
              layer.sprite &&
              night.previousEngine.id === layer.sprite.id
            ) {
              const sprite = layer.sprite as EngineSprite;
              if (layer.slice.row !== sprite.cells[3]) return null;
              const previous = night.previousEngine;
              const raising = !previous.raisedAt && Boolean(sprite.engine.raisedAt);
              const duration = `${night.duration}ms`;
              return (
                <g
                  key={`${key}-${previous.x},${previous.y}-${Boolean(previous.raisedAt)}-${Boolean(sprite.engine.raisedAt)}`}
                  data-piece={sprite.id}
                >
                  <animateTransform
                    attributeName="transform"
                    type="translate"
                    from={`${(previous.x - sprite.engine.x) * FRAME.cw} ${(previous.y - sprite.engine.y) * FRAME.cd}`}
                    to="0 0"
                    dur={duration}
                    fill="freeze"
                  />
                  {raising && (
                    <g opacity={0} data-testid="ladder-lowered">
                      {spriteImage(engineSprite(previous, facings[sprite.id]))}
                      <animate
                        attributeName="opacity"
                        from="1"
                        to="0"
                        dur={duration}
                        fill="freeze"
                      />
                    </g>
                  )}
                  <g
                    opacity={raising ? 0 : 1}
                    data-testid={raising ? 'ladder-raised' : 'engine-slide'}
                  >
                    {spriteImage(sprite)}
                    {raising && (
                      <animate
                        attributeName="opacity"
                        from="0"
                        to="1"
                        dur={duration}
                        fill="freeze"
                      />
                    )}
                  </g>
                </g>
              );
            }
            return (
              <g
                key={key}
                clipPath={`url(#${key}-clip)`}
                mask={layer.mask ? `url(#${key}-mask)` : undefined}
                opacity={
                  (xray || fadedLayers.has(layer)) && layer.slice.kind !== 'engine' ? 0.4 : 1
                }
                data-piece={layer.sprite?.id}
                data-object={layer.slice.objectId}
                data-sheet={layer.sprite?.sheet}
                data-select={layer.sprite?.kind === 'engine' ? layer.sprite.id : undefined}
              >
                {layer.sprite ? (
                  <g>
                    {layer.sprite.kind === 'storm-repulsed' && night && (
                      <animate attributeName="opacity" from="1" to="0" dur=".13s" fill="freeze" />
                    )}
                    {spriteImage(layer.sprite)}
                  </g>
                ) : (
                  <image href={painting} width={W} height={H} />
                )}
              </g>
            );
          })}
          {units.map(({ unit, visual }) =>
            silhouetteUnits.has(unit.id) ? (
              <g
                key={unit.id}
                data-silhouette={unit.side}
                mask={`url(#${prefix}-cover-${unit.id})`}
                opacity={SILHOUETTE_OPACITY}
              >
                {drawUnit(unit, visual, true)}
              </g>
            ) : null,
          )}
          <FootholdPips state={state} forecast={forecastCell} />
          {!night && <PreparationFlames sprites={preparations} />}
          {units.map(({ unit, visual }) => (
            <Displacement
              key={unit.id}
              state={state}
              unit={unit}
              foot={visual.foot}
              motionId={`${prefix}-${unit.id}-motion`}
            />
          ))}
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
            {climbableCells(state)
              .filter((c) => targets.some((t) => t.x === c.x && t.y === c.y && t.level === c.level))
              .map((c) => cellOutline(c, '#dfb347', 'climb', 0.04, 1))}
            {tutorialCells.map((c) => cellOutline(c, '#bc841d', 'tutorial', 0.08))}
            {reachable.map((c) => cellOutline(c, '#609d80', 'reachable'))}
            {targets
              .filter(
                (c) =>
                  !climbableCells(state).some(
                    (t) => t.x === c.x && t.y === c.y && t.level === c.level,
                  ),
              )
              .map((c) => cellOutline(c, '#b74e3c', 'target', 0.22))}
          </g>
          {effectAction && (
            <BattleEffect key={`${state.log.length}-${effectAction.type}`} action={effectAction} />
          )}
          {night && <NightOverlay prefix={prefix} preparations={preparations} night={night} />}
          {night && <SortieParty night={night} />}
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
        JSON.stringify(reachable),
        JSON.stringify(targets),
        JSON.stringify(tutorialCells),
        tutorialFill,
        deploy,
        painting,
        engines,
        layers,
        units,
        items,
        extendedRange,
        preparations,
        budget,
        night,
        forecastCell,
      ],
    );
    return (
      <div className="siege-map-frame" ref={frame}>
        <svg
          ref={svg}
          data-testid="siege-map"
          data-sprite-cap={SPRITE_CAP}
          data-sprite-count={spriteCount}
          data-mandatory-sprite-count={budget.used}
          data-sprites-omitted={budget.omitted}
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
              .sort((a, b) => compareDepth(b.visual.depth, a.visual.depth))
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
          {hover && targets.some((t) => t.x === hover.x && t.y === hover.y) && !forecastCell && (
            <FootholdPips state={state} forecast={hover} />
          )}
          {hover &&
            [...targets, ...reachable, ...(deploy ? DEPLOY_SHU : [])].some(
              (c) => c.x === hover.x && c.y === hover.y && c.level === hover.level,
            ) &&
            cellOutline(hover, '#e0ad3d', 'hover', 0.04, 1)}
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
