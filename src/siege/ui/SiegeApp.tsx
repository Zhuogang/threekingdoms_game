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
  usableEngine,
  wallRun,
  type SiegeAttackForecast,
  type SiegeEngagement,
} from '../rules/combat';
import { ENGINE_RULES } from '../rules/day';
import { applySiegeAction } from '../rules/actions';
import { isWallFoot } from '../rules/map';
import { engineReachable, reachableCells } from '../rules/movement';
import { createSiegeState } from '../rules/state';
import type { EngineKind, GateId, SiegeAction, SiegePosition, SiegeState } from '../rules/types';
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
  type CommandKind,
} from './commands';
import { resolveSiegeDay } from './playback';
import { OPENING, encounteredHints, engineKey } from './story';
import { SiegeActBanner, SiegeEnding, SiegeHint, SiegeOpening, paperStyle } from './SiegeStory';
import { SiegeIcon } from './storyAssets';
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
  return {
    state: createSiegeState(seed),
    phase: 'opening',
    facings: {},
    presentation: {
      openingStep: 0,
      bannersSeen: [],
      dismissedHints: [],
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
  const presentation = presentationFor(game);
  const opening = game.phase === 'opening';
  const [hint, setHint] = useState<HintKind | null>(null);
  const [summary, setSummary] = useState(false);
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
  const [activity, setActivity] = useState<{ id: string; type: string } | null>(null);
  const [effectAction, setEffectAction] = useState<{
    from: SiegePosition;
    to: SiegePosition;
    type: string;
  } | null>(null);
  const pending = useRef<SiegeState | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const map = useRef<SiegeMapHandle>(null);
  const text = (key: SiegeTextKey, params: Record<string, string | number> = {}) =>
    siegeText(locale, key, params);
  const unit = state.units.find((u) => u.id === selected),
    engine = state.engines.find((e) => e.id === selected);
  const actor = unit ?? engine;
  const commands = useMemo(
    () => (selected ? siegeCommands(state, selected) : []),
    [state, selected],
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
            .filter((u) => u.side === 'wei' && predictSiegeAttack(state, selected, u.id)?.inRange)
            .map((u) => ({ x: u.x, y: u.y, level: u.level })),
    [state, selected],
  );
  const forecast = selected && target ? predictSiegeAttack(state, selected, target) : null;
  const deploy = game.phase === 'deploy';
  const ended = Boolean(state.outcome) && !playing;
  const banner =
    !opening && !deploy && !ended && !playing && !presentation.bannersSeen.includes(state.act);
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
      setGame((g) => ({ ...g, state: next }));
      pending.current = null;
    }
    setPlaying(false);
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
      setActivity(null);
      setEffectAction(null);
      setGame(saved);
      setHint(null);
      setSummary(false);
      setSelected(saved.state.units.find((u) => u.side === 'shu' && activeUnit(u))?.id ?? null);
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
    const snapshot = { ...game, state: pending.current ?? state };
    if (pending.current) finishPlayback();
    try {
      saveSiege(snapshot);
      setFeedback({ key: 'saved' });
    } catch {
      setFeedback({ key: 'badSave' });
    }
  };
  const act = (action: SiegeAction) => {
    if (playing || opening || banner) return;
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
    if (playing || opening || banner || deploy || state.outcome) return;
    const resolution = resolveSiegeDay(state);
    pending.current = resolution.final;
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
      timer.current = setTimeout(advance, 260);
    };
    timer.current = setTimeout(advance, 180);
  };
  const select = (id: string) => {
    setSelected(id);
    setTarget(null);
    setMode(null);
    setTab('commands');
    setFeedback({});
  };
  const mapSelect = (id: string) => {
    if (playing || opening || banner) return;
    const clicked = state.units.find((u) => u.id === id);
    if (deploy && clicked?.side === 'shu' && selected && id !== selected) {
      setGame((g) => ({ ...g, state: deployUnit(g.state, selected, clicked) }));
      return;
    }
    if (!deploy && clicked?.side === 'wei' && actor && (!unit || unit.side === 'shu')) {
      setTarget(id);
      setTab('commands');
      setMode('attack');
      return;
    }
    select(id);
  };
  const cell = (to: SiegePosition) => {
    if (!selected || playing || opening || banner) return;
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
    if (!selected || playing || opening || banner || deploy) return;
    const entry = commands.find((c) => c.kind === kind);
    if (entry?.reason) {
      setFeedback({ reason: entry.reason });
      return;
    }
    if (kind === 'standby') {
      setGame((g) => ({ ...g, state: standBy(g.state, selected) }));
      setMode(null);
      setTarget(null);
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
      if (opening || banner) return;
      if (event.key === 'Escape') {
        finishPlayback();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        if (playing) return;
        const next = nextShuUnit(state, selected);
        if (next) {
          select(next.id);
          map.current?.focus(next);
        }
        return;
      }
      if (playing || deploy || ended) return;
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
    if (opening || deploy || ended || playing || banner || hint) return;
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
          : { type: 'attack', unitId: selected, targetId: target },
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
              : { type: 'attack', unitId: selected, targetId: target }
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
    <main className="siege-app" style={paperStyle} data-phase={ended ? 'ending' : game.phase}>
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
              <Button variant="primary" onClick={end} disabled={playing || banner}>
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
              <Button size="sm" onClick={finishPlayback}>
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
              facings={game.facings}
              activity={activity}
              effectAction={effectAction}
              xray={xray}
              showRange={showRange}
              onSelect={mapSelect}
              onCell={cell}
              onZoom={setZoom}
            />
            <aside className="siege-sidebar" aria-label={text('commands')}>
              <Tabs
                value={tab}
                onChange={setTab}
                label={text('battle')}
                tabs={(['commands', 'defence', 'workshop', 'log'] as Tab[]).map((value) => ({
                  value,
                  label: text(value),
                }))}
              />
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
                          aria-pressed={selected === u.id}
                          onClick={() => {
                            if (u.side === 'wei' && actor && (!unit || unit.side === 'shu')) {
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
                              {text('position', { x: unit.x, y: unit.y, level: text(unit.level) })}
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
                        <Forecast
                          forecast={forecast}
                          locale={locale}
                          target={name(target!)}
                          reason={forecastReason}
                          confirm={executeAttack}
                          disabled={playing || deploy}
                          cancel={() => setTarget(null)}
                        />
                      )}
                      {!deploy && (
                        <>
                          <div className="siege-actions">
                            {commands.map((c) => (
                              <div key={c.kind}>
                                <Button
                                  size="sm"
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
                          {(!unit || unit.side === 'shu') && (
                            <details
                              open={showOrders}
                              onToggle={(event) => setShowOrders(event.currentTarget.open)}
                            >
                              <summary>{text('order')}</summary>
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
                                    disabled={playing || Boolean(state.ordersUsed.shu[state.day])}
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
                    {text('engineCap', { n: state.engines.filter(usableEngine).length })}
                  </strong>
                  <p>{text('engineRule')}</p>
                  {state.workshops.map((w, i) => (
                    <section key={w.id} className="siege-workshop">
                      <h4>{text('workshopName', { n: i + 1 })}</h4>
                      <p data-testid={`queue-${w.id}`}>
                        {w.queue
                          ? `${text(engineKey(w.queue))} · ${text('daysLeft', { n: w.daysRemaining })}`
                          : text('empty')}
                      </p>
                      {KINDS.map((kind) => {
                        const action: SiegeAction = { type: 'queueEngine', workshopId: w.id, kind };
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
            </aside>
          </div>
        </>
      )}
      {banner && <SiegeActBanner act={state.act} locale={locale} close={dismissBanner} />}
      {hint && !opening && !deploy && !ended && !playing && !banner && (
        <SiegeHint kind={hint} locale={locale} dismiss={dismissHint} />
      )}
    </main>
  );
}
function logKey(code: string): SiegeTextKey {
  const known: Record<string, SiegeTextKey> = {
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
function Forecast({
  forecast,
  locale,
  target,
  reason,
  confirm,
  cancel,
  disabled,
}: {
  forecast: SiegeAttackForecast;
  locale: SiegeLocale;
  target: string;
  reason: string | null;
  confirm: () => void;
  cancel: () => void;
  disabled: boolean;
}) {
  const t = (k: SiegeTextKey, p: Record<string, string | number> = {}) => siegeText(locale, k, p);
  const modifiers = (engagement: SiegeEngagement) => (
    <div className="siege-modifiers">
      <span>{t('frontage', { n: engagement.frontage ?? t('unlimited') })}</span>
      {(Object.entries(engagement.modifiers) as Array<[keyof SiegeEngagement['modifiers'], number]>)
        .filter(([key, value]) => value !== 1 || key === 'parapet')
        .map(([key, value]) => (
          <span key={key}>{t(key === 'gate' ? 'gateModifier' : key, { n: value })}</span>
        ))}
    </div>
  );
  return (
    <section className="siege-forecast" data-testid="attack-forecast">
      <h4>
        {t('forecast')} · {target}
      </h4>
      <strong>
        {t('enemyLoss', { n: forecast.casualties })} ·{' '}
        {t('ownLoss', { n: forecast.counterattack.casualties })}
      </strong>
      {forecast.gateDamage !== undefined && <p>{t('gateDamage', { n: forecast.gateDamage })}</p>}
      <small>{t('strike')}</small>
      {modifiers(forecast)}
      <small>{t('counter')}</small>
      {modifiers(forecast.counterattack)}
      {!forecast.inRange && <p>{t('outOfRange')}</p>}
      {reason && <p>{rejectionText(locale, reason)}</p>}
      <Button size="sm" variant="primary" disabled={disabled || Boolean(reason)} onClick={confirm}>
        {t('confirm')}
      </Button>
      <Button size="sm" onClick={cancel}>
        {t('cancel')}
      </Button>
    </section>
  );
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
      {runs.map((run) => (
        <Button size="sm" key={cellKey(run[0]!)} onClick={() => focus(run[0]!)}>
          {t('run', { ...run[0]!, n: troops(run) })}
        </Button>
      ))}
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
  );
}
export { hasSiegeSave };
