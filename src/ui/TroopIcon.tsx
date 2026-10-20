import type { TroopType } from '../game/types';
import { TROOP_VISUALS } from '../content/troopVisuals';

export default function TroopIcon({ type, size = 20 }: { type: TroopType; size?: number }) {
  return (
    <svg
      className="troop-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TROOP_VISUALS[type].paths.map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}
