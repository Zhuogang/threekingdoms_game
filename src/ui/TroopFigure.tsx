import { useState } from 'react';
import { TROOP_ART_FILES, TROOP_ART_KEY } from '../content/troopArtwork';
import type { TroopType } from '../game/types';
import TroopIcon from './TroopIcon';

export default function TroopFigure({ type }: { type: TroopType }) {
  const [failed, setFailed] = useState(false);
  const key = TROOP_ART_KEY[type];
  return (
    <span className="troop-figure" aria-hidden="true">
      {key && !failed ? (
        <img
          src={`${import.meta.env.BASE_URL}assets/${TROOP_ART_FILES[key]}`}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        <TroopIcon type={type} size={32} />
      )}
    </span>
  );
}
