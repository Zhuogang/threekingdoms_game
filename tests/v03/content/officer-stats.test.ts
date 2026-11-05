import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OFFICER_STATS } from '../../../src/v03/content/officer-stats';

const catalogSource = readFileSync('src/v03/content/officer-catalog.ts', 'utf8');
const seedBlock = catalogSource.slice(catalogSource.indexOf('const SEEDS'));
const seedIds = [...seedBlock.matchAll(/^\s+\['([a-z_]+)',/gm)].map((match) => match[1]);

describe('officer leadership and politics stats', () => {
  it('covers every catalog seed id with no extra keys', () => {
    expect(seedIds).toHaveLength(98);
    expect(Object.keys(OFFICER_STATS).sort()).toEqual([...seedIds].sort());
  });

  it('uses integers 1-100 and a Chinese basis line', () => {
    for (const [id, record] of Object.entries(OFFICER_STATS)) {
      for (const value of [record.leadership, record.politics]) {
        expect(Number.isInteger(value), id).toBe(true);
        expect(value, id).toBeGreaterThanOrEqual(1);
        expect(value, id).toBeLessThanOrEqual(100);
      }
      expect(record.basis.trim().length, id).toBeGreaterThan(0);
      expect(record.basis, id).toMatch(/[一-鿿]/);
    }
  });

  it('keeps the agreed anchor values', () => {
    const anchors: Record<string, [number, number]> = {
      caocao: [96, 92],
      zhugeliang: [92, 98],
      zhouyu: [95, 76],
      guanyu: [94, 40],
      zhangfei: [85, 25],
      lubu: [80, 12],
      xunyu: [60, 96],
      liubei: [78, 80],
      sunjian: [90, 55],
      yuanshao: [78, 70],
      dongzhuo: [82, 30],
      liushan: [20, 35],
    };
    for (const [id, [leadership, politics]] of Object.entries(anchors)) {
      expect(OFFICER_STATS[id]?.leadership, id).toBe(leadership);
      expect(OFFICER_STATS[id]?.politics, id).toBe(politics);
    }
  });
});
