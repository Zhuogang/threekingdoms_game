import { useMemo, useRef } from 'react';
import { previewRequisition, previewCampaignDirective } from '../../governance/orders';
import { message } from '../../i18n';
import type { GameplayContext } from '../hooks/gameplayView';
import { Button, Field, Input } from '../kit';
import { deadlineFromDaysInput, displayName } from '../shared/app-copy-3';
import { OrderForm } from './OrderForm';
import { OrderPreview } from './OrderPreview';

export type SupplyPage =
  | 'supplies'
  | 'supply-target'
  | 'supply-form'
  | 'supply-review'
  | 'supply-proposal'
  | 'supply-reduce';
export function SupplyFlow({
  context,
  page,
  onNavigate,
}: {
  context: GameplayContext & { selectedCity: NonNullable<GameplayContext['selectedCity']> };
  page: SupplyPage;
  onNavigate: (page: SupplyPage) => void;
}) {
  const { state, selectedCity, locale, t, orderPreview, orderPreviewOrder: order } = context;
  const draftPreview = useMemo(
    () =>
      page !== 'supply-review'
        ? null
        : context.requestKind === 'resource'
          ? previewRequisition(
              state,
              {
                sourceCityId: selectedCity.id,
                targetCityId: context.targetCityId,
                requested: {
                  gold: context.requestedGold,
                  food: context.requestedFood,
                  troops: context.requestedResourceTroops,
                },
                requestedByDay: deadlineFromDaysInput(state.absoluteDay, context.requestedByDay),
              },
              context.orderServices,
            )
          : previewCampaignDirective(
              state,
              {
                sourceCityId: selectedCity.id,
                targetCityId: context.targetCityId,
                requestedTroops: context.requestedTroops,
                intent: context.intent,
                requestedByDay: deadlineFromDaysInput(state.absoluteDay, context.requestedByDay),
              },
              context.orderServices,
            ),
    [context, page, state, selectedCity.id],
  );
  const submitted = useRef(false);
  const pending =
    order &&
    order.sourceCityId === selectedCity.id &&
    ['proposed', 'waiting'].includes(order.status);
  const kind = order && 'requestedTroops' in order ? 'campaign' : 'resource';
  const cargo =
    order && 'proposed' in order
      ? (context.reducedCargoByOrder[order.id] ?? order.proposed)
      : { gold: 0, food: 0, troops: 0 };
  const troops =
    order && 'proposedTroops' in order
      ? (context.reducedTroopsByOrder[order.id] ?? order.proposedTroops)
      : 0;
  const answer = (choice: 'accept' | 'reduce' | 'wait' | 'cancel') => {
    if (!order || submitted.current) return;
    submitted.current = true;
    const result = context.answerOrder(
      order.id,
      kind,
      choice,
      choice === 'reduce' ? (kind === 'resource' ? cargo : troops) : undefined,
    );
    if (result?.ok) {
      context.setOrderPreview(null);
      onNavigate('supplies');
      context.setFeedback({ key: `flow.orderResult.${choice}` });
    } else submitted.current = false;
  };
  if (page === 'supplies')
    return (
      <section className="v03-supply-menu">
        <p className="v03-step-intro">{message(locale, 'flow.chooseRequest')}</p>
        <div className="v03-work-menu officer-work-menu">
          {(['resource', 'campaign'] as const).map((kind) => (
            <Button
              className="v03-step-choice"
              key={kind}
              onClick={() => {
                context.setRequestKind(kind);
                context.setTargetCityId('');
                onNavigate('supply-target');
              }}
            >
              <strong>{kind === 'resource' ? t.requestSupplies : t.orderMarch}</strong>
              <span aria-hidden>→</span>
            </Button>
          ))}
        </div>
        {pending ? (
          <Button
            className="v03-step-choice v03-pending-proposal"
            onClick={() => onNavigate('supply-proposal')}
          >
            {message(locale, 'flow.resumeProposal')} · {context.locationName(order.targetCityId)}
            <span aria-hidden>→</span>
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => context.setCampaignTab('orders')}>
          {message(locale, 'flow.orders')}
        </Button>
      </section>
    );
  if (page === 'supply-target')
    return (
      <section className="v03-supply-targets">
        <p className="v03-step-intro">
          {message(locale, 'flow.chooseSupplyTarget', { city: displayName(selectedCity, locale) })}
        </p>
        <div className="v03-roster-list">
          {context.availableTargets.map((city) => (
            <Button
              className="v03-step-choice"
              aria-label={displayName(city, locale)}
              key={city.id}
              onClick={() => {
                context.setTargetCityId(city.id);
                onNavigate('supply-form');
              }}
            >
              <strong>{displayName(city, locale)}</strong>
              <span aria-hidden>→</span>
            </Button>
          ))}
        </div>
        {!context.availableTargets.length ? <p>{message(locale, 'flow.noTargets')}</p> : null}
      </section>
    );
  if (page === 'supply-form')
    return (
      <section className="v03-supply-form">
        <p className="v03-step-intro">{message(locale, 'flow.requestHint')}</p>
        <OrderForm
          context={context}
          fixedDestination
          showPreview={false}
          onReview={() => onNavigate('supply-review')}
        />
      </section>
    );
  if (page === 'supply-review' && draftPreview)
    return (
      <section className="v03-supply-review">
        <p>
          {context.locationName(selectedCity.id)} → {context.locationName(context.targetCityId)}
        </p>
        <p className="v03-step-intro">{message(locale, 'flow.reviewRequestHint')}</p>
        <OrderPreview
          context={{
            ...context,
            orderPreview: { orderId: 'draft', preview: draftPreview },
            orderPreviewOrder: undefined,
            orderPreviewSourceCity: selectedCity,
            orderPreviewTroops:
              'executable' in draftPreview
                ? draftPreview.executable.troops
                : draftPreview.executableTroops,
          }}
        />
        <Button
          variant="primary"
          disabled={state.phase === 'finished'}
          onClick={() => {
            if (submitted.current) return;
            submitted.current = true;
            const result =
              context.requestKind === 'resource'
                ? context.submitResourceOrder()
                : context.submitCampaignOrder();
            if (!result?.ok) {
              submitted.current = false;
              return;
            }
            const created =
              result.state.requisitions.find((entry) => entry.id === result.orderId) ??
              result.state.directives.find((entry) => entry.id === result.orderId);
            if (created && ['proposed', 'waiting'].includes(created.status))
              onNavigate('supply-proposal');
            else {
              context.setOrderPreview(null);
              onNavigate('supplies');
              context.setFeedback({ key: 'flow.orderDispatched' });
            }
          }}
        >
          {context.requestKind === 'resource' ? t.request : t.issue}
        </Button>
      </section>
    );
  if (!orderPreview || !pending) return <p>{message(locale, 'flow.noProposal')}</p>;
  if (page === 'supply-reduce')
    return (
      <section className="v03-supply-reduce">
        <p>
          {context.locationName(order.sourceCityId)} → {context.locationName(order.targetCityId)}
        </p>
        <p className="v03-step-intro">{message(locale, 'flow.reduceHint')}</p>
        {kind === 'resource' && 'proposed' in order ? (
          <div className="v03-order-fields">
            {(['gold', 'food', 'troops'] as const).map((key) => (
              <Field
                key={key}
                label={key === 'gold' ? t.cargoGold : key === 'food' ? t.cargoFood : t.cargoTroops}
              >
                <Input
                  type="number"
                  min={0}
                  max={order.proposed[key]}
                  value={cargo[key]}
                  onChange={(event) =>
                    context.setReducedCargoByOrder((current) => ({
                      ...current,
                      [order.id]: { ...cargo, [key]: Number(event.target.value) },
                    }))
                  }
                />
              </Field>
            ))}
          </div>
        ) : (
          <Field label={`${t.reduceTo} · ${t.troops}`}>
            <Input
              type="number"
              min={1}
              max={'proposedTroops' in order ? order.proposedTroops : 0}
              value={troops}
              onChange={(event) =>
                context.setReducedTroopsByOrder((current) => ({
                  ...current,
                  [order.id]: Number(event.target.value),
                }))
              }
            />
          </Field>
        )}
        <Button
          variant="primary"
          disabled={state.phase === 'finished'}
          onClick={() => answer('reduce')}
        >
          {t.acceptReduced}
        </Button>
      </section>
    );
  return (
    <section className="v03-supply-proposal">
      <p className="v03-step-intro">{message(locale, 'flow.proposalHint')}</p>
      <OrderPreview context={{ ...context, orderPreview }} />
      <div className="v03-proposal-actions">
        <Button
          variant="primary"
          disabled={state.phase === 'finished'}
          onClick={() => answer('accept')}
        >
          {t.accept}
        </Button>
        <Button onClick={() => onNavigate('supply-reduce')}>{t.acceptReduced}</Button>
        <Button disabled={state.phase === 'finished'} onClick={() => answer('wait')}>
          {t.wait}
        </Button>
        <Button disabled={state.phase === 'finished'} onClick={() => answer('cancel')}>
          {t.cancel}
        </Button>
      </div>
    </section>
  );
}
