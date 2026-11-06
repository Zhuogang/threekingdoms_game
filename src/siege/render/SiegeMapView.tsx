import {
  anchor as boardAnchor,
  centre,
  contains,
  hitRect,
  planeRect,
  layoutNameplates,
  standingPositions,
} from './boardGeometry';
import { swapTargets } from '../rules/movement';
import { officerPortraitPath } from '../../v03/rendering/officer-portraits';
import {
  forwardRef,
  memo,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
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
import { DEPLOY_SHU, DEPLOY_WEI, cellKey } from '../content/chencang';
import { isMapCell } from '../rules/map';
import { activeUnit } from '../rules/combat';
import type { SiegePosition, SiegeState, SiegeUnit } from '../rules/types';
import type { Facing } from '../save';
import { siegeText, type SiegeLocale } from '../i18n';
import { fireRangeCells } from '../ui/fireRange';
import {
  resolveMapClick,
  mapClickColor,
  type MapClickContext,
  type MapClickResult,
} from '../ui/mapClick';
import { noticeCorner } from '../ui/cardQueue';
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
import { pickMapPosition } from './picking';
import { spriteObject, type Sprite } from './mapPieces';
import {
  compareDepth,
  rectsOverlap,
  sliceObject,
  STANDING_EPSILON,
  type SceneSlice,
  type ScreenRect,
} from './scene';
import {
  climbableCells,
  engineSprite,
  engineFootprint,
  sharesEngineCell,
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
export const SILHOUETTE_OPACITY = 0.7;
const portraitFiles = import.meta.glob(
  '/docs/siege/chencang/art/s5-0{7,8}-*/runtime/*-small.webp',
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const portraitOf = (unit: SiegeUnit) =>
  Object.entries(portraitFiles).find(([path]) =>
    path.endsWith(`/${unit.officer.id}-small.webp`),
  )?.[1] ?? (unit.officer.portraitId ? officerPortraitPath(unit.officer.portraitId) : undefined);
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
  clickMode?: MapClickContext['mode'];
  clickBlocked?: boolean;
  onTarget?: (id: string) => void;
  onSwap?: (id: string) => void;
  reachable?: SiegePosition[];
  targets?: SiegePosition[];
  tutorialCells?: SiegePosition[];
  climbBase?: { base: SiegePosition; label: string };
  tutorialFill?: boolean;
  deploy?: boolean;
  playerSide?: 'shu' | 'wei';
  xray?: boolean;
  boardReview?: boolean;
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
  onMove?: (cell: SiegePosition) => void;
  onZoom?: (scale: number) => void;
  notice?: ReactNode;
}
export const SiegeMapView = memo(
  forwardRef<SiegeMapHandle, Props>(function SiegeMapView(
    {
      state,
      locale,
      selected,
      clickMode,
      clickBlocked,
      onTarget,
      onSwap,
      reachable = NO_CELLS,
      targets = NO_CELLS,
      tutorialCells = NO_CELLS,
      climbBase,
      tutorialFill = false,
      deploy = false,
      playerSide = 'shu',
      xray = false,
      boardReview = false,
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
      onMove,
      onZoom,
      notice,
    },
    ref,
  ) {
    useEffect(() => {
      if (!import.meta.env.DEV) return;
      const geometry = {
        hitRect: (p: SiegePosition) => hitRect(p, state),
        anchor: (p: SiegePosition) => boardAnchor(p, state),
        positionAt: (x: number, y: number) => pickMapPosition(state, x, y),
      };
      window.__siegeGeometry = geometry;
      return () => {
        if (window.__siegeGeometry === geometry) delete window.__siegeGeometry;
      };
    }, [state]);
    const deployCells = playerSide === 'shu' ? DEPLOY_SHU : DEPLOY_WEI;
    const prefix = useId().replace(/:/g, '');
    const frame = useRef<HTMLDivElement>(null);
    const svg = useRef<SVGSVGElement>(null);
    const drag = useRef<{ x: number; y: number; view: BattlefieldViewBox; moved: boolean } | null>(
      null,
    );
    const [view, setViewState] = useState<BattlefieldViewBox>({
      left: 1036,
      top: 490,
      width: 1000,
      height: 700,
    });
    const viewRef = useRef(view);
    const panFrame = useRef<number | null>(null);
    const writeViewBox = () => {
      const current = viewRef.current;
      svg.current?.setAttribute(
        'viewBox',
        `${current.left} ${current.top} ${current.width} ${current.height}`,
      );
    };
    const setView = (
      update: BattlefieldViewBox | ((current: BattlefieldViewBox) => BattlefieldViewBox),
    ) => {
      if (panFrame.current !== null) cancelAnimationFrame(panFrame.current);
      panFrame.current = null;
      viewRef.current = typeof update === 'function' ? update(viewRef.current) : update;
      writeViewBox();
      setViewState(viewRef.current);
    };
    useEffect(
      () => () => {
        if (panFrame.current !== null) cancelAnimationFrame(panFrame.current);
      },
      [],
    );
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
                const centre = initialFocus ? boardAnchor(initialFocus) : [1536, 900];
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
      const occupant =
        position &&
        state.units.find(
          (u) =>
            u.troops > 0 && u.x === position.x && u.y === position.y && u.level === position.level,
        );
      const [x, y] = occupant
        ? unitVisual(
            state,
            occupant,
            facings[occupant.id],
            activity?.id === occupant.id ? activity.type : undefined,
          ).foot
        : position
          ? boardAnchor(position, state)
          : [1536, 840];
      setView((current) => recenterBattlefieldViewport(current, BOUNDS, { x, y }));
    };
    useImperativeHandle(ref, () => ({
      zoom(scale) {
        const current = viewRef.current;
        const width = frame.current?.clientWidth ?? current.width;
        const focus = { x: current.left + current.width / 2, y: current.top + current.height / 2 };
        setView(zoomBattlefieldViewport(current, BOUNDS, focus, scale / (width / current.width)));
      },
      focus,
      full() {
        setView(fitBattlefieldViewport(BOUNDS, viewRef.current.width / viewRef.current.height, 0));
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
      return pickMapPosition(state, p.x, p.y);
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

    const scene = useScene({
      boardReview,
      state,
      locale,
      xray,
      showRange,
      facings,
      activity,
      effectAction,
      night,
      repulsedUnits,
      prefix,
      patches,
      signature,
      painting,
    });
    const clickContext: MapClickContext = {
      state,
      selected,
      playerSide,
      mode: clickMode,
      reachable,
      blocked: clickBlocked ?? Boolean(night),
      deploy,
    };
    const dispatchClick = (result: MapClickResult) => {
      if (result.type === 'select') onSelect?.(result.id);
      else if (result.type === 'swap') onSwap?.(result.id);
      else if (result.type === 'target') (onTarget ?? onSelect)?.(result.id);
      else if (result.type === 'move') (onMove ?? onCell)?.(result.cell);
      else if ('cell' in result) onCell?.(result.cell);
    };
    const { units, engines, decorations } = scene;
    const hitAt = (clientX: number, clientY: number) => {
      const point = pointAt(clientX, clientY);
      const plateUnitId = [...units]
        .reverse()
        .find(({ unit }) => contains(scene.plates.get(unit.id)!, point.x, point.y))?.unit.id;
      return { cell: pickAt(clientX, clientY), plateUnitId };
    };
    const overlay = useRef<OverlayHandle>(null);
    const spriteCount = scene.budget.used;
    const silhouetteFigures = units.reduce(
      (n, { visual }) => n + (scene.occluders(visual).length ? visual.figures.length : 0),
      0,
    );
    return (
      <div className="siege-map-frame" ref={frame}>
        <svg
          ref={svg}
          data-testid="siege-map"
          data-selected={selected ?? ''}
          data-sprite-cap={SPRITE_CAP}
          data-sprite-count={spriteCount}
          data-silhouette-figure-count={silhouetteFigures}
          data-draw-instance-count={spriteCount + silhouetteFigures}
          data-mandatory-sprite-count={scene.budget.used}
          data-sprites-omitted={scene.budget.omitted}
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
                viewRef.current = panBattlefieldViewport(
                  d.view,
                  { x: (dx / r.width) * d.view.width, y: (dy / r.height) * d.view.height },
                  BOUNDS,
                );
                if (panFrame.current === null)
                  panFrame.current = requestAnimationFrame(() => {
                    panFrame.current = null;
                    writeViewBox();
                  });
              }
              return;
            }
            overlay.current?.hover(hitAt(event.clientX, event.clientY));
          }}
          onPointerUp={(event) => {
            const d = drag.current;
            drag.current = null;
            if (d?.moved) {
              setView(viewRef.current);
              return;
            }
            const hit = hitAt(event.clientX, event.clientY);
            dispatchClick(
              resolveMapClick({ ...clickContext, plateUnitId: hit.plateUnitId }, hit.cell),
            );
          }}
          onPointerCancel={() => {
            if (drag.current?.moved) setView(viewRef.current);
            drag.current = null;
          }}
          onPointerLeave={() => overlay.current?.hover(null)}
        >
          <UnitLayer drawing={scene.drawing} />
          <MapOverlays
            ref={overlay}
            scene={scene}
            clickContext={clickContext}
            state={state}
            selected={selected}
            reachable={reachable}
            targets={targets}
            tutorialCells={tutorialCells}
            tutorialFill={tutorialFill}
            deploy={deploy}
            deployCells={deployCells}
            climbBase={climbBase}
            night={night}
            forecastCell={forecastCell}
            scale={view.width / (frame.current?.clientWidth || view.width)}
            xray={xray}
          />
          {scene.effects}
          <Nameplates units={units} rects={scene.plates} locale={locale} selected={selected} />
          {boardReview && <BoardReview state={state} />}
          {/* Invisible geometry for specs only; input uses the pure resolver. */}
          <g data-testid="unit-hit-targets">
            {[...units]
              .sort((a, b) => compareDepth(a.visual.depth, b.visual.depth))
              .map(({ unit }) => {
                const rect = hitRect(unit, state)!;
                return (
                  <rect
                    key={unit.id}
                    data-testid={`map-unit-${unit.id}`}
                    data-x={unit.x}
                    data-y={unit.y}
                    x={rect[0]}
                    y={rect[1]}
                    width={rect[2] - rect[0]}
                    height={rect[3] - rect[1]}
                    fill="transparent"
                    pointerEvents="none"
                  >
                    <title>{locale === 'zh' ? unit.officer.chinese : unit.officer.name}</title>
                  </rect>
                );
              })}
          </g>
        </svg>
        {notice && (
          <MapNotice
            selection={
              decorations.find((sprite) => sprite.id === `storm-${selected}`)?.rect ??
              units.find((u) => u.unit.id === selected)?.visual.rect ??
              engines.find((e) => e.id === selected)?.rect ??
              null
            }
            view={view}
          >
            {notice}
          </MapNotice>
        )}
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
                cx={boardAnchor(u)[0]}
                cy={boardAnchor(u)[1]}
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

type SceneProps = Pick<
  Props,
  | 'state'
  | 'locale'
  | 'xray'
  | 'showRange'
  | 'facings'
  | 'activity'
  | 'effectAction'
  | 'night'
  | 'repulsedUnits'
  | 'boardReview'
> & {
  prefix: string;
  patches: ReturnType<typeof statePatches>;
  signature: string;
  painting: string;
};
function useScene({
  boardReview = false,
  state,
  locale,
  xray,
  showRange,
  facings = NO_FACINGS,
  activity,
  effectAction,
  night,
  repulsedUnits = NO_IDS,
  prefix,
  patches,
  signature,
  painting,
}: SceneProps) {
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
  const plates = useMemo(
    () =>
      layoutNameplates(
        units.map(({ unit, visual }) => ({
          id: unit.id,
          position: unit,
          foot: visual.foot,
          rect: visual.rect,
        })),
        !boardReview,
      ),
    [units, boardReview],
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
  // Living figures always draw in depth. The overlay reuses their stable nodes.
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
          units.filter(({ unit }) => portraitOf(unit)).length +
          units.reduce((n, u) => n + u.visual.figures.length, 0) +
          engines.filter((e) => e.burning).length * 2 +
          (night?.party ? (night.party.kindle ? 4 : 3) : 0) +
          engines.reduce((n, sprite) => {
            const previous = night?.previousEngine;
            if (previous?.id !== sprite.id) return n;
            // Replay replaces all row slices with one whole sprite, plus
            // the lowered ladder during the raising crossfade.
            return (
              n +
              1 +
              Number(!previous.raisedAt && Boolean(sprite.engine.raisedAt)) -
              sliceObject(FRAME, spriteObject(sprite)).length
            );
          }, 0) +
          (effectAction ? 1 : 0),
      ),
    [engines, decorations, staticLayers, patches, units, night, effectAction],
  );
  const scenery = useMemo(() => {
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
    for (const sprite of CAMP)
      for (const slice of sliceObject(FRAME, spriteObject(sprite))) list.push({ slice, sprite });
    return list;
  }, [signature, staticLayers]);
  const layers = useMemo(() => {
    const list: Layer[] = scenery.filter((layer) => !layer.sprite);
    for (const sprite of budget.sprites) {
      // Keep stable camp slices at their original position in the depth ties.
      if (CAMP.includes(sprite)) {
        list.push(...scenery.filter((layer) => layer.sprite === sprite));
        continue;
      }
      // Hoisted rigs draw whole with their explicit depth, outside unit masks.
      if (sprite.kind === 'hoisted-millstone') continue;
      const ladder = sprite.kind.startsWith('storm')
        ? engines.find(
            (e) =>
              `storm-${state.units.find((u) => u.x === e.engine.x && u.y === e.engine.y)?.id}` ===
              sprite.id,
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
  }, [scenery, budget, engines]);
  const items = useMemo(
    () =>
      [
        ...layers.map((layer) => {
          const engine = engines.find((e) => e.id === layer.sprite?.id);
          const front =
            engine &&
            units
              .filter(({ unit }) => sharesEngineCell(engine.engine, unit))
              .map((u) => u.visual.depth)
              .sort(compareDepth)[0];
          return {
            kind: 'layer' as const,
            layer,
            depth:
              front && compareDepth(layer.slice, front) >= 0
                ? { row: front.row, height: front.height - STANDING_EPSILON / 2 }
                : layer.slice,
          };
        }),
        ...units.map((u) => ({ kind: 'unit' as const, ...u, depth: u.visual.depth })),
        ...preparations
          .filter((sprite) => sprite.depth)
          .map((sprite) => ({ kind: 'millstone' as const, sprite, depth: sprite.depth! })),
      ].sort((a, b) => compareDepth(a.depth, b.depth)),
    [layers, units, preparations, engines],
  );
  const coverage = useMemo(
    () =>
      new Map(
        units.map(({ visual }) => [
          visual,
          layers.filter(
            (l) =>
              !(
                l.sprite?.kind === 'engine' &&
                sharesEngineCell((l.sprite as EngineSprite).engine, visual.cell)
              ) &&
              compareDepth(l.slice, visual.depth) > 0 &&
              rectsOverlap(l.slice.rect, visual.rect),
          ),
        ]),
      ),
    [units, layers],
  );
  const occluders = (visual: ReturnType<typeof unitVisual>) => coverage.get(visual) ?? [];
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
  const drawUnit = (unit: SiegeUnit, visual: ReturnType<typeof unitVisual>) => {
    return (
      <g
        id={`${prefix}-${unit.id}-motion`}
        data-unit={unit.id}
        data-gate-top={visual.gateTop}
        data-x={unit.x}
        data-y={unit.y}
        data-troops={unit.troops}
        transform={`translate(${visual.foot[0]} ${visual.foot[1]})`}
        className="siege-unit-motion"
        style={{
          transition: activity?.id === unit.id ? 'transform 130ms linear' : 'none',
        }}
      >
        <title>{locale === 'zh' ? unit.officer.chinese : unit.officer.name}</title>
        <ellipse
          rx={19}
          ry={7}
          fill={unit.side === 'shu' ? '#58865b' : '#365778'}
          fillOpacity={0.65}
          stroke="#ece4d2"
          strokeWidth={1}
        />
        <g id={`${prefix}-${unit.id}-figures`}>
          {visual.figures.map((figure, index) => (
            <image
              key={index}
              data-sprite="figure"
              data-pose={figure.name}
              href={figure.pose.href}
              x={figure.offset[0] - figure.pose.anchor[0]}
              y={figure.offset[1] - figure.pose.anchor[1]}
              width={figure.pose.size[0]}
              height={figure.pose.size[1]}
              transform={visual.flip ? 'scale(-1 1)' : undefined}
            />
          ))}
        </g>
      </g>
    );
  };
  const cellOutline = (
    cell: SiegePosition,
    color: string,
    kind: string,
    fill = 0.16,
    strokeWidth = 2,
    walk = false,
  ): ReactNode => {
    const r = kind === 'hover' ? hitRect(cell, state) : planeRect(cell);
    if (!r) return null;
    const [x, y, right, bottom] = r;
    return (
      <rect
        key={`${kind}-${cellKey(cell)}-${cell.level}`}
        data-cell={`${cell.x},${cell.y},${cell.level}`}
        data-overlay={kind}
        className={kind === 'tutorial' || walk ? 'siege-walk-cell' : undefined}
        pointerEvents={['hover', 'climb', 'tutorial'].includes(kind) ? 'none' : undefined}
        x={x + 1}
        y={y + 1}
        width={right - x - 2}
        height={bottom - y - 2}
        fill={color}
        fillOpacity={fill}
        stroke={color}
        strokeWidth={strokeWidth}
      />
    );
  };
  const extendedRange = useMemo(() => (showRange ? fireRangeCells(state) : []), [state, showRange]);
  // Keep hundreds of cut-out masks and sprites out of camera/pointer updates.
  const drawing = useMemo(
    () => (
      <>
        <defs>
          <filter
            id={`${prefix}-silhouette`}
            colorInterpolationFilters="sRGB"
            x="0"
            y="0"
            width="100%"
            height="100%"
          >
            <feFlood floodColor="#ffd23c" />
            <feComposite in2="SourceAlpha" operator="in" />
          </filter>
          <filter id={`${prefix}-white`}>
            <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0" />
          </filter>
          {layers
            .filter((layer) => !scenery.includes(layer))
            .map((layer) => {
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
          <StaticGround prefix={prefix} scenery={scenery} />
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
        <StaticPainting painting={painting} prefix={prefix} />
        <g pointerEvents="none">
          {extendedRange.map((c) => cellOutline(c, '#ae5a4f', 'range', 0.09))}
        </g>
        {items.map((item) => {
          if (item.kind === 'millstone') {
            const { sprite } = item;
            return (
              <g key={sprite.id} data-piece={sprite.id} pointerEvents="none">
                {sprite.rope && (
                  <line
                    data-millstone-rope={sprite.id}
                    x1={sprite.rope[0]}
                    y1={sprite.rope[1]}
                    x2={sprite.rope[2]}
                    y2={sprite.rope[3]}
                    stroke="#4a3a2e"
                    strokeWidth={1.5}
                  />
                )}
                {spriteImage(sprite)}
              </g>
            );
          }
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
            if (layer !== layers.filter((l) => l.sprite?.id === sprite.id).at(-1)) return null;
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
                  from={`${boardAnchor({ ...previous, level: 'ground' })[0] - boardAnchor({ ...sprite.engine, level: 'ground' })[0]} ${boardAnchor({ ...previous, level: 'ground' })[1] - boardAnchor({ ...sprite.engine, level: 'ground' })[1]}`}
                  to="0 0"
                  dur={duration}
                  fill="freeze"
                />
                {raising && (
                  <g opacity={0} data-testid="ladder-lowered">
                    {spriteImage(engineSprite(previous, facings[sprite.id]))}
                    <animate attributeName="opacity" from="1" to="0" dur={duration} fill="freeze" />
                  </g>
                )}
                <g
                  opacity={raising ? 0 : 1}
                  data-testid={raising ? 'ladder-raised' : 'engine-slide'}
                >
                  {spriteImage(sprite)}
                  {raising && (
                    <animate attributeName="opacity" from="0" to="1" dur={duration} fill="freeze" />
                  )}
                </g>
              </g>
            );
          }
          if (scenery.includes(layer))
            return (
              <StaticArt key={key} layer={layer} prefix={prefix} painting={painting} xray={xray} />
            );
          return (
            <g
              key={key}
              clipPath={`url(#${key}-clip)`}
              mask={layer.mask ? `url(#${key}-mask)` : undefined}
              opacity={xray && layer.slice.kind !== 'engine' ? 0.4 : 1}
              data-piece={layer.sprite?.id}
              data-object={layer.slice.objectId}
              data-selection-layer={key}
              data-fadeable={true}
              data-sheet={layer.sprite?.sheet}
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
          </g>
        ))}
      </>
    ),
    [
      prefix,
      state,
      locale,
      xray,
      effectAction,
      painting,
      engines,
      layers,
      units,
      items,
      extendedRange,
      preparations,
      budget,
      night,
    ],
  );
  const scene = useMemo(
    () => ({
      units,
      plates,
      engines,
      decorations,
      layers,
      budget,
      drawing,
      occluders,
      drawUnit,
      cellOutline,
      preparations,
      prefix,
      effects: (
        <>
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
    }),
    [drawing, plates],
  );
  return scene;
}

function countRender(layer: 'static' | 'units' | 'overlays') {
  if (import.meta.env.DEV && typeof window !== 'undefined') siegeRenderCounts[layer]++;
}
export const siegeRenderCounts = { static: 0, units: 0, overlays: 0 };
const UnitLayer = memo(function UnitLayer({ drawing }: { drawing: ReactNode }) {
  countRender('units');
  return <>{drawing}</>;
});
const StaticArt = memo(function StaticArt({
  layer,
  prefix,
  painting,
  xray,
}: {
  layer: Layer;
  prefix: string;
  painting: string;
  xray?: boolean;
}) {
  countRender('static');
  const key = `${prefix}-${layer.slice.objectId}-${layer.slice.row}`;
  const [x0, y0, x1, y1] = layer.slice.rect;
  return (
    <>
      <defs>
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
            <image
              href={layer.mask.href}
              x={layer.mask.rect[0]}
              y={layer.mask.rect[1]}
              width={layer.mask.rect[2] - layer.mask.rect[0]}
              height={layer.mask.rect[3] - layer.mask.rect[1]}
            />
          </mask>
        )}
      </defs>
      <g
        clipPath={`url(#${key}-clip)`}
        mask={layer.mask ? `url(#${key}-mask)` : undefined}
        opacity={xray && layer.slice.kind !== 'engine' ? 0.4 : 1}
        data-piece={layer.sprite?.id}
        data-object={layer.slice.objectId}
        data-selection-layer={key}
        data-fadeable={true}
        data-sheet={layer.sprite?.sheet}
      >
        {layer.sprite ? (
          <SpriteImage
            sprite={layer.sprite}
            flip={'flip' in layer.sprite && Boolean(layer.sprite.flip)}
          />
        ) : (
          <image href={painting} width={W} height={H} />
        )}
      </g>
    </>
  );
});
const StaticPainting = memo(function StaticPainting({
  painting,
  prefix,
}: {
  painting: string;
  prefix: string;
}) {
  countRender('static');
  return <image href={painting} width={W} height={H} mask={`url(#${prefix}-ground)`} />;
});
const StaticGround = memo(function StaticGround({
  prefix,
  scenery,
}: {
  prefix: string;
  scenery: Layer[];
}) {
  countRender('static');
  const layers = scenery;
  const layerKey = (l: Layer) => `${prefix}-${l.slice.objectId}-${l.slice.row}`;
  return (
    <>
      <mask id={`${prefix}-ground`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
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
    </>
  );
});
type Scene = ReturnType<typeof useScene>;
function selectionSilhouettes({ units, occluders }: Scene) {
  // These replace the obscured figures, so no on-screen unit can lose its
  // visibility to an optional-image budget or selection priority.
  return new Set(
    units
      .filter(({ visual }) => visual.figures.length > 0 && occluders(visual).length)
      .map(({ unit }) => unit.id),
  );
}

// Full covered formations are still unit art. Keep their nodes stable when
// selection or hover changes the overlay around them.
const CoveredUnits = memo(function CoveredUnits({ scene }: { scene: Scene }) {
  countRender('units');
  const silhouetteUnits = selectionSilhouettes(scene);
  return (
    <>
      {scene.units.map(({ unit, visual }) =>
        silhouetteUnits.has(unit.id) ? (
          <g
            key={unit.id}
            data-silhouette={unit.side}
            opacity={SILHOUETTE_OPACITY}
            pointerEvents="none"
          >
            <g mask={`url(#${scene.prefix}-cover-${unit.id})`}>
              <g filter={`url(#${scene.prefix}-silhouette)`}>
                <use
                  data-sprite="silhouette"
                  data-covered-unit={unit.id}
                  href={`#${scene.prefix}-${unit.id}-figures`}
                  transform={`translate(${visual.foot[0]} ${visual.foot[1]})`}
                />
              </g>
            </g>
          </g>
        ) : null,
      )}
    </>
  );
});

interface OverlayHandle {
  hover: (hit: { cell: SiegePosition | null; plateUnitId?: string } | null) => void;
}
const MapOverlays = forwardRef<
  OverlayHandle,
  Pick<Props, 'state' | 'selected' | 'climbBase' | 'night' | 'forecastCell' | 'xray'> & {
    scene: Scene;
    clickContext: MapClickContext;
    reachable: SiegePosition[];
    targets: SiegePosition[];
    tutorialCells: SiegePosition[];
    tutorialFill: boolean;
    deploy: boolean;
    deployCells: readonly SiegePosition[];
    scale: number;
  }
>(function MapOverlays(
  {
    scene,
    clickContext,
    state,
    selected,
    reachable,
    targets,
    tutorialCells,
    tutorialFill,
    deploy,
    deployCells,
    climbBase,
    night,
    forecastCell,
    scale,
    xray,
  },
  ref,
) {
  countRender('overlays');
  const [hit, setHit] = useState<Parameters<OverlayHandle['hover']>[0]>(null);
  const plateOwner = scene.units.find(({ unit }) => unit.id === hit?.plateUnitId)?.unit;
  const hover = plateOwner ?? hit?.cell;
  const hoverRef = useRef(hit);
  useImperativeHandle(
    ref,
    () => ({
      hover(next) {
        const previous = hoverRef.current;
        if (
          previous?.cell?.x === next?.cell?.x &&
          previous?.cell?.y === next?.cell?.y &&
          previous?.cell?.level === next?.cell?.level &&
          previous?.plateUnitId === next?.plateUnitId
        )
          return;
        hoverRef.current = next;
        setHit(next);
      },
    }),
    [],
  );
  const { units, engines, prefix, occluders } = scene;
  const cellOutline = (
    cell: SiegePosition,
    color: string,
    kind: string,
    fill?: number,
    stroke?: number,
  ) => scene.cellOutline(cell, color, kind, fill, stroke, tutorialFill && kind === 'reachable');
  const silhouetteUnits = selectionSilhouettes(scene);
  const anchor = useRef<SVGGElement>(null);
  useLayoutEffect(() => {
    const svg = anchor.current?.ownerSVGElement;
    if (!svg) return;
    const selectedUnit = units.find((u) => u.unit.id === selected);
    const selectedEngine = engines.find((e) => e.id === selected);
    const visual = selectedUnit?.visual;
    // Only a tower is big enough to hide what the player is working on. Ladders and
    // carts stay solid: their sprite rectangles overlap neighbours without covering them.
    const fadesEngine = (kind: EngineSprite['engine']['kind']) => kind === 'tower';
    const faded = new Set(
      visual
        ? occluders(visual)
            .filter(
              (l) =>
                l.sprite?.kind !== 'engine' || fadesEngine((l.sprite as EngineSprite).engine.kind),
            )
            .map((l) => `${prefix}-${l.slice.objectId}-${l.slice.row}`)
        : [],
    );
    const actorRect = visual?.rect ?? selectedEngine?.rect;
    const actorCell =
      selectedUnit?.unit ??
      (selectedEngine && { ...selectedEngine.engine, level: 'ground' as const });
    const frames = tutorialCells.map((c) => {
      return { cell: c, rect: planeRect(c) };
    });
    for (const engine of engines) {
      if (engine.id === selected || !fadesEngine(engine.engine.kind)) continue;
      const footprint = engineFootprint(engine.engine);
      const contains = (cell: SiegePosition) =>
        footprint.some((c) => c.x === cell.x && c.y === cell.y && c.level === cell.level);
      if (
        (actorRect && actorCell && !contains(actorCell) && rectsOverlap(engine.rect, actorRect)) ||
        frames.some(({ cell, rect }) => !contains(cell) && rectsOverlap(engine.rect, rect))
      )
        for (const layer of scene.layers.filter((l) => l.sprite?.id === engine.id))
          faded.add(`${prefix}-${layer.slice.objectId}-${layer.slice.row}`);
    }
    // Fading is selection presentation. Keep it in the overlay so art children
    // never receive selection, and preserve every existing depth/mask relationship.
    for (const element of svg.querySelectorAll<SVGGElement>(
      '[data-selection-layer][data-fadeable="true"]',
    ))
      element.style.opacity =
        element.dataset.piece === selected
          ? '1'
          : (xray && !engines.some((e) => e.id === element.dataset.piece)) ||
              faded.has(element.dataset.selectionLayer!)
            ? '0.4'
            : '1';
  }, [scene, selected, xray, tutorialCells, state]);
  const hoverResult = resolveMapClick(
    { ...clickContext, plateUnitId: hit?.plateUnitId },
    hover ?? null,
  );
  const hoverColor = mapClickColor(hoverResult);
  useLayoutEffect(() => {
    const svg = anchor.current?.ownerSVGElement;
    if (svg) svg.style.cursor = hoverColor ? 'pointer' : '';
  }, [hoverColor]);
  const selectedUnit = units.find((u) => u.unit.id === selected);
  const selectedEngine = engines.find((e) => e.id === selected);
  return (
    <>
      <g ref={anchor} pointerEvents="none" />
      <CoveredUnits scene={scene} />

      {selectedUnit && (
        <>
          {cellOutline(selectedUnit.unit, '#e7b84e', 'selection', 0.02, 2)}
          <defs>
            <mask
              id={`${prefix}-selection-visible`}
              maskUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={W}
              height={H}
            >
              <rect width={W} height={H} fill="white" />
              <rect width={W} height={H} fill="black" mask={`url(#${prefix}-cover-${selected})`} />
            </mask>
          </defs>
          <g
            mask={silhouetteUnits.has(selected!) ? undefined : `url(#${prefix}-selection-visible)`}
            pointerEvents="none"
          >
            <ellipse
              cx={selectedUnit.visual.foot[0]}
              cy={selectedUnit.visual.foot[1]}
              rx={19}
              ry={7}
              fill="none"
              stroke="#e7b84e"
              strokeWidth={3}
            />
          </g>
        </>
      )}
      {selectedEngine &&
        engineFootprint(selectedEngine.engine).map((c) =>
          cellOutline(c, '#e7b84e', 'selection', 0.02, 2),
        )}
      <g>
        {deploy && deployCells.map((c) => cellOutline(c, '#51835c', 'deploy', 0.12))}
        {climbableCells(state)
          .filter((c) => targets.some((t) => t.x === c.x && t.y === c.y && t.level === c.level))
          .map((c) => cellOutline(c, '#dfb347', 'climb', 0.04, 1))}
        {clickContext.mode === 'move' &&
          selected &&
          swapTargets(state, selected).map((c) => cellOutline(c, '#518bc4', 'swap'))}
        {reachable.map((c) => cellOutline(c, '#609d80', 'reachable'))}
        {targets
          .filter(
            (c) =>
              !climbableCells(state).some((t) => t.x === c.x && t.y === c.y && t.level === c.level),
          )
          .map((c) => cellOutline(c, '#b74e3c', 'target', 0.22))}
        {tutorialCells.map((c) => cellOutline(c, '#bc841d', 'tutorial', 0.08))}
      </g>
      {climbBase &&
        !deploy &&
        !night &&
        (() => {
          const [x, y] = boardAnchor(climbBase.base, state);
          return (
            <g
              pointerEvents="none"
              data-testid="climb-base-label"
              data-cell={`${climbBase.base.x},${climbBase.base.y},${climbBase.base.level}`}
              transform={`translate(${x} ${y}) scale(${scale})`}
            >
              <text
                textAnchor="middle"
                y={4}
                fontSize={12}
                fontWeight={700}
                fill="#49320f"
                stroke="#fff3cf"
                strokeWidth={4}
                paintOrder="stroke"
              >
                {climbBase.label}
              </text>
            </g>
          );
        })()}
      <FootholdPips
        state={state}
        forecast={
          forecastCell ??
          (hover &&
          targets.some((t) => t.x === hover.x && t.y === hover.y && t.level === hover.level)
            ? hover
            : null)
        }
      />
      {hover && cellOutline(hover, hoverColor ?? '#f3d996', 'hover', 0.02, 1)}
    </>
  );
});

function MapNotice({
  selection,
  view,
  children,
}: {
  selection: ScreenRect | null;
  view: BattlefieldViewBox;
  children: ReactNode;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0, cardWidth: 0, cardHeight: 0 });
  useEffect(() => {
    const node = element.current!;
    const observer = new ResizeObserver(() => {
      // A last callback can arrive after the ending screen has unmounted the map.
      const parent = node.parentElement;
      if (!parent) return;
      setSize({
        width: parent.clientWidth,
        height: parent.clientHeight,
        cardWidth: node.offsetWidth,
        cardHeight: node.offsetHeight,
      });
    });
    observer.observe(node);
    observer.observe(node.parentElement!);
    return () => observer.disconnect();
  }, []);
  const selectedRect = selection
    ? [
        ((selection[0] - view.left) * size.width) / view.width,
        ((selection[1] - view.top) * size.height) / view.height,
        ((selection[2] - view.left) * size.width) / view.width,
        ((selection[3] - view.top) * size.height) / view.height,
      ]
    : null;
  return (
    <div
      ref={element}
      className="siege-map-notice"
      data-testid="map-notice"
      style={{
        ...noticeCorner(size.width, size.height, size.cardWidth, size.cardHeight, selectedRect),
        visibility: size.width && size.cardWidth ? 'visible' : 'hidden',
        maxWidth: selectedRect
          ? Math.max(0, Math.max(selectedRect[0]!, size.width - selectedRect[2]!) - 24)
          : undefined,
      }}
    >
      {children}
    </div>
  );
}

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
  const [x, y] = boardAnchor(action.from),
    [tx, ty] = boardAnchor(action.to);
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

const Nameplates = memo(function Nameplates({
  units,
  rects,
  locale,
  selected,
}: {
  units: Scene['units'];
  rects: Map<string, ScreenRect>;
  locale: SiegeLocale;
  selected?: string | null;
}) {
  return (
    <g data-testid="unit-nameplates" pointerEvents="none">
      {units.map(({ unit }) => {
        const [x, y] = rects.get(unit.id)!,
          portrait = portraitOf(unit);
        const color = unit.side === 'shu' ? '#51836d' : '#4d6693';
        return (
          <g
            key={unit.id}
            data-nameplate={unit.id}
            data-moved={Boolean(unit.moved)}
            data-acted={Boolean(unit.acted)}
            opacity={unit.moved && unit.acted ? 0.55 : 1}
            transform={`translate(${x} ${y})`}
          >
            <title>{locale === 'zh' ? unit.officer.chinese : unit.officer.name}</title>
            <rect
              width={92}
              height={26}
              rx={4}
              fill="#282820"
              fillOpacity={0.94}
              stroke={selected === unit.id ? '#ffd23c' : color}
              strokeWidth={selected === unit.id ? 2 : 1}
            />
            {portrait ? (
              <image href={portrait} x={2} y={2} width={22} height={22} />
            ) : (
              <g>
                <rect x={3} y={3} width={20} height={20} rx={3} fill={color} />
                <text x={13} y={18} textAnchor="middle" fill="#fff4d5" fontSize={12}>
                  {(locale === 'zh' ? unit.officer.chinese : unit.officer.name).slice(0, 1)}
                </text>
              </g>
            )}
            <text x={28} y={12} fontSize={11} fill="#fff4d5">
              {unit.troops}
              {unit.wounded > 0 ? '+' : ''}
            </text>
            <text
              x={88}
              y={12}
              fontSize={10}
              textAnchor="end"
              fill={unit.morale < 40 ? '#f1a76e' : '#d2c8b0'}
            >
              {unit.morale}
            </text>
            <rect x={28} y={16} width={59} height={3} fill="#635847" />
            <rect
              x={28}
              y={16}
              width={(59 * unit.troops) / Math.max(1, unit.troops + unit.wounded)}
              height={3}
              fill={color}
            />
            <circle cx={34} cy={23} r={2} fill={unit.moved ? '#706b5d' : '#eac87a'} />
            <circle cx={44} cy={23} r={2} fill={unit.acted ? '#706b5d' : '#eac87a'} />
            {unit.morale < 40 && <path d="M77 24l4-4 4 4" stroke="#f1a76e" fill="none" />}
          </g>
        );
      })}
    </g>
  );
});
function BoardReview({ state }: { state: SiegeState }) {
  return (
    <g data-testid="board-review" pointerEvents="none">
      {standingPositions(state).map((p) => {
        const [x, y, right, bottom] = hitRect(p, state)!,
          at = centre([x, y, right, bottom]);
        return (
          <g key={`${p.x},${p.y},${p.level}`} data-review-cell={`${p.x},${p.y},${p.level}`}>
            <rect
              x={x}
              y={y}
              width={right - x}
              height={bottom - y}
              fill="none"
              stroke={p.level === 'wall' ? '#cf4ba3' : '#168b84'}
              strokeWidth={1.5}
            />
            <text
              x={at[0]}
              y={bottom - 4}
              textAnchor="middle"
              fontSize={12}
              fill="#141812"
              stroke="#fff4db"
              strokeWidth={3}
              paintOrder="stroke"
            >
              {p.x},{p.y},{p.level === 'wall' ? 'W' : 'G'}
            </text>
          </g>
        );
      })}
    </g>
  );
}
