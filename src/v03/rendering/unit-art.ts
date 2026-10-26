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
  if (onWater) return navalTraining ? V03_ASSETS.towerWarshipInk02 : V03_ASSETS.transportSquadInk02;
  const large = Number.isFinite(troops) && troops >= 500;
  switch (troopDisplayType(troopType, troopExperience)) {
    case 'heavy-infantry':
      return large ? V03_ASSETS.heavyInfantryFormationInk02 : V03_ASSETS.heavyInfantrySquadInk02;
    case 'elite-cavalry':
      return large ? V03_ASSETS.eliteCavalryFormationInk02 : V03_ASSETS.eliteCavalrySquadInk02;
    case 'strong-archer':
      return large ? V03_ASSETS.strongArcherFormationInk02 : V03_ASSETS.strongArcherSquadInk02;
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
