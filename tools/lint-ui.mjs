import { readFileSync, readdirSync } from 'node:fs';
const css = readFileSync('src/v03/styles.css', 'utf8');
const outsideTokens = css.replace(/^:root\s*\{[^}]*\}/, '');
if (/#[0-9a-f]{3,8}\b/i.test(outsideTokens))
  throw new Error('Raw CSS color outside the design-token block.');
if (/font-size:\s*(?:[0-9]|10)px/.test(css))
  throw new Error('Text smaller than the minimum UI type scale.');
for (const file of readdirSync('src/v03/ui', { recursive: true }).filter((file) =>
  /\.tsx?$/.test(file),
)) {
  const source = readFileSync(`src/v03/ui/${file}`, 'utf8');
  if (source.split('\n').length > 600) throw new Error(`UI module exceeds 600 lines: ${file}`);
  if (!file.includes('kit') && /<(?:button|input|select)[\s>]/.test(source))
    throw new Error(`Native control bypasses kit: ${file}`);
}
console.log('UI tokens, type scale, control kit and module-size checks passed.');
