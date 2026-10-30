import { executeV03Command } from '../../commands';
import type { V03Command, V03GameState } from '../../types';
import type { ApplicationBase } from './gameplayView';

/**
 * A battle order stands on the provisional move first, except the order that commits it.
 * `battleCommand` says whether the command settles (and so clears) the provisional move.
 */
export function standOnPendingMove(
  state: V03GameState,
  pending: { battleId: string; unitId: string; x: number; y: number } | null,
  command: V03Command,
): { base: V03GameState; battleCommand: boolean } {
  const battleCommand =
    command.type === 'battleAction' ||
    command.type === 'completeBattleDay' ||
    command.type === 'advance' ||
    command.type === 'setBattleAutoCommand';
  const commitsPending =
    command.type === 'battleAction' &&
    command.action.type === 'move' &&
    command.action.unitId === pending?.unitId;
  if (!pending || !battleCommand || commitsPending) return { base: state, battleCommand };
  const moved = executeV03Command(state, {
    type: 'battleAction',
    battleId: pending.battleId,
    action: { type: 'move', unitId: pending.unitId, x: pending.x, y: pending.y },
  });
  return { base: moved.ok ? moved.state : state, battleCommand };
}

/**
 * How the player commands formations on the battle map. Nothing is selected for the
 * player; a move stays provisional until the formation acts; an attack is chosen from the
 * formation's orders and then aimed inside its red range. Esc and right-click step back.
 */
