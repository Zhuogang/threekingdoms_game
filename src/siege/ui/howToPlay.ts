import { COURTYARD, MAP_HEIGHT, MAP_WIDTH, SOUTH_TRENCH } from '../content/chencang';
import { siegeText, type SiegeLocale, type SiegeTextKey } from '../i18n';
import { applySiegeAction } from '../rules/actions';
import { SIEGE_TUNING as T } from '../rules/tuning';
import { SIEGE_DAYS } from '../rules/constants';
import { ENGINE_RULES } from '../rules/day';
import { createSiegeState } from '../rules/state';
import type { EngineKind, SiegeAction, SiegeEngine, SiegeState, SiegeSide } from '../rules/types';
import { TRENCH_SOUTH_ROW } from './walkthrough';

const applied = (state: SiegeState, action: SiegeAction) => {
  const result = applySiegeAction(state, action);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
};

/** These rules have no exported constants. Observe isolated rule results rather than
 * duplicating their numbers in copy or changing the rules for a presentation task.
 */
function observedRules() {
  const initial = createSiegeState(228);
  const workshopId = initial.workshops[0]!.id;
  const outer = SOUTH_TRENCH.find((c) => c.y === TRENCH_SOUTH_ROW - 1)!;
  const cart: SiegeEngine = {
    id: 'guide-cart',
    kind: 'earthCart',
    x: outer.x,
    y: TRENCH_SOUTH_ROW,
    durability: ENGINE_RULES.earthCart.durability,
    max: ENGINE_RULES.earthCart.durability,
    burning: false,
    wrecked: false,
  };
  const built = { ...initial, engines: [cart] };
  const filled = applied(built, { type: 'fillTrench', engineId: cart.id, ...outer });
  const cartFill = filled.trenchFill[`${outer.x},${outer.y}`]!;
  const infantryState = structuredClone(built);
  infantryState.engines = [];
  const infantry = infantryState.units.find((u) => u.side === 'shu' && u.troopType === 'infantry')!;
  Object.assign(infantry, { x: outer.x, y: TRENCH_SOUTH_ROW });
  const infantryFill = applied(infantryState, { type: 'fillTrench', unitId: infantry.id, ...outer })
    .trenchFill[`${outer.x},${outer.y}`]!;
  const building = applied(initial, { type: 'queueEngine', workshopId, kind: 'ladder' });
  const supervised = applied(building, {
    type: 'order',
    side: 'shu',
    kind: 'supervise',
    target: workshopId,
  });
  let engineCap = 0;
  for (; engineCap <= MAP_WIDTH * MAP_HEIGHT; engineCap++) {
    const probe = {
      ...initial,
      engines: Array.from({ length: engineCap }, (_, i) => ({ ...cart, id: `guide-${i}` })),
    };
    if (!applySiegeAction(probe, { type: 'queueEngine', workshopId, kind: 'earthCart' }).ok) break;
  }
  return {
    engineCap,
    cartFill,
    infantryFill,
    fillRatio: cartFill / infantryFill,
    superviseDays: building.workshops[0]!.daysRemaining - supervised.workshops[0]!.daysRemaining,
  };
}

export const HOW_TO_RULES = {
  days: SIEGE_DAYS,
  engines: ENGINE_RULES,
  courtyardFirst: Math.min(...COURTYARD.map((c) => c.y)),
  courtyardLast: Math.max(...COURTYARD.map((c) => c.y)),
  trenchSouth: TRENCH_SOUTH_ROW,
  trenchOuter: TRENCH_SOUTH_ROW - 1,
  trenchInner: Math.min(...SOUTH_TRENCH.map((c) => c.y)),
  ...observedRules(),
  tuning: T,
};
export type HowToRules = typeof HOW_TO_RULES;

