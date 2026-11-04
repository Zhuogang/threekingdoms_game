import { GATES, INNER_WALL_SEGMENTS, SHU_ROSTER, WEI_ROSTER, cellKey } from '../content/chencang';
import { siegeText, type SiegeLocale, type SiegeTextKey } from '../i18n';
import type { EngineKind, GateId, SiegeLogEntry, SiegeState } from '../rules/types';
import { engineKey } from './story';

export interface ReportItem {
  code: string;
  icon: SiegeTextKey;
  text: string;
  counter: string;
}
export const REPORT_CODES = [
  'brazierPrepared',
  'millstonePrepared',
  'bouldersPrepared',
  'torches',
  'nightAssault',
  'sortieHit',
  'sortieRepelled',
  'nightRepair',
  'holdFastOrdered',
  'brazierDoused',
  'fireArrowHit',
  'engineBurning',
  'engineLost',
  'millstoneHit',
  'bouldersHit',
  'innerWallCompleted',
  'thrownOffWall',
] as const;
const copy: Record<string, [SiegeTextKey, SiegeTextKey, SiegeTextKey]> = {
  brazierPrepared: ['brazier', 'reportBrazier', 'counterFire'],
  millstonePrepared: ['millstone', 'reportMillstone', 'counterMillstone'],
  bouldersPrepared: ['boulders', 'reportBoulders', 'counterBoulders'],
  torches: ['torches', 'reportTorchesIdle', 'counterTorches'],
  nightAssault: ['nightAssault', 'reportNightAdvanced', 'counterTorches'],
  sortieHit: ['sortie', 'reportSortieHit', 'counterSortie'],
  sortieRepelled: ['sortie', 'reportSortieUnavailable', 'counterSortie'],
  nightRepair: ['gates', 'reportRepair', 'counterRepair'],
  holdFastOrdered: ['standby', 'reportHold', 'counterHold'],
  brazierDoused: ['snow', 'reportSnow', 'counterSnow'],
  fireArrowHit: ['brazier', 'reportFireHit', 'counterFire'],
  engineBurning: ['burning', 'reportBurn', 'counterFire'],
  engineLost: ['engineLoss', 'reportEngineLost', 'wayBuild'],
  millstoneHit: ['millstone', 'reportMillHit', 'counterMillstone'],
  bouldersHit: ['boulders', 'reportBoulderHit', 'counterBoulders'],
  innerWallCompleted: ['innerWall', 'reportWall', 'counterWall'],
  thrownOffWall: ['climb', 'reportThrown', 'counterThrown'],
};

/** The rules log buildWall without a segment. Compare immutable rule snapshots
 * around the enemy phase and retain only the completed segment observations. */
export function reportObservations(before: SiegeState, after: SiegeState): SiegeLogEntry[] {
  return INNER_WALL_SEGMENTS.filter(
    (segment) =>
      (before.innerWall[segment.index] ?? 0) < segment.buildPoints &&
      after.innerWall[segment.index] === segment.buildPoints,
  ).map((segment) => ({
    day: before.day,
    code: 'innerWallCompleted',
    params: { segment: segment.index + 1 },
  }));
}

/** Pure log/preparation projection. The morning contains the previous enemy phase
 * and night, plus new-day snow events. Hidden, unresolved night orders never enter it. */
export function morningReport(
  log: SiegeLogEntry[],
  preparations: SiegeState['preparations'],
  day: number,
  locale: SiegeLocale,
  observations: SiegeLogEntry[] = [],
): ReportItem[] {
  const t = (key: SiegeTextKey, params: Record<string, string | number> = {}) =>
    siegeText(locale, key, params);
  const recent = [...log, ...observations].filter(
    (entry) => entry.day === day - 1 || (entry.day === day && entry.code === 'brazierDoused'),
  );
  const entries = [...recent];
  for (const [table, code, dayKey] of [
    ['braziers', 'brazierPrepared', 'litDay'],
    ['millstones', 'millstonePrepared', 'day'],
    ['boulders', 'bouldersPrepared', 'day'],
  ] as const) {
    for (const [cell, value] of Object.entries(preparations[table])) {
      const prepared = value as { day?: number; litDay?: number; hoisted?: boolean };
      if (prepared.hoisted === false || (prepared[dayKey] ?? day) >= day) continue;
      if (!entries.some((e) => e.code === code && e.params.cell === cell))
        entries.push({ day: day - 1, code, params: { cell } });
    }
  }
  return entries.flatMap((entry, index): ReportItem[] => {
    const mapping = copy[entry.code];
    if (!mapping) return [];
    const [icon, base, counter] = mapping;
    const p = entry.params;
    let key = base;
    if (entry.code === 'holdFastOrdered' && p.effectiveDay !== day) return [];
    if (entry.code === 'torches' && p.assault === true) key = 'reportTorchesCaught';
    if (entry.code === 'nightAssault' && p.result === 'stopped') key = 'reportNightStopped';
    if (entry.code === 'sortieRepelled')
      key =
        p.reason === 'guard'
          ? 'reportSortieGuard'
          : p.reason === 'nightAssault'
            ? 'reportSortieAssault'
            : 'reportSortieUnavailable';
    if (
      entry.code === 'fireArrowHit' &&
      recent.slice(0, index).some((e) => e.code === 'torches' && e.params.assault === true)
    )
      key = 'reportNightFire';
    const engineId = String(p.engineId ?? '');
    const kind =
      p.kind ??
      (engineId.includes('ladder')
        ? 'ladder'
        : engineId.includes('ram')
          ? 'ram'
          : engineId.includes('tower')
            ? 'tower'
            : engineId.includes('earthCart')
              ? 'earthCart'
              : null);
    const roster = [...SHU_ROSTER, ...WEI_ROSTER].find((u) => u.id === (p.targetId ?? p.unitId));
    const loss = [...recent.slice(0, index)]
      .reverse()
      .find(
        (e) =>
          e.code === 'footholdChanged' &&
          e.params.reason === 'boulders' &&
          e.params.cell === p.cell,
      );
    const gate = (Object.keys(GATES) as GateId[]).find((id) =>
      GATES[id].cells.some((c) => cellKey(c) === p.cell),
    );
    const cell = String(p.cell ?? '');
    const params: Record<string, string | number> = {
      ...Object.fromEntries(
        Object.entries(p).map(([k, v]) => [k, typeof v === 'number' ? v : String(v ?? '')]),
      ),
      engine:
        kind && ['ladder', 'ram', 'earthCart', 'tower'].includes(String(kind))
          ? t(engineKey(kind as EngineKind))
          : engineId,
      unit: roster
        ? locale === 'zh'
          ? roster.officer.chinese
          : roster.officer.name
        : String(p.targetId ?? p.unitId ?? ''),
      gate: t((p.gateId ?? gate ?? 'south') as GateId),
      cell: gate ? `${t(gate)} (${cell})` : cell,
      loss: loss ? Number(loss.params.before) - Number(loss.params.after) : 0,
    };
    return [{ code: entry.code, icon, text: t(key, params), counter: t(counter) }];
  });
}
