import { troopDisplayType, troopName } from '../../rendering/presentation';
import { terrainLabel, weatherLabel } from '../../i18n/formatters';
import { message } from '../../i18n';

import {
  battleTerrainAt,
  getAvailableBattleTactics,
  getBattleTacticTargets,
  getUnitAttackTargets,
  isBattleUnitRouted,
  isBattleUnitWavering,
  terrainMovementCost,
  waterCombatModifiers,
  type BattleAttackForecast,
} from '../../battle';
import type { BattleTargetForecastVisual } from '../../rendering/presentation';
import { CITY_GEOGRAPHY } from '../../geography';
import { formationLeaderVisual } from '../../rendering/unit-leader';

import { getV03CityActionAvailability } from '../../governance/city-actions';

import { localizeV03PersonOrFormationName } from '../../ui/feedback';

import {
  clusterVisibleCampaignParties,
  fitBattlefieldViewport,
  fitCampaignViewport,
  focusBattlefieldViewport,
  gridToWorld,
  recenterBattlefieldViewport,
  recenterCampaignViewport,
  V03_BATTLE_CELL,
  V03_BATTLE_READABLE_CELL_PIXELS,
  zoomBattlefieldViewport,
  zoomCampaignViewport,
} from '../../rendering';

import type { V03CityAction, V03GameState, TroopType } from '../../types';

