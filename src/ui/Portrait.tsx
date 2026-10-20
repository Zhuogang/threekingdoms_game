import { useState } from 'react';
import { getOfficerIdentity } from '../content/officerIdentity';

/** Shared local portrait; adjacent visible names provide its accessible identity. */
export default function Portrait({
  officerId,
  large = false,
  className = '',
}: {
  officerId: string;
  large?: boolean;
  className?: string;
}) {
  const key = getOfficerIdentity(officerId)?.portraitKey ?? 'garrison';
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const activeKey = failedKey === key ? 'garrison' : key;
  const source = `${import.meta.env.BASE_URL}assets/portraits/${activeKey}${large ? '' : '-small'}.webp`;
  const fallbackOnly = fallbackFailed && failedKey === key;
  return (
    <span className={`portrait ${className}`} data-officer-id={officerId} aria-hidden="true">
      {fallbackOnly ? (
        <span className="portrait-fallback">
          {getOfficerIdentity(officerId)?.surnameZh ?? '军'}
        </span>
      ) : (
        <img
          src={source}
          alt=""
          loading={large ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onError={() => {
            if (activeKey === 'garrison') {
              setFailedKey(key);
              setFallbackFailed(true);
            } else {
              setFailedKey(key);
              setFallbackFailed(false);
            }
          }}
        />
      )}
    </span>
  );
}
