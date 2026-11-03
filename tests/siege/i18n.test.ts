import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIEGE_COPY, SIEGE_REASONS, rejectionText, siegeText } from '../../src/siege/i18n';

describe('siege bilingual text', () => {
  it('requires the exact same nonempty keys and interpolation parameters in both languages', () => {
    expect(Object.keys(SIEGE_COPY.en).sort()).toEqual(Object.keys(SIEGE_COPY.zh).sort());
    for (const key of Object.keys(SIEGE_COPY.en) as Array<keyof typeof SIEGE_COPY.en>) {
      const en = SIEGE_COPY.en[key],
        zh = SIEGE_COPY.zh[key];
      expect(en.trim()).not.toBe('');
      expect(zh.trim()).not.toBe('');
      expect(en.match(/\{[^}]+\}/g)?.sort() ?? []).toEqual(zh.match(/\{[^}]+\}/g)?.sort() ?? []);
    }
    expect(siegeText('en', 'day', { n: 7 })).toBe('Day 7');
    expect(siegeText('zh', 'day', { n: 7 })).toBe('第 7 日');
  });
  it('translates every rejection currently returned by the action rules', () => {
    expect(Object.keys(SIEGE_REASONS.en).sort()).toEqual(Object.keys(SIEGE_REASONS.zh).sort());
    const source = readFileSync('src/siege/rules/actions.ts', 'utf8');
    const reasons = [...source.matchAll(/return '([^']+)';/g)].map((match) => match[1]!);
    reasons.push('The siege has ended.');
    expect(reasons.length).toBeGreaterThan(25);
    for (const reason of reasons) {
      expect(SIEGE_REASONS.en).toHaveProperty(reason);
      expect(rejectionText('en', reason)).toBe(reason);
      expect(rejectionText('zh', reason)).not.toBe(reason);
    }
  });
});
