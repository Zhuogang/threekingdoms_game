import type { SiegeTextKey } from '../i18n';

const urls = import.meta.glob<string>(
  [
    '/docs/siege/chencang/art/s7-0{1,2,3,5,6,7}-*/runtime/illustration.webp',
    '/docs/siege/chencang/art/s5-0{7,9}-*/runtime/*-small.webp',
    '/docs/siege/chencang/art/s6-0{3,4}-*/icons/*-{32,64}.png',
    '/docs/siege/chencang/art/s8-09-icons-counters/icons/*-{32,64}.png',
    '/docs/siege/chencang/art/s6-05-paper/pieces/{dialog,plaque,scroll-left,scroll-middle,scroll-right,paper-tile}.png',
  ],
  { query: '?url', import: 'default', eager: true },
);

function asset(part: string): string {
  const value = Object.entries(urls).find(([path]) => path.includes(part))?.[1];
  if (!value) throw new Error(`Missing siege UI art: ${part}`);
  return value;
}
export const storyArt = (scene: 1 | 2 | 3 | 5 | 6 | 7) => asset(`/s7-0${scene}-`);
export const storyPortrait = (id: 'jinxiang' | 'haozhao') => asset(`/runtime/${id}-small.webp`);
export const paperPiece = (
  name: 'dialog' | 'plaque' | 'scroll-left' | 'scroll-middle' | 'scroll-right' | 'paper-tile',
) => asset(`/pieces/${name}.png`);
const iconNames: Partial<Record<SiegeTextKey, string>> = {
  morningReport: 'morning-report',
  suppress: 'suppress',
  coverEngine: 'cover',
  covered: 'cover',
  pileEarth: 'mound',
  assault: 'assault',
  nightAssault: 'night-assault',
  brazier: 'light-brazier',
  millstone: 'hoist-millstone',
  boulders: 'stack-boulders',
  sortie: 'sortie',
  torches: 'torches',
  engineLoss: 'ram',
  burning: 'light-brazier',
  day: 'day',
  grain: 'grain',
  distance: 'reinforcements',
  act: 'day',
  move: 'height',
  attack: 'boulders',
  climb: 'climb',
  raiseLadder: 'ladder',
  fillTrench: 'fill-trench',
  buildWall: 'inner-wall',
  ram: 'ram',
  order: 'rally',
  standby: 'hold-fast',
  rally: 'rally',
  supervise: 'supervise',
  rotate: 'rotate',
  gates: 'gate',
  wallRuns: 'troops',
  innerWall: 'inner-wall',
  raised: 'ladder',
  filled: 'fill-trench',
  ladder: 'ladder',
  ramEngine: 'ram',
  earthCart: 'earth-cart',
  tower: 'siege-tower',
  troops: 'troops',
  wounded: 'troops',
  morale: 'morale',
  clear: 'day',
  snow: 'day',
  wind: 'day',
};
export function SiegeIcon({ name, large = false }: { name: SiegeTextKey; large?: boolean }) {
  const icon = iconNames[name];
  return icon ? (
    <img
      className={`siege-icon${large ? ' siege-icon-large' : ''}`}
      src={asset(`/icons/${icon}-${large ? 64 : 32}.png`)}
      alt=""
      aria-hidden="true"
    />
  ) : null;
}
