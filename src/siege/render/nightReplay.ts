import { GATES, cellKey, layoutSymbol } from '../content/chencang';
import { isMapCell } from '../rules/map';
import type { Cell, SiegeEngine, SiegeLogEntry, SiegeState } from '../rules/types';
import { parseCell } from './v02Art';

/** v0.1 replay's 260ms step, halved. No rule state is retained by the renderer. */
export const REPLAY_STEP_MS = 130;
export interface NightPresentation {
  kind: 'settle' | 'advance' | 'torches' | 'sortie' | 'burning' | 'repair';
  duration: number;
  event?: SiegeLogEntry;
  previousEngine?: SiegeEngine;
  party?: {
    from: Cell;
    to: Cell;
    pose: string;
    flip?: boolean;
    kindle?: boolean;
    returning?: boolean;
  };
}
export interface NightFrame {
  state: SiegeState;
  night: NightPresentation;
}

/** Follow the gate road first, then the shortest dry spur to the logged target.
 * Weighted search also handles engines beside the road without crossing the moat. */
export function sortieRoute(target: Cell): Cell[] {
  const start = GATES.south.approaches[0]!;
  const costs = new Map([[cellKey(start), 0]]),
    previous = new Map<string, Cell>();
  const open = [start];
  while (open.length) {
    open.sort((a, b) => costs.get(cellKey(a))! - costs.get(cellKey(b))! || a.y - b.y || a.x - b.x);
    const cell = open.shift()!;
    if (cell.x === target.x && cell.y === target.y) {
      const path = [cell];
      while (previous.has(cellKey(path[0]!))) path.unshift(previous.get(cellKey(path[0]!))!);
      return path;
    }
    for (const next of [
      { x: cell.x, y: cell.y + 1 },
      { x: cell.x + 1, y: cell.y },
      { x: cell.x - 1, y: cell.y },
      { x: cell.x, y: cell.y - 1 },
    ]) {
      const symbol = layoutSymbol(next.x, next.y);
      if (
        !isMapCell(next.x, next.y) ||
        next.y < start.y ||
        !['.', '+', '=', 'X'].includes(symbol ?? '')
      )
        continue;
      const key = cellKey(next),
        cost = costs.get(cellKey(cell))! + (symbol === '+' || symbol === '=' ? 1 : 4);
      if (cost >= (costs.get(key) ?? Infinity)) continue;
      costs.set(key, cost);
      previous.set(key, cell);
      open.push(next);
    }
  }
  return [start, target];
}

/** Consume only the entries appended by endDay. Snapshots are disposable
 * pictures of resolved facts, never an alternate night resolver. */
export function nightReplay(before: SiegeState, final: SiegeState): NightFrame[] {
  const events = final.log.slice(before.log.length);
  const picture = structuredClone(before);
  const frames: NightFrame[] = [];
  const push = (night: NightPresentation) =>
    frames.push({ state: structuredClone(picture), night });
  push({ kind: 'settle', duration: REPLAY_STEP_MS });
  for (const event of events) {
    const p = event.params;
    if (event.code === 'nightAssaultAdvanced') {
      const engine = picture.engines.find((e) => e.id === p.engineId);
      if (!engine) continue;
      const previousEngine = structuredClone(engine);
      Object.assign(engine, parseCell(String(p.after)));
      push({ kind: 'advance', duration: REPLAY_STEP_MS, event, previousEngine });
      if (p.raised === true) {
        const lowered = structuredClone(engine);
        engine.raisedAt = { x: engine.x, y: GATES.south.cells[0]!.y };
        push({ kind: 'advance', duration: REPLAY_STEP_MS, event, previousEngine: lowered });
      }
    } else if (event.code === 'torches') {
      push({ kind: 'torches', duration: REPLAY_STEP_MS, event });
    } else if (event.code === 'sortieHit' || event.code === 'sortieRepelled') {
      const engine = picture.engines.find((e) => e.id === p.engineId);
      if (!engine) continue;
      const route = sortieRoute(engine);
      const walk = (path: Cell[], returning = false) => {
        for (let i = 1; i < path.length; i++) {
          const from = path[i - 1]!,
            to = path[i]!;
          push({
            kind: 'sortie',
            duration: REPLAY_STEP_MS,
            event,
            party: {
              from,
              to,
              pose: from.x !== to.x ? 'east-march' : to.y < from.y ? 'north-march' : 'south-march',
              flip: to.x < from.x,
              returning,
            },
          });
        }
      };
      walk(route);
      const at = route.at(-1)!;
      push({
        kind: 'sortie',
        duration: REPLAY_STEP_MS,
        event,
        party: {
          from: at,
          to: at,
          pose: event.code === 'sortieHit' ? 'east-kindle' : 'south-thrust',
          kindle: event.code === 'sortieHit',
        },
      });
      if (event.code === 'sortieHit') {
        engine.durability = Number(p.after);
        engine.burning = p.burning === true;
        engine.wrecked = engine.durability <= 0;
        push({
          kind: 'sortie',
          duration: REPLAY_STEP_MS,
          event,
          party: { from: at, to: at, pose: 'north-march', returning: true },
        });
      } else {
        push({
          kind: 'sortie',
          duration: REPLAY_STEP_MS,
          event,
          party: { from: at, to: at, pose: 'south-repulsed', returning: true },
        });
      }
      walk([...route].reverse(), true);
    } else if (
      event.code === 'fireArrowHit' ||
      event.code === 'engineBurning' ||
      event.code === 'engineLost'
    ) {
      const engine = picture.engines.find((e) => e.id === p.engineId);
      const resolved = final.engines.find((e) => e.id === p.engineId);
      if (engine && resolved) {
        if (typeof p.after === 'number') engine.durability = p.after;
        if (event.code === 'fireArrowHit')
          engine.burning = !engine.covered && engine.durability > 0;
        if (event.code === 'engineLost') {
          engine.wrecked = true;
          engine.burning = false;
        }
        push({ kind: 'burning', duration: REPLAY_STEP_MS, event });
      }
    } else if (event.code === 'nightRepair') {
      const gate = String(p.gateId) as keyof SiegeState['gates'];
      picture.gates[gate].durability = Number(p.after);
      push({ kind: 'repair', duration: REPLAY_STEP_MS, event });
    }
  }
  // All final recovery, weather, supply and outcome changes are applied by the
  // caller after the last frame, including when the user skips immediately.
  return frames;
}
