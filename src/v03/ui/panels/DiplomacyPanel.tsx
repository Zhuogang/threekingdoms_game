import { displayName } from '../shared/app-copy-3';
import { Button, Select } from '../kit';
import { message } from '../../i18n';

import { getV03AllianceChance, hasProposedV03AllianceThisMonth } from '../../campaign/diplomacy';
import { isV03AllianceActive } from '../../campaign/monthly-systems';

import type { GameplayContext } from '../hooks/gameplayView';

export function DiplomacyPanel({
  context,
}: {
  context: GameplayContext & { state: NonNullable<GameplayContext['state']> };
}) {
  const {
    t,
    openWiki,
    state,
    dispatch,
    diplomacyTargets,
    locale,
    diplomacyTarget,
    setDiplomacyTargetId,
    playerAlliances,
  } = context;
  return (
    <section className="v03-diplomacy">
      <div className="v03-section-title">
        <h3>{t.diplomacy}</h3>
        <Button type="button" className="text-button" onClick={() => openWiki('diplomacy')}>
          ?
        </Button>
      </div>
      {state.coalitionInvitations
        .filter(
          (invitation) =>
            invitation.expiresMonthIndex > state.monthIndex &&
            invitation.targetFactionId !== state.playerFactionId,
        )
        .map((invitation) => (
          <div className="v03-order-card" key={invitation.id}>
            <strong>{t.coalitionInvitation}</strong>
            <Button
              type="button"
              onClick={() =>
                dispatch({
                  type: 'acceptCoalitionInvitation',
                  invitationId: invitation.id,
                })
              }
            >
              {t.joinCoalition}
            </Button>
          </div>
        ))}
      {diplomacyTargets.map((faction) => {
        const treaty = state.alliances.find(
          (alliance) =>
            ((alliance.a === state.playerFactionId && alliance.b === faction.id) ||
              (alliance.b === state.playerFactionId && alliance.a === faction.id)) &&
            isV03AllianceActive(
              state.alliances,
              state.playerFactionId,
              faction.id,
              state.monthIndex,
            ),
        );
        const otherId = treaty ? (treaty.a === state.playerFactionId ? treaty.b : treaty.a) : '';
        if (treaty && otherId === faction.id) {
          return (
            <div className="v03-order-card" key={faction.id}>
              <strong>
                {displayName(faction, locale)} · {t.activeAlliance}
              </strong>
              <small>
                {treaty.expiresMonthIndex - state.monthIndex} {t.monthsRemaining}
              </small>
              <Button
                type="button"
                onClick={() => dispatch({ type: 'breakAlliance', targetFactionId: faction.id })}
              >
                {t.breakAlliance}
              </Button>
            </div>
          );
        }
        return null;
      })}
      {diplomacyTarget ? (
        <>
          <label className="v03-field">
            {t.proposeAlliance}
            <Select
              value={diplomacyTarget.id}
              onChange={(event) => setDiplomacyTargetId(event.target.value)}
            >
              {diplomacyTargets.map((faction) => (
                <option key={faction.id} value={faction.id}>
                  {displayName(faction, locale)}
                </option>
              ))}
            </Select>
          </label>
          <small className="v03-muted">
            {t.acceptChance}: {getV03AllianceChance(state, diplomacyTarget.id)}%
          </small>
          <Button
            type="button"
            disabled={
              state.phase === 'finished' ||
              hasProposedV03AllianceThisMonth(state, diplomacyTarget.id) ||
              playerAlliances.some((alliance) =>
                [alliance.a, alliance.b].includes(diplomacyTarget.id),
              )
            }
            onClick={() =>
              dispatch({ type: 'proposeAlliance', targetFactionId: diplomacyTarget.id })
            }
          >
            {t.propose}
          </Button>
          {hasProposedV03AllianceThisMonth(state, diplomacyTarget.id) ? (
            <p className="v03-muted">
              {locale === 'zh'
                ? '下月可再次向该势力提议结盟。'
                : 'You can propose to this faction again next month.'}
            </p>
          ) : null}
        </>
      ) : (
        <p className="v03-muted">
          {message(locale, 'ui.no.active.faction.is.available.for.diplomacy.58')}
        </p>
      )}
    </section>
  );
}
