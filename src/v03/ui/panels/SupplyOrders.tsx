import { Button } from '../kit';

import type { GameplayContext } from '../hooks/gameplayView';
import { OrderForm } from './OrderForm';
export function SupplyOrders({
  context,
}: {
  context: GameplayContext & {
    state: NonNullable<GameplayContext['state']>;
    selectedCity: NonNullable<GameplayContext['selectedCity']>;
  };
}) {
  const {
    requestKind,
    setRequestKind,
    t,
    selectedCity,
    orderPreviewOrder,
    orderPreviewSourceCity,
  } = context;
  return (
    <>
      <div className="v03-order-switch">
        <Button
          type="button"
          className={requestKind === 'resource' ? 'selected' : ''}
          onClick={() => setRequestKind('resource')}
        >
          {t.requestSupplies}
        </Button>
        <Button
          type="button"
          className={requestKind === 'campaign' ? 'selected' : ''}
          onClick={() => setRequestKind('campaign')}
        >
          {t.orderMarch}
        </Button>
      </div>
      <OrderForm
        context={{
          ...context,
          selectedCity: selectedCity!,
          orderPreviewSourceCity: orderPreviewSourceCity!,
          orderPreviewOrder: orderPreviewOrder!,
        }}
      />
    </>
  );
}
