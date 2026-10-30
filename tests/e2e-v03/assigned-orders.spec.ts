import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createV03Game } from '../../src/v03/initial-state';
import { executeV03Command } from '../../src/v03/commands';
import type { V03GameState } from '../../src/v03/types';
import { asSave } from './playability-fixtures';
import {
  openCity,
  showCityManagement,
  chooseWorkExecutor,
  confirmWork,
  closeCityWindow,
} from './ui-navigation';
const key = 'hegemony-v0.3:autosave';
async function current(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key);
}
function ready() {
  const state = createV03Game('cao', 1);
  for (const city of state.cities.filter((entry) => entry.factionId === 'cao'))
    Object.assign(city, { gold: 5000, food: 20000 });
  return state;
}
async function load(page: Page, state = ready(), lang = 'en') {
  await page.goto(`/?lang=${lang}`);
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key,
    raw: asSave(state),
  });
  await page.reload();
  await expect(page.locator('.v03-shell')).toBeVisible();
}
async function resources(page: Page, lang = 'en') {
  await openCity(page, lang === 'zh' ? '濮阳' : 'Puyang');
  await page.getByRole('button', { name: /Send supplies|调拨物资/ }).click();
  await page
    .locator('.v03-supply-menu')
    .getByRole('button', { name: /Send supplies|调拨物资/ })
    .click();
  await page
    .locator('.v03-supply-targets')
    .getByRole('button', { name: lang === 'zh' ? '陈留' : 'Chenliu', exact: true })
    .click();
  await page.getByLabel(lang === 'zh' ? '金钱' : 'Gold', { exact: true }).fill('100');
  await page.getByLabel(lang === 'zh' ? '粮食' : 'Food', { exact: true }).fill('200');
}
for (const width of [390, 1366, 1920])
  for (const lang of ['en', 'zh']) {
    test(`assign city work, review supplies, and diplomatic actions ${width} ${lang}`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({
        width,
        height: width === 390 ? 844 : width === 1366 ? 768 : 1080,
      });
      const before = ready();
      await load(page, before, lang);
      await showCityManagement(page);
      await page.getByRole('button', { name: /Recruit soldiers|征募士兵/, exact: true }).click();
      // Recruitment opens its review with the recommended executor already chosen.
      await expect(page.locator('.v03-assigned-officer')).toBeVisible();
      expect(await current(page)).toEqual(before);
      const officers = before.officers.filter(
        (entry) =>
          entry.alive &&
          entry.factionId === 'cao' &&
          entry.location.kind === 'city' &&
          entry.location.cityId === before.playerCapitalCityId,
      );
      const officer = officers.sort((a, b) => a.force - b.force)[0]!;
      await chooseWorkExecutor(page, lang === 'zh' ? officer.chinese : officer.name);
      await expect(page.locator('.v03-assigned-officer')).toContainText(
        lang === 'zh' ? officer.chinese : officer.name,
      );
      const expectedWork = executeV03Command(before, {
        type: 'cityAction',
        cityId: before.playerCapitalCityId,
        action: 'recruit',
        officerId: officer.id,
      });
      // The screen suggests a troop type the local officers can lead; this case uses infantry.
      await page
        .getByLabel(lang === 'zh' ? '招募兵种' : 'Recruit troop type', { exact: true })
        .selectOption('infantry');
      await confirmWork(page);
      await expect(page.locator('.v03-city-affairs')).toBeVisible();
      expect(await current(page)).toEqual(expectedWork.state);
      await resources(page, lang);
      const beforeRequest = await current(page);
      await page.keyboard.press('Escape');
      await expect(page.locator('.v03-supply-targets')).toBeVisible();
      expect(await current(page)).toEqual(beforeRequest);
      await page
        .locator('.v03-supply-targets')
        .getByRole('button', { name: lang === 'zh' ? '陈留' : 'Chenliu', exact: true })
        .click();
      await page
        .getByRole('button', { name: lang === 'zh' ? '查看方案' : 'Review proposal', exact: true })
        .click();
      await expect(page.locator('.v03-supply-review')).toBeVisible();
      await expect(page.locator('.v03-order-form')).toHaveCount(0);
      expect(await current(page)).toEqual(beforeRequest);
      const folder = '.artifacts/assigned-orders';
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: `${folder}/proposal-${width}-${lang}.png` });
      await page.keyboard.press('Escape');
      await expect(page.locator('.v03-supply-form')).toBeVisible();
      expect(await current(page)).toEqual(beforeRequest);
      await page
        .getByRole('button', { name: lang === 'zh' ? '查看方案' : 'Review proposal', exact: true })
        .click();
      await page
        .getByRole('button', { name: lang === 'zh' ? '提交征调' : 'Submit request', exact: true })
        .click();
      await expect(page.locator('.v03-supply-menu')).toBeVisible();
      const dispatched = executeV03Command(beforeRequest, {
        type: 'requestRequisition',
        sourceCityId: 'puyang',
        targetCityId: 'chenliu',
        requested: { gold: 100, food: 200, troops: 0 },
        requestedByDay: null,
      });
      expect(await current(page)).toEqual(dispatched.state);
      expect(dispatched.state.journeys).toHaveLength(beforeRequest.journeys.length + 1);
      await closeCityWindow(page);
      await page
        .getByRole('button', { name: lang === 'zh' ? '外交' : 'Diplomacy', exact: true })
        .click();
      await expect(page.locator('.v03-diplomacy-menu')).toBeVisible();
      const faction = before.factions.find((entry) => entry.id === 'liu')!;
      await page
        .locator('.v03-diplomacy-menu')
        .getByRole('button', { name: lang === 'zh' ? faction.chinese : faction.name, exact: true })
        .click();
      await expect(page.locator('.v03-faction-detail')).toBeVisible();
      await page.locator('.v03-faction-detail .v03-step-choice').click();
      const beforeDiplomacy = await current(page);
      await page.screenshot({ path: `${folder}/diplomacy-${width}-${lang}.png` });
      await page.keyboard.press('Escape');
      await expect(page.locator('.v03-faction-detail')).toBeVisible();
      expect(await current(page)).toEqual(beforeDiplomacy);
      await page.locator('.v03-faction-detail .v03-step-choice').click();
      await page.locator('.v03-diplomacy-confirm').getByRole('button').click();
      await expect(page.locator('.v03-faction-detail')).toBeVisible();
      const allied = executeV03Command(beforeDiplomacy, {
        type: 'proposeAlliance',
        targetFactionId: 'liu',
      });
      expect(await current(page)).toEqual(allied.state);
      await page.locator('.v03-faction-detail .v03-step-choice').click();
      await page.locator('.v03-diplomacy-confirm').getByRole('button').click();
      expect(await current(page)).toEqual(
        executeV03Command(allied.state, { type: 'breakAlliance', targetFactionId: 'liu' }).state,
      );
      await expect(page.locator('.v03-window-feedback')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.v03-diplomacy-menu')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('.v03-campaign-window')).toHaveCount(0);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollHeight > innerHeight ||
            document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
      expect(errors).toEqual([]);
    });
  }
