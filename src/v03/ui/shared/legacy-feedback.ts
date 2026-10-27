import { type BattleTactic } from '../../battle';

import type { GovernanceOrderReasonCode } from '../../governance/orders';
import {
  localizeRoutineFeedback,
  localizeRoutineBattleLog,
  localizeV03PersonOrFormationName,
} from '../../ui/feedback';
import { type V03Locale } from '../../wiki';

import type { V03GameState } from '../../types';

import { COPY, ORDER_REASON_COPY } from './app-copy-1';
export function localizeOrderMessage(message: string, locale: V03Locale): string {
  const exact: Record<string, Record<V03Locale, string>> = {
    'The full request is ready for dispatch.': {
      en: 'The full request is ready for dispatch.',
      zh: '完整需求已可出发。',
    },
    'The requested campaign force is ready for dispatch.': {
      en: 'The requested campaign force is ready for dispatch.',
      zh: '所需出征兵力已可出发。',
    },
    'The shipment has departed and its source cargo is debited.': {
      en: 'The shipment has departed and its source cargo is debited.',
      zh: '运输队已出发，来源城市资源已扣除。',
    },
    'The dispatched party is returning with all remaining cargo.': {
      en: 'The dispatched party is returning with all remaining cargo.',
      zh: '已派出的队伍正在返程，剩余货物随队返回。',
    },
    'The campaign party is returning before battle.': {
      en: 'The campaign party is returning before battle.',
      zh: '出征队伍将在交战前返程。',
    },
    'The requisition was cancelled before dispatch.': {
      en: 'The requisition was cancelled before dispatch.',
      zh: '征调命令已在出发前取消。',
    },
    'The campaign directive was cancelled before dispatch.': {
      en: 'The campaign directive was cancelled before dispatch.',
      zh: '出征命令已在出发前取消。',
    },
    'The destination warehouse is full; the cargo is waiting for capacity.': {
      en: 'The destination warehouse is full; the cargo is waiting for capacity.',
      zh: '目标仓库已满，货物正在等待空位。',
    },
  };
  if (exact[message]) return exact[message][locale];
  let localized = message;
  for (const [_code, copy] of Object.entries(ORDER_REASON_COPY) as [
    GovernanceOrderReasonCode,
    Record<V03Locale, string>,
  ][]) {
    if (localized.includes(copy.en)) localized = localized.replaceAll(copy.en, copy[locale]);
  }
  return localized;
}

export function localizeSaveError(message: string, locale: V03Locale): string {
  const routine = localizeRoutineFeedback(message, locale);
  if (routine !== null) return routine;
  if (locale === 'en') return message;
  if (message.includes('older officer roster'))
    return '该存档使用旧人物名册，无法直接载入。请先导出原始存档，再开始新战役；现有数据未更改。';
  if (message.includes('newer officer roster'))
    return '该存档使用更新的人物名册，请使用兼容版本打开；现有数据未更改。';
  if (message.includes('predates the wounded personnel schema'))
    return '该存档早于伤兵数据结构，无法直接载入。请先导出原始存档，再开始新战役；现有数据未更改。';
  if (message.includes('newer personnel schema'))
    return '该存档使用更新的兵员数据结构，请使用兼容版本打开；现有数据未更改。';
  if (message.includes('not valid JSON')) return '该存档不是有效的 JSON 文件。';
  if (message.includes('older version'))
    return '该存档属于旧版本。请开始新的 v0.3 战役；现有数据未更改。';
  if (message.includes('exceeds the v0.3 save limit')) return COPY.zh.fileTooLarge;
  if (message.includes('inconsistent campaign state')) return '存档中的战役状态不一致。';
  if (message.includes('not a valid hegemony.save')) return COPY.zh.invalidSave;
  if (message.includes('not serializable JSON')) return '该文件无法转换为有效的 JSON。';
  if (message.includes('campaign state is not valid')) return 'v0.3 战役状态无效，无法保存。';
  return message;
}

