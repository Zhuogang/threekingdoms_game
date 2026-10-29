import { performance } from 'node:perf_hooks';
import { cpus, platform, release } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  advanceBattleDay,
  canvasBattlefieldIds,
  createBattleMap,
  createCanvasBattleMap,
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
  'infantry',
  'archer',
  'cavalry',
  'infantry',
  'archer',
  'cavalry',
  'infantry',
];

function runBattleDay(seed: number, canvas?: string, midBattle?: 'engaged' | 'congested') {
  const map = canvas
    ? createCanvasBattleMap(canvas, { seed })
    : createBattleMap({
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

  if (midBattle) {
    battle.map.terrain.fill('plain');
    if (midBattle === 'congested')
      for (let y = 0; y < battle.map.height; y++)
        if (![9, 12, 15, 18].includes(y)) battle.map.terrain[y * battle.map.width + 24] = 'cliff';
    battle.day = 12;
    battle.tacticPoints = { attacker: 20, defender: 20 };
    battle.supplies = { attacker: 100_000, defender: 100_000 };
    for (const [index, unit] of battle.units.entries()) {
      const row = index % 10;
      Object.assign(unit, {
        x: unit.side === 'attacker' ? 21 : midBattle === 'congested' ? 27 : 25,
        y: 8 + row,
        intellect: 55 + (row % 5) * 10,
        wounded: 100,
        troopExperience: (row % 3) * 400,
        morale: row === 3 ? 10 : 80,
        status: row === 8 ? 'confused' : row === 5 ? 'inspired' : 'normal',
      });
      if (row % 2) battle.map.terrain[unit.y * battle.map.width + unit.x] = 'forest';
    }
  }

  const start = performance.now();
  const attackerTurn = runBattleAiTurn(battle, 'attacker');
  const completedDay = advanceBattleDay(attackerTurn);
  const elapsedMs = performance.now() - start;
  return { elapsedMs, completedDay };
}

describe('tactical performance gates', () => {
  it('keeps a 10v10 AI battle day on the 24×20 test templates below the 50 ms p95 target', () => {
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

  it('keeps a 10v10 48×32 canvas AI battle day below the 50 ms p95 target', () => {
    const canvases = canvasBattlefieldIds();
    for (let seed = 1; seed <= 3; seed++) runBattleDay(seed, canvases[0]);

    const samples = Array.from({ length: 30 }, (_, index) =>
      runBattleDay(index + 101, canvases[index % canvases.length]),
    );
    const times = samples.map((sample) => sample.elapsedMs).sort((a, b) => a - b);
    const p95Ms = times[Math.ceil(times.length * 0.95) - 1]!;
    const maxMs = times[times.length - 1]!;

    expect(samples.every((sample) => sample.completedDay.day === 2)).toBe(true);
    console.info(
      JSON.stringify({
        benchmark: 'v03-10v10-canvas-battle-day',
        samples: times.length,
        p95Ms,
        maxMs,
      }),
    );
    expect(p95Ms).toBeLessThan(50);
  });
});

describe('V04-05 representative mid-battle workload', () => {
  it.each(['engaged', 'congested'] as const)(
    'keeps mixed 10v10 %s 48×32 battle days below 50 ms p95',
    (fixture) => {
      const canvas = canvasBattlefieldIds()[0]!;
      for (let seed = 1; seed <= 3; seed++) runBattleDay(seed, canvas, fixture);
      const samples = Array.from({ length: 30 }, (_, index) =>
        runBattleDay(index + 101, canvas, fixture),
      );
      const times = samples.map((sample) => sample.elapsedMs).sort((a, b) => a - b);
      const p95Ms = times[Math.ceil(times.length * 0.95) - 1]!;
      console.info(
        JSON.stringify({
          benchmark: `v04-10v10-${fixture}`,
          samples: times.length,
          p50Ms: times[Math.ceil(times.length * 0.5) - 1],
          p95Ms,
          maxMs: times.at(-1),
          node: process.version,
          cpu: cpus()[0]?.model,
          platform: `${platform()} ${release()}`,
        }),
      );
      expect(
        samples.every((sample) => sample.completedDay.day === 13 || sample.completedDay.outcome),
      ).toBe(true);
      expect(p95Ms).toBeLessThan(50);
    },
  );
});
