function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function playerBattleMetrics(state, factionId) {
  const battles = (state.battles ?? []).filter(
    (battle) => battle.attackerFactionId === factionId || battle.defenderFactionId === factionId,
  );
  const durationDays = battles
    .filter((battle) => battle.resolved)
    .map((battle) => battle.battleData.day)
    .filter(Number.isFinite);
  const activeAges = battles
    .filter((battle) => battle.active)
    .map((battle) => battle.battleData.day)
    .filter(Number.isFinite);
  const records = battles.map((battle) => {
    const data = battle.battleData;
    const attacker = data.units.filter((unit) => unit.side === 'attacker');
    const defender = data.units.filter((unit) => unit.side === 'defender');
    const initial = {
      attacker: attacker.reduce((sum, unit) => sum + unit.initialTroops, 0),
      defender: defender.reduce((sum, unit) => sum + unit.initialTroops, 0),
    };
    const surviving = {
      attacker: attacker.reduce((sum, unit) => sum + unit.troops, 0),
      defender: defender.reduce((sum, unit) => sum + unit.troops, 0),
    };
    const outcome = data.outcome?.winner ?? battle.outcome ?? null;
    const initialTotal = initial.attacker + initial.defender;
    const close = Boolean(
      battle.resolved &&
      initialTotal > 0 &&
      Math.abs(surviving.attacker - surviving.defender) <= initialTotal * 0.1,
    );
    const weakerSide =
      initial.attacker === initial.defender
        ? null
        : initial.attacker < initial.defender
          ? 'attacker'
          : 'defender';
    return {
      battleId: battle.id,
      resolved: battle.resolved,
      durationDays: battle.resolved ? data.day : null,
      activeAgeDays: battle.active ? data.day : null,
      initialTroops: initial,
      survivingTroops: surviving,
      initialAttackerToDefenderRatio:
        initial.defender > 0 ? Number((initial.attacker / initial.defender).toFixed(4)) : null,
      outcome,
      outcomeReason: data.outcome?.reason ?? null,
      closeOutcome: close,
      weakerSideWon: Boolean(outcome && weakerSide && outcome === weakerSide),
      foodShortfallDays: battle.foodShortfallDays,
    };
  });
  const decided = records.filter((record) => record.resolved && record.outcome !== null);
  return {
    started: battles.length,
    active: battles.filter((battle) => battle.active).length,
    resolved: battles.filter((battle) => battle.resolved).length,
    durationDays: {
      unit: 'tactical days',
      median: median(durationDays),
      maximum: durationDays.length ? Math.max(...durationDays) : null,
      raw: records.filter((record) => record.resolved),
    },
    activeAgeDays: {
      unit: 'tactical days',
      median: median(activeAges),
      maximum: activeAges.length ? Math.max(...activeAges) : null,
      raw: records.filter((record) => !record.resolved),
    },
    closeOutcomes: {
      definition:
        'Resolved battles where the absolute surviving troop difference is <= 10% of combined initial troops.',
      decidedBattles: decided.length,
      closeBattles: decided.filter((record) => record.closeOutcome).length,
      weakerSideWins: decided.filter((record) => record.weakerSideWon).length,
    },
    waterCasualties: {
      status: 'not-attributable',
      reason:
        'The battle state records surviving troops and water modifiers in action log text, but does not retain structured per-action casualties linked to unit water positions.',
    },
    foodShortfallDays: records.reduce((sum, record) => sum + record.foodShortfallDays, 0),
  };
}

function playerCampaignAndSupplyMetrics(state, factionId) {
  const playerJourneys = (state.journeys ?? []).filter(
    (journey) => journey.ownerFactionId === factionId,
  );
  const campaigns = playerJourneys.filter((journey) => journey.kind === 'campaign');
  const requisitions = (state.requisitions ?? []).filter((order) => order.factionId === factionId);
  const delivered = requisitions.filter((order) => order.status === 'delivered').length;
  const closed = requisitions.filter((order) =>
    ['delivered', 'failed', 'cancelled', 'rejected'].includes(order.status),
  ).length;
  return {
    requisitions: {
      requested: requisitions.length,
      delivered,
      failed: requisitions.filter((order) => order.status === 'failed').length,
      cancelledOrRejected: requisitions.filter((order) =>
        ['cancelled', 'rejected'].includes(order.status),
      ).length,
      closedDeliveryRate: closed ? Number((delivered / closed).toFixed(4)) : null,
    },
    travelFoodShortfall: playerJourneys.reduce(
      (sum, journey) => sum + journey.accumulatedFoodShortfall,
      0,
    ),
    campaignParticipation: {
      started: campaigns.length,
      multiLegJourneys: campaigns.filter((journey) => (journey.routeCityIds?.length ?? 0) > 2)
        .length,
      nominalRoadKm: campaigns.reduce((sum, journey) => sum + journey.roadKmNominal, 0),
      distanceDefinition:
        'Multi-leg means the route snapshot contains at least one intermediate city.',
    },
    cityFoodShortageDays: {
      status: 'not-attributable',
      reason:
        'Monthly settlement records current city stock and applies desertion effects but does not persist a structured city-level shortage-day counter.',
    },
  };
}

