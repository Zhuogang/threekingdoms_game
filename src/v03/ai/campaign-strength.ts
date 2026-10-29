import {
  createBattleMap,
  createCanvasBattleMap,
  createTacticalBattle,
  predictBattleAttack,
  predictBattleTactic,
  selectCampaignBattlefield,
  terrainMovementCost,
  type BattleRosterEntry,
  type BattleSide,
  type TacticalBattleUnit,
} from '../battle';

const neutralMap = createBattleMap({ regionId: 'xiapi', seed: 0 });
neutralMap.terrain.fill('plain');
const terrainProfiles = new Map<string, { cavalryMobility: number; defenseMargin: number }>();
function terrainProfile(battlefieldId: string) {
  let profile = terrainProfiles.get(battlefieldId);
  if (profile) return profile;
  // Fixed template sampling never reads the live RNG or the future battle seed.
  const map = createCanvasBattleMap(battlefieldId, { seed: 0 });
  const traversable = map.terrain.filter((terrain) => terrain !== 'cliff');
  const cavalryCost =
    traversable.reduce((sum, terrain) => sum + terrainMovementCost('cavalry', terrain), 0) /
    traversable.length;
  const water = map.terrain.filter((terrain) => terrain === 'water').length / map.terrain.length;
  const cliffs = 1 - traversable.length / map.terrain.length;
  profile = {
    cavalryMobility: 1 / (1 + (cavalryCost - 1) * 0.1),
    defenseMargin: 1.05 + Math.min(0.15, water + cliffs * 0.25),
  };
  terrainProfiles.set(battlefieldId, profile);
  return profile;
}

/** Coarse capability/loss estimate, not a win probability. It reuses real roster,
 * attack, experience and tactic calculations; no battle rollout or RNG peeking.
 */
export function estimateCampaignMatchup(
  attackers: readonly BattleRosterEntry[],
  defenders: readonly BattleRosterEntry[],
  routeCityIds: readonly string[],
) {
  const battlefieldId = selectCampaignBattlefield(routeCityIds);
  const profile = terrainProfile(battlefieldId);
  const attackerTroops = attackers.reduce((sum, unit) => sum + unit.troops, 0);
  const defenderTroops = defenders.reduce((sum, unit) => sum + unit.troops, 0);
  if (!defenderTroops || !attackerTroops)
    return {
      battlefieldId,
      attackerTroops,
      defenderTroops,
      attackerPower: attackerTroops,
      defenderPower: defenderTroops,
      ratio: !defenderTroops && attackerTroops > 0 ? 999 : 0,
      expectedLosses: 0,
      defenseMargin: profile.defenseMargin,
    };
  const battle = createTacticalBattle({
    id: 'campaign-forecast',
    map: neutralMap,
    seed: 0,
    attackerUnits: attackers,
    defenderUnits: defenders,
    supplies: { attacker: 100_000, defender: 100_000 },
  });
  battle.weather = 'clear';
  const power = (side: BattleSide) => {
    const own = battle.units.filter((unit) => unit.side === side);
    const opponents = battle.units.filter((unit) => unit.side !== side);
    const opposingTroops = opponents.reduce((sum, unit) => sum + unit.troops, 0);
    const tactics = Math.min(1, battle.tacticPoints[side] / Math.max(1, own.length * 4));
    let damage = 0;
    for (const unit of own) {
      let expectedHit = 0;
      for (const opponent of opponents) {
        // Compare the formation's preferred legal attack distance and the real
        // return hit. Clipped damage retains overkill/formation-throughput costs;
        // healthy troops also contribute separately to durability below.
        const source: TacticalBattleUnit = { ...unit, x: 5, y: 5 };
        const target: TacticalBattleUnit = { ...opponent, x: 5 + unit.attackRange, y: 5 };
        const view = { ...battle, units: [source, target] };
        const attack = predictBattleAttack(view, source.id, target.id)!;
        const hit = attack.estimatedCasualties!;
        const ordinary = Math.max(hit * 0.2, hit - (attack.counterattack.estimatedCasualties ?? 0));
        let peak = ordinary;
        for (const tactic of ['fire', 'ambush'] as const) {
          const forecast = predictBattleTactic(view, source.id, tactic, target.id);
          if (forecast?.inRange)
            peak = Math.max(peak, (forecast.minCasualties + forecast.maxCasualties) / 2);
        }
        const confuse = predictBattleTactic(view, source.id, 'confuse', target.id);
        if (confuse?.inRange) {
          const enemyView = { ...battle, units: [source, { ...target, x: 6, y: 5 }] };
          const reply = predictBattleAttack(enemyView, target.id, source.id)!;
          peak = Math.max(peak, ((reply.estimatedCasualties ?? 0) * confuse.chance) / 100);
        }
        expectedHit +=
          ((ordinary + (peak - ordinary) * tactics * 0.25) * opponent.troops) / opposingTroops;
      }
      damage += expectedHit * (unit.troopType === 'cavalry' ? profile.cavalryMobility : 1);
    }
    return Math.sqrt(own.reduce((sum, unit) => sum + unit.troops, 0) * damage);
  };
  const attackerPower = power('attacker'),
    defenderPower = power('defender') * profile.defenseMargin;
  const ratio = attackerPower / Math.max(1, defenderPower);
  return {
    battlefieldId,
    attackerTroops,
    defenderTroops,
    attackerPower,
    defenderPower,
    ratio,
    expectedLosses: Math.min(attackerTroops, (defenderTroops * 0.6) / Math.max(0.25, ratio)),
    defenseMargin: profile.defenseMargin,
  };
}
