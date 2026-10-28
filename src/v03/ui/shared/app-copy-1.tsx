import type { GovernanceOrderReasonCode } from '../../governance/orders';

import { type V03Locale, type V03WikiTopic } from '../../wiki';

export { COPY } from '../../i18n';

export const TOPIC_LABEL: Record<V03Locale, Record<V03WikiTopic, string>> = {
  en: {
    overview: 'Getting started',
    calendar: 'Calendar',
    movement: 'Travel',
    units: 'Troops',
    battle: 'Battle controls',
    water: 'Water combat',
    governance: 'Governors',
    requisition: 'Orders',
    diplomacy: 'Diplomacy',
  },
  zh: {
    overview: '新手入门',
    calendar: '日历',
    movement: '行军',
    units: '兵种',
    battle: '战斗操作',
    water: '水战',
    governance: '太守',
    requisition: '征调与出征',
    diplomacy: '外交與同盟',
  },
};

export const ORDER_REASON_COPY: Record<GovernanceOrderReasonCode, Record<V03Locale, string>> = {
  'order.city-committed': {
    en: 'This city is committed to an active battle.',
    zh: '此城正在交战，无法调动。',
  },
  'order.invalid-phase': {
    en: 'Orders can only be issued during campaign planning.',
    zh: '只能在战略阶段下达命令。',
  },
  'order.invalid-amount': {
    en: 'Enter a positive whole-number amount within the available range.',
    zh: '请输入范围内的正整数。',
  },
  'order.source-unavailable': {
    en: 'The source city is no longer held by your faction.',
    zh: '来源城市已不再属于你的势力。',
  },
  'order.target-unavailable': {
    en: 'The destination city no longer exists.',
    zh: '目标城市不存在。',
  },
  'order.same-city': { en: 'Choose a different destination city.', zh: '请选择另一座目标城市。' },
  'order.target-not-friendly': {
    en: 'The destination must be held by your faction.',
    zh: '目标城市必须属于己方势力。',
  },
  'order.target-is-friendly': {
    en: 'A campaign directive must target an enemy or independent city.',
    zh: '出征目标必须是敌方或中立城市。',
  },
  'order.target-allied': {
    en: 'An active alliance prevents this attack.',
    zh: '现行同盟禁止攻击该势力。',
  },
  'order.target-cooldown': {
    en: 'This city is recovering from a recent raid or sack.',
    zh: '该城市仍在近期突袭或劫掠后的恢复期。',
  },
  'order.route-unavailable': {
    en: 'There is no currently usable route to the destination.',
    zh: '当前没有可用路线通往目标。',
  },
  'order.party-unavailable': {
    en: 'The governor cannot assemble an available force for this order.',
    zh: '太守无法为此命令编成可用部队。',
  },
  'order.minimum-garrison': {
    en: 'The city must retain its protected minimum garrison.',
    zh: '城市必须保留最低守备兵力。',
  },
  'order.shortfall': {
    en: 'The full request is not currently executable; choose a reduced amount, wait, or cancel.',
    zh: '目前无法足额执行；可以缩减需求、等待或取消。',
  },
  'order.travel-food-shortfall': {
    en: 'The source needs additional food to provision the travelling troops.',
    zh: '出发城粮食不足，无法为调动部队备齐路粮。',
  },
  'order.deadline-too-soon': {
    en: 'The earliest feasible departure is later than the requested deadline.',
    zh: '最早可出发日期晚于要求期限。',
  },
  'order.active-directive': {
    en: 'This source city already has an active campaign directive.',
    zh: '来源城市已有一项进行中的出征命令。',
  },
  'order.stale-proposal': {
    en: 'Authority, resources, or the route changed; review the refreshed proposal before confirming.',
    zh: '权限、资源或路线已变化；请先检查更新后的方案。',
  },
  'order.invalid-choice': {
    en: 'This answer is not valid for the current order state.',
    zh: '当前命令状态不接受此操作。',
  },
  'order.invalid-reduction': {
    en: 'The reduced amount must be positive and no greater than the current executable proposal.',
    zh: '缩减数量必须大于零，且不能超过当前可执行方案。',
  },
  'order.already-dispatched': {
    en: 'This order has already been dispatched; no additional resources were taken.',
    zh: '此命令已经出发，没有再次扣除资源。',
  },
  'order.already-closed': { en: 'This order is already closed.', zh: '此命令已经结束。' },
  'order.dispatch-failed': {
    en: 'The shipment could not be created; no resources or officers were changed.',
    zh: '无法创建运输队，资源与武将均未改变。',
  },
  'order.not-found': { en: 'The requested order could not be found.', zh: '找不到该命令。' },
};
