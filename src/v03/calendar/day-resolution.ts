import {
  DAYS_PER_YEAR,
  advanceJourneyOneDay,
  calendarDateAt,
  type Journey,
  type ScheduledEvent,
} from './index';

export type DailyPhase = 'battles' | 'journeys' | 'date' | 'month-settlement';

/** Persisted cursor that prevents a manual multi-battle day from advancing twice. */
export interface DayResolution {
  processingAbsoluteDay: number;
  phase: DailyPhase;
  battleIds: string[];
  completedBattleIds: string[];
  /** Stable movement identity captured at daybreak; journeys created or replaced later wait until tomorrow. */
  daybreakJourneySignatures: Record<string, string>;
  arrivals: string[];
  /** Prevents duplicate city service accounting if a date-phase cursor is resumed. */
  cityServiceAccounted?: boolean;
  settledMonth?: { year: number; month: number };
}

export interface StrategicTimeline {
  startYear: number;
  absoluteDay: number;
  journeys: Journey[];
  dayResolution: DayResolution | null;
  events: ScheduledEvent[];
}

export function createStrategicTimeline(startYear: number): StrategicTimeline {
  if (!Number.isInteger(startYear)) throw new Error('startYear must be an integer.');
  return { startYear, absoluteDay: 0, journeys: [], dayResolution: null, events: [] };
}

export function beginDayResolution(
  timeline: StrategicTimeline,
  battleIdsAtDaybreak: readonly string[],
): StrategicTimeline {
  if (timeline.dayResolution) throw new Error('A strategic day is already being resolved.');
  const battleIds = [...new Set(battleIdsAtDaybreak)].sort((a, b) => a.localeCompare(b));
  return {
    ...timeline,
    dayResolution: {
      processingAbsoluteDay: timeline.absoluteDay,
      phase: battleIds.length > 0 ? 'battles' : 'journeys',
      battleIds,
      completedBattleIds: [],
      daybreakJourneySignatures: Object.fromEntries(
        timeline.journeys.map((journey) => [journey.id, journeyMovementSignature(journey)]),
      ),
      arrivals: [],
      cityServiceAccounted: false,
    },
  };
}

function journeyMovementSignature(journey: Journey): string {
  return JSON.stringify({
    executionId: journey.executionId,
    sourceCityId: journey.sourceCityId,
    destinationCityId: journey.destinationCityId,
    status: journey.status,
    departedAbsoluteDay: journey.departedAbsoluteDay,
    elapsedDays: journey.elapsedDays,
    segmentProgressKm: journey.segmentProgressKm,
    segmentWaitDays: journey.segmentWaitDays,
  });
}

export function completeBattleDay(
  timeline: StrategicTimeline,
  battleId: string,
): StrategicTimeline {
  const resolution = timeline.dayResolution;
  if (!resolution || resolution.phase !== 'battles')
    throw new Error('No battle day is waiting for completion.');
  if (!resolution.battleIds.includes(battleId))
    throw new Error(`Battle ${battleId} was not present at daybreak.`);
  if (resolution.completedBattleIds.includes(battleId))
    throw new Error(`Battle ${battleId} already completed today.`);
  const completedBattleIds = [...resolution.completedBattleIds, battleId].sort((a, b) =>
    a.localeCompare(b),
  );
  return {
    ...timeline,
    dayResolution: {
      ...resolution,
      completedBattleIds,
      phase: completedBattleIds.length === resolution.battleIds.length ? 'journeys' : 'battles',
    },
  };
}

export function progressJourneysForDay(timeline: StrategicTimeline): StrategicTimeline {
  const resolution = timeline.dayResolution;
  if (!resolution || resolution.phase !== 'journeys')
    throw new Error('Battles must finish before journeys progress.');
  if (resolution.completedBattleIds.length !== resolution.battleIds.length) {
    throw new Error('Every daybreak battle must resolve before journeys progress.');
  }
  const arrivals: string[] = [];
  const journeys = timeline.journeys.map((journey) => {
    const signatureAtDaybreak = resolution.daybreakJourneySignatures[journey.id];
    if (
      journey.departedAbsoluteDay > timeline.absoluteDay ||
      signatureAtDaybreak === undefined ||
      signatureAtDaybreak !== journeyMovementSignature(journey)
    ) {
      return journey;
    }
    const result = advanceJourneyOneDay(journey);
    if (result.arrived && journey.status !== 'delivered') arrivals.push(journey.id);
    return result.journey;
  });
  return {
    ...timeline,
    journeys,
    dayResolution: {
      ...resolution,
      phase: 'date',
      arrivals: arrivals.sort((a, b) => a.localeCompare(b)),
    },
  };
}

