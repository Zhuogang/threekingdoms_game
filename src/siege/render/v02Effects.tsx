import type { SiegePosition, SiegeState, SiegeUnit } from '../rules/types';
import { FRAME, H, PAPER, POSE_SETS, W, effect } from './assets';
import { NIGHT_COLOR, NIGHT_OPACITY, footholdCells } from './v02Art';
import type { PreparationSprite } from './v02Art';
import type { NightPresentation } from './nightReplay';
import { anchor, planeRect, wallFaceFoot } from './boardGeometry';

export const FOOTHOLD_RADIUS = (FRAME.lh / 8) * 1.8;
export const FOOTHOLD_RING = 1.2;

export function FootholdPips({
  state,
  forecast,
}: {
  state: SiegeState;
  forecast?: SiegePosition | null;
}) {
  return (
    <g pointerEvents="none" data-testid="foothold-pips">
      {footholdCells(state).map((cell) => {
        const key = `${cell.x},${cell.y}`,
          count = state.footholds[key] ?? 0;
        // A vertical column on the east side of the climbing position, mid-wall.
        const r = planeRect({ ...cell, level: 'wall' });
        const [x, y] = [r[2] - 8, wallFaceFoot(cell)[1] - 36];
        const blinking = forecast?.x === cell.x && forecast.y === cell.y;
        return (
          <g key={key} data-foothold={key} data-progress={count}>
            {[-1, 0, 1].map((offset, i) => (
              <g key={i} data-pip={i} data-lit={i < count}>
                <circle
                  cx={x}
                  cy={y + offset * (2 * FOOTHOLD_RADIUS + 2 * FOOTHOLD_RING + 2)}
                  r={FOOTHOLD_RADIUS}
                  fill="none"
                  stroke={PAPER}
                  strokeWidth={2 * FOOTHOLD_RING + 1.4}
                />
                <circle
                  data-pip-core="true"
                  cx={x}
                  cy={y + offset * (2 * FOOTHOLD_RADIUS + 2 * FOOTHOLD_RING + 2)}
                  r={FOOTHOLD_RADIUS}
                  fill={i < count ? '#edbd56' : 'none'}
                  stroke="#372e26"
                  strokeWidth={1.4}
                />
                {blinking && (
                  <animate
                    attributeName="opacity"
                    values="1;.25;1"
                    dur=".65s"
                    repeatCount="indefinite"
                  />
                )}
              </g>
            ))}
          </g>
        );
      })}
    </g>
  );
}

export function PreparationFlames({
  sprites,
  flare = false,
}: {
  sprites: PreparationSprite[];
  flare?: boolean;
}) {
  return (
    <g pointerEvents="none">
      {sprites
        .filter((s) => s.flame)
        .map((s) => {
          const [x, y] = s.flame!;
          const width = (s.rect[2] - s.rect[0]) / 3;
          const height = width * 1.5;
          return (
            <image
              key={s.id}
              data-flame={s.id}
              href={effect('flame-small')}
              x={x - width / 2}
              y={y - height}
              width={width}
              height={height * (flare ? 1.5 : 1)}
            >
              <animate
                attributeName="opacity"
                values={flare ? '1;.45;1' : '.9;.65;.9'}
                dur={flare ? '.13s' : '.8s'}
                repeatCount="indefinite"
              />
            </image>
          );
        })}
    </g>
  );
}

export function NightOverlay({
  prefix,
  preparations,
  night,
}: {
  prefix: string;
  preparations: PreparationSprite[];
  night: NightPresentation;
}) {
  const party = night.party;
  const lights = preparations.flatMap((s) => (s.flame ? [s.flame] : []));
  if (party) lights.push(anchor({ ...party.to, level: 'ground' }));
  return (
    <g pointerEvents="none" data-testid="night-overlay">
      <defs>
        <radialGradient id={`${prefix}-light`}>
          <stop stopColor="#ffc77a" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffc77a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={NIGHT_COLOR} opacity={NIGHT_OPACITY} />
      {lights.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={FRAME.cw * (night.kind === 'torches' ? 1.6 : 1.15)}
          fill={`url(#${prefix}-light)`}
        />
      ))}
      <PreparationFlames sprites={preparations} flare={night.kind === 'torches'} />
    </g>
  );
}

export function SortieParty({ night }: { night: NightPresentation }) {
  if (!night.party) return null;
  const party = night.party,
    pose = POSE_SETS['s8-05']!.poses.get(party.pose)!;
  const from = anchor({ ...party.from, level: 'ground' });
  const to = anchor({ ...party.to, level: 'ground' });
  return (
    <g
      key={`${party.from.x},${party.from.y}-${party.to.x},${party.to.y}-${party.pose}`}
      pointerEvents="none"
      data-testid="sortie-party"
      data-pose={party.pose}
      data-returning={Boolean(party.returning)}
      transform={`translate(${to[0]} ${to[1]})`}
    >
      <animateTransform
        attributeName="transform"
        type="translate"
        from={from.join(' ')}
        to={to.join(' ')}
        dur={`${night.duration}ms`}
        fill="freeze"
      />
      {[-1, 1, 0].map((i, index) => (
        <image
          key={i}
          data-sprite="sortie"
          href={pose.href}
          x={-pose.anchor[0] + (i * FRAME.cw) / 5}
          y={-pose.anchor[1] - (index < 2 ? FRAME.cd / 5 : 0)}
          width={pose.size[0]}
          height={pose.size[1]}
          transform={party.flip ? 'scale(-1 1)' : undefined}
        />
      ))}
      {party.kindle && (
        <image
          data-sprite="kindle"
          href={effect('flame-small')}
          x={FRAME.cw / 5}
          y={-FRAME.lh}
          width={FRAME.cw / 3}
          height={FRAME.lh * 1.5}
        />
      )}
    </g>
  );
}

export function Displacement({
  state,
  unit,
  foot,
  motionId,
}: {
  state: SiegeState;
  unit: SiegeUnit;
  foot: [number, number];
  motionId: string;
}) {
  const index = state.log
    .map(
      (e) => e.day === state.day && e.code === 'defenderDisplaced' && e.params.unitId === unit.id,
    )
    .lastIndexOf(true);
  const entry = state.log[index];
  if (!entry || entry.params.to !== `${unit.x},${unit.y}`) return null;
  const [x, y] = String(entry.params.from).split(',').map(Number);
  const from = anchor({ x: x!, y: y!, level: 'wall' });
  return (
    <g key={`${entry.day}-${index}`}>
      <animateTransform
        href={`#${motionId}`}
        attributeName="transform"
        type="translate"
        from={from.join(' ')}
        to={foot.join(' ')}
        dur="130ms"
        fill="freeze"
      />
      <text
        data-testid="displaced-morale"
        x={foot[0]}
        y={foot[1] - FRAME.lh * 2}
        fill="#a73f2a"
        fontSize={16}
        textAnchor="middle"
      >
        {Number(entry.params.moraleAfter) - Number(entry.params.moraleBefore)}
        <animate attributeName="dy" from="0" to={-FRAME.lh} dur=".65s" fill="freeze" />
        <animate attributeName="opacity" values="1;1;0" dur=".65s" fill="freeze" />
      </text>
    </g>
  );
}
