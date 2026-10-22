import { message } from '../../i18n';

import { ROUTE_DEFINITIONS } from '../../geography';

import type { GameplayContext } from '../hooks/gameplayView';
import { CampaignMap } from '../panels/CampaignMap';
export function CampaignScreen({
  context,
}: {
  context: GameplayContext & { state: NonNullable<GameplayContext['state']> };
}) {
  const { t, state, friendlyCities, locale } = context;
  return (
    <section className="v03-campaign-main">
      <div className="v03-view-heading">
        <div>
          <span className="v03-kicker">
            {t.campaign} ·{' '}
            {locale === 'zh'
              ? state.scenarioId === 'guandu-200'
                ? '官渡前夕'
                : '群雄割据'
              : state.scenarioId === 'guandu-200'
                ? 'On the eve of Guandu'
                : 'A divided realm'}
          </span>
          <h1>{t.territory}</h1>
        </div>
        <div className="v03-stat-line">
          <span>
            {t.owned} <b>{friendlyCities.length}</b>
          </span>
          <span>
            {t.routes} <b>{ROUTE_DEFINITIONS.length}</b>
          </span>
        </div>
      </div>
      <CampaignMap context={{ ...context }} />
      <footer className="v03-map-legend">
        <span>
          <i className="legend-river" />
          {message(locale, 'ui.major.waterways.illustrative.125')}
        </span>
        <span>
          <i className="legend-road" />
          {t.routes}
        </span>
        <span>
          <i className="legend-ruler" />
          {message(locale, 'ui.ruler.s.capital.126')}
        </span>
      </footer>
    </section>
  );
}
