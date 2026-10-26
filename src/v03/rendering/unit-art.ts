import { V03_ASSETS } from './assets';

/** Stage 1 always uses squads, regardless of troop count. Water changes only the artwork. */
export function unitArtwork(troopType: string, onWater = false) {
  if (onWater) return V03_ASSETS.transportSquadInk02;
  switch (troopType) {
    case 'infantry':
      return V03_ASSETS.infantrySquadInk02;
    case 'cavalry':
      return V03_ASSETS.cavalrySquadInk02;
    case 'archer':
      return V03_ASSETS.archerSquadInk02;
    default:
      return undefined;
  }
}
