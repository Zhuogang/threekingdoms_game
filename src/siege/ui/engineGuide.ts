import {
  APPROACH_ROW,
  SOUTH_WALL_ROW,
  TRENCH_INNER_ROW,
  TRENCH_OUTER_ROW,
} from '../content/coarseGrid';
import { GATES, SOUTH_TRENCH, sameCell } from '../content/chencang';
import { usableEngine, distance } from '../rules/combat';
import { cellTerrain } from '../rules/map';
import { siegeText, type SiegeLocale, type SiegeTextKey } from '../i18n';
import type { SiegePosition, SiegeState } from '../rules/types';
import { siegeCommands } from './commands';
import { SIEGE_TUNING as T } from '../rules/tuning';

export function engineGuide(state: SiegeState, id: string) {
  const engine = state.engines.find((e) => e.id === id);
  if (!engine || !usableEngine(engine)) return null;
  if (engine.kind === 'ram' && state.gates.south.broken) return null;
  const ready = siegeCommands(state, id, 'shu').some(
    (c) => c.kind !== 'move' && c.kind !== 'standby' && !c.reason,
  );
  if (ready || (engine.kind === 'ladder' && engine.raisedAt) || engine.kind === 'tower')
    return null;
  const destinations =
    engine.kind === 'ram'
      ? GATES.south.approaches
      : engine.kind === 'ladder'
        ? SOUTH_TRENCH.filter(
            (c) => c.y === TRENCH_OUTER_ROW && cellTerrain(state, c.x, SOUTH_WALL_ROW) === 'wall',
          ).map((c) => ({ x: c.x, y: APPROACH_ROW }))
        : SOUTH_TRENCH.filter((c) => c.y === TRENCH_OUTER_ROW).flatMap((c) => {
            if (state.trenchFill[`${c.x},${c.y}`] !== T.trenchCapacity)
              return [{ x: c.x, y: APPROACH_ROW }];
            if (
              state.trenchFill[`${c.x},${TRENCH_INNER_ROW}`] !== T.trenchCapacity ||
              (state.mounds[`${c.x},${TRENCH_INNER_ROW}`] ?? 0) < T.moundComplete
            )
              return [{ x: c.x, y: TRENCH_OUTER_ROW }];
            return [];
          });
  const target = [...destinations].sort(
    (a, b) => distance(a, engine) - distance(b, engine) || a.x - b.x,
  )[0];
  if (!target) return null;
  const key: SiegeTextKey =
    engine.kind === 'ram'
      ? 'engineGoRam'
      : engine.kind === 'ladder'
        ? sameCell(engine, target)
          ? 'engineClearTrench'
          : 'engineGoLadder'
        : 'engineGoCart';
  return {
    key,
    target: { ...target, level: 'ground' } as SiegePosition,
    done: Boolean(engine.acted || engine.moved),
    atTarget: sameCell(engine, target),
  };
}

export function engineGuideText(
  guide: NonNullable<ReturnType<typeof engineGuide>>,
  locale: SiegeLocale,
) {
  const plan = siegeText(locale, guide.key);
  return guide.done ? siegeText(locale, 'nextTomorrowEngine', { plan }) : plan;
}
