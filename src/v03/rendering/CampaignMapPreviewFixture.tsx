import { CAMPAIGN_MAP_BOUNDS, CITY_GEOGRAPHY, projectCampaignPoint } from '../geography';
import { CampaignMapView } from './CampaignMapView';
import type { CampaignCityVisual } from './presentation';

const PREVIEW_CITIES: readonly CampaignCityVisual[] = CITY_GEOGRAPHY.map((city) => ({
  id: city.id,
  name: city.nameEn,
  position: projectCampaignPoint(city.latitude, city.longitude, CAMPAIGN_MAP_BOUNDS),
  scale:
    city.id === 'luoyang' || city.id === 'changan'
      ? 'imperial'
      : city.id === 'ye'
        ? 'major'
        : city.id === 'pingyuan'
          ? 'humble'
          : 'standard',
  selected: city.id === 'changan',
}));

/**
 * Art and anchor preview only. It deliberately omits route and hydrography data;
 * the raster is atmosphere and must not become the source for game geography.
 */
export function CampaignMapPreviewFixture({ locale = 'en' }: { locale?: 'en' | 'zh' }) {
  const cities = PREVIEW_CITIES.map((visual) => {
    const source = CITY_GEOGRAPHY.find((city) => city.id === visual.id);
    return {
      ...visual,
      name: locale === 'zh' ? (source?.nameZh ?? visual.name) : (source?.nameEn ?? visual.name),
    };
  });
  return (
    <CampaignMapView
      bounds={{ left: 0, top: 0, width: 1000, height: 1000 }}
      cities={cities}
      locale={locale}
    />
  );
}
