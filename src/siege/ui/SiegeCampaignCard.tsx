import { Button } from '../../v03/ui/kit';
import { hasSiegeSave } from '../save';
import { siegeText, type SiegeLocale } from '../i18n';
import './siege.css';
const visual = Object.values(
  import.meta.glob<string>(
    '/docs/siege/chencang/art/s7-01-key-visual/runtime/illustration-small.webp',
    { query: '?url', import: 'default', eager: true },
  ),
)[0];
export function SiegeCampaignCard({ locale }: { locale: SiegeLocale }) {
  const t = (key: Parameters<typeof siegeText>[1]) => siegeText(locale, key);
  return (
    <section
      className="siege-campaign-card"
      aria-label={t('special')}
      data-testid="chencang-campaign"
    >
      <img src={visual} alt="" />
      <div>
        <small>
          {t('special')} · {t('year')}
        </small>
        <h2>{t('campaign')}</h2>
        <p>{t('intro')}</p>
        <Button
          variant="primary"
          onClick={() => {
            window.location.hash = 'chencang';
          }}
        >
          {t('start')}
        </Button>
        {hasSiegeSave() && (
          <Button
            onClick={() => {
              window.location.hash = 'chencang/load';
            }}
          >
            {t('continue')}
          </Button>
        )}
      </div>
    </section>
  );
}
