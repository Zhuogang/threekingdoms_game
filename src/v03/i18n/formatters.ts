import { message, type MessageKey } from './';
import { troopName } from '../rendering/presentation';
import type { V03GameState } from '../types';
import type { V03TacticalBattleState, V03BattleLogEntry } from '../battle';
export const coordinates = (x: number, y: number) => `(${x}, ${y})`;
export const troopCount = (value: number, locale: 'en' | 'zh') =>
  value.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US');
export function weatherLabel(value: string, locale: 'en' | 'zh') {
  return message(locale, `weather.${value}` as MessageKey);
}
export function terrainLabel(value: string, locale: 'en' | 'zh') {
  return message(locale, `terrain.${value}` as MessageKey);
}
export function formatBattleLog(
  entry: V03BattleLogEntry,
  battle: V03TacticalBattleState,
  state: V03GameState,
  locale: 'en' | 'zh',
): string {
  const name = (id: unknown) => {
    const unit = battle.units.find((item) => item.id === id);
    if (!unit) return '—';
    const parent = state.battles.find((item) => item.id === battle.id);
    const ids =
      (unit.side === 'attacker'
        ? parent?.attackerFormationOfficerIds
        : parent?.defenderFormationOfficerIds)?.[unit.id] ?? [];
    const names = ids
      .map((id) => state.officers.find((officer) => officer.id === id))
      .filter((officer) => Boolean(officer))
      .map((officer) => (locale === 'zh' ? officer!.chinese : officer!.name));
    return names.length
      ? `${troopName(unit.troopType, locale)} · ${names.join(', ')}`
      : locale === 'zh'
        ? '民兵'
        : 'Militia';
  };
  const params: Record<string, string | number | boolean | null> = { ...entry.params };
  for (const key of ['side', 'winner'])
    params[key] = message(locale, `side.${params[key] ?? 'draw'}` as MessageKey);
  params.unit = name(params.unitId);
  params.source = name(params.sourceId);
  params.target = name(params.targetId);
  params.city =
    state.cities.find((city) => city.id === params.cityId)?.[
      locale === 'zh' ? 'chinese' : 'name'
    ] ?? (locale === 'zh' ? '野外' : 'the field');
  if (params.tactic) params.tactic = message(locale, `tactic.${params.tactic}` as MessageKey);
  if (entry.code === 'log.posture') {
    params.army = message(
      locale,
      entry.params.side === battle.playerSide ? 'army.player' : 'army.enemy',
    );
    params.posture = message(locale, `posture.${entry.params.posture}` as MessageKey);
  }
  params.success = message(locale, params.success ? 'success' : 'refused');
  // Coordinates read 1-based, like the inspection readout.
  if (entry.code === 'log.move') {
    params.x = Number(entry.params.x) + 1;
    params.y = Number(entry.params.y) + 1;
  }
  // Rally and Confuse rules live in the tactic panel and Wiki, not on every log line.
  return (
    message(
      locale,
      (entry.code === 'log.attack' && entry.params.counter
        ? 'log.counterattack'
        : entry.code) as MessageKey,
      params,
    ) +
    (entry.code === 'log.attack' && entry.params.water ? message(locale, 'log.water', params) : '')
  );
}

/** The side a battle log entry belongs to, for colouring: its acting unit's side. */
export function battleLogSide(
  entry: V03BattleLogEntry,
  battle: V03TacticalBattleState,
): 'attacker' | 'defender' | null {
  const id = entry.params.sourceId ?? entry.params.unitId;
  const unit = id ? battle.units.find((item) => item.id === id) : undefined;
  if (unit) return unit.side;
  const side = entry.params.side;
  return side === 'attacker' || side === 'defender' ? side : null;
}
