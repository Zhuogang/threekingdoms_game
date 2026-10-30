import { Button } from '../kit';
import type { BattleDisplay } from '../hooks/useBattleDisplay';

import type { GameplayContext } from '../hooks/gameplayView';
import { BattleScreen } from '../screens/BattleScreen';
import { CampaignScreen } from '../screens/CampaignScreen';
import { SidePanel } from './SidePanel';
export function Workspace({
  context,
  display,
}: {
  context: GameplayContext & { state: NonNullable<GameplayContext['state']> };
  display: BattleDisplay;
}) {
  const {
    isBattleView,
    setViewMode,
    t,
    activeBattles,
    activeBattle,
    setSelectedBattleId,
    setSelectedUnitId,
    openWiki,
    battleState,
    selectedGeo,
    orderPreviewOrder,
    orderPreviewSourceCity,
  } = context;
  return (
    <section
      className={`v03-workspace ${isBattleView ? `battle-layout${display.panels.rail ? ' has-battle-rail' : ''}${display.panels.commands ? ' has-battle-commands' : ''}` : 'map-first-layout'}`}
    >
      {isBattleView && display.panels.rail ? (
        <aside className="v03-rail">
          <Button
            type="button"
            className={!isBattleView ? 'active' : ''}
            onClick={() => setViewMode('campaign')}
            title={t.campaign}
          >
            {t.campaign}
          </Button>
          {activeBattles.map((battle, index) => (
            <Button
              type="button"
              key={battle.id}
              className={
                battle.id === activeBattle?.id ? 'active v03-battle-tab' : 'v03-battle-tab'
              }
              onClick={() => {
                setSelectedBattleId(battle.id);
                setViewMode('battle');
                // The player picks who acts; switching fields selects no formation.
                setSelectedUnitId(null);
              }}
            >
              {index + 1}
            </Button>
          ))}
          <div className="v03-rail-bottom">
            <Button type="button" onClick={() => openWiki('units')}>
              ?
            </Button>
          </div>
        </aside>
      ) : null}
      {isBattleView && battleState && activeBattle ? (
        <BattleScreen
          display={display}
          context={{ ...context, battleState: battleState!, activeBattle: activeBattle! }}
        />
      ) : (
        <CampaignScreen context={{ ...context }} />
      )}
      {isBattleView && display.panels.commands ? (
        <SidePanel
          context={{
            ...context,
            selectedGeo: selectedGeo!,
            orderPreviewSourceCity: orderPreviewSourceCity!,
            orderPreviewOrder: orderPreviewOrder!,
          }}
        />
      ) : null}
    </section>
  );
}
