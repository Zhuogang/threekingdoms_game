import { describe, expect, it } from 'vitest';
import { executeV03Command } from '../../src/v03/commands';
import { createV03Game } from '../../src/v03/initial-state';
import { marchDestinationBlock } from '../../src/v03/governance/army';
import { cityWorkUsedThisPeriod } from '../../src/v03/governance/city-actions';
import { availableReserveTroops } from '../../src/v03/campaign/personnel';
import { clusterVisibleCampaignParties } from '../../src/v03/rendering/campaign-parties';
import type { V03GameState } from '../../src/v03/types';

const ownCity = (state: V03GameState, id: string) =>
  state.cities.find((city) => city.id === id && city.factionId === state.playerFactionId);

describe('play-feel phase 1', () => {
  it('reports a hostile army aimed at a player city when it departs, without blocking time', () => {
    const start = createV03Game('cao', 481516);
    const stopped = executeV03Command(start, { type: 'advance', days: 'nextEvent' });
    expect(stopped.ok).toBe(true);
    const warnings = stopped.state.events.filter((event) => event.kind === 'hostileApproach');
    expect(warnings.length).toBeGreaterThan(0);
    // "Next event" stops on the day the warning is issued.
    expect(stopped.advance?.eventId).toBe(warnings[0]!.id);
    expect(stopped.state.absoluteDay).toBe(warnings[0]!.absoluteDay);
    for (const warning of warnings) {
      expect(ownCity(stopped.state, warning.entityId!)).toBeDefined();
      expect(Number(warning.params?.troops) % 100).toBe(0);
      const journey = stopped.state.journeys.find(
        (entry) => entry.id === warning.params?.journeyId,
      );
      expect(journey?.destinationCityId).toBe(warning.entityId);
      expect(journey?.ownerFactionId).not.toBe(stopped.state.playerFactionId);
    }
    // Rival-versus-rival campaigns stay off the player's report list.
    const rivalTargets = stopped.state.journeys.filter(
      (journey) =>
        journey.kind === 'campaign' &&
        !ownCity(stopped.state, journey.destinationCityId) &&
        journey.ownerFactionId !== stopped.state.playerFactionId,
    );
    expect(rivalTargets.length).toBeGreaterThan(0);
    expect(warnings.every((warning) => ownCity(stopped.state, warning.entityId!))).toBe(true);

    // The notice does not block a day advance, and the next "Next event" moves past it.
    for (const event of stopped.state.events)
      if (event.kind !== 'hostileApproach') event.acknowledged = true;
    const day = executeV03Command(stopped.state, { type: 'advance', days: 1 });
    expect(day.ok && day.state.absoluteDay).toBe(stopped.state.absoluteDay + 1);
    const onward = executeV03Command(day.state, { type: 'advance', days: 'nextEvent' });
    expect(onward.ok).toBe(true);
    expect(onward.state.absoluteDay).toBeGreaterThan(day.state.absoluteDay);
  });

  it('fills stationed officers from matching reserves for free, strongest first', () => {
    const state = createV03Game('cao', 610301);
    const city = state.cities.find((entry) => entry.id === state.playerCapitalCityId)!;
    const snapshot = JSON.stringify(state);
    const before = {
      infantry: availableReserveTroops(state, city.id, 'infantry'),
      cavalry: availableReserveTroops(state, city.id, 'cavalry'),
    };
    const result = executeV03Command(state, { type: 'fillOfficersFromReserve', cityId: city.id });

    expect(result.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(snapshot);
    const after = result.state;
    const stationed = (next: V03GameState) =>
      next.officers.filter(
        (officer) =>
          officer.factionId === 'cao' &&
          officer.location.kind === 'city' &&
          officer.location.cityId === city.id,
      );
    const gained =
      stationed(after).reduce((sum, officer) => sum + officer.troops, 0) -
      stationed(state).reduce((sum, officer) => sum + officer.troops, 0);
    expect(gained).toBe(result.assigned);
    expect(result.assigned).toBeGreaterThan(0);
    // Every type that has a local commander is used up to the reserve or capacity.
    for (const type of ['infantry', 'cavalry'] as const)
      if (stationed(state).some((officer) => officer.troopType === type))
        expect(availableReserveTroops(after, city.id, type)).toBeLessThan(before[type]);
    // The strongest cavalry commander is served before weaker ones.
    const cavalry = stationed(state)
      .filter((officer) => officer.troopType === 'cavalry')
      .sort((a, b) => b.force - a.force);
    const strongest = after.officers.find((officer) => officer.id === cavalry[0]!.id)!;
    expect(strongest.troops).toBeGreaterThan(cavalry[0]!.troops);
    const capital = after.cities.find((entry) => entry.id === city.id)!;
    expect(cityWorkUsedThisPeriod(after, capital)).toBe(cityWorkUsedThisPeriod(state, city));
    // Nothing left to fill is a harmless refusal.
    const again = executeV03Command(after, { type: 'fillOfficersFromReserve', cityId: city.id });
    expect(again.ok && again.state === after).toBe(false);
  });

  it('explains a blocked destination with the same rule the march applies', () => {
    const state = createV03Game('cao', 610301);
    const target = state.cities.find((city) => city.factionId === 'liu')!;
    state.alliances.push({ a: 'cao', b: 'liu', expiresMonthIndex: state.monthIndex + 6 });
    const reason = marchDestinationBlock(state, state.playerCapitalCityId, target.id, 'conquer');
    expect(reason).toBe('An active alliance prevents this attack.');
    const officer = state.officers.find(
      (entry) =>
        entry.factionId === 'cao' &&
        entry.troops > 0 &&
        entry.location.kind === 'city' &&
        entry.location.cityId === state.playerCapitalCityId,
    )!;
    const march = executeV03Command(state, {
      type: 'marchArmy',
      sourceCityId: state.playerCapitalCityId,
      targetCityId: target.id,
      officerIds: [officer.id],
      intent: 'conquer',
    });
    expect(march.ok).toBe(false);
    expect(march.error).toBe(reason);
  });

  it('shows hostile parties aimed at the player without merging them into friendly markers', () => {
    const point = { x: 10, y: 10 };
    const clusters = clusterVisibleCampaignParties(
      [
        { id: 'own', ownerFactionId: 'cao', position: point, value: 'own' },
        { id: 'enemy', ownerFactionId: 'liu', position: point, value: 'enemy', hostile: true },
        { id: 'elsewhere', ownerFactionId: 'sun', position: point, value: 'elsewhere' },
      ],
      'cao',
      { left: 0, top: 0, width: 100, height: 100 },
      { width: 500, height: 500 },
    );
    expect(clusters.map((cluster) => [cluster.parties, cluster.hostile])).toEqual([
      [['enemy'], true],
      [['own'], false],
    ]);
  });
});
