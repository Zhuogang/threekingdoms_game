import { useState } from 'react';
import { pendingCityGovernance, personalRuleReason } from '../../governance/conquest';
import { previewGovernorTransfer } from '../../governance/appointments';
import { canAppointGovernor } from '../../governance/authority';
import { Button, Select } from '../kit';
import { ConfirmDialog, displayName } from '../shared/app-copy-3';
import { localizeAppMessage } from '../shared/app-copy-2';
import type { GameplayContext } from '../hooks/gameplayView';
import type { V03DomainEvent } from '../../types';

export function activeCityGovernance(context: GameplayContext) {
  const pending = pendingCityGovernance(context.state);
  return (
    pending.find((entry) => entry.acknowledged && entry.id === context.cityGovernanceEventId) ??
    pending.find((entry) => entry.acknowledged && !context.deferredGovernanceIds.includes(entry.id))
  );
}

export function CityGovernancePrompt({ context }: { context: GameplayContext }) {
  const event = activeCityGovernance(context);
  if (!event || context.showReports || context.showWiki || context.confirmation) return null;
  return (
    <CityGovernanceDialog
      key={`${context.campaignSessionRevision}:${event.id}`}
      context={context}
      event={event}
    />
  );
}

function CityGovernanceDialog({
  context,
  event,
}: {
  context: GameplayContext;
  event: V03DomainEvent;
}) {
  const { state, locale } = context;
  const zh = locale === 'zh';
  const city = state.cities.find((entry) => entry.id === event.battleOutcome!.cityId)!;
  const rulerId = state.factions.find(
    (faction) => faction.id === state.playerFactionId,
  )!.leaderOfficerId;
  const candidates = state.officers
    .filter(
      (officer) =>
        officer.alive && officer.factionId === state.playerFactionId && officer.id !== rulerId,
    )
    .sort(
      (a, b) =>
        Number(b.location.kind === 'city' && b.location.cityId === city.id) -
          Number(a.location.kind === 'city' && a.location.cityId === city.id) ||
        b.intellect - a.intellect ||
        a.id.localeCompare(b.id),
    );
  const [choice, setChoice] = useState<'self' | 'governor' | null>(null);
  const [officerId, setOfficerId] = useState(
    candidates.find((officer) => canAppointGovernor(state, city.id, officer.id).ok)?.id ?? '',
  );
  const selfReason = personalRuleReason(state, city.id);
  const preview =
    choice === 'governor' && officerId
      ? previewGovernorTransfer(state, city.id, officerId, context.orderServices)
      : null;
  const cancel = () => {
    context.setDeferredGovernanceIds((ids) => [...ids, event.id]);
    context.setCityGovernanceEventId(null);
  };
  return (
    <ConfirmDialog
      title={
        zh
          ? `如何治理${displayName(city, locale)}？`
          : `How will you govern ${displayName(city, locale)}?`
      }
      detail={
        zh
          ? '选择君主亲治或任命太守。稍后处理时暂由地方班底维持，可从收件箱继续。'
          : 'Choose personal rule or a governor. Defer to local stewardship and resume from the Inbox.'
      }
      cancelLabel={zh ? '稍后处理' : 'Decide later'}
      confirmLabel={zh ? '确认治理方式' : 'Confirm governance'}
      confirmDisabled={
        !choice || (choice === 'self' ? Boolean(selfReason) : !officerId || !preview?.ok)
      }
      onCancel={cancel}
      // Deferring leaves the city to stewardship; it should be a deliberate click.
      escapeCancels={false}
      onConfirm={() => {
        if (!choice) return false;
        const result = context.dispatch({
          type: 'resolveCityGovernance',
          eventId: event.id,
          choice,
          ...(choice === 'governor' ? { officerId } : {}),
        });
        if (!result?.ok) return false;
        context.setCityGovernanceEventId(null);
        context.setCampaignWindowOpen(false);
        context.setSelectedCityId(city.id);
        context.setViewMode(context.activeBattles.length ? 'battle' : 'campaign');
      }}
      body={
        <div className="v03-governance-choice">
          <Button
            aria-pressed={choice === 'self'}
            disabled={Boolean(selfReason)}
            onClick={() => setChoice('self')}
          >
            {zh ? '自任太守（君主亲治）' : 'Govern personally'}
          </Button>
          <p>
            {selfReason
              ? localizeAppMessage(selfReason, locale, state)
              : zh
                ? '切换君主本城，原本城交由地方班底维持；兵员、库存和已用工作点保留。'
                : 'Move the ruler’s capital. The old capital returns to stewardship; personnel, stock and spent work points are preserved.'}
          </p>
          <Button aria-pressed={choice === 'governor'} onClick={() => setChoice('governor')}>
            {zh ? '任命太守' : 'Appoint a governor'}
          </Button>
          {choice === 'governor' ? (
            <>
              <Select
                aria-label={zh ? '新城太守人选' : 'New city governor'}
                value={officerId}
                onChange={(e) => setOfficerId(e.target.value)}
              >
                {!officerId ? (
                  <option value="">{zh ? '选择武将' : 'Choose an officer'}</option>
                ) : null}
                {candidates.map((officer) => {
                  const eligibility = canAppointGovernor(state, city.id, officer.id);
                  return (
                    <option key={officer.id} value={officer.id} disabled={!eligibility.ok}>
                      {displayName(officer, locale)} · {officer.troops} / {officer.wounded}
                      {!eligibility.ok
                        ? ` · ${localizeAppMessage(eligibility.reason ?? '', locale, state)}`
                        : ''}
                    </option>
                  );
                })}
              </Select>
              <p>
                {zh
                  ? '同城武将可保留所部立即就任；跨城调任携带所部，抵达后在月界就任。'
                  : 'Local officers take office immediately with their contingent. Transfers carry the contingent and take office at a monthly boundary after arrival.'}
              </p>
              {preview && !preview.ok ? (
                <p role="status">{localizeAppMessage(preview.reason, locale, state)}</p>
              ) : null}
              {preview?.ok && preview.transfer ? (
                <p>
                  {preview.transfer.route.estimatedDays}{' '}
                  {zh ? '日行程；另备去返路粮' : 'travel days; outbound/return provisions'}{' '}
                  {preview.transfer.food}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      }
    />
  );
}