/** Move the single world date once after the daybreak battle set and journeys finish. */
export function closeStrategicDay(timeline: StrategicTimeline): StrategicTimeline {
  const resolution = timeline.dayResolution;
  if (!resolution || resolution.phase !== 'date')
    throw new Error('Journeys must finish before the world date advances.');
  const previousDate = calendarDateAt(timeline.startYear, timeline.absoluteDay);
  const nextAbsoluteDay = timeline.absoluteDay + 1;
  const nextDate = calendarDateAt(timeline.startYear, nextAbsoluteDay);
  const monthChanged = previousDate.year !== nextDate.year || previousDate.month !== nextDate.month;
  return {
    ...timeline,
    absoluteDay: nextAbsoluteDay,
    dayResolution: monthChanged
      ? {
          ...resolution,
          phase: 'month-settlement',
          settledMonth: { year: previousDate.year, month: previousDate.month },
        }
      : null,
  };
}

export function completeMonthSettlement(timeline: StrategicTimeline): StrategicTimeline {
  const resolution = timeline.dayResolution;
  if (!resolution || resolution.phase !== 'month-settlement' || !resolution.settledMonth) {
    throw new Error('No month boundary is waiting for settlement.');
  }
  return { ...timeline, dayResolution: null };
}

/** Add an event deterministically; duplicate event IDs are rejected. */
export function addTimelineEvent(
  timeline: StrategicTimeline,
  event: ScheduledEvent,
): StrategicTimeline {
  if (timeline.events.some((candidate) => candidate.id === event.id)) {
    throw new Error(`Event ${event.id} already exists.`);
  }
  if (!Number.isSafeInteger(event.absoluteDay) || event.absoluteDay < timeline.absoluteDay) {
    throw new Error('An event cannot be scheduled before the current absolute day.');
  }
  return {
    ...timeline,
    events: [...timeline.events, { ...event }].sort(
      (a, b) => a.absoluteDay - b.absoluteDay || a.id.localeCompare(b.id),
    ),
  };
}

export type AdvanceMode = 1 | 10 | 'next-event';

export interface AdvanceHandlers {
  /** Freeze the battles that existed at this day's start; new battles wait until tomorrow. */
  battleIdsAtDaybreak?: (timeline: StrategicTimeline) => readonly string[];
  /** Return `completed: false` to leave a manual battle open and save the day cursor. */
  resolveBattleDay?: (
    timeline: StrategicTimeline,
    battleId: string,
  ) => { timeline: StrategicTimeline; completed: boolean };
  /** Settle city income, monthly policies, refreshes, and reports exactly once. */
  settleMonth?: (timeline: StrategicTimeline, year: number, month: number) => StrategicTimeline;
  /** Accrue one day of city-stationed troop service after battles and journeys. */
  accountCityServiceDay?: (timeline: StrategicTimeline) => StrategicTimeline;
  /** Refresh state-derived events/journeys after a full day and its month settlement. */
  refreshTimeline?: (timeline: StrategicTimeline) => StrategicTimeline;
  /** Safety limit used only by next-event stepping. */
  maxDaysWithoutEvent?: number;
}

export interface AdvanceTimelineResult {
  timeline: StrategicTimeline;
  daysAdvanced: number;
  stoppedFor: 'requested-days' | 'event' | 'manual-battle' | 'step-limit';
  event: ScheduledEvent | null;
}

function firstDuePlayerEvent(timeline: StrategicTimeline): ScheduledEvent | null {
  return (
    timeline.events
      .filter((event) => event.visibleToPlayer && event.absoluteDay <= timeline.absoluteDay)
      .sort((a, b) => a.absoluteDay - b.absoluteDay || a.id.localeCompare(b.id))[0] ?? null
  );
}