export function localizeAppMessage(
  message: string,
  locale: V03Locale,
  state?: V03GameState,
): string {
  const routine = localizeRoutineFeedback(message, locale, state);
  if (routine !== null) return routine;
  if (locale === 'en') return message;
  const orderMessage = localizeOrderMessage(message, locale);
  if (orderMessage !== message) return orderMessage;
  let match = message.match(/^Advanced (\d+) days?\.$/);
  if (match) return `战役推进了 ${match[1]} 日。`;
  const exact: Record<string, string> = {
    'The party will return by a safe route.': '部队将沿安全路线返回。',
    'Journeys can only be recalled during campaign planning.': '只能在战略阶段召回行程。',
    'This journey cannot be recalled.': '此行程当前无法召回。',
    'A return is already requested for this journey.': '此行程已请求返程。',
    'A force already engaged in battle cannot be recalled.': '已进入战斗的部队无法召回。',
    'The appointment is queued for the next monthly settlement.': '任命已排入下次月度结算。',
    'A six-month alliance was formed.': '六個月同盟已成立。',
    'The alliance has ended.': '同盟已解除。',
    'The coalition alliance is active for six months.': '聯盟同盟將持續六個月。',
    'All active battles completed their day; the campaign advanced one day.':
      '所有战场均已结束本日指令，战役推进了一日。',
    'Battle day complete. Resolve the other active battles to advance the campaign.':
      '本场战斗日已提交。完成其他战场后战役才会推进。',
    'This battle is no longer active.': '本场战斗已不再进行。',
    'This battle day is already complete; wait for the other battles.':
      '本场战斗日已结束，请等待其他战场。',
    'This is not the player-controlled side.': '此战场并非由玩家控制。',
    'Select a living unit.': '请选择一支存活部队。',
    'You can command only your own units.': '只能指挥己方部队。',
    'This battle has ended.': '本场战斗已结束。',
    'Choose a living target.': '请选择一支存活的目标部队。',
    'That cell is blocked, impassable, or beyond movement range.':
      '该格被阻挡、无法通行或超出移动范围。',
    'No local free officer is available to search for.': '本城暂无可搜索招募的在野人物。',
    'This officer is reserved for an approved order.': '此武将已被批准的命令预留。',
    'This officer is already completely loyal.': '此武将的忠诚已满。',
    'This officer already has fine arms.': '此武将已配备精良兵器。',
    'This officer has reached the fine-arms force limit.': '此武将已达到精良兵器的武力上限。',
  };
  if (exact[message]) return exact[message];
  match = message.match(/^The city needs (\d+) gold to reward an officer\.$/);
  if (match) return `赏赐武将需要 ${match[1]} 金。`;
  match = message.match(/^The city needs (\d+) gold to relieve the people\.$/);
  if (match) return `赈济百姓需要 ${match[1]} 金。`;
  match = message.match(/^The city needs (\d+) food to relieve the people\.$/);
  if (match) return `赈济百姓需要 ${match[1]} 粮。`;
  match = message.match(/^The city needs (\d+) gold to issue fine arms\.$/);
  if (match) return `配发精良兵器需要 ${match[1]} 金。`;
  match = message.match(/^(.+) received a reward and gained up to 15 loyalty\.$/);
  if (match) return `${match[1]}接受赏赐，忠诚提高最多 15。`;
  match = message.match(/^(.+) distributed grain: up to 15 city loyalty and 300 population\.$/);
  if (match) return `${match[1]}开仓赈济，民心提高最多 15，人口增加 300。`;
  match = message.match(/^(.+) received fine arms and gained up to 5 force\.$/);
  if (match) return `${match[1]}获配精良兵器，武力提高最多 5。`;
  const declinedAlliance = message.match(/^The alliance offer was declined \((\d+)% chance\)\.$/);
  if (declinedAlliance) return `同盟提議遭到拒絕（接受概率 ${declinedAlliance[1]}%）。`;
  const tacticReason = localizeTacticReason(message, locale, state);
  if (tacticReason !== message) return tacticReason;
  return message;
}

export function tacticLabel(tactic: BattleTactic, locale: V03Locale): string {
  const labels: Record<BattleTactic, Record<V03Locale, string>> = {
    fire: { en: 'Fire attack', zh: '火计' },
    rally: { en: 'Rally', zh: '鼓舞' },
    confuse: { en: 'Confuse', zh: '混乱' },
    raidSupply: { en: 'Raid supplies', zh: '劫粮' },
    ambush: { en: 'Ambush', zh: '伏兵' },
    rockfall: { en: 'Rockfall', zh: '落石' },
  };
  return labels[tactic][locale];
}

