import { Button } from '../../v03/ui/kit';
import { siegeText, rejectionText, type SiegeLocale, type SiegeTextKey } from '../i18n';
import type { SiegeAttackForecast, SiegeClimbForecast, SiegeEngagement } from '../rules/combat';
import { SIEGE_TUNING as T } from '../rules/tuning';

interface Controls {
  locale: SiegeLocale;
  reason: string | null;
  confirm: () => void;
  cancel: () => void;
  disabled: boolean;
  checked: boolean;
  toggle: (checked: boolean) => void;
}
function Foothold({
  forecast,
  locale,
}: {
  forecast: Pick<SiegeAttackForecast, 'footholdGain' | 'footholdAfter' | 'wouldMount'>;
  locale: SiegeLocale;
}) {
  return (
    <p>
      {siegeText(locale, 'footholdLine', {
        gain: forecast.footholdGain,
        after: forecast.footholdAfter,
        max: T.footholdComplete,
        mount: forecast.wouldMount ? siegeText(locale, 'mountNow') : '',
      })}
    </p>
  );
}
function AssaultBox({ locale, checked, toggle }: Pick<Controls, 'locale' | 'checked' | 'toggle'>) {
  return (
    <label className="siege-assault">
      <input
        data-testid="assault-toggle"
        type="checkbox"
        checked={checked}
        onChange={(e) => toggle(e.target.checked)}
      />
      {siegeText(locale, 'assault')}
    </label>
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
  const t = (key: SiegeTextKey, p: Record<string, string | number> = {}) =>
    siegeText(c.locale, key, p);
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
    <section className="siege-forecast" data-testid="attack-forecast">
      <h4>
        {t('forecast')} · {target}
      </h4>
      {assaultForecast && <AssaultBox {...c} />}
      {[forecast, ...(assaultForecast ? [assaultForecast] : [])].map((f, i) => (
        <div key={i} data-testid={i ? 'forecast-assault' : 'forecast-normal'}>
          {assaultForecast && <strong>{t(i ? 'assault' : 'normalAttack')}</strong>}
          <p>
            {t('enemyLoss', { n: f.casualties })} ·{' '}
            {t('ownLoss', { n: f.counterattack.casualties })}
          </p>
          {f.gateDamage !== undefined && <p>{t('gateDamage', { n: f.gateDamage })}</p>}
          <small>{t('strike')}</small>
          {modifiers(f)}
          <small>{t('counter')}</small>
          {modifiers(f.counterattack)}
          {assaultForecast && (
            <>
              <Foothold forecast={f} locale={c.locale} />
              <small>
                {t('forecastMorale', {
                  n: f.sourceMoraleAfter,
                  loss: i && !f.wouldMount ? T.assaultNeighbourLoss : 0,
                })}
              </small>
            </>
          )}
        </div>
      ))}
      {!forecast.inRange && <p>{t('outOfRange')}</p>}
      {c.reason && <p>{rejectionText(c.locale, c.reason)}</p>}
      <Button
        size="sm"
        data-testid="attack-confirm"
        variant="primary"
        disabled={c.disabled || Boolean(c.reason)}
        onClick={c.confirm}
      >
        {t('confirm')}
      </Button>
      <Button size="sm" onClick={c.cancel}>
        {t('cancel')}
      </Button>
    </section>
  );
}
export function ClimbForecast({
  normal,
  assault,
  ...c
}: Controls & { normal: SiegeClimbForecast; assault: SiegeClimbForecast }) {
  const t = (key: SiegeTextKey, p: Record<string, string | number> = {}) =>
    siegeText(c.locale, key, p);
  return (
    <section className="siege-forecast" data-testid="climb-forecast">
      <h4>{t('climb')}</h4>
      <AssaultBox {...c} />
      {[normal, assault].map((f, i) => (
        <div key={i} data-testid={i ? 'forecast-assault' : 'forecast-normal'}>
          <strong>{t(i ? 'assault' : 'normalAttack')}</strong>
          <p>
            {t('frontage', { n: f.frontage })} · {t('ownLoss', { n: f.casualties })}
          </p>
          <Foothold forecast={f} locale={c.locale} />
          <small>
            {t('forecastMorale', { n: f.sourceMoraleAfter, loss: f.neighbourMoraleLoss })}
          </small>
        </div>
      ))}
      {c.reason && <p>{rejectionText(c.locale, c.reason)}</p>}
      <Button
        size="sm"
        data-testid="climb-confirm"
        variant="primary"
        disabled={c.disabled || Boolean(c.reason)}
        onClick={c.confirm}
      >
        {t('confirmClimb')}
      </Button>
      <Button size="sm" onClick={c.cancel}>
        {t('cancel')}
      </Button>
    </section>
  );
}
