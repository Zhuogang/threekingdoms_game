import { GATES } from '../content/chencang';
import { activeUnit } from '../rules/combat';
import type { SiegeAction, SiegeActionResult, SiegePosition, SiegeState } from '../rules/types';

export interface StrikeResult {
  position: SiegePosition;
  loss: number;
  routed: boolean;
  moraleGain: number;
}
export interface StrikeEffect {
  from: SiegePosition;
  to: SiegePosition;
  type: string;
}
export const isStrike = (action: SiegeAction) =>
  ['attack', 'ram', 'suppress', 'fireArrows', 'dropMillstone', 'dropBoulders'].includes(
    action.type,
  );

/** Positions belong to the pre-action board; values belong to the resolved action. */
export function strikePresentation(
  before: SiegeState,
  action: SiegeAction,
  result: Extract<SiegeActionResult, { ok: true }>,
): { effect: StrikeEffect; results: StrikeResult[] } | null {
  if (!isStrike(action)) return null;
  const actorId =
    'unitId' in action ? action.unitId : 'engineId' in action ? action.engineId : null;
  const source =
    before.units.find((u) => u.id === actorId) ?? before.engines.find((e) => e.id === actorId);
  const gateId =
    'gateId' in action
      ? action.gateId
      : 'targetId' in action && Object.hasOwn(GATES, action.targetId)
        ? (action.targetId as keyof typeof GATES)
        : null;
  const targetId =
    'targetId' in action
      ? action.targetId
      : 'unitId' in action && 'engineId' in action
        ? action.engineId
        : null;
  const target = gateId
    ? { ...GATES[gateId].cells[0]!, level: 'ground' as const }
    : (before.units.find((u) => u.id === targetId) ??
      before.engines.find((e) => e.id === targetId));
  if (!source || !target) return null;
  const position = (p: {
    x: number;
    y: number;
    level?: SiegePosition['level'];
  }): SiegePosition => ({
    x: p.x,
    y: p.y,
    level: p.level ?? 'ground',
  });
  const results: StrikeResult[] = [];
  for (const id of [targetId, actorId]) {
    if (!id || (gateId && id === targetId)) continue;
    const unit = before.units.find((u) => u.id === id);
    const engine = before.engines.find((e) => e.id === id);
    const nextUnit = result.state.units.find((u) => u.id === id);
    const nextEngine = result.state.engines.find((e) => e.id === id);
    const loss =
      unit && nextUnit
        ? unit.troops - nextUnit.troops
        : engine && nextEngine
          ? engine.durability - nextEngine.durability
          : 0;
    const routed = Boolean(
      unit &&
      activeUnit(unit) &&
      (!nextUnit ||
        !activeUnit(nextUnit) ||
        result.events.some((e) => e.code === 'thrownOffWall' && e.params.unitId === id)),
    );
    const moraleGain =
      id === actorId
        ? result.events
            .filter(
              (e) =>
                e.code === 'routMorale' && e.params.unitId === id && e.params.role === 'source',
            )
            .reduce((sum, e) => sum + Number(e.params.after) - Number(e.params.before), 0)
        : 0;
    if ((unit || engine) && (loss > 0 || routed || moraleGain > 0))
      results.push({ position: position(unit ?? engine!), loss, routed, moraleGain });
  }
  if (gateId)
    results.unshift({
      position: position(target),
      loss: before.gates[gateId].durability - result.state.gates[gateId].durability,
      routed: false,
      moraleGain: 0,
    });
  return { effect: { from: position(source), to: position(target), type: action.type }, results };
}
