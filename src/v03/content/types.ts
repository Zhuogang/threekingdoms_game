export type TroopType = 'infantry' | 'cavalry' | 'archer' | 'naval' | 'elite' | 'guard';
export type Terrain = 'plain' | 'forest' | 'hill' | 'water' | 'fort' | 'wall' | 'gate';
export interface Faction {
  id: string;
  name: string;
  chinese: string;
  leader: string;
  color: string;
  motto: string;
  description: string;
  difficulty: string;
}
export type BattlefieldProfile = 'plains' | 'river' | 'mountain' | 'forest';
export interface City {
  id: string;
  name: string;
  chinese: string;
  region: string;
  x: number;
  y: number;
  neighbors: string[];
  factionId: string | null;
  population: number;
  farming: number;
  commerce: number;
  defense: number;
  loyalty: number;
  gold: number;
  food: number;
  reserve: number;
  governorId: string | null;
  /** Plunder, raid and sack are rejected while `turn < plunderCooldownUntil`. */
  plunderCooldownUntil: number;
}
/** Executed and deceased officers stay in the roster (saves keep everyone) but are inert. */
export type OfficerFate = 'active' | 'executed' | 'deceased';
export interface Officer {
  id: string;
  name: string;
  chinese: string;
  factionId: string | null;
  cityId: string;
  force: number;
  intellect: number;
  loyalty: number;
  stamina: number;
  age: number;
  troops: number;
  troopType: TroopType;
  busy: boolean;
  captive: boolean;
  experience: number;
  /** min(5, floor(experience / 100)); rising levels grant stats once. */
  level: number;
  equipment: string | null;
  fate: OfficerFate;
}
