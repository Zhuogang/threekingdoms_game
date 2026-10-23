import { V03_CITY_ICONS } from './assets';
import type { CampaignCityVisual } from './presentation';

type CityArtKind = keyof typeof V03_CITY_ICONS;

/** Presentation-only regional variants; city geography and rules are unchanged. */
const CITY_ART: Readonly<Record<string, CityArtKind>> = {
  luoyang: 'imperial',
  changan: 'imperial',
  beiping: 'frontier',
  jinyang: 'frontier',
  tianshui: 'loess',
  chengdu: 'basin',
  zitong: 'basin',
  hanzhong: 'mountain',
  jiangzhou: 'mountain',
  jiangling: 'river',
  jiangxia: 'river',
  chaisang: 'river',
  jianye: 'jiangnan',
  wu: 'jiangnan',
  shouchun: 'jiangnan',
  xiapi: 'jiangnan',
};

export function campaignCityArtwork(city: Pick<CampaignCityVisual, 'id' | 'scale'>) {
  const kind = CITY_ART[city.id] ?? 'plains';
  const asset = V03_CITY_ICONS[kind];
  const width = kind === 'imperial' ? 80 : city.scale === 'major' ? 72 : 64;
  const height = (width * asset.height) / asset.width;
  return { kind, asset, width, height, x: -width * asset.anchor[0], y: -height * asset.anchor[1] };
}
