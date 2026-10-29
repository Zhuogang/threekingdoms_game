import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createV03Game } from '../../../src/v03/initial-state';
import { advanceV03 } from '../../../src/v03/engine';
import { createBattleMap, createTacticalBattle, runBattleAiTurn } from '../../../src/v03/battle';
import {
  createAiDecisionTrace,
  recordAiDecision,
  withAiDecisionTrace,
} from '../../../src/v03/ai/decision-trace';
import { summarize } from '../../../tools/v03-campaign-diagnostics-helpers.mjs';
import { simulationFingerprint } from '../../../tools/simulation-fingerprint.mjs';

const temporary: string[] = [];
afterEach(async () => {
  for (const dir of temporary.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('V04-00 actual decision evidence', () => {
  it('leaves monthly game state and RNG identical, and reconciles commits rather than proposals', () => {
    const state = createV03Game('cao', 731);
    state.absoluteDay = 29;
    state.events.forEach((event) => {
      event.acknowledged = true;
    });
    const before = structuredClone(state);
    const plain = advanceV03(state, 1);
    const trace = createAiDecisionTrace(10_000);
    const observed = withAiDecisionTrace(trace, () => advanceV03(state, 1));
    expect(observed).toEqual(plain);
    expect(state).toEqual(before);
    const dispatches = trace.events.filter(
      (event) => event.kind === 'campaign' && event.status === 'committed',
    );
    expect(dispatches.length).toBeGreaterThan(0);
    expect(dispatches.length).toBe(observed.state.directives.length - state.directives.length);
    for (const event of dispatches) {
      if (event.kind !== 'campaign') throw new Error('Wrong event kind');
      const journey = observed.state.journeys.find((entry) => entry.id === event.journeyId)!;
      expect(journey.ownerFactionId).toBe(event.factionId);
      expect(journey.manifest.troopCount).toBe(event.troops);
      expect(journey.manifest.carriedFood).toBe(event.food);
    }
    const work = trace.events.filter(
      (event) => event.kind === 'governor' && event.status === 'committed',
    );
    expect(work.length).toBeGreaterThan(0);
    const totalWork = Object.values(trace.workByFaction).reduce(
      (sum, entry) => sum + entry.workPoints,
      0,
    );
    expect(totalWork).toBe(
      observed.state.cities.reduce((sum, city) => sum + (city.workPointsUsed ?? 0), 0),
    );
    expect(Object.values(trace.workByFaction).reduce((sum, entry) => sum + entry.actions, 0)).toBe(
      work.length,
    );
    expect(
      trace.events.some((event) => event.kind === 'governor' && event.status === 'blocked'),
    ).toBe(true);
  });

  it('observes tactical actions without changing movement, combat or the random stream', () => {
    const battle = createTacticalBattle({
      id: 'trace-parity',
      map: createBattleMap({ regionId: 'xiapi', seed: 4 }),
      attackerUnits: [
        { id: 'a', name: 'A', troopType: 'archer', troops: 1000, force: 70, intellect: 90 },
      ],
      defenderUnits: [{ id: 'd', name: 'D', troopType: 'infantry', troops: 1000, force: 70 }],
    });
    const trace = createAiDecisionTrace();
    expect(withAiDecisionTrace(trace, () => runBattleAiTurn(battle, 'attacker'))).toEqual(
      runBattleAiTurn(battle, 'attacker'),
    );
    expect(trace.events.some((event) => event.kind === 'tactical')).toBe(true);
    expect(trace.events.some((event) => event.status === 'committed')).toBe(true);
    expect(trace.events.some((event) => event.status === 'selected')).toBe(true);
    expect(trace.events.every((event) => event.status !== 'execution-rejected')).toBe(true);
  });

  it('bounds retained events while counting every executed work action; restores scopes on error', () => {
    const outer = createAiDecisionTrace(2),
      inner = createAiDecisionTrace(1);
    const event = {
      kind: 'governor',
      day: 10,
      factionId: 'cao',
      cityId: 'chenliu',
      status: 'committed',
      reason: 'economic-balance',
      action: 'develop-farming',
      workPoints: 1,
    } as const;
    withAiDecisionTrace(outer, () => {
      for (let index = 0; index < 7; index++) recordAiDecision(event);
      expect(() =>
        withAiDecisionTrace(inner, () => {
          recordAiDecision(event);
          throw new Error('probe');
        }),
      ).toThrow('probe');
      recordAiDecision(event);
    });
    recordAiDecision(event);
    expect(outer).toMatchObject({
      observed: 8,
      dropped: 6,
      workByFaction: { cao: { actions: 8, workPoints: 8 } },
    });
    expect(outer.events).toHaveLength(2);
    expect(inner.observed).toBe(1);
    expect(() => createAiDecisionTrace(10_001)).toThrow();
  });

  it('does not mislabel stale day-20 work as current work or cumulative work as an endpoint budget', () => {
    const state = createV03Game('cao', 71);
    state.absoluteDay = 20;
    const city = state.cities.find(
      (entry) => entry.factionId === 'cao' && entry.governanceMode !== 'ruler',
    )!;
    state.cities = [city];
    Object.assign(city, { workMonthIndex: 0, workPeriodIndex: 1, workPointsUsed: 2 });
    const stale = summarize(state, 'cao', 0).autonomy;
    expect(stale).toMatchObject({
      workPeriodIndexExpected: 2,
      observedForCurrentPeriod: 0,
      unobservedCities: 1,
      idleCities: 0,
      currentPeriodWorkPoints: 0,
      cumulativeWork: { status: 'not-observed' },
    });
    city.workPeriodIndex = 2;
    const trace = createAiDecisionTrace();
    trace.workByFaction.cao = { actions: 9, workPoints: 6 };
    expect(summarize(state, 'cao', 0, [], trace).autonomy).toMatchObject({
      currentPeriodWorkPoints: 2,
      cumulativeWork: { status: 'observed', actions: 9, workPoints: 6 },
    });
    delete city.workPeriodIndex;
    expect(summarize(state, 'cao', 0).autonomy.unobservedCities).toBe(1);
  });

  it('separates resolved duration from the age of an ongoing battle', () => {
    const state = createV03Game('cao', 71);
    const battles = [
      {
        id: 'resolved',
        attackerFactionId: 'cao',
        defenderFactionId: 'liu',
        active: false,
        resolved: true,
        foodShortfallDays: 0,
        battleData: { day: 3, units: [], outcome: { winner: 'attacker' } },
      },
      {
        id: 'ongoing',
        attackerFactionId: 'cao',
        defenderFactionId: 'liu',
        active: true,
        resolved: false,
        foodShortfallDays: 0,
        battleData: { day: 20, units: [], outcome: null },
      },
    ];
    const result = summarize({ ...state, battles }, 'cao', 0).battles;
    expect(result.durationDays).toMatchObject({ median: 3, maximum: 3 });
    expect(result.durationDays.raw).toHaveLength(1);
    expect(result.activeAgeDays).toMatchObject({ median: 20, maximum: 20 });
  });

  it('fingerprints changed, added and deleted simulation files and records commit/configuration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'v04-fingerprint-'));
    temporary.push(root);
    const files = [
      'src/v03/battle/rules.ts',
      'src/v03/campaign/personnel.ts',
      'src/v03/content/officer-catalog.ts',
      'src/v03/governance/officer-transfer.ts',
      'src/v03/strategic-ai.ts',
    ];
    for (const file of files) {
      await mkdir(join(root, file, '..'), { recursive: true });
      await writeFile(join(root, file), 'export const baseline = 1;\n');
    }
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-qm',
        'fixture',
      ],
      { cwd: root },
    );
    const baseline = await simulationFingerprint(root, { seed: 7 });
    expect(baseline.dirty).toBe(false);
    for (const file of files) {
      const old = await readFile(join(root, file));
      await writeFile(join(root, file), 'export const candidate = 2;\n');
      const changed = await simulationFingerprint(root, { seed: 7 });
      expect(changed.sourceSha256, file).not.toBe(baseline.sourceSha256);
      expect(changed.commit).toBe(baseline.commit);
      expect(changed.dirty).toBe(true);
      await writeFile(join(root, file), old);
    }
    await writeFile(join(root, 'src/v03/new-policy.ts'), 'export const newPolicy = true;\n');
    expect((await simulationFingerprint(root)).sourceSha256).not.toBe(baseline.sourceSha256);
    await rm(join(root, 'src/v03/new-policy.ts'));
    expect((await simulationFingerprint(root, { seed: 8 })).configSha256).not.toBe(
      baseline.configSha256,
    );
    await rm(join(root, files[0]!));
    expect((await simulationFingerprint(root)).sourceSha256).not.toBe(baseline.sourceSha256);
  });
});
