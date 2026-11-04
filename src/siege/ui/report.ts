import {
  GATES,
  INNER_WALL_SEGMENTS,
  SHU_ROSTER,
  WEI_ROSTER,
  SOUTH_TRENCH,
  cellKey,
} from '../content/chencang';
import { siegeText, type SiegeLocale, type SiegeTextKey } from '../i18n';
import type {
  EngineKind,
  GateId,
  SiegeLogEntry,
  SiegePosition,
  SiegeState,
  SiegeSide,
} from '../rules/types';
import { engineKey } from './story';
import { SIEGE_TUNING as T } from '../rules/tuning';
import { activeUnit, distance } from '../rules/combat';
import { placeName, reportCell } from './places';

export interface ReportItem {
  code: string;
  icon: SiegeTextKey;
  text: string;
  counter: string;
  place: SiegePosition | null;
  priority: number;
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
  state?: SiegeState,
  playerSide: SiegeSide = 'shu',
): ReportItem[] {
  const t = (key: SiegeTextKey, params: Record<string, string | number> = {}) =>
    siegeText(locale, key, params);
  const weiCopy: Record<string, [SiegeTextKey, SiegeTextKey, SiegeTextKey]> = {
    brazierDoused: ['snow', 'reportWeiSnow', 'counterWeiSnow'],
    raiseLadder: ['ladder', 'reportWeiLadder', 'counterWeiLadder'],
    trenchFilled: ['filled', 'reportWeiFill', 'counterWeiFill'],
    earthPiled: ['pileEarth', 'reportWeiMound', 'counterWeiMound'],
    moundFinished: ['pileEarth', 'reportWeiMoundDone', 'counterWeiMound'],
    covered: ['covered', 'reportWeiCover', 'counterWeiCover'],
    suppressed: ['suppress', 'reportWeiSuppress', 'counterWeiSuppress'],
    assault: ['assault', 'reportWeiAssault', 'counterWeiAssault'],
    nightAssault: ['nightAssault', 'reportWeiNightAdvanced', 'counterWeiNight'],
    engineNear: ['move', 'reportWeiEngineNear', 'counterWeiLadder'],
    ramAtBridge: ['ramEngine', 'reportWeiRam', 'counterWeiRam'],
    wallGained: ['climb', 'reportWeiMounted', 'counterWeiMounted'],
  };
  const recent = [...log, ...observations].filter(
    (entry) =>
      entry.day === day - 1 ||
      (entry.day === day && (playerSide === 'wei' || entry.code === 'brazierDoused')),
  );
  const entries = [...recent];
  if (playerSide === 'wei' && state) {
    for (const [cell, fill] of Object.entries(state.trenchFill))
      if (fill >= T.trenchCapacity) entries.push({ day, code: 'trenchFilled', params: { cell } });
    for (const engine of state.engines.filter(
      (e) =>
        !e.wrecked && e.durability > 0 && SOUTH_TRENCH.some((c) => distance(c, e) <= T.sortieRange),
    )) {
      const bridge =
        engine.kind === 'ram' && GATES.south.approaches.some((c) => cellKey(c) === cellKey(engine));
      entries.push({
        day,
        code: bridge ? 'ramAtBridge' : 'engineNear',
        params: { engineId: engine.id },
      });
    }
  }
  if (playerSide === 'shu')
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
  const doused = new Set(
    recent.filter((e) => e.code === 'brazierDoused').map((e) => e.params.cell),
  );
  const seen = new Set<string>();
  return entries
    .flatMap((entry, index): ReportItem[] => {
      const mapping = (playerSide === 'wei' ? weiCopy : copy)[entry.code];
      if (!mapping) return [];
      const [icon, base, baseCounter] = mapping;
      const p = entry.params;
      if (playerSide === 'wei' && entry.code === 'suppressed' && entry.day !== day) return [];
      if (
        playerSide === 'wei' &&
        entry.code === 'earthPiled' &&
        recent.some((e) => e.code === 'moundFinished' && e.params.cell === p.cell)
      )
        return [];
      let key = base;
      let counter = baseCounter;
      const merged = entry.code === 'brazierPrepared' && doused.has(p.cell);
      if (
        playerSide === 'shu' &&
        entry.code === 'brazierDoused' &&
        recent.some((e) => e.code === 'brazierPrepared' && e.params.cell === p.cell)
      )
        return [];
      const preparation =
        entry.code === 'brazierPrepared'
          ? preparations.braziers[String(p.cell)]
          : entry.code === 'millstonePrepared'
            ? preparations.millstones[String(p.cell)]
            : entry.code === 'bouldersPrepared'
              ? preparations.boulders[String(p.cell)]
              : undefined;
      const preparedReady =
        preparation &&
        ('litDay' in preparation
          ? preparation.litDay < day
          : preparation.day < day && (!('hoisted' in preparation) || preparation.hoisted));
      const cellPosition = reportCell(p.cell);
      const hasOperator =
        !state ||
        Boolean(
          cellPosition &&
          state.units.some(
            (u) =>
              u.side === 'wei' &&
              activeUnit(u) &&
              !u.acted &&
              u.suppressedDay !== day &&
              u.level === 'wall' &&
              (entry.code === 'brazierPrepared'
                ? u.troopType === 'archer' && distance(u, cellPosition) <= 1
                : u.x === cellPosition.x &&
                  u.y === cellPosition.y &&
                  (entry.code !== 'bouldersPrepared' || u.troopType === 'infantry')),
          ),
        );
      const ready = preparedReady && hasOperator;
      if (merged) {
        key = 'reportBrazierDoused';
        counter = 'counterSnow';
      } else if (entry.code.endsWith('Prepared') && !ready) {
        key = preparedReady ? 'reportBlocked' : 'reportSpent';
        counter = 'counterSpent';
      }
      const identity = `${entry.code}-${JSON.stringify(p)}`;
      if (seen.has(identity)) return [];
      seen.add(identity);
      if (entry.code === 'holdFastOrdered' && p.effectiveDay !== day) return [];
      if (entry.code === 'torches' && p.assault === true) key = 'reportTorchesCaught';
      if (entry.code === 'nightAssault' && p.result === 'stopped')
        key = playerSide === 'wei' ? 'reportWeiNightStopped' : 'reportNightStopped';
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
        state?.engines.find((e) => e.id === engineId)?.kind ??
        (engineId.includes('ladder')
          ? 'ladder'
          : engineId.includes('ram')
            ? 'ram'
            : engineId.includes('tower')
              ? 'tower'
              : engineId.includes('earthCart')
                ? 'earthCart'
                : { ...GATES.south.cells[0]!, level: 'wall' as const });
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
      const actor =
        state?.engines.find((e) => e.id === engineId) ??
        state?.units.find((u) => u.id === (p.targetId ?? p.unitId));
      const segment = INNER_WALL_SEGMENTS[Number(p.segment) - 1];
      const place =
        reportCell(
          p.cell ?? p.start ?? p.from,
          playerSide === 'wei' &&
            ['earthPiled', 'moundFinished', 'trenchFilled'].includes(entry.code)
            ? 'ground'
            : 'wall',
        ) ??
        (p.gateId && GATES[p.gateId as GateId]
          ? { ...GATES[p.gateId as GateId].cells[0]!, level: 'wall' as const }
          : segment
            ? { ...segment.cells[0]!, level: 'ground' as const }
            : actor
              ? { ...actor, level: 'level' in actor ? actor.level : ('ground' as const) }
              : { ...GATES.south.cells[0]!, level: 'wall' as const });
      const cell = placeName(place, locale);
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
        cell,
        from: placeName(reportCell(p.from), locale),
        to: placeName(reportCell(p.to, 'ground'), locale),
        preparation: t(icon),
        max: T.moundComplete,
        loss: loss ? Number(loss.params.before) - Number(loss.params.after) : 0,
      };
      const good =
        merged ||
        ['brazierDoused', 'sortieRepelled'].includes(entry.code) ||
        (entry.code === 'nightAssault' && p.result !== 'stopped') ||
        (entry.code === 'torches' && p.assault !== true);
      const priority =
        playerSide === 'wei'
          ? ['wallGained', 'suppressed', 'assault', 'ramAtBridge'].includes(entry.code)
            ? 0
            : 1
          : good
            ? 2
            : ready || entry.code === 'holdFastOrdered'
              ? 0
              : 1;
      return [
        { code: entry.code, icon, text: t(key, params), counter: t(counter), place, priority },
      ];
    })
    .sort((a, b) => a.priority - b.priority);
}
