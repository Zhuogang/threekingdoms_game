import type { GameState } from './types';
import { FACTIONS } from '../content/scenario';

interface EventBase {
  key: string;
  sequence: number;
}
export type MonthlyReportEvent = EventBase &
  (
    | {
        kind: 'battle';
        orderId: string;
        sourceId: string;
        targetId: string;
        attackerId: string;
        defenderId: string | null;
        outcome: 'captured' | 'held';
        days: number;
        involvesPlayer: boolean;
        bordersPlayer: boolean;
      }
    | { kind: 'allianceExpired'; a: string; b: string; involvesPlayer: boolean }
    | { kind: 'borderRecruitment'; cityId: string; factionId: string; troops: number }
  );

export interface MonthlyReport {
  turn: number;
  year: number;
  month: number;
  partial: boolean;
  events: MonthlyReportEvent[];
  omitted: number;
  // Includes omitted keys so trimming cannot duplicate a later repeated event.
  // A scenario month has at most 52 army, 15 alliance, and 144 city/faction keys.
  seenKeys: string[];
}
export interface MonthlyReports {
  pending: MonthlyReport | null;
  latest: MonthlyReport | null;
}
export type NewMonthlyReportEvent = MonthlyReportEvent extends infer Event
  ? Event extends MonthlyReportEvent
    ? Omit<Event, 'key' | 'sequence'>
    : never
  : never;
export const REPORT_EVENT_LIMIT = 128;
export const REPORT_KEY_LIMIT = 256;

export function reportPriority(event: MonthlyReportEvent): number {
  if (event.kind === 'battle') {
    if (event.involvesPlayer) return 0;
    if (event.outcome === 'captured') return event.bordersPlayer ? 1 : 3;
  }
  if (event.kind === 'allianceExpired' && event.involvesPlayer) return 2;
  if (event.kind === 'borderRecruitment') return 4;
  return 99;
}

export function reportHighlights(report: MonthlyReport): MonthlyReportEvent[] {
  return [...report.events]
    .filter((event) => reportPriority(event) < 99)
    .sort((a, b) => reportPriority(a) - reportPriority(b) || a.sequence - b.sequence)
    .slice(0, 5);
}

export function reportEventCity(event: MonthlyReportEvent): string | null {
  return event.kind === 'battle'
    ? event.targetId
    : event.kind === 'borderRecruitment'
      ? event.cityId
      : null;
}

export function reportEventKey(event: NewMonthlyReportEvent): string {
  switch (event.kind) {
    case 'battle':
      return `battle:${event.orderId}`;
    case 'allianceExpired':
      return `alliance:${[event.a, event.b].sort().join(':')}`;
    case 'borderRecruitment':
      return `recruit:${event.factionId}:${event.cityId}`;
  }
}

export function beginMonthlyReport(state: GameState, partial = false): MonthlyReport {
  const report: MonthlyReport = {
    turn: state.turn,
    year: state.year,
    month: state.month,
    partial,
    events: [],
    omitted: 0,
    seenKeys: [],
  };
  state.reports.pending = report;
  return report;
}

/** Lazily collect only future observations when resuming an old interrupted month. */
export function ensureMonthlyReport(state: GameState): MonthlyReport {
  return state.reports.pending ?? beginMonthlyReport(state, true);
}

export function recordMonthlyEvent(state: GameState, incoming: NewMonthlyReportEvent): void {
  const report = ensureMonthlyReport(state);
  const key = reportEventKey(incoming);
  const previous = report.events.find((event) => event.key === key);
  if (report.seenKeys.includes(key)) {
    if (previous?.kind === 'borderRecruitment' && incoming.kind === 'borderRecruitment')
      previous.troops += incoming.troops;
    return;
  }
  // This is above the scenario's possible distinct monthly event count.
  if (report.seenKeys.length >= REPORT_KEY_LIMIT)
    throw new Error('Monthly report event capacity exceeded.');
  const event = { ...incoming, key, sequence: report.seenKeys.length } as MonthlyReportEvent;
  report.seenKeys.push(key);
  report.events.push(event);
  if (report.events.length > REPORT_EVENT_LIMIT) {
    report.events.sort((a, b) => reportPriority(a) - reportPriority(b) || a.sequence - b.sequence);
    report.events.length = REPORT_EVENT_LIMIT;
    report.events.sort((a, b) => a.sequence - b.sequence);
  }
  report.omitted = report.seenKeys.length - report.events.length;
}

export function publishMonthlyReport(state: GameState): void {
  if (state.reports.pending) {
    state.reports.latest = state.reports.pending;
    state.reports.pending = null;
  }
}

