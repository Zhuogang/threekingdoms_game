import { message } from '../i18n';
import { useMemo, useState } from 'react';
import { BattlefieldMapView } from './BattlefieldMapView';
import { BattlefieldMinimap } from './BattlefieldMinimap';
import type { BattlefieldVisualMap } from './BattlefieldMapView';
import type { BattleUnitVisual } from './presentation';

function previewMap(): BattlefieldVisualMap {
  const width = 24;
  const height = 20;
  const terrain = Array.from({ length: width * height }, () => 'plain');
  for (let x = 0; x < width; x++) {
    const bend = 10 + Math.round(Math.sin(x / 4) * 2);
    terrain[bend * width + x] = 'water';
    if (bend + 1 < height && x % 3 === 0) terrain[(bend + 1) * width + x] = 'water';
  }
  for (const [x, y] of [
    [5, 4],
    [6, 4],
    [5, 5],
    [6, 5],
    [16, 14],
    [17, 14],
    [18, 14],
  ] as const) {
    terrain[y * width + x] = 'hill';
  }
  for (const [x, y] of [
    [3, 13],
    [4, 13],
    [4, 14],
    [20, 4],
    [21, 4],
    [21, 5],
  ] as const) {
    terrain[y * width + x] = 'forest';
  }
  for (const [x, y] of [
    [0, 0],
    [23, 19],
    [0, 19],
  ] as const)
    terrain[y * width + x] = 'cliff';
  return { id: 'ink-river-crossing', width, height, terrain };
}

const PREVIEW_UNITS: readonly BattleUnitVisual[] = [
  {
    id: 'preview-infantry',
    troopType: 'infantry',
    position: { x: 4, y: 7 },
    faction: 'player',
    strength: 6400,
    label: '先锋',
  },
  {
    id: 'preview-archer',
    troopType: 'archer',
    position: { x: 7, y: 7 },
    faction: 'player',
    strength: 5200,
    label: '弓队',
  },
  {
    id: 'preview-cavalry',
    troopType: 'cavalry',
    position: { x: 15, y: 13 },
    faction: 'opponent',
    strength: 7800,
    label: '骑兵',
  },
  {
    id: 'preview-afloat',
    troopType: 'infantry',
    position: { x: 12, y: 10 },
    faction: 'opponent',
    strength: 4300,
    label: '渡河中',
  },
  {
    id: 'preview-reinforcement',
    troopType: 'cavalry',
    position: { x: 13, y: 12 },
    faction: 'player',
    strength: 3900,
    label: '援军',
  },
];

/** Import this component into the v0.3 app to preview rendering with stable data. */
export function V03RenderingFixture({ locale = 'en' }: { locale?: 'en' | 'zh' }) {
  const map = useMemo(previewMap, []);
  const [selectedCell, setSelectedCell] = useState<{ x: number; y: number } | undefined>();
  const [selectedUnit, setSelectedUnit] = useState<string | undefined>();
  const units = useMemo(
    () =>
      PREVIEW_UNITS.map((unit) => ({
        ...unit,
        selected: unit.id === selectedUnit,
        isOnWater: map.terrain[unit.position.y * map.width + unit.position.x] === 'water',
      })),
    [map, selectedUnit],
  );
  const viewportPolygon = [
    { x: 3, y: 2 },
    { x: 13, y: 3 },
    { x: 14, y: 10 },
    { x: 4, y: 11 },
  ];
  return (
    <section
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 230px',
        gap: 14,
        height: 'min(76vh, 760px)',
        minHeight: 420,
        background: '#e6dcc8',
        padding: 12,
        borderRadius: 12,
      }}
    >
      <div
        style={{
          minWidth: 0,
          minHeight: 0,
          border: '1px solid #756b58',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <BattlefieldMapView
          map={map}
          units={units}
          selectedCell={selectedCell}
          reachableCells={[
            { x: 10, y: 8 },
            { x: 11, y: 8 },
            { x: 10, y: 9 },
          ]}
          attackableCells={[
            { x: 13, y: 10 },
            { x: 13, y: 11 },
          ]}
          route={[
            { x: 2, y: 6 },
            { x: 5, y: 8 },
            { x: 9, y: 9 },
            { x: 12, y: 10 },
          ]}
          locale={locale}
          waterAttackMultiplier={0.75}
          waterIncomingDamageMultiplier={1.25}
          onCellClick={setSelectedCell}
          onUnitClick={(id) => setSelectedUnit(id)}
        />
      </div>
      <aside
        style={{
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          gap: 10,
          alignContent: 'start',
          color: '#342f28',
          fontFamily: 'serif',
        }}
      >
        <strong>{message(locale, 'ui.battlefield.legend.minimap.154')}</strong>
        <BattlefieldMinimap
          map={map}
          units={units}
          viewportPolygon={viewportPolygon}
          locale={locale}
          onNavigate={setSelectedCell}
        />
        <span style={{ fontSize: 13, lineHeight: 1.5 }}>
          {selectedCell
            ? `${message(locale, 'ui.selected.cell.155')}: ${selectedCell.x + 1}, ${selectedCell.y + 1}`
            : message(locale, 'ui.click.a.tile.to.inspect.its.logical.position.156')}
        </span>
      </aside>
    </section>
  );
}
