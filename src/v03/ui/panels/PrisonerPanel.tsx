import { message } from '../../i18n';
import { useState } from 'react';
import type { GameplayContext } from '../hooks/gameplayView';
import {
  prisonerHolder,
  prisonerRecruitChance,
  prisonerReturnPlan,
} from '../../campaign/prisoners';
import { TroopProgress } from './TroopProgress';
import { OfficerProfile } from './OfficerProfile';
import { Button, Select, Panel } from '../kit';
import { ConfirmDialog, displayName } from '../shared/app-copy-3';

export function PrisonerPanel({
  context,
  officerId,
  onComplete,
}: {
  context: GameplayContext;
  officerId?: string;
  onComplete?: () => void;
}) {
  const { state, selectedCity, locale } = context;
  const dispatch = (
    command: Extract<Parameters<GameplayContext['dispatch']>[0], { type: 'prisonerAction' }>,
  ) => {
    const result = context.dispatch(command);
    if (result?.ok) {
      const decision = result.state.events
        .filter((event) => event.code === 'prisoner.decision')
        .at(-1);
      context.setFeedback({
        key:
          decision?.params?.accepted === false
            ? 'flow.prisonerRefused'
            : `flow.prisoner.${command.action}`,
      });
      onComplete?.();
    }
    return result;
  };
  const [exchangeId, setExchangeId] = useState('');
  const [execution, setExecution] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    officerId: string;
    action: 'release' | 'recruit' | 'exchange';
  } | null>(null);
  const prisoners = state.officers.filter(
    (officer) =>
      officer.alive &&
      (!officerId || officer.id === officerId) &&
      officer.location.kind === 'captured' &&
      !officer.location.journeyId &&
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
            {officerId ? <OfficerProfile state={state} id={officer.id} locale={locale} /> : null}
            <strong>{displayName(officer, locale)}</strong>
            <p>
              {message(locale, 'ui.loyalty.52')} {officer.loyalty} ·{' '}
              {message(locale, 'ui.recruit.chance.105')} {prisonerRecruitChance(officer)}%
            </p>
            <TroopProgress unit={officer} locale={locale} />
            <p>
              {locale === 'zh'
                ? `被俘人员：健全 ${officer.troops}、伤兵 ${officer.wounded}，均不能参战。`
                : `Captive personnel: ${officer.troops} healthy, ${officer.wounded} wounded; none are available for battle.`}
            </p>
            {held ? (
              <>
                <Button onClick={() => setPending({ officerId: officer.id, action: 'release' })}>
                  {message(locale, 'ui.release.106')}
                </Button>
                <Button
                  disabled={disabled}
                  onClick={() => setPending({ officerId: officer.id, action: 'recruit' })}
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
                    setPending({
                      officerId: officer.id,
                      action: 'exchange',
                    })
                  }
                >
                  {message(locale, 'ui.exchange.109')}
                </Button>
                <Button variant="danger" onClick={() => setExecution(officer.id)}>
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
      {pending
        ? (() => {
            const officer = state.officers.find((entry) => entry.id === pending.officerId)!;
            const plan = prisonerReturnPlan(state, officer);
            const destination = plan ? displayName(plan.city, locale) : '';
            const exchanged = state.officers.find((entry) => entry.id === exchangeId);
            const exchangePlan = exchanged ? prisonerReturnPlan(state, exchanged) : null;
            const detail =
              pending.action === 'recruit'
                ? locale === 'zh'
                  ? `招降成功时健全 ${officer.troops}、伤兵 ${officer.wounded} 人加入，保留兵种与经验；需在己方城市整编 10 个有效日。`
                  : `On success ${officer.troops} healthy and ${officer.wounded} wounded join with their type and XP, requiring ten full city days of reorganization.`
                : pending.action === 'exchange'
                  ? locale === 'zh'
                    ? `成功时归还健全 ${officer.troops}、伤兵 ${officer.wounded} 至${destination}（拨粮 ${plan?.food ?? 0}）；换回健全 ${exchanged?.troops ?? 0}、伤兵 ${exchanged?.wounded ?? 0} 至${exchangePlan ? displayName(exchangePlan.city, locale) : '无可用退路'}（拨粮 ${exchangePlan?.food ?? 0}）。双方真实行军，无论成功与否均消耗本月招降或交换机会。`
                    : `On success return ${officer.troops} healthy / ${officer.wounded} wounded to ${destination} (${plan?.food ?? 0} food), receiving ${exchanged?.troops ?? 0} healthy / ${exchanged?.wounded ?? 0} wounded at ${exchangePlan ? displayName(exchangePlan.city, locale) : 'no usable refuge'} (${exchangePlan?.food ?? 0} food). Both parties travel; both monthly chance attempts are spent even on refusal.`
                  : plan
                    ? locale === 'zh'
                      ? `归还至${destination}，健全 ${officer.troops}、伤兵 ${officer.wounded}；看押城拨粮 ${plan.food}，途中不养伤。`
                      : `Return to ${destination} with ${officer.troops} healthy and ${officer.wounded} wounded. The holding city provides ${plan.food} food; healing pauses in transit.`
                    : locale === 'zh'
                      ? `没有可达归属城市：释放武将为当地自由身，并将 ${officer.troops + officer.wounded} 人解除编制转入人口。`
                      : `No reachable home: release the officer locally and disband ${officer.troops + officer.wounded} personnel into the population.`;
            return (
              <ConfirmDialog
                title={message(
                  locale,
                  pending.action === 'release'
                    ? 'ui.release.106'
                    : pending.action === 'recruit'
                      ? 'ui.recruit.prisoner.107'
                      : 'ui.exchange.109',
                )}
                detail={detail}
                cancelLabel={context.t.cancel}
                confirmLabel={locale === 'zh' ? '确认' : 'Confirm'}
                onCancel={() => setPending(null)}
                onConfirm={() => {
                  const result = dispatch({
                    type: 'prisonerAction',
                    ...pending,
                    ...(pending.action === 'exchange' ? { exchangeOfficerId: exchangeId } : {}),
                  });
                  if (result?.ok) setPending(null);
                }}
              />
            );
          })()
        : null}
      {execution ? (
        <ConfirmDialog
          title={message(locale, 'ui.execute.prisoner.112')}
          detail={`${message(locale, 'ui.this.officer.will.die.permanently.113')} ${locale === 'zh' ? `所部 ${state.officers.find((entry) => entry.id === execution)!.troops + state.officers.find((entry) => entry.id === execution)!.wounded} 人遣散为当地人口，兵员经验永久消失。` : `Disband ${state.officers.find((entry) => entry.id === execution)!.troops + state.officers.find((entry) => entry.id === execution)!.wounded} personnel into local population, permanently losing their soldier XP.`}`}
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
