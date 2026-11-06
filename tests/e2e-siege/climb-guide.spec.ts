import { expect, test, type Page } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { climbGuide, climbGuideText } from '../../src/siege/ui/climbGuide';
import { siegeText, type SiegeLocale } from '../../src/siege/i18n';
import {
  begin,
  cellPoint,
  clickPlate,
  panToCell,
  clickCell,
  closeReport,
  endDay,
  expectNoPanelScroll,
  loadFixture,
  selectActor,
  snapshot,
  start,
} from './helpers';

test.use({ viewport: { width: 1280, height: 720 } });
async function loadSkippedBattle(
  page: Page,
  state: ReturnType<typeof createSiegeState>,
  locale: SiegeLocale,
) {
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
        dismissedHints: ['wall', 'trench', 'ladder', 'frontage', 'innerWall'],
        reportReadDay: 1,
        walkthrough: { status: 'skipped', step: 1, startDay: 1, logStart: 0 },
      },
    },
    locale,
  );
  await dismissCards(page);
  await expect(page.getByTestId('walkthrough')).toHaveCount(0);
}
async function expectGuide(page: Page, locale: SiegeLocale, kind: string) {
  const game = await snapshot(page);
  const id = await page.getByTestId('selected-actor').locator('h3').textContent();
  const unit = game.state.units.find(
    (u) => (locale === 'zh' ? u.officer.chinese : u.officer.name) === id,
  )!;
  const guide = climbGuide(game.state, unit.id)!;
  expect(guide.kind).toBe(kind);
  const sentence = climbGuideText(guide, locale, (unitId) => {
    const other = game.state.units.find((u) => u.id === unitId)!;
    return locale === 'zh' ? other.officer.chinese : other.officer.name;
  });
  await expect(page.getByTestId('action-context')).toContainText(sentence);
  if (kind !== 'ready') {
    await expect(page.getByTestId('command-climb')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('command-climb')).toHaveAttribute('title', sentence);
    await page.getByTestId('command-climb').hover();
    await expect(page.getByTestId('action-reason')).toHaveText(sentence);
  }
  await expectNoPanelScroll(page, 'action-panel');
  return sentence;
}
async function clickGreyClimb(page: Page) {
  // aria-disabled is intentionally explanatory and still accepts a real mouse click.
  const rect = (await page.getByTestId('command-climb').boundingBox())!;
  await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
}
async function dismissCards(page: Page) {
  for (let i = 0; i < 12; i++) {
    const counter = page.getByTestId('counter-dismiss');
    const hint = page.locator('[data-testid^="hint-"] button');
    if (await counter.count()) await counter.click();
    else if (await hint.count()) await hint.first().click();
    else break;
  }
  await expect(page.getByTestId('counter-card')).toHaveCount(0);
  await expect(page.locator('[data-testid^="hint-"]')).toHaveCount(0);
}
async function expectSkipClearOfText(page: Page) {
  const overlap = await page.getByTestId('walkthrough').evaluate((box) => {
    const skip = box.querySelector('button')!.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(box.querySelector('p')!);
    return [...range.getClientRects()].some(
      (r) =>
        r.left < skip.right && r.right > skip.left && r.top < skip.bottom && r.bottom > skip.top,
    );
  });
  expect(overlap).toBe(false);
}
async function expectLabel(page: Page, cell: string, text: string) {
  await expect(page.locator(`[data-overlay="tutorial"][data-cell="${cell}"]`)).toHaveCount(1);
  const label = page.getByTestId('climb-base-label');
  await expect(label).toHaveAttribute('data-cell', cell);
  await expect(label).toHaveText(text);
  await expect(label).toHaveCSS('pointer-events', 'none');
  const size = await label.locator('text').evaluate((el) => {
    const matrix = (el as SVGGraphicsElement).getScreenCTM()!;
    return parseFloat(getComputedStyle(el).fontSize) * Math.hypot(matrix.a, matrix.b);
  });
  expect(size).toBeGreaterThanOrEqual(11.9);
  expect(size).toBeLessThanOrEqual(12.1);
}

