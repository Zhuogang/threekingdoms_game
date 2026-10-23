import { troopName } from '../../rendering/presentation';
import { terrainLabel, weatherLabel } from '../../i18n/formatters';
import { message } from '../../i18n';

import { battleTerrainAt, terrainMovementCost, waterCombatModifiers } from '../../battle';
import { CITY_GEOGRAPHY } from '../../geography';

import { getV03CityActionAvailability } from '../../governance/city-actions';

import { localizeV03PersonOrFormationName } from '../../ui/feedback';

import {
  clusterVisibleCampaignParties,
  fitBattlefieldViewport,
  fitCampaignViewport,
  focusBattlefieldViewport,
  focusBattlefieldPointsViewport,
  gridToWorld,
  recenterBattlefieldViewport,
  zoomBattlefieldViewport,
  zoomCampaignViewport,
} from '../../rendering';

import type { V03CityAction, V03GameState } from '../../types';

import { localizeAppMessage, CAMPAIGN_BOUNDS, dateLabel } from '../shared/app-copy-2';
import { displayName, journeyPosition } from '../shared/app-copy-3';
import type { useCampaignOrders } from './useCampaignOrders';
export type ApplicationBase = ReturnType<typeof useCampaignOrders>;
export function gameplayView(context: ApplicationBase & { state: V03GameState }) {
  const {
    state,
    selectedCity,
    locale,
    viewMode,
    activeBattle,
    battleState,
    requestKind,
    friendlyCities,
    hostileCities,
    requestedRoutePath,
    campaignViewport,
    campaignFrameSize,
    t,
    selectedUnitId,
    inspectedCell,
    currentUnit,
    attackTargets,
    setInspectedCell,
    selectedTactic,
    tacticTargets,
    dispatch,
    setSelectedTactic,
    setFeedback,
    setSelectedUnitId,
    campaignMapFrame,
    setCampaignViewport,
    setSelectedCityId,
    battleMapFrame,
    battleBounds,
    setBattleViewport,
    battleViewport,
  } = context;
  const capitalAvailability = (action: V03CityAction, officerId?: string, amount?: number) =>
    getV03CityActionAvailability(state, {
      cityId: selectedCity?.id ?? '',
      action,
      officerId,
      amount,
    });
  const capitalReason = (action: V03CityAction, officerId?: string, amount?: number) => {
    const result = capitalAvailability(action, officerId, amount);
    return result.reason ? localizeAppMessage(result.reason, locale, state) : undefined;
  };
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
    const officer = state.officers.find((entry) => entry.name === name);
    if (officer) return displayName(officer, locale);
    const unit = battleState?.units.find((unit) => unit.name === name);
    if (unit && activeBattle) {
      const ids =
        (unit.side === 'attacker'
          ? activeBattle.attackerFormationOfficerIds
          : activeBattle.defenderFormationOfficerIds)[unit.id] ?? [];
      const leaders = ids
        .map((id) => state.officers.find((officer) => officer.id === id))
        .filter((officer) => Boolean(officer))
        .map((officer) => displayName(officer!, locale));
      return leaders.length
        ? `${troopName(unit.troopType, locale)} · ${leaders.join(', ')}`
        : message(locale, 'ui.militia.393');
    }
    return localizeV03PersonOrFormationName(name, locale, state);
  };
  const journeyDescription = (journey: V03GameState['journeys'][number]) => {
    const source = locationName(journey.sourceCityId);
    const target = locationName(journey.destinationCityId);
    const eta = Math.max(0, journey.expectedArrivalDay - state.absoluteDay);
    const troops = journey.manifest.troopCount;
    const cargo = journey.manifest.cargo;
    const status =
      journey.status === 'waiting'
        ? message(locale, 'ui.waiting.0')
        : journey.status === 'returning'
          ? message(locale, 'ui.returning.1')
          : message(locale, 'ui.moving.2');
    return message(locale, 'ui.eta.days.troops.gold.food.3', {
      p0: source,
      p1: target,
      p2: status,
      p3: eta,
      p4: troops.toLocaleString(),
      p5: (cargo.gold ?? 0).toLocaleString(),
      p6: (cargo.food ?? 0).toLocaleString(),
    });
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
    battleState?.units
      .filter((unit) => unit.troops > 0)
      .map((unit) => ({
        id: unit.id,
        troopType: unit.troopType,
        position: { x: unit.x, y: unit.y },
        faction: unit.side === battleState.playerSide ? 'player' : 'opponent',
        strength: unit.troops,
        label: localizedOfficerName(unit.name),
        selected: unit.id === selectedUnitId,
        status: `${unit.morale}% ${message(locale, 'ui.morale.4')} · ${unitBattleStatus(unit)}`,
      })) ?? [];
  const camps =
    battleState?.map.objectives.map((objective) => ({
      id: objective.id,
      position: objective.position,
      label: message(locale, 'ui.field.camp.5', {
        p0: objective.owner === battleState.playerSide ? '己方' : '敌方',
        p1: objective.owner,
      }),
    })) ?? [];
  const inspectionPosition =
    inspectedCell ?? (currentUnit ? { x: currentUnit.x, y: currentUnit.y } : null);
  const inspectionTerrain =
    battleState && inspectionPosition ? battleTerrainAt(battleState.map, inspectionPosition) : null;
  const inspectionModifiers =
    battleState && inspectionPosition
      ? waterCombatModifiers(battleState.map, inspectionPosition, inspectionPosition)
      : null;
  const inspectionMovementCost =
    currentUnit && inspectionTerrain
      ? terrainMovementCost(currentUnit.troopType, inspectionTerrain)
      : null;
  const terrainName = (value: string) => terrainLabel(value, locale);
  const weatherName = (value: string) => weatherLabel(value, locale);
  const attackableCells = attackTargets.map((unit) => ({ x: unit.x, y: unit.y }));
  const playerUnit = (unitId: string) =>
    !activeBattle?.playerDayComplete &&
    battleState?.units.some(
      (unit) => unit.id === unitId && unit.troops > 0 && unit.side === battleState.playerSide,
    );
  const handleBattleUnitClick = (unitId: string) => {
    if (!battleState || !activeBattle) return;
    const inspected = battleState.units.find((unit) => unit.id === unitId && unit.troops > 0);
    if (!inspected) return;
    setInspectedCell({ x: inspected.x, y: inspected.y });
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
      } else setFeedback({ key: 'tacticNoTargets' });
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
    context.setCampaignTab('city');
    context.setCampaignWindowOpen(true);
    context.setFeedback('');
  };
  const fitBattleMap = () => {
    const rect = battleMapFrame.current?.querySelector('svg')?.getBoundingClientRect();
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
      setFeedback({ key: 'battleMapNoCamps' });
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
  const requestEndBattleDay = () => {
    if (!activeBattle || !battleState) return;
    if (
      battleState.units.some(
        (unit) => unit.side === battleState.playerSide && unit.troops > 0 && !unit.acted,
      )
    )
      context.setConfirmation('end-day');
    else dispatch({ type: 'completeBattleDay', battleId: activeBattle.id });
  };
  const nextReadyUnit = () => {
    const units =
      battleState?.units.filter(
        (unit) => unit.side === battleState.playerSide && unit.troops > 0 && !unit.acted,
      ) ?? [];
    const index = units.findIndex((unit) => unit.id === context.selectedUnitId);
    if (units.length) context.setSelectedUnitId(units[(index + 1) % units.length]!.id);
  };
  return {
    ...context,
    requestEndBattleDay,
    nextReadyUnit,
    capitalAvailability,
    capitalReason,
    selectedFaction,
    date,
    isBattleView,
    selectedGeo,
    availableTargets,
    selectedRoute,
    locationName,
    localizedOfficerName,
    journeyDescription,
    journeyCandidates,
    journeyClusters,
    unitActionStatus,
    unitBattleStatus,
    troopVisuals,
    camps,
    inspectionPosition,
    inspectionTerrain,
    inspectionModifiers,
    inspectionMovementCost,
    terrainName,
    weatherName,
    attackableCells,
    playerUnit,
    handleBattleUnitClick,
    fitCampaignMap,
    zoomCampaignMap,
    focusCampaignCity,
    fitBattleMap,
    zoomBattleMap,
    focusBattleMapUnit,
    focusBattleMapCamps,
    navigateBattleMinimap,
  };
}
export type GameplayContext = ReturnType<typeof gameplayView>;
