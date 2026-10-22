const ACTIVE_DIRECTIVE_STATUSES = new Set([
  'requested',
  'proposed',
  'waiting',
  'accepted',
  'reserved',
  'dispatched',
]);
const ACTIVE_JOURNEY_STATUSES = new Set(['outbound', 'returning', 'waiting']);
const MAX_OFFICERS_PER_PARTY = 10;

function compareIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function protectedMinimumGarrison(troops) {
  return Math.min(1_000, Math.ceil(troops * 0.35));
}

function availableTroops(state, factionId, cityId, leaderOfficerId, maxTroops) {
  const officers = state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === cityId &&
        officer.troops > 0,
    )
    .sort((a, b) => {
      const leaderOrder = Number(b.id === leaderOfficerId) - Number(a.id === leaderOfficerId);
      return leaderOrder || b.force - a.force || b.troops - a.troops || compareIds(a.id, b.id);
    });
  let troopCount = 0;
  let count = 0;
  for (const officer of officers) {
    if (count >= MAX_OFFICERS_PER_PARTY) break;
    if (troopCount + officer.troops > maxTroops) continue;
    troopCount += officer.troops;
    count++;
  }
  return troopCount;
}

function activeCampaignJourneys(state) {
  return state.journeys.filter(
    (journey) => journey.kind === 'campaign' && ACTIVE_JOURNEY_STATUSES.has(journey.status),
  );
}

function expectedBattleDefenderTroops(state, city) {
  const staffedTroops = state.officers
    .filter(
      (officer) =>
        officer.alive &&
        officer.factionId === city.factionId &&
        officer.location.kind === 'city' &&
        officer.location.cityId === city.id &&
        officer.troops > 0,
    )
    .reduce((total, officer) => total + officer.troops, 0);
  return Math.max(city.garrisonTroops, staffedTroops, staffedTroops === 0 ? 500 : 0);
}

/**
 * Produce stable, adjacent enemy or independent-city attack candidates for the diagnostic bot.
 * This deliberately small policy uses the same 35%/1,000 protected garrison and
 * ten-officer party cap as the campaign planner. Commands remain authoritative
 * for route, alliance, supply, and dispatch validation.
 */
export function listAdjacentCampaignCandidates(state, routeDefinitions) {
  if (state.phase !== 'planning' || !Array.isArray(routeDefinitions)) return [];
  const factionId = state.playerFactionId;
  const faction = state.factions.find((entry) => entry.id === factionId);
  if (!faction || faction.eliminated) return [];
  const factionsById = new Map(state.factions.map((entry) => [entry.id, entry]));
  const busyTargets = new Set();
  const busySources = new Set();
  for (const directive of state.directives) {
    if (!ACTIVE_DIRECTIVE_STATUSES.has(directive.status)) continue;
    busySources.add(directive.sourceCityId);
    busyTargets.add(directive.targetCityId);
  }
  for (const journey of activeCampaignJourneys(state)) {
    busySources.add(journey.sourceCityId);
    busyTargets.add(journey.destinationCityId);
  }
  for (const battle of state.battles) {
    if (!battle.active || battle.resolved) continue;
    for (const journeyId of [battle.attackerJourneyId, battle.defenderJourneyId]) {
      if (!journeyId) continue;
      const journey = state.journeys.find((entry) => entry.id === journeyId);
      if (journey) busyTargets.add(journey.destinationCityId);
    }
  }
  const activeAllies = new Set();
  for (const alliance of state.alliances) {
    if (alliance.expiresMonthIndex <= state.monthIndex) continue;
    if (alliance.a === factionId) activeAllies.add(alliance.b);
    if (alliance.b === factionId) activeAllies.add(alliance.a);
  }

  const routesByCity = new Map();
  for (const route of routeDefinitions) {
    for (const [from, to] of [
      [route.fromCityId, route.toCityId],
      [route.toCityId, route.fromCityId],
    ]) {
      if (!routesByCity.has(from)) routesByCity.set(from, []);
      routesByCity.get(from).push({ route, targetCityId: to });
    }
  }

  const candidates = [];
  const sources = state.cities
    .filter((city) => city.factionId === factionId && !busySources.has(city.id))
    .sort((a, b) => compareIds(a.id, b.id));
  for (const source of sources) {
    const troopLimit = Math.max(
      0,
      source.garrisonTroops - protectedMinimumGarrison(source.garrisonTroops),
    );
    const requestedTroops = availableTroops(
      state,
      factionId,
      source.id,
      faction.leaderOfficerId,
      troopLimit,
    );
    if (requestedTroops <= 0) continue;

    for (const { route, targetCityId } of routesByCity.get(source.id) ?? []) {
      const target = state.cities.find((city) => city.id === targetCityId);
      if (
        !target ||
        target.factionId === factionId ||
        activeAllies.has(target.factionId) ||
        busyTargets.has(target.id)
      )
        continue;
      if (target.factionId) {
        const targetFaction = factionsById.get(target.factionId);
        if (!targetFaction || targetFaction.eliminated) continue;
      }
      candidates.push({
        sourceCityId: source.id,
        targetCityId: target.id,
        requestedTroops,
        defenderTroops: expectedBattleDefenderTroops(state, target),
        estimatedDays: route.baselineDaysNominal,
        routeId: route.id,
      });
    }
  }
  return candidates.sort(
    (a, b) =>
      a.defenderTroops / a.requestedTroops - b.defenderTroops / b.requestedTroops ||
      a.estimatedDays - b.estimatedDays ||
      compareIds(a.sourceCityId, b.sourceCityId) ||
      compareIds(a.targetCityId, b.targetCityId),
  );
}

