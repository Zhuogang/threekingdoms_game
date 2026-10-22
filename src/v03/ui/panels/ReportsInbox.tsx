import { message } from '../../i18n';
import type { GameplayContext } from '../hooks/gameplayView';
import { eventTier } from '../../campaign/reports';
import { localizedEvent } from '../shared/app-copy-2';
import { Button } from '../kit';
import { displayName } from '../shared/app-copy-3';
import { BattleOutcome } from './BattleOutcome';

export function ReportsInbox({ context }: { context: GameplayContext }) {
  const { state, locale, dispatch, setShowReports } = context;
  const reports = state.events
    .filter((event) => !event.acknowledged && eventTier(state, event) !== 'chronicle')
    .sort((a, b) => b.absoluteDay - a.absoluteDay);
  return (
    <div
      className="v03-inbox-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setShowReports(false);
      }}
    >
      <section
        className="v03-events v03-inbox-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={message(locale, 'ui.reports.114')}
        tabIndex={-1}
        ref={(node) => {
          node?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setShowReports(false);
          if (event.key === 'Tab') {
            const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
            const first = controls[0],
              last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>
            {message(locale, 'ui.reports.114')} ({reports.length})
          </h2>
          <Button aria-label={context.t.close} onClick={() => setShowReports(false)}>
            ×
          </Button>
        </header>
        {reports.map((event) => {
          const copy = localizedEvent(event, state, locale);
          return (
            <article key={event.id} className="v03-event">
              <strong>{copy.title}</strong>
              <small>
                {eventTier(state, event) === 'critical'
                  ? message(locale, 'ui.acknowledgement.required.115')
                  : message(locale, 'ui.notice.116')}
              </small>
              <p>{copy.detail}</p>
              {event.monthlySummary ? (
                <table>
                  <thead>
                    <tr>
                      <th>{context.t.city}</th>
                      <th>{context.t.gold} Δ</th>
                      <th>{context.t.food} Δ</th>
                      <th>{context.t.troops} Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {event.monthlySummary.map((row) => {
                      const city = state.cities.find((entry) => entry.id === row.cityId)!;
                      return (
                        <tr key={row.cityId}>
                          <th>
                            {displayName(city, locale)}
                            {row.shortage ? ' ⚠' : ''}
                            <small>
                              {row.governorActions
                                .map(
                                  (action) =>
                                    context.t[
                                      action === 'develop-farming'
                                        ? 'improveFarm'
                                        : action === 'develop-commerce'
                                          ? 'improveMarket'
                                          : action === 'buy-food'
                                            ? 'buyFood'
                                            : action === 'sell-food'
                                              ? 'sellFood'
                                              : action === 'restore-loyalty'
                                                ? 'security'
                                                : (action as 'search')
                                    ],
                                )
                                .join(', ')}
                            </small>
                          </th>
                          <td>{row.gold}</td>
                          <td>{row.food}</td>
                          <td>{row.troops}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : null}
              {event.battleOutcome ? (
                <BattleOutcome event={event} state={state} locale={locale} />
              ) : null}
              <Button onClick={() => dispatch({ type: 'acknowledgeEvent', eventId: event.id })}>
                {context.t.acknowledge}
              </Button>
            </article>
          );
        })}
        <details>
          <summary>{message(locale, 'ui.world.chronicle.117')}</summary>
          {state.events
            .filter((event) => eventTier(state, event) === 'chronicle')
            .slice(-50)
            .reverse()
            .map((event) => {
              const copy = localizedEvent(event, state, locale);
              return (
                <article key={event.id}>
                  <strong>{copy.title}</strong>
                  <p>{copy.detail}</p>
                </article>
              );
            })}
        </details>
      </section>
    </div>
  );
}
