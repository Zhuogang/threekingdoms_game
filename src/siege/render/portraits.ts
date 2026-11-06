import { SHU_ROSTER, WEI_ROSTER } from '../content/chencang';
import type { SiegeUnit } from '../rules/types';
import { officerPortraitPath } from '../../v03/rendering/officer-portraits';

const portraitFiles = import.meta.glob<string>(
  '/docs/siege/chencang/art/s5-0{7,8}-*/runtime/*-small.webp',
  { query: '?url', import: 'default', eager: true },
);
export const portrait = (id: string) =>
  Object.entries(portraitFiles).find(([path]) => path.endsWith(`/${id}-small.webp`))?.[1];
export const portraitOf = (unit: Pick<SiegeUnit, 'officer'>) =>
  portrait(unit.officer.id) ??
  (unit.officer.portraitId ? officerPortraitPath(unit.officer.portraitId) : undefined);

export const portraitArtUrls = [
  ...Object.values(portraitFiles),
  ...[...SHU_ROSTER, ...WEI_ROSTER].flatMap((unit) => {
    const url = portraitOf(unit);
    return url ? [url] : [];
  }),
];