for (const answer of ['reduce', 'wait', 'cancel'] as const)
  test(`supply proposal ${answer} returns to requests and follows existing rules`, async ({
    page,
  }) => {
    const before = ready();
    await load(page, before);
    await resources(page);
    await page.getByLabel('Gold', { exact: true }).fill('10000');
    await page.getByRole('button', { name: 'Review proposal', exact: true }).click();
    await page.getByRole('button', { name: 'Submit request', exact: true }).click();
    const proposal = await current(page);
    const order = proposal.requisitions.at(-1)!;
    await page.keyboard.press('Escape');
    await expect(page.locator('.v03-supply-menu')).toBeVisible();
    await page.locator('.v03-pending-proposal').click();
    expect(await current(page)).toEqual(proposal);
    if (answer === 'reduce') {
      await page.getByRole('button', { name: 'Accept reduced plan', exact: true }).click();
      await expect(page.locator('.v03-supply-reduce')).toBeVisible();
      await page.getByLabel('Gold to send', { exact: true }).fill('10000');
      await page.locator('.v03-supply-reduce').getByRole('button').click();
      await expect(page.locator('.v03-window-feedback')).toBeVisible();
      expect(await current(page)).toEqual(proposal);
      await page.getByLabel('Gold to send', { exact: true }).fill('50');
      await page.getByLabel('Food to send', { exact: true }).fill('100');
      await page.locator('.v03-supply-reduce').getByRole('button').click();
    } else
      await page
        .getByRole('button', {
          name: answer === 'wait' ? 'Wait for full plan' : 'Cancel',
          exact: true,
        })
        .click();
    await expect(page.locator('.v03-supply-menu')).toBeVisible();
    expect(await current(page)).toEqual(
      executeV03Command(proposal, {
        type: 'answerRequisition',
        requisitionId: order.id,
        answer,
        reduced: answer === 'reduce' ? { gold: 50, food: 100, troops: 0 } : undefined,
      }).state,
    );
  });