/** Historical border flags are validated as flags, not recomputed from today's map. */
export function validateReports(state: GameState): string | null {
  if (!state.reports || typeof state.reports !== 'object') return 'Invalid monthly report data.';
  const integer = (value: number, low: number, high = Number.MAX_SAFE_INTEGER) =>
    Number.isSafeInteger(value) && value >= low && value <= high;
  const cityIds = new Set(state.cities.map((city) => city.id));
  const factions = new Set(FACTIONS.map((faction) => faction.id));
  for (const [slot, report] of Object.entries(state.reports)) {
    if (!['pending', 'latest'].includes(slot)) return 'Invalid monthly report data.';
    if (report === null) continue;
    if (
      !report ||
      !integer(report.turn, 0, state.turn) ||
      !integer(report.year, 190, 9999) ||
      !integer(report.month, 1, 12) ||
      report.year * 12 + report.month !== 190 * 12 + 1 + report.turn ||
      typeof report.partial !== 'boolean' ||
      !integer(report.omitted, 0, REPORT_KEY_LIMIT) ||
      !Array.isArray(report.events) ||
      report.events.length > REPORT_EVENT_LIMIT ||
      !Array.isArray(report.seenKeys) ||
      report.seenKeys.length > REPORT_KEY_LIMIT ||
      report.seenKeys.some((key: string) => typeof key !== 'string' || !key || key.length > 220) ||
      new Set(report.seenKeys).size !== report.seenKeys.length ||
      report.seenKeys.length !== report.events.length + report.omitted ||
      report.events.length !== Math.min(report.seenKeys.length, REPORT_EVENT_LIMIT)
    )
      return 'Invalid monthly report data.';
    if (
      (slot === 'pending' &&
        (state.phase !== 'battle' || !state.resolution || report.turn !== state.turn)) ||
      (slot === 'latest' && report.turn !== state.turn - 1)
    )
      return 'The monthly report date is inconsistent.';
    for (const key of report.seenKeys) {
      const [kind, first, second, ...extra] = key.split(':');
      const orderNumber = kind === 'battle' ? /^army-([1-9]\d*)$/.exec(first ?? '')?.[1] : null;
      if (
        extra.length ||
        (kind === 'battle'
          ? second !== undefined ||
            !orderNumber ||
            !integer(Number(orderNumber), 1, state.nextId - 1)
          : kind === 'alliance'
            ? !first || !second || !factions.has(first) || !factions.has(second) || first >= second
            : kind === 'recruit'
              ? !first ||
                !second ||
                !factions.has(first) ||
                first === state.playerFactionId ||
                !cityIds.has(second)
              : true)
      )
        return 'Invalid or duplicate monthly report event.';
      if (slot === 'pending' && kind === 'battle') {
        const index = state.resolution!.queue.findIndex((order) => order.id === first);
        if (index < 0 || index >= state.resolution!.index) return 'Invalid monthly battle report.';
      }
    }
    const keys = new Set<string>();
    let lastSequence = -1;
    for (const event of report.events) {
      if (
        !event ||
        !integer(event.sequence, 0, report.seenKeys.length - 1) ||
        event.sequence <= lastSequence ||
        keys.has(event.key) ||
        report.seenKeys[event.sequence] !== event.key ||
        !['battle', 'allianceExpired', 'borderRecruitment'].includes(event.kind) ||
        reportEventKey(event) !== event.key
      )
        return 'Invalid or duplicate monthly report event.';
      keys.add(event.key);
      lastSequence = event.sequence;
      if (event.kind === 'battle') {
        const source = state.cities.find((city) => city.id === event.sourceId);
        const orderNumber = /^army-([1-9]\d*)$/.exec(event.orderId)?.[1];
        if (
          !orderNumber ||
          !integer(Number(orderNumber), 1, state.nextId - 1) ||
          !source?.neighbors.includes(event.targetId) ||
          !factions.has(event.attackerId) ||
          (event.defenderId !== null && !factions.has(event.defenderId)) ||
          event.attackerId === event.defenderId ||
          !['captured', 'held'].includes(event.outcome) ||
          !integer(event.days, 1, 30) ||
          typeof event.involvesPlayer !== 'boolean' ||
          event.involvesPlayer !==
            [event.attackerId, event.defenderId].includes(state.playerFactionId) ||
          typeof event.bordersPlayer !== 'boolean' ||
          (event.outcome === 'held' && event.bordersPlayer)
        )
          return 'Invalid monthly battle report.';
        if (slot === 'pending') {
          const order = state.resolution!.queue.find((order) => order.id === event.orderId)!;
          if (
            order.sourceId !== event.sourceId ||
            order.targetId !== event.targetId ||
            order.factionId !== event.attackerId
          )
            return 'Invalid monthly battle report.';
        }
      } else if (event.kind === 'allianceExpired') {
        if (
          !factions.has(event.a) ||
          !factions.has(event.b) ||
          event.a === event.b ||
          typeof event.involvesPlayer !== 'boolean' ||
          event.involvesPlayer !== [event.a, event.b].includes(state.playerFactionId)
        )
          return 'Invalid monthly alliance report.';
      } else if (
        !cityIds.has(event.cityId) ||
        !factions.has(event.factionId) ||
        event.factionId === state.playerFactionId ||
        !integer(event.troops, 1, 52 * 825)
      )
        return 'Invalid monthly recruitment report.';
    }
  }
  if (!Object.hasOwn(state.reports, 'pending') || !Object.hasOwn(state.reports, 'latest'))
    return 'Invalid monthly report data.';
  return null;
}
