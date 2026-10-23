import { useToasts } from './useToasts';
import { isOfficerCommitted } from '../../governance/commitments';
import { gridToWorld } from '../../rendering';
import { useEffect, useMemo, useRef, useState } from 'react';
import { scenarioById } from '../../content/scenario';
import {
  getUnitAttackTargets,
  getUnitReachableTiles,
  predictBattleAttack,
  getAvailableBattleTactics,
  getBattleTacticTargets,
  predictBattleTactic,
  type BattleTactic,
} from '../../battle';

import { cityWorkQuota, cityWorkUsedThisMonth } from '../../governance/city-actions';
import { createV03OrderServices } from '../../governance/services';

import { loadV03Autosave, saveV03Autosave } from '../../platform/storage';

import { type V03Locale, type V03WikiTopic } from '../../wiki';

import {
  battlefieldBounds,
  battlefieldViewportGridPolygon,
  fitBattlefieldViewport,
  focusBattlefieldPointsViewport,
  fitCampaignViewport,
  resizeBattlefieldViewport,
  resizeCampaignViewport,
  type BattlefieldViewBox,
  type CampaignViewBox,
} from '../../rendering';

import type { V03BattleIntent, V03GameState, V03JourneyCargo } from '../../types';

import { COPY } from '../shared/app-copy-1';
import { localizeSaveError, CAMPAIGN_BOUNDS } from '../shared/app-copy-2';
import { CAMPAIGN_REGIONAL_BOUNDS } from '../../geography/campaign-map';

