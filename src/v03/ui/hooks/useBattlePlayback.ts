import { useEffect, useState } from 'react';
import {
  isBattleUnitRouted,
  isBattleUnitWavering,
  type V03BattleLogEntry,
  type V03TacticalBattleState,
} from '../../battle';
import type { BattleFloatVisual, BattleUnitVisual } from '../../rendering/presentation';

interface PlaybackFrame {
  positions: ReadonlyMap<string, { x: number; y: number }>;
  troops: ReadonlyMap<string, number>;
  floats: readonly BattleFloatVisual[];
}

export interface BattlePlaybackSummary {
  attacks: number;
  tactics: number;
  /** Player troops lost to combat during the replayed turn. */
  lost: number;
  /** Player formations that became wavering or routed. */
  wavering: string[];
  routed: string[];
}

export interface BattlePlaybackPlan {
  frames: PlaybackFrame[];
  summary: BattlePlaybackSummary;
}

/** Log entries appended between two snapshots of one battle; the log may have been trimmed. */
export function appendedBattleEntries(
  before: V03TacticalBattleState,
  after: V03TacticalBattleState,
): V03BattleLogEntry[] {
  for (let overlap = Math.min(before.log.length, after.log.length); overlap >= 0; overlap--)
    if (
      before.log
        .slice(before.log.length - overlap)
        .every((line, index) => line === after.log[index])
    )
      return (after.logEntries ?? []).filter((entry) => entry.index >= overlap);
  return [];
}

/**
 * Replays the rest of a battle day from the log (PF-UI-08): one frame per formation
 * activation, with its move and the casualties it caused or took. Pure; it never reads
 * rules, only what the engine already recorded.
 */
export function planBattlePlayback(
  before: V03TacticalBattleState,
  after: V03TacticalBattleState,
): BattlePlaybackPlan | null {
  const playerSide = after.playerSide;
  const sideOf = (id: unknown) => before.units.find((unit) => unit.id === id)?.side;
  const positions = new Map(
    before.units
      .filter((unit) => unit.troops > 0)
      .map((unit) => [unit.id, { x: unit.x, y: unit.y }]),
  );
  const troops = new Map(before.units.map((unit) => [unit.id, unit.troops]));
  const frames: PlaybackFrame[] = [
    { positions: new Map(positions), troops: new Map(troops), floats: [] },
  ];
  const summary: BattlePlaybackSummary = {
    attacks: 0,
    tactics: 0,
    lost: 0,
    wavering: [],
    routed: [],
  };
  let actor: unknown = null;
  let floats: BattleFloatVisual[] = [];
  let pending = false;
  const close = () => {
    if (!pending) return;
    frames.push({ positions: new Map(positions), troops: new Map(troops), floats });
    floats = [];
    pending = false;
  };
  for (const entry of appendedBattleEntries(before, after)) {
    // The next day's lines (recovery, rations) are not part of this turn.
    if (entry.code === 'log.day') break;
    const { params } = entry;
    if (entry.code === 'log.move') {
      if (actor !== params.unitId) close();
      actor = params.unitId;
      positions.set(String(params.unitId), { x: Number(params.x), y: Number(params.y) });
      pending = true;
    } else if (entry.code === 'log.attack' || entry.code === 'log.tactic') {
      // A counterattack belongs to the strike that provoked it.
      if (!params.counter && actor !== params.sourceId) close();
      if (!params.counter) actor = params.sourceId;
      const target = String(params.targetId);
      const casualties = Number(params.casualties) || 0;
      troops.set(target, Math.max(0, (troops.get(target) ?? 0) - casualties));
      if (troops.get(target) === 0) positions.delete(target);
      const position = positions.get(target) ?? before.units.find((unit) => unit.id === target);
      if (casualties > 0 && position)
        floats.push({
          key: `${entry.day}:${entry.index}`,
          position: { x: position.x, y: position.y },
          text: `−${casualties.toLocaleString()}`,
          tone: sideOf(target) === playerSide ? 'player' : 'enemy',
        });
      if (sideOf(params.sourceId) !== playerSide && !params.counter)
        entry.code === 'log.attack' ? summary.attacks++ : summary.tactics++;
      if (sideOf(target) === playerSide) summary.lost += casualties;
      pending = true;
    }
  }
  close();
  if (frames.length < 2) return null;
  for (const unit of after.units) {
    const prior = before.units.find((entry) => entry.id === unit.id);
    if (unit.side !== playerSide || unit.troops <= 0 || !prior) continue;
    if (isBattleUnitRouted(unit) && !isBattleUnitRouted(prior)) summary.routed.push(unit.id);
    else if (isBattleUnitWavering(unit) && !isBattleUnitWavering(prior))
      summary.wavering.push(unit.id);
  }
  return { frames, summary };
}

const FRAME_MS = 650;

/**
 * Plays back the enemy turn after the player ends a battle day: tokens glide, casualty
 * numbers float, then a summary stays until closed. Skip jumps to the end. With reduced
 * motion the summary appears at once.
 */
export function useBattlePlayback(
  battleId: string | undefined,
  battle: V03TacticalBattleState | null,
  visuals: readonly BattleUnitVisual[],
) {
  const [seen, setSeen] = useState<{
    id: string;
    state: V03TacticalBattleState;
    visuals: readonly BattleUnitVisual[];
  } | null>(null);
  const [plan, setPlan] = useState<
    (BattlePlaybackPlan & { visuals: readonly BattleUnitVisual[] }) | null
  >(null);
  const [frame, setFrame] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  // Derived during render, so the finished board never flashes before the replay starts.
  if (battleId && battle && (seen?.id !== battleId || seen.state !== battle)) {
    setSeen({ id: battleId, state: battle, visuals });
    const next =
      seen?.id === battleId && battle.day > seen.state.day && !battle.outcome
        ? planBattlePlayback(seen.state, battle)
        : null;
    if (next) {
      const reduced =
        typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      setPlan({ ...next, visuals: seen!.visuals });
      setFrame(reduced ? next.frames.length : 0);
      setSummaryOpen(reduced);
    }
  }
  // Each frame shows for FRAME_MS; past the last frame the real board returns.
  useEffect(() => {
    if (!plan || frame >= plan.frames.length) return;
    const timer = setTimeout(() => {
      setFrame(frame + 1);
      if (frame + 1 >= plan.frames.length) setSummaryOpen(true);
    }, FRAME_MS);
    return () => clearTimeout(timer);
  }, [plan, frame]);
  const playing = Boolean(plan && frame < plan.frames.length);
  const current = playing ? plan!.frames[frame]! : null;
  const playbackVisuals = current
    ? // Formations destroyed later in the turn stay visible until their final step.
      [
        ...plan!.visuals,
        ...visuals.filter((unit) => !plan!.visuals.some((old) => old.id === unit.id)),
      ]
        .filter((unit) => (current.troops.get(unit.id) ?? 0) > 0 && current.positions.has(unit.id))
        .map((unit) => ({
          ...unit,
          position: current.positions.get(unit.id)!,
          strength: current.troops.get(unit.id),
          selected: false,
          acted: false,
        }))
    : null;
  return {
    playing,
    visuals: playbackVisuals ?? visuals,
    floats: current?.floats ?? [],
    summary: summaryOpen && plan ? plan.summary : null,
    skip: () => {
      if (!plan) return;
      setFrame(plan.frames.length);
      setSummaryOpen(true);
    },
    dismiss: () => setSummaryOpen(false),
  };
}
