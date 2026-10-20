import { FACTIONS } from '../content/scenario';
import type { Officer } from './types';

/** Executed officers stay in the roster (saves keep every officer) but are inert. */
export const isActiveOfficer = (officer: Pick<Officer, 'fate'>): boolean =>
  officer.fate !== 'executed';

/** A faction's ruler cannot be persuaded or leave service. */
export function isRuler(officer: Pick<Officer, 'name' | 'factionId'>): boolean {
  return (
    officer.factionId !== null &&
    FACTIONS.some((faction) => faction.id === officer.factionId && faction.leader === officer.name)
  );
}

/** Level follows experience; stats are granted once per level gained. */
export const levelForExperience = (experience: number): number =>
  Math.min(5, Math.floor(Math.max(0, experience) / 100));
