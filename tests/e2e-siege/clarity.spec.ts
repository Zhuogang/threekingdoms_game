import { expect, test } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import { startWalkthrough } from '../../src/siege/ui/walkthrough';
import { expectNoPanelScroll, loadFixture, selectActor, snapshot } from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });
for (const locale of ['en', 'zh'] as const) {
  test(`${locale}: every actor's actions fit, unrelated actions are absent and unavailable reasons work on focus and touch`, async ({
    page,
  }) => {
    const state = createSiegeState(228);
    state.engines.push({ ...state.engines[0]!, id: 'test-tower', kind: 'tower', x: 13, y: 10 });
    await loadFixture(
      page,
      {
        state,
        playerSide: 'shu',
        phase: 'battle',
        facings: {},
        presentation: {
          openingStep: 6,
          bannersSeen: [1],
          dismissedHints: [],
          reportReadDay: state.day,
          walkthrough: { ...startWalkthrough(state), step: 4 },
        },
      },
      locale,
    );
    await expect(page.getByTestId('unit-list').locator('[data-testid^="select-wei-"]')).toHaveCount(
      0,
    );
    await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '4');
    for (const id of [
      ...state.units.filter((u) => u.side === 'shu').map((u) => u.id),
      ...state.engines.map((e) => e.id),
    ]) {
      await selectActor(page, id);
      await expectNoPanelScroll(page, 'action-panel');
      await expect(page.getByTestId('withdraw')).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId('selected-actor')).not.toContainText(/\d+,\d+/);
    }
    await selectActor(page, 'shu-weiyan');
    for (const action of ['suppress', 'raiseLadder', 'ram', 'buildWall'])
      await expect(page.getByTestId(`command-${action}`)).toHaveCount(0);
    const unavailable = page.getByTestId('action-panel').locator('[aria-disabled="true"]').first();
    const expected = await unavailable.getAttribute('title');
    await unavailable.focus();
    await expect(page.getByTestId('action-reason')).toHaveText(expected!);
    const before = await snapshot(page);
    // A touch/click must explain an unavailable action and preserve the game.
    await unavailable.dispatchEvent('click');
    await expect(page.getByTestId('action-reason')).toHaveText(expected!);
    expect(await snapshot(page)).toEqual(before);
    await selectActor(page, 'shu-captain-3');
    await expect(page.getByTestId('command-climb')).toHaveCount(0);
    await expect(page.getByTestId('command-coverEngine')).toHaveCount(0);
    await expect(page.getByTestId('idle-portrait')).toBeVisible();
    await expect(page.locator('.siege-map-notice')).toHaveCount(0); // hints wait for the walkthrough
  });
}
