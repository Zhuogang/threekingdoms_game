import { traitsOf, type Trait } from '../../content/traits';
import { message } from '../../i18n';

/** Traits that change play in this ruleset; loyal has no effect and is not shown. */
export type ShownTrait = Exclude<Trait, 'loyal'>;
const SHOWN_TRAITS: readonly ShownTrait[] = ['fierce', 'benevolent', 'cunning', 'greedy'];

export function shownTraits(officerId: string): ShownTrait[] {
  return traitsOf(officerId).filter((trait): trait is ShownTrait =>
    SHOWN_TRAITS.includes(trait as ShownTrait),
  );
}

/** An officer's traits with their actual effect, in place; empty when none apply. */
export function TraitList({ officerId, locale }: { officerId: string; locale: 'en' | 'zh' }) {
  const traits = shownTraits(officerId);
  if (!traits.length) return null;
  return (
    <dl className="v03-trait-list">
      {traits.map((trait) => (
        <div key={trait}>
          <dt>{message(locale, `trait.${trait}`)}</dt>
          <dd>{message(locale, `trait.${trait}.effect`)}</dd>
        </div>
      ))}
    </dl>
  );
}
