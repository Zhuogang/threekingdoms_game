import { V03_BATTLE_CELL, V03_BATTLE_HALF_CELL } from './geometry';

/**
 * Tiled fallback ground for battlefields without a painted canvas: one 64×64
 * SVG pattern per logical terrain, aligned to cell edges so every tile reads
 * as exactly one rules cell. Decoration stays inside the tile, so seams match.
 */
export const BATTLE_TERRAIN_KINDS = ['plain', 'forest', 'hill', 'water', 'cliff'] as const;

export function battleTerrainPatternId(prefix: string, terrain: string): string {
  const kind = (BATTLE_TERRAIN_KINDS as readonly string[]).includes(terrain) ? terrain : 'plain';
  return `${prefix}-${kind}`;
}

const TILE = V03_BATTLE_CELL;

function Tree({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <ellipse
        cx={x + 2}
        cy={y + r * 0.7}
        rx={r * 0.95}
        ry={r * 0.45}
        fill="#6d7458"
        opacity={0.35}
      />
      <circle cx={x} cy={y} r={r} fill="#5c7458" stroke="#3c5441" strokeWidth={1.2} />
      <circle cx={x - r * 0.3} cy={y - r * 0.32} r={r * 0.42} fill="#7d9474" opacity={0.75} />
    </g>
  );
}

export function BattleTerrainPatterns({ prefix }: { prefix: string }) {
  const common = {
    patternUnits: 'userSpaceOnUse' as const,
    x: -V03_BATTLE_HALF_CELL,
    y: -V03_BATTLE_HALF_CELL,
    width: TILE,
    height: TILE,
  };
  return (
    <>
      <pattern id={`${prefix}-plain`} {...common}>
        <rect width={TILE} height={TILE} fill="#ebe2cb" />
        <g stroke="#b8a982" strokeWidth={1.1} strokeLinecap="round" opacity={0.7}>
          <path d="M 10 18 l 2 -5 M 13 19 l 1 -4" />
          <path d="M 40 12 l 2 -4 M 43 13 l 1 -4" />
          <path d="M 22 46 l 2 -5 M 25 47 l 1 -4" />
          <path d="M 50 50 l 2 -4" />
        </g>
        <circle cx={33} cy={30} r={1.1} fill="#a8997a" opacity={0.6} />
        <circle cx={8} cy={54} r={0.9} fill="#a8997a" opacity={0.6} />
      </pattern>
      <pattern id={`${prefix}-forest`} {...common}>
        <rect width={TILE} height={TILE} fill="#c5c6a2" />
        <Tree x={18} y={20} r={11} />
        <Tree x={44} y={26} r={12} />
        <Tree x={26} y={45} r={11} />
        <Tree x={51} y={51} r={7} />
      </pattern>
      <pattern id={`${prefix}-hill`} {...common}>
        <rect width={TILE} height={TILE} fill="#d3c49c" />
        <path d="M 8 44 Q 30 14 56 42" fill="#c3b186" stroke="#8f7c55" strokeWidth={1.6} />
        <path d="M 18 44 Q 31 26 46 43" fill="none" stroke="#a89466" strokeWidth={1.2} />
        <g stroke="#8f7c55" strokeWidth={1} opacity={0.65}>
          <path d="M 40 30 l 4 5 M 44 33 l 4 5 M 48 37 l 3 4" />
        </g>
        <path d="M 6 46 L 58 46" stroke="#a89466" strokeWidth={1} opacity={0.5} />
      </pattern>
      <pattern id={`${prefix}-water`} {...common}>
        <rect width={TILE} height={TILE} fill="#88aca6" />
        <g fill="none" stroke="#d6e4d8" strokeWidth={1.6} strokeLinecap="round" opacity={0.75}>
          <path d="M 0 16 Q 8 11 16 16 T 32 16 T 48 16 T 64 16" />
          <path d="M 0 40 Q 8 35 16 40 T 32 40 T 48 40 T 64 40" />
        </g>
        <g fill="none" stroke="#5f8784" strokeWidth={1.1} opacity={0.6}>
          <path d="M 6 28 q 6 -3 12 0" />
          <path d="M 38 52 q 6 -3 12 0" />
        </g>
      </pattern>
      <pattern id={`${prefix}-cliff`} {...common}>
        <rect width={TILE} height={TILE} fill="#6f6a5f" />
        <path
          d="M 4 50 L 18 18 L 30 34 L 44 10 L 60 46 Z"
          fill="#5a564d"
          stroke="#2f2d29"
          strokeWidth={1.6}
        />
        <path d="M 18 18 L 22 40 M 44 10 L 40 38" stroke="#2f2d29" strokeWidth={1.2} />
        <path
          d="M 12 26 L 18 18 L 24 26 M 38 18 L 44 10 L 50 20"
          fill="none"
          stroke="#e5dccb"
          strokeWidth={2}
        />
        <path d="M 0 60 L 64 60" stroke="#2f2d29" strokeWidth={2.5} opacity={0.6} />
      </pattern>
    </>
  );
}
