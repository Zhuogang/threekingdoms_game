import { describe, expect, it } from 'vitest';
import { OFFICER_CATALOG } from '../../../src/v03/content/officer-catalog';
import {
  DEFAULT_LINES,
  OFFICER_LINES,
  TRAIT_LINES,
  officerLine,
  type LineMoment,
  type LinePair,
} from '../../../src/v03/content/officer-lines';
import { OFFICER_TRAITS, TRAIT_INFO, type Trait } from '../../../src/v03/content/traits';

const MOMENTS: LineMoment[] = [
  'charge',
  'rout',
  'duelStart',
  'duelWin',
  'duelLose',
  'captured',
  'victory',
];
const CJK = /[㐀-鿿]/;
const LATIN = /[A-Za-z]/;

function allPairs(): [string, LinePair][] {
  const out: [string, LinePair][] = [];
  for (const [id, set] of Object.entries(OFFICER_LINES)) {
    for (const [moment, pair] of Object.entries(set)) out.push([`${id}.${moment}`, pair!]);
  }
  for (const [trait, set] of Object.entries(TRAIT_LINES)) {
    for (const [moment, pair] of Object.entries(set)) out.push([`trait ${trait}.${moment}`, pair]);
  }
  for (const [moment, pair] of Object.entries(DEFAULT_LINES)) out.push([`default.${moment}`, pair]);
  return out;
}

describe('officer battle lines', () => {
  it('covers every officer with duelStart and charge', () => {
    expect(OFFICER_CATALOG).toHaveLength(98);
    for (const officer of OFFICER_CATALOG) {
      expect(OFFICER_LINES[officer.id]?.duelStart, officer.id).toBeDefined();
      expect(OFFICER_LINES[officer.id]?.charge, officer.id).toBeDefined();
    }
  });

  it('gives the legacy officers all seven moments', () => {
    const legacy = OFFICER_CATALOG.filter((o) => !o.isNew);
    expect(legacy).toHaveLength(53);
    for (const officer of legacy) {
      for (const moment of MOMENTS) {
        expect(OFFICER_LINES[officer.id]?.[moment], `${officer.id}.${moment}`).toBeDefined();
      }
    }
  });

  it('has no lines for unknown officers', () => {
    const ids = new Set(OFFICER_CATALOG.map((o) => o.id));
    for (const id of Object.keys(OFFICER_LINES)) expect(ids.has(id), id).toBe(true);
  });

  it('keeps lines short', () => {
    for (const [key, pair] of allPairs()) {
      expect(pair.zh.length, key).toBeGreaterThan(0);
      expect(pair.en.length, key).toBeGreaterThan(0);
      expect([...pair.zh].length, `${key} zh`).toBeLessThanOrEqual(40);
      expect(pair.en.length, `${key} en`).toBeLessThanOrEqual(60);
    }
  });

  it('uses the right script per locale', () => {
    for (const [key, pair] of allPairs()) {
      expect(CJK.test(pair.zh), `${key} zh has CJK`).toBe(true);
      expect(LATIN.test(pair.zh), `${key} zh has no Latin`).toBe(false);
      expect(CJK.test(pair.en), `${key} en has no CJK`).toBe(false);
    }
  });

  it('completes every trait and the default', () => {
    for (const trait of Object.keys(TRAIT_INFO) as Trait[]) {
      for (const moment of MOMENTS)
        expect(TRAIT_LINES[trait]?.[moment], `${trait}.${moment}`).toBeDefined();
    }
    for (const moment of MOMENTS) expect(DEFAULT_LINES[moment]).toBeDefined();
  });

  it('freezes the exports', () => {
    expect(Object.isFrozen(OFFICER_LINES)).toBe(true);
    expect(Object.isFrozen(OFFICER_LINES.caocao)).toBe(true);
    expect(Object.isFrozen(TRAIT_LINES)).toBe(true);
    expect(Object.isFrozen(TRAIT_LINES.fierce)).toBe(true);
    expect(Object.isFrozen(DEFAULT_LINES)).toBe(true);
  });

  it("prefers the officer's own line", () => {
    expect(officerLine('zhangfei', 'duelStart', 'zh')).toBe('燕人张翼德在此！谁敢与我决一死战？');
    expect(officerLine('zhangfei', 'duelStart', 'en')).toBe(OFFICER_LINES.zhangfei!.duelStart!.en);
  });

  it('falls back to the first trait with a line, then to the default', () => {
    // Zhuge Liang has only charge and duelStart of his own.
    expect(OFFICER_LINES.zhugeliang?.rout).toBeUndefined();
    expect(officerLine('zhugeliang', 'rout', 'en')).toBe(DEFAULT_LINES.rout.en);

    const original = OFFICER_TRAITS.zhugeliang;
    OFFICER_TRAITS.zhugeliang = ['cunning', 'loyal'];
    try {
      expect(officerLine('zhugeliang', 'rout', 'zh')).toBe(TRAIT_LINES.cunning.rout.zh);
      expect(officerLine('zhugeliang', 'charge', 'zh')).toBe(OFFICER_LINES.zhugeliang!.charge!.zh);
    } finally {
      if (original) OFFICER_TRAITS.zhugeliang = original;
      else delete OFFICER_TRAITS.zhugeliang;
    }
  });

  it('uses the default for an unknown officer', () => {
    expect(officerLine('unknown-officer', 'victory', 'zh')).toBe(DEFAULT_LINES.victory.zh);
    expect(officerLine('unknown-officer', 'charge', 'en')).toBe(DEFAULT_LINES.charge.en);
  });
});