/** Return the policy's next campaign order without mutating the supplied state. */
export function chooseAdjacentCampaignOrder(state, routeDefinitions) {
  return listAdjacentCampaignCandidates(state, routeDefinitions)[0] ?? null;
}

/**
 * Try candidates in policy order through the supplied v0.3 command boundary.
 * A shortfall is reduced to the command preview's executable troop count; an
 * unusable proposal is cancelled so it cannot strand an active source order.
 */
export function executeNextAdjacentCampaignOrder(state, routeDefinitions, executeCommand) {
  let current = state;
  const metrics = {
    candidatesTried: 0,
    commandsRejected: 0,
    dispatched: false,
    reducedAndDispatched: false,
    cancelledAfterShortfall: 0,
    selected: null,
  };

  for (const candidate of listAdjacentCampaignCandidates(current, routeDefinitions)) {
    metrics.candidatesTried++;
    const issued = executeCommand(current, {
      type: 'issueCampaignDirective',
      sourceCityId: candidate.sourceCityId,
      targetCityId: candidate.targetCityId,
      intent: 'conquer',
      requestedTroops: candidate.requestedTroops,
      requestedByDay: null,
    });
    if (!issued.ok) {
      metrics.commandsRejected++;
      continue;
    }
    current = issued.state;
    const directive = current.directives.find((entry) => entry.id === issued.orderId);
    if (!directive) throw new Error('Campaign command succeeded without creating a directive.');
    if (directive.status === 'dispatched') {
      metrics.dispatched = true;
      metrics.selected = candidate;
      return { state: current, ...metrics };
    }

    const preview = issued.preview ?? {};
    const executableTroops = Number(preview.executableTroops);
    const canReduce = Number.isSafeInteger(executableTroops) && executableTroops > 0;
    const answered = executeCommand(
      current,
      canReduce
        ? {
            type: 'answerCampaignDirective',
            directiveId: directive.id,
            answer: 'reduce',
            reducedTroops: executableTroops,
          }
        : {
            type: 'answerCampaignDirective',
            directiveId: directive.id,
            answer: 'cancel',
          },
    );
    if (answered.ok) current = answered.state;
    const resolved = current.directives.find((entry) => entry.id === directive.id);
    if (
      !answered.ok ||
      (resolved && !['cancelled', 'failed', 'rejected', 'dispatched'].includes(resolved.status))
    ) {
      const cancelled = executeCommand(current, {
        type: 'answerCampaignDirective',
        directiveId: directive.id,
        answer: 'cancel',
      });
      if (!cancelled.ok) throw new Error('Could not close an unexecutable campaign directive.');
      current = cancelled.state;
    }
    const finalDirective = current.directives.find((entry) => entry.id === directive.id);
    if (finalDirective?.status === 'dispatched') {
      metrics.dispatched = true;
      metrics.reducedAndDispatched = canReduce;
      metrics.selected = candidate;
      return { state: current, ...metrics };
    }
    metrics.cancelledAfterShortfall++;
  }
  return { state: current, ...metrics };
}