function targetForAdvance(
  timeline: StrategicTimeline,
  mode: AdvanceMode,
  maxDays: number,
): { targetDay: number; event: ScheduledEvent | null; capped: boolean } {
  if (mode !== 'next-event')
    return { targetDay: timeline.absoluteDay + mode, event: null, capped: false };
  const next = timeline.events
    .filter((event) => event.visibleToPlayer && event.absoluteDay > timeline.absoluteDay)
    .sort((a, b) => a.absoluteDay - b.absoluteDay || a.id.localeCompare(b.id))[0];
  if (!next) return { targetDay: timeline.absoluteDay + maxDays, event: null, capped: true };
  if (next.absoluteDay > timeline.absoluteDay + maxDays) {
    return { targetDay: timeline.absoluteDay + maxDays, event: null, capped: true };
  }
  return { targetDay: next.absoluteDay, event: next, capped: false };
}

/**
 * Shared 1-day, 10-day, and next-event driver. Each day follows the same sequence:
 * daybreak battle snapshot → each battle once → journey tick → one date increment →
 * one month settlement when needed. A blocked manual battle leaves a serializable cursor.
 */
export function advanceTimeline(
  initial: StrategicTimeline,
  mode: AdvanceMode,
  handlers: AdvanceHandlers = {},
): AdvanceTimelineResult {
  const maxDays = handlers.maxDaysWithoutEvent ?? DAYS_PER_YEAR;
  if (mode === 'next-event' && (!Number.isInteger(maxDays) || maxDays < 1)) {
    throw new Error('maxDaysWithoutEvent must be positive.');
  }
  let timeline = initial;
  let daysAdvanced = 0;
  const dueAtStart = firstDuePlayerEvent(timeline);
  if (dueAtStart?.pause) return { timeline, daysAdvanced, stoppedFor: 'event', event: dueAtStart };
  const target = targetForAdvance(timeline, mode, maxDays);

  while (timeline.absoluteDay < target.targetDay) {
    if (!timeline.dayResolution) {
      timeline = beginDayResolution(timeline, handlers.battleIdsAtDaybreak?.(timeline) ?? []);
    }
    const resolution = timeline.dayResolution!;
    if (resolution.phase === 'battles') {
      for (const battleId of resolution.battleIds) {
        if (timeline.dayResolution!.completedBattleIds.includes(battleId)) continue;
        const result = handlers.resolveBattleDay?.(timeline, battleId);
        if (!result?.completed) {
          timeline = result?.timeline ?? timeline;
          return { timeline, daysAdvanced, stoppedFor: 'manual-battle', event: null };
        }
        timeline = completeBattleDay(result.timeline, battleId);
      }
    }
    if (timeline.dayResolution?.phase === 'journeys') timeline = progressJourneysForDay(timeline);
    if (timeline.dayResolution?.phase === 'date') {
      if (!timeline.dayResolution.cityServiceAccounted) {
        timeline = handlers.accountCityServiceDay?.(timeline) ?? timeline;
        if (!timeline.dayResolution || timeline.dayResolution.phase !== 'date') {
          throw new Error('City service accounting must preserve the active date cursor.');
        }
        timeline = {
          ...timeline,
          dayResolution: { ...timeline.dayResolution, cityServiceAccounted: true },
        };
      }
      timeline = closeStrategicDay(timeline);
    }
    if (timeline.dayResolution?.phase === 'month-settlement') {
      const month = timeline.dayResolution.settledMonth!;
      timeline = handlers.settleMonth
        ? handlers.settleMonth(timeline, month.year, month.month)
        : completeMonthSettlement(timeline);
      if (timeline.dayResolution) {
        throw new Error('Month settlement handler must clear the saved day-resolution cursor.');
      }
    }
    if (handlers.refreshTimeline) timeline = handlers.refreshTimeline(timeline);
    daysAdvanced++;

    const due = firstDuePlayerEvent(timeline);
    if (due && (due.pause || mode === 'next-event')) {
      return { timeline, daysAdvanced, stoppedFor: 'event', event: due };
    }
  }

  if (target.capped && mode === 'next-event') {
    return { timeline, daysAdvanced, stoppedFor: 'step-limit', event: null };
  }
  return { timeline, daysAdvanced, stoppedFor: 'requested-days', event: target.event };
}
