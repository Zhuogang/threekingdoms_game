import { message } from '../../i18n';
import { useState } from 'react';
import type { GameplayContext } from '../hooks/gameplayView';
import { prisonerHolder, prisonerRecruitChance } from '../../campaign/prisoners';
import { Button, Select, Panel } from '../kit';
import { ConfirmDialog, displayName } from '../shared/app-copy-3';

export function PrisonerPanel({ context }: { context: GameplayContext }) {
  const { state, selectedCity, locale, dispatch } = context;
  const [exchangeId, setExchangeId] = useState('');
  const [execution, setExecution] = useState<string | null>(null);
  const prisoners = state.officers.filter(
    (officer) =>
      officer.alive &&
      officer.location.kind === 'captured' &&
      officer.location.cityId === selectedCity?.id,
  );
  if (!prisoners.length) return null;
  return (
    <Panel title={message(locale, 'ui.prisoners.104')}>
      {prisoners.map((officer) => {
        const held = prisonerHolder(state, officer) === state.playerFactionId;
        const disabled = officer.prisonerActionMonth === state.monthIndex;
        const exchanges = state.officers.filter(
          (entry) =>
            entry.alive &&
            entry.factionId === state.playerFactionId &&
            prisonerHolder(state, entry) === officer.factionId,
        );
        return (
          <article className="v03-order-card" key={officer.id}>
            <strong>{displayName(officer, locale)}</strong>
            <p>
              {message(locale, 'ui.loyalty.52')} {officer.loyalty} ·{' '}
              {message(locale, 'ui.recruit.chance.105')} {prisonerRecruitChance(officer)}%
            </p>
            {held ? (
              <>
                <Button
                  disabled={disabled}
                  onClick={() =>
                    dispatch({ type: 'prisonerAction', officerId: officer.id, action: 'release' })
                  }
                >
                  {message(locale, 'ui.release.106')}
                </Button>
                <Button
                  disabled={disabled}
                  onClick={() =>
                    dispatch({ type: 'prisonerAction', officerId: officer.id, action: 'recruit' })
                  }
                >
                  {message(locale, 'ui.recruit.prisoner.107')}
                </Button>
                <Select
                  aria-label={message(locale, 'ui.exchange.prisoner.108')}
                  value={exchangeId}
                  onChange={(event) => setExchangeId(event.target.value)}
                >
                  <option value="">—</option>
                  {exchanges.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {displayName(entry, locale)}
                    </option>
                  ))}
                </Select>
                <Button
                  disabled={disabled || !exchanges.some((entry) => entry.id === exchangeId)}
                  onClick={() =>
                    dispatch({
                      type: 'prisonerAction',
                      officerId: officer.id,
                      action: 'exchange',
                      exchangeOfficerId: exchangeId,
                    })
                  }
                >
                  {message(locale, 'ui.exchange.109')}
                </Button>
                <Button
                  variant="danger"
                  disabled={disabled}
                  onClick={() => setExecution(officer.id)}
                >
                  {message(locale, 'ui.execute.110')}
                </Button>
                {disabled ? (
                  <small>{message(locale, 'ui.available.again.next.month.111')}</small>
                ) : null}
              </>
            ) : null}
          </article>
        );
      })}
      {execution ? (
        <ConfirmDialog
          title={message(locale, 'ui.execute.prisoner.112')}
          detail={message(locale, 'ui.this.officer.will.die.permanently.113')}
          cancelLabel={message(locale, 'ui.cancel.62')}
          confirmLabel={message(locale, 'ui.execute.110')}
          onCancel={() => setExecution(null)}
          onConfirm={() => {
            dispatch({ type: 'prisonerAction', officerId: execution, action: 'execute' });
            setExecution(null);
          }}
        />
      ) : null}
    </Panel>
  );
}
