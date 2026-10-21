import { useEffect, useMemo, useRef, useState } from 'react';
import { scenarioById } from '../content/scenario';
import {
  getUnitAttackTargets,
  getUnitReachableTiles,
  WATER_ATTACK_MULTIPLIER,
  WATER_INCOMING_DAMAGE_MULTIPLIER,
} from './battle';
import { CITY_GEOGRAPHY, ROUTE_DEFINITIONS, projectCampaignPoint } from './geography';
import { CAMPAIGN_MOUNTAIN_RANGES, CAMPAIGN_WATERWAYS } from './geography/illustration';
import { executeV03Command } from './commands';
import { v03CurrentDate } from './engine';
import { getCityCapabilities } from './governance/authority';
import { loadV03Autosave, saveV03Autosave, encodeV03Save, decodeV03Save } from './platform/storage';
import { getV03WikiArticles, type V03Locale, type V03WikiTopic } from './wiki';
import {
  CampaignMapView,
  BattlefieldMapView,
  BattlefieldMinimap,
  type CampaignCityVisual,
  type WorldPolyline,
} from './rendering';
import { V03_ASSETS, resolvePublicAsset } from './rendering/assets';
import { createV03Game, availableV03Scenarios } from './initial-state';
import type { V03BattleIntent, V03GameState, V03JourneyCargo } from './types';
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
  | 'owned'
  | 'planMessage'
  | 'emptyOrders'
  | 'dayLimit';

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
    improveFarm: 'Improve farmland · 100 gold',
    improveMarket: 'Improve commerce · 100 gold',
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
    owned: 'Owned',
    planMessage:
      'The governor’s plan includes its proposed strength, supply gap, earliest departure and arrival estimate.',
    emptyOrders: 'No active orders.',
    dayLimit:
      'At the 30-day limit, the side with more surviving troops controls the field; ties go to the defender.',
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
    improveFarm: '发展农田 · 100 金',
    improveMarket: '发展商业 · 100 金',
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
    owned: '辖下城市',
    planMessage: '太守方案会列出可执行兵力、粮草缺口、最早出发日和预计抵达日。',
    emptyOrders: '暂无待处理命令。',
    dayLimit: '到 30 日时限，剩余兵力较多的一方控制战场；若兵力相同，则由守方获胜。',
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
  },
};

const CAMPAIGN_BACKGROUND = resolvePublicAsset(
  V03_ASSETS.campaignMapInk01.path,
  import.meta.env.BASE_URL,
);
const ROUTE_BY_CITIES = new Map(ROUTE_DEFINITIONS.map((route) => [route.id, route]));

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
  const source = CITY_GEOGRAPHY.find((city) => city.id === journey.sourceCityId);
  const target = CITY_GEOGRAPHY.find((city) => city.id === journey.destinationCityId);
  if (!source || !target) return null;
  const total = journey.routeSnapshot.reduce((sum, segment) => sum + segment.lengthKm, 0) || 1;
  const complete = journey.routeSnapshot.reduce(
    (sum, segment, index) =>
      sum + Math.min(segment.lengthKm, journey.segmentProgressKm[index] ?? 0),
    0,
  );
  const fraction = Math.max(0, Math.min(1, complete / total));
  const from = mapPosition(source.latitude, source.longitude);
  const to = mapPosition(target.latitude, target.longitude);
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

