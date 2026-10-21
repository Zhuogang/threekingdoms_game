import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  advanceBattleDay,
  createBattleMap,
  createTacticalBattle,
  runBattleAiTurn,
  type BattleRegion,
  type BattleTroopType,
} from '../../src/v03/battle';

const regions: BattleRegion[] = ['hanzhong', 'shouchun', 'xiapi', 'chengdu'];
const troopTypes: BattleTroopType[] = [
  'infantry',
  'archer',
  'cavalry',
  'guard',
  'naval',
  'elite',
  'infantry',
  'archer',
  'cavalry',
  'guard',
];

function runBattleDay(seed: number) {
  const map = createBattleMap({
    regionId: regions[seed % regions.length]!,
    approachDirection: (['north', 'east', 'south', 'west'] as const)[seed % 4]!,
    seed,
  });
  const roster = (prefix: string) =>
    troopTypes.map((troopType, index) => ({
      id: `${prefix}-${index}`,
      name: `${prefix} ${index}`,
      troopType,
      troops: 400 + ((seed + index * 37) % 6) * 100,
      force: 55 + ((seed + index * 11) % 36),
    }));
  const battle = createTacticalBattle({
    id: `v03-performance-${seed}`,
    map,
    attackerUnits: roster('attacker'),
    defenderUnits: roster('defender'),
    playerSide: 'attacker',
  });

  const start = performance.now();
  const attackerTurn = runBattleAiTurn(battle, 'attacker');
  const completedDay = advanceBattleDay(attackerTurn);
  const elapsedMs = performance.now() - start;
  return { elapsedMs, completedDay };
}

describe('v0.3 tactical performance baseline', () => {
  it('keeps a 10v10 24×20 two-sided AI battle day below the 50 ms p95 target', () => {
    for (let seed = 1; seed <= 3; seed++) runBattleDay(seed);

    const samples = Array.from({ length: 30 }, (_, index) => runBattleDay(index + 101));
    const times = samples.map((sample) => sample.elapsedMs).sort((a, b) => a - b);
    const p95Ms = times[Math.ceil(times.length * 0.95) - 1]!;
    const maxMs = times[times.length - 1]!;

    expect(samples.every((sample) => sample.completedDay.day === 2)).toBe(true);
    console.info(
      JSON.stringify({ benchmark: 'v03-10v10-battle-day', samples: times.length, p95Ms, maxMs }),
    );
    expect(p95Ms).toBeLessThan(50);
  });
});
