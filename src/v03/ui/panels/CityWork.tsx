import { useMemo, useRef } from 'react';
import { applyV03CityAction } from '../../governance/city-actions';
import { message } from '../../i18n';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button, Field, Input, StatGrid } from '../kit';
import { displayName } from '../shared/app-copy-3';

export const cityWorkActions = [
  'develop-farming',
  'develop-commerce',
  'search',
  'recruit',
  'security',
  'feast',
  'buy-food',
  'sell-food',
  'relieve',
] as const;
export const officerWorkActions = ['assign-troops', 'train', 'reward', 'equip'] as const;
export type CityWorkAction = (typeof cityWorkActions)[number] | (typeof officerWorkActions)[number];
export const isCityWork = (action: CityWorkAction) =>
  cityWorkActions.some((entry) => entry === action);

export function workLabel(context: GameplayContext, action: CityWorkAction) {
  const { t } = context;
  return {
    'develop-farming': t.improveFarm,
    'develop-commerce': t.improveMarket,
    search: t.search,
    recruit: t.recruit,
    security: t.security,
    feast: t.feast,
    'buy-food': t.buyFood,
    'sell-food': t.sellFood,
    relieve: t.relievePeople,
    'assign-troops': t.assignTroops,
    train: t.train,
    reward: t.rewardOfficer,
    equip: t.issueFineArms,
  }[action];
}

export function WorkBudget({ context }: { context: GameplayContext }) {
  return (
    <p className="v03-work-budget">
      {context.t.workRemaining}:{' '}
      <strong>
        {context.directWorkRemaining}/{context.directWorkQuota}
      </strong>
    </p>
  );
}

export function CityWork({
  context,
  action,
  officerId,
  onComplete,
  onChangeOfficer,
}: {
  context: GameplayContext;
  action: CityWorkAction;
  officerId?: string;
  onComplete: () => void;
  onChangeOfficer?: () => void;
}) {
  const { state, selectedCity: city, locale, t } = context;
  const officer = state.officers.find((entry) => entry.id === officerId);
  const amount = officer ? (context.troopAssignments[officer.id] ?? officer.troops) : undefined;
  const input = { cityId: city?.id ?? '', action, officerId, amount };
  const availability = context.capitalAvailability(action, officerId, amount);
  const submitted = useRef(false);
  // The existing pure command effect returns a new state. Preview deterministic changes only;
  // searches remain unknown until the player confirms, and no preview is dispatched or saved.
  const preview = useMemo(
    () =>
      city && action !== 'search'
        ? applyV03CityAction(state, {
            cityId: city!.id,
            action,
            officerId,
            amount,
          })
        : null,
    [state, city?.id, action, officerId, amount],
  );
  if (!city) return null;
  const afterCity = preview?.ok ? preview.state.cities.find((entry) => entry.id === city.id) : null;
  const afterOfficer =
    preview?.ok && officer ? preview.state.officers.find((entry) => entry.id === officer.id) : null;
  const changes: { label: string; value: string }[] = [];
  const add = (label: string, before: number | string, after: number | string | undefined) => {
    if (after !== undefined && before !== after)
      changes.push({
        label,
        value: `${before.toLocaleString()} → ${after.toLocaleString()}`,
      });
  };
  if (afterCity) {
    add(t.gold, city.gold, afterCity.gold);
    add(t.food, city.food, afterCity.food);
    add(message(locale, 'ui.reserve.soldiers.93'), city.reserve, afterCity.reserve);
    add(message(locale, 'ui.population.94'), city.population, afterCity.population);
    add(t.loyalty, city.loyalty, afterCity.loyalty);
    add(message(locale, 'flow.farming'), city.farming, afterCity.farming);
    add(message(locale, 'flow.commerce'), city.commerce, afterCity.commerce);
  }
  if (officer && afterOfficer) {
    add(t.troops, officer.troops, afterOfficer.troops);
    add(message(locale, 'ui.loyalty.52'), officer.loyalty, afterOfficer.loyalty);
    add(message(locale, 'ui.force.53'), officer.force, afterOfficer.force);
    add(message(locale, 'ui.intellect.54'), officer.intellect, afterOfficer.intellect);
    add(message(locale, 'ui.experience.55'), officer.experience, afterOfficer.experience);
    add(message(locale, 'ui.level.56'), officer.level, afterOfficer.level);
  }
  return (
    <section className="v03-work-detail" aria-label={workLabel(context, action)}>
      <p className="v03-step-intro">
        {officer ? displayName(officer, locale) : displayName(city, locale)} ·{' '}
        {message(locale, 'flow.reviewWork')}
      </p>
      <WorkBudget context={context} />
      {isCityWork(action) && officer ? (
        <div className="v03-row v03-assigned-officer">
          <strong>
            {message(locale, 'flow.executor')}: {displayName(officer, locale)}
          </strong>
          <Button variant="ghost" onClick={onChangeOfficer}>
            {message(locale, 'flow.changeExecutor')}
          </Button>
        </div>
      ) : null}
      {action === 'assign-troops' && officer ? (
        <>
          <StatGrid
            values={[
              { label: t.troops, value: officer.troops.toLocaleString() },
              {
                label: message(locale, 'ui.reserve.soldiers.93'),
                value: city.reserve.toLocaleString(),
              },
            ]}
          />
          <Field label={t.assignmentAmount} hint={message(locale, 'flow.assignmentHint')}>
            <Input
              type="number"
              min={0}
              max={10000}
              step={100}
              aria-label={`${t.assignmentAmount}: ${displayName(officer, locale)}`}
              value={amount}
              onChange={(event) =>
                context.setTroopAssignments((current) => ({
                  ...current,
                  [officer.id]: Number(event.target.value),
                }))
              }
            />
          </Field>
        </>
      ) : null}
      {changes.length ? <StatGrid values={changes} /> : null}
      {action === 'search' || action === 'feast' || action === 'equip' || action === 'recruit' ? (
        <p>{message(locale, `flow.workHint.${action}`)}</p>
      ) : null}
      <p className="v03-muted">{message(locale, 'flow.workCost')}</p>
      {!availability.ok ? (
        <p className="v03-action-reason" role="status">
          {context.capitalReason(action, officerId, amount)}
        </p>
      ) : null}
      <Button
        variant="primary"
        disabled={!officer || !availability.ok}
        onClick={() => {
          if (submitted.current) return;
          submitted.current = true;
          const result = context.dispatch({ type: 'cityAction', ...input });
          if (result?.ok) onComplete();
          else submitted.current = false;
        }}
      >
        {message(locale, 'flow.confirmWork')}
      </Button>
    </section>
  );
}
