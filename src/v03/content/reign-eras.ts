/** Reign eras (年号) in Wei reckoning, enough for the shipped scenarios. Game years are solar AD years. */
export interface ReignEra {
  nameZh: string;
  nameEn: string;
  firstYear: number;
  lastYear: number;
}

export const REIGN_ERAS: readonly ReignEra[] = [
  { nameZh: '中平', nameEn: 'Zhongping', firstYear: 184, lastYear: 189 },
  { nameZh: '初平', nameEn: 'Chuping', firstYear: 190, lastYear: 193 },
  { nameZh: '兴平', nameEn: 'Xingping', firstYear: 194, lastYear: 195 },
  { nameZh: '建安', nameEn: "Jian'an", firstYear: 196, lastYear: 220 },
  { nameZh: '黄初', nameEn: 'Huangchu', firstYear: 221, lastYear: 226 },
];

export interface ReignEraYear {
  nameZh: string;
  nameEn: string;
  yearOfEra: number;
}

/** The era a year falls in, or null outside 184-226 (callers then print the plain AD year). */
export function reignEra(year: number): ReignEraYear | null {
  const era = REIGN_ERAS.find((entry) => year >= entry.firstYear && year <= entry.lastYear);
  return era
    ? { nameZh: era.nameZh, nameEn: era.nameEn, yearOfEra: year - era.firstYear + 1 }
    : null;
}
