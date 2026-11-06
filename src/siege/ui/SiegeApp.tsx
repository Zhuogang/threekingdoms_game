import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Panel, Select, Tabs } from '../../v03/ui/kit';
import {
  DEPLOY_SHU,
  DEPLOY_WEI,
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
  SiegeSide,
  SiegeLogEntry,
} from '../rules/types';
import { hasSiegeSave, loadSiege, saveSiege, presentationFor, type SiegeSave } from '../save';
import { rejectionText, siegeText, type SiegeLocale, type SiegeTextKey } from '../i18n';
import { SiegeMapView, siegeRenderCounts, type SiegeMapHandle } from '../render/SiegeMapView';
import {
  actionReason,
  actionContext,
  deployUnit,
  actorTargets,
  siegeCommands,
  standBy,
  standByAll,
  extraActionTargets,
  type CommandKind,
  type ExtraCommandKind,
} from './commands';
import { actorQueue, actorTodo, nextActor } from './actorTodo';
import { resolveSiegeDayAsync, resolveAttackerPhaseAsync, type PlaybackFrame } from './playback';
import { REPLAY_STEP_MS, type NightPresentation } from '../render/nightReplay';
import { OPENING, encounteredHints, engineKey } from './story';
import { SiegeActBanner, SiegeEnding, SiegeHint, SiegeOpening, paperStyle } from './SiegeStory';
import { SiegeIcon, storyArt } from './storyAssets';
import { SiegeHowToPlay, SiegeWalkthroughBox } from './SiegeHowToPlay';
import { Forecast, ClimbForecast, ActionForecast } from './SiegeForecast';
import { SiegeMorningReport } from './SiegeMorningReport';
import { morningReport, reportObservations, rememberReport } from './report';
import { counterCards } from './counters';
import { enqueueCards, visibleCard, type QueuedCard } from './cardQueue';
import { placeName } from './places';
import { nextGoalGuide } from './nextGoalGuide';
import { engineGuide } from './engineGuide';
import { climbGuide, climbGuideText } from './climbGuide';
import { unitVisual } from '../render/stateArt';
import {
  advanceWalkthrough,
  startWalkthrough,
  settleWalkthrough,
  walkthroughNeedsEndDay,
  walkthroughTargets,
} from './walkthrough';
import {
  preparationRows,
  tonightOrder,
  weiOrderTargets,
  weiOrderLabel,
  type WeiOrderKind,
} from './wei';
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
function initialGame(playerSide: SiegeSide = 'shu'): SiegeSave {
  const querySeed =
    import.meta.env.DEV && typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('siegeSeed')
      : null;
  const seed = querySeed !== null && /^\d+$/.test(querySeed) ? Number(querySeed) : 228;
  const state = createSiegeState(seed);
  return {
    state,
    playerSide,
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
  initialSide = 'shu',
}: {
  locale: SiegeLocale;
  setLocale: (locale: SiegeLocale) => void;
  onExit: () => void;
  initialLoad?: boolean;
  initialSide?: SiegeSide;
}) {
  const [game, setGame] = useState<SiegeSave>(() => initialGame(initialSide));
  const state = game.state;
  const playerSide = game.playerSide ?? 'shu';
  const [reportOpen, setReportOpen] = useState(false);
  const [assault, setAssault] = useState(false);
  const [extraKind, setExtraKind] = useState<ExtraCommandKind | null>(null);
  const presentation = presentationFor(game);
  const opening = game.phase === 'opening';
  const [cards, setCards] = useState<QueuedCard[]>([]);
  const [actionExplanation, setActionExplanation] = useState<string | null>(null);
  const [explanationKind, setExplanationKind] = useState<CommandKind | null>(null);
  const [focusPlace, setFocusPlace] = useState<SiegePosition | null>(null);
  const [summary, setSummary] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [selected, setSelected] = useState<string | null>(
    initialSide === 'wei' ? null : 'shu-weiyan',
  );
  const [tab, setTab] = useState<Tab>('commands');
  const [mode, setMode] = useState<Mode>(null);
  const [showOrders, setShowOrders] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [targetAction, setTargetAction] = useState<SiegeAction | null>(null);
  const [feedback, setFeedback] = useState<{ key?: SiegeTextKey; reason?: string }>({});
  const [zoom, setZoom] = useState(1),
    [xray, setXray] = useState(false),
    [showRange, setShowRange] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [night, setNight] = useState<NightPresentation | null>(null);
  const [forecastHovered, setForecastHovered] = useState(false);
  const [activity, setActivity] = useState<{ id: string; type: string } | null>(null);
  const [effectAction, setEffectAction] = useState<{
    from: SiegePosition;
    to: SiegePosition;
    type: string;
  } | null>(null);
  const resolvingRef = useRef(false);
  const resolutionVersion = useRef(0);
  const resolutionRun = useRef<Promise<void> | null>(null);
  const skipAfterResolution = useRef(false);
  const pendingReport = useRef<SiegeLogEntry[]>([]);
  const pending = useRef<SiegeState | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const map = useRef<SiegeMapHandle>(null);
  const text = (key: SiegeTextKey, params: Record<string, string | number> = {}) =>
    siegeText(locale, key, params);
  const unit = state.units.find((u) => u.id === selected),
    engine = state.engines.find((e) => e.id === selected);
  const actor = unit ?? engine;
  const guide = useMemo(() => (selected ? climbGuide(state, selected) : null), [state, selected]);
  const nextGoal = useMemo(
    () => (selected ? nextGoalGuide(state, selected) : null),
    [state, selected],
  );
  const engineHint = useMemo(
    () => (selected ? engineGuide(state, selected) : null),
    [state, selected],
  );
  const commands = useMemo(
    () => (selected ? siegeCommands(state, selected, playerSide) : []),
    [state, selected, playerSide],
  );
  const queue = useMemo(() => actorQueue(state, playerSide), [state, playerSide]);
  const actCount = queue.filter((a) => actorTodo(state, a.id, playerSide) === 'act').length;
  const moveCount = queue.length - actCount;
  const legalTargets = useMemo(
    () => (selected ? actorTargets(state, selected, playerSide) : []),
    [state, selected, playerSide],
  );
  const actionPreview = useMemo(
    () => (targetAction ? applySiegeAction(state, targetAction) : null),
    [state, targetAction],
  );
  const renderActionReason = useMemo(() => {
    const reasons = new Map<string, string | null>();
    return (action: SiegeAction) => {
      const key = JSON.stringify(action);
      if (!reasons.has(key)) reasons.set(key, actionReason(state, action));
      return reasons.get(key)!;
    };
  }, [state]);
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
    [state, selected, playerSide],
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
  const needsAttacker =
    playerSide === 'wei' &&
    game.phase === 'battle' &&
    !state.outcome &&
    presentation.attackerTurnDay !== state.day;
  const ended = Boolean(state.outcome) && !playing;
  const banner =
    !opening &&
    !deploy &&
    !ended &&
    !playing &&
    !needsAttacker &&
    !presentation.bannersSeen.includes(state.act);
  const reportVisible =
    !opening &&
    !deploy &&
    !ended &&
    !playing &&
    !needsAttacker &&
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
        state,
        playerSide,
        presentation.reportSeen,
      ),
    [state, locale, playerSide, presentation.reportObservations, presentation.reportSeen],
  );
  useEffect(() => {
    if (!reportVisible) return;
    const seen = presentation.reportSeen ?? {};
    const next = rememberReport(reportItems, seen, state.day);
    if (Object.keys(next).length === Object.keys(seen).length) return;
    setGame((g) => ({ ...g, presentation: { ...presentationFor(g), reportSeen: next } }));
  }, [reportVisible, reportItems, state.day, presentation.reportSeen]);
  const availableCounters = counterCards(
    state,
    presentation.dismissedCounters ?? [],
    locale,
    playerSide,
  );
  const closeReport = () => {
    setReportOpen(false);
    setFocusPlace(null);
    setGame((g) => ({ ...g, presentation: { ...presentationFor(g), reportReadDay: g.state.day } }));
  };
  const walkthrough =
    opening || deploy || ended || playing || banner || howTo
      ? presentation.walkthrough
      : advanceWalkthrough(presentation.walkthrough, state, {
          tab,
          playerSide,
          selected,
          reportReadDay: presentation.reportReadDay,
        });
  const walking = walkthrough?.status === 'active';
  const walkStep =
    walking && !opening && !deploy && !ended && !playing && !banner && !howTo && !reportVisible
      ? walkthrough.step
      : undefined;
  const activeCard = visibleCard(cards, {
    report: reportVisible,
    replay: playing,
    modal: opening || deploy || ended || banner || howTo,
    walkthrough: walking,
  });
  const counterCard = availableCounters.find((c) => `counter-${c.kind}` === activeCard?.id);
  const hint =
    activeCard?.type === 'hint' ? (activeCard.id.slice(5) as import('../save').HintKind) : null;
  useEffect(() => {
    const dismissed = [
      ...presentation.dismissedHints.map((h) => `hint-${h}`),
      ...(presentation.dismissedCounters ?? []).map((k) => `counter-${k}`),
    ];
    const candidates: QueuedCard[] = [
      ...availableCounters.map((c) => ({ id: `counter-${c.kind}`, type: 'counter' as const })),
      ...encounteredHints(state, selected, forecast, mode === 'fillTrench').map((kind) => ({
        id: `hint-${kind}`,
        type: 'hint' as const,
      })),
    ];
    if (opening || deploy || ended || playing) return;
    setCards((queue) => {
      const next = enqueueCards(
        queue.filter(
          (c) => c.type !== 'counter' || candidates.some((candidate) => candidate.id === c.id),
        ),
        candidates,
        dismissed,
      );
      return JSON.stringify(queue) === JSON.stringify(next) ? queue : next;
    });
  }, [
    state,
    selected,
    mode,
    opening,
    deploy,
    ended,
    playing,
    presentation.dismissedHints,
    presentation.dismissedCounters,
    availableCounters.map((c) => c.kind).join(','),
  ]);
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
    setCards((queue) => queue.filter((c) => c.id !== `hint-${hint}`));
  };
  const name = (id: string) => {
    const u = state.units.find((u) => u.id === id);
    if (u) return locale === 'zh' ? u.officer.chinese : u.officer.name;
    const e = state.engines.find((e) => e.id === id);
    if (e) return text(engineKey(e.kind));
    return id in GATES ? text(id as GateId) : id;
  };
  const commandExplanation = (reason: string, kind: CommandKind | null) =>
    guide && kind === 'climb' ? climbGuideText(guide, locale, name) : rejectionText(locale, reason);
  const explainAction = (reason: string | null, kind: CommandKind | null = null) => {
    setActionExplanation(reason);
    setExplanationKind(kind);
  };
  const guideBase =
    !deploy && !playing && engineHint && !engineHint.done
      ? engineHint.target
      : !deploy && !playing && nextGoal && 'target' in nextGoal
        ? nextGoal.target
        : !deploy && !playing && guide && 'base' in guide
          ? { ...guide.base, level: 'ground' as const }
          : null;
  const guideLabel = text(
    engineHint
      ? engine?.kind === 'ram'
        ? 'ram'
        : engine?.kind === 'earthCart'
          ? 'fillTrench'
          : 'climbBaseLabel'
      : nextGoal && 'target' in nextGoal
        ? nextGoal.kind === 'gate'
          ? 'openGate'
          : 'courtyard'
        : guide?.kind === 'ladderNotRaised'
          ? 'climbUnraisedLabel'
          : ((guide?.kind === 'walkToBase' || guide?.kind === 'allyAbove') &&
                guide.route === 'wallFoot') ||
              (guide?.kind === 'defenderAbove' &&
                unit &&
                climbingPosition(state, unit, { ...guide.top, level: 'wall' }) !== 'ladder')
            ? 'climbWallFootLabel'
            : 'climbBaseLabel',
  );
  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  const finishPlayback = () => {
    if (resolvingRef.current) {
      skipAfterResolution.current = true;
      return;
    }
    clearTimer();
    if (pending.current) {
      const next = pending.current;
      setGame((g) => ({
        ...g,
        state: next,
        presentation: {
          ...presentationFor(g),
          reportObservations: pendingReport.current,
          ...(playerSide === 'wei' ? { attackerTurnDay: next.day } : {}),
          walkthrough: settleWalkthrough(presentationFor(g).walkthrough, next, {
            tab,
            playerSide,
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
  const load = (latest = false) => {
    try {
      const saved = loadSiege(localStorage, latest ? undefined : playerSide);
      if (!saved) {
        setFeedback({ key: 'noSave' });
        return;
      }
      clearTimer();
      resolutionVersion.current++;
      resolvingRef.current = false;
      resolutionRun.current = null;
      skipAfterResolution.current = false;
      setResolving(false);
      pending.current = null;
      setPlaying(false);
      setNight(null);
      setActivity(null);
      setEffectAction(null);
      setGame(saved);
      setReportOpen(false);
      setExtraKind(null);
      setAssault(false);
      setCards([]);
      setSummary(false);
      setHowTo(false);
      setSelected(
        saved.state.units.find((u) => u.side === (saved.playerSide ?? 'shu') && activeUnit(u))
          ?.id ?? null,
      );
      setMode(null);
      setTarget(null);
      setTargetAction(null);
      setFeedback({ key: 'loaded' });
    } catch {
      setFeedback({ key: 'badSave' });
    }
  };
  useEffect(() => {
    if (initialLoad) load(true);
    return () => {
      clearTimer();
      resolutionVersion.current++;
      resolvingRef.current = false;
    };
  }, []);
  const save = async () => {
    const version = resolutionVersion.current;
    if (resolutionRun.current) await resolutionRun.current;
    if (version !== resolutionVersion.current) return;
    const snapshot = {
      ...game,
      state: pending.current ?? state,
      presentation: {
        ...presentation,
        walkthrough:
          game.phase === 'battle'
            ? settleWalkthrough(walkthrough, pending.current ?? state, {
                tab,
                playerSide,
                selected,
                reportReadDay: presentation.reportReadDay,
              })
            : walkthrough,
        ...(pending.current
          ? {
              reportObservations: pendingReport.current,
              ...(playerSide === 'wei' ? { attackerTurnDay: pending.current.day } : {}),
            }
          : {}),
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
    if ('unitId' in action && state.units.find((u) => u.id === action.unitId)?.side !== playerSide)
      return;
    if ('engineId' in action && !('unitId' in action) && playerSide !== 'shu') return;
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
    setTargetAction(null);
    setExtraKind(null);
    setFocusPlace(null);
    if (action.type === 'order') setShowOrders(false);
    setFeedback({});
    if (id) {
      setActivity({ id, type: action.type === 'moveEngine' ? 'move' : action.type });
    }
    if (
      selected &&
      id === selected &&
      !deploy &&
      !result.state.outcome &&
      actorTodo(result.state, selected, playerSide) === 'none'
    ) {
      chooseNext(result.state);
    }
  };
  const end = () => {
    if (playing || opening || banner || reportVisible || howTo || deploy || state.outcome) return;
    void startResolution(() => resolveSiegeDayAsync(state, playerSide));
  };
  const startResolution = (
    resolve: () =>
      | { frames: PlaybackFrame[]; final: SiegeState }
      | Promise<{ frames: PlaybackFrame[]; final: SiegeState }>,
  ) => {
    if (resolvingRef.current) return;
    const version = ++resolutionVersion.current;
    resolvingRef.current = true;
    skipAfterResolution.current = false;
    setPlaying(true);
    setResolving(true);
    const run = async () => {
      try {
        // Give React and the browser a painted frame before computing the opponent's turn.
        await new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        );
        if (version !== resolutionVersion.current) return;
        const result = await resolve();
        if (version !== resolutionVersion.current) return;
        resolvingRef.current = false;
        playResolution(result);
        if (skipAfterResolution.current) finishPlayback();
      } catch (error) {
        if (version === resolutionVersion.current) setPlaying(false);
        throw error;
      } finally {
        if (version === resolutionVersion.current) {
          resolvingRef.current = false;
          resolutionRun.current = null;
          setResolving(false);
        }
      }
    };
    resolutionRun.current = run();
    return resolutionRun.current;
  };
  const playResolution = (resolution: { frames: PlaybackFrame[]; final: SiegeState }) => {
    pending.current = resolution.final;
    pendingReport.current = reportObservations(state, resolution.final);
    setPlaying(true);
    setMode(null);
    setTarget(null);
    setTargetAction(null);
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
  useEffect(() => {
    if (needsAttacker && !playing) void startResolution(() => resolveAttackerPhaseAsync(state));
  }, [needsAttacker, playing]);
  const select = (id: string) => {
    setSelected(id);
    setFocusPlace(null);
    explainAction(null);
    setTarget(null);
    setTargetAction(null);
    setMode(null);
    setExtraKind(null);
    setAssault(false);
    setTab('commands');
    setFeedback({});
  };
  const chooseNext = (nextState = state) => {
    if (deploy || playing || opening || banner || reportVisible || howTo || ended) return;
    const next = nextActor(nextState, selected, playerSide);
    if (next) {
      select(next.id);
      map.current?.reveal('level' in next ? next : { ...next, level: 'ground' });
    }
  };
  const openTarget = (id: string, action?: SiegeAction) => {
    if (deploy || playing || banner || reportVisible || howTo) return;
    const candidate = action ?? legalTargets.find((t) => t.id === id)?.action;
    setTargetAction(candidate && candidate.type !== 'attack' ? candidate : null);
    setTarget(candidate?.type === 'attack' || !candidate ? id : null);
    setExtraKind(null);
    setTab('commands');
    setMode('attack');
  };
  const cell = (to: SiegePosition) => {
    if (deploy && !selected) {
      const at = state.units.find(
        (u) => u.side === playerSide && u.level === to.level && sameCell(u, to),
      );
      if (at) select(at.id);
      return;
    }
    if (!selected || playing || opening || banner || reportVisible || howTo) return;
    if (deploy) {
      if (
        !(playerSide === 'shu' ? DEPLOY_SHU : DEPLOY_WEI).some(
          (c) => sameCell(c, to) && to.level === c.level,
        )
      ) {
        setFeedback({ key: 'deploymentOnly' });
        return;
      }
      setGame((g) => ({ ...g, state: deployUnit(g.state, selected, to, playerSide) }));
      return;
    }
    if (unit ? unit.side !== playerSide : playerSide !== 'shu') return;
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
      if (kind === 'climb' && guide) {
        explainAction(entry.reason, kind);
        if ('base' in guide) {
          const base = { ...guide.base, level: 'ground' as const };
          setFocusPlace(base);
          map.current?.focus(base);
        }
        return;
      }
      setFeedback({ reason: entry.reason });
      return;
    }
    if (
      kind === 'suppress' ||
      kind === 'coverEngine' ||
      kind === 'pileEarth' ||
      kind === 'fireArrows' ||
      kind === 'dropMillstone' ||
      kind === 'dropBoulders'
    ) {
      setExtraKind(kind);
      setMode(null);
      setTarget(null);
      setTargetAction(null);
      return;
    }
    setExtraKind(null);
    if (kind === 'standby') {
      const next = standBy(state, selected, playerSide);
      setGame((g) => ({ ...g, state: next }));
      setMode(null);
      setTarget(null);
      setTargetAction(null);
      if (next !== state) chooseNext(next);
      return;
    }
    if (kind === 'climb' && entry?.action?.type === 'climb') {
      if (guide?.kind === 'ready' && guide.breach) {
        act({ type: 'climb', unitId: selected });
        return;
      }
      setMode('climb');
      setTarget(null);
      setTargetAction(null);
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
    if (kind === 'ram' && entry?.action && 'gateId' in entry.action) {
      openTarget(entry.action.gateId, entry.action);
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
        if (playing || deploy || ended || showOrders) return;
        event.preventDefault();
        chooseNext();
        return;
      }
      if (playing || deploy || ended) return;
      if (event.key.toLowerCase() === 'q') {
        event.preventDefault();
        setGame((g) => ({ ...g, state: standByAll(g.state, playerSide) }));
        setMode(null);
        setTarget(null);
        setTargetAction(null);
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
    if (!import.meta.env.DEV) return;
    const hook: SiegeDev = {
      renderCounts: siegeRenderCounts,
      snapshot: () => structuredClone(game),
      playScript: async (strategy, days = T.days) => {
        if (game.phase !== 'battle' || playing)
          throw new Error('Start battle and finish playback first.');
        const { playScriptDays } = await import('./devPlaythrough');
        const next = playScriptDays(state, strategy, days, playerSide);
        setGame((g) => ({
          ...g,
          state: next,
          presentation: {
            ...presentationFor(g),
            ...(playerSide === 'wei' ? { attackerTurnDay: next.day } : {}),
          },
        }));
        setMode(null);
        setTarget(null);
        setTargetAction(null);
        setCards([]);
        setSummary(false);
        return next.outcome;
      },
    };
    window.__siegeDev = hook;
    return () => {
      if (window.__siegeDev === hook) delete window.__siegeDev;
    };
  }, [game, playing]);
  const orderAction = (kind: 'rally' | 'rotate' | 'supervise', target: string): SiegeAction =>
    playerSide === 'shu'
      ? { type: 'order', side: playerSide, kind, target }
      : { type: 'order', side: playerSide, kind: 'rally', target };
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
      ? renderActionReason(
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
  const notice = (
    <>
      {activeCard?.type === 'counter' &&
        counterCard &&
        activeCard.id === `counter-${counterCard.kind}` &&
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
            {counterCard.art && (
              <img
                className="siege-event-art"
                src={storyArt(counterCard.art)}
                alt=""
                data-testid="night-event-art"
              />
            )}
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
      {hint && (
        <SiegeHint
          kind={hint}
          playerSide={playerSide}
          locale={locale}
          dismiss={dismissHint}
          place={placeName(actor, locale)}
        />
      )}
    </>
  );
  return (
    <main
      className="siege-app"
      style={paperStyle}
      data-phase={ended ? 'ending' : game.phase}
      data-walk-step={walkStep}
      data-player-side={playerSide}
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
          <Button onClick={() => load()}>{text('load')}</Button>
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
                data-actions-done={actCount === 0}
                className={[
                  actCount === 0 ? 'siege-day-ready' : '',
                  pulse(
                    walkStep === (playerSide === 'wei' ? 5 : 7) ||
                      (walkStep === 3 && walkthroughNeedsEndDay(walkthrough, state, playerSide)),
                  ),
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {text('endDay')}
              </Button>
            ))}
        </nav>
      </header>
      {(feedback.key || feedback.reason || (!opening && !ended)) && (
        <div className="siege-status" role="status">
          {!deploy && !opening && !ended && !playing && (
            <>
              <Button
                size="sm"
                data-testid="next-actor"
                disabled={!queue.length || Boolean(banner) || reportVisible || howTo || showOrders}
                onClick={() => chooseNext()}
              >
                {text('nextActor', { n: actCount })}
              </Button>
              {actCount === 0 && (
                <span data-testid="army-done">
                  {text('armyDone')}
                  {moveCount > 0 ? ` · ${text('armyCanMove', { n: moveCount })}` : ''}
                </span>
              )}
            </>
          )}
          {resolving ? (
            <strong data-testid="siege-resolving">
              {text(playerSide === 'shu' ? 'resolving' : 'resolvingWei')}
            </strong>
          ) : playing ? (
            <>
              <strong>{text(playerSide === 'wei' ? 'playbackWei' : 'playback')}</strong>
              <Button size="sm" data-testid="replay-skip" onClick={finishPlayback}>
                {text('skip')}
              </Button>
            </>
          ) : feedback.key ? (
            text(feedback.key)
          ) : feedback.reason ? (
            rejectionText(locale, feedback.reason)
          ) : deploy ? (
            text(playerSide === 'wei' ? 'deployWeiHelp' : 'deployHelp')
          ) : mode === 'attack' ? (
            text('chooseTarget')
          ) : mode === 'fillTrench' ? (
            text('chooseTrench')
          ) : actCount === 0 ? null : (
            text('keys')
          )}
        </div>
      )}
      {opening ? (
        <SiegeOpening
          step={presentation.openingStep}
          playerSide={playerSide}
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
              clickMode={
                mode === 'attack' || mode === 'move' || mode === 'fillTrench' ? mode : null
              }
              clickBlocked={
                playing || opening || Boolean(banner) || reportVisible || howTo || ended
              }
              onSwap={(id) => selected && act({ type: 'swap', unitId: selected, withUnitId: id })}
              onTarget={openTarget}
              onTargetAction={(t) => openTarget(t.id, t.action)}
              actorTargets={
                !deploy && !playing && !banner && !reportVisible && !howTo && !ended
                  ? legalTargets
                  : []
              }
              deploy={deploy}
              playerSide={playerSide}
              reachable={!deploy ? rangedReachable : []}
              targets={mode === 'attack' ? targets : []}
              tutorialCells={[
                ...(focusPlace ? [focusPlace] : []),
                ...(walkStep ? walkthroughTargets(walkthrough, state, playerSide) : []),
                ...(guideBase ? [guideBase] : []),
              ].filter(
                (c, i, cells) =>
                  cells.findIndex((other) => sameCell(c, other) && c.level === other.level) === i,
              )}
              climbBase={guideBase ? { base: guideBase, label: guideLabel } : undefined}
              notice={activeCard ? notice : null}
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
              onSelect={select}
              onCell={cell}
              onMove={(to) => {
                if (!selected) return;
                act(
                  unit
                    ? { type: 'move', unitId: selected, ...to }
                    : { type: 'moveEngine', engineId: selected, x: to.x, y: to.y },
                );
              }}
              onZoom={setZoom}
            />
            <aside className="siege-sidebar" aria-label={text('commands')}>
              {walkStep && walkthrough && (
                <SiegeWalkthroughBox
                  progress={walkthrough}
                  playerSide={playerSide}
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
              <div className="siege-sidebar-content" data-testid="sidebar-content" data-tab={tab}>
                <div className="siege-walk-tabs">
                  <Tabs
                    value={tab}
                    onChange={setTab}
                    label={text('battle')}
                    tabs={(['commands', 'defence', 'workshop', 'log'] as Tab[]).map((value) => ({
                      value,
                      label: text(
                        value === 'workshop' && playerSide === 'wei' ? 'defenseStores' : value,
                      ),
                    }))}
                  />
                  {!deploy && playerSide === 'shu' && (
                    <Button
                      size="sm"
                      variant="danger"
                      data-testid="withdraw"
                      onClick={() => act({ type: 'withdraw' })}
                      disabled={playing}
                    >
                      {text('withdraw')}
                    </Button>
                  )}
                </div>
                {tab === 'commands' && (
                  <>
                    {actor ? (
                      <Panel title={name(actor.id)} data-testid="selected-actor">
                        {unit && (
                          <div className="siege-unit-card">
                            {portrait(unit.officer.id) ? (
                              <img src={portrait(unit.officer.id)} alt="" />
                            ) : (
                              <img
                                className="siege-idle-portrait"
                                data-testid="idle-portrait"
                                src={unitVisual({ ...state, footholds: {} }, unit).pose.href}
                                alt=""
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
                                  place: placeName(unit, locale),
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
                              footholdBefore={
                                state.footholds[
                                  cellKey(
                                    state.units.find((u) => u.id === target) ?? { x: 0, y: 0 },
                                  )
                                ] ?? 0
                              }
                              forecast={forecast}
                              assaultForecast={assaultForecast}
                              checked={assault}
                              toggle={setAssault}
                              locale={locale}
                              target={name(target!)}
                              reason={forecastReason}
                              confirm={executeAttack}
                              disabled={playing || deploy}
                              cancel={() => {
                                setTarget(null);
                                setMode(null);
                                setAssault(false);
                              }}
                            />
                          </div>
                        )}
                        {targetAction && actionPreview?.ok && (
                          <ActionForecast
                            before={state}
                            after={actionPreview.state}
                            action={targetAction}
                            locale={locale}
                            confirm={() => act(targetAction)}
                            cancel={() => {
                              setTargetAction(null);
                              setMode(null);
                            }}
                          />
                        )}
                        {!deploy && climbForecast && assaultClimb && (
                          <div
                            onMouseEnter={() => setForecastHovered(true)}
                            onMouseLeave={() => setForecastHovered(false)}
                          >
                            <ClimbForecast
                              footholdBefore={state.footholds[cellKey(climbForecast.top)] ?? 0}
                              normal={climbForecast}
                              assault={assaultClimb}
                              locale={locale}
                              checked={assault}
                              toggle={setAssault}
                              disabled={playing}
                              reason={renderActionReason({
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
                            {extraActionTargets(state, selected, extraKind, playerSide)
                              .map((action, i) => ({
                                action,
                                i,
                                reason: renderActionReason(action),
                              }))
                              .sort((a, b) => Number(Boolean(a.reason)) - Number(Boolean(b.reason)))
                              .map(({ action, i, reason }) => {
                                const label =
                                  'targetId' in action
                                    ? name(action.targetId)
                                    : 'engineId' in action &&
                                        ['coverEngine', 'fireArrows', 'dropMillstone'].includes(
                                          action.type,
                                        )
                                      ? name(action.engineId)
                                      : 'x' in action
                                        ? placeName(action, locale)
                                        : '';
                                return (
                                  <div key={i}>
                                    <Button
                                      size="sm"
                                      data-testid={`target-${extraKind}-${'targetId' in action ? action.targetId : 'engineId' in action && ['coverEngine', 'fireArrows', 'dropMillstone'].includes(action.type) ? action.engineId : i}`}
                                      aria-disabled={playing || Boolean(reason)}
                                      onFocus={() => explainAction(reason)}
                                      onMouseEnter={() => explainAction(reason)}
                                      aria-describedby="siege-action-reason"
                                      title={reason ? rejectionText(locale, reason) : undefined}
                                      onClick={() => {
                                        explainAction(reason);
                                        if (!reason && !playing) {
                                          act(action);
                                          setExtraKind(null);
                                        }
                                      }}
                                    >
                                      {label}
                                    </Button>
                                  </div>
                                );
                              })}
                            <p
                              id="siege-action-reason"
                              data-testid="action-reason"
                              className="siege-action-reason"
                              aria-live="polite"
                            >
                              {actionExplanation
                                ? rejectionText(locale, actionExplanation)
                                : text('actionReady')}
                            </p>
                            <Button size="sm" onClick={() => setExtraKind(null)}>
                              {text('cancel')}
                            </Button>
                          </section>
                        )}
                        {!deploy && !forecast && !targetAction && !climbForecast && !extraKind && (
                          <>
                            <p className="siege-action-context" data-testid="action-context">
                              {actionContext(state, actor.id, locale)}
                              {playerSide === 'wei' &&
                                unit &&
                                preparationRows(state)
                                  .filter((row) => row.cell === cellKey(unit))
                                  .map((row) => (
                                    <small className="siege-actor-preparation" key={row.kind}>
                                      {text(row.kind)} · {text(row.status)}
                                    </small>
                                  ))}
                            </p>
                            <div className="siege-actions" data-testid="action-panel">
                              {commands.map((c, slot) => (
                                <div key={c.kind} data-command-slot={slot}>
                                  <Button
                                    size="sm"
                                    data-unavailable={Boolean(c.reason)}
                                    data-testid={`command-${c.kind}`}
                                    className={pulse(
                                      playerSide === 'wei'
                                        ? (walkStep === 2 && c.kind === 'hoistMillstone') ||
                                            (walkStep === 4 && c.kind === 'lightBrazier') ||
                                            (walkStep === 6 && c.kind === 'fireArrows')
                                        : (walkStep === 2 && c.kind === 'raiseLadder') ||
                                            (walkStep === 4 &&
                                              (c.kind === 'climb' || c.kind === 'attack')) ||
                                            (walkStep === 6 && c.kind === 'suppress') ||
                                            (walkStep === 9 && c.kind === 'coverEngine'),
                                    )}
                                    aria-disabled={Boolean(c.reason) || playing}
                                    onFocus={() => explainAction(c.reason, c.kind)}
                                    onMouseEnter={() => explainAction(c.reason, c.kind)}
                                    aria-describedby="siege-action-reason"
                                    title={
                                      c.reason ? commandExplanation(c.reason, c.kind) : undefined
                                    }
                                    onClick={() => {
                                      explainAction(c.reason, c.kind);
                                      if (!playing && (!c.reason || c.kind === 'climb'))
                                        command(c.kind);
                                    }}
                                    aria-pressed={mode === c.kind}
                                  >
                                    <SiegeIcon name={c.kind} />
                                    {text(c.kind)}
                                  </Button>
                                </div>
                              ))}
                            </div>
                            <p
                              id="siege-action-reason"
                              className="siege-action-reason"
                              data-testid="action-reason"
                              aria-live="polite"
                            >
                              {actionExplanation
                                ? commandExplanation(actionExplanation, explanationKind)
                                : text('actionReady')}
                            </p>
                          </>
                        )}
                        {!deploy && !forecast && !climbForecast && !extraKind && (
                          <>
                            {(!unit || unit.side === playerSide) && (
                              <details
                                open={showOrders}
                                onToggle={(event) => setShowOrders(event.currentTarget.open)}
                              >
                                <summary>{text('order')}</summary>
                                <p>{text('nightUnknown')}</p>
                                {playerSide === 'shu' && (
                                  <Button
                                    data-testid="order-nightAssault"
                                    disabled={
                                      playing ||
                                      Boolean(
                                        renderActionReason({
                                          type: 'order',
                                          side: playerSide,
                                          kind: 'nightAssault',
                                        }),
                                      )
                                    }
                                    onClick={() =>
                                      act({ type: 'order', side: playerSide, kind: 'nightAssault' })
                                    }
                                  >
                                    <SiegeIcon name="nightAssault" />
                                    {text('nightAssault')}
                                  </Button>
                                )}
                                {playerSide === 'wei' && (
                                  <WeiOrders
                                    state={state}
                                    locale={locale}
                                    playing={playing}
                                    act={act}
                                  />
                                )}
                                {(playerSide === 'shu'
                                  ? (['rally', 'supervise', 'rotate'] as const)
                                  : ([] as const)
                                ).map((kind) => (
                                  <label className="siege-order" key={kind}>
                                    <SiegeIcon name={kind} large />
                                    {text(kind)}
                                    <Select
                                      aria-label={text(kind)}
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value) act(orderAction(kind, e.target.value));
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
                                            .filter((u) => u.side === playerSide && u.troops > 0)
                                            .map((u) => ({ id: u.id, label: name(u.id) }))
                                      ).map((option) => {
                                        const reason = renderActionReason(
                                          orderAction(kind, option.id),
                                        );
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
                            {playerSide === 'shu' && (
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
                            )}
                          </>
                        )}
                      </Panel>
                    ) : (
                      <p>{text('select')}</p>
                    )}
                    <details className="siege-roster-picker" data-testid="unit-list">
                      <summary>{text('rosterTitle')}</summary>
                      <strong>{text('unitGroup')}</strong>
                      <div className="siege-roster">
                        {state.units
                          .filter((u) => u.side === playerSide && u.troops > 0)
                          .map((u) => (
                            <Button
                              size="sm"
                              key={u.id}
                              data-testid={`select-${u.id}`}
                              className={pulse(
                                (playerSide === 'wei' &&
                                  ((walkStep === 1 && u.officer.id === 'haozhao') ||
                                    (walkStep === 3 && u.troopType === 'archer'))) ||
                                  (playerSide === 'shu' &&
                                    walkStep === 3 &&
                                    u.troopType === 'infantry') ||
                                  (playerSide === 'shu' &&
                                    walkStep === 5 &&
                                    u.troopType === 'archer'),
                              )}
                              aria-pressed={selected === u.id}
                              onClick={() => select(u.id)}
                            >
                              {name(u.id)}
                              {u.acted ? ' ✓' : ''}
                            </Button>
                          ))}
                      </div>
                      {playerSide === 'shu' && (
                        <>
                          <strong>{text('engineGroup')}</strong>
                          <div className="siege-roster">
                            {state.engines.map((e) => (
                              <Button
                                size="sm"
                                key={e.id}
                                data-testid={`select-${e.id}`}
                                className={pulse(
                                  walkStep === 1 && e.kind === 'ladder' && usableEngine(e),
                                )}
                                aria-pressed={selected === e.id}
                                onClick={() => select(e.id)}
                              >
                                {name(e.id)} · {placeName(e.raisedAt ?? e, locale)}
                              </Button>
                            ))}
                          </div>
                        </>
                      )}
                    </details>
                  </>
                )}
                {tab === 'defence' && (
                  <Defence state={state} locale={locale} focus={(p) => map.current?.focus(p)} />
                )}
                {tab === 'workshop' && playerSide === 'wei' && (
                  <Defence
                    state={state}
                    locale={locale}
                    playerSide={playerSide}
                    focus={(p) => map.current?.focus(p)}
                    stores
                  />
                )}
                {tab === 'workshop' && playerSide === 'shu' && (
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
                          const reason = renderActionReason(action);
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
                          const reason = renderActionReason(action);
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
              </div>
            </aside>
          </div>
        </>
      )}
      {howTo && (
        <SiegeHowToPlay
          locale={locale}
          playerSide={playerSide}
          close={() => setHowTo(false)}
          replay={() => {
            setGame((g) => ({
              ...g,
              presentation: { ...presentationFor(g), walkthrough: startWalkthrough(g.state) },
            }));
            setCards([]);
            setHowTo(false);
            setTab('commands');
          }}
        />
      )}
      {reportVisible && (
        <SiegeMorningReport
          items={reportItems}
          locale={locale}
          close={closeReport}
          focus={(p) => {
            setFocusPlace(p);
            map.current?.focus(p);
          }}
        />
      )}
      {banner && (
        <SiegeActBanner
          playerSide={playerSide}
          act={state.act}
          locale={locale}
          close={dismissBanner}
        />
      )}
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
    openGate: 'openGate',
    gateOpened: 'openGate',
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
  playerSide = 'shu',
  stores = false,
  state,
  locale,
  focus,
}: {
  state: SiegeState;
  locale: SiegeLocale;
  focus: (p: SiegePosition) => void;
  playerSide?: SiegeSide;
  stores?: boolean;
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
  for (const row of preparationRows(state))
    if (!runs.some((run) => run.some((c) => cellKey(c) === row.cell))) runs.push([row.place]);
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
  runs.sort(
    (a, b) =>
      Number(b[0]!.y === GATES.south.cells[0]!.y) - Number(a[0]!.y === GATES.south.cells[0]!.y),
  );
  const gateRow = (id: GateId) => (
    <div className="siege-gate" key={id}>
      <Button size="sm" onClick={() => focus({ ...GATES[id].cells[0]!, level: 'wall' })}>
        {placeName(GATES[id].cells[0], locale)}
      </Button>
      <progress aria-label={t(id)} max={state.gates[id].max} value={state.gates[id].durability} />
      <span>
        {state.gates[id].durability}/{state.gates[id].max}
      </span>
    </div>
  );
  return (
    <div data-player-side={playerSide} data-testid={stores ? 'wei-defense-tab' : 'defense-panel'}>
      <Panel title={t(stores ? 'defenseStores' : 'defence')}>
        {stores && (
          <p data-testid="tonight-order">
            {t('orderTonight')} · {tonightOrder(state, locale)}
          </p>
        )}
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
          // An undefended, unprepared and unthreatened run has nothing to report.
          const quiet =
            !defenders &&
            !attackers &&
            run.every((c) => {
              const key = cellKey(c);
              const p = state.preparations;
              return (
                !p.braziers[key] && !p.millstones[key] && !p.boulders[key] && !state.footholds[key]
              );
            });
          if (quiet) return null;
          const place = placeName(run[0], locale);
          return (
            <button
              type="button"
              className="siege-defense-run"
              data-testid={`defense-run-${cellKey(run[0]!)}`}
              key={cellKey(run[0]!)}
              onClick={() => focus(run[Math.floor(run.length / 2)]!)}
            >
              <strong>{t('run', { place, n: defenders })}</strong>
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
              {!stores && (
                <div className="siege-prep-icons">
                  {run.flatMap((c) => {
                    const key = cellKey(c);
                    const p = state.preparations;
                    return (
                      [
                        ['brazier', p.braziers[key]?.litDay],
                        [
                          'millstone',
                          p.millstones[key]?.hoisted ? p.millstones[key]?.day : undefined,
                        ],
                        ['boulders', p.boulders[key]?.day],
                      ] as const
                    )
                      .filter(([, day]) => day !== undefined)
                      .map(([icon, day]) => (
                        <span
                          key={`${key}-${icon}`}
                          data-cell={key}
                          title={`${place} · ${t(icon)} · ${t(day! < state.day ? 'preparationReady' : 'preparationTomorrow')}`}
                        >
                          <SiegeIcon name={icon} />
                          <small>
                            {t(day! < state.day ? 'preparationReady' : 'preparationTomorrow')}
                          </small>
                        </span>
                      ));
                  })}
                </div>
              )}
              {stores &&
                preparationRows(state)
                  .filter((row) => run.some((c) => cellKey(c) === row.cell))
                  .map((row) => (
                    <span
                      className="siege-preparation-row"
                      key={`${row.kind}-${row.cell}`}
                      data-testid="preparation-row"
                      data-cell={row.cell}
                    >
                      <SiegeIcon name={row.kind} />
                      {t(row.kind)} · {t(row.status)}
                    </span>
                  ))}
              {stores &&
                !preparationRows(state).some((row) => run.some((c) => cellKey(c) === row.cell)) && (
                  <small>{t('noPreparations')}</small>
                )}
              <div className="siege-foothold-cells">
                {run.map((c) => (
                  <span
                    key={cellKey(c)}
                    data-cell={cellKey(c)}
                    aria-label={t('footholdPips', {
                      place,
                      n: state.footholds[cellKey(c)] ?? 0,
                      max: T.footholdComplete,
                    })}
                    title={t('footholdPips', {
                      place,
                      n: state.footholds[cellKey(c)] ?? 0,
                      max: T.footholdComplete,
                    })}
                  >
                    {Array.from({ length: T.footholdComplete }, (_, i) => (
                      <i
                        key={i}
                        className={i < (state.footholds[cellKey(c)] ?? 0) ? 'filled' : ''}
                      />
                    ))}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
        <h4>
          <SiegeIcon name="gates" />
          {t('gates')}
        </h4>
        {gateRow('south')}
        <details data-testid="other-gates">
          <summary>
            {t('otherGates')} ·{' '}
            {(['north', 'west', 'east'] as const)
              .map((id) => `${t(id)} ${state.gates[id].durability}/${state.gates[id].max}`)
              .join(' · ')}
          </summary>
          {(['north', 'west', 'east'] as const).map(gateRow)}
        </details>
        <details open={stores || undefined}>
          <summary>{t('innerWall')}</summary>
          {INNER_WALL_SEGMENTS.map((segment) => (
            <Button
              size="sm"
              key={segment.index}
              onClick={() => focus({ ...segment.cells[0]!, level: 'ground' })}
            >
              {placeName(segment.cells[0], locale)} ·{' '}
              {t('progress', { n: state.innerWall[segment.index] ?? 0, max: segment.buildPoints })}
            </Button>
          ))}
        </details>
        <details>
          <summary>
            {t('raised')} · {t('filled')}
          </summary>
          {state.engines
            .filter((e) => e.raisedAt && usableEngine(e))
            .map((e) => (
              <Button size="sm" key={e.id} onClick={() => focus({ ...e.raisedAt!, level: 'wall' })}>
                {placeName(e.raisedAt, locale)}
              </Button>
            ))}
          {SOUTH_TRENCH.filter((c) => isWallFoot(state, c.x, c.y)).map((c) => (
            <Button size="sm" key={cellKey(c)} onClick={() => focus({ ...c, level: 'ground' })}>
              {placeName(c, locale)}
            </Button>
          ))}
        </details>
      </Panel>
    </div>
  );
}
export { hasSiegeSave };

function WeiOrders({
  state,
  locale,
  playing,
  act,
}: {
  state: SiegeState;
  locale: SiegeLocale;
  playing: boolean;
  act: (action: SiegeAction) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  return (
    <section data-testid="wei-orders">
      {(['rally', 'holdFast', 'nightRepair', 'torches', 'sortie'] as WeiOrderKind[]).map((kind) => {
        const targets = weiOrderTargets(state, kind, locale);
        return (
          <label key={kind} className="siege-order">
            {siegeText(locale, weiOrderLabel(kind))}
            {kind === 'torches' ? (
              <Button
                size="sm"
                data-testid="order-torches"
                aria-disabled={playing || Boolean(targets[0]?.reason)}
                title={targets[0]?.reason ? rejectionText(locale, targets[0].reason) : undefined}
                onFocus={() => setReason(targets[0]?.reason ?? null)}
                onClick={() => {
                  setReason(targets[0]?.reason ?? null);
                  if (!playing && !targets[0]?.reason) act(targets[0]!.action);
                }}
              >
                {siegeText(locale, 'torches')}
              </Button>
            ) : (
              <Select
                data-testid={`order-${kind}`}
                aria-label={siegeText(locale, weiOrderLabel(kind))}
                value=""
                disabled={playing}
                onChange={(event) => {
                  const option = targets.find((t) => t.target === event.target.value);
                  if (option) {
                    setReason(option.reason);
                    if (!option.reason) act(option.action);
                  }
                }}
              >
                <option value="">{siegeText(locale, 'select')}</option>
                {targets.map((option) => (
                  <option
                    key={option.target}
                    value={option.target}
                    disabled={Boolean(option.reason)}
                  >
                    {option.label}
                    {option.reason ? ` · ${rejectionText(locale, option.reason)}` : ''}
                  </option>
                ))}
              </Select>
            )}
          </label>
        );
      })}
      {reason && <p role="status">{rejectionText(locale, reason)}</p>}
    </section>
  );
}
