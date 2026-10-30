import { message } from '../../i18n';
import type { V03GameState } from '../../types';
import type { V03Locale } from '../../wiki';
import { Button, StatGrid } from '../kit';
import { absoluteDateLabel, displayName } from '../shared/app-copy-3';

/** The end of a campaign, built from the state the victory and elimination rules leave. */
export function CampaignEnd({
  state,
  locale,
  onNewCampaign,
  onViewMap,
}: {
  state: V03GameState;
  locale: V03Locale;
  onNewCampaign: () => void;
  onViewMap: () => void;
}) {
  const won = state.winnerFactionId === state.playerFactionId;
  const fallen = Boolean(
    state.factions.find((faction) => faction.id === state.playerFactionId)?.eliminated,
  );
  const winner = state.factions.find((faction) => faction.id === state.winnerFactionId);
  const unified = state.cities.every((city) => city.factionId === state.playerFactionId);
  const title = won
    ? message(locale, unified ? 'end.victory.unified' : 'end.victory.hegemon')
    : fallen
      ? message(locale, 'end.defeat.fallen')
      : message(locale, 'end.defeat.hegemon', {
          winner: winner ? displayName(winner, locale) : '—',
        });
  const months = Math.floor(state.absoluteDay / 30);
  return (
    <div className="v03-modal-backdrop">
      <section
        className={`v03-outcome-modal v03-campaign-end${won ? ' is-victory' : ' is-defeat'}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={(node) => {
          node?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onViewMap();
          }
        }}
      >
        <span className="v03-kicker">{message(locale, 'end.kicker')}</span>
        <h2 className={`v03-outcome-title ${won ? 'is-victory' : 'is-defeat'}`}>{title}</h2>
        <p>
          {message(locale, 'end.date', {
            date: absoluteDateLabel(state.startYear, state.absoluteDay, locale),
          })}
        </p>
        <StatGrid
          values={[
            {
              label: message(locale, 'end.length'),
              value: message(locale, 'end.months', { months }),
            },
            {
              label: message(locale, 'end.cities'),
              value: state.cities.filter((city) => city.factionId === state.playerFactionId).length,
            },
            {
              label: message(locale, 'end.officers'),
              value: state.officers.filter(
                (officer) =>
                  officer.alive &&
                  officer.factionId === state.playerFactionId &&
                  officer.location.kind !== 'captured',
              ).length,
            },
          ]}
        />
        <div className="v03-proposal-actions">
          <Button variant="primary" onClick={onNewCampaign}>
            {message(locale, 'end.newCampaign')}
          </Button>
          <Button onClick={onViewMap}>{message(locale, 'end.viewMap')}</Button>
        </div>
      </section>
    </div>
  );
}
