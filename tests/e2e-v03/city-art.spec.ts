import { expect, test } from '@playwright/test';

const examples = [
  ['luoyang', '洛阳', 'Luoyang', 'imperial'],
  ['chenliu', '陈留', 'Chenliu', 'plains'],
  ['beiping', '北平', 'Beiping', 'frontier'],
  ['tianshui', '天水', 'Tianshui', 'loess'],
  ['chengdu', '成都', 'Chengdu', 'basin'],
  ['hanzhong', '汉中', 'Hanzhong', 'mountain'],
  ['xiangyang', '襄阳', 'Xiangyang', 'river'],
  ['jianye', '建业', 'Jianye', 'jiangnan'],
] as const;

for (const width of [1366, 390])
  for (const lang of ['zh', 'en'] as const)
    test(`all regional city paintings load and fit ${width} ${lang}`, async ({
      page,
    }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/?lang=${lang}`);
      await page
        .getByRole('button', { name: lang === 'zh' ? '新战役' : 'New campaign', exact: true })
        .click();
      const before = await page.evaluate(
        () => JSON.parse(localStorage.getItem('hegemony-v0.3:autosave')!).state,
      );
      for (const [id, zh, en, region] of examples) {
        await page.getByRole('button', { name: lang === 'zh' ? zh : en, exact: true }).click();
        const dialog = page.locator('.v03-campaign-window');
        const art = dialog.locator('.v03-city-illustration');
        await expect(art).toHaveAttribute('data-city-art', region);
        const image = art.locator('img');
        await expect(image).toHaveAttribute('src', `/assets/v03/cities/city-${region}-ink-02.webp`);
        await expect(image).toHaveJSProperty('naturalWidth', 512);
        const dimensions = await dialog.evaluate((node) => ({
          width: node.clientWidth,
          content: node.querySelector('.v03-window-body')!.scrollWidth,
          art: node.querySelector('.v03-city-illustration')!.getBoundingClientRect().toJSON(),
          hero: node.querySelector('.v03-city-hero')!.getBoundingClientRect().toJSON(),
        }));
        expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
        expect(dimensions.art.width).toBeGreaterThanOrEqual(240);
        expect(dimensions.art.height / dimensions.art.width).toBeCloseTo(0.75, 2);
        expect(dimensions.art.x).toBeGreaterThanOrEqual(dimensions.hero.x);
        expect(dimensions.art.right).toBeLessThanOrEqual(dimensions.hero.right + 1);
        await expect(dialog.locator('.v03-city-overview > .v03-stat-grid')).toBeVisible();
        if (id === 'luoyang' || id === 'hanzhong')
          await page.screenshot({ path: testInfo.outputPath(`${id}-${width}-${lang}.png`) });
        await dialog.locator('.v03-city-op').last().scrollIntoViewIfNeeded();
        await expect(dialog.locator('.v03-city-op').last()).toBeInViewport();
        await expect(dialog.locator('.v03-window-footer button').first()).toBeInViewport();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
      }
      expect(
        await page.evaluate(
          () => JSON.parse(localStorage.getItem('hegemony-v0.3:autosave')!).state,
        ),
      ).toEqual(before);
      expect(errors).toEqual([]);
    });

test('missing city art preserves actions and another city still loads its illustration', async ({
  page,
}) => {
  await page.route('**/assets/v03/cities/city-plains-ink-02.webp', (route) => route.abort());
  await page.goto('/?lang=zh');
  await page.getByRole('button', { name: '新战役', exact: true }).click();
  await page.getByRole('button', { name: '陈留', exact: true }).click();
  await expect(page.locator('.v03-city-art-fallback')).toHaveText('陈');
  await expect(page.locator('.v03-city-section-affairs .v03-city-ops')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '洛阳', exact: true }).click();
  await expect(page.locator('.v03-city-illustration img')).toHaveJSProperty('naturalWidth', 512);
  await expect(page.locator('.v03-city-art-fallback')).toHaveCount(0);
});
