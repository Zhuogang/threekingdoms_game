import { CAMPAIGN_WORLD_BOUNDS, CITY_GEOGRAPHY, projectCampaignPoint } from '../geography';
import { CampaignMapView } from './CampaignMapView';
import type { CampaignCityVisual } from './presentation';

const PREVIEW_CITIES: readonly CampaignCityVisual[] = CITY_GEOGRAPHY.map((city) => ({
  id: city.id,
  name: city.nameEn,
  position: projectCampaignPoint(city.latitude, city.longitude),
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
 * Art and anchor preview only. Physical geography is a visual reference;
 * estimated route distances remain independent of the basemap.
 */
export function CampaignMapPreviewFixture({ locale = 'en' }: { locale?: 'en' | 'zh' }) {
  const cities = PREVIEW_CITIES.map((visual) => {
    const source = CITY_GEOGRAPHY.find((city) => city.id === visual.id);
    return {
      ...visual,
      name: locale === 'zh' ? (source?.nameZh ?? visual.name) : (source?.nameEn ?? visual.name),
    };
  });
  return <CampaignMapView bounds={CAMPAIGN_WORLD_BOUNDS} cities={cities} locale={locale} />;
}
