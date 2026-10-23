import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  CANVAS_CELL_TERRAIN,
  canvasBattlefieldIds,
  canvasBattlefieldLayout,
  createBattleMap,
  createCanvasBattleMap,
  type BattleMap,
  type BattleRegion,
} from '../battle';
import { OFFICER_IDENTITIES } from '../content/officerIdentity';
import {
  BattlefieldMapView,
  BattlefieldMinimap,
  V03_BATTLEFIELD_CANVASES,
  V03_BATTLEFIELD_PADDING,
  battlefieldBounds,
  battlefieldViewportGridPolygon,
  fitBattlefieldViewport,
  gridToWorld,
  recenterBattlefieldViewport,
  resolvePublicAsset,
  type BattleUnitVisual,
  type BattlefieldViewBox,
} from '../rendering';

/**
 * Dev-only battlefield preview (`npm run dev`, then `?battlefield-preview`).
 * Shows a layout on the real battle renderer with deployment zones, camps and
 * sample tokens, optionally over a painted attempt from docs/v0.3/battlefield-art.
 */
const ATTEMPTS = import.meta.glob('/docs/v0.3/battlefield-art/*/attempts/*.{webp,png}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const LEGACY: BattleRegion[] = ['xiapi', 'shouchun', 'hanzhong', 'chengdu'];
const TROOPS = [
  'infantry',
  'cavalry',
  'archer',
  'infantry',
  'cavalry',
  'archer',
  'guard',
  'elite',
  'naval',
  'infantry',
];
const PORTRAITS = Object.values(OFFICER_IDENTITIES).map((identity) => identity.portraitKey);

function buildMap(id: string): BattleMap {
  return (LEGACY as string[]).includes(id)
    ? createBattleMap({ regionId: id as BattleRegion, seed: 1 })
    : createCanvasBattleMap(id, { seed: 1 });
}

/** The shipped canvas first (what the game shows), then attempts, newest first. */
function attemptsFor(id: string): Array<{ name: string; href: string }> {
  const shipped = V03_BATTLEFIELD_CANVASES[id];
  const inGame = shipped
    ? [
        {
          name: '游戏内（已入库）',
          href: resolvePublicAsset(shipped.path, import.meta.env.BASE_URL),
        },
      ]
    : [];
  return inGame.concat(attemptsOnDisk(id));
}

function attemptsOnDisk(id: string): Array<{ name: string; href: string }> {
  return Object.entries(ATTEMPTS)
    .filter(([path]) => path.includes(`/battlefield-art/${id}/attempts/`))
    .map(([path, href]) => ({ name: path.split('/').pop()!, href }))
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
}

function sampleUnits(map: BattleMap): BattleUnitVisual[] {
  const side = (
    cells: BattleMap['attackerDeployment'],
    faction: 'player' | 'opponent',
    offset: number,
  ) =>
    cells.slice(0, 10).map((position, index) => ({
      id: `${faction}-${index}`,
      troopType: TROOPS[index]!,
      position,
      faction,
      strength: 800 + index * 100,
      label: `${faction} ${index + 1}`,
      portraitKey: index === 9 ? undefined : PORTRAITS[(offset + index) % PORTRAITS.length],
    }));
  return [
    ...side(map.attackerDeployment, 'player', 0),
    ...side(map.defenderDeployment, 'opponent', 20),
  ];
}

export default function BattlefieldPreview() {
  const ids = useMemo(() => [...canvasBattlefieldIds(), ...LEGACY], []);
  const initial = new URLSearchParams(location.search).get('battlefield-preview') || ids[0]!;
  const [id, setId] = useState(ids.includes(initial) ? initial : ids[0]!);
  const attempts = useMemo(() => attemptsFor(id), [id]);
  const [attempt, setAttempt] = useState<string>('');
  const [terrainOpacity, setTerrainOpacity] = useState(0.35);
  const [showGrid, setShowGrid] = useState(true);
  const [showZones, setShowZones] = useState(true);
  const [showUnits, setShowUnits] = useState(true);
  const map = useMemo(() => buildMap(id), [id]);
  const bounds = useMemo(
    () => battlefieldBounds(map.width, map.height, V03_BATTLEFIELD_PADDING),
    [map.width, map.height],
  );
  const frame = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState<BattlefieldViewBox | null>(null);

  useEffect(() => setAttempt(attempts[0]?.href ?? ''), [attempts]);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const fit = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0)
        setViewport(fitBattlefieldViewport(bounds, rect.width / rect.height));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [bounds]);
  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('battlefield-preview', id);
    history.replaceState(null, '', url);
  }, [id]);

  const layout = canvasBattlefieldLayout(id);
  const symbols = layout ? new Set(layout.rows.join('')) : new Set<string>();
  const camps = map.objectives.map((objective) => ({
    id: objective.id,
    position: objective.position,
    label: objective.id,
  }));
  const units = showUnits ? sampleUnits(map) : [];
  const label: CSSProperties = { display: 'flex', alignItems: 'center', gap: 6 };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 280px',
        height: '100vh',
        background: '#e8dfcc',
        color: '#2e2923',
        font: '14px system-ui, sans-serif',
      }}
    >
      <div ref={frame} style={{ position: 'relative', minHeight: 0 }}>
        <BattlefieldMapView
          map={map}
          units={units}
          camps={camps}
          reachableCells={showZones ? map.attackerDeployment : []}
          attackableCells={showZones ? map.defenderDeployment : []}
          viewport={viewport ?? undefined}
          interactive
          onViewportChange={setViewport}
          background={attempt ? { href: attempt, terrainOpacity } : null}
          showGrid={showGrid}
          locale="zh"
          onCellClick={(cell) =>
            console.info('cell', cell, map.terrain[cell.y * map.width + cell.x])
          }
        />
      </div>
      <aside
        style={{
          padding: 14,
          overflow: 'auto',
          display: 'grid',
          gap: 12,
          alignContent: 'start',
          borderLeft: '1px solid #b8ab8c',
        }}
      >
        <strong>战场预览（开发用）</strong>
        <label style={label}>
          战场
          <select value={id} onChange={(event) => setId(event.target.value)}>
            {ids.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label style={label}>
          画面
          <select value={attempt} onChange={(event) => setAttempt(event.target.value)}>
            <option value="">平铺贴图</option>
            {attempts.map((option) => (
              <option key={option.href} value={option.href}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label style={label}>
          地形叠加 {Math.round(terrainOpacity * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={terrainOpacity}
            disabled={!attempt}
            onChange={(event) => setTerrainOpacity(Number(event.target.value))}
          />
        </label>
        <label style={label}>
          <input
            type="checkbox"
            checked={showGrid}
            onChange={(event) => setShowGrid(event.target.checked)}
          />{' '}
          网格
        </label>
        <label style={label}>
          <input
            type="checkbox"
            checked={showZones}
            onChange={(event) => setShowZones(event.target.checked)}
          />{' '}
          部署区（绿：攻方，红：守方）
        </label>
        <label style={label}>
          <input
            type="checkbox"
            checked={showUnits}
            onChange={(event) => setShowUnits(event.target.checked)}
          />{' '}
          示例部队（各 10 支）
        </label>
        <BattlefieldMinimap
          map={map}
          units={units}
          camps={camps}
          viewportPolygon={viewport ? battlefieldViewportGridPolygon(viewport) : []}
          locale="zh"
          onNavigate={(cell) =>
            viewport &&
            setViewport(recenterBattlefieldViewport(viewport, bounds, gridToWorld(cell)))
          }
        />
        <small>
          {map.width}×{map.height} · 攻方部署 {map.attackerDeployment.length} 格 · 守方部署{' '}
          {map.defenderDeployment.length} 格
        </small>
        {layout ? (
          <small>
            符号：
            {[...symbols]
              .sort()
              .map((symbol) => `${symbol}→${CANVAS_CELL_TERRAIN[symbol]}`)
              .join('  ')}
          </small>
        ) : null}
        <small>拖动平移，滚轮缩放，Home 回到全图。点击格子会在控制台打印坐标和地形。</small>
      </aside>
    </div>
  );
}
