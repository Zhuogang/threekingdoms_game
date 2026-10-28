import { OFFICER_PORTRAIT_PATHS } from '../content/officer-portraits.generated';
import { getOfficerIdentity } from '../content/officerIdentity';

export function officerPortraitPath(id: string, size: 128 | 256 = 128): string | undefined {
  return Object.hasOwn(OFFICER_PORTRAIT_PATHS, id)
    ? OFFICER_PORTRAIT_PATHS[id]![size === 128 ? 0 : 1]
    : undefined;
}

export function officerPortraitFallback(id: string, locale: 'en' | 'zh'): string {
  const identity = getOfficerIdentity(id);
  return identity
    ? locale === 'zh'
      ? identity.surnameZh
      : identity.surnameEn
    : id === 'garrison'
      ? locale === 'zh'
        ? '守'
        : 'G'
      : '?';
}