function playerAutonomyMetrics(state, factionId, trace) {
  const cities = state.cities.filter(
    (city) => city.factionId === factionId && city.governanceMode !== 'ruler',
  );
  const expectedPeriod = Math.floor(state.absoluteDay / 10);
  const observed = cities.filter(
    (city) => city.workMonthIndex === state.monthIndex && city.workPeriodIndex === expectedPeriod,
  );
  const worked = observed.filter((city) => (city.workPointsUsed ?? 0) > 0);
  return {
    autonomousCities: cities.length,
    workPeriodIndexExpected: expectedPeriod,
    observedForCurrentPeriod: observed.length,
    workedCities: worked.length,
    idleCities: observed.length - worked.length,
    unobservedCities: cities.length - observed.length,
    currentPeriodWorkPoints: observed.reduce((sum, city) => sum + (city.workPointsUsed ?? 0), 0),
    cumulativeWork: trace
      ? { status: 'observed', ...(trace.workByFaction[factionId] ?? { actions: 0, workPoints: 0 }) }
      : {
          status: 'not-observed',
          reason:
            'Use committed governor decision events; an endpoint work budget is not a cumulative counter.',
        },
    coverageNote:
      'Only explicit workMonthIndex/workPeriodIndex matching the current ten-day period is observed. Older or missing periods are unobserved, not idle. Cumulative work comes from actual committed-action traces.',
  };
}

function factionOwnershipMetrics(state) {
  return {
    totalCities: state.cities.length,
    factions: state.factions.map((faction) => ({
      factionId: faction.id,
      ownedCities: state.cities.filter((city) => city.factionId === faction.id).length,
      eliminated: Boolean(faction.eliminated),
      capitalCityId: faction.capitalCityId,
    })),
    independentCities: state.cities.filter((city) => city.factionId === null).length,
  };
}

function rivalCampaignOutcome(state, directive) {
  const journey = state.journeys.find((entry) => entry.id === directive.journeyId);
  const battle = state.battles.find((entry) => entry.attackerJourneyId === directive.journeyId);
  if (battle?.resolved) {
    return {
      outcome:
        battle.outcome === 'attacker'
          ? 'capture'
          : battle.outcome === 'defender'
            ? 'repulse'
            : 'draw',
      outcomeReason: battle.battleData?.outcome?.reason ?? 'resolved-battle',
      battleId: battle.id,
      journeyStatus: journey?.status ?? null,
    };
  }
  if (battle) {
    return {
      outcome: 'unknown',
      outcomeReason: 'battle-unresolved-at-checkpoint',
      battleId: battle.id,
      journeyStatus: journey?.status ?? null,
    };
  }
  const target = state.cities.find((city) => city.id === directive.targetCityId);
  if (journey?.status === 'delivered' && target?.factionId === directive.factionId) {
    return {
      outcome: 'capture',
      outcomeReason: 'destination-was-already-friendly-on-arrival',
      battleId: null,
      journeyStatus: journey.status,
    };
  }
  return {
    outcome: 'unknown',
    outcomeReason: journey ? `no-resolved-battle-${journey.status}` : 'journey-record-missing',
    battleId: null,
    journeyStatus: journey?.status ?? null,
  };
}

function rivalCampaignMetrics(state, selectedFactionId) {
  const dispatched = state.directives
    .filter((directive) => directive.factionId !== selectedFactionId && directive.journeyId)
    .filter((directive) => {
      const journey = state.journeys.find((entry) => entry.id === directive.journeyId);
      return (
        journey?.kind === 'campaign' &&
        journey.executionId === directive.id &&
        journey.ownerFactionId === directive.factionId
      );
    })
    .map((directive) => {
      const result = rivalCampaignOutcome(state, directive);
      return {
        directiveId: directive.id,
        factionId: directive.factionId,
        sourceCityId: directive.sourceCityId,
        targetCityId: directive.targetCityId,
        intent: directive.intent ?? 'conquer',
        requestedTroops: directive.proposedTroops,
        status: directive.status,
        journeyId: directive.journeyId,
        ...result,
      };
    });
  const outcomes = { capture: 0, repulse: 0, draw: 0, unknown: 0 };
  const byFaction = new Map();
  for (const campaign of dispatched) {
    outcomes[campaign.outcome]++;
    const faction = byFaction.get(campaign.factionId) ?? {
      factionId: campaign.factionId,
      dispatched: 0,
      capture: 0,
      repulse: 0,
      draw: 0,
      unknown: 0,
      raids: 0,
    };
    faction.dispatched++;
    faction[campaign.outcome]++;
    if (campaign.intent === 'raid') faction.raids++;
    byFaction.set(campaign.factionId, faction);
  }
  return {
    status: 'observed',
    dispatched: dispatched.length,
    outcomes,
    byFaction: [...byFaction.values()].sort((a, b) => a.factionId.localeCompare(b.factionId)),
    raw: dispatched,
  };
}

