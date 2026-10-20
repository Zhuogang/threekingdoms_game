import type { CSSProperties } from 'react';
import { getOfficerIdentity } from '../content/officerIdentity';
import type { Officer } from '../game/types';
import Portrait from './Portrait';
import TroopIcon from './TroopIcon';
import { useFaction } from './FactionsContext';

export default function OfficerMark({
  officer,
  size = 'normal',
}: {
  officer: Officer;
  size?: 'normal' | 'small' | 'large';
}) {
  const identity = getOfficerIdentity(officer.id);
  const faction = useFaction(officer.factionId);
  return (
    <div
      className={`officer-mark ${size}`}
      style={{ '--officer-color': faction?.color ?? '#827766' } as CSSProperties}
    >
      <Portrait officerId={officer.id} large={size === 'large'} />
      <span className="officer-surname">{identity?.surnameZh ?? '军'}</span>
      <span className="officer-troop">
        <TroopIcon type={officer.troopType} />
      </span>
    </div>
  );
}
