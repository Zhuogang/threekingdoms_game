import { useEffect, useMemo, useRef, useState } from 'react';
import { scenarioById } from '../content/scenario';
import {
  getUnitAttackTargets,
  getUnitReachableTiles,
  predictBattleAttack,
  getAvailableBattleTactics,
  getBattleTacticTargets,
  predictBattleTactic,
  WATER_ATTACK_MULTIPLIER,
  WATER_INCOMING_DAMAGE_MULTIPLIER,
  type BattleTactic,
} from './battle';
import {
  CITY_GEOGRAPHY,
  ROUTE_DEFINITIONS,
  projectCampaignPoint,
  projectCampaignRoute,
  projectCityRoute,
  projectJourneyPosition,
  type CityId,
} from './geography';
import { CAMPAIGN_MOUNTAIN_RANGES, CAMPAIGN_WATERWAYS } from './geography/illustration';
import { executeV03Command } from './commands';
import { v03CurrentDate } from './engine';
import { getCityCapabilities } from './governance/authority';
import { cityWorkQuota, cityWorkUsedThisMonth } from './governance/city-actions';
import { createV03OrderServices } from './governance/services';
import type { GovernanceOrderReasonCode } from './governance/orders';
import {
  loadV03Autosave,
  saveV03Autosave,
  encodeV03Save,
  decodeV03Save,
  V03_MAX_SAVE_BYTES,
} from './platform/storage';
import { getV03WikiArticles, type V03Locale, type V03WikiTopic } from './wiki';
import { getV03AllianceChance } from './campaign/diplomacy';
import { isV03AllianceActive } from './campaign/monthly-systems';
import {
  CampaignMinimap,
  CampaignMapView,
  BattlefieldMapView,
  BattlefieldMinimap,
  battlefieldBounds,
  battlefieldViewportGridPolygon,
  clusterVisibleCampaignParties,
  fitBattlefieldViewport,
  fitCampaignViewport,
  focusBattlefieldViewport,
  focusBattlefieldPointsViewport,
  focusCampaignViewport,
  gridToWorld,
  recenterBattlefieldViewport,
  recenterCampaignViewport,
  resizeBattlefieldViewport,
  resizeCampaignViewport,
  zoomBattlefieldViewport,
  zoomCampaignViewport,
  type BattlefieldViewBox,
  type CampaignCityVisual,
  type CampaignViewBox,
  type WorldPolyline,
} from './rendering';
import { troopGlyph } from './rendering/presentation';
import { V03_ASSETS, resolvePublicAsset } from './rendering/assets';
import { createV03Game, availableV03Scenarios } from './initial-state';
import type { V03BattleIntent, V03DomainEvent, V03GameState, V03JourneyCargo } from './types';
import { gameDate } from './types';
import './styles.css';

type TextKey =
  | 'title'
  | 'subtitle'
  | 'newCampaign'
  | 'resume'
  | 'scenario'
  | 'ruler'
  | 'start'
  | 'campaign'
  | 'battle'
  | 'date'
  | 'advanceDay'
  | 'advanceTen'
  | 'nextEvent'
  | 'wiki'
  | 'save'
  | 'load'
  | 'export'
  | 'import'
  | 'city'
  | 'faction'
  | 'governor'
  | 'localSteward'
  | 'rulerCapital'
  | 'garrison'
  | 'food'
  | 'gold'
  | 'loyalty'
  | 'routes'
  | 'distance'
  | 'travel'
  | 'territory'
  | 'governance'
  | 'appoint'
  | 'dismiss'
  | 'directWork'
  | 'improveFarm'
  | 'improveMarket'
  | 'workRemaining'
  | 'search'
  | 'recruit'
  | 'train'
  | 'security'
  | 'feast'
  | 'rewardOfficer'
  | 'relievePeople'
  | 'issueFineArms'
  | 'fineArmsEquipped'
  | 'noFineArms'
  | 'buyFood'
  | 'sellFood'
  | 'assignTroops'
  | 'assignmentAmount'
  | 'requestSupplies'
  | 'orderMarch'
  | 'from'
  | 'to'
  | 'troops'
  | 'intent'
  | 'conquer'
  | 'raid'
  | 'sack'
  | 'request'
  | 'issue'
  | 'battleOrders'
  | 'advanceBattle'
  | 'battleDaySubmitted'
  | 'resolveOtherBattles'
  | 'selectUnit'
  | 'moveHelp'
  | 'attackHelp'
  | 'noCity'
  | 'events'
  | 'acknowledge'
  | 'shortage'
  | 'acceptReduced'
  | 'wait'
  | 'cancel'
  | 'close'
  | 'overview'
  | 'calendar'
  | 'movement'
  | 'units'
  | 'battleWiki'
  | 'water'
  | 'governanceWiki'
  | 'requisition'
  | 'saved'
  | 'savingFailed'
  | 'imported'
  | 'invalidSave'
  | 'waterRule'
  | 'campaignOrders'
  | 'diplomacy'
  | 'proposeAlliance'
  | 'acceptChance'
  | 'propose'
  | 'breakAlliance'
  | 'activeAlliance'
  | 'monthsRemaining'
  | 'coalitionInvitation'
  | 'joinCoalition'
  | 'owned'
  | 'planMessage'
  | 'emptyOrders'
  | 'dayLimit'
  | 'deadline'
  | 'resourceTroops'
  | 'estimatedArrival'
  | 'routeStops'
  | 'noRoute'
  | 'planAvailable'
  | 'planGap'
  | 'inTransit'
  | 'recallJourney'
  | 'recallRequested'
  | 'accept'
  | 'requested'
  | 'reduceTo'
  | 'cargoGold'
  | 'cargoFood'
  | 'cargoTroops'
  | 'reasons'
  | 'searchWiki'
  | 'noWikiResults'
  | 'saveRetry'
  | 'saveFailed'
  | 'exportFailed'
  | 'fileTooLarge'
  | 'retreat'
  | 'retreatWarning'
  | 'retreatOutcome'
  | 'routeDistance'
  | 'tactics'
  | 'tacticPoints'
  | 'chooseTactic'
  | 'tacticCost'
  | 'tacticChance'
  | 'tacticCasualties'
  | 'tacticMorale'
  | 'tacticSupplies'
  | 'tacticNoTargets'
  | 'battleMapCamera'
  | 'battleMapZoomOut'
  | 'battleMapZoomIn'
  | 'battleMapFit'
  | 'battleMapFocusUnit'
  | 'battleMapFocusCamps'
  | 'battleMapNoCamps'
  | 'battleDayLabel'
  | 'tacticChooseTarget'
  | 'rangeLabel'
  | 'waitAction'
  | 'estimatedLosses'
  | 'counterattackLabel'
  | 'waterTargetDamage'
  | 'waterAttackPenalty'
  | 'landModifiers'
  | 'battleLog'
  | 'targetCount'
  | 'unitReady'
  | 'unitMoved'
  | 'unitActed'
  | 'unitConfused'
  | 'unitInspired'
  | 'journeyGroup';

const COPY: Record<V03Locale, Record<TextKey, string>> = {
  en: {
    title: 'Hegemony of the Three Kingdoms',
    subtitle: 'A new Three Kingdoms strategy game · v0.3',
    newCampaign: 'New campaign',
    resume: 'Resume saved campaign',
    scenario: 'Scenario',
    ruler: 'Choose your house',
    start: 'Begin campaign',
    campaign: 'Campaign',
    battle: 'Field battle',
    date: 'Date',
    advanceDay: 'Advance 1 day',
    advanceTen: 'Advance 10 days',
    nextEvent: 'Next event',
    wiki: 'Field guide / Wiki',
    save: 'Save',
    load: 'Import',
    export: 'Export',
    import: 'Import a v0.3 save',
    city: 'City',
    faction: 'Faction',
    governor: 'Governor',
    localSteward: 'Local stewardship',
    rulerCapital: 'Ruler’s capital',
    garrison: 'Garrison',
    food: 'Food',
    gold: 'Gold',
    loyalty: 'Loyalty',
    routes: 'Roads',
    distance: 'Estimated road distance',
    travel: 'Estimated travel',
    territory: 'Controlled cities',
    governance: 'Governance',
    appoint: 'Appoint governor',
    dismiss: 'Dismiss governor',
    directWork: 'Capital development',
    improveFarm: 'Improve farmland · 80 gold',
    improveMarket: 'Improve commerce · 80 gold',
    workRemaining: 'Monthly work points remaining',
    search: 'Search for officers',
    recruit: 'Recruit soldiers',
    train: 'Train',
    security: 'Restore public order',
    feast: 'Host a feast',
    rewardOfficer: 'Reward officer · 100 gold (+15 loyalty)',
    relievePeople: 'Relieve people · 80 gold + 600 food',
    issueFineArms: 'Issue fine arms · 180 gold (+5 force)',
    fineArmsEquipped: 'Fine arms equipped · +5 force',
    noFineArms: 'No fine arms issued',
    buyFood: 'Buy 800 food · 80 gold',
    sellFood: 'Sell 800 food · 80 gold',
    assignTroops: 'Set troop count',
    assignmentAmount: 'Officer troop count',
    requestSupplies: 'Request supplies',
    orderMarch: 'Order a march',
    from: 'Source',
    to: 'Destination',
    troops: 'Troops',
    intent: 'Mission',
    conquer: 'Capture',
    raid: 'Raid',
    sack: 'Sack',
    request: 'Submit request',
    issue: 'Issue order',
    battleOrders: 'Battle orders',
    advanceBattle: 'End battle day',
    battleDaySubmitted: 'Day submitted',
    resolveOtherBattles: 'Submit the day in the other active battles to advance the campaign.',
    selectUnit: 'Select a friendly unit',
    moveHelp: 'Green cells are reachable. Select a unit, then click a green cell to move.',
    attackHelp: 'Choose a target in range, or click an enemy highlighted in red.',
    noCity: 'Select a city on the map to inspect it.',
    events: 'Reports and events',
    acknowledge: 'Acknowledge',
    shortage: 'Shortfall',
    acceptReduced: 'Accept reduced plan',
    wait: 'Wait for full plan',
    cancel: 'Cancel',
    close: 'Close',
    overview: 'Getting started',
    calendar: 'Calendar and time',
    movement: 'Cities, routes, and travel',
    units: 'Troop types',
    battleWiki: 'Battle controls',
    water: 'Water combat',
    governanceWiki: 'Governors and city control',
    requisition: 'Resource and campaign orders',
    saved: 'Campaign saved locally.',
    savingFailed: 'Autosave failed',
    imported: 'Save imported.',
    invalidSave: 'This is not a valid v0.3 save.',
    waterRule:
      'On water: attack ×0.75; incoming troop damage ×1.25. Every troop type uses the same rule.',
    campaignOrders: 'Orders',
    diplomacy: 'Diplomacy',
    proposeAlliance: 'Propose six-month alliance',
    acceptChance: 'Acceptance chance',
    propose: 'Propose alliance',
    breakAlliance: 'End alliance',
    activeAlliance: 'Active alliance',
    monthsRemaining: 'months remaining',
    coalitionInvitation: 'Coalition invitation',
    joinCoalition: 'Join coalition',
    owned: 'Owned',
    planMessage:
      'The governor’s plan includes its proposed strength, supply gap, earliest departure and arrival estimate.',
    emptyOrders: 'No active orders.',
    dayLimit:
      'At the 30-day limit, the side with more surviving troops controls the field; ties go to the defender.',
    deadline: 'Latest departure day (blank = no deadline)',
    resourceTroops: 'Reinforcements',
    estimatedArrival: 'Estimated arrival',
    routeStops: 'Route via',
    noRoute: 'No currently legal friendly route.',
    planAvailable: 'Executable',
    planGap: 'Shortfall',
    inTransit: 'In transit or waiting at destination',
    recallJourney: 'Recall to friendly territory',
    recallRequested: 'Return requested; the party will finish its current leg first.',
    accept: 'Accept plan',
    requested: 'Requested',
    reduceTo: 'Reduce to',
    cargoGold: 'Gold to send',
    cargoFood: 'Food to send',
    cargoTroops: 'Troops to send',
    reasons: 'Plan notes',
    searchWiki: 'Search the field guide',
    noWikiResults: 'No guide sections match this search.',
    saveRetry: 'Retry save',
    saveFailed: 'The campaign could not be saved. Your current game is still open.',
    exportFailed: 'The save file could not be exported.',
    fileTooLarge: 'This save file exceeds the 16 MiB import limit.',
    retreat: 'Withdraw from battle',
    retreatWarning: 'This immediately concedes the field and ends this battle.',
    retreatOutcome: 'Your forces withdraw; the opposing side holds the field.',
    routeDistance: 'Road distance',
    tactics: 'Tactics',
    tacticPoints: 'Tactic points',
    chooseTactic: 'Choose a tactic, then select a highlighted target on the map.',
    tacticCost: 'Cost',
    tacticChance: 'Chance',
    tacticCasualties: 'Possible casualties',
    tacticMorale: 'Morale change',
    tacticSupplies: 'Supplies seized',
    tacticNoTargets: 'No legal targets are in range.',
    battleMapCamera: 'Battlefield camera',
    battleMapZoomOut: 'Zoom out battlefield',
    battleMapZoomIn: 'Zoom in battlefield',
    battleMapFit: 'Fit full battlefield',
    battleMapFocusUnit: 'Focus selected unit',
    battleMapFocusCamps: 'Focus both field camps',
    battleMapNoCamps: 'No field camps are available to focus.',
    battleDayLabel: 'Battle day',
    tacticChooseTarget: 'Select a highlighted unit to use this tactic.',
    rangeLabel: 'range',
    waitAction: 'Wait',
    estimatedLosses: 'Est. losses',
    counterattackLabel: 'Counterattack',
    waterTargetDamage: 'Water target takes +25%',
    waterAttackPenalty: 'Water attack −25%',
    landModifiers: 'Land modifiers',
    battleLog: 'Battle log',
    targetCount: 'targets',
    unitReady: 'Ready to act',
    unitMoved: 'Moved · action available',
    unitActed: 'Acted for today',
    unitConfused: 'Confused',
    unitInspired: 'Inspired',
    journeyGroup: 'parties',
  },
  zh: {
    title: '三国霸业',
    subtitle: '独立发展的三国策略游戏 · v0.3',
    newCampaign: '新战役',
    resume: '继续已保存战役',
    scenario: '剧本',
    ruler: '选择势力',
    start: '开始战役',
    campaign: '战略地图',
    battle: '野战',
    date: '日期',
    advanceDay: '推进一日',
    advanceTen: '推进十日',
    nextEvent: '到下个事件',
    wiki: '游戏指南 / Wiki',
    save: '保存',
    load: '导入',
    export: '导出',
    import: '导入 v0.3 存档',
    city: '城市',
    faction: '势力',
    governor: '太守',
    localSteward: '地方班底自治',
    rulerCapital: '君主本城',
    garrison: '守军',
    food: '粮食',
    gold: '金钱',
    loyalty: '民心',
    routes: '道路',
    distance: '估算道路距离',
    travel: '估算行军时间',
    territory: '辖下城市',
    governance: '治理方式',
    appoint: '任命太守',
    dismiss: '免去太守',
    directWork: '君主本城治理',
    improveFarm: '发展农田 · 80 金',
    improveMarket: '发展商业 · 80 金',
    workRemaining: '本月剩余工作点',
    search: '搜索在野武将',
    recruit: '征募士兵',
    train: '训练',
    security: '恢复治安',
    feast: '举行宴饮',
    rewardOfficer: '赏赐武将 · 100 金（忠诚 +15）',
    relievePeople: '赈济百姓 · 80 金 + 600 粮',
    issueFineArms: '配发精良兵器 · 180 金（武力 +5）',
    fineArmsEquipped: '已配精良兵器 · 武力 +5',
    noFineArms: '未配精良兵器',
    buyFood: '购入 800 粮 · 80 金',
    sellFood: '出售 800 粮 · 80 金',
    assignTroops: '调整兵力',
    assignmentAmount: '将领兵力',
    requestSupplies: '征调资源',
    orderMarch: '下达出征令',
    from: '来源',
    to: '目标',
    troops: '兵力',
    intent: '任务',
    conquer: '攻取',
    raid: '突袭',
    sack: '劫掠',
    request: '提交征调',
    issue: '下达命令',
    battleOrders: '战斗指令',
    advanceBattle: '结束战斗日',
    battleDaySubmitted: '本场已提交',
    resolveOtherBattles: '请先提交其他战场的本日指令，之后战役时间才会推进。',
    selectUnit: '选择一支己方部队',
    moveHelp: '绿色格为可移动位置。先选部队，再点击绿色格移动。',
    attackHelp: '选择射程内的目标，或点击红色高亮的敌军。',
    noCity: '请在地图上选择一座城市查看详情。',
    events: '报告与事件',
    acknowledge: '确认',
    shortage: '资源缺口',
    acceptReduced: '接受缩减方案',
    wait: '等待足额方案',
    cancel: '取消',
    close: '关闭',
    overview: '新手入门',
    calendar: '日历与时间',
    movement: '城市、路线与行军',
    units: '兵种',
    battleWiki: '战斗操作',
    water: '水战',
    governanceWiki: '太守与城市治理',
    requisition: '征调资源与出征命令',
    saved: '战役已保存在本地。',
    savingFailed: '自动存档失败',
    imported: '存档已导入。',
    invalidSave: '这不是有效的 v0.3 存档。',
    waterRule: '水上：攻击 ×0.75；受到的兵力伤害 ×1.25。所有兵种采用同一规则。',
    campaignOrders: '命令',
    diplomacy: '外交',
    proposeAlliance: '提議六個月同盟',
    acceptChance: '接受概率',
    propose: '提出同盟',
    breakAlliance: '解除同盟',
    activeAlliance: '現行同盟',
    monthsRemaining: '個月後到期',
    coalitionInvitation: '聯盟邀請',
    joinCoalition: '加入聯盟',
    owned: '辖下城市',
    planMessage: '太守方案会列出可执行兵力、粮草缺口、最早出发日和预计抵达日。',
    emptyOrders: '暂无待处理命令。',
    dayLimit: '到 30 日时限，剩余兵力较多的一方控制战场；若兵力相同，则由守方获胜。',
    deadline: '最晚出发日（留空表示不限期）',
    resourceTroops: '增援兵力',
    estimatedArrival: '预计抵达',
    routeStops: '途经',
    noRoute: '当前没有合法的友方路线。',
    planAvailable: '可执行',
    planGap: '缺口',
    inTransit: '运输中或等待目的地接收',
    recallJourney: '召回至友方城市',
    recallRequested: '已请求返程；部队会先完成当前路段。',
    accept: '接受方案',
    requested: '需求',
    reduceTo: '缩减为',
    cargoGold: '运送金钱',
    cargoFood: '运送粮食',
    cargoTroops: '运送兵力',
    reasons: '方案说明',
    searchWiki: '搜索游戏指南',
    noWikiResults: '没有符合搜索内容的指南条目。',
    saveRetry: '重试保存',
    saveFailed: '无法保存战役，当前游戏仍保持打开。',
    exportFailed: '无法导出存档文件。',
    fileTooLarge: '该存档超过 16 MiB 导入上限。',
    retreat: '撤离战场',
    retreatWarning: '此操作会立即认输并结束本场战斗。',
    retreatOutcome: '己方撤离战场，对方控制战场。',
    routeDistance: '道路距离',
    tactics: '计策',
    tacticPoints: '计策点',
    chooseTactic: '选择计策后，在地图上点击高亮目标。',
    tacticCost: '消耗',
    tacticChance: '成功率',
    tacticCasualties: '预计伤亡',
    tacticMorale: '士气变化',
    tacticSupplies: '夺取粮草',
    tacticNoTargets: '当前没有合法的射程内目标。',
    battleMapCamera: '战场镜头',
    battleMapZoomOut: '缩小战场',
    battleMapZoomIn: '放大战场',
    battleMapFit: '显示全图',
    battleMapFocusUnit: '聚焦选中部队',
    battleMapFocusCamps: '聚焦双方营地',
    battleMapNoCamps: '没有可聚焦的野战营地。',
    battleDayLabel: '战日',
    tacticChooseTarget: '请点击高亮部队来施展计策。',
    rangeLabel: '射程',
    waitAction: '待命',
    estimatedLosses: '预计伤亡',
    counterattackLabel: '反击',
    waterTargetDamage: '水上目标承伤 +25%',
    waterAttackPenalty: '水上攻击 −25%',
    landModifiers: '陆上修正',
    battleLog: '战况',
    targetCount: '个目标',
    unitReady: '尚未行动',
    unitMoved: '已移动 · 可继续行动',
    unitActed: '今日已行动',
    unitConfused: '混乱',
    unitInspired: '受鼓舞',
    journeyGroup: '支队',
  },
};