/** Captives by holding house at the checkpoint, and every prisoner decision so far. */
function prisonerMetrics(state) {
  const held = {};
  for (const officer of state.officers ?? []) {
    if (!officer.alive || officer.location.kind !== 'captured' || !officer.location.cityId)
      continue;
    const holder =
      state.cities.find((city) => city.id === officer.location.cityId)?.factionId ?? 'none';
    held[holder] = (held[holder] ?? 0) + 1;
  }
  const decisions = {};
  for (const event of state.events ?? []) {
    if (event.code !== 'prisoner.decision') continue;
    const holder = event.params?.holderFactionId ?? 'unknown';
    const entry = (decisions[holder] ??= {});
    const key = `${event.params?.action}${event.params?.accepted === false ? '-refused' : ''}`;
    entry[key] = (entry[key] ?? 0) + 1;
  }
  return { held, decisions };
}

export function summarize(state, factionId, month, initialIndependentCityIds = [], trace = null) {
  const ownedCities = state.cities.filter((city) => city.factionId === factionId).length;
  const initialIndependentIds = new Set(initialIndependentCityIds);
  const independentCities = state.cities.filter((city) => initialIndependentIds.has(city.id));
  const totals = state.cities
    .filter((city) => city.factionId === factionId)
    .reduce((sum, city) => ({ gold: sum.gold + city.gold, food: sum.food + city.food }), {
      gold: 0,
      food: 0,
    });
  const activeBattles = state.battles.filter((battle) => battle.active).length;
  const resolvedBattles = state.battles.filter((battle) => battle.resolved).length;
  const hegemonClaimantId = state.hegemon.factionId;
  const hegemonVictoryDeclared = Boolean(
    state.phase === 'finished' &&
    hegemonClaimantId &&
    state.winnerFactionId === hegemonClaimantId &&
    state.hegemon.months >= 12 &&
    activeBattles === 0,
  );
  return {
    month,
    absoluteDay: state.absoluteDay,
    phase: state.phase,
    playerFactionId: factionId,
    playerEliminated: Boolean(
      state.factions.find((faction) => faction.id === factionId)?.eliminated,
    ),
    ownedCities,
    totalCities: state.cities.length,
    independentCities: {
      initialCount: independentCities.length,
      ownedBySelectedFaction: independentCities.filter((city) => city.factionId === factionId)
        .length,
      remainingIndependent: independentCities.filter((city) => city.factionId === null).length,
    },
    trueUnification: ownedCities === state.cities.length,
    hegemon: {
      claimantFactionId: hegemonClaimantId,
      consecutiveMonths: state.hegemon.months,
      victoryDeclared: hegemonVictoryDeclared,
    },
    stateWinnerFactionId: state.winnerFactionId,
    totalPlayerGold: totals.gold,
    totalPlayerFood: totals.food,
    activeBattles,
    battlesStarted: state.battles.length,
    battlesResolved: resolvedBattles,
    battles: playerBattleMetrics(state, factionId),
    logistics: playerCampaignAndSupplyMetrics(state, factionId),
    autonomy: playerAutonomyMetrics(state, factionId, trace),
    campaignDirectives: {
      total: state.directives.length,
      dispatched: state.directives.filter((item) => item.status === 'dispatched').length,
      failed: state.directives.filter((item) => item.status === 'failed').length,
    },
    factionOwnership: factionOwnershipMetrics(state),
    rivalCampaigns: rivalCampaignMetrics(state, factionId),
    prisoners: prisonerMetrics(state),
    journeys: {
      outbound: state.journeys.filter((item) => item.status === 'outbound').length,
      returning: state.journeys.filter((item) => item.status === 'returning').length,
      waiting: state.journeys.filter((item) => item.status === 'waiting').length,
      failed: state.journeys.filter((item) => item.status === 'failed').length,
    },
  };
}

function finalCheckpoint(run) {
  const exact = run.checkpoints[String(run.completedMonths)];
  if (exact) return exact;
  return (
    Object.values(run.checkpoints)
      .sort((a, b) => a.month - b.month)
      .at(-1) ?? null
  );
}

/** Keep distinct terminal metrics for elimination, unification, and Hegemon victory. */
export function aggregateResults(results) {
  const terminalCheckpoints = results.map(finalCheckpoint).filter(Boolean);
  return {
    trueUnificationsAtFinal: terminalCheckpoints.filter((checkpoint) => checkpoint.trueUnification)
      .length,
    playerEliminations: terminalCheckpoints.filter((checkpoint) => checkpoint.playerEliminated)
      .length,
    hegemon: {
      status: 'implemented',
      claimsAtFinal: terminalCheckpoints.filter((checkpoint) =>
        Boolean(checkpoint.hegemon?.claimantFactionId),
      ).length,
      victoriesAtFinal: terminalCheckpoints.filter(
        (checkpoint) => checkpoint.hegemon?.victoryDeclared === true,
      ).length,
    },
  };
}
