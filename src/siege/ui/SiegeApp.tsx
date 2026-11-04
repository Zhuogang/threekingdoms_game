import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Panel, Select, Tabs } from '../../v03/ui/kit';
import { OfficerPortrait } from '../../v03/rendering/OfficerPortrait';
import {
  DEPLOY_SHU,
  GATES,
  INNER_WALL_SEGMENTS,
  MAP_HEIGHT,
  MAP_WIDTH,
  SOUTH_TRENCH,
  cellKey,
  sameCell,
} from '../content/chencang';
import {
  activeUnit,
  predictSiegeAttack,
  predictSiegeClimb,
  climbingPosition,
  usableEngine,
  wallRun,
} from '../rules/combat';
import { SIEGE_TUNING as T } from '../rules/tuning';
import { ENGINE_RULES } from '../rules/day';
import { applySiegeAction } from '../rules/actions';
import { isWallFoot } from '../rules/map';
import { engineReachable, reachableCells } from '../rules/movement';
import { createSiegeState } from '../rules/state';
import type {
  EngineKind,
  GateId,
  SiegeAction,
  SiegePosition,
  SiegeState,
  SiegeLogEntry,
} from '../rules/types';
import {
  hasSiegeSave,
  loadSiege,
  saveSiege,
  presentationFor,
  type HintKind,
  type SiegeSave,
} from '../save';
import { rejectionText, siegeText, type SiegeLocale, type SiegeTextKey } from '../i18n';
import { SiegeMapView, type SiegeMapHandle } from '../render/SiegeMapView';
import {
  actionReason,
  deployUnit,
  nextShuUnit,
  siegeCommands,
  standBy,
  standByAll,
  extraActionTargets,
  type CommandKind,
} from './commands';
import { resolveSiegeDay } from './playback';
import { REPLAY_STEP_MS, type NightPresentation } from '../render/nightReplay';
import { OPENING, encounteredHints, engineKey } from './story';
import { SiegeActBanner, SiegeEnding, SiegeHint, SiegeOpening, paperStyle } from './SiegeStory';
import { SiegeIcon } from './storyAssets';
import { SiegeHowToPlay, SiegeWalkthroughBox } from './SiegeHowToPlay';
import { Forecast, ClimbForecast } from './SiegeForecast';
import { SiegeMorningReport } from './SiegeMorningReport';
import { morningReport, reportObservations } from './report';
import { selectCounterCard } from './counters';
import { advanceWalkthrough, startWalkthrough, settleWalkthrough } from './walkthrough';
import type { SiegeDev } from './devPlaythrough';
import './siege.css';

type Tab = 'commands' | 'defence' | 'workshop' | 'log';
type Mode = 'move' | 'attack' | 'climb' | 'fillTrench' | null;
const KINDS: EngineKind[] = ['ladder', 'ram', 'earthCart', 'tower'];
const portraitFiles = import.meta.glob(
  '/docs/siege/chencang/art/s5-0{7,8}-*/runtime/*-small.webp',
  { query: '?url', import: 'default', eager: true },
) as Record<string, string>;
const portrait = (id: string) =>
  Object.entries(portraitFiles).find(([path]) => path.endsWith(`/${id}-small.webp`))?.[1];
function initialGame(): SiegeSave {
  const querySeed =
    import.meta.env.DEV && typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('siegeSeed')
      : null;
  const seed = querySeed !== null && /^\d+$/.test(querySeed) ? Number(querySeed) : 228;
  const state = createSiegeState(seed);
  return {
    state,
    playerSide: 'shu',
    phase: 'opening',
    facings: {},
    presentation: {
      openingStep: 0,
      bannersSeen: [],
      dismissedHints: [],
      walkthrough: startWalkthrough(state),
    },
  };
}

