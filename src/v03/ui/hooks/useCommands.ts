import { message } from '../../i18n';
import { useEffect } from 'react';
import {
  eventTier,
  isCriticalReport,
  reportBlocksAdvance,
  stopsBattleDay,
} from '../../campaign/reports';
import { useMemo } from 'react';

import {
  CITY_GEOGRAPHY,
  ROUTE_DEFINITIONS,
  projectCampaignRoute,
  projectCityRoute,
  type CityId,
} from '../../geography';

import { executeV03Command } from '../../commands';

import {
  saveV03Autosave,
  encodeV03Save,
  decodeV03Save,
  V03_MAX_SAVE_BYTES,
  readV03AutosavePayload,
} from '../../platform/storage';

import { type CampaignCityVisual, type WorldPolyline } from '../../rendering';

import { createV03Game } from '../../initial-state';
import type { V03GameState, V03JourneyCargo } from '../../types';

import { localizeSaveError, CAMPAIGN_BOUNDS, cityScale } from '../shared/app-copy-2';
import { deadlineFromDaysInput, displayName, mapPosition } from '../shared/app-copy-3';
import { explainAdvance } from './advance-feedback';
import { standOnPendingMove } from './battle-controls';
import type { useGameSession } from './useGameSession';
export function useCommands(context: ReturnType<typeof useGameSession>) {
  const {
    state,
    setFeedback,
    setShowReports,
    locale,
    setState,
    setOrderPreview,
    setScenarioId,
    setFactionId,
    setSelectedCityId,
    setSelectedBattleId,
    setSelectedUnitId,
    setSelectedTactic,
    setInspectedCell,
    setViewMode,
    setShowCampaignMenu,
    setConfirmation,
    setShowWiki,
    setWikiTopic,
    setWikiSearch,
    setRequestKind,
    setTargetCityId,
    setRequestedTroops,
    setRequestedResourceTroops,
    setRequestedByDay,
    setDiplomacyTargetId,
    setRequestedGold,
    setRequestedFood,
    setTroopAssignments,
    setIntent,
    setReducedCargoByOrder,
    setReducedTroopsByOrder,
    setGovernorDraft,
    setCampaignViewport,
    campaignViewportInitialized,
    setBattleViewport,
    battleViewportIdentity,
    setCampaignSessionRevision,
    setAutosaveError,
    factionId,
    scenarioId,
    t,
    fileInput,
    selectedCityId,
    selectedCity,
    targetCityId,
    requestKind,
    requestedTroops,
    requestedResourceTroops,
    orderServices,
    requestedByDay,
    requestedGold,
    requestedFood,
    intent,
  } = context;
  const dispatch = (command: Parameters<typeof executeV03Command>[1]) => {
    if (!state) return;
    if (command.type === 'advance' || command.type === 'completeBattleDay') {
      const due = state.events.filter((event) => reportBlocksAdvance(state, event));
      if (due.length) {
        setShowReports(true);
        setFeedback({
          key: 'ui.acknowledge.due.reports.first.all.outstanding.re.6',
          params: { p0: due.length },
        });
        const reports = document.querySelector<HTMLElement>('.v03-events');
        reports?.scrollIntoView({ block: 'nearest' });
        reports?.focus();
        return;
      }
    }
    const { base, battleCommand } = standOnPendingMove(state, context.pendingMove, command);
    const result = executeV03Command(base, command);
    if (!result.ok) {
      setFeedback(
        result.error ? result.error : message(locale, 'ui.the.command.could.not.be.completed.7'),
      );
      return;
    }
    setFeedback('');
    setState(result.state);
    if (battleCommand) context.setPendingMove(null);
    if (command.type === 'advance' || command.type === 'completeBattleDay') {
      context.setBattleActionMenu(null);
      context.setAttackMode(false);
      setSelectedUnitId(null);
    }
    if (command.type === 'advance') context.setMarchNotice(null);
    if (command.type === 'battleAction') {
      const battle = result.state.battles.find((entry) => entry.id === command.battleId);
      const acted = battle?.battleData.units.find((unit) => unit.id === command.action.unitId);
      context.setAttackMode(false);
      context.setBattleActionMenu(
        command.action.type === 'move' &&
          battle?.active &&
          !battle.autoCommand &&
          !battle.playerDayComplete &&
          acted &&
          !acted.acted &&
          acted.side === battle.battleData.playerSide
          ? { battleId: battle.id, unitId: acted.id, day: battle.battleData.day }
          : null,
      );
      // After an order nothing is picked for the player; they choose who acts next.
      if (acted?.acted) setSelectedUnitId(null);
    }
    if (result.preview && result.orderId) {
      setOrderPreview({
        orderId: result.orderId,
        preview: result.preview as
          | import('../../governance/orders').RequisitionPreview
          | import('../../governance/orders').CampaignDirectivePreview,
      });
    }
    const advanceExplanation =
      command.type === 'advance' && result.advance
        ? explainAdvance(state, result.state, result.advance, locale)
        : null;
    if (advanceExplanation?.openReports) setShowReports(true);
    if (advanceExplanation) setFeedback(advanceExplanation.text);
    else if (
      command.type === 'completeBattleDay' &&
      result.message === 'All active battles completed their day; the campaign advanced one day.'
    ) {
      // The new battle day is visible on the field; a toast every day only adds noise.
      // Reports that need no battle orders wait in the inbox; say so without opening it.
      const waiting = result.state.events.filter(
        (event) =>
          isCriticalReport(result.state, event) &&
          !stopsBattleDay(result.state, event) &&
          !state.events.some((old) => old.id === event.id),
      ).length;
      setFeedback(waiting ? { key: 'feedback.battleDay.reports', params: { p0: waiting } } : '');
    } else if (result.message) setFeedback(result.message);
    else if (command.type === 'marchArmy') setFeedback({ key: 'feedback.marchArmy' });
    if (command.type === 'marchArmy') {
      const journey = result.state.journeys.find(
        (entry) =>
          entry.kind === 'campaign' &&
          entry.status === 'outbound' &&
          !state.journeys.some((old) => old.id === entry.id),
      );
      if (journey) {
        context.setMarchNotice({
          source: journey.sourceCityId,
          target: journey.destinationCityId,
          troops: journey.manifest.troopCount,
          arrivalDay: journey.expectedArrivalDay,
        });
        context.setCampaignWindowOpen(false);
        setViewMode('campaign');
        setFeedback('');
      } else {
        context.setCampaignTab('orders');
      }
    }
    return result;
  };
  const replaceCampaign = (fresh: V03GameState) => {
    context.setBattleActionMenu(null);
    context.setPendingMove(null);
    context.setAttackMode(false);
    context.setCityGovernanceEventId(null);
    context.setDeferredGovernanceIds([]);
    context.setCampaignWindowOpen(false);
    context.setMarchNotice(null);
    setShowReports(false);
    setState(fresh);
    setScenarioId(fresh.scenarioId);
    setFactionId(fresh.playerFactionId);
    setSelectedCityId(fresh.playerCapitalCityId);
    setSelectedBattleId(null);
    setSelectedUnitId(null);
    setSelectedTactic(null);
    setInspectedCell(null);
    setViewMode('campaign');
    setShowCampaignMenu(false);
    setConfirmation(null);
    setShowWiki(false);
    setWikiTopic('overview');
    setWikiSearch('');
    setRequestKind('resource');
    setTargetCityId('');
    setRequestedTroops(2000);
    setRequestedResourceTroops(0);
    setRequestedByDay('');
    setDiplomacyTargetId('');
    setRequestedGold(300);
    setRequestedFood(1000);
    setTroopAssignments({});
    setIntent('conquer');
    setOrderPreview(null);
    setReducedCargoByOrder({});
    setReducedTroopsByOrder({});
    setGovernorDraft(null);
    setCampaignViewport(CAMPAIGN_BOUNDS);
    campaignViewportInitialized.current = false;
    setBattleViewport(null);
    battleViewportIdentity.current = null;
    setCampaignSessionRevision((value) => value + 1);
    setAutosaveError(false);
  };
  const startCampaign = () => {
    try {
      const fresh = createV03Game(factionId, Date.now(), scenarioId);
      replaceCampaign(fresh);
      setFeedback('');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : message(locale, 'ui.could.not.create.campaign.8'),
      );
    }
  };
  const saveGame = () => {
    if (!state) return;
    try {
      saveV03Autosave(state);
      setAutosaveError(false);
      setFeedback({ key: 'saved' });
    } catch {
      setAutosaveError(true);
      setFeedback({ key: 'saveFailed' });
    }
  };
  const exportSave = () => {
    let url: string | null = null;
    try {
      const payload = state ? encodeV03Save(state) : readV03AutosavePayload();
      if (payload === null) return;
      const blob = new Blob([payload], { type: 'application/json' });
      url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = state
        ? `hegemony-v0.3-${state.scenarioId}-${state.absoluteDay}.save`
        : 'hegemony-v0.3-original.save';
      document.body.append(link);
      link.click();
      link.remove();
      setFeedback({ key: 'ui.save.file.exported.9' });
    } catch {
      setFeedback({ key: 'exportFailed' });
    } finally {
      if (url) {
        const completedUrl = url;
        window.setTimeout(() => URL.revokeObjectURL(completedUrl), 1000);
      }
    }
  };
  const importSave = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > V03_MAX_SAVE_BYTES) {
        setFeedback({ key: 'fileTooLarge' });
        return;
      }
      const imported = decodeV03Save(await file.text());
      replaceCampaign(imported);
      setFeedback({ key: 'imported' });
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
    // Hostile campaigns aimed at the player's cities are reported when they depart.
    const threatDays = new Map<string, number>();
    for (const journey of state.journeys) {
      if (
        journey.kind !== 'campaign' ||
        journey.ownerFactionId === state.playerFactionId ||
        (journey.status !== 'outbound' && journey.status !== 'waiting')
      )
        continue;
      const target = state.cities.find((city) => city.id === journey.destinationCityId);
      if (target?.factionId !== state.playerFactionId) continue;
      const days = Math.max(0, journey.expectedArrivalDay - state.absoluteDay);
      threatDays.set(target.id, Math.min(days, threatDays.get(target.id) ?? days));
    }
    const battleCityIds = new Set(
      state.battles
        .filter((battle) => battle.active)
        .map(
          (battle) =>
            state.journeys.find((journey) => journey.id === battle.attackerJourneyId)
              ?.destinationCityId,
        )
        .filter((id): id is string => Boolean(id)),
    );
    return state.cities.map((city) => {
      const geo = CITY_GEOGRAPHY.find((entry) => entry.id === city.id)!;
      const faction = state.factions.find((entry) => entry.id === city.factionId);
      return {
        id: city.id,
        name: displayName(city, locale),
        position: mapPosition(geo.latitude, geo.longitude),
        scale: cityScale(city.id),
        controllerColor: faction?.color ?? '#746c5d',
        // Governance marks only the player's own cities; rival administration is noise here.
        governance:
          city.factionId !== state.playerFactionId
            ? undefined
            : city.governanceMode === 'ruler'
              ? 'direct'
              : city.governanceMode === 'governor'
                ? 'governed'
                : 'local',
        selected: city.id === selectedCityId,
        threatDays: threatDays.get(city.id),
        battle: battleCityIds.has(city.id),
        captured: Boolean(city.lostBy && state.absoluteDay - city.lostBy.absoluteDay <= 5),
        info: `${displayName(city, locale)} · ${faction ? displayName(faction, locale) : message(locale, 'ui.independent.10')} · ${message(locale, 'ui.governor.11')}: ${state.officers.find((officer) => officer.id === city.governorId)?.[locale === 'zh' ? 'chinese' : 'name'] ?? message(locale, 'ui.local.stewardship.13')} · ${message(locale, 'ui.garrison.14')}: ${city.garrisonTroops.toLocaleString()}${(() => {
          if (!selectedCityId || selectedCityId === city.id) return '';
          const route = orderServices.planRoute({
            state,
            sourceCityId: selectedCityId,
            targetCityId: city.id,
            departureDay: state.absoluteDay,
            troopCount: 1,
            kind: 'campaign',
            composition: { troopTypes: [] },
          });
          return route
            ? ` · ${route.roadKmNominal} km · ${route.estimatedDays} ${message(locale, 'ui.days.15')}`
            : '';
        })()}`,
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
        label: message(locale, 'ui.est.km.baseline.days.schematic.city.link.16', {
          p0: geometry.nominalRoadKm,
          p1: geometry.baselineDaysNominal,
        }),
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
              label: message(locale, 'ui.est.km.this.party.eta.days.schematic.city.link.17', {
                p0: requestedRoutePath.roadKmNominal,
                p1: requestedRoutePath.estimatedDays,
              }),
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
                transfer: '武将调动',
                return: '返程队伍',
              }[journey.kind]
            : {
                campaign: 'Campaign',
                requisition: 'Supply transport',
                appointment: 'Governor transfer',
                transfer: 'Officer transfer',
                return: 'Returning party',
              }[journey.kind];
        const status =
          journey.status === 'waiting'
            ? message(locale, 'ui.waiting.0')
            : journey.status === 'returning'
              ? message(locale, 'ui.returning.1')
              : message(locale, 'ui.moving.2');
        return [
          {
            id: `journey-${journey.id}`,
            points: geometry.points,
            label: message(locale, 'ui.party.eta.remaining.days.schematic.city.link.18', {
              p0: kind,
              p1: status,
              p2: eta,
            }),
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
    const deadline = deadlineFromDaysInput(state.absoluteDay, requestedByDay);
    return dispatch({
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
    const deadline = deadlineFromDaysInput(state.absoluteDay, requestedByDay);
    return dispatch({
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
      return dispatch({
        type: 'answerRequisition',
        requisitionId: orderId,
        answer,
        reduced: reduced as V03JourneyCargo | undefined,
      });
    else
      return dispatch({
        type: 'answerCampaignDirective',
        directiveId: orderId,
        answer,
        reducedTroops: typeof reduced === 'number' ? reduced : undefined,
      });
  };
  const worldEvents =
    state?.events
      .filter((event) => !event.acknowledged && eventTier(state!, event) !== 'chronicle')
      .sort((a, b) => a.absoluteDay - b.absoluteDay || a.id.localeCompare(b.id)) ?? [];
  const dueReports = worldEvents.filter((event) => state && isCriticalReport(state, event));
  useEffect(() => {
    if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') !== '1')
      return;
    let dispose: (() => void) | undefined;
    let active = true;
    void import('../../dev/fixtures').then(({ installPlaytestHarness }) => {
      if (active) dispose = installPlaytestHarness(() => state, dispatch);
    });
    return () => {
      active = false;
      dispose?.();
    };
  }, [state]);
  return {
    ...context,
    dispatch,
    replaceCampaign,
    startCampaign,
    saveGame,
    exportSave,
    importSave,
    campaignCities,
    requestedRoutePath,
    campaignRoutes,
    submitResourceOrder,
    submitCampaignOrder,
    answerOrder,
    worldEvents,
    dueReports,
  };
}