export function howToSections(
  locale: SiegeLocale,
  rules: HowToRules = HOW_TO_RULES,
  playerSide: SiegeSide = 'shu',
) {
  const t = (key: SiegeTextKey, params: Record<string, string | number> = {}) =>
    siegeText(locale, key, params);
  if (playerSide === 'wei')
    return [
      { title: 'howWeiGoal', lines: [t('howWeiGoalBody', { days: rules.tuning.days })] },
      { title: 'howDay', lines: [t('howWeiDay')] },
      {
        title: 'defenseStores',
        lines: [
          t('howWeiPrepare'),
          t('howWeiFire', {
            range: rules.tuning.wallArcherRange,
            cover: rules.tuning.coveredFireMultiplier,
          }),
          t('howWeiMillstone', {
            raw: rules.tuning.millstoneDamage,
            covered: rules.tuning.coveredMillstoneDamage,
          }),
          t('howWeiBoulders', {
            loss: rules.tuning.boulderFootholdLoss,
            mound: rules.tuning.moundBoulderMultiplier,
          }),
        ],
      },
      {
        title: 'order',
        lines: [
          t('howWeiOrders', {
            repair: rules.tuning.nightRepair,
            range: rules.tuning.sortieRange,
            damage: rules.tuning.sortieDamage,
            covered: rules.tuning.coveredSortieDamage,
            rally: rules.tuning.rallyMorale,
            hold: rules.tuning.holdFastMultiplier,
          }),
          t('howWeiNight'),
        ],
      },
      { title: 'innerWall', lines: [t('howWeiWall', { day: rules.tuning.act2Day })] },
      {
        title: 'howCounters',
        lines: [
          t('counterWeiSuppress'),
          t('counterWeiCover'),
          t('counterWeiMound'),
          t('counterWeiAssault'),
          t('counterWeiNight'),
          t('counterWeiMounted'),
        ],
      },
      { title: 'howKeys', lines: [t('howKeysBody')] },
    ] satisfies Array<{ title: SiegeTextKey; lines: string[] }>;
  return [
    {
      title: 'howGoal',
      lines: [
        t('howGoalBody', {
          days: rules.days,
          first: rules.courtyardFirst,
          last: rules.courtyardLast,
        }),
        t('howCourtyardClear'),
      ],
    },
    { title: 'howDay', lines: [t('howDayBody')] },
    {
      title: 'howBuild',
      lines: [
        t('howBuildBody', { cap: rules.engineCap }),
        ...(['ladder', 'ram', 'earthCart', 'tower'] as EngineKind[]).map((kind) =>
          t(kind === 'tower' ? 'howTowerDays' : 'howBuildDays', {
            kind: t(kind === 'ram' ? 'ramEngine' : kind),
            days: rules.engines[kind].days,
          }),
        ),
        t('howBuildDoor'),
      ],
    },
    { title: 'supervise', lines: [t('howSuperviseBody', { days: rules.superviseDays })] },
    {
      title: 'howUse',
      lines: [
        t('howCart', {
          row: rules.trenchSouth,
          outer: rules.trenchOuter,
          inner: rules.trenchInner,
          cart: rules.cartFill,
          infantry: rules.infantryFill,
          ratio: rules.fillRatio,
        }),
        t('howLadder', { row: rules.trenchSouth }),
        t('howRam'),
        t('howTower'),
      ],
    },
    { title: 'defence', lines: [t('howDefenceBody')] },
    {
      title: 'howCounters',
      lines: [
        t('howCounterFire', { cover: rules.tuning.coveredFireMultiplier }),
        t('howCounterRam', {
          raw: rules.tuning.millstoneDamage,
          covered: rules.tuning.coveredMillstoneDamage,
        }),
        t('howCounterGround', {
          boulder: rules.tuning.moundBoulderMultiplier,
          max: rules.tuning.moundComplete,
        }),
        t('howCounterAssault', {
          morale: rules.tuning.assaultMoraleLoss,
          near: rules.tuning.assaultNeighbourLoss,
        }),
        t('howCounterNight'),
        t('howCounterGuard', { range: rules.tuning.sortieRange }),
      ],
    },
    {
      title: 'howFoothold',
      lines: [
        t('howFootholdBody', {
          climb: rules.tuning.climbFoothold,
          assault: rules.tuning.assaultClimbFoothold,
          loss: rules.tuning.assaultClimbLoss,
          max: rules.tuning.footholdComplete,
          uphill: rules.tuning.climbingAttackMultiplier,
          mound: rules.tuning.climbing.mound.foothold,
        }),
      ],
    },
    { title: 'howKeys', lines: [t('howKeysBody')] },
  ] satisfies Array<{ title: SiegeTextKey; lines: string[] }>;
}
