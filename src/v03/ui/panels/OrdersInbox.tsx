import { Button, Input } from '../kit';
import { orderLifecycle } from '../../governance/order-lifecycle';
import { message } from '../../i18n';

import type { V03JourneyCargo } from '../../types';

import { localizeOrderMessage } from '../shared/app-copy-2';

import type { GameplayContext } from '../hooks/gameplayView';

export function OrdersInbox({
  context,
}: {
  context: GameplayContext & { state: NonNullable<GameplayContext['state']> };
}) {
  const {
    locale,
    t,
    openWiki,
    activeOrders,
    state,
    reducedCargoByOrder,
    reducedTroopsByOrder,
    dispatch,
    setReducedCargoByOrder,
    setReducedTroopsByOrder,
    answerOrder,
  } = context;
  return (
    <section
      className="v03-orders-list v03-backlog-list"
      aria-label={message(locale, 'ui.player.orders.103')}
    >
      <div className="v03-section-title">
        <h3>{t.campaignOrders}</h3>
        <Button type="button" className="text-button" onClick={() => openWiki('requisition')}>
          ?
        </Button>
      </div>
      {activeOrders.length === 0 ? (
        <p className="v03-muted">{t.emptyOrders}</p>
      ) : (
        activeOrders.map((order) => {
          const journey = order.journeyId
            ? state?.journeys.find((entry) => entry.id === order.journeyId)
            : undefined;
          const resourceOrder = order.kind === 'resource';
          const requestedCargo = resourceOrder ? (order.requested as V03JourneyCargo) : null;
          const proposedCargo = resourceOrder ? (order.proposed as V03JourneyCargo) : null;
          const cargoDraft = reducedCargoByOrder[order.id] ??
            proposedCargo ?? { gold: 0, food: 0, troops: 0 };
          const requestedTroopCount = resourceOrder ? 0 : (order.requested as number);
          const proposedTroopCount = resourceOrder ? 0 : (order.proposed as number);
          const troopDraft = reducedTroopsByOrder[order.id] ?? proposedTroopCount;
          const original =
            state.directives.find((entry) => entry.id === order.id) ??
            state.requisitions.find((entry) => entry.id === order.id)!;
          const lifecycle = orderLifecycle(state, original);
          const stages = {
            preparing: { en: 'Preparing', zh: '备战' },
            marching: { en: 'Marching', zh: '行军' },
            'in-battle': { en: 'In battle', zh: '交战' },
            returning: { en: 'Returning', zh: '归程' },
            done: { en: 'Done', zh: '完成' },
          };
          if (lifecycle.stage === 'done')
            return (
              <details key={order.id} className="v03-order-history">
                <summary>
                  {order.source} → {order.target} · {stages.done[locale]}
                </summary>
                <p>{localizeOrderMessage(order.message, locale)}</p>
              </details>
            );
          return (
            <div className="v03-order-card" key={order.id}>
              <strong>
                {order.source} → {order.target}
              </strong>
              <small>
                {stages[lifecycle.stage][locale]}
                {lifecycle.eta !== null
                  ? ` · ${Math.max(0, lifecycle.eta - state.absoluteDay)} ${message(locale, 'ui.days.15')}`
                  : ''}
              </small>
              {lifecycle.stage === 'in-battle' ? (
                <Button
                  onClick={() => {
                    context.setSelectedBattleId(lifecycle.battleId);
                    context.setViewMode('battle');
                  }}
                >
                  {message(locale, 'ui.open.battle.397')}
                </Button>
              ) : null}
              <small>{localizeOrderMessage(order.message, locale)}</small>
              {resourceOrder && requestedCargo && proposedCargo ? (
                <small>
                  {t.requested}: {t.gold} {requestedCargo.gold.toLocaleString()} · {t.food}{' '}
                  {requestedCargo.food.toLocaleString()} · {t.troops}{' '}
                  {requestedCargo.troops.toLocaleString()}
                  <br />
                  {t.planAvailable}: {t.gold} {proposedCargo.gold.toLocaleString()} · {t.food}{' '}
                  {proposedCargo.food.toLocaleString()} · {t.troops}{' '}
                  {proposedCargo.troops.toLocaleString()}
                </small>
              ) : !resourceOrder ? (
                <small>
                  {t.requested}: {requestedTroopCount.toLocaleString()} {t.troops} ·{' '}
                  {t.planAvailable}: {proposedTroopCount.toLocaleString()} {t.troops}
                </small>
              ) : null}
              {journey && ['outbound', 'waiting'].includes(journey.status) ? (
                <div className="v03-row">
                  <small>{order.returnRequested ? t.recallRequested : t.inTransit}</small>
                  {!order.returnRequested ? (
                    <Button
                      type="button"
                      onClick={() => dispatch({ type: 'recallJourney', journeyId: journey.id })}
                    >
                      {t.recallJourney}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {!order.journeyId && (order.status === 'proposed' || order.status === 'waiting') ? (
                <div className="v03-order-actions-panel">
                  {resourceOrder ? (
                    <div className="v03-row">
                      <label className="v03-field">
                        {t.cargoGold}
                        <Input
                          type="number"
                          min="0"
                          max={proposedCargo?.gold ?? 0}
                          value={cargoDraft.gold}
                          onChange={(event) =>
                            setReducedCargoByOrder((current) => ({
                              ...current,
                              [order.id]: {
                                ...cargoDraft,
                                gold: Number(event.target.value),
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="v03-field">
                        {t.cargoFood}
                        <Input
                          type="number"
                          min="0"
                          max={proposedCargo?.food ?? 0}
                          value={cargoDraft.food}
                          onChange={(event) =>
                            setReducedCargoByOrder((current) => ({
                              ...current,
                              [order.id]: {
                                ...cargoDraft,
                                food: Number(event.target.value),
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="v03-field">
                        {t.cargoTroops}
                        <Input
                          type="number"
                          min="0"
                          max={proposedCargo?.troops ?? 0}
                          step="100"
                          value={cargoDraft.troops}
                          onChange={(event) =>
                            setReducedCargoByOrder((current) => ({
                              ...current,
                              [order.id]: {
                                ...cargoDraft,
                                troops: Number(event.target.value),
                              },
                            }))
                          }
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="v03-field">
                      {t.reduceTo} · {t.troops}
                      <Input
                        type="number"
                        min="1"
                        max={proposedTroopCount}
                        step="100"
                        value={troopDraft}
                        onChange={(event) =>
                          setReducedTroopsByOrder((current) => ({
                            ...current,
                            [order.id]: Number(event.target.value),
                          }))
                        }
                      />
                    </label>
                  )}
                  <div className="v03-order-actions">
                    <Button
                      type="button"
                      onClick={() => answerOrder(order.id, order.kind, 'accept')}
                    >
                      {t.accept}
                    </Button>
                    <Button
                      type="button"
                      onClick={() =>
                        answerOrder(
                          order.id,
                          order.kind,
                          'reduce',
                          resourceOrder ? cargoDraft : troopDraft,
                        )
                      }
                    >
                      {t.acceptReduced}
                    </Button>
                    <Button type="button" onClick={() => answerOrder(order.id, order.kind, 'wait')}>
                      {t.wait}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => answerOrder(order.id, order.kind, 'cancel')}
                    >
                      {t.cancel}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </section>
  );
}
