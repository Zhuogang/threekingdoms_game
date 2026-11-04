import { Button } from '../../v03/ui/kit';
import { hasSiegeSave, loadSiege } from '../save';
import { siegeText, type SiegeLocale } from '../i18n';
import { storyArt } from './storyAssets';
import './siege.css';
export function SiegeCampaignCard({ locale }: { locale: SiegeLocale }) {
  const t = (key: Parameters<typeof siegeText>[1]) => siegeText(locale, key);
  return (
    <section
      className="siege-campaign-card"
      aria-label={t('special')}
      data-testid="chencang-campaign"
    >
      <img src={storyArt(1)} alt="" />
      <div>
        <small>
          {t('special')} · {t('year')}
        </small>
        <h2>{t('campaign')}</h2>
        <p>{t('intro')}</p>
        <div className="siege-side-choices">
          {(['shu', 'wei'] as const).map((side) => (
            <Button
              key={side}
              variant="primary"
              data-testid={`start-${side}`}
              style={{
                // Each side's army colour over its art, so the choice reads at a glance.
                backgroundImage:
                  side === 'shu'
                    ? `linear-gradient(#35643fd9, #35643fd9), url("${storyArt(1)}")`
                    : `linear-gradient(#2f4a6ed9, #2f4a6ed9), url("${storyArt('s8-10')}")`,
              }}
              onClick={() => {
                window.location.hash = `chencang/${side}`;
              }}
            >
              {t(side === 'shu' ? 'chooseShu' : 'chooseWei')}
            </Button>
          ))}
        </div>
        {hasSiegeSave() && (
          <Button
            data-testid="continue-siege"
            onClick={() => {
              window.location.hash = 'chencang/load';
            }}
          >
            {siegeText(locale, 'continueSide', {
              side: t(loadSiege()?.playerSide === 'wei' ? 'continueWei' : 'continueShu'),
            })}
          </Button>
        )}
      </div>
    </section>
  );
}
