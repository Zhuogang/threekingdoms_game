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
  noticeKeys?: string[];
}
export const REPORT_PAGE_SIZE = 5;
export type ReportSeen = Record<string, number>;
/** Presentation memory survives save/load, including notices behind “more”. */
export function rememberReport(items: ReportItem[], seen: ReportSeen, day: number): ReportSeen {
  const next = { ...seen };
  for (const item of items) for (const key of item.noticeKeys ?? []) next[key] ??= day;
  return next;
}

interface CandidateReport extends ReportItem {
  template: SiegeTextKey;
  params: Record<string, string | number>;
  group: string;
}

/** One engine's damage and destruction during the same resolution are one story. */
function engineChains(entries: SiegeLogEntry[]): SiegeLogEntry[] {
  const damage = new Set([
    'fireArrowHit',
    'engineBurning',
    'millstoneHit',
    'sortieHit',
    'engineLost',
  ]);
  const groups = new Map<string, SiegeLogEntry[]>();
  for (const entry of entries) {
    if (!damage.has(entry.code) || !entry.params.engineId) continue;
    const id = `${entry.day}:${entry.params.engineId}`;
    groups.set(id, [...(groups.get(id) ?? []), entry]);
  }
  return entries.flatMap((entry) => {
    const group = groups.get(`${entry.day}:${entry.params.engineId}`);
    if (!group || group.length < 2 || !damage.has(entry.code)) return [entry];
    if (entry !== group[0]) return [];
    const hits = group.filter((e) => typeof e.params.before === 'number');
    const lost = group.some((e) => e.code === 'engineLost');
    const cause = group.some((e) => e.code === 'fireArrowHit')
      ? 'reportCauseFire'
      : group.some((e) => e.code === 'sortieHit')
        ? 'reportCauseSortie'
        : group.some((e) => e.code === 'millstoneHit')
          ? 'reportCauseMill'
          : 'reportCauseBurn';
    return [
      {
        ...entry,
        code: lost ? 'engineLost' : entry.code,
        params: {
          ...entry.params,
          chain: true,
          cause,
          before: hits[0]?.params.before ?? 0,
          after: lost ? 0 : (hits.at(-1)?.params.after ?? 0),
        },
      },
    ];
  });
}