for (const locale of ['zh', 'en'] as const) {
  for (const route of ['ladder', 'wallFoot'] as const)
    for (const occupied of [false, true])
      test(`${locale}: open ${route} breach ${occupied ? 'explains the moved ally' : 'mounts in one click'}`, async ({
        page,
      }) => {
        const state = createSiegeState(228),
          wangping = state.units.find((u) => u.id === 'shu-wangping')!,
          weiyan = state.units.find((u) => u.id === 'shu-weiyan')!;
        const base = { x: 6, y: route === 'ladder' ? 10 : 8, level: 'ground' as const };
        Object.assign(wangping, base);
        Object.assign(weiyan, { x: 6, y: 7, level: 'wall', moved: true });
        state.units = occupied ? [wangping, weiyan] : [wangping];
        state.footholds['6,7'] = T.footholdComplete;
        state.engines =
          route === 'ladder' ? [{ ...state.engines[0]!, raisedAt: { x: 6, y: 7 } }] : [];
        if (route === 'wallFoot')
          state.trenchFill['6,8'] = state.trenchFill['6,9'] = T.trenchCapacity;
        await loadSkippedBattle(page, state, locale);
        await selectActor(page, wangping.id);
        await expectGuide(page, locale, occupied ? 'allyAbove' : 'ready');
        const before = await snapshot(page);
        if (occupied) {
          await clickGreyClimb(page);
          expect(await snapshot(page)).toEqual(before);
          await expectLabel(
            page,
            `6,${base.y},ground`,
            siegeText(locale, route === 'ladder' ? 'climbBaseLabel' : 'climbWallFootLabel'),
          );
        } else {
          await page.getByTestId('command-climb').click();
          await expect(page.getByTestId('climb-forecast')).toHaveCount(0);
          const after = await snapshot(page);
          expect(after.state.units[0]).toMatchObject({
            x: 6,
            y: 7,
            level: 'wall',
            moved: true,
            acted: false,
          });
          expect(after.state.footholds['6,7']).toBe(T.footholdComplete);
        }
        await expectNoPanelScroll(page, 'action-panel');
      });
  test(`${locale}: default guide, grey explanation and walkthrough stay readable at three zooms`, async ({
    page,
  }) => {
    await start(page, locale);
    await begin(page, locale);
    await selectActor(page, 'shu-weiyan');
    const state = (await snapshot(page)).state,
      guide = climbGuide(state, 'shu-weiyan')!;
    if (!('base' in guide)) throw new Error(`Expected a base guide, got ${guide.kind}`);
    const sentence = await expectGuide(page, locale, guide.kind);
    const before = await snapshot(page);
    await clickGreyClimb(page);
    expect(await snapshot(page)).toEqual(before);
    await expect(page.getByTestId('action-reason')).toHaveText(sentence);
    for (const zoom of [75, 100, 150]) {
      await page.getByRole('button', { name: `${zoom}%`, exact: true }).click();
      await expectLabel(
        page,
        `${guide.base!.x},${guide.base!.y},ground`,
        siegeText(locale, 'climbUnraisedLabel'),
      );
      await expectSkipClearOfText(page);
    }
    await selectActor(page, 'starting-ladder-1');
    await page.getByTestId('command-raiseLadder').click();
    await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '3');
    await expectSkipClearOfText(page);
    await expectNoPanelScroll(page, 'action-panel');
  });
  for (const [unitId, ladderId, x, beside] of [
    ['shu-weiyan', 'starting-ladder-1', 6, 5],
    ['shu-captain-2', 'starting-ladder-2', 10, 11],
  ] as const)
    for (const moveFirst of [false, true])
      test(`${locale}: ${unitId} deploys beside base and ${moveFirst ? 'moves then raises' : 'raises then moves'} on day one`, async ({
        page,
      }) => {
        const state = createSiegeState(228);
        const defender = state.units.find((u) => u.x === x && u.y === 7)!;
        Object.assign(defender, { x, y: 2 });
        await loadFixture(
          page,
          {
            state,
            playerSide: 'shu',
            phase: 'deploy',
            facings: {},
            presentation: {
              openingStep: 6,
              bannersSeen: [],
              dismissedHints: [],
              walkthrough: { status: 'skipped', step: 1, startDay: 1, logStart: 0 },
            },
          },
          locale,
        );
        await selectActor(page, unitId);
        await clickCell(page, 'deploy', `${beside},10,ground`);
        expect((await snapshot(page)).state.units.find((u) => u.id === unitId)).toMatchObject({
          x: beside,
          y: 10,
        });
        await begin(page, locale);
        await dismissCards(page);
        const move = async () => {
          await selectActor(page, unitId);
          await page.getByTestId('command-move').click();
          await clickCell(page, 'reachable', `${x},10,ground`);
        };
        const raise = async () => {
          await selectActor(page, ladderId);
          await page.getByTestId('command-raiseLadder').click();
        };
        if (moveFirst) {
          await move();
          await raise();
        } else {
          await raise();
          await move();
        }
        await selectActor(page, unitId);
        await expectGuide(page, locale, 'ready');
        await page.getByTestId('command-climb').click();
        await expect(page.getByTestId('climb-forecast')).toBeVisible();
        await page.getByTestId('climb-confirm').click();
        const after = await snapshot(page);
        expect(after.state.day).toBe(1);
        expect(after.state.footholds[`${x},7`]).toBe(T.climbFoothold);
        await expectGuide(page, locale, 'acted');
      });
  test(`${locale}: moved approach explains tomorrow, then the next morning can reach the base`, async ({
    page,
  }) => {
    const state = createSiegeState(228),
      unit = state.units.find((u) => u.id === 'shu-weiyan')!;
    Object.assign(unit, { x: 5, y: 10, moved: true });
    const distant = state.units.find((u) => u.side === 'wei')!;
    Object.assign(distant, { x: 12, y: 2, level: 'wall' });
    state.units = [unit, distant];
    state.engines = [{ ...state.engines[0]!, raisedAt: { x: 6, y: 7 } }];
    await loadSkippedBattle(page, state, locale);
    await selectActor(page, unit.id);
    await expectGuide(page, locale, 'walkToBase');
    const before = await snapshot(page);
    await clickGreyClimb(page);
    expect(await snapshot(page)).toEqual(before);
    await endDay(page);
    await closeReport(page);
    await dismissCards(page);
    await selectActor(page, unit.id);
    await page.getByTestId('command-move').click();
    await clickCell(page, 'reachable', '6,10,ground');
    expect((await snapshot(page)).state.units[0]).toMatchObject({ x: 6, y: 10, moved: true });
  });
  test(`${locale}: double-clicking a unit cell selects without moving, and another plate selects its owner`, async ({
    page,
  }) => {
    await loadSkippedBattle(page, createSiegeState(228), locale);
    await selectActor(page, 'shu-jiangwei');
    const before = await snapshot(page),
      unit = before.state.units.find((u) => u.id === 'shu-weiyan')!;
    await panToCell(page, unit);
    const point = await cellPoint(page, unit);
    await page.mouse.dblclick(point.x, point.y);
    await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', unit.id);
    expect(await snapshot(page)).toEqual(before);
    const other = before.state.units.find((u) => u.id === 'shu-wuyi')!;
    await panToCell(page, other);
    await clickPlate(page, other.id);
    await expect(page.getByTestId('siege-map')).toHaveAttribute('data-selected', other.id);
    expect(await snapshot(page)).toEqual(before);
    await expectNoPanelScroll(page, 'action-panel');
  });
  test(`${locale}: Fill trench reaches the northern green cell using its hit centre`, async ({
    page,
  }) => {
    const state = createSiegeState(228),
      unit = state.units.find((u) => u.id === 'shu-weiyan')!;
    Object.assign(unit, { x: 6, y: 10 });
    state.units = [unit];
    state.engines = [];
    await loadSkippedBattle(page, state, locale);
    await selectActor(page, unit.id);
    await page.getByTestId('command-fillTrench').click();
    await clickCell(page, 'reachable', '6,9,ground');
    const after = await snapshot(page);
    expect(after.state.trenchFill['6,9']).toBe(T.infantryFill);
    expect(after.state.units[0]).toMatchObject({ x: 6, y: 10, acted: true });
    await expectNoPanelScroll(page, 'action-panel');
  });
  test(`${locale}: a defender above the ladder explains attacking and leaves Attack usable`, async ({
    page,
  }) => {
    const state = createSiegeState(228),
      unit = state.units.find((u) => u.id === 'shu-weiyan')!,
      defender = state.units.find((u) => u.x === 6 && u.y === 7)!;
    Object.assign(unit, { x: 6, y: 10 });
    state.units = [unit, defender];
    state.engines = [{ ...state.engines[0]!, raisedAt: { x: 6, y: 7 } }];
    await loadSkippedBattle(page, state, locale);
    await selectActor(page, unit.id);
    await expectGuide(page, locale, 'defenderAbove');
    const before = await snapshot(page);
    await clickGreyClimb(page);
    expect(await snapshot(page)).toEqual(before);
    await expectLabel(page, '6,10,ground', siegeText(locale, 'climbBaseLabel'));
    await page.getByTestId('command-attack').click();
    await expectNoPanelScroll(page, 'attack-forecast');
  });
  test(`${locale}: a filled wall foot has a labelled clickable frame and preserves the ally explanation`, async ({
    page,
  }) => {
    const state = createSiegeState(228),
      unit = state.units.find((u) => u.id === 'shu-weiyan')!,
      ally = state.units.find((u) => u.id === 'shu-wangping')!;
    Object.assign(unit, { x: 6, y: 9 });
    Object.assign(ally, { x: 6, y: 7, level: 'wall', moved: true });
    state.units = [unit, ally];
    state.engines = [];
    state.trenchFill['6,8'] = state.trenchFill['6,9'] = T.trenchCapacity;
    await loadSkippedBattle(page, state, locale);
    await selectActor(page, unit.id);
    await expectGuide(page, locale, 'walkToBase');
    await clickGreyClimb(page);
    await expectLabel(page, '6,8,ground', siegeText(locale, 'climbWallFootLabel'));
    await page.getByTestId('command-move').click();
    await clickCell(page, 'reachable', '6,8,ground');
    await expectGuide(page, locale, 'allyAbove');
    await clickGreyClimb(page);
    await expectLabel(page, '6,8,ground', siegeText(locale, 'climbWallFootLabel'));
    await expectNoPanelScroll(page, 'action-panel');
  });
}
