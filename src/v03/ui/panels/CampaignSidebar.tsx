import { message } from '../../i18n';
import type { GameplayContext } from '../hooks/gameplayView';
import { CityPanel } from './CityPanel';
import { OrdersInbox } from './OrdersInbox';
import { DiplomacyPanel } from './DiplomacyPanel';
import { ArmyBuilder } from './ArmyBuilder';
import { SupplyOrders } from './SupplyOrders';
import { Tabs } from '../kit';
export function CampaignSidebar({ context }: { context: GameplayContext }) {
  const { campaignTab, setCampaignTab, selectedCity, locale } = context;
  return (
    <>
      <Tabs
        value={campaignTab}
        onChange={setCampaignTab}
        label={message(locale, 'ui.campaign.panels.89')}
        tabs={[
          { value: 'city', label: context.t.city },
          { value: 'forces', label: message(locale, 'ui.forces.90') },
          { value: 'orders', label: message(locale, 'ui.orders.91') },
          { value: 'diplomacy', label: context.t.diplomacy },
        ]}
      />
      {campaignTab === 'city' && selectedCity ? (
        <CityPanel
          context={{
            ...context,
            selectedCity,
            selectedGeo: context.selectedGeo!,
            orderPreviewOrder: context.orderPreviewOrder!,
            orderPreviewSourceCity: context.orderPreviewSourceCity!,
          }}
        />
      ) : null}
      {campaignTab === 'forces' ? (
        <>
          <ArmyBuilder context={context} />
          {selectedCity?.factionId === context.state.playerFactionId ? (
            <details>
              <summary>{context.t.requestSupplies}</summary>
              <SupplyOrders
                context={{
                  ...context,
                  selectedCity,
                  orderPreviewOrder: context.orderPreviewOrder!,
                  orderPreviewSourceCity: context.orderPreviewSourceCity!,
                }}
              />
            </details>
          ) : null}
        </>
      ) : null}
      {campaignTab === 'orders' ? <OrdersInbox context={context} /> : null}
      {campaignTab === 'diplomacy' ? <DiplomacyPanel context={context} /> : null}
    </>
  );
}
