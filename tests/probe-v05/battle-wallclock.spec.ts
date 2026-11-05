import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { getUnitAttackTargets, getUnitReachableTiles } from '../../src/v03/battle';
import { gridToWorld } from '../../src/v03/rendering/geometry';
import type { V03GameState } from '../../src/v03/types';
import { asSave } from '../e2e-v03/playability-fixtures';
import { submitBattleDay } from '../e2e-v03/ui-navigation';
import { battleTierState } from './fixtures';

const key = 'hegemony-v0.3:autosave';
const MAX_DAYS = 30;

type ClickWindow = { __probeClicks: number };

async function saved(page: Page): Promise<V03GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).state, key);
}
const activeBattle = (state: V03GameState) => state.battles.find((entry) => entry.active);

test('v0.4 flow: Battle-tier wall clock and click count', async ({ page }) => {
  // Count every real (trusted) click the script causes, whichever helper issues it.
  await page.addInitScript(() => {
    (window as unknown as ClickWindow).__probeClicks = 0;
    window.addEventListener(
      'click',
      (event) => {
        if (event.isTrusted) (window as unknown as ClickWindow).__probeClicks++;
      },
      true,
    );
  });
  const clicks = () => page.evaluate(() => (window as unknown as ClickWindow).__probeClicks);

  await page.goto('/?lang=en');
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key,
    raw: asSave(battleTierState()),
  });
  await page.reload();
  await expect(page.locator('.v03-battle-board')).toBeVisible();
  await page.evaluate(() => ((window as unknown as ClickWindow).__probeClicks = 0));

  const map = page.locator('.v03-battlefield-map');
  const screenPoint = (cell: { x: number; y: number }) =>
    map.evaluate((node, world) => {
      const p = new DOMPoint(world.x, world.y).matrixTransform(
        (node as SVGSVGElement).getScreenCTM()!,
      );
      const box = node.getBoundingClientRect();
      const visible =
        p.x > box.left + 30 && p.x < box.right - 30 && p.y > box.top + 30 && p.y < box.bottom - 30;
      return { x: p.x, y: p.y, visible };
    }, gridToWorld(cell));
  // Off-screen cells need the camera: a real player presses Fit (one counted click).
  const ensureVisible = async (cell: { x: number; y: number }) => {
    if (!(await screenPoint(cell)).visible) {
      await page
        .getByRole('button', { name: /Fit full battlefield|显示全图/ })
        .first()
        .click();
    }
    return screenPoint(cell);
  };
  const clickCell = async (cell: { x: number; y: number }) => {
    const point = await ensureVisible(cell);
    await page.mouse.click(point.x, point.y);
  };
  const clickUnit = async (unitId: string, cell: { x: number; y: number }) => {
    await ensureVisible(cell);
    await page.locator(`.v03-battlefield-map [data-unit-id="${unitId}"]`).click();
  };
  const menu = page.getByRole('region', { name: /Unit actions|部队行动选择/ });
  const outcome = page.locator('.v03-outcome-modal');
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

  const started = Date.now();
  let days = 0;
  while (days < MAX_DAYS && !(await outcome.count())) {
    const battle = activeBattle(await saved(page));
    if (!battle) break;
    const dayBefore = battle.battleData.day;
    const ready = battle.battleData.units
      .filter((unit) => unit.side === battle.battleData.playerSide && unit.troops > 0)
      .filter((unit) => !unit.moved && !unit.acted)
      .map((unit) => unit.id);
    for (const unitId of ready) {
      if (await outcome.count()) break;
      const current = activeBattle(await saved(page))!.battleData;
      const unit = current.units.find((entry) => entry.id === unitId);
      if (!unit || unit.troops <= 0 || unit.moved || unit.acted) continue;
      const enemies = current.units.filter((entry) => entry.side !== unit.side && entry.troops > 0);
      if (!enemies.length) break;
      const nearest = (from: { x: number; y: number }) =>
        Math.min(...enemies.map((enemy) => distance(from, enemy)));
      let best: { x: number; y: number } | null = null;
      for (const tile of getUnitReachableTiles(current, unitId)) {
        if (nearest(tile) < nearest(best ?? unit)) best = tile;
      }
      await clickUnit(unitId, unit);
      await clickCell(best ?? unit);
      await expect(menu).toBeVisible();
      const attack = menu.getByRole('button', { name: /^Attack$|^攻击$/ });
      if (await attack.isEnabled()) {
        const moved = structuredClone(current);
        Object.assign(
          moved.units.find((entry) => entry.id === unitId)!,
          best ?? {},
        );
        const target = getUnitAttackTargets(moved, unitId)[0]!;
        await attack.click();
        await clickUnit(target.id, target);
      } else {
        await menu.getByRole('button', { name: /^Wait$|^待命$/ }).click();
      }
      await expect(menu).toHaveCount(0);
    }
    if (await outcome.count()) break;
    await submitBattleDay(page);
    days++;
    // Enemy turn plays back at natural speed; the player then dismisses the report.
    const dismiss = page.locator('.v03-battle-playback').getByRole('button');
    await dismiss
      .or(outcome)
      .first()
      .waitFor({ timeout: 60_000 })
      .catch(() => undefined);
    if (!(await outcome.count())) {
      if (/Skip|跳过/.test((await dismiss.innerText()) ?? '')) {
        await expect(dismiss).not.toHaveText(/Skip|跳过/, { timeout: 60_000 });
      }
      if (await dismiss.count()) await dismiss.click();
    }
    await expect
      .poll(
        async () =>
          (await outcome.count()) ||
          (activeBattle(await saved(page))?.battleData.day ?? Infinity) > dayBefore,
        { timeout: 60_000 },
      )
      .toBeTruthy();
  }
  const minutes = (Date.now() - started) / 60_000;
  const totalClicks = await clicks();
  const hasOutcome = (await outcome.count()) > 0;
  const result = {
    flow: 'v04',
    minutes: Number(minutes.toFixed(2)),
    clicks: totalClicks,
    clicksPerDay: Number((totalClicks / Math.max(1, days)).toFixed(1)),
    days,
    outcome: hasOutcome
      ? ((await outcome.innerText()).split('\n')[0] ?? 'outcome')
      : activeBattle(await saved(page))
        ? `unresolved after ${days} days`
        : 'battle ended',
  };
  mkdirSync('.artifacts/v05', { recursive: true });
  writeFileSync('.artifacts/v05/battle-wallclock.json', `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
});