export const REPORT_CODES = [
  'gateOpened',
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
  'footholdChanged',
] as const;
const copy: Record<string, [SiegeTextKey, SiegeTextKey, SiegeTextKey]> = {
  gateOpened: ['gates', 'reportGateOpened', 'counterWeiMounted'],
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
  footholdChanged: ['climb', 'reportBreachSealed', 'counterThrown'],
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
  seenNotices: ReportSeen = {},
): ReportItem[] {
  const t = (key: SiegeTextKey, params: Record<string, string | number> = {}) =>
    siegeText(locale, key, params);
  const weiCopy: Record<string, [SiegeTextKey, SiegeTextKey, SiegeTextKey]> = {
    gateOpened: ['gates', 'reportGateOpened', 'counterWeiMounted'],
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
    footholdChanged: ['climb', 'reportBreachSealed', 'counterWeiMounted'],
  };
  const recent = [...log, ...observations].filter(
    (entry) =>
      (entry.day === day - 1 &&
        (playerSide === 'shu' ||
          ['nightAssault', 'brazierDoused'].includes(entry.code) ||
          (entry.code === 'footholdChanged' && entry.params.reason === 'sealed'))) ||
      (entry.day === day && (playerSide === 'wei' || entry.code === 'brazierDoused')),
  );
  const entries = [...recent];
  if (playerSide === 'wei' && state) {
    for (const [cell, fill] of Object.entries(state.trenchFill))
      if (fill >= T.trenchCapacity)
        entries.push({ day, code: 'trenchFilled', params: { cell, notice: `filled:${cell}` } });
    for (const engine of state.engines.filter(
      (e) =>
        !e.wrecked && e.durability > 0 && SOUTH_TRENCH.some((c) => distance(c, e) <= T.sortieRange),
    )) {
      const bridge =
        engine.kind === 'ram' && GATES.south.approaches.some((c) => cellKey(c) === cellKey(engine));
      entries.push({
        day,
        code: bridge ? 'ramAtBridge' : 'engineNear',
        params: { engineId: engine.id, notice: `${bridge ? 'bridge' : 'near'}:${engine.id}` },
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
  const candidates = engineChains(entries)
    .flatMap((entry, index): CandidateReport[] => {
      if (entry.code === 'footholdChanged' && entry.params.reason !== 'sealed') return [];
      const mapping = (playerSide === 'wei' ? weiCopy : copy)[entry.code];
      if (!mapping) return [];
      const [icon, base, baseCounter] = mapping;
      const p = entry.params;
      const eventIndex = recent.indexOf(entry);
      if (playerSide === 'wei' && entry.code === 'suppressed' && entry.day !== day) return [];
      if (
        playerSide === 'wei' &&
        entry.code === 'earthPiled' &&
        recent.some((e) => e.code === 'moundFinished' && e.params.cell === p.cell)
      )
        return [];
      let key = base;
      let counter = baseCounter;
      if (playerSide === 'shu' && entry.code === 'brazierPrepared' && doused.has(p.cell)) return [];
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
                : u.x === cellPosition.x && u.y === cellPosition.y),
          ),
        );
      const ready = preparedReady && hasOperator;
      // A standing weapon is news while it can strike, or once when it loses its operator.
      const preparedDay =
        preparation && ('litDay' in preparation ? preparation.litDay : preparation.day);
      const notice =
        typeof p.notice === 'string'
          ? p.notice
          : entry.code.endsWith('Prepared') && preparedReady && !hasOperator
            ? `blocked:${entry.code}:${p.cell}:${preparedDay}`
            : undefined;
      if (notice && seenNotices[notice] !== undefined && seenNotices[notice] !== day) return [];
      // Consumed preparations are already explained by their strike; no stale “spent” item.
      if (entry.code.endsWith('Prepared') && !preparedReady) return [];
      if (entry.code.endsWith('Prepared') && !ready) {
        key = 'reportBlocked';
        counter = 'counterSpent';
      }
      const identity = `${entry.code}-${JSON.stringify(p)}`;
      if (seen.has(identity)) return [];
      seen.add(identity);
      if (
        playerSide === 'shu' &&
        entry.code === 'nightAssault' &&
        p.result === 'stopped' &&
        recent.some((e) => e.code === 'torches' && e.params.assault === true)
      )
        return [];
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
        recent
          .slice(0, eventIndex < 0 ? recent.length : eventIndex)
          .some((e) => e.code === 'torches' && e.params.assault === true)
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
      const loss = [...recent.slice(0, eventIndex < 0 ? recent.length : eventIndex)]
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
        cause: p.cause ? t(p.cause as SiegeTextKey) : '',
      };
      if (p.chain) {
        key = entry.code === 'engineLost' ? 'reportEngineDestroyed' : 'reportEngineDamaged';
        if (entry.code === 'engineLost') counter = 'counterEngineLoss';
      }
      const good =
        ['brazierDoused', 'sortieRepelled'].includes(entry.code) ||
        (entry.code === 'nightAssault' && p.result !== 'stopped') ||
        (entry.code === 'torches' && p.assault !== true);
      const priority =
        playerSide === 'wei'
          ? ['gateOpened', 'wallGained', 'suppressed', 'assault', 'ramAtBridge'].includes(
              entry.code,
            )
            ? 0
            : 1
          : notice?.startsWith('blocked:')
            ? 3
            : good
              ? 2
              : ready ||
                  entry.code === 'holdFastOrdered' ||
                  (entry.code === 'footholdChanged' && p.reason === 'sealed')
                ? 0
                : 1;
      const mergeByKind = [
        'raiseLadder',
        'covered',
        'suppressed',
        'assault',
        'wallGained',
        'engineNear',
        'ramAtBridge',
        'trenchFilled',
      ].includes(entry.code);
      return [
        {
          code: entry.code,
          icon,
          text: t(key, params),
          counter: t(counter),
          place,
          priority,
          noticeKeys: notice ? [notice] : [],
          template: key,
          params,
          group:
            p.chain || entry.code === 'engineLost'
              ? `${key}:${params.engine}:${params.cause ?? ''}:${params.before ?? ''}:${params.after ?? ''}`
              : mergeByKind
                ? `${key}:${entry.code === 'covered' || entry.code === 'engineNear' ? params.engine : ''}`
                : entry.code.endsWith('Prepared') || entry.code === 'brazierDoused'
                  ? `${key}:${cell}:${icon}`
                  : `event:${index}`,
        },
      ];
    })
    .sort((a, b) => a.priority - b.priority);
  const groups = new Map<string, CandidateReport[]>();
  for (const item of candidates) groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
  const groupedKeys: Partial<Record<SiegeTextKey, SiegeTextKey>> = {
    reportBrazier: 'reportBrazierGroup',
    reportMillstone: 'reportMillstoneGroup',
    reportBoulders: 'reportBouldersGroup',
    reportBlocked: 'reportBlockedGroup',
    reportSnow: 'reportSnowGroup',
    reportWeiSnow: 'reportWeiSnowGroup',
    reportWeiLadder: 'reportWeiLadderGroup',
    reportWeiCover: 'reportWeiCoverGroup',
    reportWeiSuppress: 'reportWeiSuppressGroup',
    reportWeiAssault: 'reportWeiAssaultGroup',
    reportWeiMounted: 'reportWeiMountedGroup',
    reportWeiEngineNear: 'reportWeiEngineNearGroup',
    reportWeiFill: 'reportWeiFillGroup',
    reportEngineDestroyed: 'reportEngineDestroyedGroup',
    reportEngineDamaged: 'reportEngineDamagedGroup',
    reportEngineLost: 'reportEngineLostGroup',
  };
  const unique = new Set<string>();
  return [...groups.values()].flatMap((group): ReportItem[] => {
    const first = group[0]!;
    const join = (key: string) =>
      [...new Set(group.map((item) => String(item.params[key])))].join(
        locale === 'zh' ? '、' : ' and ',
      );
    let cell = join('cell');
    const west = t('placeSouthWest'),
      east = t('placeSouthEast');
    if (
      group.some((i) => i.params.cell === west) &&
      group.some((i) => i.params.cell === east) &&
      group.every((i) => i.params.cell === west || i.params.cell === east)
    )
      cell = t('placeSouthBoth');
    const template =
      group.length > 1 ? (groupedKeys[first.template] ?? first.template) : first.template;
    const text = t(template, { ...first.params, cell, count: group.length, unit: join('unit') });
    if (unique.has(text)) return [];
    unique.add(text);
    return [
      {
        code: first.code,
        icon: first.icon,
        text,
        counter: first.counter,
        place: first.place,
        priority: first.priority,
        noticeKeys: group.flatMap((i) => i.noticeKeys ?? []),
      },
    ];
  });
}
