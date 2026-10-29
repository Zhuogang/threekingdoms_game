import { expect, test, type Page } from '@playwright/test';

const key = 'hegemony-v0.3:autosave';
async function saved(page: Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
}

test('production saves preserve faction preparation and deterministic continuation', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./?lang=en');
  await page.getByRole('button', { name: 'New campaign', exact: true }).click();
  const advance = async (day: number) => {
    await page.getByRole('button', { name: 'Advance 10 days', exact: true }).click();
    await expect.poll(async () => (await saved(page)).state.absoluteDay).toBe(day);
    return saved(page);
  };
  const preparing = await advance(10);
  expect(preparing).toMatchObject({ format: 'hegemony.save', version: 3, ruleset: 'hegemony-3' });
  expect(preparing.state.factionObjectives.length).toBeGreaterThan(0);
  expect(
    preparing.state.factionObjectives.every(
      (objective: { factionId: string }) => objective.factionId !== preparing.state.playerFactionId,
    ),
  ).toBe(true);
  const continued = await advance(20);
  await page.evaluate(({ key, snapshot }) => localStorage.setItem(key, JSON.stringify(snapshot)), {
    key,
    snapshot: preparing,
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Advance 10 days', exact: true })).toBeVisible();
  expect((await saved(page)).state).toEqual(preparing.state);
  expect((await advance(20)).state).toEqual(continued.state);
  expect(errors).toEqual([]);
});
