import { writeFileSync } from 'node:fs';
import { runDefenderTurn } from '../../src/siege/ai/defender';
import { playScriptDays } from '../../src/siege/ui/devPlaythrough';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEPLOY_WEI, cellKey } from '../../src/siege/content/chencang';
import { attackerMethodForSeed, runAttackerTurn } from '../../src/siege/ai/attacker';
import { endDay } from '../../src/siege/rules/day';
import { createSiegeState } from '../../src/siege/rules/state';
import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { scoreSiege } from '../../src/siege/rules/score';
import { actionReason, deployUnit, siegeCommands, standBy } from '../../src/siege/ui/commands';
import { preparationRows, tonightOrder, weiOrderTargets } from '../../src/siege/ui/wei';
import { resolveAttackerPhase, resolveSiegeDay } from '../../src/siege/ui/playback';
import { morningReport } from '../../src/siege/ui/report';
import { counterCards } from '../../src/siege/ui/counters';
import { howToSections, HOW_TO_RULES } from '../../src/siege/ui/howToPlay';
import { scoringScreen } from '../../src/siege/ui/scoring';
import {
  SiegeOpening,
  SiegeActBanner,
  SiegeEnding,
  endingArt,
} from '../../src/siege/ui/SiegeStory';
import { SiegeCampaignCard } from '../../src/siege/ui/SiegeCampaignCard';
import { SiegeHowToPlay } from '../../src/siege/ui/SiegeHowToPlay';
import { SiegeMapView } from '../../src/siege/render/SiegeMapView';
import {
  advanceWalkthrough,
  startWalkthrough,
  walkthroughTargets,
} from '../../src/siege/ui/walkthrough';
import {
  loadSiege,
  saveSiege,
  siegeSaveKey,
  SIEGE_SAVE_KEY,
  serializeSiegeSave,
  deserializeSiegeSave,
  type SiegeSave,
} from '../../src/siege/save';
import type { SiegeSide } from '../../src/siege/rules/types';
import { act } from './rulesFixtures';

