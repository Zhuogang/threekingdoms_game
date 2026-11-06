import { expect, type Page } from '@playwright/test';

/** Sample the game's sprite rect, avoiding figures, plates and earlier cell actions. */
export async function engineBodyPoint(page: Page, id: string) {
  const point = await page.getByTestId('siege-map').evaluate(async (element, id) => {
    const artPath = '/src/siege/render/stateArt.ts',
      geometryPath = '/src/siege/render/boardGeometry.ts',
      scenePath = '/src/siege/render/scene.ts',
      combatPath = '/src/siege/rules/combat.ts',
      commandsPath = '/src/siege/ui/commands.ts',
      mapPath = '/src/siege/rules/map.ts';
    const { engineSprite, unitVisual } = (await import(
      artPath
    )) as typeof import('../../src/siege/render/stateArt');
    const { positionAt } = (await import(
      geometryPath
    )) as typeof import('../../src/siege/render/boardGeometry');
    const { compareDepth } = (await import(
      scenePath
    )) as typeof import('../../src/siege/render/scene');
    const { usableEngine } = (await import(
      combatPath
    )) as typeof import('../../src/siege/rules/combat');
    const { actorTargets } = (await import(
      commandsPath
    )) as typeof import('../../src/siege/ui/commands');
    const { gateAt } = (await import(mapPath)) as typeof import('../../src/siege/rules/map');
    const svg = element as SVGSVGElement,
      inverse = svg.getScreenCTM()!.inverse(),
      game = window.__siegeDev!.snapshot(),
      units = game.state.units.filter((u) => u.troops > 0 && u.x >= 0),
      figures = units.flatMap((u) => unitVisual(game.state, u, game.facings[u.id]).figureRects),
      engines = game.state.engines
        .filter(usableEngine)
        .map((e) => engineSprite(e, game.facings[e.id]));
    engines
      .sort((a, b) =>
        compareDepth({ row: a.cells[3], height: a.height }, { row: b.cells[3], height: b.height }),
      )
      .reverse();
    const engine = engines.find((e) => e.id === id);
    if (!engine) throw new Error(`Engine ${id} is not usable`);
    const selected = svg.dataset.selected,
      side =
        document.querySelector('.siege-app')?.getAttribute('data-player-side') === 'wei'
          ? 'wei'
          : 'shu',
      targets = selected ? actorTargets(game.state, selected, side) : [];
    const obstacles = [
      ...svg.querySelectorAll<SVGGraphicsElement>('[data-nameplate] rect, [data-target-id]'),
    ].map((el) => {
      const r = el.getBBox(),
        matrix = inverse.multiply(el.getScreenCTM()!),
        a = new DOMPoint(r.x, r.y).matrixTransform(matrix),
        b = new DOMPoint(r.x + r.width, r.y + r.height).matrixTransform(matrix);
      return [a.x, a.y, b.x, b.y] as [number, number, number, number];
    });
    const reachable = new Set(
      [...svg.querySelectorAll('[data-overlay="reachable"]')].map((el) =>
        el.getAttribute('data-cell'),
      ),
    );
    const [left, top, right, bottom] = engine.rect;
    // A player clicks the middle of the body, so sample outward from its centre. Mouse
    // coordinates are whole pixels: stay 2 map pixels clear of every edge, or the click
    // can fall across a cell boundary from the point computed here.
    const samples: [number, number][] = [];
    for (let y = top + 3; y < bottom - 3; y += 2)
      for (let x = left + 3; x < right - 3; x += 2) samples.push([x, y]);
    const distance = ([x, y]: [number, number]) =>
      (x - (left + right) / 2) ** 2 + (y - (top + bottom) / 2) ** 2;
    samples.sort((a, b) => distance(a) - distance(b));
    const around = [-2, 2].flatMap((dx) => [-2, 2].map((dy) => [dx, dy] as const));
    const nearly = (r: readonly number[], x: number, y: number) =>
      x >= r[0]! - 2 && x < r[2]! + 2 && y >= r[1]! - 2 && y < r[3]! + 2;
    const key = (p: ReturnType<typeof positionAt>) => (p ? `${p.x},${p.y},${p.level}` : '');
    for (const [x, y] of samples) {
      if ([...figures, ...obstacles].some((r) => nearly(r, x, y))) continue;
      if (engines.find((e) => nearly(e.rect, x, y))?.id !== id) continue;
      const cell = positionAt(game.state, x, y);
      if (around.some(([dx, dy]) => key(positionAt(game.state, x + dx, y + dy)) !== key(cell)))
        continue;
      const gate = cell?.level === 'ground' ? gateAt(cell.x, cell.y) : undefined;
      if (gate && targets.some((t) => t.id === gate)) continue;
      // A legal move wins over a body, except on an unraised ladder's own cell, where the
      // resolver selects the ladder rather than walking onto it.
      const ownCart =
        engine.engine.kind === 'ladder' &&
        !engine.engine.raisedAt &&
        cell?.level === 'ground' &&
        cell.x === engine.engine.x &&
        cell.y === engine.engine.y;
      if (
        cell &&
        ((!ownCart && reachable.has(`${cell.x},${cell.y},${cell.level}`)) ||
          units.some((u) => u.x === cell.x && u.y === cell.y && u.level === cell.level))
      )
        continue;
      return { x, y };
    }
    throw new Error(
      `Usable engine ${id} (${engine.engine.kind}), day ${game.state.day}, has no free body point: ${JSON.stringify(engine.rect)}`,
    );
  }, id);
  const mini = (await page.locator('.siege-minimap').boundingBox())!;
  await page.mouse.click(
    mini.x + (point.x / 3072) * mini.width,
    mini.y + (point.y / 1536) * mini.height,
  );
  const client = await page.getByTestId('siege-map').evaluate((el, p) => {
    const q = new DOMPoint(p.x, p.y).matrixTransform((el as SVGSVGElement).getScreenCTM()!);
    return { x: q.x, y: q.y };
  }, point);
  const map = (await page.getByTestId('siege-map').boundingBox())!;
  expect(client.x).toBeGreaterThan(map.x);
  expect(client.x).toBeLessThan(map.x + map.width);
  expect(client.y).toBeGreaterThan(map.y);
  expect(client.y).toBeLessThan(map.y + map.height);
  return client;
}
