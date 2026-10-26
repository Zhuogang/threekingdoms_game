import { V03_ASSETS } from './assets';

/** Current surviving troops determine land art; all waterborne units keep the same boat. */
export function unitArtwork(troopType: string, onWater = false, troops = 0) {
  if (onWater) return V03_ASSETS.transportSquadInk02;
  const large = Number.isFinite(troops) && troops >= 500;
  switch (troopType) {
    case 'infantry':
      return large ? V03_ASSETS.infantryFormationInk02 : V03_ASSETS.infantrySquadInk02;
    case 'cavalry':
      return large ? V03_ASSETS.cavalryFormationInk02 : V03_ASSETS.cavalrySquadInk02;
    case 'archer':
      return large ? V03_ASSETS.archerFormationInk02 : V03_ASSETS.archerSquadInk02;
    default:
      return undefined;
  }
}
