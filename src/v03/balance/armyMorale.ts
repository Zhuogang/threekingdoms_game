import { deepFreeze } from './freeze';

/** Baggage train (B-04), army morale (B-05) and pursuit (B-05). */
export const ARMY_MORALE = deepFreeze({
  baggage: {
    /** Porters as a share of the attacker's line troops. */
    share: 0.05,
    /** Fewest porters a baggage train has. */
    min: 100,
    /** Movement points per day. */
    move: 2,
    /** Force, intellect and leadership of the train. */
    stat: 30,
    /** Army morale an owner loses when its baggage is captured or destroyed. */
    armyMorale: -25,
    /** Morale every living formation of the owner loses, once, when its baggage falls. */
    unitMorale: -10,
    /** The AI values each point of army morale a capture takes at this many casualty-equivalents. */
    captureMoraleWeight: 8,
    /** The attacker keeps a formation on screen when an enemy line formation is this close. */
    screenEnemyRange: 6,
    /** The defender sorties for an unscreened baggage train within this many cells. */
    sortieRange: 8,
  },
  armyMorale: {
    /** Opening army morale before the commander's leadership. */
    base: 50,
    /** Opening army morale per point of commander leadership. */
    commanderFactor: 0.5,
    /** Army morale a friendly formation routed costs. */
    unitRouted: -8,
    /** ...destroyed costs. */
    unitDestroyed: -12,
    /** Army morale gained when an enemy formation routs. */
    enemyRouted: 5,
    /** ...is destroyed. */
    enemyDestroyed: 6,
    /** Army morale lost when the commander's formation routs, on top of the rout itself. */
    commanderRouted: -20,
    /** The attacker loses this much army morale at each rollover after the late day. */
    attackerLateDay: -2,
    /** Last day before the attacker starts losing army morale each rollover. */
    lateAfterDay: 20,
    /** At or below this the army is shaken once. */
    shakenAt: 30,
    /** Morale every living formation loses when its army is shaken. */
    shakenUnitMorale: -15,
    /** At or below this the army breaks. */
    breakAt: 10,
    /** The army breaks when this share of its line formations is routed or destroyed. */
    breakRoutedShare: 0.6,
    /** Smallest army-morale change that is logged. */
    logThreshold: 5,
  },
  pursuit: {
    /** Points added to the wounded share of the loser's men for each pursuing formation. */
    woundedPerPursuer: 10,
    /** Points added to the capture chance for each pursuing formation. */
    capturePerPursuer: 5,
    /** Most points either effect can add. */
    cap: 30,
    /** Factor on both effects when the loser names a rear guard. */
    rearGuardFactor: 0.5,
    /** A pursuing cavalry formation needs this much morale. */
    minMorale: 40,
  },
} as const);
