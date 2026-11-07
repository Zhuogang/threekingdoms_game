import { mkdir } from 'node:fs/promises';
import { expect, type Page } from '@playwright/test';
import { siegeSaveKey, type SiegeSave } from '../../src/siege/save';

export async function snapshot(page: Page) {
  await page.waitForFunction(() => typeof window.__siegeDev?.snapshot === 'function');
  return page.evaluate(() => window.__siegeDev!.snapshot());
}
/** Roster selection may tween the camera. Observe three identical animation frames. */
export async function waitForCamera(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let previous: string | null = null;
        let identical = 0;
        const sample = () => {
          const current = document
            .querySelector('[data-testid="siege-map"]')!
            .getAttribute('viewBox');
          identical = current === previous ? identical + 1 : 1;
          previous = current;
          if (identical >= 3) resolve();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
}
export async function selectActor(page: Page, id: string) {
  const side = await page.locator('.siege-app').getAttribute('data-player-side');
  if ((side === 'wei' && !id.startsWith('wei-')) || (side !== 'wei' && id.startsWith('wei-'))) {
    const game = await snapshot(page),
      unit = game.state.units.find((u) => u.id === id)!;
    await panToCell(page, unit);
    await clickPlate(page, id);
    return;
  }
  const picker = page.getByTestId('unit-list');
  if (!(await picker.evaluate((el) => (el as HTMLDetailsElement).open)))
    await picker.locator('summary').click();
  await page.getByTestId(`select-${id}`).click();
  await waitForCamera(page);
  await picker.locator('summary').click();
}
export async function expectNoPanelScroll(page: Page, testId: string) {
  await expect(page.getByTestId(testId)).toBeVisible();
  for (const id of [testId, 'sidebar-content']) {
    const dimensions = await page.getByTestId(id).evaluate((el) => {
      const top = el.getBoundingClientRect().top - el.scrollTop;
      // Name what sets the scroll height, so that a failure says where to look.
      const edge = [...el.querySelectorAll('*')]
        .filter((child) => {
          const reach = child.getBoundingClientRect().bottom - top;
          return Math.abs(reach - el.scrollHeight) < 4;
        })
        .slice(0, 3)
        .map((child) => `${child.tagName}.${child.getAttribute('data-testid') ?? child.className}`);
      return { scroll: el.scrollHeight, height: el.clientHeight, edge };
    });
    expect(dimensions.scroll, `${id}: ${JSON.stringify(dimensions)}`).toBeLessThanOrEqual(
      dimensions.height,
    );
  }
}
export async function shot(page: Page, name: string) {
  await mkdir('.artifacts/siege/screens', { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `.artifacts/siege/screens/${name}.png`, animations: 'disabled' });
}
/** Click the cell's SVG geometry, avoiding artwork bounds, strokes and reordered unit layers. */
export async function clickCell(page: Page, overlay: string, cell: string) {
  await expect(page.locator(`[data-overlay="${overlay}"][data-cell="${cell}"]`)).toHaveCount(1);
  const [x, y, level] = cell.split(',');
  const target = {
    x: Number(x),
    y: Number(y),
    level: level as 'ground' | 'wall',
  };
  await panToCell(page, target);
  const position = await cellPoint(page, target);
  await page.mouse.click(position.x, position.y);
}
export async function closeReport(page: Page) {
  await expect(page.getByTestId('morning-report')).toBeVisible();
  await page.getByTestId('report-close').click();
}
export async function dismissCounters(page: Page) {
  for (let i = 0; i < 8 && (await page.getByTestId('counter-card').count()); i++)
    await page.getByTestId('counter-dismiss').click();
}
export async function start(page: Page, locale: 'en' | 'zh' = 'en', seed = 228) {
  await page.goto(`/?lang=${locale}&siegeSeed=${seed}`);
  await page.getByTestId('chencang-campaign').getByTestId('start-shu').click();
  await page
    .getByRole('button', { name: locale === 'en' ? 'Skip opening' : '跳过开场', exact: true })
    .click();
  await expect(page.locator('[data-phase="deploy"]')).toBeVisible();
}
export async function begin(page: Page, locale: 'en' | 'zh' = 'en') {
  await page
    .getByRole('button', { name: locale === 'en' ? 'Begin siege' : '开始攻城', exact: true })
    .click();
  await page
    .getByTestId('replay-skip')
    .evaluateAll((buttons) => (buttons[0] as HTMLButtonElement | undefined)?.click());
  await page.getByTestId('banner-act1').getByRole('button').click();
  await closeReport(page);
}
export async function endDay(page: Page) {
  await page.getByTestId('end-day').click();
  await expect(page.getByTestId('siege-resolving')).toHaveCount(0);
  const skip = page.getByTestId('replay-skip');
  // Presence and click happen in one browser task: a short replay can finish
  // between locator actionability checks. An already finished replay is fine.
  await skip.evaluateAll((buttons) => (buttons[0] as HTMLButtonElement | undefined)?.click());
  await expect(skip).toHaveCount(0);
}
export async function loadFixture(page: Page, game: SiegeSave, locale: 'en' | 'zh' = 'en') {
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    },
    { key: siegeSaveKey(game.playerSide ?? 'shu'), value: JSON.stringify(game) },
  );
  await page.goto(`/?lang=${locale}#chencang/load`);
  await expect(
    page.locator(`[data-phase="${game.state.outcome ? 'ending' : game.phase}"]`),
  ).toBeVisible();
}

/** The same disjoint geometry as pointer input, transformed through the live camera. */
export async function cellPoint(
  page: Page,
  cell: import('../../src/siege/rules/types').SiegePosition,
) {
  await page.waitForFunction(() => Boolean(window.__siegeGeometry));
  return page.getByTestId('siege-map').evaluate((svg, p) => {
    const r = window.__siegeGeometry!.hitRect(p);
    if (!r) throw new Error(`No hit rectangle for ${JSON.stringify(p)}`);
    const point = new DOMPoint((r[0] + r[2]) / 2, (r[1] + r[3]) / 2).matrixTransform(
      (svg as SVGSVGElement).getScreenCTM()!,
    );
    return { x: point.x, y: point.y };
  }, cell);
}
export async function panToCell(
  page: Page,
  cell: import('../../src/siege/rules/types').SiegePosition,
) {
  await page.waitForFunction(() => Boolean(window.__siegeGeometry));
  const at = await page.evaluate((p) => window.__siegeGeometry!.anchor(p), cell);
  const box = (await page.locator('.siege-minimap').boundingBox())!;
  await page.mouse.click(box.x + (at[0] / 3072) * box.width, box.y + (at[1] / 1536) * box.height);
}
export async function clickPlate(page: Page, id: string) {
  const plate = page.locator(`[data-nameplate="${id}"]`);
  const at = await plate.evaluate((el) => {
    const group = el as SVGGElement,
      svg = group.ownerSVGElement!;
    const point = new DOMPoint(46, 13)
      .matrixTransform(group.getScreenCTM()!)
      .matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: point.x, y: point.y };
  });
  const mini = (await page.locator('.siege-minimap').boundingBox())!;
  await page.mouse.click(mini.x + (at.x / 3072) * mini.width, mini.y + (at.y / 1536) * mini.height);
  const p = await plate.evaluate((el) => {
    const r = el.querySelector('rect')!;
    const point = new DOMPoint(
      r.width.baseVal.value / 2,
      r.height.baseVal.value / 2,
    ).matrixTransform((el as SVGGElement).getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(p.x, p.y);
}
