import { troopLevel } from '../../campaign/troop-experience';
import { formatTroopExperience, troopDisplayType, troopName } from '../../rendering/presentation';
import { UnitIcon } from '../../rendering/UnitIcon';
import type { V03GameState, V03TroopGrowthReport } from '../../types';
import { displayName } from '../shared/app-copy-3';

export function TroopGrowthReport({
  entries,
  state,
  locale,
}: {
  entries: V03TroopGrowthReport[];
  state: V03GameState;
  locale: 'en' | 'zh';
}) {
  return (
    <section
      className="v03-troop-growth"
      aria-label={locale === 'zh' ? '部队成长' : 'Troop growth'}
    >
      <h4>{locale === 'zh' ? '部队成长' : 'Troop growth'}</h4>
      {entries.map((entry, index) => {
        const officer = state.officers.find((o) => o.id === entry.officerId);
        const beforeLevel = troopLevel(entry.beforeExperience);
        const afterLevel = troopLevel(entry.afterExperience);
        const gained = Math.max(0, entry.afterExperience - entry.beforeExperience);
        const survivors = entry.survivingTroops + entry.woundedTroops;
        const promoted = survivors > 0 && beforeLevel < 11 && afterLevel >= 11;
        const name = officer
          ? displayName(officer, locale)
          : locale === 'zh'
            ? '城防民兵'
            : 'City militia';
        return (
          <div
            className="v03-growth-entry"
            key={entry.officerId ?? `militia-${index}`}
            data-officer-id={entry.officerId ?? 'militia'}
          >
            <div className="v03-troop-summary">
              {survivors > 0 ? (
                <UnitIcon
                  troopType={entry.troopType}
                  troopExperience={entry.afterExperience}
                  troops={survivors}
                  onWater={false}
                  locale={locale}
                />
              ) : null}
              <span>
                <strong>
                  {name} ·{' '}
                  {troopName(troopDisplayType(entry.troopType, entry.afterExperience), locale)}
                </strong>
                <p>
                  Lv.{beforeLevel} → Lv.{afterLevel} · {entry.survivingTroops.toLocaleString()}{' '}
                  {locale === 'zh' ? '人存活' : 'survivors'}
                  {entry.woundedTroops > 0
                    ? ` · ${locale === 'zh' ? '伤兵' : 'Wounded'} ${entry.woundedTroops.toLocaleString()}`
                    : ''}
                </p>
              </span>
            </div>
            <p>
              {locale === 'zh' ? '兵员经验' : 'Soldier XP'}{' '}
              {formatTroopExperience(entry.beforeExperience, locale)} →{' '}
              {formatTroopExperience(entry.afterExperience, locale)}
              {survivors > 0 ? ` (+${formatTroopExperience(gained, locale)})` : ''}
            </p>
            <p>
              {survivors === 0
                ? locale === 'zh'
                  ? '全灭，部队经验清零'
                  : 'Annihilated; soldier XP reset'
                : entry.survivingTroops === 0
                  ? locale === 'zh'
                    ? '击溃，伤兵与部队经验保留'
                    : 'Defeated; wounded and soldier XP retained'
                  : !entry.participated
                    ? locale === 'zh'
                      ? '未实际交战，无经验奖励'
                      : 'No combat participation; no XP reward'
                    : promoted
                      ? locale === 'zh'
                        ? '晋升精锐'
                        : 'Promoted to elite'
                      : afterLevel === 20
                        ? locale === 'zh'
                          ? '已满级'
                          : 'Max level'
                        : afterLevel > beforeLevel
                          ? locale === 'zh'
                            ? '部队等级提升'
                            : 'Troop level increased'
                          : locale === 'zh'
                            ? '等级不变'
                            : 'Level unchanged'}
            </p>
          </div>
        );
      })}
    </section>
  );
}
