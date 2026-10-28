import { useEffect, useRef, useState } from 'react';
import { officerTransferReason, previewOfficerTransfer } from '../../governance/officer-transfer';
import { OfficerPortrait } from '../../rendering/OfficerPortrait';
import { message } from '../../i18n';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button, Field, Input, Select, StatGrid } from '../kit';
import { displayName } from '../shared/app-copy-3';
import { localizeAppMessage } from '../shared/app-copy-2';
import { TroopProgress } from './TroopProgress';

export function OfficerTransfer({
  context,
  onComplete,
}: {
  context: GameplayContext;
  onComplete: () => void;
}) {
  const { state, selectedCity: city, locale } = context;
  const [targetId, setTargetId] = useState('');
  const [selection, setSelection] = useState<string[]>([]);
  const all = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);
  const officers = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.factionId === state.playerFactionId &&
      officer.location.kind === 'city' &&
      officer.location.cityId === city?.id,
  );
  const eligible = officers.filter(
    (officer) => !officerTransferReason(state, city?.id ?? '', officer),
  );
  const selected = selection.filter((id) => eligible.some((officer) => officer.id === id));
  useEffect(() => {
    if (all.current)
      all.current.indeterminate = selected.length > 0 && selected.length < eligible.length;
  }, [selected.length, eligible.length]);
  if (!city) return null;
  const preview = previewOfficerTransfer(state, city.id, targetId, selected);
  const plan = 'route' in preview ? preview : null;
  const chosen = officers.filter((officer) => selected.includes(officer.id));
  return (
    <section className="v03-work-detail v03-officer-group-work v03-officer-transfer">
      <p className="v03-step-intro">{message(locale, 'flow.transferHint')}</p>
      <Field label={message(locale, 'flow.chooseTarget')}>
        <Select value={targetId} onChange={(event) => setTargetId(event.target.value)}>
          <option value="">—</option>
          {state.cities
            .filter((target) => target.factionId === state.playerFactionId && target.id !== city.id)
            .map((target) => (
              <option key={target.id} value={target.id}>
                {displayName(target, locale)}
              </option>
            ))}
        </Select>
      </Field>
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
          const reason = officerTransferReason(state, city.id, officer);
          return (
            <label
              key={officer.id}
              className="v03-group-officer"
              data-selected={selected.includes(officer.id)}
              data-disabled={Boolean(reason)}
            >
              <Input
                type="checkbox"
                aria-label={displayName(officer, locale)}
                checked={selected.includes(officer.id)}
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
                  {locale === 'zh' ? '健全兵' : 'Healthy troops'} {officer.troops.toLocaleString()}
                </small>
                <TroopProgress unit={officer} locale={locale} compact />
                {reason ? <small>{localizeAppMessage(reason, locale, state)}</small> : null}
              </span>
            </label>
          );
        })}
      </div>
      <StatGrid
        values={[
          { label: message(locale, 'flow.selectedOfficers'), value: selected.length },
          {
            label: locale === 'zh' ? '健全兵' : 'Healthy troops',
            value: chosen.reduce((sum, officer) => sum + officer.troops, 0).toLocaleString(),
          },
          {
            label: locale === 'zh' ? '伤兵' : 'Wounded',
            value: chosen.reduce((sum, officer) => sum + officer.wounded, 0).toLocaleString(),
          },
          {
            label: locale === 'zh' ? '预计行程（日）' : 'Travel days',
            value: plan?.route.estimatedDays ?? '—',
          },
          {
            label: locale === 'zh' ? '去返路粮' : 'Travel & return food',
            value: plan?.food.toLocaleString() ?? '—',
          },
          { label: message(locale, 'flow.workPointCost'), value: 0 },
        ]}
      />
      {!preview.ok ? (
        <p className="v03-action-reason" role="status">
          {localizeAppMessage(preview.reason, locale, state)}
        </p>
      ) : null}
      <Button
        variant="primary"
        disabled={!preview.ok}
        onClick={() => {
          if (submitted.current) return;
          submitted.current = true;
          const result = context.dispatch({
            type: 'transferOfficers',
            sourceCityId: city.id,
            targetCityId: targetId,
            officerIds: selected,
          });
          if (result?.ok) onComplete();
          else submitted.current = false;
        }}
      >
        {message(locale, 'flow.confirmTransfer')}
      </Button>
    </section>
  );
}