export function useGameSession() {
  const [locale, setLocale] = useState<V03Locale>(
    new URLSearchParams(window.location.search).get('lang') === 'zh' ? 'zh' : 'en',
  );
  const [campaignWindowOpen, setCampaignWindowOpen] = useState(false);
  const [marchNotice, setMarchNotice] = useState<{
    source: string;
    target: string;
    troops: number;
    arrivalDay: number;
  } | null>(null);
  const [state, setState] = useState<V03GameState | null>(null);
  const [campaignTab, setCampaignTab] = useState<'city' | 'forces' | 'orders' | 'diplomacy'>(
    'city',
  );
  const [showReports, setShowReports] = useState(false);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showCampaignMenu, setShowCampaignMenu] = useState(false);
  const [confirmation, setConfirmation] = useState<'replace' | 'withdraw' | 'end-day' | null>(null);
  const [campaignSessionRevision, setCampaignSessionRevision] = useState(0);
  const [scenarioId, setScenarioId] = useState('divided-realm-190');
  const [factionId, setFactionId] = useState('cao');
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedBattleId, setSelectedBattleId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'campaign' | 'battle'>('campaign');
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedTactic, setSelectedTactic] = useState<BattleTactic | null>(null);
  const [inspectedCell, setInspectedCell] = useState<{ x: number; y: number } | null>(null);
  const [showWiki, setShowWiki] = useState(false);
  const [wikiTopic, setWikiTopic] = useState<V03WikiTopic>('overview');
  const [wikiSearch, setWikiSearch] = useState('');
  const wikiModalRef = useRef<HTMLElement>(null);
  const wikiReturnFocus = useRef<HTMLElement | null>(null);
  const { feedback, setFeedback } = useToasts(locale, state);
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
      | import('../../governance/orders').RequisitionPreview
      | import('../../governance/orders').CampaignDirectivePreview;
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
      if (!campaignViewportInitialized.current) {
        campaignViewportInitialized.current = true;
        setCampaignViewport(
          fitCampaignViewport(CAMPAIGN_REGIONAL_BOUNDS, rect.width / rect.height),
        );
      } else {
        setCampaignViewport((viewport) =>
          resizeCampaignViewport(CAMPAIGN_BOUNDS, viewport, rect.width / rect.height),
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
  }, [Boolean(state), showCampaignMenu, campaignSessionRevision, viewMode]);
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
        if (!state || showCampaignMenu || confirmation) return;
        if (!showWiki) {
          wikiReturnFocus.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
          setWikiTopic('overview');
          setCampaignWindowOpen(false);
          setShowWiki(true);
        }
      } else if (event.key === 'Escape' && showWiki) {
        setShowWiki(false);
      }
    };
    window.addEventListener('keydown', handleWikiShortcut);
    return () => window.removeEventListener('keydown', handleWikiShortcut);
  }, [showWiki, Boolean(state), showCampaignMenu, confirmation]);
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
      ? state.officers.filter(
          (officer) =>
            officer.alive &&
            officer.factionId === state.playerFactionId &&
            !isOfficerCommitted(state, officer.id) &&
            officer.location.kind !== 'captured',
        )
      : [];
  const [governorDraft, setGovernorDraft] = useState<{ cityId: string; officerId: string } | null>(
    null,
  );
  const governorSelection = selectedCity
    ? governorDraft?.cityId === selectedCity.id
      ? governorDraft.officerId
      : selectedCity.pendingAppointment
        ? (selectedCity.pendingAppointment.governorId ?? '')
        : (selectedCity.governorId ?? '')
    : '';
  const activeBattles =
    state?.battles.filter(
      (battle) =>
        battle.active &&
        (battle.attackerFactionId === state.playerFactionId ||
          battle.defenderFactionId === state.playerFactionId),
    ) ?? [];
  const activeBattle =
    viewMode === 'battle'
      ? (activeBattles.find((battle) => battle.id === selectedBattleId) ?? activeBattles[0] ?? null)
      : null;
  const battleState = activeBattle?.battleData ?? null;
  const currentUnit =
    battleState?.units.find((unit) => unit.id === selectedUnitId && unit.troops > 0) ?? null;
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
      const rect = (frame.querySelector('svg') ?? frame).getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const aspect = rect.width / rect.height;
      if (battleViewportIdentity.current !== identity) {
        battleViewportIdentity.current = identity;
        const points = battleState.units
          .filter((unit) => unit.troops > 0 && unit.side === battleState.playerSide)
          .map((unit) => gridToWorld(unit));
        setBattleViewport(
          focusBattlefieldPointsViewport(bounds, fitBattlefieldViewport(bounds, aspect), points),
        );
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
    showCampaignMenu,
    campaignSessionRevision,
    activeBattle?.id,
    battleState?.map.mapId,
    battleState?.map.width,
    battleState?.map.height,
  ]);
  useEffect(() => {
    setSelectedTactic(null);
    setInspectedCell(null);
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
    const selected = activeBattles.find((battle) => battle.id === selectedBattleId);
    if (
      selected &&
      !selected.battleData.units.some((unit) => unit.id === selectedUnitId && unit.troops > 0)
    ) {
      const first = selected.battleData.units.find(
        (unit) => unit.side === selected.battleData.playerSide && unit.troops > 0,
      );
      setSelectedUnitId(first?.id ?? null);
      setSelectedTactic(null);
    }
    if (!activeBattles.length && viewMode === 'battle') {
      setSelectedBattleId(null);
      setSelectedUnitId(null);
      setViewMode('campaign');
    }
  }, [state, activeBattles, selectedBattleId, selectedCityId, selectedUnitId, viewMode]);
  return {
    campaignWindowOpen,
    setCampaignWindowOpen,
    marchNotice,
    setMarchNotice,
    campaignTab,
    setCampaignTab,
    showReports,
    setShowReports,
    showMinimap,
    setShowMinimap,
    locale,
    setLocale,
    state,
    setState,
    showCampaignMenu,
    setShowCampaignMenu,
    confirmation,
    setConfirmation,
    campaignSessionRevision,
    setCampaignSessionRevision,
    scenarioId,
    setScenarioId,
    factionId,
    setFactionId,
    selectedCityId,
    setSelectedCityId,
    selectedBattleId,
    setSelectedBattleId,
    viewMode,
    setViewMode,
    selectedUnitId,
    setSelectedUnitId,
    selectedTactic,
    setSelectedTactic,
    inspectedCell,
    setInspectedCell,
    showWiki,
    setShowWiki,
    wikiTopic,
    setWikiTopic,
    wikiSearch,
    setWikiSearch,
    wikiModalRef,
    wikiReturnFocus,
    feedback,
    setFeedback,
    autosaveError,
    setAutosaveError,
    requestKind,
    setRequestKind,
    targetCityId,
    setTargetCityId,
    requestedTroops,
    setRequestedTroops,
    requestedResourceTroops,
    setRequestedResourceTroops,
    requestedByDay,
    setRequestedByDay,
    diplomacyTargetId,
    setDiplomacyTargetId,
    requestedGold,
    setRequestedGold,
    requestedFood,
    setRequestedFood,
    troopAssignments,
    setTroopAssignments,
    intent,
    setIntent,
    campaignViewport,
    setCampaignViewport,
    campaignFrameSize,
    setCampaignFrameSize,
    campaignMapFrame,
    campaignViewportInitialized,
    battleViewport,
    setBattleViewport,
    battleMapFrame,
    battleViewportIdentity,
    orderPreview,
    setOrderPreview,
    reducedCargoByOrder,
    setReducedCargoByOrder,
    reducedTroopsByOrder,
    setReducedTroopsByOrder,
    fileInput,
    t,
    orderServices,
    currentScenario,
    factions,
    selectedCity,
    directCityOfficers,
    directWorkQuota,
    directWorkRemaining,
    governorCandidates,
    governorDraft,
    setGovernorDraft,
    governorSelection,
    activeBattles,
    activeBattle,
    battleState,
    currentUnit,
    reachableCells,
    attackTargets,
    attackForecasts,
    availableTactics,
    selectedTacticAvailability,
    tacticTargets,
    tacticForecasts,
    battleBounds,
    battleViewportPolygon,
  };
}
