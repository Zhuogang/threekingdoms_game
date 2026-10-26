/** Approved historical eligibility; available immediately, independent of faction or date. */
const NAVAL_COMMANDERS: ReadonlySet<string> = new Set([
  'zhouyu',
  'chengpu',
  'huanggai',
  'handang',
  'ganning',
  'guanyu',
  'sunce',
  'lusu',
]);

export function hasNavalTraining(officerId: string | undefined): boolean {
  return officerId !== undefined && NAVAL_COMMANDERS.has(officerId);
}