const TOPIC_LABEL: Record<V03Locale, Record<V03WikiTopic, string>> = {
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

const ORDER_REASON_COPY: Record<GovernanceOrderReasonCode, Record<V03Locale, string>> = {
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

function localizeOrderMessage(message: string, locale: V03Locale): string {
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

function localizeSaveError(message: string, locale: V03Locale): string {
  if (locale === 'en') return message;
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

function localizeAppMessage(message: string, locale: V03Locale): string {
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
  const tacticReason = localizeTacticReason(message, locale);
  if (tacticReason !== message) return tacticReason;
  return message;
}

function tacticLabel(tactic: BattleTactic, locale: V03Locale): string {
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

function localizeTacticReason(reason: string, locale: V03Locale): string {
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
  if (match) return `${match[1]}今日已经行动。`;
  match = reason.match(/^(.+) is confused and will lose the rest of today\.$/);
  if (match) return `${match[1]}陷入混乱，今日无法继续行动。`;
  return reason;
}

function localizeBattleLogLine(line: string, state: V03GameState, locale: V03Locale): string {
  if (locale === 'en') return line;
  const side = (value: string) =>
    value === 'attacker' ? '攻方' : value === 'defender' ? '守方' : value;
  const person = (name: string) =>
    state.officers.find((officer) => officer.name === name || officer.chinese === name)?.chinese ??
    name;
  let match = line.match(/^Battle day (\d+) begins\.$/);
  if (match) return `战斗第 ${match[1]} 日开始。`;
  match = line.match(/^(attacker|defender) wins by elimination\.$/);
  if (match) return `${side(match[1]!)}因歼灭敌军而获胜。`;
  if (line === 'Both armies are eliminated.') return '双方部队均已全灭。';
  match = line.match(/^(attacker|defender) captures the opposing field camp\.$/);
  if (match) return `${side(match[1]!)}夺取了敌方营地。`;
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
    return `${person(match[1]!)}移动至（${Number(match[2]) + 1}, ${Number(match[3]) + 1}）${match[4] ? '，现处于水上：攻击 −25%、承伤 +25%' : ''}。`;
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

function localizedEvent(
  event: V03DomainEvent,
  state: V03GameState,
  locale: V03Locale,
): { title: string; detail: string } {
  const cityName = (id: string | null | undefined) => {
    const city = state.cities.find((entry) => entry.id === id);
    return city?.chinese ?? id ?? '未知城市';
  };
  const factionName = (id: string | null | undefined) => {
    if (!id) return '中立势力';
    return state.factions.find((faction) => faction.id === id)?.chinese ?? id;
  };
  if (event.kind === 'diplomacy') {
    const faction = factionName(event.entityId);
    const [result, rawChance] = event.detail.split(':');
    const chance = Number(rawChance);
    const titles: Record<string, Record<V03Locale, string>> = {
      'Alliance accepted': { en: 'Alliance accepted', zh: '同盟成立' },
      'Alliance declined': { en: 'Alliance declined', zh: '同盟遭拒' },
      'Alliance broken': { en: 'Alliance ended', zh: '同盟已解除' },
      'Coalition joined': { en: 'Coalition joined', zh: '已加入聯盟' },
    };
    const title = titles[event.title]?.[locale] ?? event.title;
    if (locale === 'zh') {
      if (result === 'accepted') return { title, detail: `與${faction}的六個月同盟已生效。` };
      if (result === 'declined')
        return { title, detail: `${faction}拒絕了提議（${chance}% 接受概率）。` };
      if (result === 'broken') return { title, detail: `與${faction}的同盟已解除。` };
      return { title, detail: `${faction}加入討伐董卓聯盟，並與存續盟友締結六個月同盟。` };
    }
    if (result === 'accepted')
      return { title, detail: `A six-month alliance with ${faction} is now active.` };
    if (result === 'declined')
      return { title, detail: `${faction} declined the offer (${chance}% acceptance chance).` };
    if (result === 'broken') return { title, detail: `The alliance with ${faction} has ended.` };
    return {
      title,
      detail: `${faction} joined the anti-Dong coalition and formed six-month treaties with its surviving members.`,
    };
  }
  if (event.kind === 'campaignEvent') {
    let payload: { key?: string; entityIds?: string[] } = {};
    try {
      payload = JSON.parse(event.detail) as typeof payload;
    } catch {
      /* Keep the event readable if imported text is malformed. */
    }
    if (
      payload.key === 'governor-appointment-delayed' ||
      payload.key === 'governor-appointment-cancelled'
    ) {
      const city = state.cities.find((entry) => entry.id === payload.entityIds?.[0]);
      const officer = state.officers.find((entry) => entry.id === payload.entityIds?.[1]);
      if (payload.key === 'governor-appointment-delayed')
        return locale === 'zh'
          ? {
              title: '太守任命延後',
              detail: `${officer?.chinese ?? '候選人'}尚未抵達${city?.chinese ?? '目標城市'}，任命將於下月再次檢查；目前治理安排保持不變。`,
            }
          : {
              title: 'Governor appointment delayed',
              detail: `${officer?.name ?? 'The candidate'} has not reached ${city?.name ?? 'the city'}. Current governance remains unchanged; the appointment will be checked again next month.`,
            };
      return locale === 'zh'
        ? {
            title: '太守任命已取消',
            detail: `${city?.chinese ?? '該城'}的候選人已不再符合任命條件，目前治理安排保持不變；你可以重新選擇人選。`,
          }
        : {
            title: 'Governor appointment cancelled',
            detail: `${city?.name ?? 'The city'}’s candidate is no longer eligible. Current governance remains unchanged; you may choose another candidate.`,
          };
    }
    const labels: Record<string, Record<V03Locale, string>> = {
      'anti-dong-coalition': {
        en: 'An anti-Dong coalition formed among rival houses.',
        zh: '諸侯組成了討伐董卓的聯盟。',
      },
      'dong-burns-luoyang': {
        en: 'Dong Zhuo evacuated Luoyang and moved officers, reserves, and supplies toward Chang’an.',
        zh: '董卓撤離洛陽，將武將、預備兵與物資轉往長安。',
      },
      plague: {
        en: 'A plague reduced city population and public support.',
        zh: '疫病造成城市人口與民心下降。',
      },
      'bumper-harvest': {
        en: 'A bumper harvest added food to the city stores.',
        zh: '豐收為城市糧倉增加了糧食。',
      },
      locusts: {
        en: 'Locusts consumed part of the city’s food stores.',
        zh: '蝗災消耗了部分城市存糧。',
      },
      bandits: {
        en: 'Bandits stole gold and reserves and weakened public support.',
        zh: '盜匪劫走金錢與預備兵，民心也有所下降。',
      },
      'wandering-officer': {
        en: 'A wandering officer moved to a new city.',
        zh: '一名在野武將前往新的城市。',
      },
      'come-of-age': {
        en: 'An officer came of age and improved force and intellect.',
        zh: '一名武將成年，統率與智力有所提升。',
      },
      festival: {
        en: 'A city held a festival, spending gold to improve public support.',
        zh: '城市舉辦節慶，花費金錢提升民心。',
      },
      drought: { en: 'Drought damaged farmland.', zh: '旱災損害了農田。' },
      scholar: {
        en: 'A scholar improved an officer’s intellect.',
        zh: '一名武將受到學者啟發，智力提升。',
      },
      'alliance-expired': { en: 'A six-month alliance expired.', zh: '一項六個月同盟已到期。' },
      'coalition-invitation': {
        en: 'The coalition invited your faction to join its treaties against Dong Zhuo.',
        zh: '討伐董卓的聯盟邀請你的勢力加入同盟。',
      },
    };
    const key = payload.key ?? '';
    const affected = (payload.entityIds ?? []).map((id) => {
      const city = state.cities.find((entry) => entry.id === id);
      const officer = state.officers.find((entry) => entry.id === id);
      const faction = state.factions.find((entry) => entry.id === id);
      return locale === 'zh'
        ? (city?.chinese ?? officer?.chinese ?? faction?.chinese ?? id)
        : (city?.name ?? officer?.name ?? faction?.name ?? id);
    });
    const body =
      labels[key]?.[locale] ??
      (locale === 'zh' ? '發生了一項戰役事件。' : 'A campaign event occurred.');
    const title =
      key === 'coalition-invitation'
        ? locale === 'zh'
          ? '討伐董卓聯盟邀請'
          : 'Anti-Dong Coalition Invitation'
        : locale === 'zh'
          ? '戰役事件'
          : 'Campaign event';
    return {
      title,
      detail:
        affected.length && key !== 'anti-dong-coalition'
          ? `${body} ${affected.join(locale === 'zh' ? '、' : ', ')}`
          : body,
    };
  }
  if (event.kind === 'hegemonWarning') {
    const faction = factionName(event.entityId);
    const months = Number(event.detail);
    return locale === 'zh'
      ? {
          title: '稱霸進度警告',
          detail: `${faction}已控制洛陽與十六座城市，連續維持 ${months} 個月。`,
        }
      : {
          title: event.title,
          detail: `${faction} holds Luoyang and sixteen cities; its claim has lasted ${months} month${months === 1 ? '' : 's'}.`,
        };
  }
  if (locale === 'en') return { title: event.title, detail: event.detail };
  if (event.kind === 'monthBoundary') {
    const date = gameDate({ startYear: state.startYear, absoluteDay: event.absoluteDay });
    return {
      title: '月度结算完成',
      detail: `${date.year} 年 ${date.month} 月的经济与治理变更已完成结算。`,
    };
  }
  if (event.kind === 'governorChanged') {
    const city = state.cities.find((entry) => entry.id === event.entityId);
    const officer = city?.governorId
      ? state.officers.find((entry) => entry.id === city.governorId)
      : null;
    return officer
      ? { title: '新太守就任', detail: `${officer.chinese}现任${city?.chinese ?? '该城'}太守。` }
      : { title: '城市改由地方班底治理', detail: `${city?.chinese ?? '该城'}目前没有正式太守。` };
  }
  if (event.kind === 'battleReady' || event.kind === 'battleResolved') {
    const battle = state.battles.find((entry) => entry.id === event.entityId);
    const journey = state.journeys.find((entry) => entry.id === battle?.attackerJourneyId);
    const target = cityName(journey?.destinationCityId);
    if (event.kind === 'battleReady' && battle)
      return {
        title: '野战开始',
        detail: `${factionName(battle.attackerFactionId)}在${target}附近遭遇${factionName(battle.defenderFactionId)}。`,
      };
    if (battle) {
      const winner = battle.outcome === 'draw' ? null : battle.outcome;
      const winningFactionId =
        winner === 'attacker'
          ? battle.attackerFactionId
          : winner === 'defender'
            ? battle.defenderFactionId
            : null;
      const title =
        event.title === 'Field victory'
          ? '野战获胜'
          : event.title === 'Field defeat'
            ? '野战失利'
            : '野战平局';
      return {
        title,
        detail: winningFactionId
          ? `${factionName(winningFactionId)}在${target}控制战场。`
          : `双方在${target}未分胜负，守方保有城市。`,
      };
    }
  }
  if (event.kind === 'journeyArrival') {
    const journey = state.journeys.find((entry) => entry.id === event.entityId);
    const target = cityName(journey?.destinationCityId);
    const titleMap: Record<string, string> = {
      'Army arrived without a commander': '部队抵达但没有可用主将',
      'Destination unavailable': '目标不可用',
      'Warehouse full': '仓库已满',
      'March arrived safely': '部队安全抵达',
      'Army awaiting battle queue': '部队等待战场队列',
      'Route redirected': '行程已改道',
      'Party awaiting refuge': '队伍等待安置',
      'Journey arrived': '行程抵达',
    };
    const title = titleMap[event.title] ?? '行程报告';
    if (event.title === 'Warehouse full')
      return { title, detail: `${target}的仓储容量不足；队伍与全部货物继续保留并等待卸货。` };
    if (event.title === 'March arrived safely')
      return { title, detail: `出征队抵达${target}时，该城已归友方控制，因此没有发生战斗。` };
    if (event.title === 'Army awaiting battle queue')
      return { title, detail: `${target}已有一场野战，部队在城外等待，粮草仍会持续消耗。` };
    if (event.title === 'Route redirected')
      return { title, detail: `${target}已不再友好，运输队正返回可通行的友方城市。` };
    if (event.title === 'Party awaiting refuge')
      return {
        title,
        detail: `${target}已不再友好，目前没有可到达的友方城市；队伍与货物仍记录在等待行程中。`,
      };
    if (event.title === 'Journey arrived') return { title, detail: '运输队已抵达目标城市。' };
    if (event.title === 'Army arrived without a commander')
      return { title, detail: `部队已抵达${target}，但没有可用的存活主将。` };
    if (event.title === 'Destination unavailable')
      return { title, detail: '目标城市已不存在，队伍和货物仍保留在等待行程中。' };
  }
  if (event.kind === 'factionEliminated')
    return { title: '你的势力已覆灭', detail: '旗下已没有任何城市。' };
  if (event.kind === 'victory') {
    const faction = factionName(event.entityId);
    if (event.title === 'Proclaimed Hegemon')
      return {
        title: '稱霸天下',
        detail: `${faction}連續十二個月控制洛陽與十六座城市，正式稱霸。`,
      };
    const unified = state.cities.every((city) => city.factionId === event.entityId);
    return unified
      ? { title: '天下一统', detail: `${faction}已控制全部城市。` }
      : { title: '战役结束', detail: `${faction}控制了你的旧都。` };
  }
  return { title: event.title, detail: localizeOrderMessage(event.detail, locale) };
}

const CAMPAIGN_BACKGROUND = resolvePublicAsset(
  V03_ASSETS.campaignMapInk01.path,
  import.meta.env.BASE_URL,
);
const CAMPAIGN_BOUNDS: CampaignViewBox = { left: 0, top: 0, width: 1000, height: 1000 };
function cityScale(cityId: string): CampaignCityVisual['scale'] {
  if (cityId === 'luoyang') return 'imperial';
  if (['changan', 'ye', 'chengdu', 'jianye', 'xiapi'].includes(cityId)) return 'major';
  if (cityId === 'pingyuan' || cityId === 'tianshui') return 'humble';
  return 'standard';
}

function dateLabel(state: V03GameState, locale: V03Locale): string {
  const date = v03CurrentDate(state);
  return locale === 'zh'
    ? `${date.year}年 ${date.month}月 ${date.dayOfMonth}日`
    : `${date.year} · Month ${date.month} · Day ${date.dayOfMonth}`;
}

function absoluteDateLabel(startYear: number, absoluteDay: number, locale: V03Locale): string {
  const date = gameDate({ startYear, absoluteDay });
  return locale === 'zh'
    ? `${date.year}年 ${date.month}月 ${date.day}日`
    : `${date.year} · Month ${date.month} · Day ${date.day}`;
}

function displayName(city: { name: string; chinese: string }, locale: V03Locale): string {
  return locale === 'zh' ? city.chinese : city.name;
}

function mapPosition(latitude: number, longitude: number) {
  return projectCampaignPoint(latitude, longitude);
}

function journeyPosition(journey: V03GameState['journeys'][number]) {
  const cityIds = journey.routeCityIds ?? [journey.sourceCityId, journey.destinationCityId];
  return projectJourneyPosition(
    cityIds as CityId[],
    journey.routeSnapshot.map((segment) => segment.lengthKm),
    journey.segmentProgressKm,
  );
}

export default function V03App() {
  const [locale, setLocale] = useState<V03Locale>('en');
  const [state, setState] = useState<V03GameState | null>(null);
  const [scenarioId, setScenarioId] = useState('divided-realm-190');
  const [factionId, setFactionId] = useState('cao');
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'campaign' | 'battle'>('campaign');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedTactic, setSelectedTactic] = useState<BattleTactic | null>(null);
  const [showWiki, setShowWiki] = useState(false);
  const [wikiTopic, setWikiTopic] = useState<V03WikiTopic>('overview');
  const [wikiSearch, setWikiSearch] = useState('');
  const wikiModalRef = useRef<HTMLElement>(null);
  const wikiReturnFocus = useRef<HTMLElement | null>(null);
  const [feedback, setFeedback] = useState('');
  const [autosaveError, setAutosaveError] = useState(false);
  const [requestKind, setRequestKind] = useState<'resource' | 'campaign'>('resource');
  const [targetCityId, setTargetCityId] = useState('');
  const [requestedTroops, setRequestedTroops] = useState(2000);
  const [requestedResourceTroops, setRequestedResourceTroops] = useState(0);
  const [requestedByDay, setRequestedByDay] = useState('');
  const [diplomacyTargetId, setDiplomacyTargetId] = useState('');
  const [requestedGold, setRequestedGold] = useState(300);
  const [requestedFood, setRequestedFood] = useState(1000);
  const [troopAssignments, setTroopAssignments] = useState<Record<string, number>>({});
  const [intent, setIntent] = useState<V03BattleIntent>('conquer');
  const [campaignViewport, setCampaignViewport] = useState<CampaignViewBox>(CAMPAIGN_BOUNDS);
  const [campaignFrameSize, setCampaignFrameSize] = useState({ width: 0, height: 0 });
  const campaignMapFrame = useRef<HTMLDivElement>(null);
  const campaignViewportInitialized = useRef(false);
  const [battleViewport, setBattleViewport] = useState<BattlefieldViewBox | null>(null);
  const battleMapFrame = useRef<HTMLDivElement>(null);
  const battleViewportIdentity = useRef<string | null>(null);
  const [orderPreview, setOrderPreview] = useState<{
    orderId: string;
    preview:
      | import('./governance/orders').RequisitionPreview
      | import('./governance/orders').CampaignDirectivePreview;
  } | null>(null);
  const [reducedCargoByOrder, setReducedCargoByOrder] = useState<Record<string, V03JourneyCargo>>(
    {},
  );
  const [reducedTroopsByOrder, setReducedTroopsByOrder] = useState<Record<string, number>>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const t = COPY[locale];
  const orderServices = useMemo(() => createV03OrderServices(), []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    if (!state) return;
    const frame = campaignMapFrame.current;
    if (!frame) return;
    const updateViewportForFrame = () => {
      const rect = frame.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setCampaignFrameSize({ width: rect.width, height: rect.height });
      setCampaignViewport((viewport) => {
        if (!campaignViewportInitialized.current) {
          campaignViewportInitialized.current = true;
          return fitCampaignViewport(CAMPAIGN_BOUNDS, rect.width / rect.height);
        }
        return resizeCampaignViewport(CAMPAIGN_BOUNDS, viewport, rect.width / rect.height);
      });
    };
    updateViewportForFrame();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewportForFrame);
      return () => window.removeEventListener('resize', updateViewportForFrame);
    }
    const observer = new ResizeObserver(updateViewportForFrame);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [Boolean(state)]);

  useEffect(() => {
    if (!showWiki) return;
    const firstControl = wikiModalRef.current?.querySelector<HTMLElement>(
      'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
    );
    firstControl?.focus();
  }, [showWiki]);

  useEffect(() => {
    const handleWikiShortcut = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault();
        if (!showWiki) {
          wikiReturnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setWikiTopic('overview');
          setShowWiki(true);
        }
      } else if (event.key === 'Escape' && showWiki) {
        setShowWiki(false);
      }
    };
    window.addEventListener('keydown', handleWikiShortcut);
    return () => window.removeEventListener('keydown', handleWikiShortcut);
  }, [showWiki]);

  useEffect(() => {
    if (showWiki) return;
    wikiReturnFocus.current?.focus();
    wikiReturnFocus.current = null;
  }, [showWiki]);

  useEffect(() => {
    try {
      const saved = loadV03Autosave();
      if (saved) {
        setState(saved);
        setSelectedCityId(saved.playerCapitalCityId);
      }
    } catch (error) {
      setFeedback(
        error instanceof Error ? localizeSaveError(error.message, locale) : t.invalidSave,
      );
    }
  }, []);

  useEffect(() => {
    if (!state) return;
    try {
      saveV03Autosave(state);
      setAutosaveError(false);
    } catch {
      setAutosaveError(true);
    }
  }, [state]);

  const currentScenario = scenarioById(scenarioId);
  const factions = currentScenario?.factions ?? [];
  const selectedCity = state?.cities.find((city) => city.id === selectedCityId) ?? null;
  const directCityOfficers =
    state && selectedCity
      ? state.officers.filter(
          (officer) =>
            officer.alive &&
            officer.factionId === selectedCity.factionId &&
            officer.location.kind === 'city' &&
            officer.location.cityId === selectedCity.id,
        )
      : [];
  const directWorkQuota = state && selectedCity ? cityWorkQuota(state, selectedCity) : 0;
  const directWorkRemaining =
    state && selectedCity
      ? Math.max(0, directWorkQuota - cityWorkUsedThisMonth(state, selectedCity))
      : 0;
  const governorCandidates =
    state && selectedCity
      ? state.officers.filter((officer) => {
          const location = officer.location;
          if (
            !officer.alive ||
            officer.factionId !== state.playerFactionId ||
            location.kind !== 'city' ||
            officer.troops !== 0 ||
            (officer.governorOfCityId !== null && officer.governorOfCityId !== selectedCity.id)
          )
            return false;
          const currentCityId = location.cityId;
          return (
            state.cities.find((city) => city.id === currentCityId)?.factionId ===
            state.playerFactionId
          );
        })
      : [];
  const pendingGovernor =
    state && selectedCity?.pendingAppointment?.governorId
      ? (state.officers.find(
          (officer) => officer.id === selectedCity.pendingAppointment?.governorId,
        ) ?? null)
      : null;
  const pendingGovernorAvailable = Boolean(
    pendingGovernor && governorCandidates.some((officer) => officer.id === pendingGovernor.id),
  );
  const activeBattles = state?.battles.filter((battle) => battle.active) ?? [];
  const activeBattle =
    viewMode === 'battle'
      ? (state?.battles.find((battle) => battle.id === selectedBattleId && battle.active) ??
        activeBattles[0] ??
        null)
      : null;
  const battleState = activeBattle?.battleData ?? null;
  const currentUnit = battleState?.units.find((unit) => unit.id === selectedUnitId) ?? null;
  const reachableCells = useMemo(
    () => (battleState && currentUnit ? getUnitReachableTiles(battleState, currentUnit.id) : []),
    [battleState, currentUnit],
  );
  const attackTargets = useMemo(
    () => (battleState && currentUnit ? getUnitAttackTargets(battleState, currentUnit.id) : []),
    [battleState, currentUnit],
  );
  const attackForecasts = useMemo(() => {
    if (!battleState || !currentUnit) return new Map();
    return new Map(
      attackTargets.flatMap((target) => {
        const forecast = predictBattleAttack(battleState, currentUnit.id, target.id);
        return forecast ? [[target.id, forecast] as const] : [];
      }),
    );
  }, [battleState, currentUnit, attackTargets]);
  const availableTactics = useMemo(
    () =>
      battleState && currentUnit ? getAvailableBattleTactics(battleState, currentUnit.id) : [],
    [battleState, currentUnit],
  );
  const selectedTacticAvailability = availableTactics.find(
    (entry) => entry.tactic === selectedTactic,
  );
  const tacticTargets = useMemo(
    () =>
      battleState && currentUnit && selectedTacticAvailability?.allowed
        ? getBattleTacticTargets(battleState, currentUnit.id, selectedTacticAvailability.tactic)
        : [],
    [battleState, currentUnit, selectedTacticAvailability],
  );
  const tacticForecasts = useMemo(() => {
    if (!battleState || !currentUnit || !selectedTacticAvailability?.allowed) return new Map();
    return new Map(
      tacticTargets.flatMap((target) => {
        const forecast = predictBattleTactic(
          battleState,
          currentUnit.id,
          selectedTacticAvailability.tactic,
          target.id,
        );
        return forecast ? [[target.id, forecast] as const] : [];
      }),
    );
  }, [battleState, currentUnit, selectedTacticAvailability, tacticTargets]);
  const battleBounds = battleState
    ? battlefieldBounds(battleState.map.width, battleState.map.height, 140)
    : null;
  const battleViewportPolygon = useMemo(
    () => (battleViewport ? battlefieldViewportGridPolygon(battleViewport) : []),
    [battleViewport],
  );

  useEffect(() => {
    if (viewMode !== 'battle' || !activeBattle || !battleState) return;
    const frame = battleMapFrame.current;
    if (!frame) return;
    const identity = `${activeBattle.id}:${battleState.map.mapId}`;
    const bounds = battlefieldBounds(battleState.map.width, battleState.map.height, 140);
    const updateViewportForFrame = () => {
      const rect = frame.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const aspect = rect.width / rect.height;
      if (battleViewportIdentity.current !== identity) {
        battleViewportIdentity.current = identity;
        setBattleViewport(fitBattlefieldViewport(bounds, aspect));
      } else {
        setBattleViewport((viewport) =>
          viewport
            ? resizeBattlefieldViewport(bounds, viewport, aspect)
            : fitBattlefieldViewport(bounds, aspect),
        );
      }
    };
    updateViewportForFrame();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateViewportForFrame);
      return () => window.removeEventListener('resize', updateViewportForFrame);
    }
    const observer = new ResizeObserver(updateViewportForFrame);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [
    viewMode,
    activeBattle?.id,
    battleState?.map.mapId,
    battleState?.map.width,
    battleState?.map.height,
  ]);

  useEffect(() => {
    setSelectedTactic(null);
  }, [selectedBattleId, selectedUnitId]);

  useEffect(() => {
    if (!state) return;
    if (!selectedCityId || !state.cities.some((city) => city.id === selectedCityId))
      setSelectedCityId(state.playerCapitalCityId);
    if (activeBattles.length && !activeBattles.some((battle) => battle.id === selectedBattleId)) {
      setSelectedBattleId(activeBattles[0]!.id);
      setViewMode('battle');
      const playerSide = activeBattles[0]!.battleData.playerSide;
      const first = activeBattles[0]!.battleData.units.find(
        (unit) => unit.side === playerSide && unit.troops > 0,
      );
      setSelectedUnitId(first?.id ?? null);
    }
  }, [state, activeBattles, selectedBattleId, selectedCityId]);

  const dispatch = (command: Parameters<typeof executeV03Command>[1]) => {
    if (!state) return;
    const result = executeV03Command(state, command);
    if (!result.ok) {
      setFeedback(
        result.error
          ? localizeAppMessage(result.error, locale)
          : locale === 'zh'
            ? '命令未能执行。'
            : 'The command could not be completed.',
      );
      return;
    }
    setState(result.state);
    if (result.preview && result.orderId) {
      setOrderPreview({
        orderId: result.orderId,
        preview: result.preview as
          | import('./governance/orders').RequisitionPreview
          | import('./governance/orders').CampaignDirectivePreview,
      });
    }
    if (result.message) setFeedback(localizeAppMessage(result.message, locale));
  };

  const startCampaign = () => {
    try {
      const fresh = createV03Game(factionId, Date.now(), scenarioId);
      setState(fresh);
      setSelectedCityId(fresh.playerCapitalCityId);
      setSelectedBattleId(null);
      setSelectedUnitId(null);
      setFeedback('');
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : locale === 'zh'
            ? '无法创建战役。'
            : 'Could not create campaign.',
      );
    }
  };

  const saveGame = () => {
    if (!state) return;
    try {
      saveV03Autosave(state);
      setAutosaveError(false);
      setFeedback(t.saved);
    } catch {
      setAutosaveError(true);
      setFeedback(t.saveFailed);
    }
  };

  const exportSave = () => {
    if (!state) return;
    let url: string | null = null;
    try {
      const blob = new Blob([encodeV03Save(state)], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hegemony-v0.3-${state.scenarioId}-${state.absoluteDay}.save`;
      link.click();
      setFeedback(t.saved);
    } catch {
      setFeedback(t.exportFailed);
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  };

  const importSave = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > V03_MAX_SAVE_BYTES) {
        setFeedback(t.fileTooLarge);
        return;
      }
      const imported = decodeV03Save(await file.text());
      setState(imported);
      setSelectedCityId(imported.playerCapitalCityId);
      setSelectedBattleId(null);
      setSelectedUnitId(null);
      setFeedback(t.imported);
    } catch (error) {
      setFeedback(
        error instanceof Error ? localizeSaveError(error.message, locale) : t.invalidSave,
      );
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const campaignCities = useMemo<CampaignCityVisual[]>(() => {
    if (!state) return [];
    return state.cities.map((city) => {
      const geo = CITY_GEOGRAPHY.find((entry) => entry.id === city.id)!;
      const faction = state.factions.find((entry) => entry.id === city.factionId);
      return {
        id: city.id,
        name: displayName(city, locale),
        position: mapPosition(geo.latitude, geo.longitude),
        scale: cityScale(city.id),
        controllerColor: faction?.color ?? '#746c5d',
        governance:
          city.governanceMode === 'ruler'
            ? 'direct'
            : city.governanceMode === 'governor'
              ? 'governed'
              : 'local',
        selected: city.id === selectedCityId,
      };
    });
  }, [state, locale, selectedCityId]);

  const requestedRoutePath = useMemo(() => {
    if (!state || !selectedCity || !targetCityId) return null;
    const source = state.cities.find((city) => city.id === selectedCity.id);
    if (!source?.factionId) return null;
    const kind = requestKind === 'campaign' ? 'campaign' : 'requisition';
    const troopCount = requestKind === 'campaign' ? requestedTroops : requestedResourceTroops;
    const party = orderServices.planParty({
      state,
      sourceCityId: selectedCity.id,
      maxTroops: troopCount,
      kind,
    });
    return orderServices.planRoute({
      state,
      sourceCityId: selectedCity.id,
      targetCityId,
      departureDay: state.absoluteDay,
      troopCount,
      kind,
      composition: party?.composition ?? {
        troopTypes: [],
        heavySupplyTrain: requestKind === 'campaign',
      },
    });
  }, [
    state,
    selectedCity,
    targetCityId,
    requestKind,
    requestedTroops,
    requestedResourceTroops,
    orderServices,
  ]);

  const campaignRoutes = useMemo<WorldPolyline[]>(() => {
    const base: WorldPolyline[] = ROUTE_DEFINITIONS.map((route) => {
      const geometry = projectCampaignRoute(route);
      return {
        id: route.id,
        points: geometry.points,
        label:
          locale === 'zh'
            ? `估算 ${geometry.nominalRoadKm} 公里 · 基准 ${geometry.baselineDaysNominal} 日 · 示意城际连线`
            : `Est. ${geometry.nominalRoadKm} km · baseline ${geometry.baselineDaysNominal} days · schematic city link`,
        display: 'route',
      };
    });
    const selectedGeometry = requestedRoutePath
      ? projectCityRoute(
          (requestedRoutePath.routeCityIds ?? [selectedCityId!, targetCityId]) as CityId[],
        )
      : null;
    const selected: WorldPolyline[] =
      requestedRoutePath && selectedGeometry
        ? [
            {
              id: 'selected-route',
              points: selectedGeometry.points,
              label:
                locale === 'zh'
                  ? `估算 ${requestedRoutePath.roadKmNominal} 公里 · 本队预计 ${requestedRoutePath.estimatedDays} 日 · 示意城际连线`
                  : `Est. ${requestedRoutePath.roadKmNominal} km · this party ETA ${requestedRoutePath.estimatedDays} days · schematic city link`,
              display: 'selected',
            },
          ]
        : [];
    const journeys: WorldPolyline[] = (state?.journeys ?? [])
      .filter(
        (journey) =>
          journey.ownerFactionId === state?.playerFactionId &&
          ['outbound', 'returning', 'waiting'].includes(journey.status),
      )
      .flatMap((journey) => {
        const cityIds = journey.routeCityIds ?? [journey.sourceCityId, journey.destinationCityId];
        const geometry = projectCityRoute(cityIds as CityId[]);
        if (!geometry) return [];
        const eta = Math.max(0, journey.expectedArrivalDay - (state?.absoluteDay ?? 0));
        const kind =
          locale === 'zh'
            ? {
                campaign: '行军',
                requisition: '资源调运',
                appointment: '太守赴任',
                return: '返程队伍',
              }[journey.kind]
            : {
                campaign: 'Campaign',
                requisition: 'Supply transport',
                appointment: 'Governor transfer',
                return: 'Returning party',
              }[journey.kind];
        const status =
          journey.status === 'waiting'
            ? locale === 'zh'
              ? '等待中'
              : 'waiting'
            : journey.status === 'returning'
              ? locale === 'zh'
                ? '返程中'
                : 'returning'
              : locale === 'zh'
                ? '行进中'
                : 'moving';
        return [
          {
            id: `journey-${journey.id}`,
            points: geometry.points,
            label:
              locale === 'zh'
                ? `${kind} · ${status} · 本队剩余约 ${eta} 日 · 示意城际连线`
                : `${kind} · ${status} · party ETA remaining ${eta} days · schematic city link`,
            display:
              journey.status === 'waiting'
                ? 'waiting'
                : journey.kind === 'campaign'
                  ? 'marching'
                  : 'transport',
          },
        ];
      });
    return [...base, ...selected, ...journeys];
  }, [
    locale,
    requestedRoutePath,
    selectedCityId,
    state?.absoluteDay,
    state?.journeys,
    state?.playerFactionId,
    targetCityId,
  ]);

  const submitResourceOrder = () => {
    if (!state || !selectedCity) return;
    const deadline = requestedByDay.trim() === '' ? null : Number(requestedByDay);
    dispatch({
      type: 'requestRequisition',
      sourceCityId: selectedCity.id,
      targetCityId,
      requested: {
        gold: requestedGold,
        food: requestedFood,
        troops: requestedResourceTroops,
      },
      requestedByDay: deadline,
    });
  };

  const submitCampaignOrder = () => {
    if (!state || !selectedCity) return;
    const deadline = requestedByDay.trim() === '' ? null : Number(requestedByDay);
    dispatch({
      type: 'issueCampaignDirective',
      sourceCityId: selectedCity.id,
      targetCityId,
      intent,
      requestedTroops,
      requestedByDay: deadline,
    });
  };

  const answerOrder = (
    orderId: string,
    kind: 'resource' | 'campaign',
    answer: 'accept' | 'reduce' | 'wait' | 'cancel',
    reduced?: unknown,
  ) => {
    if (kind === 'resource')
      dispatch({
        type: 'answerRequisition',
        requisitionId: orderId,
        answer,
        reduced: reduced as V03JourneyCargo | undefined,
      });
    else
      dispatch({
        type: 'answerCampaignDirective',
        directiveId: orderId,
        answer,
        reducedTroops: typeof reduced === 'number' ? reduced : undefined,
      });
  };

  const worldEvents =
    state?.events
      .filter((event) => !event.acknowledged)
      .slice(-8)
      .reverse() ?? [];
  const activeOrders = state
    ? [
        ...state.requisitions
          .filter((order) =>
            ['proposed', 'waiting', 'accepted', 'reserved', 'dispatched'].includes(order.status),
          )
          .map((order) => ({
            id: order.id,
            kind: 'resource' as const,
            status: order.status,
            message: order.message,
            source:
              state.cities.find((city) => city.id === order.sourceCityId)?.name ??
              order.sourceCityId,
            target:
              state.cities.find((city) => city.id === order.targetCityId)?.name ??
              order.targetCityId,
            requested: order.requested,
            proposed: order.proposed,
            journeyId: order.journeyId,
            returnRequested: Boolean(
              order.journeyId &&
              state.journeys.find((journey) => journey.id === order.journeyId)?.returnRequested,
            ),
          })),
        ...state.directives
          .filter((order) =>
            ['proposed', 'waiting', 'accepted', 'reserved', 'dispatched'].includes(order.status),
          )
          .map((order) => ({
            id: order.id,
            kind: 'campaign' as const,
            status: order.status,
            message: order.message,
            source:
              state.cities.find((city) => city.id === order.sourceCityId)?.name ??
              order.sourceCityId,
            target:
              state.cities.find((city) => city.id === order.targetCityId)?.name ??
              order.targetCityId,
            requested: order.requestedTroops,
            proposed: order.proposedTroops,
            journeyId: order.journeyId,
            returnRequested: Boolean(
              order.journeyId &&
              state.journeys.find((journey) => journey.id === order.journeyId)?.returnRequested,
            ),
          })),
      ]
    : [];
  const orderPreviewOrder =
    state && orderPreview
      ? (state.requisitions.find((order) => order.id === orderPreview.orderId) ??
        state.directives.find((order) => order.id === orderPreview.orderId))
      : undefined;
  const orderPreviewSourceCity =
    state && orderPreviewOrder
      ? state.cities.find((city) => city.id === orderPreviewOrder.sourceCityId)
      : undefined;
  const orderPreviewTroops = orderPreview
    ? 'executable' in orderPreview.preview
      ? orderPreview.preview.executable.troops
      : orderPreview.preview.executableTroops
    : 0;
  const friendlyCities =
    state?.cities.filter((city) => city.factionId === state.playerFactionId) ?? [];
  const diplomacyTargets =
    state?.factions.filter(
      (faction) => faction.id !== state.playerFactionId && !faction.eliminated,
    ) ?? [];
  const diplomacyTarget =
    diplomacyTargets.find((faction) => faction.id === diplomacyTargetId) ?? diplomacyTargets[0];
  const playerAlliances = state
    ? state.alliances.filter((alliance) =>
        isV03AllianceActive(
          state.alliances,
          state.playerFactionId,
          alliance.a === state.playerFactionId ? alliance.b : alliance.a,
          state.monthIndex,
        ),
      )
    : [];
  const hostileCities =
    state?.cities.filter((city) => city.factionId !== state.playerFactionId) ?? [];
  const canOrderFromSelected =
    state && selectedCity
      ? getCityCapabilities(state, selectedCity.id).requisitionResources
      : false;
  const wikiArticles = getV03WikiArticles(locale);
  const wikiQuery = wikiSearch
    .trim()
    .normalize('NFKC')
    .toLocaleLowerCase(locale === 'zh' ? 'zh-CN' : 'en-US');
  const filteredWikiArticles = wikiQuery
    ? wikiArticles.filter((article) =>
        [
          article.title,
          ...article.sections.flatMap((section) => [section.heading, ...section.body]),
        ]
          .join('\n')
          .normalize('NFKC')
          .toLocaleLowerCase(locale === 'zh' ? 'zh-CN' : 'en-US')
          .includes(wikiQuery),
      )
    : wikiArticles;
  const displayedWikiArticle =
    filteredWikiArticles.find((article) => article.id === wikiTopic) ?? filteredWikiArticles[0];
  const openWiki = (topic: V03WikiTopic) => {
    wikiReturnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setWikiTopic(topic);
    setShowWiki(true);
  };

  if (!state) {
    const saved = (() => {
      try {
        return loadV03Autosave();
      } catch {
        return null;
      }
    })();
    return (
      <main className="v03-start">
        <section className="v03-start-card">
          <div className="v03-start-kicker">HEGEMONY · NEW RULESET</div>
          <button
            type="button"
            className="v03-start-locale"
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
          >
            {locale === 'en' ? '中文' : 'EN'}
          </button>
          <h1>{t.title}</h1>
          <p>{t.subtitle}</p>
          <label className="v03-field">
            {t.scenario}
            <select
              value={scenarioId}
              onChange={(event) => {
                setScenarioId(event.target.value);
                const scenario = scenarioById(event.target.value);
                setFactionId(scenario?.factions[0]?.id ?? '');
              }}
            >
              {availableV03Scenarios().map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.year} · {locale === 'zh' ? scenario.title : scenario.title}
                </option>
              ))}
            </select>
          </label>
          <div className="v03-ruler-grid" aria-label={t.ruler}>
            {factions.map((faction) => (
              <button
                type="button"
                key={faction.id}
                className={`v03-ruler-card ${factionId === faction.id ? 'is-selected' : ''}`}
                onClick={() => setFactionId(faction.id)}
              >
                <span className="v03-banner" style={{ backgroundColor: faction.color }} />
                <strong>{locale === 'zh' ? faction.chinese : faction.name}</strong>
                <small>{faction.leader}</small>
              </button>
            ))}
          </div>
          <div className="v03-start-actions">
            <button type="button" className="v03-primary" onClick={startCampaign}>
              {t.newCampaign}
            </button>
            {saved ? (
              <button
                type="button"
                onClick={() => {
                  setState(saved);
                  setSelectedCityId(saved.playerCapitalCityId);
                }}
              >
                {t.resume}
              </button>
            ) : null}
          </div>
          {feedback ? (
            <p className="v03-feedback" role="status">
              {feedback}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  const selectedFaction = state.factions.find((faction) => faction.id === state.playerFactionId);
  const date = dateLabel(state, locale);
  const isBattleView = viewMode === 'battle' && Boolean(activeBattle && battleState);
  const selectedGeo = selectedCity
    ? CITY_GEOGRAPHY.find((city) => city.id === selectedCity.id)
    : undefined;
  const availableTargets =
    requestKind === 'resource'
      ? friendlyCities.filter((city) => city.id !== selectedCity?.id)
      : hostileCities;
  const selectedRoute = requestedRoutePath;
  const locationName = (cityId: string) => {
    const city = state.cities.find((entry) => entry.id === cityId);
    return city ? displayName(city, locale) : cityId;
  };
  const localizedOfficerName = (name: string) => {
    const officer = state.officers.find((entry) => entry.name === name || entry.chinese === name);
    return locale === 'zh' ? (officer?.chinese ?? name) : (officer?.name ?? name);
  };
  const journeyDescription = (journey: V03GameState['journeys'][number]) => {
    const source = locationName(journey.sourceCityId);
    const target = locationName(journey.destinationCityId);
    const eta = Math.max(0, journey.expectedArrivalDay - state.absoluteDay);
    const troops = journey.manifest.troopCount;
    const cargo = journey.manifest.cargo;
    const status =
      journey.status === 'waiting'
        ? locale === 'zh'
          ? '等待中'
          : 'waiting'
        : journey.status === 'returning'
          ? locale === 'zh'
            ? '返程中'
            : 'returning'
          : locale === 'zh'
            ? '行进中'
            : 'moving';
    return locale === 'zh'
      ? `${source} → ${target} · ${status} · 预计 ${eta} 日 · ${troops.toLocaleString()} 兵 · 金 ${(cargo.gold ?? 0).toLocaleString()} · 粮 ${(cargo.food ?? 0).toLocaleString()}`
      : `${source} → ${target} · ${status} · ETA ${eta} days · ${troops.toLocaleString()} troops · gold ${(cargo.gold ?? 0).toLocaleString()} · food ${(cargo.food ?? 0).toLocaleString()}`;
  };
  const journeyCandidates = state.journeys.flatMap((journey) => {
    if (!['outbound', 'returning', 'waiting'].includes(journey.status)) return [];
    const position = journeyPosition(journey);
    return position
      ? [{ id: journey.id, ownerFactionId: journey.ownerFactionId, position, value: journey }]
      : [];
  });
  const journeyClusters = clusterVisibleCampaignParties(
    journeyCandidates,
    state.playerFactionId,
    campaignViewport,
    campaignFrameSize,
  );
  const unitActionStatus = (unit: NonNullable<typeof battleState>['units'][number]) =>
    unit.acted ? t.unitActed : unit.moved ? t.unitMoved : t.unitReady;
  const unitBattleStatus = (unit: NonNullable<typeof battleState>['units'][number]) => {
    const condition =
      unit.status === 'confused'
        ? t.unitConfused
        : unit.status === 'inspired'
          ? t.unitInspired
          : null;
    return [condition, unitActionStatus(unit)].filter(Boolean).join(' · ');
  };
  const troopVisuals =
    battleState?.units.map((unit) => ({
      id: unit.id,
      troopType: unit.troopType,
      position: { x: unit.x, y: unit.y },
      faction: unit.side === battleState.playerSide ? 'player' : 'opponent',
      strength: unit.troops,
      label: localizedOfficerName(unit.name),
      selected: unit.id === selectedUnitId,
      status: `${unit.morale}% ${locale === 'zh' ? '士气' : 'morale'} · ${unitBattleStatus(unit)}`,
    })) ?? [];
  const camps =
    battleState?.map.objectives.map((objective) => ({
      id: objective.id,
      position: objective.position,
      label:
        locale === 'zh'
          ? `${objective.owner === battleState.playerSide ? '己方' : '敌方'}营地`
          : `${objective.owner} field camp`,
    })) ?? [];
  const attackableCells = attackTargets.map((unit) => ({ x: unit.x, y: unit.y }));
  const playerUnit = (unitId: string) =>
    !activeBattle?.playerDayComplete &&
    battleState?.units.find((unit) => unit.id === unitId)?.side === battleState?.playerSide;
  const handleBattleUnitClick = (unitId: string) => {
    if (!battleState || !activeBattle) return;
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
      } else setFeedback(t.tacticNoTargets);
      return;
    }
    if (currentUnit && attackTargets.some((target) => target.id === unitId)) {
      dispatch({
        type: 'battleAction',
        battleId: activeBattle.id,
        action: { type: 'attack', unitId: currentUnit.id, targetId: unitId },
      });
    } else if (playerUnit(unitId)) {
      setSelectedUnitId(unitId);
    }
  };
  const fitCampaignMap = () => {
    const rect = campaignMapFrame.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0)
      setCampaignViewport(fitCampaignViewport(CAMPAIGN_BOUNDS, rect.width / rect.height));
  };
  const zoomCampaignMap = (factor: number) =>
    setCampaignViewport((viewport) =>
      zoomCampaignViewport(
        viewport,
        CAMPAIGN_BOUNDS,
        { x: viewport.left + viewport.width / 2, y: viewport.top + viewport.height / 2 },
        factor,
      ),
    );
  const focusCampaignCity = (cityId: string) => {
    setSelectedCityId(cityId);
    const city = campaignCities.find((entry) => entry.id === cityId);
    if (city)
      setCampaignViewport((viewport) =>
        focusCampaignViewport(CAMPAIGN_BOUNDS, viewport, city.position, 2.4),
      );
  };
  const fitBattleMap = () => {
    const rect = battleMapFrame.current?.getBoundingClientRect();
    if (!battleBounds || !rect || rect.width <= 0 || rect.height <= 0) return;
    setBattleViewport(fitBattlefieldViewport(battleBounds, rect.width / rect.height));
  };
  const zoomBattleMap = (factor: number) => {
    if (!battleBounds || !battleViewport) return;
    setBattleViewport(
      zoomBattlefieldViewport(
        battleViewport,
        battleBounds,
        {
          x: battleViewport.left + battleViewport.width / 2,
          y: battleViewport.top + battleViewport.height / 2,
        },
        factor,
      ),
    );
  };
  const focusBattleMapUnit = () => {
    if (!battleBounds || !battleViewport || !currentUnit) return;
    setBattleViewport(
      focusBattlefieldViewport(
        battleBounds,
        battleViewport,
        gridToWorld({ x: currentUnit.x, y: currentUnit.y }),
        2.5,
      ),
    );
  };
  const focusBattleMapCamps = () => {
    if (!battleBounds || !battleViewport || !battleState?.map.objectives.length) {
      setFeedback(t.battleMapNoCamps);
      return;
    }
    setBattleViewport(
      focusBattlefieldPointsViewport(
        battleBounds,
        battleViewport,
        battleState.map.objectives.map((objective) => gridToWorld(objective.position)),
        190,
      ),
    );
  };
  const navigateBattleMinimap = (cell: { x: number; y: number }) => {
    if (!battleBounds || !battleViewport) return;
    setBattleViewport(recenterBattlefieldViewport(battleViewport, battleBounds, gridToWorld(cell)));
  };

  return (
    <main className="v03-shell">
      <header className="v03-topbar">
        <div className="v03-brand">
          <span className="v03-brand-mark">漢</span>
          <div>
            <strong>{t.title}</strong>
            <small>
              {selectedFaction?.name} · {t.territory} {friendlyCities.length}
            </small>
          </div>
        </div>
        <div className="v03-top-actions">
          <div className="v03-date">
            <small>{t.date}</small>
            <strong>{date}</strong>
          </div>
          {isBattleView ? (
            <button
              type="button"
              className="v03-primary"
              disabled={Boolean(activeBattle?.playerDayComplete)}
              onClick={() =>
                activeBattle && dispatch({ type: 'completeBattleDay', battleId: activeBattle.id })
              }
            >
              {activeBattle?.playerDayComplete ? t.battleDaySubmitted : t.advanceBattle}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={Boolean(activeBattles.length)}
                onClick={() => dispatch({ type: 'advance', days: 1 })}
              >
                {t.advanceDay}
              </button>
              <button
                type="button"
                disabled={Boolean(activeBattles.length)}
                onClick={() => dispatch({ type: 'advance', days: 10 })}
              >
                {t.advanceTen}
              </button>
              <button
                type="button"
                disabled={Boolean(activeBattles.length)}
                onClick={() => dispatch({ type: 'advance', days: 'nextEvent' })}
              >
                {t.nextEvent}
              </button>
            </>
          )}
          <button type="button" onClick={() => openWiki('overview')}>
            {t.wiki}
          </button>
          <button type="button" onClick={saveGame}>
            {t.save}
          </button>
          <button type="button" onClick={exportSave}>
            {t.export}
          </button>
          <button type="button" onClick={() => fileInput.current?.click()}>
            {t.load}
          </button>
          <input
            ref={fileInput}
            className="v03-file-input"
            type="file"
            accept=".save,.json,application/json"
            onChange={(event) => void importSave(event.target.files?.[0])}
          />
          <button
            type="button"
            className="v03-locale"
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
          >
            {locale === 'en' ? '中文' : 'EN'}
          </button>
        </div>
      </header>
      {autosaveError ? (
        <div className="v03-alert" role="alert">
          {t.savingFailed}{' '}
          <button type="button" onClick={saveGame}>
            {t.saveRetry}
          </button>
        </div>
      ) : null}
      {feedback ? (
        <div className="v03-toast" role="status">
          {feedback}
          <button type="button" aria-label={t.close} onClick={() => setFeedback('')}>
            ×
          </button>
        </div>
      ) : null}
      <section className={`v03-workspace ${isBattleView ? 'battle-layout' : ''}`}>
        <aside className="v03-rail">
          <button
            type="button"
            className={!isBattleView ? 'active' : ''}
            onClick={() => setViewMode('campaign')}
            title={t.campaign}
          >
            {t.campaign}
          </button>
          {activeBattles.map((battle, index) => (
            <button
              type="button"
              key={battle.id}
              className={
                battle.id === activeBattle?.id ? 'active v03-battle-tab' : 'v03-battle-tab'
              }
              onClick={() => {
                setSelectedBattleId(battle.id);
                setViewMode('battle');
                const friendly = battle.battleData.units.find(
                  (unit) => unit.side === battle.battleData.playerSide && unit.troops > 0,
                );
                setSelectedUnitId(friendly?.id ?? null);
              }}
            >
              {index + 1}
            </button>
          ))}
          <div className="v03-rail-bottom">
            <button type="button" onClick={() => openWiki('units')}>
              ?
            </button>
          </div>
        </aside>
        {isBattleView && battleState && activeBattle ? (
          <section className="v03-battle-main">
            <div className="v03-view-heading">
              <div>
                <span className="v03-kicker">
                  {t.battle} · {battleState.map.regionId.toUpperCase()}
                </span>
                <h1>
                  {locationName(
                    state.journeys.find((journey) => journey.id === activeBattle.attackerJourneyId)
                      ?.destinationCityId ?? '',
                  )}
                </h1>
              </div>
              <div className="v03-battle-day">
                {t.battleDayLabel} {battleState.day} / {battleState.dayLimit}
              </div>
            </div>
            <div ref={battleMapFrame} className="v03-battle-board">
              <BattlefieldMapView
                map={battleState.map}
                units={troopVisuals}
                camps={camps}
                viewport={battleViewport ?? undefined}
                interactive
                onViewportChange={setBattleViewport}
                selectedCell={currentUnit ? { x: currentUnit.x, y: currentUnit.y } : undefined}
                reachableCells={reachableCells}
                attackableCells={attackableCells}
                tacticTargetCells={tacticTargets.map((target) => ({ x: target.x, y: target.y }))}
                locale={locale}
                waterAttackMultiplier={WATER_ATTACK_MULTIPLIER}
                waterIncomingDamageMultiplier={WATER_INCOMING_DAMAGE_MULTIPLIER}
                onUnitClick={(unitId) => {
                  handleBattleUnitClick(unitId);
                }}
                onCellClick={(cell) => {
                  if (selectedTactic) {
                    setFeedback(t.tacticChooseTarget);
                    return;
                  }
                  if (!currentUnit) {
                    setFeedback(t.selectUnit);
                    return;
                  }
                  dispatch({
                    type: 'battleAction',
                    battleId: activeBattle.id,
                    action: { type: 'move', unitId: currentUnit.id, x: cell.x, y: cell.y },
                  });
                }}
              />
              <div
                className="v03-battle-camera-controls"
                role="group"
                aria-label={t.battleMapCamera}
              >
                <button
                  type="button"
                  aria-label={t.battleMapZoomOut}
                  onClick={() => zoomBattleMap(0.8)}
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label={t.battleMapZoomIn}
                  onClick={() => zoomBattleMap(1.25)}
                >
                  +
                </button>
                <button type="button" aria-label={t.battleMapFit} onClick={fitBattleMap}>
                  {locale === 'zh' ? '全图' : 'Fit'}
                </button>
                <button
                  type="button"
                  aria-label={t.battleMapFocusUnit}
                  disabled={!currentUnit}
                  onClick={focusBattleMapUnit}
                >
                  {locale === 'zh' ? '部队' : 'Unit'}
                </button>
                <button
                  type="button"
                  aria-label={t.battleMapFocusCamps}
                  onClick={focusBattleMapCamps}
                >
                  {locale === 'zh' ? '营地' : 'Camps'}
                </button>
              </div>
            </div>
            <div className="v03-battle-lower">
              <BattlefieldMinimap
                map={battleState.map}
                units={troopVisuals}
                camps={camps}
                viewportPolygon={battleViewportPolygon}
                locale={locale}
                className="v03-battlefield-minimap"
                onNavigate={navigateBattleMinimap}
              />
              <div className="v03-battle-help">
                <strong>{currentUnit?.name ?? t.selectUnit}</strong>
                <p>{t.moveHelp}</p>
                <p>{t.attackHelp}</p>
                <p>{t.waterRule}</p>
                <small>{t.dayLimit.replace('30', String(battleState.dayLimit))}</small>
              </div>
            </div>
          </section>
        ) : (
          <section className="v03-campaign-main">
            <div className="v03-view-heading">
              <div>
                <span className="v03-kicker">
                  {t.campaign} · {state.scenarioId}
                </span>
                <h1>{t.territory}</h1>
              </div>
              <div className="v03-stat-line">
                <span>
                  {t.owned} <b>{friendlyCities.length}</b>
                </span>
                <span>
                  {t.routes} <b>{ROUTE_DEFINITIONS.length}</b>
                </span>
              </div>
            </div>
            <div
              ref={campaignMapFrame}
              className="v03-map-frame"
              style={{ backgroundImage: `url(${CAMPAIGN_BACKGROUND})` }}
            >
              <CampaignMapView
                bounds={CAMPAIGN_BOUNDS}
                viewport={campaignViewport}
                interactive
                onViewportChange={setCampaignViewport}
                backgroundImage={CAMPAIGN_BACKGROUND}
                cities={campaignCities}
                routes={campaignRoutes}
                waterways={CAMPAIGN_WATERWAYS as WorldPolyline[]}
                mountainRanges={CAMPAIGN_MOUNTAIN_RANGES as WorldPolyline[]}
                locale={locale}
                onCityClick={focusCampaignCity}
              />
              <div
                className="v03-campaign-map-controls"
                aria-label={locale === 'zh' ? '地图缩放' : 'Map zoom'}
              >
                <button
                  type="button"
                  title={locale === 'zh' ? '缩小' : 'Zoom out'}
                  aria-label={locale === 'zh' ? '缩小地图' : 'Zoom out map'}
                  onClick={() => zoomCampaignMap(0.8)}
                >
                  −
                </button>
                <button
                  type="button"
                  title={locale === 'zh' ? '放大' : 'Zoom in'}
                  aria-label={locale === 'zh' ? '放大地图' : 'Zoom in map'}
                  onClick={() => zoomCampaignMap(1.25)}
                >
                  +
                </button>
                <button
                  type="button"
                  aria-label={locale === 'zh' ? '显示全图' : 'Fit full map'}
                  onClick={fitCampaignMap}
                >
                  {locale === 'zh' ? '全图' : 'Fit'}
                </button>
              </div>
              <CampaignMinimap
                className="v03-campaign-minimap"
                bounds={CAMPAIGN_BOUNDS}
                viewport={campaignViewport}
                cities={campaignCities}
                routes={campaignRoutes}
                locale={locale}
                onNavigate={(center) =>
                  setCampaignViewport((viewport) =>
                    recenterCampaignViewport(viewport, CAMPAIGN_BOUNDS, center),
                  )
                }
              />
              {journeyClusters.map((cluster) => {
                const first = cluster.parties[0];
                if (!first) return null;
                const descriptions = cluster.parties.map(journeyDescription);
                const label = descriptions.join('\n');
                const style = {
                  left: `${((cluster.position.x - campaignViewport.left) / campaignViewport.width) * 100}%`,
                  top: `${((cluster.position.y - campaignViewport.top) / campaignViewport.height) * 100}%`,
                };
                const symbol =
                  first.kind === 'campaign'
                    ? '軍'
                    : first.kind === 'appointment'
                      ? '任'
                      : first.manifest.troopCount > 0
                        ? '兵'
                        : '糧';
                const groupedLabel = `${cluster.parties.length} ${t.journeyGroup}: ${descriptions.join(' · ')}`;
                return (
                  <button
                    type="button"
                    key={cluster.id}
                    className={`v03-army-marker ${cluster.parties.length > 1 ? 'grouped' : ''} ${first.status === 'waiting' ? 'waiting' : first.kind === 'campaign' ? 'marching' : 'transport'}`}
                    style={style}
                    onClick={() =>
                      setFeedback(cluster.parties.length > 1 ? label : descriptions[0]!)
                    }
                    aria-label={cluster.parties.length > 1 ? groupedLabel : descriptions[0]}
                    title={cluster.parties.length > 1 ? groupedLabel : descriptions[0]}
                  >
                    {cluster.parties.length > 1 ? `×${cluster.parties.length}` : symbol}
                  </button>
                );
              })}
            </div>
            <footer className="v03-map-legend">
              <span>
                <i className="legend-river" />
                {locale === 'zh' ? '主要水系（示意）' : 'Major waterways (illustrative)'}
              </span>
              <span>
                <i className="legend-road" />
                {t.routes}
              </span>
              <span>
                <i className="legend-ruler" />
                {locale === 'zh' ? '君主本城' : 'Ruler’s capital'}
              </span>
            </footer>
          </section>
        )}
        <aside className="v03-side-panel">
          {isBattleView && battleState && activeBattle ? (
            <>
              <div className="v03-panel-title">
                <span className="v03-kicker">{t.battleOrders}</span>
                <h2>
                  {battleState.units
                    .filter((unit) => unit.side === battleState.playerSide && unit.troops > 0)
                    .reduce((sum, unit) => sum + unit.troops, 0)
                    .toLocaleString()}{' '}
                  ·{' '}
                  {battleState.units
                    .filter((unit) => unit.side !== battleState.playerSide && unit.troops > 0)
                    .reduce((sum, unit) => sum + unit.troops, 0)
                    .toLocaleString()}
                </h2>
              </div>
              <p className="v03-muted">{t.moveHelp}</p>
              <div className="v03-unit-list">
                {battleState.units.map((unit) => (
                  <button
                    type="button"
                    key={unit.id}
                    className={`v03-unit-row ${unit.id === selectedUnitId ? 'selected' : ''} ${unit.side === battleState.playerSide ? '' : 'enemy'}`}
                    onClick={() => handleBattleUnitClick(unit.id)}
                  >
                    <span className="v03-unit-glyph">{troopGlyph(unit.troopType)}</span>
                    <span>
                      <strong>{localizedOfficerName(unit.name)}</strong>
                      <small>
                        {unit.troops.toLocaleString()} · {unit.morale}% · {unitBattleStatus(unit)}
                      </small>
                      {unit.side !== battleState.playerSide && attackForecasts.has(unit.id) ? (
                        <small className="v03-attack-forecast">
                          {t.estimatedLosses}{' '}
                          {attackForecasts.get(unit.id)?.estimatedCasualties?.toLocaleString() ??
                            '—'}
                          {' · '}
                          {t.counterattackLabel}{' '}
                          {attackForecasts
                            .get(unit.id)
                            ?.counterattack.estimatedCasualties?.toLocaleString() ?? '—'}
                          {' · '}
                          {attackForecasts.get(unit.id)?.targetOnWater
                            ? t.waterTargetDamage
                            : attackForecasts.get(unit.id)?.sourceOnWater
                              ? t.waterAttackPenalty
                              : t.landModifiers}
                        </small>
                      ) : null}
                      {selectedTactic && tacticForecasts.has(unit.id) ? (
                        <small className="v03-tactic-forecast">
                          {tacticLabel(selectedTactic, locale)} · {t.tacticChance}{' '}
                          {tacticForecasts.get(unit.id)?.chance ?? 0}%
                          {(tacticForecasts.get(unit.id)?.maxCasualties ?? 0) > 0 ? (
                            <>
                              {' · '}
                              {t.tacticCasualties}{' '}
                              {tacticForecasts.get(unit.id)?.minCasualties.toLocaleString()}–
                              {tacticForecasts.get(unit.id)?.maxCasualties.toLocaleString()}
                            </>
                          ) : null}
                          {(tacticForecasts.get(unit.id)?.moraleChange ?? 0) !== 0 ? (
                            <>
                              {' · '}
                              {t.tacticMorale}{' '}
                              {tacticForecasts.get(unit.id)!.moraleChange > 0 ? '+' : ''}
                              {tacticForecasts.get(unit.id)?.moraleChange}%
                            </>
                          ) : null}
                          {(tacticForecasts.get(unit.id)?.suppliesTransferred ?? 0) > 0 ? (
                            <>
                              {' · '}
                              {t.tacticSupplies}{' '}
                              {tacticForecasts.get(unit.id)?.suppliesTransferred.toLocaleString()}
                            </>
                          ) : null}
                          {tacticForecasts.get(unit.id)?.sourceOnWater ||
                          tacticForecasts.get(unit.id)?.targetOnWater ? (
                            <>
                              {' · '}
                              {tacticForecasts.get(unit.id)?.sourceOnWater
                                ? t.waterAttackPenalty
                                : t.waterTargetDamage}
                            </>
                          ) : null}
                        </small>
                      ) : null}
                    </span>
                    <i>{unit.side === battleState.playerSide ? '●' : '○'}</i>
                  </button>
                ))}
              </div>
              {currentUnit ? (
                <div className="v03-card v03-unit-detail">
                  <strong>{localizedOfficerName(currentUnit.name)}</strong>
                  <p>
                    {currentUnit.troops.toLocaleString()} {locale === 'zh' ? '兵' : 'troops'} ·{' '}
                    {currentUnit.morale}% {locale === 'zh' ? '士气' : 'morale'} ·{' '}
                    {unitBattleStatus(currentUnit)}
                  </p>
                  <button
                    type="button"
                    disabled={currentUnit.acted}
                    onClick={() =>
                      dispatch({
                        type: 'battleAction',
                        battleId: activeBattle.id,
                        action: { type: 'wait', unitId: currentUnit.id },
                      })
                    }
                  >
                    {t.waitAction}
                  </button>
                </div>
              ) : null}
              {currentUnit ? (
                <section className="v03-tactics" aria-labelledby="v03-tactics-title">
                  <div className="v03-section-title">
                    <h3 id="v03-tactics-title">{t.tactics}</h3>
                    <small>
                      {t.tacticPoints}: {battleState.tacticPoints[battleState.playerSide]}
                    </small>
                  </div>
                  <p className="v03-muted">{t.chooseTactic}</p>
                  <div className="v03-tactic-list">
                    {availableTactics.map((entry) => {
                      const label = tacticLabel(entry.tactic, locale);
                      const reason = entry.reason
                        ? localizeTacticReason(entry.reason, locale)
                        : null;
                      return (
                        <button
                          key={entry.tactic}
                          type="button"
                          className={selectedTactic === entry.tactic ? 'selected' : ''}
                          aria-pressed={selectedTactic === entry.tactic}
                          aria-describedby={
                            reason ? `v03-tactic-${entry.tactic}-reason` : undefined
                          }
                          title={
                            reason ??
                            `${t.tacticCost} ${entry.cost} · ${t.rangeLabel} ${entry.range}`
                          }
                          onClick={() => {
                            if (activeBattle.playerDayComplete) {
                              setFeedback(t.battleDaySubmitted);
                            } else if (!entry.allowed) {
                              setFeedback(reason ?? t.tacticNoTargets);
                            } else {
                              setSelectedTactic(
                                selectedTactic === entry.tactic ? null : entry.tactic,
                              );
                            }
                          }}
                        >
                          {label} · {t.tacticCost} {entry.cost}
                        </button>
                      );
                    })}
                  </div>
                  {availableTactics.some((entry) => entry.reason) ? (
                    <ul className="v03-tactic-reasons">
                      {availableTactics
                        .filter((entry) => entry.reason)
                        .map((entry) => (
                          <li id={`v03-tactic-${entry.tactic}-reason`} key={entry.tactic}>
                            {tacticLabel(entry.tactic, locale)}:{' '}
                            {localizeTacticReason(entry.reason!, locale)}
                          </li>
                        ))}
                    </ul>
                  ) : null}
                  {selectedTactic ? (
                    <div className="v03-tactic-preview" aria-live="polite">
                      <strong>{tacticLabel(selectedTactic, locale)}</strong>
                      {selectedTacticAvailability?.reason ? (
                        <span>
                          {localizeTacticReason(selectedTacticAvailability.reason, locale)}
                        </span>
                      ) : tacticTargets.length === 0 ? (
                        <span>{t.tacticNoTargets}</span>
                      ) : (
                        <span>
                          {t.tacticCost} {selectedTacticAvailability?.cost} · {t.rangeLabel}{' '}
                          {selectedTacticAvailability?.range} · {tacticTargets.length}{' '}
                          {t.targetCount}
                        </span>
                      )}
                    </div>
                  ) : null}
                </section>
              ) : null}
              <button
                type="button"
                className="v03-block v03-retreat-action"
                disabled={!currentUnit || activeBattle.playerDayComplete}
                aria-describedby="v03-retreat-warning"
                onClick={() =>
                  currentUnit &&
                  dispatch({
                    type: 'battleAction',
                    battleId: activeBattle.id,
                    action: { type: 'retreat', unitId: currentUnit.id },
                  })
                }
              >
                {t.retreat}
              </button>
              <p id="v03-retreat-warning" className="v03-muted">
                {t.retreatWarning}
              </p>
              <button
                type="button"
                className="v03-primary v03-block"
                disabled={activeBattle.playerDayComplete}
                onClick={() => dispatch({ type: 'completeBattleDay', battleId: activeBattle.id })}
              >
                {activeBattle.playerDayComplete ? t.battleDaySubmitted : t.advanceBattle}
              </button>
              {activeBattle.playerDayComplete && activeBattles.length > 1 ? (
                <p className="v03-muted">{t.resolveOtherBattles}</p>
              ) : null}
              <button type="button" className="v03-block" onClick={() => setViewMode('campaign')}>
                {t.campaign}
              </button>
              <div className="v03-log-box">
                <strong>{t.battleLog}</strong>
                {battleState.log
                  .slice(-6)
                  .reverse()
                  .map((line, i) => (
                    <p key={`${i}-${line}`}>{localizeBattleLogLine(line, state, locale)}</p>
                  ))}
              </div>
            </>
          ) : (
            <>
              {selectedCity ? (
                <>
                  <div className="v03-city-head">
                    <div
                      className="v03-city-seal"
                      style={{
                        borderColor:
                          state.factions.find((faction) => faction.id === selectedCity.factionId)
                            ?.color ?? '#817762',
                      }}
                    >
                      {selectedCity.chinese.slice(0, 1)}
                    </div>
                    <div>
                      <span className="v03-kicker">{t.city}</span>
                      <h2>{displayName(selectedCity, locale)}</h2>
                      <small>
                        {state.factions.find((faction) => faction.id === selectedCity.factionId)
                          ?.name ?? (locale === 'zh' ? '中立' : 'Independent')}
                      </small>
                    </div>
                  </div>
                  <div className="v03-city-stats">
                    <div>
                      <small>{t.governance}</small>
                      <strong>
                        {selectedCity.governanceMode === 'ruler'
                          ? t.rulerCapital
                          : selectedCity.governanceMode === 'governor'
                            ? t.governor
                            : t.localSteward}
                      </strong>
                    </div>
                    <div>
                      <small>{t.garrison}</small>
                      <strong>{selectedCity.garrisonTroops.toLocaleString()}</strong>
                    </div>
                    <div>
                      <small>{t.food}</small>
                      <strong>{selectedCity.food.toLocaleString()}</strong>
                    </div>
                    <div>
                      <small>{t.gold}</small>
                      <strong>{selectedCity.gold.toLocaleString()}</strong>
                    </div>
                    <div>
                      <small>{t.loyalty}</small>
                      <strong>{selectedCity.loyalty}%</strong>
                    </div>
                    <div>
                      <small>{locale === 'zh' ? '農商' : 'Economy'}</small>
                      <strong>
                        {selectedCity.farming} / {selectedCity.commerce}
                      </strong>
                    </div>
                  </div>
                  {selectedGeo ? (
                    <div className="v03-route-info">
                      <span>
                        {locale === 'zh' ? '位置置信度' : 'Anchor confidence'} ·{' '}
                        {selectedGeo.confidence}
                      </span>
                      <small>{selectedGeo.researchNotes}</small>
                    </div>
                  ) : null}
                  {selectedCity.factionId === state.playerFactionId ? (
                    <div className="v03-governor-box">
                      <div className="v03-section-title">
                        <h3>{t.governor}</h3>
                        <span>
                          {selectedCity.governorId
                            ? state.officers.find(
                                (officer) => officer.id === selectedCity.governorId,
                              )?.name
                            : t.localSteward}
                        </span>
                      </div>
                      {selectedCity.id !== state.playerCapitalCityId ? (
                        <>
                          <div className="v03-row">
                            <select
                              key={selectedCity.id}
                              id="v03-governor-select"
                              defaultValue={
                                selectedCity.pendingAppointment?.governorId ??
                                selectedCity.governorId ??
                                ''
                              }
                            >
                              <option value="">{t.localSteward}</option>
                              {pendingGovernor && !pendingGovernorAvailable ? (
                                <option value={pendingGovernor.id} disabled>
                                  {pendingGovernor.name} · {locale === 'zh' ? '途中' : 'in transit'}
                                </option>
                              ) : null}
                              {governorCandidates.map((officer) => {
                                const cityId =
                                  officer.location.kind === 'city' ? officer.location.cityId : '';
                                const city = state.cities.find((entry) => entry.id === cityId);
                                return (
                                  <option key={officer.id} value={officer.id}>
                                    {officer.name} · {officer.chinese} ·{' '}
                                    {city ? displayName(city, locale) : ''}
                                  </option>
                                );
                              })}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                const input = document.getElementById(
                                  'v03-governor-select',
                                ) as HTMLSelectElement | null;
                                dispatch({
                                  type: 'appointGovernor',
                                  cityId: selectedCity.id,
                                  officerId: input?.value || null,
                                });
                              }}
                            >
                              {selectedCity.governorId ? t.dismiss : t.appoint}
                            </button>
                          </div>
                          {selectedCity.pendingAppointment
                            ? (() => {
                                const pendingOfficer = selectedCity.pendingAppointment.governorId
                                  ? state.officers.find(
                                      (officer) =>
                                        officer.id === selectedCity.pendingAppointment?.governorId,
                                    )
                                  : null;
                                const transfer = selectedCity.pendingAppointment.journeyId
                                  ? state.journeys.find(
                                      (journey) =>
                                        journey.id === selectedCity.pendingAppointment?.journeyId,
                                    )
                                  : null;
                                const effective = absoluteDateLabel(
                                  state.startYear,
                                  selectedCity.pendingAppointment.effectiveDay,
                                  locale,
                                );
                                const arrival = transfer
                                  ? absoluteDateLabel(
                                      state.startYear,
                                      transfer.expectedArrivalDay,
                                      locale,
                                    )
                                  : null;
                                const source = transfer
                                  ? state.cities.find((city) => city.id === transfer.sourceCityId)
                                  : null;
                                const subject = pendingOfficer
                                  ? `${pendingOfficer.name} · ${pendingOfficer.chinese}`
                                  : t.localSteward;
                                return (
                                  <small className="v03-muted">
                                    {transfer
                                      ? locale === 'zh'
                                        ? `${subject} 正在從 ${source ? displayName(source, locale) : transfer.sourceCityId} 調任，預計 ${arrival} 抵達；最早於 ${effective} 生效。`
                                        : `${subject} is traveling from ${source ? displayName(source, locale) : transfer.sourceCityId}, due ${arrival}; takes effect no earlier than ${effective}.`
                                      : locale === 'zh'
                                        ? `待生效：${subject}，預計 ${effective} 生效。`
                                        : `Pending: ${subject}; scheduled to take effect ${effective}.`}
                                  </small>
                                );
                              })()
                            : null}
                        </>
                      ) : null}
                      {selectedCity.governanceMode === 'ruler' ? (
                        <div className="v03-direct-work">
                          <strong>{t.directWork}</strong>
                          <small className="v03-work-quota">
                            {t.workRemaining}: {directWorkRemaining}/{directWorkQuota}
                          </small>
                          <button
                            type="button"
                            disabled={
                              directWorkRemaining === 0 ||
                              selectedCity.gold < 80 ||
                              selectedCity.farming >= 100
                            }
                            onClick={() =>
                              dispatch({
                                type: 'cityAction',
                                cityId: selectedCity.id,
                                action: 'develop-farming',
                              })
                            }
                          >
                            {t.improveFarm}
                          </button>
                          <button
                            type="button"
                            disabled={
                              directWorkRemaining === 0 ||
                              selectedCity.gold < 80 ||
                              selectedCity.commerce >= 100
                            }
                            onClick={() =>
                              dispatch({
                                type: 'cityAction',
                                cityId: selectedCity.id,
                                action: 'develop-commerce',
                              })
                            }
                          >
                            {t.improveMarket}
                          </button>
                          <button
                            type="button"
                            disabled={directWorkRemaining === 0}
                            onClick={() =>
                              dispatch({
                                type: 'cityAction',
                                cityId: selectedCity.id,
                                action: 'search',
                              })
                            }
                          >
                            {t.search}
                          </button>
                          <button
                            type="button"
                            disabled={directWorkRemaining === 0 || selectedCity.population <= 1000}
                            onClick={() =>
                              dispatch({
                                type: 'cityAction',
                                cityId: selectedCity.id,
                                action: 'recruit',
                              })
                            }
                          >
                            {t.recruit}
                          </button>
                          <button
                            type="button"
                            disabled={directWorkRemaining === 0 || selectedCity.loyalty >= 100}
                            onClick={() =>
                              dispatch({
                                type: 'cityAction',
                                cityId: selectedCity.id,
                                action: 'security',
                              })
                            }
                          >
                            {t.security}
                          </button>
                          <button
                            type="button"
                            disabled={
                              directWorkRemaining === 0 ||
                              !directCityOfficers.some((officer) => officer.loyalty < 100)
                            }
                            onClick={() =>
                              dispatch({
                                type: 'cityAction',
                                cityId: selectedCity.id,
                                action: 'feast',
                              })
                            }
                          >
                            {t.feast}
                          </button>
                          <button
                            type="button"
                            disabled={
                              directWorkRemaining === 0 ||
                              selectedCity.gold < 80 ||
                              selectedCity.food + 800 > 9_999_999
                            }
                            onClick={() =>
                              dispatch({
                                type: 'cityAction',
                                cityId: selectedCity.id,
                                action: 'buy-food',
                              })
                            }
                          >
                            {t.buyFood}
                          </button>
                          <button
                            type="button"
                            disabled={
                              directWorkRemaining === 0 ||
                              selectedCity.food < 800 ||
                              selectedCity.gold + 80 > 9_999_999
                            }
                            onClick={() =>
                              dispatch({
                                type: 'cityAction',
                                cityId: selectedCity.id,
                                action: 'sell-food',
                              })
                            }
                          >
                            {t.sellFood}
                          </button>
                          <button
                            type="button"
                            disabled={
                              directWorkRemaining === 0 ||
                              selectedCity.gold < 80 ||
                              selectedCity.food < 600 ||
                              (selectedCity.loyalty >= 100 && selectedCity.population >= 9_999_999)
                            }
                            onClick={() =>
                              dispatch({
                                type: 'cityAction',
                                cityId: selectedCity.id,
                                action: 'relieve',
                              })
                            }
                          >
                            {t.relievePeople}
                          </button>
                          {directCityOfficers.map((officer) => {
                            const desiredTroops = troopAssignments[officer.id] ?? officer.troops;
                            return (
                              <div className="v03-work-officer" key={officer.id}>
                                <strong>
                                  {officer.name} · {officer.troops.toLocaleString()}
                                </strong>
                                <small className="v03-muted">
                                  {officer.equipment === 'Fine arms'
                                    ? t.fineArmsEquipped
                                    : t.noFineArms}
                                </small>
                                <button
                                  type="button"
                                  disabled={
                                    directWorkRemaining === 0 ||
                                    officer.loyalty >= 100 ||
                                    selectedCity.gold < 100
                                  }
                                  onClick={() =>
                                    dispatch({
                                      type: 'cityAction',
                                      cityId: selectedCity.id,
                                      action: 'reward',
                                      officerId: officer.id,
                                    })
                                  }
                                >
                                  {t.rewardOfficer}
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    directWorkRemaining === 0 ||
                                    officer.equipment === 'Fine arms' ||
                                    officer.force >= 105 ||
                                    selectedCity.gold < 180
                                  }
                                  onClick={() =>
                                    dispatch({
                                      type: 'cityAction',
                                      cityId: selectedCity.id,
                                      action: 'equip',
                                      officerId: officer.id,
                                    })
                                  }
                                >
                                  {t.issueFineArms}
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    directWorkRemaining === 0 ||
                                    officer.troops <= 0 ||
                                    (officer.experience >= 10_000 &&
                                      officer.force >=
                                        (officer.equipment === 'Fine arms' ? 105 : 100))
                                  }
                                  onClick={() =>
                                    dispatch({
                                      type: 'cityAction',
                                      cityId: selectedCity.id,
                                      action: 'train',
                                      officerId: officer.id,
                                    })
                                  }
                                >
                                  {t.train}
                                </button>
                                <label>
                                  {t.assignmentAmount}
                                  <input
                                    aria-label={`${t.assignmentAmount}: ${officer.name}`}
                                    type="number"
                                    min={0}
                                    max={10000}
                                    step={100}
                                    value={desiredTroops}
                                    onChange={(event) =>
                                      setTroopAssignments((current) => ({
                                        ...current,
                                        [officer.id]: Number(event.target.value),
                                      }))
                                    }
                                  />
                                </label>
                                <button
                                  type="button"
                                  disabled={
                                    directWorkRemaining === 0 ||
                                    desiredTroops === officer.troops ||
                                    desiredTroops > officer.troops + selectedCity.reserve
                                  }
                                  onClick={() =>
                                    dispatch({
                                      type: 'cityAction',
                                      cityId: selectedCity.id,
                                      action: 'assign-troops',
                                      officerId: officer.id,
                                      amount: desiredTroops,
                                    })
                                  }
                                >
                                  {t.assignTroops}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <small className="v03-muted">
                          {getCityCapabilities(state, selectedCity.id).reason}
                        </small>
                      )}
                    </div>
                  ) : (
                    <p className="v03-muted">
                      {locale === 'zh'
                        ? '此城不受你的势力控制。'
                        : 'This city is outside your authority.'}
                    </p>
                  )}
                  {canOrderFromSelected ? (
                    <>
                      <div className="v03-order-switch">
                        <button
                          type="button"
                          className={requestKind === 'resource' ? 'selected' : ''}
                          onClick={() => setRequestKind('resource')}
                        >
                          {t.requestSupplies}
                        </button>
                        <button
                          type="button"
                          className={requestKind === 'campaign' ? 'selected' : ''}
                          onClick={() => setRequestKind('campaign')}
                        >
                          {t.orderMarch}
                        </button>
                      </div>
                      <div className="v03-order-form">
                        <label className="v03-field">
                          {t.to}
                          <select
                            value={targetCityId}
                            onChange={(event) => setTargetCityId(event.target.value)}
                          >
                            <option value="">—</option>
                            {availableTargets.map((city) => (
                              <option key={city.id} value={city.id}>
                                {displayName(city, locale)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="v03-field">
                          {t.deadline}
                          <input
                            type="number"
                            min={state.absoluteDay}
                            placeholder={locale === 'zh' ? '無期限' : 'No deadline'}
                            value={requestedByDay}
                            onChange={(event) => setRequestedByDay(event.target.value)}
                          />
                        </label>
                        {requestKind === 'resource' ? (
                          <>
                            <div className="v03-row">
                              <label className="v03-field">
                                {t.gold}
                                <input
                                  type="number"
                                  min="0"
                                  value={requestedGold}
                                  onChange={(event) => setRequestedGold(Number(event.target.value))}
                                />
                              </label>
                              <label className="v03-field">
                                {t.food}
                                <input
                                  type="number"
                                  min="0"
                                  value={requestedFood}
                                  onChange={(event) => setRequestedFood(Number(event.target.value))}
                                />
                              </label>
                            </div>
                            <div className="v03-row">
                              <label className="v03-field">
                                {t.resourceTroops}
                                <input
                                  type="number"
                                  min="0"
                                  step="100"
                                  value={requestedResourceTroops}
                                  onChange={(event) =>
                                    setRequestedResourceTroops(Number(event.target.value))
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                disabled={!targetCityId || requestedResourceTroops < 0}
                                onClick={submitResourceOrder}
                              >
                                {t.request}
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="v03-row">
                              <label className="v03-field">
                                {t.troops}
                                <input
                                  type="number"
                                  min="1"
                                  step="100"
                                  value={requestedTroops}
                                  onChange={(event) =>
                                    setRequestedTroops(Number(event.target.value))
                                  }
                                />
                              </label>
                              <label className="v03-field">
                                {t.intent}
                                <select
                                  value={intent}
                                  onChange={(event) =>
                                    setIntent(event.target.value as V03BattleIntent)
                                  }
                                >
                                  <option value="conquer">{t.conquer}</option>
                                  <option value="raid">{t.raid}</option>
                                  <option value="sack">{t.sack}</option>
                                </select>
                              </label>
                            </div>
                            <button
                              type="button"
                              className="v03-block"
                              disabled={!targetCityId || requestedTroops <= 0}
                              onClick={submitCampaignOrder}
                            >
                              {t.issue}
                            </button>
                          </>
                        )}
                        {selectedRoute ? (
                          <div className="v03-route-preview">
                            <strong>{selectedRoute.roadKmNominal} km</strong>
                            <span>
                              {t.estimatedArrival}:{' '}
                              {absoluteDateLabel(
                                state.startYear,
                                state.absoluteDay + selectedRoute.estimatedDays,
                                locale,
                              )}{' '}
                              · {selectedRoute.estimatedDays} {locale === 'zh' ? '日' : 'days'}
                            </span>
                            <small>
                              {t.routeStops}:{' '}
                              {(selectedRoute.routeCityIds ?? [selectedCity.id, targetCityId])
                                .map((cityId) => locationName(cityId))
                                .join(' → ')}
                            </small>
                          </div>
                        ) : targetCityId ? (
                          <p className="v03-muted">{t.noRoute}</p>
                        ) : null}
                        {orderPreview ? (
                          <div className="v03-route-preview" aria-live="polite">
                            {orderPreviewOrder ? (
                              <strong>
                                {locationName(orderPreviewOrder.sourceCityId)} →{' '}
                                {locationName(orderPreviewOrder.targetCityId)}
                              </strong>
                            ) : null}
                            {'executable' in orderPreview.preview ? (
                              <>
                                <span>
                                  {t.requested}: {t.gold}{' '}
                                  {orderPreview.preview.requested.gold.toLocaleString()} · {t.food}{' '}
                                  {orderPreview.preview.requested.food.toLocaleString()} ·{' '}
                                  {t.troops}{' '}
                                  {orderPreview.preview.requested.troops.toLocaleString()}
                                </span>
                                <strong>
                                  {t.planAvailable}: {t.gold}{' '}
                                  {orderPreview.preview.executable.gold.toLocaleString()} · {t.food}{' '}
                                  {orderPreview.preview.executable.food.toLocaleString()} ·{' '}
                                  {t.troops}{' '}
                                  {orderPreview.preview.executable.troops.toLocaleString()}
                                </strong>
                                <span>
                                  {t.planGap}: {t.gold}{' '}
                                  {orderPreview.preview.deficit.gold.toLocaleString()} · {t.food}{' '}
                                  {orderPreview.preview.deficit.food.toLocaleString()} · {t.troops}{' '}
                                  {orderPreview.preview.deficit.troops.toLocaleString()}
                                </span>
                              </>
                            ) : (
                              <>
                                <span>
                                  {t.requested}:{' '}
                                  {orderPreview.preview.requestedTroops.toLocaleString()} {t.troops}{' '}
                                  · {t.food} {orderPreview.preview.requestedFood.toLocaleString()}
                                </span>
                                <strong>
                                  {t.planAvailable}:{' '}
                                  {orderPreview.preview.executableTroops.toLocaleString()}{' '}
                                  {t.troops} · {t.food}{' '}
                                  {orderPreview.preview.executableFood.toLocaleString()}
                                </strong>
                                <span>
                                  {t.planGap}: {orderPreview.preview.deficitTroops.toLocaleString()}{' '}
                                  {t.troops} · {t.food}{' '}
                                  {Math.max(
                                    0,
                                    orderPreview.preview.requestedFood -
                                      orderPreview.preview.executableFood,
                                  ).toLocaleString()}
                                </span>
                              </>
                            )}
                            {orderPreviewSourceCity ? (
                              <span>
                                {t.garrison}:{' '}
                                {Math.max(
                                  0,
                                  orderPreviewSourceCity.garrisonTroops - orderPreviewTroops,
                                ).toLocaleString()}
                              </span>
                            ) : null}
                            <small>
                              {orderPreview.preview.earliestDepartureDay === null
                                ? locale === 'zh'
                                  ? '最早出发日：待定'
                                  : 'Earliest departure: undetermined'
                                : `${locale === 'zh' ? '最早出发' : 'Earliest departure'}: ${absoluteDateLabel(state.startYear, orderPreview.preview.earliestDepartureDay, locale)}`}
                              {' · '}
                              {orderPreview.preview.estimatedArrivalDay === null
                                ? locale === 'zh'
                                  ? '抵达日：待定'
                                  : 'Arrival: undetermined'
                                : `${t.estimatedArrival}: ${absoluteDateLabel(state.startYear, orderPreview.preview.estimatedArrivalDay, locale)}`}
                            </small>
                            {orderPreview.preview.route ? (
                              <small>
                                {t.routeDistance}:{' '}
                                {orderPreview.preview.route.roadKmNominal.toLocaleString()} km ·{' '}
                                {orderPreview.preview.route.estimatedDays}{' '}
                                {locale === 'zh' ? '日' : 'days'}
                                {orderPreview.preview.route.routeCityIds?.length ? (
                                  <>
                                    {' · '}
                                    {t.routeStops}:{' '}
                                    {orderPreview.preview.route.routeCityIds
                                      .map((cityId) => locationName(cityId))
                                      .join(' → ')}
                                  </>
                                ) : null}
                              </small>
                            ) : null}
                            {orderPreview.preview.reasonCodes.length ? (
                              <small>
                                {t.reasons}:{' '}
                                {orderPreview.preview.reasonCodes
                                  .map((code) => ORDER_REASON_COPY[code][locale])
                                  .join(' · ')}
                              </small>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </>
              ) : (
                <p className="v03-muted">{t.noCity}</p>
              )}
              <section className="v03-orders-list">
                <div className="v03-section-title">
                  <h3>{t.campaignOrders}</h3>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => openWiki('requisition')}
                  >
                    ?
                  </button>
                </div>
                {activeOrders.length === 0 ? (
                  <p className="v03-muted">{t.emptyOrders}</p>
                ) : (
                  activeOrders.slice(-6).map((order) => {
                    const journey = order.journeyId
                      ? state?.journeys.find((entry) => entry.id === order.journeyId)
                      : undefined;
                    const resourceOrder = order.kind === 'resource';
                    const requestedCargo = resourceOrder
                      ? (order.requested as V03JourneyCargo)
                      : null;
                    const proposedCargo = resourceOrder
                      ? (order.proposed as V03JourneyCargo)
                      : null;
                    const cargoDraft = reducedCargoByOrder[order.id] ??
                      proposedCargo ?? { gold: 0, food: 0, troops: 0 };
                    const requestedTroopCount = resourceOrder ? 0 : (order.requested as number);
                    const proposedTroopCount = resourceOrder ? 0 : (order.proposed as number);
                    const troopDraft = reducedTroopsByOrder[order.id] ?? proposedTroopCount;
                    return (
                      <div className="v03-order-card" key={order.id}>
                        <strong>
                          {order.source} → {order.target}
                        </strong>
                        <small>{localizeOrderMessage(order.message, locale)}</small>
                        {resourceOrder && requestedCargo && proposedCargo ? (
                          <small>
                            {t.requested}: {t.gold} {requestedCargo.gold.toLocaleString()} ·{' '}
                            {t.food} {requestedCargo.food.toLocaleString()} · {t.troops}{' '}
                            {requestedCargo.troops.toLocaleString()}
                            <br />
                            {t.planAvailable}: {t.gold} {proposedCargo.gold.toLocaleString()} ·{' '}
                            {t.food} {proposedCargo.food.toLocaleString()} · {t.troops}{' '}
                            {proposedCargo.troops.toLocaleString()}
                          </small>
                        ) : !resourceOrder ? (
                          <small>
                            {t.requested}: {requestedTroopCount.toLocaleString()} {t.troops} ·{' '}
                            {t.planAvailable}: {proposedTroopCount.toLocaleString()} {t.troops}
                          </small>
                        ) : null}
                        {journey && ['outbound', 'waiting'].includes(journey.status) ? (
                          <div className="v03-row">
                            <small>{order.returnRequested ? t.recallRequested : t.inTransit}</small>
                            {!order.returnRequested ? (
                              <button
                                type="button"
                                onClick={() =>
                                  dispatch({ type: 'recallJourney', journeyId: journey.id })
                                }
                              >
                                {t.recallJourney}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        {!order.journeyId &&
                        (order.status === 'proposed' || order.status === 'waiting') ? (
                          <div className="v03-order-actions-panel">
                            {resourceOrder ? (
                              <div className="v03-row">
                                <label className="v03-field">
                                  {t.cargoGold}
                                  <input
                                    type="number"
                                    min="0"
                                    max={proposedCargo?.gold ?? 0}
                                    value={cargoDraft.gold}
                                    onChange={(event) =>
                                      setReducedCargoByOrder((current) => ({
                                        ...current,
                                        [order.id]: {
                                          ...cargoDraft,
                                          gold: Number(event.target.value),
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <label className="v03-field">
                                  {t.cargoFood}
                                  <input
                                    type="number"
                                    min="0"
                                    max={proposedCargo?.food ?? 0}
                                    value={cargoDraft.food}
                                    onChange={(event) =>
                                      setReducedCargoByOrder((current) => ({
                                        ...current,
                                        [order.id]: {
                                          ...cargoDraft,
                                          food: Number(event.target.value),
                                        },
                                      }))
                                    }
                                  />
                                </label>
                                <label className="v03-field">
                                  {t.cargoTroops}
                                  <input
                                    type="number"
                                    min="0"
                                    max={proposedCargo?.troops ?? 0}
                                    step="100"
                                    value={cargoDraft.troops}
                                    onChange={(event) =>
                                      setReducedCargoByOrder((current) => ({
                                        ...current,
                                        [order.id]: {
                                          ...cargoDraft,
                                          troops: Number(event.target.value),
                                        },
                                      }))
                                    }
                                  />
                                </label>
                              </div>
                            ) : (
                              <label className="v03-field">
                                {t.reduceTo} · {t.troops}
                                <input
                                  type="number"
                                  min="1"
                                  max={proposedTroopCount}
                                  step="100"
                                  value={troopDraft}
                                  onChange={(event) =>
                                    setReducedTroopsByOrder((current) => ({
                                      ...current,
                                      [order.id]: Number(event.target.value),
                                    }))
                                  }
                                />
                              </label>
                            )}
                            <div className="v03-order-actions">
                              <button
                                type="button"
                                onClick={() => answerOrder(order.id, order.kind, 'accept')}
                              >
                                {t.accept}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  answerOrder(
                                    order.id,
                                    order.kind,
                                    'reduce',
                                    resourceOrder ? cargoDraft : troopDraft,
                                  )
                                }
                              >
                                {t.acceptReduced}
                              </button>
                              <button
                                type="button"
                                onClick={() => answerOrder(order.id, order.kind, 'wait')}
                              >
                                {t.wait}
                              </button>
                              <button
                                type="button"
                                onClick={() => answerOrder(order.id, order.kind, 'cancel')}
                              >
                                {t.cancel}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </section>
              <section className="v03-diplomacy">
                <div className="v03-section-title">
                  <h3>{t.diplomacy}</h3>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => openWiki('diplomacy')}
                  >
                    ?
                  </button>
                </div>
                {state.coalitionInvitations
                  .filter(
                    (invitation) =>
                      invitation.expiresMonthIndex > state.monthIndex &&
                      invitation.targetFactionId !== state.playerFactionId,
                  )
                  .map((invitation) => (
                    <div className="v03-order-card" key={invitation.id}>
                      <strong>{t.coalitionInvitation}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: 'acceptCoalitionInvitation',
                            invitationId: invitation.id,
                          })
                        }
                      >
                        {t.joinCoalition}
                      </button>
                    </div>
                  ))}
                {diplomacyTargets.map((faction) => {
                  const treaty = state.alliances.find(
                    (alliance) =>
                      ((alliance.a === state.playerFactionId && alliance.b === faction.id) ||
                        (alliance.b === state.playerFactionId && alliance.a === faction.id)) &&
                      isV03AllianceActive(
                        state.alliances,
                        state.playerFactionId,
                        faction.id,
                        state.monthIndex,
                      ),
                  );
                  const otherId = treaty
                    ? treaty.a === state.playerFactionId
                      ? treaty.b
                      : treaty.a
                    : '';
                  if (treaty && otherId === faction.id) {
                    return (
                      <div className="v03-order-card" key={faction.id}>
                        <strong>
                          {locale === 'zh' ? faction.chinese : faction.name} · {t.activeAlliance}
                        </strong>
                        <small>
                          {treaty.expiresMonthIndex - state.monthIndex} {t.monthsRemaining}
                        </small>
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({ type: 'breakAlliance', targetFactionId: faction.id })
                          }
                        >
                          {t.breakAlliance}
                        </button>
                      </div>
                    );
                  }
                  return null;
                })}
                {diplomacyTarget ? (
                  <>
                    <label className="v03-field">
                      {t.proposeAlliance}
                      <select
                        value={diplomacyTarget.id}
                        onChange={(event) => setDiplomacyTargetId(event.target.value)}
                      >
                        {diplomacyTargets.map((faction) => (
                          <option key={faction.id} value={faction.id}>
                            {locale === 'zh' ? faction.chinese : faction.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <small className="v03-muted">
                      {t.acceptChance}: {getV03AllianceChance(state, diplomacyTarget.id)}%
                    </small>
                    <button
                      type="button"
                      disabled={
                        state.phase !== 'planning' ||
                        playerAlliances.some((alliance) =>
                          [alliance.a, alliance.b].includes(diplomacyTarget.id),
                        )
                      }
                      onClick={() =>
                        dispatch({ type: 'proposeAlliance', targetFactionId: diplomacyTarget.id })
                      }
                    >
                      {t.propose}
                    </button>
                  </>
                ) : (
                  <p className="v03-muted">
                    {locale === 'zh'
                      ? '没有可进行外交的势力。'
                      : 'No active faction is available for diplomacy.'}
                  </p>
                )}
              </section>
            </>
          )}
          <section className="v03-events">
            <div className="v03-section-title">
              <h3>{t.events}</h3>
              <span>{worldEvents.length}</span>
            </div>
            {worldEvents.length === 0 ? (
              <p className="v03-muted">—</p>
            ) : (
              worldEvents.map((event) => {
                const copy = localizedEvent(event, state, locale);
                return (
                  <article key={event.id} className="v03-event">
                    <strong>{copy.title}</strong>
                    <p>{copy.detail}</p>
                    <button
                      type="button"
                      onClick={() => dispatch({ type: 'acknowledgeEvent', eventId: event.id })}
                    >
                      {t.acknowledge}
                    </button>
                  </article>
                );
              })
            )}
          </section>
        </aside>
      </section>
      {showWiki ? (
        <div
          className="v03-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowWiki(false);
          }}
        >
          <section
            ref={wikiModalRef}
            className="v03-wiki-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t.wiki}
            onKeyDown={(event) => {
              if (event.key !== 'Tab') return;
              const controls = wikiModalRef.current?.querySelectorAll<HTMLElement>(
                'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])',
              );
              if (!controls?.length) return;
              const first = controls[0]!;
              const last = controls[controls.length - 1]!;
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
            }}
          >
            <header>
              <div>
                <span className="v03-kicker">HEGEMONY v0.3</span>
                <h2>{t.wiki}</h2>
              </div>
              <button type="button" onClick={() => setShowWiki(false)} aria-label={t.close}>
                ×
              </button>
            </header>
            <label className="v03-wiki-search">
              <span>{t.searchWiki}</span>
              <input
                type="search"
                value={wikiSearch}
                onChange={(event) => setWikiSearch(event.target.value)}
                aria-label={t.searchWiki}
              />
            </label>
            <nav className="v03-wiki-tabs">
              {filteredWikiArticles.map((article) => (
                <button
                  type="button"
                  className={wikiTopic === article.id ? 'active' : ''}
                  key={article.id}
                  onClick={() => setWikiTopic(article.id)}
                >
                  {TOPIC_LABEL[locale][article.id]}
                </button>
              ))}
            </nav>
            <div className="v03-wiki-body">
              {displayedWikiArticle ? (
                displayedWikiArticle.sections.map((section) => (
                  <section key={section.heading}>
                    <h3>{section.heading}</h3>
                    {section.body.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </section>
                ))
              ) : (
                <p role="status">{t.noWikiResults}</p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
