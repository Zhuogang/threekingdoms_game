import type { TroopType } from '../../types';
import { TROOP_TYPES } from '../../campaign/troop-experience';
import { troopName } from '../../rendering/presentation';
import { recruitmentQuote } from '../../campaign/recruitment';
import { availableReserveTroops } from '../../campaign/personnel';
import { useMemo, useRef, useState } from 'react';
import {
  applyV03CityAction,
  cityActionWorkCost,
  cityWorkRefreshDays,
} from '../../governance/city-actions';
import { message } from '../../i18n';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button, Field, Input, StatGrid, Select } from '../kit';
import { displayName } from '../shared/app-copy-3';
import { ReinforcementPreview, TroopProgress } from './TroopProgress';

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
      {' · '}
      {message(context.locale, 'flow.workRefresh', { days: cityWorkRefreshDays(context.state) })}
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
  const [troopType, setTroopType] = useState<TroopType>('infantry');
  const officer = state.officers.find((entry) => entry.id === officerId);
  const amount = officer ? (context.troopAssignments[officer.id] ?? officer.troops) : undefined;
  const input = { cityId: city?.id ?? '', action, officerId, amount, troopType };
  const availability = context.capitalAvailability(action, officerId, amount, troopType);
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
            troopType,
          })
        : null,
    [state, city?.id, action, officerId, amount, troopType],
  );
  if (!city) return null;
  const afterCity = preview?.ok ? preview.state.cities.find((entry) => entry.id === city.id) : null;
  const afterOfficer =
    preview?.ok && officer ? preview.state.officers.find((entry) => entry.id === officer.id) : null;
  const changes: { label: string; value: string }[] = [];
  const add = (
    label: string,
    before: number | string,
    after: number | string | undefined,
    showUnchanged = false,
  ) => {
    if (after !== undefined && (before !== after || showUnchanged))
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
    add(message(locale, 'ui.force.53'), officer.force, afterOfficer.force, action === 'train');
    add(message(locale, 'ui.intellect.54'), officer.intellect, afterOfficer.intellect);
    add(
      message(locale, 'ui.experience.55'),
      officer.experience,
      afterOfficer.experience,
      action === 'train',
    );
    add(message(locale, 'ui.level.56'), officer.level, afterOfficer.level);
  }
  return (
    <section className="v03-work-detail" aria-label={workLabel(context, action)}>
      <p className="v03-step-intro">
        {officer ? displayName(officer, locale) : displayName(city, locale)} ·{' '}
        {message(locale, 'flow.reviewWork')}
      </p>
      {/* Free preparations do not touch the budget, so do not show it beside them. */}
      {cityActionWorkCost(action) ? <WorkBudget context={context} /> : null}
      {action === 'recruit' ? (
        <>
          <Field label={locale === 'zh' ? '招募兵种' : 'Recruit troop type'}>
            <Select
              aria-label={locale === 'zh' ? '招募兵种' : 'Recruit troop type'}
              value={troopType}
              onChange={(event) => setTroopType(event.target.value as TroopType)}
            >
              {TROOP_TYPES.map((type) => (
                <option key={type} value={type}>
                  {troopName(type, locale)}
                </option>
              ))}
            </Select>
          </Field>
          {officer ? (
            <StatGrid
              values={[
                {
                  label: locale === 'zh' ? '预计招募' : 'Soldiers recruited',
                  value: recruitmentQuote(city, officer.force, troopType).troops.toLocaleString(),
                },
                {
                  label: locale === 'zh' ? '招募费用' : 'Recruitment gold',
                  value: recruitmentQuote(city, officer.force, troopType).gold.toLocaleString(),
                },
              ]}
            />
          ) : null}
        </>
      ) : null}
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
          <p>{locale === 'zh' ? '同兵种待命兵池' : 'Matching reserve pool'}</p>
          <TroopProgress
            unit={{ ...city.reservePools[officer.troopType], troopType: officer.troopType }}
            locale={locale}
          />
          <StatGrid
            values={[
              { label: t.troops, value: officer.troops.toLocaleString() },
              {
                label: message(locale, 'ui.reserve.soldiers.93'),
                value: `${troopName(officer.troopType, locale)} ${availableReserveTroops(state, city.id, officer.troopType).toLocaleString()}`,
              },
            ]}
          />
          <Field label={t.assignmentAmount} hint={message(locale, 'flow.assignmentHint')}>
            <Input
              type="number"
              min={0}
              max={10000 - officer.wounded}
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
      {action === 'assign-troops' && officer && afterOfficer ? (
        <ReinforcementPreview before={officer} after={afterOfficer} locale={locale} />
      ) : null}
      {changes.length ? <StatGrid values={changes} /> : null}
      {action === 'search' || action === 'feast' || action === 'equip' || action === 'recruit' ? (
        <p>{message(locale, `flow.workHint.${action}`)}</p>
      ) : null}
      <p className="v03-muted">
        {message(locale, cityActionWorkCost(action) ? 'flow.workCost' : 'flow.noWorkCost')}
      </p>
      {!availability.ok ? (
        <p className="v03-action-reason" role="status">
          {context.capitalReason(action, officerId, amount, troopType)}
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
