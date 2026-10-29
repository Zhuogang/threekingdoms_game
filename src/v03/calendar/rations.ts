/** Fixed-point food demand shared by previews and charging. No stock is mutated. */
export const FOOD_MICRO = 1_000_000;
export interface RationPersonnel {
  troops: number;
  wounded: number;
  troopType: 'infantry' | 'archer' | 'cavalry';
}

export function rationDemand(
  personnel: readonly RationPersonnel[],
  dailyRate: number,
  remainderMicro = 0,
) {
  const foodHeadcount = personnel.reduce(
    (sum, pool) => sum + (pool.troops + pool.wounded) * (pool.troopType === 'cavalry' ? 2 : 1),
    0,
  );
  const dailyMicro = foodHeadcount * Math.round(dailyRate * FOOD_MICRO);
  const demandMicro = dailyMicro + remainderMicro;
  const wholeFood = Math.floor(demandMicro / FOOD_MICRO);
  return {
    foodHeadcount,
    dailyFood: dailyMicro / FOOD_MICRO,
    demandMicro,
    wholeFood,
    remainderMicro: demandMicro - wholeFood * FOOD_MICRO,
  };
}
