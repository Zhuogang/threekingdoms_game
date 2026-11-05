import { useState } from 'react';
import { Button, Input, Select } from '../kit';
import { message } from '../../i18n';
import { pursuitCandidates } from '../../battle';

import type { GameplayContext } from '../hooks/gameplayView';

/**
 * The pursuit decision after an army breaks (B-05): the winner ticks the cavalry that ride the
 * enemy down; the loser names a rear guard. Committing the day without answering uses the defaults
 * (every eligible formation pursues; no rear guard).
 */
export function BattlePursuit({
  context,
}: {
  context: GameplayContext & {
    battleState: NonNullable<GameplayContext['battleState']>;
    activeBattle: NonNullable<GameplayContext['activeBattle']>;
  };
}) {
  const { battleState, locale, dispatch, activeBattle, localizedOfficerName } = context;
  const [picked, setPicked] = useState<string[] | null>(null);
  const [guard, setGuard] = useState('');
  const pending = battleState.pending;
  if (!pending) return null;
  const won = pending.winner === battleState.playerSide;
  const candidates = pursuitCandidates(battleState);
  const chosen = picked ?? candidates.map((unit) => unit.id);
  const answer = () =>
    dispatch({
      type: 'battleAction',
      battleId: activeBattle.id,
      action: won
        ? { type: 'pursuit', pursuers: chosen }
        : { type: 'pursuit', rearGuard: guard || null },
    });
  return (
    <section className="v03-battle-inspection" aria-label={message(locale, 'pursuit.title.won')}>
      <div className="v03-section-title">
        <strong>{message(locale, won ? 'pursuit.title.won' : 'pursuit.title.lost')}</strong>
      </div>
      <p className="v03-muted">{message(locale, won ? 'pursuit.hint.won' : 'pursuit.hint.lost')}</p>
      {won ? (
        candidates.length ? (
          candidates.map((unit) => (
            <label key={unit.id} className="v03-pursuit-choice">
              <Input
                type="checkbox"
                checked={chosen.includes(unit.id)}
                onChange={(event) =>
                  setPicked(
                    event.target.checked
                      ? [...chosen, unit.id]
                      : chosen.filter((id) => id !== unit.id),
                  )
                }
              />{' '}
              {localizedOfficerName(unit.name)} · {unit.troops.toLocaleString()}
            </label>
          ))
        ) : (
          <p className="v03-muted">{message(locale, 'pursuit.none')}</p>
        )
      ) : (
        <Select value={guard} onChange={(event) => setGuard(event.target.value)}>
          <option value="">{message(locale, 'pursuit.noRearGuard')}</option>
          {candidates.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {localizedOfficerName(unit.name)} · {unit.morale}%
            </option>
          ))}
        </Select>
      )}
      <Button type="button" onClick={answer}>
        {message(locale, 'pursuit.confirm')}
      </Button>
    </section>
  );
}
