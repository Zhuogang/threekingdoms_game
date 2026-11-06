import { expect, test } from '@playwright/test';
import { createRenderScene } from '../../src/siege/dev/renderScenes';
import { clickPlate, panToCell, shot } from './helpers';
test.use({ viewport: { width: 1280, height: 720 } });
for (const zoom of [1, 0.75])
  test(`all living units have plates and true-depth silhouettes at ${zoom * 100}%`, async ({
    page,
  }) => {
    await page.goto('/?siege-map&scene=visible');
    const map = page.getByTestId('siege-map');
    await expect(map).toHaveAttribute('data-ready', 'true');
    const fixture = createRenderScene('visible');
    for (const unit of fixture.state.units) {
      await page.getByTestId(`zoom-${zoom}`).click();
      await panToCell(page, unit);
      await expect(map.locator(`[data-nameplate="${unit.id}"]`)).toBeVisible();
      await expect(map.locator(`[data-unit="${unit.id}"]`)).toHaveCount(1);
      await clickPlate(page, unit.id);
      await expect(page.getByTestId('preview-selection')).toHaveText(unit.id);
    }
    const gate = 'wei-haozhao';
    await panToCell(
      page,
      fixture.state.units.find((u) => u.id === gate)!,
    );
    await expect(map.locator(`[data-covered-unit="${gate}"]`)).toHaveCount(0);
    const cover = map.locator('[data-covered-unit]').first();
    expect(
      await cover.evaluate((el) => Boolean(el.closest('[mask]') && el.closest('[filter]'))),
    ).toBe(true);
    await expect(map.locator('feFlood[flood-color="#ffd23c"]')).toHaveCount(1);
    await shot(page, `visible-${zoom * 100}`);
  });