export default function V03App() {
  const [locale, setLocale] = useState<V03Locale>('en');
  const [state, setState] = useState<V03GameState | null>(null);
  const [scenarioId, setScenarioId] = useState('divided-realm-190');
  const [factionId, setFactionId] = useState('cao');
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [showWiki, setShowWiki] = useState(false);
  const [wikiTopic, setWikiTopic] = useState<V03WikiTopic>('overview');
  const [feedback, setFeedback] = useState('');
  const [autosaveError, setAutosaveError] = useState(false);
  const [requestKind, setRequestKind] = useState<'resource' | 'campaign'>('resource');
  const [targetCityId, setTargetCityId] = useState('');
  const [requestedTroops, setRequestedTroops] = useState(2000);
  const [requestedGold, setRequestedGold] = useState(300);
  const [requestedFood, setRequestedFood] = useState(1000);
  const [intent, setIntent] = useState<V03BattleIntent>('conquer');
  const fileInput = useRef<HTMLInputElement>(null);
  const t = COPY[locale];

  useEffect(() => {
    try {
      const saved = loadV03Autosave();
      if (saved) {
        setState(saved);
        setSelectedCityId(saved.playerCapitalCityId);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t.invalidSave);
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
    state?.battles.find((battle) => battle.id === selectedBattleId && battle.active) ??
    activeBattles[0] ??
    null;
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

  useEffect(() => {
    if (!state) return;
    if (!selectedCityId || !state.cities.some((city) => city.id === selectedCityId))
      setSelectedCityId(state.playerCapitalCityId);
    if (activeBattles.length && !activeBattles.some((battle) => battle.id === selectedBattleId)) {
      setSelectedBattleId(activeBattles[0]!.id);
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
        result.error ??
          (locale === 'zh' ? '命令未能执行。' : 'The command could not be completed.'),
      );
      return;
    }
    setState(result.state);
    if (result.message) setFeedback(result.message);
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
      setFeedback(error instanceof Error ? error.message : 'Could not create campaign.');
    }
  };

  const exportSave = () => {
    if (!state) return;
    const blob = new Blob([encodeV03Save(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hegemony-v0.3-${state.scenarioId}-${state.absoluteDay}.save`;
    link.click();
    URL.revokeObjectURL(url);
    setFeedback(t.saved);
  };

  const importSave = async (file?: File) => {
    if (!file) return;
    try {
      const imported = decodeV03Save(await file.text());
      setState(imported);
      setSelectedCityId(imported.playerCapitalCityId);
      setSelectedBattleId(null);
      setSelectedUnitId(null);
      setFeedback(t.imported);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : t.invalidSave);
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

  const campaignRoutes = useMemo<WorldPolyline[]>(() => {
    return ROUTE_DEFINITIONS.map((route) => {
      const from = CITY_GEOGRAPHY.find((city) => city.id === route.fromCityId)!;
      const to = CITY_GEOGRAPHY.find((city) => city.id === route.toCityId)!;
      return {
        id: route.id,
        points: [
          mapPosition(from.latitude, from.longitude),
          mapPosition(to.latitude, to.longitude),
        ],
        label: `${route.roadKmNominal} km · ${route.baselineDaysNominal} days nominal`,
      };
    });
  }, []);

  const submitResourceOrder = () => {
    if (!state || !selectedCity) return;
    dispatch({
      type: 'requestRequisition',
      sourceCityId: selectedCity.id,
      targetCityId,
      requested: { gold: requestedGold, food: requestedFood, troops: 0 },
      requestedByDay: null,
    });
  };

  const submitCampaignOrder = () => {
    if (!state || !selectedCity) return;
    dispatch({
      type: 'issueCampaignDirective',
      sourceCityId: selectedCity.id,
      targetCityId,
      intent,
      requestedTroops,
      requestedByDay: null,
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
          .filter((order) => ['proposed', 'waiting', 'accepted', 'reserved'].includes(order.status))
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
            proposed: order.proposed,
          })),
        ...state.directives
          .filter((order) => ['proposed', 'waiting', 'accepted', 'reserved'].includes(order.status))
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
            proposed: order.proposedTroops,
          })),
      ]
    : [];
  const friendlyCities =
    state?.cities.filter((city) => city.factionId === state.playerFactionId) ?? [];
  const hostileCities =
    state?.cities.filter((city) => city.factionId !== state.playerFactionId) ?? [];
  const canOrderFromSelected =
    state && selectedCity
      ? getCityCapabilities(state, selectedCity.id).requisitionResources
      : false;
  const wikiArticles = getV03WikiArticles(locale);
  const openWiki = (topic: V03WikiTopic) => {
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
  const isBattleView = Boolean(activeBattle && battleState);
  const selectedGeo = selectedCity
    ? CITY_GEOGRAPHY.find((city) => city.id === selectedCity.id)
    : undefined;
  const availableTargets =
    requestKind === 'resource'
      ? friendlyCities.filter((city) => city.id !== selectedCity?.id)
      : hostileCities;
  const selectedRoute =
    selectedCity && targetCityId
      ? ROUTE_BY_CITIES.get([selectedCity.id, targetCityId].sort().join('--'))
      : undefined;
  const locationName = (cityId: string) => {
    const city = state.cities.find((entry) => entry.id === cityId);
    return city ? displayName(city, locale) : cityId;
  };
  const troopVisuals =
    battleState?.units.map((unit) => ({
      id: unit.id,
      troopType: unit.troopType,
      position: { x: unit.x, y: unit.y },
      faction: unit.side === battleState.playerSide ? 'player' : 'opponent',
      strength: unit.troops,
      label: unit.name,
      selected: unit.id === selectedUnitId,
      status: `${unit.morale}% morale`,
    })) ?? [];
  const camps =
    battleState?.map.objectives.map((objective) => ({
      id: objective.id,
      position: objective.position,
      label: `${objective.owner} field camp`,
    })) ?? [];
  const attackableCells = attackTargets.map((unit) => ({ x: unit.x, y: unit.y }));
  const playerUnit = (unitId: string) =>
    battleState?.units.find((unit) => unit.id === unitId)?.side === battleState?.playerSide;

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
              onClick={() => dispatch({ type: 'advance', days: 1 })}
            >
              {t.advanceBattle}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => dispatch({ type: 'advance', days: 1 })}>
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
          <button type="button" onClick={() => state && saveV03Autosave(state)}>
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
          {t.savingFailed}. {feedback}
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
            onClick={() => setSelectedBattleId(null)}
            title={t.campaign}
          >
            地圖
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
                {locale === 'zh' ? '战日' : 'Battle day'} {battleState.day} / {battleState.dayLimit}
              </div>
            </div>
            <div className="v03-battle-board">
              <BattlefieldMapView
                map={battleState.map}
                units={troopVisuals}
                camps={camps}
                selectedCell={currentUnit ? { x: currentUnit.x, y: currentUnit.y } : undefined}
                reachableCells={reachableCells}
                attackableCells={attackableCells}
                locale={locale}
                waterAttackMultiplier={WATER_ATTACK_MULTIPLIER}
                waterIncomingDamageMultiplier={WATER_INCOMING_DAMAGE_MULTIPLIER}
                onUnitClick={(unitId) => {
                  if (!battleState) return;
                  if (currentUnit && attackTargets.some((target) => target.id === unitId)) {
                    dispatch({
                      type: 'battleAction',
                      battleId: activeBattle.id,
                      action: { type: 'attack', unitId: currentUnit.id, targetId: unitId },
                    });
                  } else if (playerUnit(unitId)) setSelectedUnitId(unitId);
                }}
                onCellClick={(cell) => {
                  if (
                    currentUnit &&
                    reachableCells.some((point) => point.x === cell.x && point.y === cell.y)
                  )
                    dispatch({
                      type: 'battleAction',
                      battleId: activeBattle.id,
                      action: { type: 'move', unitId: currentUnit.id, x: cell.x, y: cell.y },
                    });
                }}
              />
            </div>
            <div className="v03-battle-lower">
              <BattlefieldMinimap
                map={battleState.map}
                units={troopVisuals}
                camps={camps}
                locale={locale}
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
              className="v03-map-frame"
              style={{ backgroundImage: `url(${CAMPAIGN_BACKGROUND})` }}
            >
              <CampaignMapView
                bounds={{ left: 0, top: 0, width: 1000, height: 1000 }}
                backgroundImage={CAMPAIGN_BACKGROUND}
                cities={campaignCities}
                routes={campaignRoutes}
                waterways={CAMPAIGN_WATERWAYS as WorldPolyline[]}
                mountainRanges={CAMPAIGN_MOUNTAIN_RANGES as WorldPolyline[]}
                locale={locale}
                onCityClick={setSelectedCityId}
              />
              {state.journeys
                .filter(
                  (journey) => journey.status === 'outbound' || journey.status === 'returning',
                )
                .map((journey) => {
                  const position = journeyPosition(journey);
                  if (!position) return null;
                  const style = { left: `${position.x / 10}%`, top: `${position.y / 10}%` };
                  return (
                    <button
                      type="button"
                      key={journey.id}
                      className="v03-army-marker"
                      style={style}
                      onClick={() =>
                        setFeedback(
                          `${locationName(journey.sourceCityId)} → ${locationName(journey.destinationCityId)} · ETA ${journey.expectedArrivalDay - state.absoluteDay} days`,
                        )
                      }
                      title={`${locationName(journey.sourceCityId)} → ${locationName(journey.destinationCityId)}`}
                    >
                      軍
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
                    onClick={() => {
                      if (unit.side === battleState.playerSide) setSelectedUnitId(unit.id);
                      else if (currentUnit && attackTargets.some((target) => target.id === unit.id))
                        dispatch({
                          type: 'battleAction',
                          battleId: activeBattle.id,
                          action: { type: 'attack', unitId: currentUnit.id, targetId: unit.id },
                        });
                    }}
                  >
                    <span className="v03-unit-glyph">
                      {unit.troopType === 'cavalry'
                        ? '騎'
                        : unit.troopType === 'archer'
                          ? '弓'
                          : unit.troopType === 'naval'
                            ? '舟'
                            : '步'}
                    </span>
                    <span>
                      <strong>{unit.name}</strong>
                      <small>
                        {unit.troops.toLocaleString()} · {unit.morale}%
                      </small>
                    </span>
                    <i>{unit.side === battleState.playerSide ? '●' : '○'}</i>
                  </button>
                ))}
              </div>
              {currentUnit ? (
                <div className="v03-card v03-unit-detail">
                  <strong>{currentUnit.name}</strong>
                  <p>
                    {currentUnit.troops.toLocaleString()} {locale === 'zh' ? '兵' : 'troops'} ·{' '}
                    {currentUnit.morale}% {locale === 'zh' ? '士氣' : 'morale'}
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
                    {locale === 'zh' ? '待命' : 'Wait'}
                  </button>
                </div>
              ) : null}
              <button
                type="button"
                className="v03-primary v03-block"
                onClick={() => dispatch({ type: 'advance', days: 1 })}
              >
                {t.advanceBattle}
              </button>
              <button type="button" className="v03-block" onClick={() => setSelectedBattleId(null)}>
                {t.campaign}
              </button>
              <div className="v03-log-box">
                <strong>{locale === 'zh' ? '戰況' : 'Battle log'}</strong>
                {battleState.log
                  .slice(-6)
                  .reverse()
                  .map((line, i) => (
                    <p key={`${i}-${line}`}>{line}</p>
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
                          <button
                            type="button"
                            disabled={selectedCity.gold < 100 || selectedCity.farming >= 100}
                            onClick={() => dispatch({ type: 'developCapital', field: 'farming' })}
                          >
                            {t.improveFarm}
                          </button>
                          <button
                            type="button"
                            disabled={selectedCity.gold < 100 || selectedCity.commerce >= 100}
                            onClick={() => dispatch({ type: 'developCapital', field: 'commerce' })}
                          >
                            {t.improveMarket}
                          </button>
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
                        {requestKind === 'resource' ? (
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
                            <button
                              type="button"
                              disabled={!targetCityId}
                              onClick={submitResourceOrder}
                            >
                              {t.request}
                            </button>
                          </div>
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
                              {selectedRoute.baselineDaysNominal}{' '}
                              {locale === 'zh' ? '日（名义）' : 'days nominal'}
                            </span>
                            <small>{selectedRoute.researchNotes}</small>
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
                  activeOrders.slice(-6).map((order) => (
                    <div className="v03-order-card" key={order.id}>
                      <strong>
                        {order.source} → {order.target}
                      </strong>
                      <small>{order.message}</small>
                      {order.status === 'proposed' || order.status === 'waiting' ? (
                        <div className="v03-order-actions">
                          <button
                            type="button"
                            onClick={() =>
                              answerOrder(
                                order.id,
                                order.kind,
                                order.status === 'waiting' ? 'wait' : 'accept',
                              )
                            }
                          >
                            {order.status === 'waiting' ? t.wait : t.acceptReduced}
                          </button>
                          {order.kind === 'campaign' ? (
                            <button
                              type="button"
                              onClick={() =>
                                answerOrder(
                                  order.id,
                                  order.kind,
                                  'reduce',
                                  order.proposed as number,
                                )
                              }
                            >
                              {t.acceptReduced}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => answerOrder(order.id, order.kind, 'cancel')}
                          >
                            {t.cancel}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
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
              worldEvents.map((event) => (
                <article key={event.id} className="v03-event">
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: 'acknowledgeEvent', eventId: event.id })}
                  >
                    {t.acknowledge}
                  </button>
                </article>
              ))
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
          <section className="v03-wiki-modal" role="dialog" aria-modal="true" aria-label={t.wiki}>
            <header>
              <div>
                <span className="v03-kicker">HEGEMONY v0.3</span>
                <h2>{t.wiki}</h2>
              </div>
              <button type="button" onClick={() => setShowWiki(false)} aria-label={t.close}>
                ×
              </button>
            </header>
            <nav className="v03-wiki-tabs">
              {wikiArticles.map((article) => (
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
              {getV03WikiArticles(locale)
                .find((article) => article.id === wikiTopic)
                ?.sections.map((section) => (
                  <section key={section.heading}>
                    <h3>{section.heading}</h3>
                    {section.body.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </section>
                ))}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
