import { message } from '../../i18n';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button } from '../kit';
import { displayName } from '../shared/app-copy-3';
import { WorkBudget, type CityWorkAction } from './CityWork';

/** Best executor first: force drives recruitment; intellect drives the other city work. */
export function rankWorkExecutors<T extends { id: string; force: number; intellect: number }>(
  officers: readonly T[],
  action: CityWorkAction,
): T[] {
  return [...officers].sort(
    (a, b) =>
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
  const { locale, directCityOfficers } = context;
  const officers = rankWorkExecutors(directCityOfficers, action);
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
