import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { translateText } from '../src/i18n/core';

/** Collect every literal passed to `t(...)` / `tx(...)`, including both arms of a ternary. */
function literals(node: ts.Node, found: Set<string>): void {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const name = node.expression.text;
    if ((name === 't' || name === 'tx') && node.arguments[0]) {
      const collect = (expression: ts.Expression): void => {
        if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))
          found.add(expression.text);
        else if (ts.isConditionalExpression(expression)) {
          collect(expression.whenTrue);
          collect(expression.whenFalse);
        } else if (ts.isParenthesizedExpression(expression)) collect(expression.expression);
      };
      collect(node.arguments[0]);
    }
  }
  ts.forEachChild(node, (child) => literals(child, found));
}

const files = readdirSync('src/ui')
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => `src/ui/${file}`)
  .concat(['src/rendering/GameMap.tsx']);

describe('interface strings are translated', () => {
  it.each(files)('%s has a Chinese rendering for every literal t()/tx() key', (path) => {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const found = new Set<string>();
    literals(source, found);
    const missing = [...found].filter((text) => {
      // Pure numbers, symbols and single-character glyphs need no translation.
      if (!/[A-Za-z]/.test(text.replace(/\{\w+\}/g, ''))) return false;
      const zh = translateText(text, 'zh');
      return zh === text || !/[㐀-鿿]/u.test(zh);
    });
    expect(missing).toEqual([]);
  });

  it('translates new-rule status words and ranges used in the battle UI', () => {
    for (const word of ['Wavering', 'Routed', 'Level', 'Raid supplies', 'Ambush', 'Rockfall'])
      expect(translateText(word, 'zh')).toMatch(/[㐀-鿿]/u);
    expect(translateText('Tomorrow: {weather}', 'zh', { weather: 'rain' })).toBe('明日：雨天');
    expect(translateText('Supplies: {count} days left', 'zh', { count: 21 })).toBe(
      '粮草还可支撑 21 日',
    );
    expect(
      translateText('≈ {casualties} casualties · counter ≈ {counter}', 'zh', {
        casualties: '230–290',
        counter: '60–80',
      }),
    ).toBe('约 230–290 人伤亡 · 反击约 60–80');
  });
});

describe('engine messages for the v0.2 rules read naturally in Chinese', () => {
  it.each([
    [
      'Chenliu: Cao Cao plunders the city, seizing 749 gold and 2,120 food.',
      '陈留：曹操掠夺城池，夺得 749 金和 2,120 粮草。',
    ],
    ['Xiahou Yuan counterattacks: 123 casualties.', '夏侯渊发起反击，造成 123 人伤亡。'],
    ['Cao Cao ambushed Xiapi garrison: 400 casualties.', '曹操伏击下邳守军，造成 400 人伤亡。'],
    ['Li Ru was captured.', '李儒被俘。'],
    ['Cao Cao is taken prisoner by Dong Zhuo.', '曹操被董卓俘虏。'],
    ['Fire requires intellect 60.', '火计需要智力 60。'],
    ['Requires 4 tactic points.', '需要 4 点计策点。'],
    ['Defenders hold the city if the siege lasts 10 days.', '围城持续 10 日后，守方即告守城成功。'],
    [
      'The 10-day siege limit was reached. The defenders hold the city.',
      '围城已达 10 日上限，守方成功守住城池。',
    ],
    ['Attacking army breaks and flees the field.', '进攻军溃败，逃离战场。'],
    [
      'Cao Cao raids Xiapi, seizing 600 gold and 900 food.',
      '曹操袭掠下邳，夺得 600 金和 900 粮草。',
    ],
    ['The people of Xiapi rise up and cast out Cao Cao.', '下邳百姓起义，驱逐了曹操。'],
    ['Lü Bu abandons Dong Zhuo and defects to Cao Cao.', '吕布离开董卓，投奔曹操。'],
    ['Chenliu: Li Ru is released and returns to Luoyang.', '陈留：李儒获释，返回洛阳。'],
    ['The neighbouring lords unite against Yuan Shao.', '周边诸侯联合对抗袁绍。'],
  ])('%s', (source, expected) => {
    expect(translateText(source, 'zh')).toBe(expected);
    expect(translateText(source, 'en')).toBe(source);
  });
});
