import { message } from '../../i18n';
import type { GameplayContext } from '../hooks/gameplayView';
import { eventTier } from '../../campaign/reports';
import { localizedEvent } from '../shared/app-copy-2';
import { Button } from '../kit';
import { displayName } from '../shared/app-copy-3';
import { BattleOutcome } from './BattleOutcome';
import { pendingCityGovernance } from '../../governance/conquest';

export function ReportsInbox({ context }: { context: GameplayContext }) {
  const { state, locale, dispatch, setShowReports } = context;
  const reports = state.events
    .filter((event) => !event.acknowledged && eventTier(state, event) !== 'chronicle')
    .sort((a, b) => b.absoluteDay - a.absoluteDay);
  // Decisions first; routine updates can be cleared together.
  const decisions = reports.filter((event) => eventTier(state, event) === 'critical');
  const updates = reports.filter((event) => eventTier(state, event) !== 'critical');
  const reportCityId = (event: (typeof reports)[number]) =>
    event.battleOutcome?.cityId ??
    (event.kind === 'hostileApproach' || event.kind === 'governorChanged' ? event.entityId : null);
  const renderReport = (event: (typeof reports)[number]) => {
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
              {[...event.monthlySummary]
                // Shortages first, so a problem is never buried under routine rows.
                .sort((a, b) => Number(Boolean(b.shortage)) - Number(Boolean(a.shortage)))
                .map((row) => {
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
            <tfoot>
              <tr>
                <th>{message(locale, 'inbox.total')}</th>
                {(['gold', 'food', 'troops'] as const).map((key) => (
                  <td key={key}>{event.monthlySummary!.reduce((sum, row) => sum + row[key], 0)}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        ) : null}
        {event.battleOutcome ? <BattleOutcome event={event} state={state} locale={locale} /> : null}
        {reportCityId(event) ? (
          <Button
            variant="ghost"
            onClick={() => {
              setShowReports(false);
              context.focusCampaignCity(reportCityId(event)!, { pan: true });
            }}
          >
            {message(locale, 'inbox.goToCity')}
          </Button>
        ) : null}
        <Button onClick={() => dispatch({ type: 'acknowledgeEvent', eventId: event.id })}>
          {context.t.acknowledge}
        </Button>
      </article>
    );
  };
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
            {message(locale, 'ui.reports.114')} (
            {new Set([...reports, ...pendingCityGovernance(state)].map((event) => event.id)).size})
          </h2>
          <Button aria-label={context.t.close} onClick={() => setShowReports(false)}>
            ×
          </Button>
        </header>
        {decisions.length || pendingCityGovernance(state).length ? (
          <h3 className="v03-inbox-section">{message(locale, 'inbox.decisions')}</h3>
        ) : null}
        {pendingCityGovernance(state).map((event) => (
          <article className="v03-governance-pending" key={event.id}>
            <strong>
              {locale === 'zh' ? '新城治理待办' : 'City governance pending'} ·{' '}
              {displayName(
                state.cities.find((city) => city.id === event.battleOutcome!.cityId)!,
                locale,
              )}
            </strong>
            <Button
              onClick={() => {
                context.setCityGovernanceEventId(event.id);
                setShowReports(false);
              }}
            >
              {locale === 'zh' ? '安排治理' : 'Choose governance'}
            </Button>
          </article>
        ))}
        {decisions.map(renderReport)}
        {updates.length ? (
          <div className="v03-inbox-section">
            <h3>{message(locale, 'inbox.updates')}</h3>
            <Button
              size="sm"
              onClick={() =>
                dispatch({ type: 'acknowledgeEvents', eventIds: updates.map((event) => event.id) })
              }
            >
              {message(locale, 'inbox.acknowledgeUpdates', { count: updates.length })}
            </Button>
          </div>
        ) : null}
        {updates.map(renderReport)}
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
