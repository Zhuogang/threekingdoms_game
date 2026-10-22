import { message } from '../../i18n';

import { v03CurrentDate } from '../../engine';

import { type V03Locale } from '../../wiki';
import { type CampaignCityVisual, type CampaignViewBox } from '../../rendering';
import { V03_ASSETS, resolvePublicAsset } from '../../rendering/assets';
import type { V03GameState } from '../../types';

export const CAMPAIGN_BACKGROUND = resolvePublicAsset(
  V03_ASSETS.campaignMapInk01.path,
  import.meta.env.BASE_URL,
);

export const CAMPAIGN_BOUNDS: CampaignViewBox = { left: 0, top: 0, width: 1000, height: 1000 };

export function cityScale(cityId: string): CampaignCityVisual['scale'] {
  if (cityId === 'luoyang') return 'imperial';
  if (['changan', 'ye', 'chengdu', 'jianye', 'xiapi'].includes(cityId)) return 'major';
  if (cityId === 'pingyuan' || cityId === 'tianshui') return 'humble';
  return 'standard';
}

export function dateLabel(state: V03GameState, locale: V03Locale): string {
  const date = v03CurrentDate(state);
  return message(locale, 'ui.month.day.137', {
    p0: date.year,
    p1: date.month,
    p2: date.dayOfMonth,
  });
}
