import { isDeepStrictEqual } from 'node:util';

// Diagnostic only. Uses legal commands and mechanical forecasts, never AI scores.
// Ordinary hits are deterministic; reject a ruleset that consumes RNG here rather
// than consulting future random outcomes to find a counterfactual.
function command(api, state, action) {
  const result = api.applyBattleAction(state, action);
  if (!result.ok) return null;
  if (result.state.rngState !== state.rngState)
    throw new Error('Exposure comparison requires deterministic ordinary move/attack commands.');
  return result.state;
}

function effects(state, actorId) {
  return {
    units: state.units.map((unit) => {
      if (unit.id !== actorId) return unit;
      const { x, y, moved, ...rest } = unit;
      return rest;
    }),
    outcome: state.outcome,
    supplies: state.supplies,
    tacticPoints: state.tacticPoints,
    rngState: state.rngState,
  };
}

const positionKey = (position) => `${position.x},${position.y}`;
function allyReach(api, state, actorId, side) {
  return new Map(
    state.units
      .filter((unit) => unit.side === side && unit.id !== actorId && unit.troops > 0)
      .map((unit) => [
        unit.id,
        new Set(api.getUnitReachableTiles(state, unit.id).map(positionKey)),
      ]),
  );
}
function preservesReach(chosen, alternative) {
  return [...chosen].every(([id, cells]) =>
    [...cells].every((cell) => alternative.get(id)?.has(cell)),
  );
}

/** Largest independently legal current-day normal reply to each friendly unit.
 * Enemies retain actual moved/acted/status flags. No reset, future day, RNG,
 * tactic, multi-unit attack sequence or reply-policy choice is simulated.
 */
function replies(api, state, side) {
  const result = Object.fromEntries(
    state.units
      .filter((unit) => unit.side === side && unit.troops > 0)
      .map((unit) => [unit.id, { casualties: 0, enemyId: null, position: null }]),
  );
  for (const enemy of state.units.filter(
    (unit) => unit.side !== side && unit.troops > 0 && !unit.acted,
  )) {
    for (const position of [enemy, ...api.getUnitReachableTiles(state, enemy.id)]) {
      // Every alternate position comes from the authoritative movement query.
      const view = {
        ...state,
        units: state.units.map((unit) =>
          unit.id === enemy.id ? { ...unit, x: position.x, y: position.y } : unit,
        ),
      };
      for (const target of api.getUnitAttackTargets(view, enemy.id)) {
        const forecast = api.predictBattleAttack(view, enemy.id, target.id);
        const hit = forecast?.inRange ? (forecast.estimatedCasualties ?? 0) : 0;
        if (hit > result[target.id].casualties)
          result[target.id] = {
            casualties: hit,
            enemyId: enemy.id,
            position: { x: position.x, y: position.y },
          };
      }
    }
  }
  return result;
}

export function compareOrdinaryAttackExposure(api, beforeAttack, actorId, targetId, beforeMove) {
  const actor = beforeAttack.units.find((unit) => unit.id === actorId);
  if (!actor) throw new Error('Observed attack has no actor.');
  const excluded = (reason) => ({ status: 'excluded', reason });
  if (actor.moved && !beforeMove) return excluded('movement-origin-unobserved');
  const origin = beforeMove ?? beforeAttack;
  if (
    origin.id !== beforeAttack.id ||
    origin.day !== beforeAttack.day ||
    !isDeepStrictEqual(effects(origin, actorId), effects(beforeAttack, actorId))
  )
    return excluded('intervening-state-change');
  const chosen = command(
    api,
    { ...beforeAttack, playerSide: actor.side },
    {
      type: 'attack',
      unitId: actorId,
      targetId,
    },
  );
  if (!chosen) throw new Error('Observed ordinary attack cannot replay as a legal command.');
  if (chosen.outcome) return excluded('battle-ended');
  if (!chosen.units.some((unit) => unit.side !== actor.side && unit.troops > 0 && !unit.acted))
    return excluded('no-opponent-activation-left-today');
  const survivor = chosen.units.find((unit) => unit.id === actorId);
  if (!survivor || survivor.troops <= 0) return excluded('actor-lost');
  const chosenEffects = effects(chosen, actorId);
  const chosenReplies = replies(api, chosen, actor.side);
  const chosenReach = allyReach(api, chosen, actorId, actor.side);
  const startingActor = origin.units.find((unit) => unit.id === actorId);
  const positions = [startingActor, ...api.getUnitReachableTiles(origin, actorId)];
  let equivalentPositions = 0,
    protectedPositions = 0,
    best = null;
  for (const position of positions) {
    if (position.x === actor.x && position.y === actor.y) continue;
    let alternative = { ...origin, playerSide: actor.side };
    if (position.x !== startingActor.x || position.y !== startingActor.y)
      alternative = command(api, alternative, {
        type: 'move',
        unitId: actorId,
        x: position.x,
        y: position.y,
      });
    if (!alternative) throw new Error('Reachability query disagrees with actual move command.');
    if (!api.getUnitAttackTargets(alternative, actorId).some((unit) => unit.id === targetId))
      continue;
    alternative = command(api, alternative, { type: 'attack', unitId: actorId, targetId });
    if (!alternative || !isDeepStrictEqual(effects(alternative, actorId), chosenEffects)) continue;
    equivalentPositions++;
    if (!preservesReach(chosenReach, allyReach(api, alternative, actorId, actor.side))) continue;
    const alternativeReplies = replies(api, alternative, actor.side);
    if (
      Object.entries(chosenReplies).some(
        ([id, hit]) => alternativeReplies[id].casualties > hit.casualties,
      )
    )
      continue;
    protectedPositions++;
    const reduction = chosenReplies[actorId].casualties - alternativeReplies[actorId].casualties;
    if (reduction > 0 && (!best || reduction > best.reduction))
      best = {
        position: { x: position.x, y: position.y },
        reduction,
        reply: alternativeReplies[actorId],
      };
  }
  return {
    status: 'measured',
    positions: positions.length,
    equivalentPositions,
    protectedPositions,
    chosenPosition: { x: actor.x, y: actor.y },
    chosenReply: chosenReplies[actorId],
    best,
  };
}
