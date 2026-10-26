import { useState } from 'react';
import { executeV03Command } from '../../commands';
import { cityPersonnelSummary, PERSONNEL_RULES } from '../../campaign/personnel';
import { PILOT_LOGISTICS_RATES } from '../../calendar';
import { TROOP_TYPES } from '../../campaign/troop-experience';
import { troopName } from '../../rendering/presentation';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button, Field, Input, Select, StatGrid } from '../kit';
import { ConfirmDialog, displayName } from '../shared/app-copy-3';
import { localizeAppMessage } from '../shared/app-copy-2';
import { TroopProgress } from './TroopProgress';

export function CityPersonnelPanel({
  context,
  officerId,
}: {
  context: GameplayContext;
  officerId?: string;
}) {
  const { state, selectedCity: city, locale } = context;
  const [recordId, setRecordId] = useState(officerId ? `officer:${officerId}` : 'reserve:infantry');
  const [troops, setTroops] = useState(0),
    [wounded, setWounded] = useState(0);
  const [action, setAction] = useState<'disband' | 'returnTroops' | null>(null);
  if (!city || city.factionId !== state.playerFactionId) return null;
  const summary = cityPersonnelSummary(state, city.id);
  const records = [
    ...TROOP_TYPES.map((type) => ({
      id: `reserve:${type}`,
      label: `${locale === 'zh' ? '预备兵' : 'Reserve'} · ${troopName(type, locale)}`,
      pool: { ...city.reservePools[type], troopType: type, wounded: 0, reorganizationDays: 0 },
    })),
    ...state.troopSources
      .filter((source) => source.cityId === city.id)
      .map((source) => ({
        id: `source:${source.id}`,
        pool: source,
        label: `${locale === 'zh' ? '留城人员' : 'Rear personnel'} · ${
          source.sourceOfficerId
            ? displayName(
                state.officers.find((o) => o.id === source.sourceOfficerId)!,
                locale,
              )
            : troopName(source.troopType, locale)
        } · ${source.troops.toLocaleString()} / ${source.wounded.toLocaleString()} · XP ${Math.floor(source.troopExperience)}`,
      })),
    ...state.officers
      .filter(
        (officer) =>
          officer.alive &&
          officer.factionId === city.factionId &&
          officer.location.kind === 'city' &&
          officer.location.cityId === city.id,
      )
      .map((officer) => ({
        id: `officer:${officer.id}`,
        label: displayName(officer, locale),
        pool: officer,
      })),
  ];
  const selected = records.find((record) => record.id === recordId);
  const command =
    action === 'returnTroops' && officerId
      ? { type: 'returnTroops' as const, cityId: city.id, officerId }
      : { type: 'disband' as const, cityId: city.id, recordId, troops, wounded };
  const preview = action ? executeV03Command(state, command) : null;
  const monthFood = Math.ceil(
    summary.foodHeadcount * PILOT_LOGISTICS_RATES.cityFoodPerTroopDay * 30,
  );
  const prisoners = state.officers.filter(
    (officer) =>
      officer.alive && officer.location.kind === 'captured' && officer.location.cityId === city.id,
  );
  const tomorrow =
    city.food > 0
      ? TROOP_TYPES.reduce((sum, type) => {
          const total =
            state.officers
              .filter(
                (officer) =>
                  officer.alive &&
                  officer.troopType === type &&
                  officer.location.kind === 'city' &&
                  officer.location.cityId === city.id,
              )
              .reduce((count, officer) => count + officer.wounded, 0) +
            state.troopSources
              .filter((source) => source.cityId === city.id && source.troopType === type)
              .reduce((count, source) => count + source.wounded, 0) +
            prisoners
              .filter((officer) => officer.troopType === type)
              .reduce((count, officer) => count + officer.wounded, 0);
          return sum + Math.ceil((total * PERSONNEL_RULES.recoveryPercent) / 100);
        }, 0)
      : 0;
  return (
    <details className="v03-personnel-panel">
      <summary>{locale === 'zh' ? '兵员、养伤与遣散' : 'Personnel, recovery & disbanding'}</summary>
      <StatGrid
        values={[
          {
            label: locale === 'zh' ? '可用守军' : 'Ready garrison',
            value: summary.available.toLocaleString(),
          },
          {
            label: locale === 'zh' ? '己方伤兵' : 'Own wounded',
            value: summary.wounded.toLocaleString(),
          },
          {
            label: locale === 'zh' ? '俘虏人员' : 'Captive personnel',
            value: summary.prisoners.toLocaleString(),
          },
          {
            label:
              locale === 'zh'
                ? '明日预计恢复（含俘虏）'
                : 'Expected recovery tomorrow (including captives)',
            value: tomorrow.toLocaleString(),
          },
          {
            label: locale === 'zh' ? '每月军事粮耗估计' : 'Estimated monthly military food',
            value: monthFood.toLocaleString(),
          },
          {
            label:
              locale === 'zh'
                ? '现粮可供天数（未计收入）'
                : 'Days of food at current strength (before income)',
            value: summary.foodHeadcount
              ? Math.floor(
                  city.food / (summary.foodHeadcount * PILOT_LOGISTICS_RATES.cityFoodPerTroopDay),
                )
              : '—',
          },
        ]}
      />
      <p>
        {locale === 'zh'
          ? '留城伤兵保持兵种与经验。未配给武将的待命人员不会自动参加野战；遣散永久失去相应兵员经验。'
          : 'Rear wounded keep their type and XP. Unassigned personnel do not automatically join field battles. Disbanding permanently loses their soldier XP.'}
      </p>
      {state.troopSources
        .filter((source) => source.cityId === city.id)
        .map((source) => (
          <p key={source.id}>
            <TroopProgress unit={source} locale={locale} /> · {source.troops.toLocaleString()}{' '}
            {locale === 'zh' ? '待命' : 'standing by'}
          </p>
        ))}
      <Field label={locale === 'zh' ? '处置兵源' : 'Personnel record'}>
        <Select
          value={recordId}
          onChange={(event) => {
            setRecordId(event.target.value);
            setTroops(0);
            setWounded(0);
          }}
        >
          {records.map((record) => (
            <option key={record.id} value={record.id}>
              {record.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={locale === 'zh' ? '遣散健全兵' : 'Healthy soldiers to disband'}>
        <Input
          type="number"
          min={0}
          max={selected?.pool.troops ?? 0}
          value={troops}
          onChange={(event) => setTroops(Number(event.target.value))}
        />
      </Field>
      <Field label={locale === 'zh' ? '遣散伤兵' : 'Wounded soldiers to disband'}>
        <Input
          type="number"
          min={0}
          max={selected?.pool.wounded ?? 0}
          value={wounded}
          onChange={(event) => setWounded(Number(event.target.value))}
        />
      </Field>
      <Button
        variant="danger"
        disabled={!selected || troops + wounded <= 0}
        onClick={() => setAction('disband')}
      >
        {locale === 'zh' ? '遣散指定人员' : 'Disband selected personnel'}
      </Button>
      {officerId && city.id === state.playerCapitalCityId ? (
        <Button onClick={() => setAction('returnTroops')}>
          {locale === 'zh' ? '归还全部所部' : 'Return the whole contingent'}
        </Button>
      ) : null}
      {action ? (
        <ConfirmDialog
          title={
            locale === 'zh'
              ? action === 'disband'
                ? '确认遣散？'
                : '归还全部所部？'
              : action === 'disband'
                ? 'Confirm disbanding?'
                : 'Return the whole contingent?'
          }
          detail={
            locale === 'zh'
              ? action === 'disband'
                ? `遣散健全兵 ${troops}、伤兵 ${wounded}；其兵员经验永久失去，人员回归人口。`
                : '健全兵归还同兵种兵源，伤兵留城养伤；取消自动归队，保留未完成整编。消耗 1 工作点。'
              : action === 'disband'
                ? `Disband ${troops} healthy and ${wounded} wounded. Their soldier XP is lost permanently; they return to the population.`
                : 'Return healthy soldiers and leave wounded in the city. Auto-rejoin ends; unfinished reorganization remains. Costs 1 work point.'
          }
          cancelLabel={context.t.cancel}
          confirmLabel={locale === 'zh' ? '确认' : 'Confirm'}
          body={
            !preview?.ok ? (
              <p role="status">{localizeAppMessage(preview?.error ?? '', locale, state)}</p>
            ) : null
          }
          onCancel={() => setAction(null)}
          onConfirm={() => {
            if (!preview?.ok) return;
            const result = context.dispatch(command);
            if (result?.ok) {
              setAction(null);
              setTroops(0);
              setWounded(0);
            }
          }}
        />
      ) : null}
    </details>
  );
}
