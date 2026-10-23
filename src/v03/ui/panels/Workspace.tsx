import { Button } from '../kit';

import type { GameplayContext } from '../hooks/gameplayView';
import { BattleScreen } from '../screens/BattleScreen';
import { CampaignScreen } from '../screens/CampaignScreen';
import { SidePanel } from './SidePanel';
export function Workspace({
  context,
}: {
  context: GameplayContext & { state: NonNullable<GameplayContext['state']> };
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
    <section className={`v03-workspace ${isBattleView ? 'battle-layout' : 'map-first-layout'}`}>
      {isBattleView ? (
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
                const friendly = battle.battleData.units.find(
                  (unit) => unit.side === battle.battleData.playerSide && unit.troops > 0,
                );
                setSelectedUnitId(friendly?.id ?? null);
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
          context={{ ...context, battleState: battleState!, activeBattle: activeBattle! }}
        />
      ) : (
        <CampaignScreen context={{ ...context }} />
      )}
      {isBattleView ? (
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
