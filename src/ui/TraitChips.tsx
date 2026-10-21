import { TRAIT_INFO, traitsOf } from '../content/traits';
import { useI18n } from '../i18n';

/** Small labelled chips for an officer's traits; the tooltip explains each effect. */
export default function TraitChips({ officerId }: { officerId: string }) {
  const { t, locale } = useI18n();
  const traits = traitsOf(officerId);
  if (!traits.length) return null;
  return (
    <span className="trait-chips" aria-label={t('Traits')}>
      {traits.map((trait) => {
        const info = TRAIT_INFO[trait];
        return (
          <span key={trait} className="trait-chip" title={t(info.description)}>
            {locale === 'zh' ? info.chinese : t(info.name)}
          </span>
        );
      })}
    </span>
  );
}
