import { useState } from 'react';
import {
  Axe,
  ChevronDown,
  Flag,
  Flame,
  Handshake,
  ScrollText,
  Shield,
  TriangleAlert,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { factionById } from '../content/scenario';
import type { GameState, MonthlyReportEvent } from '../game/types';
import { reportEventCity, reportHighlights } from '../game/reports';
import { useI18n } from '../i18n';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function MonthlyReport({
  state,
  onFocusCity,
}: {
  state: GameState;
  onFocusCity: (id: string) => void;
}) {
  const { t, tx } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const report = state.reports.latest;
  if (!report) return null;
  const highlights = reportHighlights(report);
  const events = expanded ? report.events : highlights;
  const cityName = (id: string) => state.cities.find((city) => city.id === id)?.name ?? id;
  const officerName = (id: string) => state.officers.find((o) => o.id === id)?.name ?? id;
  const factionName = (id: string | null) => factionById(id)?.name ?? 'The garrison';
  function description(event: MonthlyReportEvent) {
    switch (event.kind) {
      case 'battle':
        return t(
          event.outcome === 'captured'
            ? '{attacker} captured {city} from {defender} after {days} days.'
            : '{defender} held {city} against {attacker} after {days} days.',
          {
            attacker: factionName(event.attackerId),
            defender: factionName(event.defenderId),
            city: cityName(event.targetId),
            days: event.days,
          },
        );
      case 'allianceExpired':
        return t('The alliance between {first} and {second} expired.', {
          first: factionName(event.a),
          second: factionName(event.b),
        });
      case 'borderRecruitment':
        return t('{faction} recruited {count} reserves in {city}, near your borders.', {
          faction: factionName(event.factionId),
          count: new Intl.NumberFormat().format(event.troops),
          city: cityName(event.cityId),
        });
      case 'raid':
        return t(
          event.fought
            ? '{faction} raided {city} after a fight, seizing {gold} gold and {food} food.'
            : '{faction} raided {city} unopposed, seizing {gold} gold and {food} food.',
          {
            faction: factionName(event.attackerId),
            city: cityName(event.cityId),
            gold: new Intl.NumberFormat().format(event.gold),
            food: new Intl.NumberFormat().format(event.food),
          },
        );
      case 'revolt':
        return t(
          event.independent
            ? 'The people of {city} threw off your rule and the city is now independent.'
            : 'Unrest in {city}: a revolt scattered part of the garrison and treasury.',
          { city: cityName(event.cityId) },
        );
      case 'departure':
        return t(
          event.toFactionId
            ? '{officer} left {from} and joined {to}.'
            : '{officer} left {from} and wandered off.',
          {
            officer: officerName(event.officerId),
            from: factionName(event.fromFactionId),
            to: factionName(event.toFactionId),
          },
        );
      case 'atRisk':
        return t('Officers close to leaving (loyalty under 40): {names}.', {
          names: event.officerIds.map(officerName).join(', '),
        });
      case 'coalition':
        return t(
          event.involvesPlayer
            ? 'The neighboring lords have united against you.'
            : 'The neighboring lords have united against {faction}.',
          { faction: factionName(event.leaderId) },
        );
    }
  }
  return (
    <section className="monthly-report" aria-label={t('Monthly report')}>
      <div className="report-heading">
        <ScrollText size={20} />
        <div>
          <h3>{t('Monthly report')}</h3>
          <span>
            {t('{month} {year}', { month: MONTHS[report.month - 1]!, year: report.year })}
          </span>
        </div>
        <button
          className="text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {t(expanded ? 'Highlights' : 'View report')}
          <ChevronDown size={15} className={expanded ? 'expanded' : ''} />
        </button>
      </div>
      {report.partial && (
        <p className="report-note">
          {t('Partial history: earlier events were not recorded in this older save.')}
        </p>
      )}
      {events.length ? (
        <ol className="report-events">
          {events.map((event) => {
            const cityId = reportEventCity(event);
            const Icon =
              event.kind === 'battle'
                ? event.outcome === 'captured'
                  ? Flag
                  : Shield
                : event.kind === 'allianceExpired' || event.kind === 'coalition'
                  ? Handshake
                  : event.kind === 'raid'
                    ? Axe
                    : event.kind === 'revolt'
                      ? Flame
                      : event.kind === 'departure'
                        ? UserMinus
                        : event.kind === 'atRisk'
                          ? TriangleAlert
                          : UserPlus;
            const body = (
              <>
                <Icon size={17} />
                <span>{description(event)}</span>
              </>
            );
            return (
              <li key={event.key}>
                {cityId ? (
                  <button onClick={() => onFocusCity(cityId)}>{body}</button>
                ) : (
                  <div>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="report-note">{t('A quiet month: no major rival developments to report.')}</p>
      )}
      {report.omitted > 0 && (
        <p className="report-note">
          {t('{count} additional records were omitted from this report.', {
            count: report.omitted,
          })}
        </p>
      )}
      {!expanded && report.events.length > highlights.length && (
        <p className="report-note">
          {t('{count} more events in the full report.', {
            count: report.events.length - highlights.length,
          })}
        </p>
      )}
      <span className="sr-only">{tx('Reports describe committed events, not predictions.')}</span>
    </section>
  );
}
