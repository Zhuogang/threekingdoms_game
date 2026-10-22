import type { GameplayContext } from '../hooks/gameplayView';
import { formatBattleLog } from '../../i18n/formatters';
import { localizeBattleLogLine } from '../shared/app-copy-2';
export function BattleLog({ context }: { context: GameplayContext }) {
  const { battleState, state, locale } = context;
  if (!battleState) return null;
  const groups = new Map<number, { line: string; index: number }[]>();
  let day = 1;
  battleState.log.forEach((line, index) => {
    const entry = battleState.logEntries?.find((entry) => entry.index === index);
    if (entry) day = entry.day;
    else {
      const match = line.match(/^Battle day (\d+) begins\.$/);
      if (match) day = Number(match[1]);
    }
    const group = groups.get(day) ?? [];
    group.push({
      line: entry
        ? formatBattleLog(entry, battleState, state, locale)
        : localizeBattleLogLine(line, state, locale),
      index,
    });
    groups.set(day, group);
  });
  return (
    <div className="v03-log-box">
      <strong>{context.t.battleLog}</strong>
      {[...groups]
        .sort(([a], [b]) => b - a)
        .slice(0, 3)
        .map(([day, entries]) => (
          <section key={day}>
            <h4>
              {context.t.battleDayLabel} {day}
            </h4>
            {entries.map((entry) => (
              <p key={entry.index}>{entry.line}</p>
            ))}
          </section>
        ))}
    </div>
  );
}