import { localizeAppMessage, CAMPAIGN_BOUNDS, dateLabel } from '../shared/app-copy-2';
import { displayName, journeyPosition, mapPosition } from '../shared/app-copy-3';
import type { useCampaignOrders } from './useCampaignOrders';
import { battleControls } from './battle-controls';
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
    attackMode,
    selectedTactic,
    dispatch,
    campaignMapFrame,
    setCampaignViewport,
    setSelectedCityId,
    battleMapFrame,
    battleBounds,
    setBattleViewport,
    battleViewport,
  } = context;
  const capitalAvailability = (
    action: V03CityAction,
    officerId?: string,
    amount?: number,
    troopType?: TroopType,
  ) =>
    getV03CityActionAvailability(state, {
      cityId: selectedCity?.id ?? '',
      action,
      officerId,
      amount,
      troopType,
    });
  const capitalReason = (
    action: V03CityAction,
    officerId?: string,
    amount?: number,
    troopType?: TroopType,
  ) => {
    const result = capitalAvailability(action, officerId, amount, troopType);
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
        ? `${troopName(troopDisplayType(unit.troopType, unit.troopExperience), locale)} · ${leaders.join(', ')}`
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
    const hostile =
      journey.ownerFactionId !== state.playerFactionId &&
      journey.kind === 'campaign' &&
      journey.status !== 'returning' &&
      state.cities.find((city) => city.id === journey.destinationCityId)?.factionId ===
        state.playerFactionId;
    return position
      ? [
          {
            id: journey.id,
            ownerFactionId: journey.ownerFactionId,
            position,
            value: journey,
            hostile,
          },
        ]
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
  const unitMoraleState = (
    unit: NonNullable<typeof battleState>['units'][number],
  ): 'wavering' | 'routed' | undefined =>
    isBattleUnitRouted(unit) ? 'routed' : isBattleUnitWavering(unit) ? 'wavering' : undefined;
  const unitBattleStatus = (unit: NonNullable<typeof battleState>['units'][number]) => {
    const morale = unitMoraleState(unit);
    const condition =
      unit.status === 'confused'
        ? t.unitConfused
        : unit.status === 'inspired'
          ? t.unitInspired
          : null;
    // Enemy formations reset each day; "Ready to act" would read as if they were yours.
    return [
      morale === 'routed' ? t.unitRouted : morale === 'wavering' ? t.unitWavering : null,
      condition,
      unit.side === battleState?.playerSide ? unitActionStatus(unit) : null,
    ]
      .filter(Boolean)
      .join(' · ');
  };
  const formationOfficerIds = (unit: NonNullable<typeof battleState>['units'][number]) =>
    activeBattle
      ? ((unit.side === 'attacker'
          ? activeBattle.attackerFormationOfficerIds
          : activeBattle.defenderFormationOfficerIds)[unit.id] ?? [])
      : [];
  const troopVisuals =
    battleState?.units
      .filter((unit) => unit.troops > 0)
      .map((unit) => ({
        ...formationLeaderVisual(state.officers, formationOfficerIds(unit)),
        maxStrength: unit.initialTroops,
        formationSize: formationOfficerIds(unit).length,
        acted: unit.acted,
        condition: unit.status === 'normal' ? undefined : unit.status,
        routed: isBattleUnitRouted(unit),
        moraleState: unitMoraleState(unit),
        id: unit.id,
        troopType: unit.troopType,
        troopExperience: unit.troopExperience,
        position: { x: unit.x, y: unit.y },
        faction: unit.side === battleState.playerSide ? 'player' : 'opponent',
        strength: unit.troops,
        label: localizedOfficerName(unit.name),
        selected: unit.id === selectedUnitId,
        status: [
          `${unit.morale}% ${message(locale, 'ui.morale.4')}`,
          unitBattleStatus(unit),
          // Enemy force and intellect on hover (PF-UI-07).
          unit.side !== battleState.playerSide
            ? message(locale, 'battleForceIntellect', {
                force: unit.force,
                intellect: unit.intellect,
              })
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
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
  // Targets, their forecasts and the red range show only once Attack is chosen.
  const attackableCells = attackMode ? attackTargets.map((unit) => ({ x: unit.x, y: unit.y })) : [];
  const attackRangeCells =
    attackMode && battleState && currentUnit
      ? Array.from({ length: battleState.map.width * battleState.map.height }, (_, index) => ({
          x: index % battleState.map.width,
          y: Math.floor(index / battleState.map.width),
        })).filter((cell) => {
          const distance = Math.abs(cell.x - currentUnit.x) + Math.abs(cell.y - currentUnit.y);
          return (
            distance > 0 &&
            distance <= currentUnit.attackRange &&
            battleTerrainAt(battleState.map, cell) !== null
          );
        })
      : [];
  // On-map forecast beside each target in range while choosing an attack (PF-UI-07).
  const targetForecasts: BattleTargetForecastVisual[] =
    battleState && currentUnit && attackMode && !selectedTactic
      ? attackTargets.flatMap((target) => {
          const forecast = context.attackForecasts.get(target.id) as
            BattleAttackForecast | undefined;
          if (!forecast || forecast.estimatedCasualties === null) return [];
          const deal = forecast.estimatedCasualties;
          const take = forecast.counterattack.estimatedCasualties ?? 0;
          const result =
            forecast.targetResult === 'destroyed'
              ? message(locale, 'forecastDestroyed')
              : forecast.targetResult === 'routs'
                ? message(locale, 'forecastRouts')
                : null;
          return [
            {
              id: target.id,
              position: { x: target.x, y: target.y },
              lines: [
                `${message(locale, 'forecastDeal', { damage: deal.toLocaleString() })} · ${message(locale, 'forecastTake', { damage: take.toLocaleString() })}`,
                [
                  message(locale, 'forecastMorale', {
                    before: target.morale,
                    after: forecast.targetMoraleAfter,
                  }),
                  result,
                ]
                  .filter(Boolean)
                  .join(' · '),
              ],
              tone: result || deal > take ? 'good' : deal < take ? 'bad' : 'even',
            },
          ];
        })
      : [];
  // Hovering a green cell rings the enemies the selected unit could strike from there.
  const attackPreview = (cell: { x: number; y: number }) => {
    if (
      !battleState ||
      !currentUnit ||
      selectedTactic ||
      attackMode ||
      !context.reachableCells.some((entry) => entry.x === cell.x && entry.y === cell.y)
    )
      return [];
    const view = {
      ...battleState,
      units: battleState.units.map((unit) =>
        unit.id === currentUnit.id ? { ...unit, x: cell.x, y: cell.y } : unit,
      ),
    };
    return getUnitAttackTargets(view, currentUnit.id).map((unit) => ({ x: unit.x, y: unit.y }));
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
  const focusCampaignCity = (cityId: string, options: { pan?: boolean } = {}) => {
    // Jumps from reports, the status strip or the directory also bring the city into view;
    // clicking a city on the map leaves the camera where the player put it.
    const geo = options.pan ? CITY_GEOGRAPHY.find((entry) => entry.id === cityId) : undefined;
    if (geo)
      setCampaignViewport((viewport) =>
        recenterCampaignViewport(
          viewport,
          CAMPAIGN_BOUNDS,
          mapPosition(geo.latitude, geo.longitude),
        ),
      );
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
    // Zoom in at least far enough for portraits (V03_BATTLE_READABLE_CELL_PIXELS per cell).
    const rect = battleMapFrame.current?.querySelector('svg')?.getBoundingClientRect();
    const fit = fitBattlefieldViewport(battleBounds, battleViewport.width / battleViewport.height);
    const readable =
      rect && rect.width > 0
        ? fit.width / ((rect.width / V03_BATTLE_READABLE_CELL_PIXELS) * V03_BATTLE_CELL)
        : 2.5;
    setBattleViewport(
      focusBattlefieldViewport(
        battleBounds,
        battleViewport,
        gridToWorld({ x: currentUnit.x, y: currentUnit.y }),
        Math.max(2.5, readable),
      ),
    );
  };
  const navigateBattleMinimap = (cell: { x: number; y: number }) => {
    if (!battleBounds || !battleViewport) return;
    setBattleViewport(recenterBattlefieldViewport(battleViewport, battleBounds, gridToWorld(cell)));
  };
  const requestEndBattleDay = () => {
    if (!activeBattle || !battleState) return;
    if (activeBattle.playerDayComplete) {
      if (context.canResumeBattleDay) dispatch({ type: 'advance', days: 1 });
      return;
    }
    // Ask only when a ready unit could still strike: an attack in range or an offensive
    // tactic with a legal target. Walking days end without a prompt.
    const canStillStrike = battleState.units.some(
      (unit) =>
        unit.side === battleState.playerSide &&
        unit.troops > 0 &&
        !unit.acted &&
        (getUnitAttackTargets(battleState, unit.id).length > 0 ||
          getAvailableBattleTactics(battleState, unit.id).some(
            (entry) =>
              entry.allowed &&
              entry.tactic !== 'rally' &&
              getBattleTacticTargets(battleState, unit.id, entry.tactic).length > 0,
          )),
    );
    if (canStillStrike) context.setConfirmation('end-day');
    else dispatch({ type: 'completeBattleDay', battleId: activeBattle.id });
  };
  return {
    ...context,
    ...battleControls(context),
    requestEndBattleDay,
    attackRangeCells,
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
    unitMoraleState,
    unitBattleStatus,
    troopVisuals,
    targetForecasts,
    attackPreview,
    inspectionPosition,
    inspectionTerrain,
    inspectionModifiers,
    inspectionMovementCost,
    terrainName,
    weatherName,
    attackableCells,
    fitCampaignMap,
    zoomCampaignMap,
    focusCampaignCity,
    fitBattleMap,
    zoomBattleMap,
    focusBattleMapUnit,
    navigateBattleMinimap,
  };
}
export type GameplayContext = ReturnType<typeof gameplayView>;
