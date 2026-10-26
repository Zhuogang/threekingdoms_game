import { useState } from 'react';
import { resolvePublicAsset } from './assets';
import { troopGlyph, troopName } from './presentation';
import { unitArtwork } from './unit-art';

export function UnitIcon({
  troopType,
  onWater,
  troops,
  navalTraining = false,
  locale,
}: {
  troopType: string;
  onWater: boolean;
  troops: number;
  navalTraining?: boolean;
  locale: 'en' | 'zh';
}) {
  const asset = unitArtwork(troopType, onWater, troops, navalTraining);
  const path = asset ? resolvePublicAsset(asset.path, import.meta.env.BASE_URL) : undefined;
  const [failedPath, setFailedPath] = useState<string>();
  const kind = onWater ? (navalTraining ? 'warship' : 'water') : troopType;
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
