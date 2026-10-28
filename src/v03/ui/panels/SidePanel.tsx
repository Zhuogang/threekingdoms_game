import type { GameplayContext } from '../hooks/gameplayView';
import { BattleSidebar } from './BattleSidebar';
import { CampaignSidebar } from './CampaignSidebar';
export function SidePanel({ context }: { context: GameplayContext }) {
  const { isBattleView, battleState, activeBattle } = context;
  return (
    <aside className="v03-side-panel">
      {isBattleView && battleState && activeBattle ? (
        <BattleSidebar context={{ ...context, battleState, activeBattle }} />
      ) : (
        <CampaignSidebar context={context} />
      )}
    </aside>
  );
}
