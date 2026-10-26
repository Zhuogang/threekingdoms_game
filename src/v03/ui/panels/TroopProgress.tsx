import { troopLevel, type TroopPool } from '../../campaign/troop-experience';
import { troopDisplayType, troopExperienceText, troopName } from '../../rendering/presentation';
import { UnitIcon } from '../../rendering/UnitIcon';

type Troops = TroopPool & { troopType: string };

export function TroopProgress({
  unit,
  locale,
  compact = false,
}: {
  unit: Troops;
  locale: 'en' | 'zh';
  compact?: boolean;
}) {
  const level = troopLevel(unit.troopExperience);
  return (
    <span className="v03-troop-progress" data-troop-level={level}>
      <span>
        {troopName(troopDisplayType(unit.troopType, unit.troopExperience), locale)} · Lv.{level}
      </span>
      {!compact ? <small>{troopExperienceText(unit.troopExperience, locale)}</small> : null}
    </span>
  );
}

export function ReinforcementPreview({
  before,
  after,
  locale,
}: {
  before: Troops;
  after: Troops;
  locale: 'en' | 'zh';
}) {
  const beforeLevel = troopLevel(before.troopExperience);
  const afterLevel = troopLevel(after.troopExperience);
  return (
    <section
      className="v03-reinforcement-preview"
      aria-label={locale === 'zh' ? '补兵预览' : 'Reinforcement preview'}
    >
      <h3>{locale === 'zh' ? '兵员调整预览' : 'Troop assignment preview'}</h3>
      <p>
        {before.troops.toLocaleString()} → {after.troops.toLocaleString()} · Lv.{beforeLevel} → Lv.
        {afterLevel}
      </p>
      <div className="v03-troop-comparison">
        {[before, after].map((unit, index) => (
          <div className="v03-troop-summary" key={index}>
            <UnitIcon {...unit} onWater={false} locale={locale} />
            <span>
              <small>
                {locale === 'zh' ? (index ? '调整后' : '当前') : index ? 'After' : 'Before'}
              </small>
              <TroopProgress unit={unit} locale={locale} />
            </span>
          </div>
        ))}
      </div>
      <p role="status">
        {after.troops === 0
          ? locale === 'zh'
            ? '已全部交回兵池，部队经验清零。'
            : 'All soldiers return to the reserve; this force resets to zero XP.'
          : beforeLevel >= 11 && afterLevel < 11
            ? locale === 'zh'
              ? '精锐 → 普通：补兵后低于 11 级。'
              : 'Elite → Regular: reinforcement lowers this force below level 11.'
            : beforeLevel < 11 && afterLevel >= 11
              ? locale === 'zh'
                ? '普通 → 精锐：调入老兵后达到 11 级。'
                : 'Regular → Elite: incoming veterans raise this force to level 11 or higher.'
              : locale === 'zh'
                ? '兵员经验按实际人数加权，武将等级不变。'
                : 'Soldier XP is weighted by headcount; the officer’s level is unchanged.'}
      </p>
    </section>
  );
}
