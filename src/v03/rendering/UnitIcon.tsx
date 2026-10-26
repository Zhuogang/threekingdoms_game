import { useState } from 'react';
import { resolvePublicAsset } from './assets';
import { troopDisplayType, troopGlyph, troopName } from './presentation';
import { unitArtwork } from './unit-art';

export function UnitIcon({
  troopType,
  onWater,
  troops,
  navalTraining = false,
  troopExperience = 0,
  locale,
}: {
  troopType: string;
  onWater: boolean;
  troops: number;
  navalTraining?: boolean;
  troopExperience?: number;
  locale: 'en' | 'zh';
}) {
  const asset = unitArtwork(troopType, onWater, troops, navalTraining, troopExperience);
  const path = asset ? resolvePublicAsset(asset.path, import.meta.env.BASE_URL) : undefined;
  const [failedPath, setFailedPath] = useState<string>();
  const kind = onWater
    ? navalTraining
      ? 'warship'
      : 'water'
    : troopDisplayType(troopType, troopExperience);
  return (
    <span className="v03-unit-glyph" title={troopName(kind, locale)}>
      {path && failedPath !== path ? (
        <img src={path} alt={troopName(kind, locale)} onError={() => setFailedPath(path)} />
      ) : (
        troopGlyph(kind)
      )}
    </span>
  );
}
