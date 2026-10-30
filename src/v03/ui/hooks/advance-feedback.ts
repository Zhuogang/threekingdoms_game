import { message } from '../../i18n';
import { eventTier, isCriticalReport } from '../../campaign/reports';
import type { V03ActionResult } from '../../commands';
import type { V03GameState } from '../../types';
import type { V03Locale } from '../../wiki';
import { absoluteDateLabel, displayName } from '../shared/app-copy-3';
import { localizedEvent } from '../shared/legacy-events';

/**
 * Say what stopped the clock and when, count new reports from a longer skip, and ask the
 * caller to open the inbox when a report needs attention.
 */
export function explainAdvance(
  previous: V03GameState,
  next: V03GameState,
  advance: NonNullable<V03ActionResult['advance']>,
  locale: V03Locale,
): { text: string; openReports: boolean } {
  const date = absoluteDateLabel(next.startYear, next.absoluteDay, locale);
  const newReports = next.events.filter(
    (event) =>
      eventTier(next, event) !== 'chronicle' && !previous.events.some((old) => old.id === event.id),
  ).length;
  const suffix =
    advance.daysAdvanced > 1 && newReports > 0
      ? message(locale, 'feedback.advance.newReports', { p0: newReports })
      : '';
  const arrival = advance.eventId?.startsWith('arrival:')
    ? previous.journeys.find((journey) => `arrival:${journey.id}` === advance.eventId)
    : undefined;
  if (arrival) {
    const city = next.cities.find((entry) => entry.id === arrival.destinationCityId);
    return {
      text:
        message(locale, 'feedback.advance.arrival', {
          p0: date,
          p1: city ? displayName(city, locale) : arrival.destinationCityId,
        }) + suffix,
      openReports: false,
    };
  }
  const event = advance.eventId
    ? next.events.find((entry) => entry.id === advance.eventId)
    : undefined;
  if (event)
    return {
      text:
        message(locale, 'feedback.advance.event', {
          p0: date,
          p1: localizedEvent(event, next, locale).title,
        }) + suffix,
      openReports: isCriticalReport(next, event) || event.kind === 'hostileApproach',
    };
  if (advance.stoppedFor === 'manual-battle' || advance.stoppedFor === 'active-battle')
    return {
      text: message(locale, 'feedback.advance.battle', { p0: date }) + suffix,
      // Auto-command hands a losing battle back with a report (play-feel PF-BA-06).
      openReports: next.events.some(
        (entry) =>
          isCriticalReport(next, entry) && !previous.events.some((old) => old.id === entry.id),
      ),
    };
  if (advance.stoppedFor === 'step-limit')
    return {
      text: message(locale, 'feedback.advance.quiet', { p0: advance.daysAdvanced, p1: date }),
      openReports: false,
    };
  if (next.events.some((entry) => isCriticalReport(next, entry)))
    return {
      text: message(locale, 'feedback.advance.report', { p0: date }) + suffix,
      openReports: true,
    };
  return {
    text:
      (advance.daysAdvanced === 1
        ? message(locale, 'feedback.advance.oneDay', { p0: date })
        : message(locale, 'feedback.advance.days', { p0: advance.daysAdvanced, p1: date })) +
      suffix,
    openReports: false,
  };
}
