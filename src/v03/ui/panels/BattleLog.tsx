import type { GameplayContext } from '../hooks/gameplayView';
import { message } from '../../i18n';
import { battleLogSide, formatBattleLog } from '../../i18n/formatters';
import { localizeBattleLogLine } from '../shared/app-copy-2';

interface LogLine {
  key: string;
  text: string;
  tone: 'player' | 'enemy' | null;
  /** Individual moves and holds folded into a per-side summary line. */
  details?: LogLine[];
  /** Formations that moved, and those that only held (a move is followed by a hold). */
  moved?: Set<string>;
  held?: Set<string>;
}

/** Days shown open; older days fold into one section instead of disappearing. */
const OPEN_DAYS = 3;

/**
 * Newest day first, coloured by side. Each side's moves and holds collapse into one
 * expandable line per day, so strikes and tactics stand out (PF-UI-08).
 */
export function BattleLog({ context }: { context: GameplayContext }) {
  const { battleState, state, locale } = context;
  if (!battleState) return null;
  const entries = new Map((battleState.logEntries ?? []).map((entry) => [entry.index, entry]));
  const days = new Map<number, LogLine[]>();
  const movement = new Map<string, LogLine>();
  let day = 1;
  battleState.log.forEach((raw, index) => {
    const entry = entries.get(index);
    if (entry) day = entry.day;
    else {
      const match = raw.match(/^Battle day (\d+) begins\.$/);
      if (match) day = Number(match[1]);
    }
    const lines = days.get(day) ?? [];
    days.set(day, lines);
    const side = entry ? battleLogSide(entry, battleState) : null;
    const tone = side ? (side === battleState.playerSide ? 'player' : 'enemy') : null;
    const line: LogLine = {
      key: String(index),
      text: entry
        ? formatBattleLog(entry, battleState, state, locale)
        : localizeBattleLogLine(raw, state, locale),
      tone,
    };
    if (entry && (entry.code === 'log.move' || entry.code === 'log.wait') && side) {
      const groupKey = `${day}:${side}`;
      let group = movement.get(groupKey);
      if (!group) {
        group = {
          key: `moves-${index}`,
          text: '',
          tone,
          details: [],
          moved: new Set(),
          held: new Set(),
        };
        movement.set(groupKey, group);
        lines.push(group);
      }
      group.details!.push(line);
      (entry.code === 'log.move' ? group.moved! : group.held!).add(String(entry.params.unitId));
      return;
    }
    lines.push(line);
  });
  for (const [groupKey, group] of movement)
    group.text = message(locale, 'log.movement', {
      army: message(
        locale,
        groupKey.endsWith(`:${battleState.playerSide}`) ? 'army.player' : 'army.enemy',
      ),
      moved: group.moved!.size,
      held: [...group.held!].filter((id) => !group.moved!.has(id)).length,
    });
  const ordered = [...days].sort(([a], [b]) => b - a);
  const renderDay = ([dayNumber, lines]: [number, LogLine[]]) => (
    <section key={dayNumber}>
      <h4>
        {context.t.battleDayLabel} {dayNumber}
      </h4>
      {lines.map((line) =>
        line.details ? (
          <details key={line.key} className={`v03-log-moves ${line.tone ?? ''}`}>
            <summary>{line.text}</summary>
            {line.details.map((detail) => (
              <p key={detail.key}>{detail.text}</p>
            ))}
          </details>
        ) : (
          <p key={line.key} className={line.tone ? `v03-log-${line.tone}` : undefined}>
            {line.text}
          </p>
        ),
      )}
    </section>
  );
  return (
    <div className="v03-log-box">
      <strong>{context.t.battleLog}</strong>
      {ordered.slice(0, OPEN_DAYS).map(renderDay)}
      {ordered.length > OPEN_DAYS ? (
        <details className="v03-log-earlier">
          <summary>
            {message(locale, 'logEarlierDays', { count: ordered.length - OPEN_DAYS })}
          </summary>
          {ordered.slice(OPEN_DAYS).map(renderDay)}
        </details>
      ) : null}
    </div>
  );
}