describe('Wei playable interface', () => {
  it('uses only the current player’s commands and the rules’ exact reasons', () => {
    const state = createSiegeState(228);
    for (const side of ['shu', 'wei'] as const) {
      for (const unit of state.units) {
        const commands = siegeCommands(state, unit.id, side);
        if (unit.side !== side) expect(commands).toEqual([]);
        for (const command of commands.filter((c) => c.action))
          expect(command.reason).toBe(actionReason(state, command.action!));
      }
    }
    const hao = siegeCommands(state, 'wei-haozhao', 'wei');
    expect(hao.find((c) => c.kind === 'hoistMillstone')?.reason).toBeNull();
    const archer = state.units.find((u) => u.side === 'wei' && u.troopType === 'archer')!;
    expect(
      siegeCommands(state, archer.id, 'wei').find((c) => c.kind === 'lightBrazier')?.reason,
    ).toBeNull();
    expect(hao.map((c) => c.kind)).not.toContain('buildWall');
    const act2 = { ...state, act: 2 as const };
    expect(siegeCommands(act2, 'wei-haozhao', 'wei').map((c) => c.kind)).toContain('buildWall');
    expect(standBy(state, state.engines[0]!.id, 'wei')).toBe(state);
  });

  it('lets an archer use boulders previously stacked by infantry, as the rules allow', () => {
    const state = createSiegeState(1);
    state.day = 2;
    const archer = state.units.find((u) => u.side === 'wei' && u.troopType === 'archer')!;
    Object.assign(archer, { x: 6, y: 7 });
    Object.assign(state.units[1]!, { x: 6, y: 10 });
    state.engines[0]!.raisedAt = { x: 6, y: 7 };
    state.preparations.boulders['6,7'] = { day: 1 };
    const command = siegeCommands(state, archer.id, 'wei').find((c) => c.kind === 'dropBoulders');
    expect(command?.reason).toBeNull();
    expect(command?.action?.type).toBe('dropBoulders');
    expect(siegeCommands(state, archer.id, 'wei').map((c) => c.kind)).not.toContain(
      'stackBoulders',
    );
  });

  it('places and swaps at both levels in DEPLOY_WEI, without touching Shu', () => {
    const state = createSiegeState(228);
    const hao = state.units.find((u) => u.id === 'wei-haozhao')!;
    const other = state.units.find((u) => u.side === 'wei' && u.id !== hao.id)!;
    const swapped = deployUnit(state, hao.id, other, 'wei');
    expect(swapped.units.find((u) => u.id === hao.id)).toMatchObject({
      x: other.x,
      y: other.y,
      level: other.level,
    });
    expect(swapped.units.find((u) => u.id === other.id)).toMatchObject({
      x: hao.x,
      y: hao.y,
      level: hao.level,
    });
    const ground = DEPLOY_WEI.find((c) => c.level === 'ground')!;
    const placed = deployUnit(swapped, hao.id, ground, 'wei');
    expect(placed.units.find((u) => u.id === hao.id)).toMatchObject(ground);
    expect(placed.units.filter((u) => u.side === 'shu')).toEqual(
      state.units.filter((u) => u.side === 'shu'),
    );
    expect(deployUnit(state, hao.id, { x: 6, y: 11, level: 'ground' }, 'wei')).toBe(state);
    const html = renderToStaticMarkup(
      createElement(SiegeMapView, { state, locale: 'en', playerSide: 'wei', deploy: true }),
    );
    expect((html.match(/data-overlay="deploy"/g) ?? []).length).toBe(DEPLOY_WEI.length);
    expect(html).toContain('data-cell="8,7,wall"');
    expect(html).not.toContain('data-overlay="deploy" data-cell="6,11,ground"');
  });

  it('projects tomorrow, ready, suppressed, spent and absent-operator preparations', () => {
    let state = createSiegeState(228);
    const archer = state.units.find((u) => u.side === 'wei' && u.troopType === 'archer')!;
    state = act(state, { type: 'hoistMillstone', unitId: 'wei-haozhao' });
    state = act(state, { type: 'lightBrazier', unitId: archer.id });
    expect(preparationRows(state).map((r) => r.status)).toEqual([
      'preparationTomorrow',
      'preparationTomorrow',
    ]);
    state.day++;
    state.units.forEach((u) => {
      u.acted = false;
    });
    expect(preparationRows(state).every((r) => r.status === 'preparationReady')).toBe(true);
    state.units
      .filter((u) => u.side === 'wei')
      .forEach((u) => {
        u.suppressedDay = state.day;
      });
    expect(preparationRows(state).every((r) => r.status === 'preparationBlocked')).toBe(true);
    state.preparations.millstones['8,7']!.hoisted = false;
    expect(preparationRows(state).find((r) => r.kind === 'millstone')?.status).toBe(
      'preparationSpent',
    );
    state.units
      .filter((u) => u.side === 'wei')
      .forEach((u) => {
        u.level = 'ground';
      });
    expect(preparationRows(state).find((r) => r.kind === 'brazier')?.status).toBe(
      'preparationNoOperator',
    );
  });

  it('plays the seed-selected Shu turn and night exactly once; keeps an unresolved Wei order hidden', () => {
    const state = createSiegeState(228);
    state.nightOrders.wei = { kind: 'torches' };
    const before = structuredClone(state);
    const visible = structuredClone(state);
    delete visible.nightOrders.wei;
    const expected = runAttackerTurn(visible, attackerMethodForSeed(state.seed));
    const replay = resolveAttackerPhase(state);
    expect(replay.final).toEqual({
      ...expected,
      nightOrders: { ...expected.nightOrders, wei: state.nightOrders.wei },
    });
    expect(replay.frames.at(-1)?.state).toEqual(expected);
    expect(state).toEqual(before);
    const tomorrow = resolveSiegeDay(replay.final, 'wei');
    const night = endDay(replay.final);
    expect(tomorrow.final).toEqual(runAttackerTurn(night, attackerMethodForSeed(night.seed)));
    expect(tomorrow.frames.some((f) => f.night)).toBe(true);
    expect(tomorrow.frames.some((f) => !f.night && f.state.day === tomorrow.final.day)).toBe(true);
    const save: SiegeSave = {
      state: tomorrow.final,
      playerSide: 'wei',
      phase: 'battle',
      facings: {},
      presentation: {
        openingStep: 6,
        bannersSeen: [1],
        dismissedHints: [],
        attackerTurnDay: tomorrow.final.day,
      },
    };
    expect(deserializeSiegeSave(serializeSiegeSave(save))).toEqual(save);
  });

  it('validates all five orders and keeps target selection rule-driven', () => {
    const state = createSiegeState(228);
    for (const kind of ['rally', 'holdFast', 'nightRepair', 'torches', 'sortie'] as const) {
      const targets = weiOrderTargets(state, kind, 'en');
      expect(targets.length).toBeGreaterThan(0);
      for (const option of targets) expect(option.reason).toBe(actionReason(state, option.action));
      const valid = targets.find((t) => !t.reason)!;
      expect(valid).toBeTruthy();
      const ordered = act(state, valid.action);
      expect(tonightOrder(ordered, 'en')).not.toBe('No order chosen');
      expect(weiOrderTargets(ordered, 'torches', 'en')[0]!.reason).toContain('already issued');
    }
  });

  it('keeps two saves byte-for-byte independent, selects the last side and reads the old v2 slot', () => {
    const values = new Map<string, string>([['campaign', 'untouched']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    for (const side of ['wei', 'shu'] as SiegeSide[]) {
      const save: SiegeSave = {
        state: createSiegeState(side === 'wei' ? 228 : 1),
        playerSide: side,
        phase: 'battle',
        facings: {},
      };
      saveSiege(save, storage);
      expect(loadSiege(storage, side)).toEqual(save);
      expect(loadSiege(storage)?.playerSide).toBe(side);
    }
    const weiBytes = values.get(siegeSaveKey('wei'));
    saveSiege({ ...loadSiege(storage, 'shu')!, phase: 'deploy' }, storage);
    expect(values.get(siegeSaveKey('wei'))).toBe(weiBytes);
    const shuBytes = values.get(siegeSaveKey('shu'));
    saveSiege({ ...loadSiege(storage, 'wei')!, phase: 'deploy' }, storage);
    expect(values.get(siegeSaveKey('shu'))).toBe(shuBytes);
    expect(values.get('campaign')).toBe('untouched');
    const old = new Map([[SIEGE_SAVE_KEY, weiBytes!]]);
    const oldStorage = { getItem: (key: string) => old.get(key) ?? null };
    expect(loadSiege(oldStorage)?.playerSide).toBe('wei');
    expect(loadSiege(oldStorage, 'shu')).toBeNull();
    expect(old.size).toBe(1);
  });

  for (const locale of ['en', 'zh'] as const) {
    it(`${locale}: covers the Wei report, current suppression, locations and enemy counters`, () => {
      const state = createSiegeState(228);
      state.day = 2;
      const codes = [
        'raiseLadder',
        'earthPiled',
        'moundFinished',
        'covered',
        'suppressed',
        'assault',
        'nightAssault',
        'wallGained',
      ];
      state.log = codes.map((code) => ({
        day: code === 'nightAssault' ? 1 : 2,
        code,
        params: {
          cell: '6,7',
          after: 2,
          engineId: state.engines[0]!.id,
          targetId: 'wei-captain-1',
          unitId: 'shu-weiyan',
          result: 'stopped',
        },
      }));
      state.trenchFill['6,8'] = T.trenchCapacity;
      Object.assign(
        state.engines.find((e) => e.kind === 'ram')!,
        { x: 8, y: 8 },
      );
      const items = morningReport(
        state.log,
        state.preparations,
        state.day,
        locale,
        [],
        state,
        'wei',
      );
      for (const code of [
        ...codes.filter((c) => c !== 'earthPiled'),
        'trenchFilled',
        'ramAtBridge',
        'engineNear',
      ])
        expect(
          items.some((i) => i.code === code),
          `${code}: ${items.map((i) => i.code).join(', ')}`,
        ).toBe(true);
      expect(
        items.every((i) => i.text && i.counter && i.place && !/[{}]|\d+,\d+/.test(i.text)),
      ).toBe(true);
      state.log.push({ day: 1, code: 'suppressed', params: { targetId: 'wei-haozhao' } });
      expect(
        morningReport(state.log, state.preparations, 2, locale, [], state, 'wei').filter(
          (i) => i.code === 'suppressed',
        ),
      ).toHaveLength(1);
      expect(counterCards(state, [], locale, 'wei').map((c) => c.kind)).toEqual(
        expect.arrayContaining([
          'suppress',
          'cover',
          'mound',
          'assault',
          'nightAssault',
          'wallMounted',
        ]),
      );
      expect(counterCards(state, ['suppress'], locale, 'wei').map((c) => c.kind)).not.toContain(
        'suppress',
      );
    });

    it(`${locale}: uses the correct opening, both side buttons, Wei guide and Act 2 art`, () => {
      const opening = renderToStaticMarkup(
        createElement(SiegeOpening, {
          step: 5,
          playerSide: 'wei',
          locale,
          next: () => {},
          skip: () => {},
        }),
      );
      expect(opening).toContain(locale === 'zh' ? '诸军上城' : 'All troops to the walls');
      const banner = renderToStaticMarkup(
        createElement(SiegeActBanner, { act: 2, playerSide: 'wei', locale, close: () => {} }),
      );
      expect(banner).toContain('s8-08');
      expect(banner).toContain(locale === 'zh' ? '蜀军造起井阑' : 'Shu is building siege towers');
      const card = renderToStaticMarkup(createElement(SiegeCampaignCard, { locale }));
      expect(card).toContain('data-testid="start-shu"');
      expect(card).toContain('data-testid="start-wei"');
      expect(card).toContain('s8-10');
      expect(
        renderToStaticMarkup(
          createElement(SiegeHowToPlay, {
            locale,
            playerSide: 'wei',
            close: () => {},
            replay: () => {},
          }),
        ),
      ).toContain(locale === 'zh' ? '守住孤城' : 'Hold the city');
      const tuning = {
        ...T,
        days: 93,
        wallArcherRange: 94,
        millstoneDamage: 951,
        coveredMillstoneDamage: 952,
        boulderFootholdLoss: 96,
        moundBoulderMultiplier: 0.97,
        nightRepair: 981,
        sortieRange: 99,
        sortieDamage: 1001,
        coveredSortieDamage: 1002,
        rallyMorale: 103,
        holdFastMultiplier: 0.104,
        act2Day: 105,
        coveredFireMultiplier: 0.106,
      } as unknown as typeof T;
      const text = howToSections(locale, { ...HOW_TO_RULES, tuning }, 'wei')
        .flatMap((s) => s.lines)
        .join(' ');
      for (const n of [93, 94, 951, 952, 96, 0.97, 981, 99, 1001, 1002, 103, 0.104, 105, 0.106])
        expect(text).toContain(String(n));
    });

    for (const tier of [
      'annihilation',
      'perfectDefense',
      'firmDefense',
      'narrowDefense',
      'cityFallen',
    ] as const)
      it(`${locale}: scores and renders ${tier}`, () => {
        const state = createSiegeState(228);
        state.outcome =
          tier === 'cityFallen' ? 'victory' : tier === 'annihilation' ? 'defeat' : 'historical';
        state.stats.gateEverBroken = ['firmDefense', 'narrowDefense'].includes(tier);
        state.stats.wallNights = tier === 'narrowDefense' ? T.score.wallNightAllowance + 1 : 0;
        expect(scoreSiege(state, 'wei').tier).toBe(tier);
        const screen = scoringScreen(state, locale, 'wei');
        expect(screen.parts.reduce((sum, p) => sum + p.value, 0)).toBe(screen.score);
        expect(screen.parts.map((p) => p.key)).toEqual([
          'outcome',
          'gate',
          'wall',
          'casualties',
          'engines',
          'speed',
        ]);
        const html = renderToStaticMarkup(
          createElement(SiegeEnding, {
            state,
            locale,
            playerSide: 'wei',
            summary: false,
            onSummary: () => {},
            onExit: () => {},
          }),
        );
        expect(html).toContain(screen.tier);
        expect(html).toContain(
          endingArt(state, 'wei') === 's8-07'
            ? 's8-07'
            : state.outcome === 'defeat'
              ? 's7-07'
              : 's7-05',
        );
      });
  }

  it('queues the first actual sortie/torches illustration once for either side', () => {
    const state = createSiegeState(228);
    for (const side of ['shu', 'wei'] as const) {
      expect(counterCards(state, [], 'en', side).some((c) => c.art)).toBe(false);
      state.log = [{ day: 1, code: 'torches', params: { assault: false } }];
      expect(counterCards(state, [], 'en', side).filter((c) => c.art)).toMatchObject([
        { kind: 'nightEvent', art: 's8-08' },
      ]);
      state.log.push({ day: 2, code: 'sortieHit', params: {} });
      expect(counterCards(state, ['nightEvent'], 'en', side).filter((c) => c.art)).toEqual([]);
      state.log = [];
    }
  });

  it('walks through actual Wei actions and highlights the matching targets', () => {
    let state = createSiegeState(228);
    let progress = startWalkthrough(state);
    const ui = {
      tab: 'commands',
      selected: 'wei-haozhao',
      playerSide: 'wei' as const,
      reportReadDay: 1,
    };
    const advance = () => {
      progress = advanceWalkthrough(progress, state, ui)!;
    };
    expect(walkthroughTargets(progress, state, 'wei')).toContainEqual({
      x: 8,
      y: 7,
      level: 'wall',
    });
    advance();
    expect(progress.step).toBe(2);
    advance();
    expect(progress.step).toBe(2);
    state = act(state, { type: 'hoistMillstone', unitId: ui.selected });
    advance();
    expect(progress.step).toBe(3);
    ui.selected = state.units.find((u) => u.side === 'wei' && u.troopType === 'archer')!.id;
    advance();
    expect(progress.step).toBe(4);
    state = act(state, { type: 'lightBrazier', unitId: ui.selected });
    advance();
    expect(progress.step).toBe(5);
    state = endDay(state);
    advance();
    expect(progress.step).toBe(6);
    state.weather = 'clear';
    const archer = state.units.find((u) => u.id === ui.selected)!;
    state.preparations.braziers[cellKey(archer)] = { litDay: state.day - 1 };
    const ladder = state.engines.find((e) => e.kind === 'ladder')!;
    Object.assign(ladder, { x: archer.x, y: archer.y + 1 });
    ui.reportReadDay = state.day;
    state = act(state, { type: 'fireArrows', unitId: ui.selected, engineId: ladder.id });
    advance();
    expect(progress.status).toBe('done');
  });
  it('executes the day-two fire/millstone walkthrough and audits complete games at two seeds', () => {
    const audits = [];
    for (const seed of [1, 228]) {
      let state = createSiegeState(seed);
      state = deployUnit(state, 'wei-captain-1', { x: 6, y: 7, level: 'wall' }, 'wei');
      state = resolveAttackerPhase(state).final;
      state = act(state, { type: 'hoistMillstone', unitId: 'wei-haozhao' });
      state = act(state, { type: 'lightBrazier', unitId: 'wei-captain-1' });
      state = resolveSiegeDay(state, 'wei').final;
      const ram = state.engines.find((e) => e.kind === 'ram')!;
      if (seed === 1) {
        expect(state.weather).toBe('clear');
        const ladder = state.engines.find((e) => e.kind === 'ladder' && e.x === 6)!;
        const before = ladder.durability;
        state = act(state, { type: 'fireArrows', unitId: 'wei-captain-1', engineId: ladder.id });
        expect(state.engines.find((e) => e.id === ladder.id)!.durability).toBeLessThan(before);
      } else {
        expect(state.weather).toBe('snow');
        expect(Object.keys(state.preparations.braziers)).toHaveLength(0);
        expect(
          morningReport(state.log, state.preparations, state.day, 'en', [], state, 'wei').some(
            (i) => i.code === 'brazierDoused',
          ),
        ).toBe(true);
      }
      state = act(state, { type: 'dropMillstone', unitId: 'wei-haozhao', engineId: ram.id });
      const helperOutcome = playScriptDays(state, 'careful', T.days, 'wei');
      const days = [];
      let playable = state;
      while (!playable.outcome) {
        const units = playable.units.filter((u) => u.side === 'wei' && u.troops > 0 && !u.routed);
        const enabled = units.flatMap((u) =>
          siegeCommands(playable, u.id, 'wei')
            .filter((c) => !c.reason && !['standby', 'order', 'move'].includes(c.kind))
            .map((c) => c.kind),
        );
        days.push({
          day: playable.day,
          survivingUnits: units.length,
          enabledActions: enabled.length,
          kinds: [...new Set(enabled)],
          reportItems: morningReport(
            playable.log,
            playable.preparations,
            playable.day,
            'en',
            [],
            playable,
            'wei',
          ).length,
        });
        playable = endDay(runDefenderTurn(playable));
        if (!playable.outcome)
          playable = runAttackerTurn(playable, attackerMethodForSeed(playable.seed));
      }
      expect(playable).toEqual(helperOutcome);
      audits.push({
        seed,
        dayTwoWeather: state.weather,
        days,
        outcome: playable.outcome,
        finalDay: playable.day,
        weiTier: playable.stats.score!.wei.tier,
        weiScore: playable.stats.score!.wei.score,
        shuLost: playable.stats.shuLost,
        weiLost: playable.stats.weiLost,
      });
    }
    writeFileSync('/tmp/wei-complete-game-audit.json', JSON.stringify(audits, null, 2));
  }, 30_000);
});
