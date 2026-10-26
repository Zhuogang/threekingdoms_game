import { previewRetreat, battleCityId } from '../../campaign/battle-aftermath';
import type { V03BattleState, V03GameState } from '../../types';
import { displayName } from '../shared/app-copy-3';

export function RetreatPreview({
  state,
  battle,
  locale,
}: {
  state: V03GameState;
  battle: V03BattleState;
  locale: 'en' | 'zh';
}) {
  const side = battle.battleData.playerSide;
  const preview = previewRetreat(state, battle, side);
  const units = battle.battleData.units.filter((unit) => unit.side === side);
  const healthy = units.reduce((sum, unit) => sum + unit.troops, 0),
    wounded = units.reduce((sum, unit) => sum + unit.wounded, 0);
  const city = state.cities.find((entry) => entry.id === battleCityId(state, battle));
  const loseCity = side === 'defender' && battle.intent !== 'raid';
  const rear =
    loseCity && city
      ? city.reserve +
        state.troopSources
          .filter((source) => source.cityId === city.id)
          .reduce((sum, source) => sum + source.troops + source.wounded, 0) +
        state.officers
          .filter(
            (officer) =>
              officer.alive &&
              officer.factionId === city.factionId &&
              officer.location.kind === 'city' &&
              officer.location.cityId === city.id,
          )
          .reduce((sum, officer) => sum + officer.troops + officer.wounded, 0)
      : 0;
  return (
    <div className="v03-retreat-preview">
      <p>
        {locale === 'zh'
          ? '本次是整军认输，所有己方参战部队一起撤离。'
          : 'This concedes the battle and withdraws the whole army.'}
      </p>
      <p>
        {locale === 'zh' ? '随军可战 / 伤兵' : 'Field healthy / wounded'}:{' '}
        {healthy.toLocaleString()} / {wounded.toLocaleString()}
      </p>
      <p>
        {locale === 'zh' ? '撤退目的地' : 'Refuge'}:{' '}
        {preview.destination
          ? displayName(preview.destination.city, locale)
          : locale === 'zh'
            ? '无可用退路，将整军投降'
            : 'No usable refuge: the army surrenders'}
      </p>
      <p>
        {locale === 'zh' ? '每将被俘率' : 'Capture chance per officer'}: {preview.risk}% ·{' '}
        {preview.officers.length} {locale === 'zh' ? '名武将' : 'officers'}
      </p>
      <p>
        {locale === 'zh' ? '至少一将被俘概率' : 'Chance at least one officer is captured'}:{' '}
        {preview.atLeastOnePercent.toFixed(1)}%
      </p>
      {loseCity ? (
        <p>
          {locale === 'zh'
            ? `城市失守；留城预备兵、伤兵等 ${rear.toLocaleString()} 人解除编制，不随军撤走。`
            : `The city is lost. ${rear.toLocaleString()} rear personnel, wounded and reserves are disbanded; they do not evacuate with the field army.`}
        </p>
      ) : null}
      {preview.destination?.busy ? (
        <p>
          {locale === 'zh'
            ? '友城交战中，抵达后在城外等待，不能养伤或自动增援。'
            : 'The refuge is in battle: wait outside without healing or automatic reinforcement.'}
        </p>
      ) : null}
      {preview.risk === 25 ? (
        <p>
          {locale === 'zh'
            ? '已触发被迫溃退：逃脱者只能带走三分之二随军伤兵。'
            : 'Forced defeat is already triggered: escapees retain two thirds of their field wounded.'}
        </p>
      ) : null}
    </div>
  );
}
