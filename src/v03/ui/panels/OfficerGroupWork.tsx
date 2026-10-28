import { useEffect, useRef, useState } from 'react';
import {
  applyV03CityAction,
  cityActionWorkCost,
  GOVERNOR_REWARD_GOLD_COST,
  GOVERNOR_EQUIPMENT_GOLD_COST,
  officerGroupActionReason,
  type OfficerGroupAction,
} from '../../governance/city-actions';
import { message } from '../../i18n';
import { OfficerPortrait } from '../../rendering/OfficerPortrait';
import { Button, Input, StatGrid } from '../kit';
import type { GameplayContext } from '../hooks/gameplayView';
import { displayName } from '../shared/app-copy-3';
import { localizeAppMessage } from '../shared/app-copy-2';
import { WorkBudget, workLabel } from './CityWork';

export function OfficerGroupWork({
  context,
  action,
  initialOfficerId,
  onComplete,
}: {
  context: GameplayContext;
  action: OfficerGroupAction;
  initialOfficerId?: string;
  onComplete: () => void;
}) {
  const { state, selectedCity: city, locale } = context;
  const officers = state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === state.playerFactionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city?.id,
    )
    .sort((a, b) => b.intellect - a.intellect || a.id.localeCompare(b.id));
  const eligible = officers.filter((officer) => !officerGroupActionReason(officer, action));
  const [selection, setSelection] = useState<string[]>(() =>
    action === 'feast'
      ? eligible.map((officer) => officer.id)
      : eligible.filter((officer) => officer.id === initialOfficerId).map((officer) => officer.id),
  );
  const eligibleIds = new Set(eligible.map((officer) => officer.id));
  const selected = selection.filter((id) => eligibleIds.has(id));
  const selectedIds = new Set(selected);
  const all = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);
  useEffect(() => {
    if (all.current)
      all.current.indeterminate = selected.length > 0 && selected.length < eligible.length;
  }, [selected.length, eligible.length]);
  if (!city) return null;
  const unitCost =
    action === 'reward'
      ? GOVERNOR_REWARD_GOLD_COST
      : action === 'equip'
        ? GOVERNOR_EQUIPMENT_GOLD_COST
        : 0;
  const preview = applyV03CityAction(state, { cityId: city.id, action, officerIds: selected });
  const goldCost = selected.length * unitCost;
  return (
    <section
      className="v03-work-detail v03-officer-group-work"
      aria-label={workLabel(context, action)}
    >
      <p className="v03-step-intro">{message(locale, `flow.groupHint.${action}`)}</p>
      <WorkBudget context={context} />
      <label className="v03-group-select-all">
        <Input
          ref={all}
          type="checkbox"
          checked={eligible.length > 0 && selected.length === eligible.length}
          disabled={!eligible.length}
          onChange={(event) =>
            setSelection(event.target.checked ? eligible.map((officer) => officer.id) : [])
          }
        />
        <span>{message(locale, 'flow.selectAllEligible')}</span>
      </label>
      <div className="v03-group-roster">
        {officers.map((officer) => {
          const reason = officerGroupActionReason(officer, action);
          const chosen = selectedIds.has(officer.id);
          const after =
            chosen && preview.ok
              ? preview.state.officers.find((entry) => entry.id === officer.id)
              : null;
          const beforeValue = action === 'equip' ? officer.force : officer.loyalty;
          const afterValue = action === 'equip' ? after?.force : after?.loyalty;
          return (
            <label
              className="v03-group-officer"
              key={officer.id}
              data-selected={chosen}
              data-disabled={Boolean(reason)}
            >
              <Input
                type="checkbox"
                aria-label={displayName(officer, locale)}
                checked={chosen}
                disabled={Boolean(reason)}
                onChange={(event) =>
                  setSelection((current) =>
                    event.target.checked
                      ? [...current.filter((id) => id !== officer.id), officer.id]
                      : current.filter((id) => id !== officer.id),
                  )
                }
              />
              <OfficerPortrait id={officer.id} locale={locale} />
              <span>
                <strong>{displayName(officer, locale)}</strong>
                <small>
                  {message(locale, action === 'equip' ? 'ui.force.53' : 'ui.loyalty.52')}:{' '}
                  {beforeValue}
                  {afterValue !== undefined ? ` → ${afterValue}` : ''}
                </small>
                {reason ? <small>{localizeAppMessage(reason, locale, state)}</small> : null}
              </span>
            </label>
          );
        })}
      </div>
      <StatGrid
        values={[
          { label: message(locale, 'flow.selectedOfficers'), value: selected.length },
          { label: message(locale, 'flow.totalGold'), value: goldCost.toLocaleString() },
          { label: message(locale, 'flow.workPointCost'), value: cityActionWorkCost(action) },
        ]}
      />
      <p className="v03-muted">
        {message(locale, cityActionWorkCost(action) ? 'flow.workCost' : 'flow.noWorkCost')}
      </p>
      {!preview.ok ? (
        <p className="v03-action-reason" role="status">
          {localizeAppMessage(preview.error ?? '', locale, state)}
        </p>
      ) : null}
      <Button
        variant="primary"
        disabled={!preview.ok}
        onClick={() => {
          if (submitted.current) return;
          submitted.current = true;
          const result = context.dispatch({
            type: 'cityAction',
            cityId: city.id,
            action,
            officerIds: selected,
          });
          if (result?.ok) onComplete();
          else submitted.current = false;
        }}
      >
        {message(locale, 'flow.confirmWork')}
      </Button>
    </section>
  );
}
