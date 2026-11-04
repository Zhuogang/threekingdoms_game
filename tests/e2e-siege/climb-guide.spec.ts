import { expect, test, type Page } from '@playwright/test';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { climbGuide, climbGuideText } from '../../src/siege/ui/climbGuide';
import { siegeText, type SiegeLocale } from '../../src/siege/i18n';
import {
  begin,
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
  test(`${locale}: default deployment raises and approaches on day one, then reaches the base on day two`, async ({
    page,
  }) => {
    await start(page, locale);
    await begin(page, locale);
    await selectActor(page, 'shu-weiyan');
    await expect(page.getByTestId('action-reason')).toHaveText(siegeText(locale, 'actionReady'));
    const sentence = await expectGuide(page, locale, 'ladderNotRaised');
    await expectLabel(page, '18,19,ground', siegeText(locale, 'climbUnraisedLabel'));
    // Both walkthrough cells remain, with the nearest guide base deduplicated.
    await expect(page.locator('[data-overlay="tutorial"]')).toHaveCount(2);
    const before = await snapshot(page);
    await clickGreyClimb(page);
    expect(await snapshot(page)).toEqual(before);
    await expect(page.getByTestId('action-reason')).toHaveText(sentence);
    await expect(page.getByTestId('climb-base-label')).toBeInViewport({ ratio: 1 });
    for (const zoom of [75, 100, 150]) {
      await page.getByRole('button', { name: `${zoom}%`, exact: true }).click();
      await expectLabel(page, '18,19,ground', siegeText(locale, 'climbUnraisedLabel'));
    }
    await selectActor(page, 'starting-ladder-1');
    await expect(page.getByTestId('action-context')).toHaveText(
      siegeText(locale, 'contextRaiseLadder'),
    );
    await expectNoPanelScroll(page, 'action-panel');
    await page.getByTestId('command-raiseLadder').click();
    await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '3');
    await expect(page.getByTestId('walkthrough')).toContainText(siegeText(locale, 'walk3'));
    await expectSkipClearOfText(page);
    await expect(page.getByTestId('end-day')).toHaveClass(/siege-pulse/);
    await selectActor(page, 'shu-weiyan');
    await expectGuide(page, locale, 'walkToBase');
    await expectLabel(page, '18,19,ground', siegeText(locale, 'climbBaseLabel'));
    await page.getByRole('button', { name: '100%', exact: true }).click();
    await page.getByTestId('command-move').click();
    await clickCell(page, 'reachable', '18,20,ground');
    expect((await snapshot(page)).state.units.find((u) => u.id === 'shu-weiyan')).toMatchObject({
      x: 18,
      y: 20,
      moved: true,
    });
    await expectGuide(page, locale, 'walkToBase');
    await expect(page.getByTestId('action-context')).toContainText(
      siegeText(locale, 'climbMoved', { n: 1 }),
    );
    await expect(page.getByTestId('end-day')).toHaveClass(/siege-pulse/);
    const moved = await snapshot(page);
    await clickGreyClimb(page);
    expect(await snapshot(page)).toEqual(moved);
    await expectGuide(page, locale, 'walkToBase');
    await endDay(page);
    await closeReport(page);
    await dismissCards(page);
    await selectActor(page, 'shu-weiyan');
    await expect(page.getByTestId('end-day')).not.toHaveClass(/siege-pulse/);
    await page.getByTestId('command-move').click();
    // The unit's own head covers this northern cell's centre.
    await clickCell(page, 'reachable', '18,19,ground');
    const morning = await snapshot(page);
    expect(morning.state.day).toBe(2);
    expect(morning.state.units.find((u) => u.id === 'shu-weiyan')).toMatchObject({
      x: 18,
      y: 19,
      moved: true,
    });
    await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '4');
    await expectSkipClearOfText(page);
    const guide = climbGuide(morning.state, 'shu-weiyan')!;
    expect(['ready', 'defenderAbove']).toContain(guide.kind);
    await expectGuide(page, locale, guide.kind);
    if (guide.kind === 'ready') {
      await expect(page.getByTestId('command-climb')).toHaveAttribute('aria-disabled', 'false');
      await page.getByTestId('command-climb').click();
      await expectNoPanelScroll(page, 'climb-forecast');
      await page.getByTestId('climb-confirm').click();
      const foothold = `${guide.top.x},${guide.top.y}`;
      expect((await snapshot(page)).state.footholds[foothold]).toBe(
        (morning.state.footholds[foothold] ?? 0) + guide.gain,
      );
      await expectGuide(page, locale, 'acted');
    } else if (guide.kind === 'defenderAbove') {
      const defender = morning.state.units.find((u) => u.id === guide.defenderId)!;
      await expect(page.getByTestId('action-context')).toContainText(
        locale === 'zh' ? defender.officer.chinese : defender.officer.name,
      );
      await expect(page.getByTestId('command-attack')).toHaveAttribute('aria-disabled', 'false');
      await page.getByTestId('command-attack').click();
      await expectNoPanelScroll(page, 'attack-forecast');
    }
  });

  for (const [unitId, ladderId, x] of [
    ['shu-weiyan', 'starting-ladder-1', 18],
    ['shu-captain-2', 'starting-ladder-2', 29],
  ] as const) {
    for (const moveFirst of [false, true]) {
      test(`${locale}: ${unitId}, ${moveFirst ? 'move then raise' : 'raise then move'}, climbs on day one after redeployment`, async ({
        page,
      }) => {
        await start(page, locale);
        await selectActor(page, unitId);
        await clickCell(page, 'deploy', `${x},21,ground`);
        expect((await snapshot(page)).state.units.find((u) => u.id === unitId)).toMatchObject({
          x,
          y: 21,
        });
        await begin(page, locale);
        await selectActor(page, unitId);
        await expectGuide(page, locale, 'ladderNotRaised');
        const moveOntoBase = async () => {
          await selectActor(page, unitId);
          // Grey Climb focuses the chosen base; it also works for the east approach.
          await clickGreyClimb(page);
          const zoom = moveFirst ? '150%' : '75%';
          await page.getByRole('button', { name: zoom, exact: true }).click();
          await page.getByTestId('command-move').click();
          await expectLabel(
            page,
            `${x},19,ground`,
            siegeText(locale, moveFirst ? 'climbUnraisedLabel' : 'climbBaseLabel'),
          );
          // The click lands directly under the SVG label, proving it passes through.
          await clickCell(page, 'reachable', `${x},19,ground`);
          expect((await snapshot(page)).state.units.find((u) => u.id === unitId)).toMatchObject({
            x,
            y: 19,
            moved: true,
          });
        };
        if (moveFirst) {
          await moveOntoBase();
          await expectGuide(page, locale, 'ladderNotRaised');
          await expect(page.getByTestId('action-context')).toContainText(
            siegeText(locale, 'climbRaiseAtBase'),
          );
        }
        await selectActor(page, ladderId);
        await expect(page.getByTestId('action-context')).toHaveText(
          siegeText(locale, 'contextRaiseLadder'),
        );
        await expectNoPanelScroll(page, 'action-panel');
        await page.getByTestId('command-raiseLadder').click();
        if (!moveFirst) await moveOntoBase();
        await selectActor(page, unitId);
        await expectGuide(page, locale, 'ready');
        await expect(page.getByTestId('command-climb')).toHaveAttribute('aria-disabled', 'false');
        await expect(page.getByTestId('climb-base-label')).toHaveCount(0);
        await expect(page.getByTestId('walkthrough')).toHaveAttribute('data-step', '4');
        expect((await snapshot(page)).state.day).toBe(1);
        await page.getByTestId('command-climb').click();
        await expectNoPanelScroll(page, 'climb-forecast');
        await page.getByTestId('climb-confirm').click();
        expect((await snapshot(page)).state.footholds[`${x},16`]).toBe(1);
        await expectGuide(page, locale, 'acted');
      });
    }
  }

  for (const unitId of ['shu-liaohua', 'shu-wangping']) {
    test(`${locale}: the gold frame moves ${unitId} through Wang Ping's body without Move`, async ({
      page,
    }) => {
      const state = createSiegeState(228);
      state.engines[0]!.raisedAt = { x: 18, y: 16 };
      Object.assign(
        state.units.find((u) => u.id === 'shu-weiyan')!,
        {
          x: 18,
          y: 16,
          level: 'wall',
        },
      );
      Object.assign(
        state.units.find((u) => u.id === 'shu-wangping')!,
        { x: 18, y: 20 },
      );
      Object.assign(
        state.units.find((u) => u.id === 'shu-liaohua')!,
        { x: 17, y: 20 },
      );
      await loadSkippedBattle(page, state, locale);
      await selectActor(page, unitId);
      await expectGuide(page, locale, 'allyAbove');
      await expectLabel(page, '18,19,ground', siegeText(locale, 'climbBaseLabel'));
      if (unitId === 'shu-wangping') await page.waitForTimeout(600);
      await clickCell(page, 'reachable', '18,19,ground');
      const after = await snapshot(page);
      expect(after.state.units.find((u) => u.id === unitId)).toMatchObject({
        x: 18,
        y: 19,
        moved: true,
      });
      if (unitId === 'shu-liaohua')
        expect(after.state.units.find((u) => u.id === 'shu-wangping')).toEqual(
          state.units.find((u) => u.id === 'shu-wangping'),
        );
      const climber = after.state.units.find((u) => u.id === unitId)!;
      await expect(page.getByTestId('selected-actor').locator('h3')).toHaveText(
        locale === 'zh' ? climber.officer.chinese : climber.officer.name,
      );
      await expectGuide(page, locale, 'allyAbove');
      const ally = state.units.find((u) => u.id === 'shu-weiyan')!;
      await expect(page.getByTestId('action-context')).toContainText(
        siegeText(locale, 'climbAllyAbove', {
          name: locale === 'zh' ? ally.officer.chinese : ally.officer.name,
        }),
      );
      await expect(page.getByTestId('action-context')).not.toContainText('0');
      await expectLabel(page, '18,19,ground', siegeText(locale, 'climbBaseLabel'));
      await expectNoPanelScroll(page, 'action-panel');
    });
  }

  for (const pressMove of [false, true]) {
    test(`${locale}: clicking the northern cell ${pressMove ? 'with Move' : 'without Move after 600 ms'} moves Wei Yan`, async ({
      page,
    }) => {
      await loadSkippedBattle(page, createSiegeState(228), locale);
      await selectActor(page, 'shu-weiyan');
      if (pressMove) await page.getByTestId('command-move').click();
      else await page.waitForTimeout(600);
      await clickCell(page, 'reachable', '20,20,ground');
      const after = await snapshot(page);
      expect(after.state.units.find((u) => u.id === 'shu-weiyan')).toMatchObject({
        x: 20,
        y: 20,
        moved: true,
      });
      const unit = after.state.units.find((u) => u.id === 'shu-weiyan')!;
      await expect(page.getByTestId('selected-actor').locator('h3')).toHaveText(
        locale === 'zh' ? unit.officer.chinese : unit.officer.name,
      );
      await expectNoPanelScroll(page, 'action-panel');
    });
  }

  test(`${locale}: double-clicking Wei Yan's upper body selects him without spending a move`, async ({
    page,
  }) => {
    await loadSkippedBattle(page, createSiegeState(228), locale);
    await selectActor(page, 'shu-weiyan');
    const point = await page
      .locator('[data-overlay="reachable"][data-cell="20,20,ground"]')
      .evaluate((element) => {
        const rect = element as SVGRectElement;
        const p = new DOMPoint(
          rect.x.baseVal.value + rect.width.baseVal.value / 2,
          rect.y.baseVal.value + rect.height.baseVal.value / 2,
        ).matrixTransform(rect.getScreenCTM()!);
        return { x: p.x, y: p.y };
      });
    await selectActor(page, 'shu-jiangwei');
    await expect(page.locator('[data-overlay="reachable"][data-cell="20,20,ground"]')).toHaveCount(
      0,
    );
    const before = await snapshot(page);
    await page.mouse.dblclick(point.x, point.y);
    const unit = before.state.units.find((u) => u.id === 'shu-weiyan')!;
    await expect(page.getByTestId('selected-actor').locator('h3')).toHaveText(
      locale === 'zh' ? unit.officer.chinese : unit.officer.name,
    );
    expect(await snapshot(page)).toEqual(before);
    await expectNoPanelScroll(page, 'action-panel');
  });

  test(`${locale}: another infantry's upper body selects through a green cell without Move`, async ({
    page,
  }) => {
    await start(page, locale);
    await begin(page, locale);
    await selectActor(page, 'shu-wangping');
    const before = await snapshot(page);
    // Wu Yi stands at (23,22); his upper body overlaps this cell Wang Ping could walk to.
    await clickCell(page, 'reachable', '23,21,ground');
    const unit = before.state.units.find((u) => u.id === 'shu-wuyi')!;
    await expect(page.getByTestId('selected-actor').locator('h3')).toHaveText(
      locale === 'zh' ? unit.officer.chinese : unit.officer.name,
    );
    expect(await snapshot(page)).toEqual(before);
    await expectNoPanelScroll(page, 'action-panel');
  });

  test(`${locale}: Fill trench reaches the northern green cell through the unit's upper body`, async ({
    page,
  }) => {
    const state = createSiegeState(228);
    state.engines = [];
    Object.assign(
      state.units.find((u) => u.id === 'shu-weiyan')!,
      { x: 18, y: 19 },
    );
    await loadFixture(
      page,
      {
        state,
        playerSide: 'shu',
        phase: 'battle',
        facings: {},
        presentation: { openingStep: 6, bannersSeen: [1], dismissedHints: [], reportReadDay: 1 },
      },
      locale,
    );
    await dismissCards(page);
    await selectActor(page, 'shu-weiyan');
    await page.getByTestId('command-fillTrench').click();
    await clickCell(page, 'reachable', '18,18,ground');
    const after = await snapshot(page);
    expect(after.state.trenchFill['18,18']).toBe(T.infantryFill);
    expect(after.state.units.find((u) => u.id === 'shu-weiyan')).toMatchObject({
      x: 18,
      y: 19,
      acted: true,
    });
    await expectNoPanelScroll(page, 'action-panel');
  });

  test(`${locale}: a defender above the base explains attacking and leaves Attack available`, async ({
    page,
  }) => {
    const state = createSiegeState(228);
    state.engines[0]!.raisedAt = { x: 18, y: 16 };
    Object.assign(
      state.units.find((u) => u.id === 'shu-weiyan')!,
      { x: 18, y: 19 },
    );
    Object.assign(
      state.units.find((u) => u.id === 'wei-captain-1')!,
      { x: 18, y: 16 },
    );
    await loadFixture(
      page,
      {
        state,
        playerSide: 'shu',
        phase: 'battle',
        facings: {},
        presentation: { openingStep: 6, bannersSeen: [1], dismissedHints: [], reportReadDay: 1 },
      },
      locale,
    );
    await selectActor(page, 'shu-weiyan');
    await expectGuide(page, locale, 'defenderAbove');
    await expect(page.getByTestId('command-attack')).toHaveAttribute('aria-disabled', 'false');
    const before = await snapshot(page);
    await clickGreyClimb(page);
    expect(await snapshot(page)).toEqual(before);
    await expectLabel(page, '18,19,ground', siegeText(locale, 'climbBaseLabel'));
    await page.getByTestId('command-attack').click();
    await expectNoPanelScroll(page, 'attack-forecast');
  });

  test(`${locale}: a filled wall foot has a labelled clickable gold frame`, async ({ page }) => {
    const state = createSiegeState(228);
    state.engines = [];
    Object.assign(
      state.units.find((u) => u.id === 'shu-weiyan')!,
      { x: 18, y: 18 },
    );
    state.trenchFill['18,17'] = T.trenchCapacity;
    state.trenchFill['18,18'] = T.trenchCapacity;
    await loadFixture(
      page,
      {
        state,
        playerSide: 'shu',
        phase: 'battle',
        facings: {},
        presentation: { openingStep: 6, bannersSeen: [1], dismissedHints: [], reportReadDay: 1 },
      },
      locale,
    );
    await dismissCards(page);
    await selectActor(page, 'shu-weiyan');
    await expectGuide(page, locale, 'walkToBase');
    await clickGreyClimb(page);
    await expectLabel(page, '18,17,ground', siegeText(locale, 'climbWallFootLabel'));
    await page.getByTestId('command-move').click();
    await clickCell(page, 'reachable', '18,17,ground');
    await expectGuide(page, locale, 'ready');
    expect((await snapshot(page)).state.units.find((u) => u.id === 'shu-weiyan')).toMatchObject({
      x: 18,
      y: 17,
      moved: true,
    });
    await expect(page.getByTestId('hint-wall')).toHaveCount(0);
    await expect(page.getByTestId('climb-base-label')).toHaveCount(0);
  });

  test(`${locale}: an ally above a wall foot keeps the wall-foot label and fits the panel`, async ({
    page,
  }) => {
    const state = createSiegeState(228);
    state.engines = [];
    state.trenchFill['18,17'] = T.trenchCapacity;
    Object.assign(
      state.units.find((u) => u.id === 'shu-wangping')!,
      { x: 18, y: 17 },
    );
    Object.assign(
      state.units.find((u) => u.id === 'shu-weiyan')!,
      {
        x: 18,
        y: 16,
        level: 'wall',
      },
    );
    await loadSkippedBattle(page, state, locale);
    await selectActor(page, 'shu-wangping');
    await expectGuide(page, locale, 'allyAbove');
    const ally = state.units.find((u) => u.id === 'shu-weiyan')!;
    await expect(page.getByTestId('action-context')).toContainText(
      siegeText(locale, 'climbAllyAboveFoot', {
        name: locale === 'zh' ? ally.officer.chinese : ally.officer.name,
      }),
    );
    await clickGreyClimb(page);
    await expectLabel(page, '18,17,ground', siegeText(locale, 'climbWallFootLabel'));
    await expectNoPanelScroll(page, 'action-panel');
  });
}
