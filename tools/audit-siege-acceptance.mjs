// Reproducible rule/UI data audit; browser layout is covered by the Playwright specs.
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const vite = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const [rules, attacker, defender, day, commands, reports, content, combat, saves, actions] =
    await Promise.all([
      vite.ssrLoadModule('/src/siege/rules/state.ts'),
      vite.ssrLoadModule('/src/siege/ai/attacker.ts'),
      vite.ssrLoadModule('/src/siege/ai/defender.ts'),
      vite.ssrLoadModule('/src/siege/rules/day.ts'),
      vite.ssrLoadModule('/src/siege/ui/commands.ts'),
      vite.ssrLoadModule('/src/siege/ui/report.ts'),
      vite.ssrLoadModule('/src/siege/content/chencang.ts'),
      vite.ssrLoadModule('/src/siege/rules/combat.ts'),
      vite.ssrLoadModule('/src/siege/save.ts'),
      vite.ssrLoadModule('/src/siege/rules/actions.ts'),
    ]);
  const games = [];
  for (const seed of [1, 228]) {
    let state = rules.createSiegeState(seed);
    const act = (action) => {
      const result = actions.applySiegeAction(state, action);
      if (!result.ok) throw new Error(result.reason);
      state = result.state;
    };
    // Reproduce N's exact continuation: deploy the archer at the west ladder,
    // prepare on day one, fire (clear seed only) and drop the millstone on day two.
    Object.assign(
      state.units.find((u) => u.id === 'wei-captain-1'),
      { x: 18, y: 16 },
    );
    state = attacker.runAttackerTurn(state, attacker.attackerMethodForSeed(seed));
    act({ type: 'hoistMillstone', unitId: 'wei-haozhao' });
    act({ type: 'lightBrazier', unitId: 'wei-captain-1' });
    state = day.endDay(state);
    state = attacker.runAttackerTurn(state, attacker.attackerMethodForSeed(seed));
    if (seed === 1)
      act({
        type: 'fireArrows',
        unitId: 'wei-captain-1',
        engineId: state.engines.find((e) => e.kind === 'ladder' && e.x === 18).id,
      });
    act({
      type: 'dropMillstone',
      unitId: 'wei-haozhao',
      engineId: state.engines.find((e) => e.kind === 'ram').id,
    });
    let seen = {};
    const days = [];
    while (!state.outcome) {
      const items = reports.morningReport(
        state.log,
        state.preparations,
        state.day,
        'zh',
        [],
        state,
        'wei',
        seen,
      );
      seen = reports.rememberReport(items, seen, state.day);
      const defenders = state.units.filter((u) => u.side === 'wei' && combat.activeUnit(u));
      const direct = defenders.flatMap((u) =>
        commands
          .siegeCommands(state, u.id, 'wei')
          .filter((c) => !c.reason && !['move', 'order', 'standby'].includes(c.kind))
          .map((c) => ({ unit: u.id, kind: c.kind, action: c.action })),
      );
      const inRange = defenders.flatMap((u) =>
        state.units
          .filter(
            (t) =>
              t.side === 'shu' && combat.activeUnit(t) && combat.siegeAttackInRange(state, u, t),
          )
          .map((t) => ({ unit: u.id, target: t.id })),
      );
      const row = {
        day: state.day,
        reports: items.length,
        reportTexts: items.map((i) => i.text),
        directActions: direct,
        inRange,
        wei: defenders.map((u) => ({
          id: u.id,
          x: u.x,
          y: u.y,
          level: u.level,
          troops: u.troops,
          morale: u.morale,
          acted: u.acted,
          courtyard: u.level === 'ground' && content.COURTYARD.some((c) => content.sameCell(c, u)),
        })),
        shu: state.units
          .filter((u) => u.side === 'shu' && combat.activeUnit(u))
          .map((u) => ({ id: u.id, x: u.x, y: u.y, level: u.level })),
      };
      if (inRange.length && !direct.some((c) => c.kind === 'attack'))
        throw new Error(`Missing attack command, seed ${seed} day ${state.day}`);
      if (new Set(row.reportTexts).size !== items.length) throw new Error('Duplicate report text');
      if (items.some((i) => /[\u3400-\u9fff]\s|\s[\u3400-\u9fff]/u.test(i.text + i.counter)))
        throw new Error('CJK report spacing');
      const save = {
        state,
        playerSide: 'wei',
        phase: 'battle',
        facings: {},
        presentation: { openingStep: 6, bannersSeen: [1, 2], dismissedHints: [], reportSeen: seen },
      };
      if (
        JSON.stringify(saves.deserializeSiegeSave(saves.serializeSiegeSave(save))) !==
        JSON.stringify(save)
      )
        throw new Error('Save mismatch');
      state = defender.runDefenderTurn(state);
      row.defenderActions = state.log
        .filter((e) => e.day === state.day && e.code === 'order')
        .map((e) => e.params);
      state = day.endDay(state);
      days.push(row);
      if (!state.outcome)
        state = attacker.runAttackerTurn(state, attacker.attackerMethodForSeed(seed));
    }
    games.push({
      seed,
      method: attacker.attackerMethodForSeed(seed),
      outcome: state.outcome,
      score: state.stats.score,
      days,
    });
  }
  await mkdir('.artifacts/siege', { recursive: true });
  await writeFile('.artifacts/siege/o-wei-audit.json', JSON.stringify(games, null, 2) + '\n');
  console.log(
    JSON.stringify(
      games.map((g) => ({
        seed: g.seed,
        method: g.method,
        outcome: g.outcome,
        score: g.score.wei,
        days: g.days.map((d) => ({
          day: d.day,
          directActions: d.directActions.length,
          inRange: d.inRange.length,
          guards: d.wei.filter((u) => u.courtyard).length,
          wall: d.wei.filter((u) => u.level === 'wall').length,
          troops: d.wei.reduce((s, u) => s + u.troops, 0),
          reportItems: d.reports,
        })),
      })),
      null,
      2,
    ),
  );
} finally {
  await vite.close();
}