export function battleControls(context: ApplicationBase & { state: V03GameState }) {
  const {
    activeBattle,
    battleState,
    currentUnit,
    attackTargets,
    tacticTargets,
    selectedTactic,
    setSelectedTactic,
    selectedUnitId,
    setSelectedUnitId,
    inspectedCell,
    setInspectedCell,
    dispatch,
    setFeedback,
    t,
  } = context;
  const playerUnit = (unitId: string) =>
    !activeBattle?.playerDayComplete &&
    battleState?.units.some(
      (unit) => unit.id === unitId && unit.troops > 0 && unit.side === battleState.playerSide,
    );
  const openUnitMenu = (unitId: string) => {
    if (!activeBattle || !battleState) return;
    context.setBattleActionMenu({ battleId: activeBattle.id, unitId, day: battleState.day });
  };
  /** Keep a provisional move where it stands (the formation may still act later today). */
  const commitPendingMove = () => {
    const pending = context.pendingMove;
    if (!pending) return;
    dispatch({
      type: 'battleAction',
      battleId: pending.battleId,
      action: { type: 'move', unitId: pending.unitId, x: pending.x, y: pending.y },
    });
  };
  /** Select a formation (or none). */
  const selectBattleUnit = (unitId: string | null) => {
    if (context.pendingMove && context.pendingMove.unitId !== unitId) commitPendingMove();
    setSelectedUnitId(unitId);
    context.setAttackMode(false);
    const unit = unitId ? battleState?.units.find((entry) => entry.id === unitId) : null;
    // A formation that already moved goes straight to its orders.
    if (unit && unit.moved && !unit.acted && activeBattle && !activeBattle.autoCommand)
      openUnitMenu(unit.id);
    else context.setBattleActionMenu(null);
  };
  /**
   * Esc and right-click step back one layer: targeting → the provisional move → the
   * orders menu → the selection → the inspected cell. Returns whether anything changed.
   */
  const cancelBattleStep = (): boolean => {
    if (context.attackMode || selectedTactic) {
      context.setAttackMode(false);
      setSelectedTactic(null);
      return true;
    }
    if (context.pendingMove) {
      context.setPendingMove(null);
      context.setBattleActionMenu(null);
      return true;
    }
    if (context.battleActionMenu) {
      context.setBattleActionMenu(null);
      return true;
    }
    if (selectedUnitId) {
      setSelectedUnitId(null);
      setInspectedCell(null);
      return true;
    }
    if (inspectedCell) {
      setInspectedCell(null);
      return true;
    }
    return false;
  };
  const startAttack = () => {
    if (!currentUnit || currentUnit.acted || !attackTargets.length) {
      setFeedback({ key: 'tacticNoTargets' });
      return;
    }
    setSelectedTactic(null);
    context.setAttackMode(true);
    setFeedback(t.attackHelp);
  };
  const handleBattleUnitClick = (unitId: string) => {
    if (!battleState || !activeBattle) return;
    const inspected = battleState.units.find((unit) => unit.id === unitId && unit.troops > 0);
    if (!inspected) return;
    setInspectedCell({ x: inspected.x, y: inspected.y });
    if (selectedTactic) {
      if (tacticTargets.some((target) => target.id === unitId) && currentUnit) {
        dispatch({
          type: 'battleAction',
          battleId: activeBattle.id,
          action: {
            type: 'tactic',
            unitId: currentUnit.id,
            tactic: selectedTactic,
            targetId: unitId,
          },
        });
        setSelectedTactic(null);
      } else setFeedback({ key: 'tacticNoTargets' });
      return;
    }
    if (context.attackMode && currentUnit) {
      if (attackTargets.some((target) => target.id === unitId)) {
        dispatch({
          type: 'battleAction',
          battleId: activeBattle.id,
          action: { type: 'attack', unitId: currentUnit.id, targetId: unitId },
        });
        return;
      }
      if (inspected.side !== battleState.playerSide) {
        setFeedback({ key: 'battleOutOfRange' });
        return;
      }
      context.setAttackMode(false);
    }
    // An enemy is only inspected; attacks are chosen from the formation's orders.
    if (!playerUnit(unitId)) return;
    if (unitId === currentUnit?.id) {
      // A second click opens (or closes) the formation's orders where it stands.
      if (inspected.acted || activeBattle.autoCommand) return;
      const open =
        context.battleActionMenu?.unitId === unitId &&
        context.battleActionMenu.day === battleState.day;
      if (open) context.setBattleActionMenu(null);
      else openUnitMenu(unitId);
      return;
    }
    selectBattleUnit(unitId);
  };
  const battleCellClick = (cell: { x: number; y: number }, source: 'pointer' | 'keyboard') => {
    if (!activeBattle || !battleState) return;
    if (selectedTactic) {
      setFeedback({ key: 'tacticChooseTarget' });
      return;
    }
    if (context.attackMode) {
      // Clicking away from the targets returns to the formation's orders.
      context.setAttackMode(false);
      return;
    }
    if (!currentUnit) return;
    if (context.reachableCells.some((entry) => entry.x === cell.x && entry.y === cell.y)) {
      context.setPendingMove({
        battleId: activeBattle.id,
        unitId: currentUnit.id,
        day: battleState.day,
        x: cell.x,
        y: cell.y,
      });
      openUnitMenu(currentUnit.id);
      return;
    }
    // Keyboard Enter on a closed cell still asks the rules, which explain why.
    if (source === 'keyboard' && !context.pendingMove) {
      dispatch({
        type: 'battleAction',
        battleId: activeBattle.id,
        action: { type: 'move', unitId: currentUnit.id, x: cell.x, y: cell.y },
      });
      return;
    }
    // Clicking open ground lets go of the formation and takes back an unfinished move.
    context.setPendingMove(null);
    context.setBattleActionMenu(null);
    setSelectedUnitId(null);
  };
  /** Tab: the next formation that has not acted, in roster order. */
  const nextReadyUnit = () => {
    const units =
      battleState?.units.filter(
        (unit) => unit.side === battleState.playerSide && unit.troops > 0 && !unit.acted,
      ) ?? [];
    const index = units.findIndex((unit) => unit.id === selectedUnitId);
    if (units.length) selectBattleUnit(units[(index + 1) % units.length]!.id);
  };
  return {
    playerUnit,
    selectBattleUnit,
    cancelBattleStep,
    startAttack,
    handleBattleUnitClick,
    battleCellClick,
    nextReadyUnit,
  };
}
