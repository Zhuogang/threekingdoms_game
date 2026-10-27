import { useState } from 'react';
import { officerPortraitFallback, officerPortraitPath } from './officer-portraits';
import { resolvePublicAsset } from './assets';

/** The name remains visible beside this decorative portrait, including on request failure. */
export function OfficerPortrait({
  id,
  locale,
  size = 128,
  className = '',
  eager = false,
}: {
  id: string;
  locale: 'en' | 'zh';
  size?: 128 | 256;
  className?: string;
  eager?: boolean;
}) {
  const path = officerPortraitPath(id, size);
  const src = path ? resolvePublicAsset(path, import.meta.env.BASE_URL) : undefined;
  const [failed, setFailed] = useState<string>();
  return (
    <span className={'v03-officer-portrait ' + className} data-portrait-id={id} aria-hidden="true">
      <span className="v03-portrait-fallback">{officerPortraitFallback(id, locale)}</span>
      {src && failed !== src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(src)}
        />
      ) : null}
    </span>
  );
}
