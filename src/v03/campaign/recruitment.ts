import type { TroopType } from '../content/types';

/** Initial game balance, not historical population/currency estimates. */
export const RECRUITMENT_REGIONS = {
  north: ['beiping', 'jinyang', 'ye', 'pingyuan', 'beihai', 'tianshui', 'changan'],
  central: ['luoyang', 'puyang', 'chenliu', 'xuchang', 'xiapi', 'shouchun', 'wancheng', 'hanzhong'],
} as const;

export function recruitmentQuote(
  city: { id: string; population: number },
  force: number,
  type: TroopType,
) {
  const region = (RECRUITMENT_REGIONS.north as readonly string[]).includes(city.id)
    ? 'north'
    : (RECRUITMENT_REGIONS.central as readonly string[]).includes(city.id)
      ? 'central'
      : 'south';
  const multiplier =
    type === 'infantry'
      ? 100
      : type === 'archer'
        ? 75
        : region === 'north'
          ? 60
          : region === 'central'
            ? 35
            : 20;
  const gold =
    type === 'infantry'
      ? 200
      : type === 'archer'
        ? 350
        : region === 'north'
          ? 400
          : region === 'central'
            ? 600
            : 800;
  const troops = Math.max(
    0,
    Math.min(city.population - 1000, Math.floor(((300 + force * 5) * multiplier) / 100)),
  );
  return { troops, gold, region };
}
