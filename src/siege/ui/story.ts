import { SHU_ROSTER, SOUTH_TRENCH, WEI_ROSTER } from '../content/chencang';
import { distance, usableEngine, type SiegeAttackForecast } from '../rules/combat';
import type { EngineKind, SiegeState } from '../rules/types';
import type { HintKind } from '../save';
import type { SiegeTextKey } from '../i18n';

export const OPENING = [
  { scene: 2, speaker: 'jinxiang', text: 'openingCall1' },
  { scene: 2, speaker: 'haozhao', text: 'openingRefusal1' },
  { scene: 2, speaker: 'jinxiang', text: 'openingReturn' },
  { scene: 3, speaker: 'jinxiang', text: 'openingCall2' },
  { scene: 3, speaker: 'haozhao', text: 'openingRefusal2' },
  { scene: 3, speaker: 'zhugeliang', text: 'openingAssault' },
] as const satisfies ReadonlyArray<{ scene: number; speaker: SiegeTextKey; text: SiegeTextKey }>;

export const ENGINE_KINDS: EngineKind[] = ['ladder', 'ram', 'earthCart', 'tower'];
export const engineKey = (kind: EngineKind): SiegeTextKey => (kind === 'ram' ? 'ramEngine' : kind);
export const HINT_COPY = {
  wall: ['hintWallTitle', 'hintWall'],
  trench: ['hintTrenchTitle', 'hintTrench'],
  ladder: ['hintLadderTitle', 'hintLadder'],
  frontage: ['hintFrontageTitle', 'hintFrontage'],
  innerWall: ['hintInnerWallTitle', 'hintInnerWall'],
} as const satisfies Record<HintKind, readonly [SiegeTextKey, SiegeTextKey]>;

/** The camera starts at the south wall; other hints follow actual encounters. */
export function encounteredHints(
  state: SiegeState,
  selected: string | null,
  forecast: SiegeAttackForecast | null,
  filling = false,
): HintKind[] {
  const hints: HintKind[] = ['wall'];
  const actor =
    state.units.find((u) => u.id === selected) ?? state.engines.find((e) => e.id === selected);
  if (filling || (actor && SOUTH_TRENCH.some((cell) => distance(actor, cell) <= 1)))
    hints.push('trench');
  if (state.engines.some((e) => e.raisedAt && usableEngine(e))) hints.push('ladder');
  // Explain frontage the first time a forecast is capped or aims at a defender on the wall,
  // which is when "why does my big unit barely hurt them?" comes up.
  const onWall =
    forecast && state.units.some((u) => u.id === forecast.targetId && u.level === 'wall');
  if (forecast && (forecast.frontage !== null || onWall)) hints.push('frontage');
  if (Object.values(state.innerWall).some((progress) => progress > 0)) hints.push('innerWall');
  return hints;
}

export function siegeSummary(state: SiegeState) {
  const losses = (side: 'shu' | 'wei') => {
    const initial = (side === 'shu' ? SHU_ROSTER : WEI_ROSTER).reduce(
      (sum, u) => sum + u.troops,
      0,
    );
    const units = state.units.filter((u) => u.side === side);
    const remaining = units.reduce((sum, u) => sum + u.troops, 0);
    const wounded = units.reduce((sum, u) => sum + u.wounded, 0);
    return {
      total: Math.max(0, initial - remaining),
      dead: Math.max(0, initial - remaining - wounded),
      wounded,
    };
  };
  return {
    days: state.day,
    shu: losses('shu'),
    wei: losses('wei'),
    engines: ENGINE_KINDS.map((kind) => ({
      kind,
      built: state.log.filter((e) => e.code === 'engineCompleted' && e.params.kind === kind).length,
      // Empty earth carts are consumed and removed by the rules, rather than destroyed.
      destroyed: state.engines.filter((e) => e.kind === kind && (e.wrecked || e.durability <= 0))
        .length,
    })),
    trench: {
      untouched: SOUTH_TRENCH.filter((c) => !state.trenchFill[`${c.x},${c.y}`]).length,
      partial: SOUTH_TRENCH.filter((c) => {
        const fill = state.trenchFill[`${c.x},${c.y}`] ?? 0;
        return fill > 0 && fill < 3;
      }).length,
      filled: SOUTH_TRENCH.filter((c) => state.trenchFill[`${c.x},${c.y}`] === 3).length,
    },
  };
}
