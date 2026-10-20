import { Gavel, Handshake, Unlock } from 'lucide-react';
import { factionOf } from '../content/scenario';
import { getActionInfo, getPersuadeChance } from '../game/campaign';
import type { City, GameCommand, GameState } from '../game/types';
import { useI18n } from '../i18n';
import Portrait from './Portrait';

/** Captives held in a friendly city: recruit, release or execute (the ruler's choice). */
export default function PrisonerPanel({
  state,
  city,
  execute,
}: {
  state: GameState;
  city: City;
  execute: (command: GameCommand) => boolean;
}) {
  const { t, tx } = useI18n();
  const prisoners = state.officers.filter(
    (o) =>
      o.captive &&
      o.cityId === city.id &&
      o.factionId !== state.playerFactionId &&
      o.fate === 'active',
  );
  if (!prisoners.length) return null;
  const adviser = state.officers
    .filter(
      (o) =>
        o.cityId === city.id &&
        o.factionId === state.playerFactionId &&
        !o.captive &&
        !o.busy &&
        o.fate === 'active',
    )
    .sort((a, b) => b.intellect - a.intellect)[0];
  return (
    <section className="prisoner-panel" aria-label={t('Prisoners')}>
      <div className="section-heading">
        <h3>{t('Prisoners')}</h3>
        <span>{prisoners.length}</span>
      </div>
      {prisoners.map((prisoner) => {
        const chance = adviser ? getPersuadeChance(state, adviser.id, prisoner.id) : null;
        const info = adviser
          ? getActionInfo(state, 'persuade', city.id, adviser.id)
          : { reason: 'Choose one of your serving officers in this city.' };
        return (
          <div className="prisoner" key={prisoner.id}>
            <Portrait officerId={prisoner.id} />
            <span>
              <strong>{tx(prisoner.name)}</strong>
              <small>
                {tx(factionOf(state, prisoner.factionId)?.name ?? '')} · {t('Loyalty')}{' '}
                {prisoner.loyalty}
              </small>
            </span>
            <div className="prisoner-actions">
              <button
                disabled={!adviser || !!info.reason || chance === null}
                title={tx(info.reason ?? '')}
                onClick={() =>
                  adviser &&
                  execute({
                    type: 'action',
                    action: 'persuade',
                    cityId: city.id,
                    officerId: adviser.id,
                    targetId: prisoner.id,
                  })
                }
              >
                <Handshake size={14} />
                {t('Recruit')}
                {chance !== null && <small> {chance}%</small>}
              </button>
              <button
                onClick={() =>
                  execute({
                    type: 'prisoner',
                    cityId: city.id,
                    prisonerId: prisoner.id,
                    decision: 'release',
                  })
                }
              >
                <Unlock size={14} />
                {t('Release')}
              </button>
              <button
                className="danger"
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        'Execute {name}? This cannot be undone, and your officers will be uneasy.',
                        {
                          name: prisoner.name,
                        },
                      ),
                    )
                  )
                    execute({
                      type: 'prisoner',
                      cityId: city.id,
                      prisonerId: prisoner.id,
                      decision: 'execute',
                    });
                }}
              >
                <Gavel size={14} />
                {t('Execute')}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
