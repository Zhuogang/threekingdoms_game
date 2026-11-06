import { Button } from '../../v03/ui/kit';
import { siegeText, rejectionText, type SiegeLocale, type SiegeTextKey } from '../i18n';
import type { SiegeAttackForecast, SiegeClimbForecast, SiegeEngagement } from '../rules/combat';
import { SIEGE_TUNING as T } from '../rules/tuning';
import { forecastTableData } from './forecastData';
import type { SiegeAction, SiegeState } from '../rules/types';

interface Controls {
  locale: SiegeLocale;
  reason: string | null;
  confirm: () => void;
  cancel: () => void;
  disabled: boolean;
  checked: boolean;
  toggle: (checked: boolean) => void;
  footholdBefore?: number;
}
function Comparison({
  normal,
  assault,
  target,
  testId,
  ...c
}: Controls & {
  normal: SiegeAttackForecast | SiegeClimbForecast;
  assault: SiegeAttackForecast | SiegeClimbForecast | null;
  target: string;
  testId: string;
}) {
  const t = (key: SiegeTextKey, params: Record<string, string | number> = {}) =>
    siegeText(c.locale, key, params);
  const columns = forecastTableData(normal, assault, c.footholdBefore ?? 0);
  const chosen = c.checked && assault ? assault : normal;
  const selected = c.checked && assault ? 'assault' : 'normal';
  const modifiers = (engagement: SiegeEngagement) => (
    <div className="siege-modifiers">
      <span>{t('frontage', { n: engagement.frontage ?? t('unlimited') })}</span>
      {(Object.entries(engagement.modifiers) as Array<[keyof SiegeEngagement['modifiers'], number]>)
        .filter(([key, value]) => value !== 1 || key === 'parapet')
        .map(([key, value]) => (
          <span key={key}>
            {key === 'suppression'
              ? `${t('suppress')} ×${value}`
              : t(key === 'gate' ? 'gateModifier' : key, { n: value })}
          </span>
        ))}
    </div>
  );
  return (
    <section className="siege-forecast" data-testid={testId}>
      <h4>{target}</h4>
      {assault && (
        <label className="siege-assault">
          <input
            data-testid="assault-toggle"
            type="checkbox"
            checked={c.checked}
            onChange={(e) => c.toggle(e.target.checked)}
          />
          {t('assault')}
        </label>
      )}
      <table data-testid="forecast-table">
        <thead>
          <tr>
            <th scope="col">{t('forecast')}</th>
            {columns.map((col) => (
              <th
                key={col.kind}
                scope="col"
                data-testid={`forecast-${col.kind}`}
                data-chosen={selected === col.kind}
              >
                {t(col.kind === 'normal' ? 'normalAttack' : 'assault')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(
            ['ownCasualties', 'enemyCasualties', 'footholdBeforeAfter', 'moraleAfter'] as const
          ).map((row) => (
            <tr key={row} className={row === 'ownCasualties' ? 'siege-own-losses' : undefined}>
              <th scope="row">{t(row)}</th>
              {columns.map((col) => (
                <td
                  key={col.kind}
                  data-testid={`forecast-${col.kind}-${row}`}
                  data-chosen={selected === col.kind}
                >
                  {row === 'footholdBeforeAfter' ? (
                    <>
                      {t('footholdComparison', {
                        before: col.footholdBefore,
                        after: col.footholdAfter,
                        max: T.footholdComplete,
                        mount: col.wouldMount ? t('mountNow') : '',
                      })}
                    </>
                  ) : (
                    col[row]
                  )}
                </td>
              ))}
            </tr>
          ))}
          {columns.some((col) => col.gateDamage !== undefined) && (
            <tr>
              <th scope="row">{t('gateDamage', { n: '' })}</th>
              {columns.map((col) => (
                <td key={col.kind} data-chosen={selected === col.kind}>
                  {col.gateDamage ?? 0}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
      {'routsTarget' in chosen && chosen.routsTarget && (
        <p data-testid="forecast-rout">
          {chosen.sourceRoutMoraleGain > 0
            ? t('forecastRout', { n: chosen.sourceRoutMoraleGain })
            : t('forecastRoutOnly')}
        </p>
      )}
      <details data-testid="forecast-details">
        <summary>{t('detailedModifiers')}</summary>
        {[normal, ...(assault ? [assault] : [])].map((f, i) => (
          <div key={i}>
            <strong>{t(i ? 'assault' : 'normalAttack')}</strong>
            <p>
              {t('footholdLine', {
                gain: f.footholdGain,
                after: f.footholdAfter,
                max: T.footholdComplete,
                mount: f.wouldMount ? t('mountNow') : '',
              })}
            </p>
            {'counterattack' in f ? (
              <>
                <small>{t('strike')}</small>
                {modifiers(f)}
                <small>{t('counter')}</small>
                {modifiers(f.counterattack)}
              </>
            ) : (
              <p>{t('frontage', { n: f.frontage })}</p>
            )}
            <small>
              {t('forecastMorale', {
                n: f.sourceMoraleAfter,
                loss:
                  'neighbourMoraleLoss' in f
                    ? f.neighbourMoraleLoss
                    : i && !f.wouldMount
                      ? T.assaultNeighbourLoss
                      : 0,
              })}
            </small>
          </div>
        ))}
      </details>
      {'inRange' in normal && !normal.inRange && <p>{t('outOfRange')}</p>}
      {c.reason && <p>{rejectionText(c.locale, c.reason)}</p>}
      <div className="siege-forecast-controls">
        <Button
          size="sm"
          data-testid={testId === 'climb-forecast' ? 'climb-confirm' : 'attack-confirm'}
          variant="primary"
          disabled={c.disabled || Boolean(c.reason)}
          onClick={c.confirm}
        >
          {t(testId === 'climb-forecast' ? 'confirmClimb' : 'confirm')}
        </Button>
        <Button size="sm" onClick={c.cancel}>
          {t('cancel')}
        </Button>
      </div>
    </section>
  );
}
export function Forecast({
  forecast,
  assaultForecast,
  target,
  ...c
}: Controls & {
  forecast: SiegeAttackForecast;
  assaultForecast: SiegeAttackForecast | null;
  target: string;
}) {
  return (
    <Comparison
      normal={forecast}
      assault={assaultForecast}
      target={target}
      testId="attack-forecast"
      {...c}
    />
  );
}
export function ClimbForecast({
  normal,
  assault,
  ...c
}: Controls & { normal: SiegeClimbForecast; assault: SiegeClimbForecast }) {
  return (
    <Comparison
      normal={normal}
      assault={assault}
      target={siegeText(c.locale, 'climb')}
      testId="climb-forecast"
      {...c}
    />
  );
}

/** Countermeasures and ramming use a dry run of the real rule, never UI damage math. */
export function ActionForecast({
  before,
  after,
  action,
  locale,
  confirm,
  cancel,
}: {
  before: SiegeState;
  after: SiegeState;
  action: SiegeAction;
  locale: SiegeLocale;
  confirm: () => void;
  cancel: () => void;
}) {
  const t = (key: SiegeTextKey, params: Record<string, string | number> = {}) =>
    siegeText(locale, key, params);
  return (
    <section className="siege-forecast" data-testid="attack-forecast">
      <h4>
        {t(action.type as SiegeTextKey)} · {t('forecast')}
      </h4>
      {before.units.flatMap((u) => {
        const next = after.units.find((v) => v.id === u.id)!;
        return next.troops !== u.troops
          ? [
              <p key={u.id}>
                {locale === 'zh' ? u.officer.chinese : u.officer.name}:{' '}
                {t('troops', { n: u.troops })} → {next.troops}
              </p>,
            ]
          : [];
      })}
      {before.engines.flatMap((e) => {
        const next = after.engines.find((v) => v.id === e.id)!;
        return next.durability !== e.durability
          ? [
              <p key={e.id}>
                {t('durability', { n: e.durability, max: e.max })} → {next.durability}
                {next.burning ? ` · ${t('burning')}` : ''}
              </p>,
            ]
          : [];
      })}
      {(Object.keys(before.gates) as (keyof typeof before.gates)[]).flatMap((id) => {
        const gate = before.gates[id];
        const next = after.gates[id];
        return next.durability !== gate.durability
          ? [
              <p key={id}>
                {t('gateDamage', { n: gate.durability - next.durability })} · {gate.durability} →{' '}
                {next.durability}
              </p>,
            ]
          : [];
      })}
      {action.type === 'suppress' && <p>{t('suppressHelp')}</p>}
      {Object.entries(before.footholds)
        .filter(([key, n]) => after.footholds[key] !== n)
        .map(([key, n]) => (
          <p key={key}>
            {t('footholdComparison', {
              before: n,
              after: after.footholds[key] ?? 0,
              max: T.footholdComplete,
              mount: '',
            })}
          </p>
        ))}
      <div className="siege-forecast-controls">
        <Button size="sm" variant="primary" data-testid="attack-confirm" onClick={confirm}>
          {t('confirm')}
        </Button>
        <Button size="sm" onClick={cancel}>
          {t('cancel')}
        </Button>
      </div>
    </section>
  );
}