export function localizeTacticReason(
  reason: string,
  locale: V03Locale,
  state?: V03GameState,
): string {
  if (locale === 'en') return reason;
  const exact: Record<string, string> = {
    'Militia cannot use tactics.': '民兵不能使用计策。',
    'Routed units cannot use tactics.': '溃败部队不能使用计策。',
    'Wavering units cannot use tactics.': '动摇部队不能使用计策。',
    'Ambush requires standing in a forest.': '伏兵要求部队位于森林。',
    'Ambush requires a unit that has not moved today.': '伏兵要求部队今日尚未移动。',
    'Rockfall requires standing on a hill.': '落石要求部队位于山地。',
    'Select a living unit.': '请选择一支存活部队。',
    'This battle has ended.': '本场战斗已结束。',
  };
  if (exact[reason]) return exact[reason];
  let match = reason.match(/^Fire requires intellect (\d+)\.$/);
  if (match) return `火计要求智力达到 ${match[1]}。`;
  match = reason.match(/^Confuse requires intellect (\d+)\.$/);
  if (match) return `混乱要求智力达到 ${match[1]}。`;
  match = reason.match(/^Rally requires intellect (\d+) or force 85\.$/);
  if (match) return `鼓舞要求智力达到 ${match[1]} 或武力达到 85。`;
  match = reason.match(/^Raid supplies requires intellect (\d+) or cavalry\.$/);
  if (match) return `劫粮要求智力达到 ${match[1]} 或使用骑兵。`;
  match = reason.match(/^Ambush requires intellect (\d+)\.$/);
  if (match) return `伏兵要求智力达到 ${match[1]}。`;
  match = reason.match(/^Rockfall requires intellect (\d+)\.$/);
  if (match) return `落石要求智力达到 ${match[1]}。`;
  match = reason.match(/^Requires (\d+) tactic points\.$/);
  if (match) return `需要 ${match[1]} 点计策点。`;
  match = reason.match(/^(.+) has already acted today\.$/);
  if (match) return `${localizeV03PersonOrFormationName(match[1]!, locale, state)}今日已经行动。`;
  match = reason.match(/^(.+) is confused and will lose the rest of today\.$/);
  if (match)
    return `${localizeV03PersonOrFormationName(match[1]!, locale, state)}陷入混乱，今日无法继续行动。`;
  return reason;
}

export function localizeBattleLogLine(
  line: string,
  state: V03GameState,
  locale: V03Locale,
): string {
  const routine = localizeRoutineBattleLog(line, state, locale);
  if (routine !== null) return routine;
  if (locale === 'en') return line;
  const side = (value: string) =>
    value === 'attacker' ? '攻方' : value === 'defender' ? '守方' : value;
  const person = (name: string) => localizeV03PersonOrFormationName(name, locale, state);
  let match = line.match(/^Battle day (\d+) begins\.$/);
  if (match) return `战斗第 ${match[1]} 日开始。`;
  match = line.match(/^(attacker|defender) wins by elimination\.$/);
  if (match) return `${side(match[1]!)}因歼灭敌军而获胜。`;
  if (line === 'Both armies are eliminated.') return '双方部队均已全灭。';
  match = line.match(
    /^(attacker|defender) forces retreat from the field; (attacker|defender) holds the battlefield\.$/,
  );
  if (match) return `${side(match[1]!)}撤离战场，${side(match[2]!)}控制战场。`;
  match = line.match(
    /^(.+) attacks (.+): (\d+) casualties(?: \(water ([\d.]+)× attack × ([\d.]+)× damage received\))?\.$/,
  );
  if (match)
    return `${person(match[1]!)}攻击${person(match[2]!)}：伤亡 ${Number(match[3]).toLocaleString()}${match[4] ? `（水上修正：攻击 ×${match[4]}，承伤 ×${match[5]}）` : ''}。`;
  match = line.match(
    /^(.+) moves to \((\d+), (\d+)\)(; now on water, attack −25%, damage received \+25%)?\.$/,
  );
  if (match)
    return `${person(match[1]!)}移动至（${Number(match[2])}, ${Number(match[3])}）${match[4] ? '，现处于水上：攻击 −25%、承伤 +25%' : ''}。`;
  match = line.match(/^(.+) holds position\.$/);
  if (match) return `${person(match[1]!)}原地待命。`;
  match = line.match(/^(.+) controls the field when the (\d+)-day limit is reached\.$/);
  if (match) return `达到 ${match[2]} 日上限时，${side(match[1]!)}控制战场。`;
  match = line.match(/^The battle ends in a draw at the (\d+)-day limit\.$/);
  if (match) return `达到 ${match[1]} 日上限，战斗以平局结束。`;
  match = line.match(/^(.+) lacks rations; the hungry units lose men and morale\.$/);
  if (match) return `${side(match[1]!)}粮草不足，饥饿部队损失兵力与士气。`;
  return line;
}
