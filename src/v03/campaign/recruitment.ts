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
  // Cavalry stays a premium everywhere, but the south is no longer a trap (PF-RL-04): at
  // force 70 a soldier costs about 1.0 / 1.5 / 2.3 gold north / centre / south (was
  // 1.0 / 2.6 / 6.2), against 0.3 for infantry.
  const multiplier =
    type === 'infantry'
      ? 100
      : type === 'archer'
        ? 75
        : region === 'north'
          ? 60
          : region === 'central'
            ? 50
            : 40;
  const gold =
    type === 'infantry'
      ? 200
      : type === 'archer'
        ? 350
        : region === 'north'
          ? 400
          : region === 'central'
            ? 500
            : 600;
  const troops = Math.max(
    0,
    Math.min(city.population - 1000, Math.floor(((300 + force * 5) * multiplier) / 100)),
  );
  return { troops, gold, region };
}
