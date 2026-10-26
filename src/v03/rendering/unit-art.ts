import { V03_ASSETS } from './assets';
import { troopDisplayType } from './presentation';

/** Level and count select land art; the commanding officer alone determines the vessel. */
export function unitArtwork(
  troopType: string,
  onWater = false,
  troops = 0,
  navalTraining = false,
  troopExperience = 0,
) {
  if (onWater) return navalTraining ? V03_ASSETS.towerWarshipInk03 : V03_ASSETS.transportSquadInk03;
  const large = Number.isFinite(troops) && troops >= 500;
  switch (troopDisplayType(troopType, troopExperience)) {
    case 'heavy-infantry':
      return large ? V03_ASSETS.heavyInfantryFormationInk04 : V03_ASSETS.heavyInfantrySquadInk04;
    case 'elite-cavalry':
      return large ? V03_ASSETS.eliteCavalryFormationInk04 : V03_ASSETS.eliteCavalrySquadInk04;
    case 'strong-archer':
      return large ? V03_ASSETS.strongArcherFormationInk04 : V03_ASSETS.strongArcherSquadInk04;
    case 'infantry':
      return large ? V03_ASSETS.infantryFormationInk04 : V03_ASSETS.infantrySquadInk04;
    case 'cavalry':
      return large ? V03_ASSETS.cavalryFormationInk04 : V03_ASSETS.cavalrySquadInk04;
    case 'archer':
      return large ? V03_ASSETS.archerFormationInk04 : V03_ASSETS.archerSquadInk04;
    default:
      return undefined;
  }
}
