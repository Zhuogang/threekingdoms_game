import { message } from '../../i18n';
import type { V03DomainEvent, V03GameState } from '../../types';
import type { V03Locale } from '../../wiki';
import { Button } from '../kit';
import { displayName, absoluteDateLabel } from '../shared/app-copy-3';
import { formatEvent } from '../../i18n/events';

export function BattleOutcome({
  event,
  state,
  locale,
  onClose,
}: {
  event: V03DomainEvent;
  state: V03GameState;
  locale: V03Locale;
  onClose?: () => void;
}) {
  const report = event.battleOutcome;
  if (!report) return null;
  const names = (ids: string[]) =>
    ids
      .map((id) => {
        const officer = state.officers.find((entry) => entry.id === id);
        return officer ? displayName(officer, locale) : '—';
      })
      .join(', ') || '—';
  const copy = formatEvent(event, state, locale)!;
  const content = (
    <>
      <h2>{copy.title}</h2>
      <p>{copy.detail}</p>
      <table>
        <thead>
          <tr>
            <th>{message(locale, 'ui.army.33')}</th>
            <th>{message(locale, 'ui.starting.34')}</th>
            <th>{message(locale, 'ui.surviving.35')}</th>
            <th>{message(locale, 'ui.casualties.36')}</th>
          </tr>
        </thead>
        <tbody>
          {(['attacker', 'defender'] as const).map((side) => (
            <tr key={side}>
              <th>
                {side === 'attacker'
                  ? message(locale, 'ui.attacker.37')
                  : message(locale, 'ui.defender.38')}
              </th>
              <td>{report[side].startingTroops.toLocaleString()}</td>
              <td>{report[side].survivingTroops.toLocaleString()}</td>
              <td>
                {(report[side].startingTroops - report[side].survivingTroops).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(['attacker', 'defender'] as const).map((side) => (
        <div key={side}>
          <h3>
            {side === 'attacker'
              ? message(locale, 'ui.attacking.officers.39')
              : message(locale, 'ui.defending.officers.40')}
          </h3>
          <p>
            {message(locale, 'ui.returned.41')}: {names(report[side].returned)}
          </p>
          <p>
            {message(locale, 'ui.captured.42')}: {names(report[side].captured)}
          </p>
          <p>
            {message(locale, 'ui.killed.43')}: {names(report[side].killed)}
          </p>
        </div>
      ))}
      <p>
        {message(locale, 'ui.loot.44')}: {message(locale, 'ui.gold.45')} {report.loot.gold} ·{' '}
        {message(locale, 'ui.food.46')} {report.loot.food}
      </p>
      {report.returnArrivalDay !== null ? (
        <p>
          {message(locale, 'ui.return.eta.47')}:{' '}
          {absoluteDateLabel(state.startYear, report.returnArrivalDay, locale)}
        </p>
      ) : null}
      {onClose ? (
        <Button variant="primary" onClick={onClose}>
          {message(locale, 'ui.return.to.campaign.48')}
        </Button>
      ) : null}
    </>
  );
  return onClose ? (
    <div className="v03-modal-backdrop">
      <section
        className="v03-outcome-modal"
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        tabIndex={-1}
        ref={(node) => {
          node?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            event.preventDefault();
            event.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();
          }
        }}
      >
        {content}
      </section>
    </div>
  ) : (
    <div className="v03-outcome">{content}</div>
  );
}
