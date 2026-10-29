import type { GameplayContext } from '../hooks/gameplayView';
import { BattleSidebar } from './BattleSidebar';
/** The side panel exists only in battle view; campaign work happens in the city window. */
export function SidePanel({ context }: { context: GameplayContext }) {
  const { isBattleView, battleState, activeBattle } = context;
  return (
    <aside className="v03-side-panel">
      {isBattleView && battleState && activeBattle ? (
        <BattleSidebar context={{ ...context, battleState, activeBattle }} />
      ) : null}
    </aside>
  );
}
