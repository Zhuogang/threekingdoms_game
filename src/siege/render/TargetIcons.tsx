import { GATES } from '../content/chencang';
import type { SiegePosition, SiegeState } from '../rules/types';
import type { ActorTarget, TargetIcon } from '../ui/commands';
import { anchor } from './boardGeometry';
import type { ScreenRect } from './scene';

export function targetIconRects(
  state: SiegeState,
  targets: ActorTarget[],
  plates: Map<string, ScreenRect>,
) {
  return targets.map((target, i) => {
    const unit = state.units.find((u) => u.id === target.id);
    const engine = state.engines.find((e) => e.id === target.id);
    const gate = Object.values(GATES).find((g) => g.id === target.id);
    const position: SiegePosition = unit ?? { ...(engine ?? gate!.cells[0]!), level: 'ground' };
    const plate = plates.get(target.id);
    const at = plate ? [plate[2] - 10, plate[1]] : anchor(position, state);
    const offset = targets.slice(0, i).filter((t) => t.id === target.id).length * 22;
    return {
      target,
      position,
      rect: [at[0]! - 10 - offset, at[1]! - 10, at[0]! + 10 - offset, at[1]! + 10] as ScreenRect,
    };
  });
}

const paths: Record<TargetIcon, string> = {
  sword: 'M4 20l5-5m-3-3 6 6M9 12 18 3l3 0 0 3-9 9',
  bow: 'M5 3q22 9 0 18L13 12ZM3 12h18m-4-3 4 3-4 3',
  hammer: 'M5 21l9-11M8 6l5-4 8 8-5 4ZM8 6l4 4',
  fire: 'M13 2c2 7-6 6-3 12 2-2 4-3 4-5 9 8 3 14-3 13C1 20 3 12 7 8c-1 5 0 5 1 6-1-6 4-7 5-12Z',
  stone: 'M3 17l4-9 10-4 5 10-7 8ZM7 8l8 6 7 0M15 14v8',
  suppress: 'M3 5h13M3 10h10M3 15h7m5-6 6 6-6 6m-5-6h11',
};

export function TargetIcons({
  entries,
  prefix,
}: {
  entries: ReturnType<typeof targetIconRects>;
  prefix: string;
}) {
  return (
    <g data-testid="target-icons">
      <defs>
        {(Object.entries(paths) as [TargetIcon, string][]).map(([icon, d]) => (
          <symbol id={`${prefix}-target-${icon}`} key={icon} viewBox="0 0 24 24">
            <path
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </symbol>
        ))}
      </defs>
      {entries.map(({ target, rect }, i) => (
        <g
          key={`${target.id}-${target.action.type}-${i}`}
          data-target-icon={target.icon}
          data-target-id={target.id}
          data-target-command={target.action.type}
          transform={`translate(${rect[0]} ${rect[1]})`}
          style={{ cursor: 'pointer' }}
        >
          <circle cx={10} cy={10} r={10} fill="#f6e7bc" stroke="#934833" />
          <use
            href={`#${prefix}-target-${target.icon}`}
            width={16}
            height={16}
            x={2}
            y={2}
            color="#883e2f"
          />
        </g>
      ))}
    </g>
  );
}
