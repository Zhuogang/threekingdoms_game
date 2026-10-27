/** Explicit vessel-display policy; eligibility follows the commander, never the faction. */
const NAVAL_COMMANDERS: ReadonlySet<string> = new Set([
  'zhouyu',
  'chengpu',
  'huanggai',
  'handang',
  'ganning',
  'guanyu',
  'sunce',
  'lusu',
  // R4 additions are individual display choices, not a bonus for every Wu officer.
  'lvmeng',
  'luxun',
  'zhoutai',
  'zhuran',
  'xusheng',
  'dingfeng',
]);

export function hasNavalTraining(officerId: string | undefined): boolean {
  return officerId !== undefined && NAVAL_COMMANDERS.has(officerId);
}
