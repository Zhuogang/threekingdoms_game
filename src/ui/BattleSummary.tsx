import { ArrowRight, Coins, Flag, Shield, Swords, Wheat } from 'lucide-react';
import { factionOf } from '../content/scenario';
import type { BattleSummary as Summary, GameState } from '../game/types';
import { useI18n } from '../i18n';

const number = (n: number) => new Intl.NumberFormat('en').format(n);

/** Did the player's side come out ahead? Draws (a raid that held) favor the defender. */
export function playerWon(summary: Summary, playerFactionId: string): boolean {
  const attacker = summary.attackerId === playerFactionId;
  const attackerWon = summary.outcome === 'captured' || summary.outcome === 'raided';
  return attacker ? attackerWon : !attackerWon;
}

/** The post-battle recap: casualties, captured officers and any loot. */
export default function BattleSummary({
  state,
  summary,
  onFocusCity,
  onClose,
}: {
  state: GameState;
  summary: Summary;
  onFocusCity: (cityId: string) => void;
  onClose: () => void;
}) {
  const { t, tx } = useI18n();
  const city = state.cities.find((c) => c.id === summary.targetId);
  const attacker = factionOf(state, summary.attackerId)?.name ?? 'The garrison';
  const defender = factionOf(state, summary.defenderId)?.name ?? 'The garrison';
  const won = playerWon(summary, state.playerFactionId);
  const mine = summary.attackerId === state.playerFactionId ? 'attacker' : 'defender';
  const theirs = mine === 'attacker' ? 'defender' : 'attacker';
  const headline =
    summary.outcome === 'raided'
      ? 'The raid on {city} succeeded.'
      : summary.outcome === 'captured'
        ? 'The battle for {city} ended in a capture.'
        : 'The battle for {city} was held.';
  const prisoners = summary.captured
    .map((id) => state.officers.find((o) => o.id === id))
    .filter((o) => !!o);
  return (
    <div className="battle-summary" data-testid="battle-summary">
      <p className="dialog-copy">
        {t(headline, { city: city?.name ?? '' })}{' '}
        <strong>{t(won ? 'A victory for your banner.' : 'A setback for your banner.')}</strong>
      </p>
      <div className="summary-grid">
        <div>
          <span className="eyebrow">{t('ATTACKER')}</span>
          <strong>{tx(attacker)}</strong>
          <small>
            <Swords size={13} /> {number(summary.casualties.attacker)} {t('casualties')}
          </small>
        </div>
        <div>
          <span className="eyebrow">{t('DEFENDER')}</span>
          <strong>{tx(defender)}</strong>
          <small>
            <Shield size={13} /> {number(summary.casualties.defender)} {t('casualties')}
          </small>
        </div>
        <div>
          <span className="eyebrow">{t('DURATION')}</span>
          <strong>
            {t(summary.days === 1 ? '{count} day' : '{count} days', { count: summary.days })}
          </strong>
          <small>
            <Flag size={13} />{' '}
            {t(
              summary.intent === 'conquer'
                ? 'Conquest'
                : summary.intent === 'sack'
                  ? 'Sack'
                  : 'Raid',
            )}
          </small>
        </div>
      </div>
      <p className="subtle">
        {t('Your losses: {mine}. Enemy losses: {theirs}.', {
          mine: number(summary.casualties[mine]),
          theirs: number(summary.casualties[theirs]),
        })}
      </p>
      {summary.loot && (
        <p className="summary-loot" data-testid="summary-loot">
          <Coins size={15} /> {number(summary.loot.gold)} {t('gold')} <Wheat size={15} />{' '}
          {number(summary.loot.food)} {t('food')}
        </p>
      )}
      {prisoners.length > 0 && (
        <div className="summary-prisoners">
          <span className="eyebrow">{t('OFFICERS CAPTURED')}</span>
          <ul>
            {prisoners.map((o) => (
              <li key={o!.id}>
                {tx(o!.name)} · {tx(factionOf(state, o!.factionId)?.name ?? '')}
                {o!.captive && o!.cityId ? (
                  <>
                    {' · '}
                    {tx(state.cities.find((c) => c.id === o!.cityId)?.name)}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="subtle">
            {t('Prisoners can be recruited, released or executed from the city that holds them.')}
          </p>
        </div>
      )}
      <div className="summary-actions">
        {city && (
          <button
            className="text-button"
            onClick={() => {
              onFocusCity(city.id);
              onClose();
            }}
          >
            {t('View {city}', { city: city.name })}
            <ArrowRight size={14} />
          </button>
        )}
        <button className="primary-button" onClick={onClose}>
          {t('Continue')}
          <ArrowRight size={17} />
        </button>
      </div>
    </div>
  );
}