export default function SiegeApp({
  locale,
  setLocale,
  onExit,
  initialLoad = false,
}: {
  locale: SiegeLocale;
  setLocale: (locale: SiegeLocale) => void;
  onExit: () => void;
  initialLoad?: boolean;
}) {
  const [game, setGame] = useState<SiegeSave>(initialGame);
  const state = game.state;
  const playerSide = game.playerSide ?? 'shu';
  const [reportOpen, setReportOpen] = useState(false);
  const [assault, setAssault] = useState(false);
  const [extraKind, setExtraKind] = useState<'suppress' | 'coverEngine' | 'pileEarth' | null>(null);
  const presentation = presentationFor(game);
  const opening = game.phase === 'opening';
  const [hint, setHint] = useState<HintKind | null>(null);
  const [summary, setSummary] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [selected, setSelected] = useState<string | null>('shu-weiyan');
  const [tab, setTab] = useState<Tab>('commands');
  const [mode, setMode] = useState<Mode>(null);
  const [showOrders, setShowOrders] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ key?: SiegeTextKey; reason?: string }>({});
  const [zoom, setZoom] = useState(1),
    [xray, setXray] = useState(false),
    [showRange, setShowRange] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [night, setNight] = useState<NightPresentation | null>(null);
  const [forecastHovered, setForecastHovered] = useState(false);
  const [activity, setActivity] = useState<{ id: string; type: string } | null>(null);
  const [effectAction, setEffectAction] = useState<{
    from: SiegePosition;
    to: SiegePosition;
    type: string;
  } | null>(null);
  const pendingReport = useRef<SiegeLogEntry[]>([]);
  const pending = useRef<SiegeState | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const map = useRef<SiegeMapHandle>(null);
  const text = (key: SiegeTextKey, params: Record<string, string | number> = {}) =>
    siegeText(locale, key, params);
  const unit = state.units.find((u) => u.id === selected),
    engine = state.engines.find((e) => e.id === selected);
  const actor = unit ?? engine;
  const commands = useMemo(
    () => (selected ? siegeCommands(state, selected, playerSide) : []),
    [state, selected, playerSide],
  );
  const reachable = useMemo(
    () =>
      !selected || playing
        ? []
        : unit
          ? reachableCells(state, selected)
          : engineReachable(state, selected),
    [state, selected, playing, unit],
  );
  const targets = useMemo(
    () =>
      !selected
        ? []
        : state.units
            .filter(
              (u) => u.side !== playerSide && predictSiegeAttack(state, selected, u.id)?.inRange,
            )
            .map((u) => ({ x: u.x, y: u.y, level: u.level })),
    [state, selected],
  );
  const forecast = selected && target ? predictSiegeAttack(state, selected, target) : null;
  const assaultForecast =
    forecast && unit && state.units.some((u) => u.id === target && climbingPosition(state, unit, u))
      ? predictSiegeAttack(state, selected!, target!, { assault: true })
      : null;
  const climbForecast = selected && mode === 'climb' ? predictSiegeClimb(state, selected) : null;
  const assaultClimb = climbForecast
    ? predictSiegeClimb(state, selected!, { assault: true })
    : null;
  const deploy = game.phase === 'deploy';
  const ended = Boolean(state.outcome) && !playing;
  const banner =
    !opening && !deploy && !ended && !playing && !presentation.bannersSeen.includes(state.act);
  const reportVisible =
    !opening &&
    !deploy &&
    !ended &&
    !playing &&
    !banner &&
    !howTo &&
    (reportOpen || (presentation.reportReadDay ?? 0) < state.day);
  const reportItems = useMemo(
    () =>
      morningReport(
        state.log,
        state.preparations,
        state.day,
        locale,
        presentation.reportObservations ?? [],
      ),
    [state, locale, presentation.reportObservations],
  );
  const counterCard = selectCounterCard(
    state,
    presentation.dismissedCounters ?? [],
    locale,
    playerSide,
  );
  const closeReport = () => {
    setReportOpen(false);
    setGame((g) => ({ ...g, presentation: { ...presentationFor(g), reportReadDay: g.state.day } }));
  };
  const walkthrough =
    opening || deploy || ended || playing || banner || howTo
      ? presentation.walkthrough
      : advanceWalkthrough(presentation.walkthrough, state, {
          tab,
          selected,
          reportReadDay: presentation.reportReadDay,
        });
  const walking = walkthrough?.status === 'active';
  const walkStep =
    walking && !opening && !deploy && !ended && !playing && !banner && !howTo && !reportVisible
      ? walkthrough.step
      : undefined;
  const pulse = (when: boolean) => (when ? 'siege-pulse' : undefined);
  useEffect(() => {
    if (walkthrough === presentation.walkthrough) return;
    setGame((g) => ({ ...g, presentation: { ...presentationFor(g), walkthrough } }));
  }, [walkthrough, presentation.walkthrough]);
  const advanceOpening = (skip = false) => {
    setGame((g) => {
      const progress = presentationFor(g);
      const openingStep = skip
        ? OPENING.length
        : Math.min(OPENING.length, progress.openingStep + 1);
      return {
        ...g,
        phase: openingStep === OPENING.length ? 'deploy' : 'opening',
        presentation: { ...progress, openingStep },
      };
    });
  };
  const dismissBanner = () =>
    setGame((g) => ({
      ...g,
      presentation: {
        ...presentationFor(g),
        bannersSeen: [...presentationFor(g).bannersSeen, g.state.act],
      },
    }));
  const dismissHint = () => {
    if (hint)
      setGame((g) => ({
        ...g,
        presentation: {
          ...presentationFor(g),
          dismissedHints: [...presentationFor(g).dismissedHints, hint],
        },
      }));
    setHint(null);
  };
  const name = (id: string) => {
    const u = state.units.find((u) => u.id === id);
    if (u) return locale === 'zh' ? u.officer.chinese : u.officer.name;
    const e = state.engines.find((e) => e.id === id);
    if (e) return text(engineKey(e.kind));
    return id in GATES ? text(id as GateId) : id;
  };
  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const finishPlayback = () => {
    clearTimer();
    if (pending.current) {
      const next = pending.current;
      setGame((g) => ({
        ...g,
        state: next,
        presentation: {
          ...presentationFor(g),
          reportObservations: pendingReport.current,
          walkthrough: settleWalkthrough(presentationFor(g).walkthrough, next, {
            tab,
            selected,
            reportReadDay: presentationFor(g).reportReadDay,
          }),
        },
      }));
      pending.current = null;
    }
    setPlaying(false);
    setNight(null);
    setActivity(null);
    setEffectAction(null);
  };
  const load = () => {
    try {
      const saved = loadSiege();
      if (!saved) {
        setFeedback({ key: 'noSave' });
        return;
      }
      clearTimer();
      pending.current = null;
      setPlaying(false);
      setNight(null);
      setActivity(null);
      setEffectAction(null);
      setGame(saved);
      setReportOpen(false);
      setExtraKind(null);
      setAssault(false);
      setHint(null);
      setSummary(false);
      setHowTo(false);
      setSelected(
        saved.state.units.find((u) => u.side === (saved.playerSide ?? 'shu') && activeUnit(u))
          ?.id ?? null,
      );
      setMode(null);
      setTarget(null);
      setFeedback({ key: 'loaded' });
    } catch {
      setFeedback({ key: 'badSave' });
    }
  };
  useEffect(() => {
    if (initialLoad) load();
    return clearTimer;
  }, []);
  const save = () => {
    const snapshot = {
      ...game,
      state: pending.current ?? state,
      presentation: {
        ...presentation,
        walkthrough:
          game.phase === 'battle'
            ? settleWalkthrough(walkthrough, pending.current ?? state, {
                tab,
                selected,
                reportReadDay: presentation.reportReadDay,
              })
            : walkthrough,
        ...(pending.current ? { reportObservations: pendingReport.current } : {}),
      },
    };
    if (pending.current) finishPlayback();
    try {
      saveSiege(snapshot);
      setFeedback({ key: 'saved' });
    } catch {
      setFeedback({ key: 'badSave' });
    }
  };
  const act = (action: SiegeAction) => {
    if (playing || opening || banner || reportVisible || howTo) return;
    const result = applySiegeAction(state, action);
    if (!result.ok) {
      setFeedback({ reason: result.reason });
      return;
    }
    const id = 'unitId' in action ? action.unitId : 'engineId' in action ? action.engineId : null;
    setGame((g) => {
      const facings = { ...g.facings };
      if (id && (action.type === 'move' || action.type === 'moveEngine')) {
        const before =
          g.state.units.find((u) => u.id === id) ?? g.state.engines.find((e) => e.id === id);
        facings[id] =
          before && action.x !== before.x ? (action.x > before.x ? 'east' : 'west') : 'north';
      }
      return { ...g, state: result.state, facings };
    });
    setMode(null);
    setTarget(null);
    if (action.type === 'order') setShowOrders(false);
    setFeedback({});
    if (id) {
      setActivity({ id, type: action.type === 'moveEngine' ? 'move' : action.type });
    }
  };
  const end = () => {
    if (playing || opening || banner || reportVisible || howTo || deploy || state.outcome) return;
    const resolution = resolveSiegeDay(state);
    pending.current = resolution.final;
    pendingReport.current = reportObservations(state, resolution.final);
    setPlaying(true);
    setMode(null);
    setTarget(null);
    setFeedback({});
    let index = 0;
    const advance = () => {
      const frame = resolution.frames[index++];
      if (!frame) {
        finishPlayback();
        return;
      }
      setNight(frame.night ?? null);
      const action = frame.action;
      const id = 'unitId' in action ? action.unitId : 'engineId' in action ? action.engineId : null;
      if (id) setActivity({ id, type: action.type === 'moveEngine' ? 'move' : action.type });
      const from = id ? state.units.find((u) => u.id === id) : undefined;
      const targetId =
        'targetId' in action
          ? action.targetId
          : 'engineId' in action && action.type !== 'moveEngine'
            ? action.engineId
            : null;
      const to = targetId
        ? (frame.state.units.find((u) => u.id === targetId) ??
          frame.state.engines.find((e) => e.id === targetId))
        : undefined;
      setEffectAction(
        from &&
          to &&
          ['attack', 'fireArrows', 'dropMillstone', 'dropBoulders'].includes(action.type)
          ? { from, to: { ...to, level: 'level' in to ? to.level : 'ground' }, type: action.type }
          : null,
      );
      setGame((g) => ({ ...g, state: frame.state }));
      timer.current = setTimeout(advance, frame.night?.duration ?? REPLAY_STEP_MS);
    };
    timer.current = setTimeout(advance, 90);
  };
  const select = (id: string) => {
    setSelected(id);
    setTarget(null);
    setMode(null);
    setExtraKind(null);
    setAssault(false);
    setTab('commands');
    setFeedback({});
  };
  const mapSelect = (id: string) => {
    if (playing || opening || banner || reportVisible || howTo) return;
    const clicked = state.units.find((u) => u.id === id);
    if (deploy && clicked?.side === 'shu' && selected && id !== selected) {
      setGame((g) => ({ ...g, state: deployUnit(g.state, selected, clicked) }));
      return;
    }
    if (
      !deploy &&
      clicked?.side !== playerSide &&
      clicked &&
      actor &&
      (!unit || unit.side === playerSide)
    ) {
      setTarget(id);
      setTab('commands');
      setMode('attack');
      return;
    }
    select(id);
  };
  const cell = (to: SiegePosition) => {
    if (!selected || playing || opening || banner || reportVisible || howTo) return;
    if (deploy) {
      if (!DEPLOY_SHU.some((c) => sameCell(c, to) && to.level === 'ground')) {
        setFeedback({ key: 'deploymentOnly' });
        return;
      }
      setGame((g) => ({ ...g, state: deployUnit(g.state, selected, to) }));
      return;
    }
    if (mode === 'attack') {
      const gate = (Object.keys(GATES) as GateId[]).find((id) =>
        GATES[id].cells.some((c) => sameCell(c, to)),
      );
      if (gate) setTarget(gate);
      return;
    }
    if (mode === 'fillTrench') {
      act(
        unit
          ? { type: 'fillTrench', unitId: selected, x: to.x, y: to.y }
          : { type: 'fillTrench', engineId: selected, x: to.x, y: to.y },
      );
      return;
    }
    act(
      unit
        ? { type: 'move', unitId: selected, ...to }
        : { type: 'moveEngine', engineId: selected, x: to.x, y: to.y },
    );
  };
  const command = (kind: CommandKind) => {
    if (!selected || playing || opening || banner || reportVisible || howTo || deploy) return;
    const entry = commands.find((c) => c.kind === kind);
    if (entry?.reason) {
      setFeedback({ reason: entry.reason });
      return;
    }
    if (kind === 'suppress' || kind === 'coverEngine' || kind === 'pileEarth') {
      setExtraKind(kind);
      setMode(null);
      setTarget(null);
      return;
    }
    setExtraKind(null);
    if (kind === 'standby') {
      setGame((g) => ({ ...g, state: standBy(g.state, selected, playerSide) }));
      setMode(null);
      setTarget(null);
      return;
    }
    if (kind === 'climb' && entry?.action?.type === 'climb') {
      setMode('climb');
      setTarget(null);
      setExtraKind(null);
      return;
    }
    if (kind === 'move' || kind === 'attack' || kind === 'climb' || kind === 'fillTrench') {
      setMode(kind);
      if (kind === 'fillTrench') setActivity({ id: selected, type: kind });
      if (kind === 'attack')
        setTarget(entry?.action && 'targetId' in entry.action ? entry.action.targetId : null);
      return;
    }
    if (kind === 'order') {
      setShowOrders(true);
      setMode(null);
      return;
    }
    if (entry?.action) act(entry.action);
  };
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest('input,select,textarea') ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setHowTo((show) => !show);
        return;
      }
      if (howTo) {
        if (event.key === 'Escape') {
          event.preventDefault();
          setHowTo(false);
        }
        return;
      }
      if (reportVisible) return;
      if (opening || banner) return;
      if (event.key === 'Escape') {
        finishPlayback();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        if (playing) return;
        const next = nextShuUnit(state, selected, playerSide);
        if (next) {
          select(next.id);
          map.current?.focus(next);
        }
        return;
      }
      if (playing || deploy || ended) return;
      if (event.key.toLowerCase() === 'q') {
        event.preventDefault();
        setGame((g) => ({ ...g, state: standByAll(g.state, playerSide) }));
        setMode(null);
        setTarget(null);
        setExtraKind(null);
      }
      if (event.key.toLowerCase() === 'e') {
        event.preventDefault();
        end();
      }
      if (event.key.toLowerCase() === 'a') {
        event.preventDefault();
        command('attack');
      }
      if (event.key.toLowerCase() === 'w') {
        event.preventDefault();
        command('standby');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  useEffect(() => {
    if (
      opening ||
      deploy ||
      ended ||
      playing ||
      banner ||
      hint ||
      walking ||
      howTo ||
      reportVisible ||
      counterCard
    )
      return;
    const next = encounteredHints(state, selected, forecast, mode === 'fillTrench').find(
      (kind) => !presentation.dismissedHints.includes(kind),
    );
    if (next) setHint(next);
  });
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const hook: SiegeDev = {
      snapshot: () => structuredClone(game),
      playScript: async (strategy, days = 21) => {
        if (game.phase !== 'battle' || playing)
          throw new Error('Start battle and finish playback first.');
        const { playScriptDays } = await import('./devPlaythrough');
        const next = playScriptDays(state, strategy, days);
        setGame((g) => ({ ...g, state: next }));
        setMode(null);
        setTarget(null);
        setHint(null);
        setSummary(false);
        return next.outcome;
      },
    };
    window.__siegeDev = hook;
    return () => {
      if (window.__siegeDev === hook) delete window.__siegeDev;
    };
  }, [game, playing]);
  const executeAttack = () => {
    if (!selected || !target) return;
    if (unit)
      act(
        target in GATES
          ? { type: 'attack', unitId: selected, gateId: target as GateId }
          : { type: 'attack', unitId: selected, targetId: target, assault },
      );
    else act({ type: 'attack', engineId: selected, targetId: target });
  };
  const forecastReason =
    selected && target
      ? actionReason(
          state,
          unit
            ? target in GATES
              ? { type: 'attack', unitId: selected, gateId: target as GateId }
              : { type: 'attack', unitId: selected, targetId: target, assault }
            : { type: 'attack', engineId: selected, targetId: target },
        )
      : null;
  const rangedReachable =
    mode === 'climb'
      ? reachable.filter((c) => c.level === 'wall')
      : mode === 'fillTrench'
        ? SOUTH_TRENCH.filter(
            (c) => actor && Math.abs(c.x - actor.x) + Math.abs(c.y - actor.y) === 1,
          ).map((c) => ({ ...c, level: 'ground' as const }))
        : reachable;
  return (
    <main
      className="siege-app"
      style={paperStyle}
      data-phase={ended ? 'ending' : game.phase}
      data-walk-step={walkStep}
    >
      <header className="siege-topbar">
        <div>
          <strong>{text('campaign')}</strong>
          <span data-testid="siege-day">
            <SiegeIcon name="day" />
            {text('day', { n: state.day })}
          </span>
          <span>
            <SiegeIcon name="grain" />
            {text('grain', { n: state.grain })}
          </span>
          <span>
            <SiegeIcon name="distance" />
            {text('distance', { n: state.zhangheDistance })}
          </span>
          <span>{text(state.weather)}</span>
          <span>{text('act', { n: state.act })}</span>
        </div>
        <nav>
          {!opening && !deploy && !ended && (
            <Button
              data-testid="report-open"
              disabled={playing || banner}
              onClick={() => setReportOpen(true)}
            >
              <SiegeIcon name="morningReport" />
              {text('morningReport')}
            </Button>
          )}
          <Button onClick={() => setHowTo(true)} aria-haspopup="dialog" aria-expanded={howTo}>
            {text('howToPlay')}
          </Button>
          <Button onClick={save}>{text('save')}</Button>
          <Button onClick={load}>{text('load')}</Button>
          <Button onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}>
            {text('language')}
          </Button>
          <Button
            onClick={() => {
              finishPlayback();
              onExit();
            }}
          >
            {text('back')}
          </Button>
          {!ended &&
            !opening &&
            (deploy ? (
              <Button
                variant="primary"
                onClick={() => {
                  setGame((g) => ({ ...g, phase: 'battle' }));
                  setFeedback({});
                }}
              >
                {text('begin')}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={end}
                data-testid="end-day"
                disabled={playing || banner || reportVisible}
                className={pulse(walkStep === 7)}
              >
                {text('endDay')}
              </Button>
            ))}
        </nav>
      </header>
      {(feedback.key || feedback.reason || (!opening && !ended)) && (
        <div className="siege-status" role="status">
          {playing ? (
            <>
              <strong>{text('playback')}</strong>
              <Button size="sm" data-testid="replay-skip" onClick={finishPlayback}>
                {text('skip')}
              </Button>
            </>
          ) : feedback.key ? (
            text(feedback.key)
          ) : feedback.reason ? (
            rejectionText(locale, feedback.reason)
          ) : deploy ? (
            text('deployHelp')
          ) : mode === 'attack' ? (
            text('chooseTarget')
          ) : mode === 'fillTrench' ? (
            text('chooseTrench')
          ) : (
            text('keys')
          )}
        </div>
      )}
      {opening ? (
        <SiegeOpening
          step={presentation.openingStep}
          locale={locale}
          next={() => advanceOpening()}
          skip={() => advanceOpening(true)}
        />
      ) : ended ? (
        <SiegeEnding
          state={state}
          locale={locale}
          playerSide={playerSide}
          summary={summary}
          onSummary={setSummary}
          onExit={onExit}
        />
      ) : (
        <>
          <div className="siege-camera">
            <Button size="sm" onClick={() => map.current?.focus()}>
              {text('southFocus')}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                map.current?.focus(unit ?? (engine ? { ...engine, level: 'ground' } : undefined))
              }
            >
              {text('focus')}
            </Button>
            <Button size="sm" onClick={() => map.current?.full()}>
              {text('fullMap')}
            </Button>
            {[0.5, 0.75, 1, 1.5].map((scale) => (
              <Button
                key={scale}
                size="sm"
                aria-pressed={Math.abs(zoom - scale) < 0.01}
                onClick={() => map.current?.zoom(scale)}
              >
                {Math.round(scale * 100)}%
              </Button>
            ))}
            <label>
              <input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} />
              {text('xray')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={showRange}
                onChange={(e) => setShowRange(e.target.checked)}
              />
              {text('range')}
            </label>
          </div>
          <div className="siege-body">
            <SiegeMapView
              ref={map}
              state={state}
              locale={locale}
              selected={selected}
              deploy={deploy}
              reachable={!deploy ? rangedReachable : []}
              targets={mode === 'attack' ? targets : []}
              tutorialCells={
                walkStep === 3
                  ? state.engines
                      .filter((e) => e.id === walkthrough?.ladderId)
                      .map((e) => ({ x: e.x, y: e.y, level: 'ground' }))
                  : []
              }
              facings={game.facings}
              activity={activity}
              effectAction={effectAction}
              night={night}
              forecastCell={
                forecastHovered
                  ? climbForecast
                    ? { ...climbForecast.top, level: 'wall' }
                    : state.units.find((u) => u.id === target)
                  : null
              }
              xray={xray}
              showRange={showRange}
              onSelect={mapSelect}
              onCell={cell}
              onZoom={setZoom}
            />
            <aside className="siege-sidebar" aria-label={text('commands')}>
              {walkStep && walkthrough && (
                <SiegeWalkthroughBox
                  progress={walkthrough}
                  locale={locale}
                  waiting={false}
                  skip={() =>
                    setGame((g) => ({
                      ...g,
                      presentation: {
                        ...presentationFor(g),
                        walkthrough: { ...walkthrough, status: 'skipped' },
                      },
                    }))
                  }
                />
              )}
              <div className="siege-sidebar-content">
                <div className="siege-walk-tabs">
                  <Tabs
                    value={tab}
                    onChange={setTab}
                    label={text('battle')}
                    tabs={(['commands', 'defence', 'workshop', 'log'] as Tab[]).map((value) => ({
                      value,
                      label: text(value),
                    }))}
                  />
                </div>
                {tab === 'commands' && (
                  <>
                    <div className="siege-roster">
                      {state.units
                        .filter((u) => u.troops > 0)
                        .map((u) => (
                          <Button
                            size="sm"
                            key={u.id}
                            data-testid={`select-${u.id}`}
                            className={pulse(
                              (walkStep === 3 &&
                                u.side === playerSide &&
                                u.troopType === 'infantry') ||
                                (walkStep === 5 &&
                                  u.side === playerSide &&
                                  u.troopType === 'archer'),
                            )}
                            aria-pressed={selected === u.id}
                            onClick={() => {
                              if (
                                u.side !== playerSide &&
                                actor &&
                                (!unit || unit.side === playerSide)
                              ) {
                                setTarget(u.id);
                                setMode('attack');
                              } else select(u.id);
                            }}
                          >
                            <span className={`siege-dot ${u.side}`} />
                            {name(u.id)}
                            {u.acted ? ' ✓' : ''}
                          </Button>
                        ))}
                      {state.engines.map((e) => (
                        <Button
                          size="sm"
                          key={e.id}
                          data-testid={`select-${e.id}`}
                          className={pulse(
                            walkStep === 1 && e.kind === 'ladder' && usableEngine(e),
                          )}
                          onClick={() => select(e.id)}
                          aria-pressed={selected === e.id}
                        >
                          {name(e.id)} ({e.x},{e.y})
                        </Button>
                      ))}
                    </div>
                    {actor ? (
                      <Panel title={name(actor.id)}>
                        {unit && (
                          <div className="siege-unit-card">
                            {portrait(unit.officer.id) ? (
                              <img src={portrait(unit.officer.id)} alt="" />
                            ) : (
                              <OfficerPortrait
                                id={unit.officer.portraitId ?? unit.officer.id}
                                locale={locale}
                                size={128}
                              />
                            )}
                            <div>
                              <strong>
                                {text(unit.side)} · {text(unit.troopType)}
                              </strong>
                              <div>{text('troops', { n: unit.troops })}</div>
                              <div>{text('wounded', { n: unit.wounded })}</div>
                              <div>{text('morale', { n: unit.morale })}</div>
                              <small>
                                {text('position', {
                                  x: unit.x,
                                  y: unit.y,
                                  level: text(unit.level),
                                })}
                              </small>
                            </div>
                          </div>
                        )}
                        {engine && (
                          <p>
                            {text('durability', { n: engine.durability, max: engine.max })}
                            {engine.uses !== undefined && (
                              <>
                                <br />
                                {text('loads', { n: engine.uses })}
                              </>
                            )}
                            {engine.covered && (
                              <>
                                <br />
                                {text('covered')}
                              </>
                            )}
                            {engine.burning && (
                              <>
                                <br />
                                {text('burning')}
                              </>
                            )}
                            {engine.wrecked && (
                              <>
                                <br />
                                {text('wreck')}
                              </>
                            )}
                          </p>
                        )}
                        {forecast && (
                          <div
                            onMouseEnter={() => setForecastHovered(true)}
                            onMouseLeave={() => setForecastHovered(false)}
                          >
                            <Forecast
                              forecast={forecast}
                              assaultForecast={assaultForecast}
                              checked={assault}
                              toggle={setAssault}
                              locale={locale}
                              target={name(target!)}
                              reason={forecastReason}
                              confirm={executeAttack}
                              disabled={playing || deploy}
                              cancel={() => setTarget(null)}
                            />
                          </div>
                        )}
                        {!deploy && climbForecast && assaultClimb && (
                          <div
                            onMouseEnter={() => setForecastHovered(true)}
                            onMouseLeave={() => setForecastHovered(false)}
                          >
                            <ClimbForecast
                              normal={climbForecast}
                              assault={assaultClimb}
                              locale={locale}
                              checked={assault}
                              toggle={setAssault}
                              disabled={playing}
                              reason={actionReason(state, {
                                type: 'climb',
                                unitId: selected!,
                                assault,
                              })}
                              confirm={() => act({ type: 'climb', unitId: selected!, assault })}
                              cancel={() => setMode(null)}
                            />
                          </div>
                        )}
                        {!deploy && extraKind && selected && (
                          <section data-testid="action-targets" className="siege-extra-targets">
                            <h4>{text(extraKind)}</h4>
                            {extraKind === 'suppress' && <p>{text('suppressHelp')}</p>}
                            {extraActionTargets(state, selected, extraKind, playerSide).map(
                              (action, i) => {
                                const reason = actionReason(state, action);
                                const label =
                                  'targetId' in action
                                    ? name(action.targetId)
                                    : action.type === 'coverEngine'
                                      ? name(action.engineId)
                                      : 'x' in action
                                        ? `(${action.x},${action.y})`
                                        : '';
                                return (
                                  <div key={i}>
                                    <Button
                                      size="sm"
                                      data-testid={`target-${extraKind}-${'targetId' in action ? action.targetId : 'engineId' in action && action.type === 'coverEngine' ? action.engineId : i}`}
                                      disabled={playing || Boolean(reason)}
                                      title={reason ? rejectionText(locale, reason) : undefined}
                                      onClick={() => {
                                        act(action);
                                        setExtraKind(null);
                                      }}
                                    >
                                      {label}
                                    </Button>
                                    {reason && <small>{rejectionText(locale, reason)}</small>}
                                  </div>
                                );
                              },
                            )}
                          </section>
                        )}
                        {!deploy && (
                          <>
                            <div className="siege-actions">
                              {commands.map((c) => (
                                <div key={c.kind}>
                                  <Button
                                    size="sm"
                                    data-testid={`command-${c.kind}`}
                                    className={pulse(
                                      (walkStep === 2 && c.kind === 'raiseLadder') ||
                                        (walkStep === 4 &&
                                          (c.kind === 'climb' || c.kind === 'attack')) ||
                                        (walkStep === 6 && c.kind === 'suppress') ||
                                        (walkStep === 9 && c.kind === 'coverEngine'),
                                    )}
                                    disabled={Boolean(c.reason) || playing}
                                    title={c.reason ? rejectionText(locale, c.reason) : undefined}
                                    onClick={() => command(c.kind)}
                                    aria-pressed={mode === c.kind}
                                  >
                                    <SiegeIcon name={c.kind} />
                                    {text(c.kind)}
                                  </Button>
                                  {c.reason && <small>{rejectionText(locale, c.reason)}</small>}
                                </div>
                              ))}
                            </div>
                            {(!unit || unit.side === playerSide) && (
                              <details
                                open={showOrders}
                                onToggle={(event) => setShowOrders(event.currentTarget.open)}
                              >
                                <summary>{text('order')}</summary>
                                <p>{text('nightUnknown')}</p>
                                <Button
                                  data-testid="order-nightAssault"
                                  disabled={
                                    playing ||
                                    Boolean(
                                      actionReason(state, {
                                        type: 'order',
                                        side: 'shu',
                                        kind: 'nightAssault',
                                      }),
                                    )
                                  }
                                  onClick={() =>
                                    act({ type: 'order', side: 'shu', kind: 'nightAssault' })
                                  }
                                >
                                  <SiegeIcon name="nightAssault" />
                                  {text('nightAssault')}
                                </Button>
                                {(['rally', 'supervise', 'rotate'] as const).map((kind) => (
                                  <label className="siege-order" key={kind}>
                                    <SiegeIcon name={kind} large />
                                    {text(kind)}
                                    <Select
                                      aria-label={text(kind)}
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value)
                                          act({
                                            type: 'order',
                                            side: 'shu',
                                            kind,
                                            target: e.target.value,
                                          });
                                      }}
                                      disabled={
                                        playing || Boolean(state.ordersUsed[playerSide][state.day])
                                      }
                                    >
                                      <option value="">{text('select')}</option>
                                      {(kind === 'supervise'
                                        ? state.workshops.map((w) => ({
                                            id: w.id,
                                            label: text('workshopName', {
                                              n: state.workshops.indexOf(w) + 1,
                                            }),
                                          }))
                                        : state.units
                                            .filter((u) => u.side === 'shu' && u.troops > 0)
                                            .map((u) => ({ id: u.id, label: name(u.id) }))
                                      ).map((option) => {
                                        const reason = actionReason(state, {
                                          type: 'order',
                                          side: 'shu',
                                          kind,
                                          target: option.id,
                                        });
                                        return (
                                          <option
                                            key={option.id}
                                            value={option.id}
                                            disabled={Boolean(reason)}
                                          >
                                            {option.label}
                                            {reason ? ` · ${rejectionText(locale, reason)}` : ''}
                                          </option>
                                        );
                                      })}
                                    </Select>
                                  </label>
                                ))}
                              </details>
                            )}
                            <details>
                              <summary>{text('chooseTarget')}</summary>
                              {(Object.keys(GATES) as GateId[]).map((id) => (
                                <Button
                                  key={id}
                                  size="sm"
                                  onClick={() => {
                                    setTarget(id);
                                    setMode('attack');
                                  }}
                                >
                                  {text(id)}
                                </Button>
                              ))}
                            </details>
                          </>
                        )}
                      </Panel>
                    ) : (
                      <p>{text('select')}</p>
                    )}
                  </>
                )}
                {tab === 'defence' && (
                  <Defence state={state} locale={locale} focus={(p) => map.current?.focus(p)} />
                )}
                {tab === 'workshop' && (
                  <Panel title={text('workshop')}>
                    <strong>
                      {text('engineCap', {
                        n: state.engines.filter(usableEngine).length,
                        max: T.engineCap,
                      })}
                    </strong>
                    <p>{text('engineRule', { max: T.engineCap })}</p>
                    {deploy && (
                      <p role="note">{text('workshopAfterDeploy', { begin: text('begin') })}</p>
                    )}
                    {state.workshops.map((w, i) => (
                      <section key={w.id} className="siege-workshop">
                        <h4>{text('workshopName', { n: i + 1 })}</h4>
                        <p data-testid={`queue-${w.id}`}>
                          {w.queue
                            ? `${text(engineKey(w.queue))} · ${text('daysLeft', { n: w.daysRemaining })}`
                            : text('empty')}
                        </p>
                        {(() => {
                          const action: SiegeAction = {
                            type: 'order',
                            side: 'shu',
                            kind: 'supervise',
                            target: w.id,
                          };
                          const reason = actionReason(state, action);
                          return (
                            <div className="siege-supervise">
                              <Button
                                size="sm"
                                data-testid={`supervise-${w.id}`}
                                className={pulse(walkStep === 4 && !reason)}
                                disabled={Boolean(reason) || playing || deploy}
                                title={reason ? rejectionText(locale, reason) : undefined}
                                onClick={() => act(action)}
                              >
                                <SiegeIcon name="supervise" />
                                {text('supervise')}
                              </Button>
                              {reason && <small>{rejectionText(locale, reason)}</small>}
                            </div>
                          );
                        })()}
                        {KINDS.map((kind) => {
                          const action: SiegeAction = {
                            type: 'queueEngine',
                            workshopId: w.id,
                            kind,
                          };
                          const reason = actionReason(state, action);
                          return (
                            <div key={kind} className="siege-build">
                              <Button
                                size="sm"
                                data-testid={`build-${w.id}-${kind}`}
                                disabled={Boolean(reason) || playing || deploy}
                                title={reason ? rejectionText(locale, reason) : undefined}
                                onClick={() => act(action)}
                              >
                                <SiegeIcon name={engineKey(kind)} />
                                {text('queue', { kind: text(engineKey(kind)) })}
                              </Button>
                              <small>
                                {text('buildCost', { n: ENGINE_RULES[kind].days })}
                                {reason && (
                                  <>
                                    <br />
                                    {rejectionText(locale, reason)}
                                  </>
                                )}
                              </small>
                            </div>
                          );
                        })}
                      </section>
                    ))}
                  </Panel>
                )}
                {tab === 'log' && (
                  <Panel title={text('log')}>
                    <ol className="siege-log">
                      {state.log.length === 0 && <li>{text('noLog')}</li>}
                      {state.log
                        .slice(-120)
                        .reverse()
                        .map((entry, i) => (
                          <li key={`${state.log.length - i}`}>
                            {text('logEntry', {
                              n: entry.day,
                              event:
                                entry.code === 'combat'
                                  ? text('logCombat', {
                                      source: name(String(entry.params.sourceId)),
                                      target: name(String(entry.params.targetId)),
                                      loss: Number(entry.params.casualties),
                                      counter: Number(entry.params.counterCasualties),
                                    })
                                  : text(logKey(entry.code)),
                            })}
                            {entry.params.unitId || entry.params.engineId
                              ? ` · ${name(String(entry.params.unitId ?? entry.params.engineId))}`
                              : ''}
                          </li>
                        ))}
                    </ol>
                  </Panel>
                )}
                {!deploy && (
                  <Button
                    variant="danger"
                    onClick={() => act({ type: 'withdraw' })}
                    disabled={playing}
                  >
                    {text('withdraw')}
                  </Button>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
      {howTo && (
        <SiegeHowToPlay
          locale={locale}
          close={() => setHowTo(false)}
          replay={() => {
            setGame((g) => ({
              ...g,
              presentation: { ...presentationFor(g), walkthrough: startWalkthrough(g.state) },
            }));
            setHint(null);
            setHowTo(false);
            setTab('commands');
          }}
        />
      )}
      {reportVisible && (
        <SiegeMorningReport items={reportItems} locale={locale} close={closeReport} />
      )}
      {counterCard &&
        !opening &&
        !deploy &&
        !ended &&
        !playing &&
        !banner &&
        !reportVisible &&
        !howTo && (
          <aside
            className="siege-hint siege-counter"
            role="region"
            data-testid="counter-card"
            data-kind={counterCard.kind}
          >
            <h3>
              <SiegeIcon name={counterCard.icon} />
              {text('counterCard')} · {counterCard.title}
            </h3>
            <ul>
              {counterCard.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <Button
              size="sm"
              data-testid="counter-dismiss"
              onClick={() =>
                setGame((g) => ({
                  ...g,
                  presentation: {
                    ...presentationFor(g),
                    dismissedCounters: [
                      ...(presentationFor(g).dismissedCounters ?? []),
                      counterCard.kind,
                    ],
                  },
                }))
              }
            >
              {text('dismissHint')}
            </Button>
          </aside>
        )}
      {banner && <SiegeActBanner act={state.act} locale={locale} close={dismissBanner} />}
      {hint &&
        !opening &&
        !deploy &&
        !ended &&
        !playing &&
        !banner &&
        !walking &&
        !howTo &&
        !reportVisible &&
        !counterCard && <SiegeHint kind={hint} locale={locale} dismiss={dismissHint} />}
    </main>
  );
}
function logKey(code: string): SiegeTextKey {
  const known: Record<string, SiegeTextKey> = {
    suppress: 'suppress',
    coverEngine: 'coverEngine',
    covered: 'covered',
    pileEarth: 'pileEarth',
    earthPiled: 'pileEarth',
    moundFinished: 'pileEarth',
    climb: 'climb',
    assault: 'assault',
    brazierPrepared: 'brazier',
    millstonePrepared: 'millstone',
    bouldersPrepared: 'boulders',
    fireArrowHit: 'fireArrows',
    millstoneHit: 'dropMillstone',
    bouldersHit: 'dropBoulders',
    torches: 'torches',
    nightAssault: 'nightAssault',
    nightAssaultAdvanced: 'nightAssault',
    nightClash: 'counterCard',
    sortieHit: 'sortie',
    sortieRepelled: 'sortie',
    brazierDoused: 'snow',
    engineLost: 'engineLoss',
    thrownOffWall: 'climb',
    wallGained: 'climb',
    holdFastOrdered: 'standby',
    nightRepair: 'gates',
    move: 'move',
    attack: 'attack',
    fillTrench: 'fillTrench',
    raiseLadder: 'raiseLadder',
    ram: 'ram',
    buildWall: 'buildWall',
    order: 'order',
    standby: 'standby',
    moveEngine: 'moveEngine',
    queueEngine: 'queueEngine',
    fireArrows: 'fireArrows',
    dropMillstone: 'dropMillstone',
    dropBoulders: 'dropBoulders',
    engineCompleted: 'engineCompleted',
    engineBurning: 'engineBurning',
    daySupplies: 'daySupplies',
    dayStarted: 'dayStarted',
    defenderTurnComplete: 'defenderTurnComplete',
    defenderBreach: 'defenderBreach',
    rotateRecovery: 'rotateRecovery',
    withdraw: 'withdraw',
  };
  return known[code] ?? 'unknownEvent';
}
function Defence({
  state,
  locale,
  focus,
}: {
  state: SiegeState;
  locale: SiegeLocale;
  focus: (p: SiegePosition) => void;
}) {
  const t = (k: SiegeTextKey, p: Record<string, string | number> = {}) => siegeText(locale, k, p);
  const runs: SiegePosition[][] = [];
  const seen = new Set<string>();
  for (let y = 0; y < MAP_HEIGHT; y++)
    for (let x = 0; x < MAP_WIDTH; x++)
      if (!seen.has(`${x},${y}`)) {
        const run = wallRun(state, { x, y });
        if (run.length) {
          run.forEach((c) => seen.add(cellKey(c)));
          runs.push(run.map((c) => ({ ...c, level: 'wall' })));
        }
      }
  runs.push(
    ...Object.values(GATES).map((gate) =>
      gate.cells.map((c) => ({ ...c, level: 'wall' as const })),
    ),
  );
  const troops = (cells: readonly { x: number; y: number }[]) =>
    state.units
      .filter(
        (u) =>
          u.side === 'wei' &&
          u.level === 'wall' &&
          activeUnit(u) &&
          cells.some((c) => sameCell(c, u)),
      )
      .reduce((n, u) => n + u.troops, 0);
  return (
    <div data-testid="defense-panel">
      <Panel title={t('defence')}>
        <h4>
          <SiegeIcon name="gates" />
          {t('gates')}
        </h4>
        {(Object.keys(GATES) as GateId[]).map((id) => (
          <div className="siege-gate" key={id}>
            <Button size="sm" onClick={() => focus({ ...GATES[id].cells[0]!, level: 'wall' })}>
              {t(id)}
            </Button>
            <progress max={state.gates[id].max} value={state.gates[id].durability} />
            <span>
              {state.gates[id].durability}/{state.gates[id].max}
            </span>
          </div>
        ))}
        <h4>
          <SiegeIcon name="wallRuns" />
          {t('wallRuns')}
        </h4>
        {runs.map((run) => {
          const defenders = troops(run);
          const attackers = state.units
            .filter(
              (u) =>
                u.side === 'shu' && activeUnit(u) && run.some((c) => climbingPosition(state, u, c)),
            )
            .reduce((sum, u) => sum + u.troops, 0);
          return (
            <section
              className="siege-defense-run"
              data-testid={`defense-run-${cellKey(run[0]!)}`}
              key={cellKey(run[0]!)}
            >
              <Button size="sm" onClick={() => focus(run[0]!)}>
                {t('run', { ...run[0]!, n: defenders })}
              </Button>
              <small>
                {t('pressure', {
                  attackers,
                  defenders,
                  ratio: defenders ? (attackers / defenders).toFixed(1) : attackers ? '∞' : 0,
                })}
              </small>
              <progress
                aria-label={t('wallRuns')}
                max={Math.max(defenders, attackers, 1)}
                value={attackers}
              />
              <div className="siege-prep-icons">
                {run.flatMap((c) => {
                  const key = cellKey(c);
                  return (
                    [
                      ['brazier', state.preparations.braziers[key]],
                      ['millstone', state.preparations.millstones[key]?.hoisted],
                      ['boulders', state.preparations.boulders[key]],
                    ] as const
                  )
                    .filter(([, ready]) => ready)
                    .map(([icon]) => (
                      <span key={`${key}-${icon}`} title={`(${key}) ${t(icon)}`}>
                        <SiegeIcon name={icon} />
                        {t(icon)} ({key})
                      </span>
                    ));
                })}
              </div>
              <div className="siege-foothold-cells">
                {run.map((c) => (
                  <span key={cellKey(c)}>
                    {t('footholdCell', {
                      cell: cellKey(c),
                      n: state.footholds[cellKey(c)] ?? 0,
                      max: T.footholdComplete,
                    })}
                  </span>
                ))}
              </div>
            </section>
          );
        })}
        {(Object.keys(GATES) as GateId[]).map((id) => (
          <p key={id}>{t('gateTop', { gate: t(id), n: troops(GATES[id].cells) })}</p>
        ))}
        <h4>
          <SiegeIcon name="innerWall" />
          {t('innerWall')}
        </h4>
        {INNER_WALL_SEGMENTS.map((s) => (
          <div key={s.index}>
            {t('segment', { n: s.index + 1 })} ({s.cells[0]!.x}–{s.cells.at(-1)!.x}) ·{' '}
            {t('progress', { n: state.innerWall[s.index] ?? 0 })}
          </div>
        ))}
        <h4>
          <SiegeIcon name="raised" />
          {t('raised')}
        </h4>
        {state.engines
          .filter((e) => e.raisedAt && usableEngine(e))
          .map((e) => (
            <Button size="sm" key={e.id} onClick={() => focus({ ...e.raisedAt!, level: 'wall' })}>
              ({e.raisedAt!.x},{e.raisedAt!.y})
            </Button>
          ))}
        {!state.engines.some((e) => e.raisedAt && usableEngine(e)) && <p>{t('none')}</p>}
        <h4>
          <SiegeIcon name="filled" />
          {t('filled')}
        </h4>
        {SOUTH_TRENCH.filter((c) => isWallFoot(state, c.x, c.y)).map((c) => (
          <Button size="sm" key={cellKey(c)} onClick={() => focus({ ...c, level: 'ground' })}>
            ({c.x},{c.y})
          </Button>
        ))}
        {!SOUTH_TRENCH.some((c) => isWallFoot(state, c.x, c.y)) && <p>{t('none')}</p>}
      </Panel>
    </div>
  );
}
export { hasSiegeSave };
