import { useRef } from 'react';
import { message } from '../../i18n';
import { getV03AllianceChance, hasProposedV03AllianceThisMonth } from '../../campaign/diplomacy';
import { isV03AllianceActive } from '../../campaign/monthly-systems';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button, StatGrid } from '../kit';
import { displayName } from '../shared/app-copy-3';

export type DiplomacyPage =
  | { kind: 'list' }
  | { kind: 'faction' | 'propose' | 'break'; id: string }
  | { kind: 'invitation'; id: string };
export function diplomacyParent(page: DiplomacyPage): DiplomacyPage {
  return page.kind === 'propose' || page.kind === 'break'
    ? { kind: 'faction', id: page.id }
    : { kind: 'list' };
}
export function diplomacyTitle(context: GameplayContext, page: DiplomacyPage) {
  if (page.kind === 'list') return context.t.diplomacy;
  if (page.kind === 'invitation') return context.t.coalitionInvitation;
  if (page.kind === 'propose') return context.t.proposeAlliance;
  if (page.kind === 'break') return context.t.breakAlliance;
  const faction = context.diplomacyTargets.find((entry) => entry.id === page.id);
  return faction ? displayName(faction, context.locale) : context.t.diplomacy;
}
export function DiplomacyFlow({
  context,
  page,
  onNavigate,
}: {
  context: GameplayContext;
  page: DiplomacyPage;
  onNavigate: (page: DiplomacyPage, preserveFeedback?: boolean) => void;
}) {
  const { state, locale, t, diplomacyTargets } = context;
  const submitted = useRef(false);
  const ally = (id: string) =>
    isV03AllianceActive(state.alliances, state.playerFactionId, id, state.monthIndex);
  const faction = 'id' in page ? diplomacyTargets.find((entry) => entry.id === page.id) : undefined;
  const send = (command: Parameters<GameplayContext['dispatch']>[0], next: DiplomacyPage) => {
    if (submitted.current) return;
    submitted.current = true;
    const result = context.dispatch(command);
    if (result?.ok) onNavigate(next, true);
    else submitted.current = false;
  };
  if (page.kind === 'list')
    return (
      <section className="v03-diplomacy v03-diplomacy-menu">
        <p className="v03-step-intro">{message(locale, 'flow.chooseFaction')}</p>
        <div className="v03-roster-list">
          {diplomacyTargets.map((entry) => (
            <Button
              className="v03-step-choice"
              key={entry.id}
              aria-label={displayName(entry, locale)}
              onClick={() => onNavigate({ kind: 'faction', id: entry.id })}
            >
              <span>
                <strong>{displayName(entry, locale)}</strong>
                <small>
                  {ally(entry.id) ? t.activeAlliance : message(locale, 'flow.noAlliance')}
                </small>
              </span>
              <span aria-hidden>→</span>
            </Button>
          ))}
        </div>
        {!diplomacyTargets.length ? (
          <p>{message(locale, 'ui.no.active.faction.is.available.for.diplomacy.58')}</p>
        ) : null}
        {state.coalitionInvitations
          .filter(
            (entry) =>
              entry.expiresMonthIndex > state.monthIndex &&
              entry.targetFactionId !== state.playerFactionId,
          )
          .map((invitation) => (
            <Button
              className="v03-step-choice v03-coalition-entry"
              key={invitation.id}
              onClick={() => onNavigate({ kind: 'invitation', id: invitation.id })}
            >
              {t.coalitionInvitation}
              <span aria-hidden>→</span>
            </Button>
          ))}
      </section>
    );
  if (page.kind === 'invitation') {
    const invitation = state.coalitionInvitations.find((entry) => entry.id === page.id);
    const target = state.factions.find((entry) => entry.id === invitation?.targetFactionId);
    return (
      <section className="v03-diplomacy v03-diplomacy-confirm">
        <p>{message(locale, 'flow.coalitionHint')}</p>
        {target ? (
          <p>
            {message(locale, 'flow.coalitionTarget')}: {displayName(target, locale)}
          </p>
        ) : null}
        <p>
          {message(locale, 'flow.coalitionMembers')}:{' '}
          {invitation?.memberFactionIds
            .map((id) => {
              const member = state.factions.find((entry) => entry.id === id);
              return member ? displayName(member, locale) : id;
            })
            .join(' · ')}
        </p>
        <p>{message(locale, 'flow.allianceDuration')}</p>
        <Button
          variant="primary"
          disabled={
            !invitation ||
            invitation.expiresMonthIndex <= state.monthIndex ||
            state.phase === 'finished'
          }
          onClick={() =>
            send({ type: 'acceptCoalitionInvitation', invitationId: page.id }, { kind: 'list' })
          }
        >
          {t.joinCoalition}
        </Button>
      </section>
    );
  }
  if (!faction)
    return <p>{message(locale, 'ui.no.active.faction.is.available.for.diplomacy.58')}</p>;
  const treaty = state.alliances.find(
    (entry) =>
      [entry.a, entry.b].includes(state.playerFactionId) &&
      [entry.a, entry.b].includes(faction.id) &&
      ally(faction.id),
  );
  const allied = Boolean(treaty);
  const proposalUsed = hasProposedV03AllianceThisMonth(state, faction.id);
  const proposalHint =
    locale === 'zh'
      ? '对同一势力每月只能提议一次；本月解盟后也须等下月再提议。'
      : 'One proposal per faction per month. After breaking a treaty, wait until next month to propose again.';
  if (page.kind === 'faction')
    return (
      <section className="v03-diplomacy v03-faction-detail">
        <StatGrid
          values={[
            {
              label: t.territory,
              value: state.cities.filter((city) => city.factionId === faction.id).length,
            },
            {
              label: t.activeAlliance,
              value: allied
                ? `${treaty!.expiresMonthIndex - state.monthIndex} ${t.monthsRemaining}`
                : message(locale, 'flow.noAlliance'),
            },
          ]}
        />
        <Button
          className="v03-step-choice"
          disabled={!allied && proposalUsed}
          onClick={() => onNavigate({ kind: allied ? 'break' : 'propose', id: faction.id })}
        >
          {allied ? t.breakAlliance : t.proposeAlliance}
          <span aria-hidden>→</span>
        </Button>
        <p className="v03-muted">{proposalHint}</p>
        <Button variant="ghost" onClick={() => context.openWiki('diplomacy')}>
          {t.wiki}
        </Button>
      </section>
    );
  return (
    <section className="v03-diplomacy v03-diplomacy-confirm">
      <p>{displayName(faction, locale)}</p>
      {page.kind === 'propose' ? (
        <>
          <StatGrid
            values={[
              { label: t.acceptChance, value: `${getV03AllianceChance(state, faction.id)}%` },
            ]}
          />
          <p>{message(locale, 'flow.allianceDuration')}</p>
          <p className="v03-muted">{message(locale, 'flow.allianceHint')}</p>
          <p className="v03-muted">{proposalHint}</p>
        </>
      ) : (
        <p>{message(locale, 'flow.breakAllianceHint')}</p>
      )}
      <Button
        variant={page.kind === 'break' ? 'danger' : 'primary'}
        disabled={
          state.phase === 'finished' || (page.kind === 'propose' ? allied || proposalUsed : !allied)
        }
        onClick={() =>
          send(
            {
              type: page.kind === 'propose' ? 'proposeAlliance' : 'breakAlliance',
              targetFactionId: faction.id,
            },
            { kind: 'faction', id: faction.id },
          )
        }
      >
        {page.kind === 'propose' ? t.propose : t.breakAlliance}
      </Button>
    </section>
  );
}
