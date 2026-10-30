import { cityWorkBusyDays, officerBusyDays } from '../../governance/city-actions';
import { message } from '../../i18n';
import type { V03Officer } from '../../types';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button } from '../kit';
import { displayName } from '../shared/app-copy-3';
import { BusyNote } from './CityOfficers';
import { WorkBudget, type CityWorkAction } from './CityWork';

/**
 * Best executor first: officers still busy with another capital task go last; then force
 * drives recruitment and intellect drives the other city work.
 */
export function rankWorkExecutors<
  T extends Pick<V03Officer, 'id' | 'force' | 'intellect' | 'cityWork'>,
>(officers: readonly T[], action: CityWorkAction, absoluteDay: number): T[] {
  const busy = (officer: T) =>
    cityWorkBusyDays(action) > 0 && officerBusyDays({ absoluteDay }, officer) > 0;
  return [...officers].sort(
    (a, b) =>
      Number(busy(a)) - Number(busy(b)) ||
      (action === 'recruit' ? b.force - a.force : b.intellect - a.intellect) ||
      a.id.localeCompare(b.id),
  );
}

export function CityWorkAssignment({
  context,
  action,
  onSelect,
}: {
  context: GameplayContext;
  action: CityWorkAction;
  onSelect: (id: string) => void;
}) {
  const { locale, directCityOfficers, state } = context;
  const officers = rankWorkExecutors(directCityOfficers, action, state.absoluteDay);
  return (
    <section className="v03-work-assignment">
      <p className="v03-step-intro">{message(locale, 'flow.assignWorkHint')}</p>
      <WorkBudget context={context} />
      <div className="v03-roster-list">
        {officers.map((officer, index) => (
          <Button
            className="v03-step-choice"
            key={officer.id}
            aria-label={displayName(officer, locale)}
            disabled={cityWorkBusyDays(action) > 0 && officerBusyDays(state, officer) > 0}
            onClick={() => onSelect(officer.id)}
          >
            <span>
              <strong>{displayName(officer, locale)}</strong>
              <small>
                {message(locale, 'ui.force.53')} {officer.force} ·{' '}
                {message(locale, 'ui.intellect.54')} {officer.intellect}
                {index === 0 && ['recruit', 'search', 'security'].includes(action)
                  ? ` · ${message(locale, 'flow.recommended')}`
                  : ''}
              </small>
              <BusyNote context={context} officer={officer} />
            </span>
            <span aria-hidden>→</span>
          </Button>
        ))}
      </div>
      {!officers.length ? (
        <p className="v03-action-reason">{context.capitalReason(action)}</p>
      ) : null}
    </section>
  );
}
