// Browser-free legality checks for the migrated review and E2E fixtures.
import { createServer } from 'vite';
import { writeFileSync } from 'node:fs';
const v = await createServer({
  root: process.cwd(),
  optimizeDeps: { noDiscovery: true, entries: [] },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  logLevel: 'error',
});
try {
  const [
    { createRenderScene, RENDER_SCENES },
    { cellTerrain, isMapCell },
    { createSiegeState },
    { applySiegeAction },
    { endDay },
    { nextGoalGuide },
  ] = await Promise.all([
    v.ssrLoadModule('/src/siege/dev/renderScenes.ts'),
    v.ssrLoadModule('/src/siege/rules/map.ts'),
    v.ssrLoadModule('/src/siege/rules/state.ts'),
    v.ssrLoadModule('/src/siege/rules/actions.ts'),
    v.ssrLoadModule('/src/siege/rules/day.ts'),
    v.ssrLoadModule('/src/siege/ui/nextGoalGuide.ts'),
  ]);
  const failures = [],
    sceneChecks = [];
  let unitChecks = 0,
    engineChecks = 0,
    actions = 0;
  for (const name of RENDER_SCENES.filter((n) => n !== 'board')) {
    const { state } = createRenderScene(name),
      cells = new Set();
    for (const u of state.units) {
      unitChecks++;
      const key = `${u.x},${u.y}`;
      if (cells.has(key)) failures.push(`${name}: duplicate ${key}`);
      cells.add(key);
      if (!isMapCell(u.x, u.y) || ['building', 'water'].includes(cellTerrain(state, u.x, u.y)))
        failures.push(`${name}: illegal ${u.id}`);
    }
    for (const e of state.engines) {
      engineChecks++;
      if (!isMapCell(e.x, e.y)) failures.push(`${name}: engine ${e.id}`);
    }
    sceneChecks.push(name);
  }
  const act = (state, action) => {
    const r = applySiegeAction(state, action);
    actions++;
    if (!r.ok) throw new Error(`${JSON.stringify(action)}: ${r.reason}`);
    return r.state;
  };
  const base = () => {
    const s = createSiegeState(228),
      u = s.units.find((u) => u.id === 'shu-weiyan');
    Object.assign(u, { x: 6, y: 7, level: 'wall' });
    s.units = [u];
    s.engines = [];
    return { s, u };
  };
  let { s, u } = base();
  s.units.push(
    { ...u, id: 'outside', x: 8, y: 8, level: 'ground' },
    { ...createSiegeState(228).units[10], x: 12, y: 2, level: 'wall' },
  );
  const initialGuide = nextGoalGuide(s, u.id);
  s = act(s, { type: 'move', unitId: u.id, x: 7, y: 6, level: 'ground' });
  const innerGuide = nextGoalGuide(s, u.id);
  s = endDay(s);
  s = act(s, { type: 'move', unitId: u.id, x: 8, y: 6, level: 'ground' });
  s = act(s, { type: 'openGate', unitId: u.id, gateId: 'south' });
  s = act(s, { type: 'move', unitId: 'outside', x: 9, y: 6, level: 'ground' });
  ({ s, u } = base());
  s.units.push({ ...u, id: 'left', x: 5 }, { ...u, id: 'right', x: 7 }, { ...u, id: 'swap', x: 8 });
  s = act(s, { type: 'move', unitId: u.id, x: 9, y: 7, level: 'wall' });
  s = act(s, { type: 'swap', unitId: 'swap', withUnitId: 'right' });
  ({ s, u } = base());
  u.x = 7;
  s.units.push(
    { ...u, id: 'follower', x: 7, y: 10, level: 'ground' },
    { ...u, id: 'enemy', side: 'wei', x: 7, y: 6, level: 'ground' },
  );
  s.engines = [{ ...createSiegeState(228).engines[0], x: 7, raisedAt: { x: 7, y: 7 } }];
  s.footholds['7,7'] = 3;
  s = act(s, { type: 'climb', unitId: 'follower' });
  s = act(s, { type: 'attack', unitId: 'follower', targetId: 'enemy' });
  for (const [x, beside] of [
    [6, 5],
    [10, 11],
  ])
    for (const moveFirst of [true, false]) {
      s = createSiegeState(228);
      u = s.units.find((u) => u.id === 'shu-weiyan');
      Object.assign(u, { x: beside, y: 10 });
      s.units = [u];
      s.engines = [{ ...s.engines[0], x }];
      const move = () => {
        s = act(s, { type: 'move', unitId: u.id, x, y: 10, level: 'ground' });
      };
      const raise = () => {
        s = act(s, { type: 'raiseLadder', engineId: s.engines[0].id });
      };
      if (moveFirst) {
        move();
        raise();
      } else {
        raise();
        move();
      }
      s = act(s, { type: 'climb', unitId: u.id });
    }
  const report = {
    normalScenes: sceneChecks.length,
    unitChecks,
    engineChecks,
    failures,
    legalActionReplays: actions,
    initialGateGuide: initialGuide,
    innerGateGuide: innerGuide,
    boardScene: '218 schematic positions; both gate planes and fill targets deliberately shown',
  };
  writeFileSync('.artifacts/siege/v2-fixture-audit.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  await v.close();
}
