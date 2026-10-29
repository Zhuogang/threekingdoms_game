import type * as engine from '../src/v03/battle/index';
import type { V03TacticalBattleState, BattlePosition } from '../src/v03/battle/types';
type Api = Pick<
  typeof engine,
  'applyBattleAction' | 'getUnitReachableTiles' | 'getUnitAttackTargets' | 'predictBattleAttack'
>;
interface Reply {
  casualties: number;
  enemyId: string | null;
  position: BattlePosition | null;
}
export type ExposureComparison =
  | { status: 'excluded'; reason: string }
  | {
      status: 'measured';
      positions: number;
      equivalentPositions: number;
      protectedPositions: number;
      chosenPosition: BattlePosition;
      chosenReply: Reply;
      best: { position: BattlePosition; reduction: number; reply: Reply } | null;
    };
export function compareOrdinaryAttackExposure(
  api: Api,
  beforeAttack: V03TacticalBattleState,
  actorId: string,
  targetId: string,
  beforeMove?: V03TacticalBattleState,
): ExposureComparison;
