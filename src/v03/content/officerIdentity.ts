import { OFFICER_CATALOG } from './officer-catalog';

/** Stable IDs are save keys, not name parsers. One identity source for all 98 people. */
export interface OfficerIdentity {
  surnameEn: string;
  surnameZh: string;
  portraitKey: string;
  name: string;
  chinese: string;
}
export const OFFICER_IDENTITIES: Readonly<Record<string, OfficerIdentity>> = Object.fromEntries(
  OFFICER_CATALOG.map(({ id, name, chinese, surnameEn, surnameZh, portraitKey }) => [
    id,
    { name, chinese, surnameEn, surnameZh, portraitKey },
  ]),
);

export function getOfficerIdentity(id: string): OfficerIdentity | undefined {
  return Object.hasOwn(OFFICER_IDENTITIES, id) ? OFFICER_IDENTITIES[id] : undefined;
}
