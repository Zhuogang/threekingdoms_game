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
  const durationDays = battles.map((battle) => battle.battleData.day).filter(Number.isFinite);
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
      durationDays: data.day,
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
      raw: records,
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

function playerAutonomyMetrics(state, factionId) {
  const cities = state.cities.filter(
    (city) => city.factionId === factionId && city.governanceMode !== 'ruler',
  );
  // Monthly settlement applies work after the timeline has crossed into the
  // new month, and city actions store that current index on the city.
  const expectedWorkMonthIndex = state.monthIndex;
  const observed = cities.filter((city) => city.workMonthIndex === expectedWorkMonthIndex);
  const worked = observed.filter((city) => (city.workPointsUsed ?? 0) > 0);
  return {
    autonomousCities: cities.length,
    workMonthIndexExpected: expectedWorkMonthIndex,
    observedForLastSettlement: observed.length,
    workedCities: worked.length,
    idleCities: observed.length - worked.length,
    unobservedCities: cities.length - observed.length,
    completedWorkPoints: observed.reduce((sum, city) => sum + (city.workPointsUsed ?? 0), 0),
    coverageNote:
      'Idle is counted only for autonomous cities whose workMonthIndex matches the most recent completed month; unobserved entries are not classified as idle.',
  };
}

export function summarize(state, factionId, month, initialIndependentCityIds = []) {
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
    autonomy: playerAutonomyMetrics(state, factionId),
    campaignDirectives: {
      total: state.directives.length,
      dispatched: state.directives.filter((item) => item.status === 'dispatched').length,
      failed: state.directives.filter((item) => item.status === 'failed').length,
    },
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
