import { Button } from '../kit';
import { message } from '../../i18n';

import { CampaignMinimap, CampaignMapView, recenterCampaignViewport } from '../../rendering';

import { CAMPAIGN_BACKGROUND, CAMPAIGN_BOUNDS } from '../shared/app-copy-2';

import type { GameplayContext } from '../hooks/gameplayView';

export function CampaignMap({ context }: { context: GameplayContext }) {
  const {
    campaignMapFrame,
    campaignViewport,
    setCampaignViewport,
    campaignCities,
    campaignRoutes,
    locale,
    focusCampaignCity,
    zoomCampaignMap,
    fitCampaignMap,
    journeyClusters,
    journeyDescription,
    t,
    setFeedback,
  } = context;
  return (
    <div ref={campaignMapFrame} className="v03-map-frame">
      <CampaignMapView
        bounds={CAMPAIGN_BOUNDS}
        viewport={campaignViewport}
        interactive
        onViewportChange={setCampaignViewport}
        backgroundImage={CAMPAIGN_BACKGROUND}
        cities={campaignCities}
        routes={campaignRoutes}
        locale={locale}
        onCityClick={focusCampaignCity}
      />
      <div className="v03-campaign-map-controls" aria-label={message(locale, 'ui.map.zoom.68')}>
        <Button
          type="button"
          title={message(locale, 'ui.zoom.out.69')}
          aria-label={message(locale, 'ui.zoom.out.map.70')}
          onClick={() => zoomCampaignMap(0.8)}
        >
          −
        </Button>
        <Button
          type="button"
          title={message(locale, 'ui.zoom.in.71')}
          aria-label={message(locale, 'ui.zoom.in.map.72')}
          onClick={() => zoomCampaignMap(1.25)}
        >
          +
        </Button>
        <Button
          type="button"
          aria-label={message(locale, 'ui.fit.full.map.73')}
          onClick={fitCampaignMap}
        >
          {message(locale, 'ui.fit.74')}
        </Button>
        <Button
          aria-label={message(locale, 'ui.toggle.minimap.394')}
          onClick={() => context.setShowMinimap(!context.showMinimap)}
        >
          {message(locale, 'ui.minimap.395')}
        </Button>
      </div>
      {context.showMinimap ? (
        <CampaignMinimap
          className="v03-campaign-minimap"
          bounds={CAMPAIGN_BOUNDS}
          viewport={campaignViewport}
          cities={campaignCities}
          routes={campaignRoutes}
          locale={locale}
          onNavigate={(center) =>
            setCampaignViewport((viewport) =>
              recenterCampaignViewport(viewport, CAMPAIGN_BOUNDS, center),
            )
          }
        />
      ) : null}
      {journeyClusters.map((cluster) => {
        const first = cluster.parties[0];
        if (!first) return null;
        const descriptions = cluster.parties.map(journeyDescription);
        const label = descriptions.join('\n');
        const style = {
          left: `${((cluster.position.x - campaignViewport.left) / campaignViewport.width) * 100}%`,
          top: `${((cluster.position.y - campaignViewport.top) / campaignViewport.height) * 100}%`,
        };
        const symbol =
          first.kind === 'campaign'
            ? '軍'
            : first.kind === 'appointment'
              ? '任'
              : first.manifest.troopCount > 0
                ? '兵'
                : '糧';
        const groupedLabel = `${cluster.parties.length} ${t.journeyGroup}: ${descriptions.join(' · ')}`;
        return (
          <Button
            type="button"
            key={cluster.id}
            className={`v03-army-marker ${cluster.parties.length > 1 ? 'grouped' : ''} ${first.status === 'waiting' ? 'waiting' : first.kind === 'campaign' ? 'marching' : 'transport'}`}
            style={style}
            onClick={() => setFeedback(cluster.parties.length > 1 ? label : descriptions[0]!)}
            aria-label={cluster.parties.length > 1 ? groupedLabel : descriptions[0]}
            title={cluster.parties.length > 1 ? groupedLabel : descriptions[0]}
          >
            {cluster.parties.length > 1 ? `×${cluster.parties.length}` : symbol}
          </Button>
        );
      })}
    </div>
  );
}