test('coalition invitation confirmation returns to diplomacy and keeps coalition rules', async ({
  page,
}) => {
  const before = ready();
  before.coalitionInvitations.push({
    id: 'invitation:test',
    eventId: 'anti-dong-coalition',
    targetFactionId: 'dong',
    memberFactionIds: ['liu', 'sun'],
    expiresMonthIndex: 3,
  });
  await load(page, before);
  await page.getByRole('button', { name: 'Diplomacy', exact: true }).click();
  await page.locator('.v03-coalition-entry').click();
  expect(await current(page)).toEqual(before);
  await page.getByRole('button', { name: 'Join coalition', exact: true }).click();
  await expect(page.locator('.v03-diplomacy-menu')).toBeVisible();
  expect(await current(page)).toEqual(
    executeV03Command(before, {
      type: 'acceptCoalitionInvitation',
      invitationId: 'invitation:test',
    }).state,
  );
});

test('campaign requisitions also review before creating a directive', async ({ page }) => {
  const before = ready();
  await load(page, before);
  await openCity(page, 'Puyang');
  await page.getByRole('button', { name: /Send supplies/ }).click();
  await page
    .locator('.v03-supply-menu')
    .getByRole('button', { name: 'Order a march', exact: true })
    .click();
  await page
    .locator('.v03-supply-targets')
    .getByRole('button', { name: 'Luoyang', exact: true })
    .click();
  await page.getByLabel('Troops', { exact: true }).fill('100000');
  await page.getByRole('button', { name: 'Review proposal', exact: true }).click();
  expect(await current(page)).toEqual(before);
  await page.getByRole('button', { name: 'Issue order', exact: true }).click();
  const expected = executeV03Command(before, {
    type: 'issueCampaignDirective',
    sourceCityId: 'puyang',
    targetCityId: 'luoyang',
    intent: 'conquer',
    requestedTroops: 100000,
    requestedByDay: null,
  });
  expect(expected.ok).toBe(true);
  expect(await current(page)).toEqual(expected.state);
  await expect(page.locator('.v03-supply-proposal')).toBeVisible();
  await page.getByRole('button', { name: 'Wait for full plan', exact: true }).click();
  await expect(page.locator('.v03-supply-menu')).toBeVisible();
  expect(await current(page)).toEqual(
    executeV03Command(expected.state, {
      type: 'answerCampaignDirective',
      directiveId: expected.orderId!,
      answer: 'wait',
    }).state,
  );
});

test('a declined alliance returns with its result and finished campaigns block diplomacy', async ({
  page,
}) => {
  let before = ready();
  while (
    executeV03Command(before, { type: 'proposeAlliance', targetFactionId: 'dong' }).state.alliances
      .length
  )
    before = { ...before, rng: before.rng + 1 };
  await load(page, before);
  await page.getByRole('button', { name: 'Diplomacy', exact: true }).click();
  await page
    .locator('.v03-diplomacy-menu')
    .getByRole('button', {
      name: before.factions.find((entry) => entry.id === 'dong')!.name,
      exact: true,
    })
    .click();
  await page.locator('.v03-faction-detail .v03-step-choice').click();
  await page.locator('.v03-diplomacy-confirm').getByRole('button').click();
  await expect(page.locator('.v03-faction-detail')).toBeVisible();
  await expect(page.locator('.v03-window-feedback')).toContainText('declined');
  expect(await current(page)).toEqual(
    executeV03Command(before, { type: 'proposeAlliance', targetFactionId: 'dong' }).state,
  );
  const finished = { ...before, phase: 'finished' as const, winnerFactionId: 'cao' };
  await load(page, finished);
  await page.getByRole('button', { name: 'Diplomacy', exact: true }).click();
  await page.locator('.v03-diplomacy-menu').getByRole('button').first().click();
  await page.locator('.v03-faction-detail .v03-step-choice').click();
  await expect(page.locator('.v03-diplomacy-confirm').getByRole('button')).toBeDisabled();
  expect(await current(page)).toEqual(finished);
});
