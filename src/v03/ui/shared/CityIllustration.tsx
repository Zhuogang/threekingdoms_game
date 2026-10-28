import { useState } from 'react';
import { resolvePublicAsset } from '../../rendering/assets';
import { cityArtworkKind } from '../../rendering/campaign-city-art';
import { V03_CITY_ILLUSTRATIONS } from '../../rendering/city-illustrations';
import type { V03City } from '../../types';

/** Decorative regional art; the city name and all information remain normal text. */
export function CityIllustration({ city }: { city: Pick<V03City, 'id' | 'chinese'> }) {
  const kind = cityArtworkKind(city.id);
  const asset = V03_CITY_ILLUSTRATIONS[kind];
  return (
    <IllustrationImage
      key={asset.path}
      asset={asset}
      kind={kind}
      glyph={city.chinese.slice(0, 1)}
    />
  );
}

function IllustrationImage({
  asset,
  kind,
  glyph,
}: {
  asset: (typeof V03_CITY_ILLUSTRATIONS)[keyof typeof V03_CITY_ILLUSTRATIONS];
  kind: string;
  glyph: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="v03-city-illustration" data-city-art={kind} aria-hidden="true">
      {failed ? (
        <span className="v03-city-art-fallback">{glyph}</span>
      ) : (
        <img
          src={resolvePublicAsset(asset.path, import.meta.env.BASE_URL)}
          width={asset.width}
          height={asset.height}
          alt=""
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
