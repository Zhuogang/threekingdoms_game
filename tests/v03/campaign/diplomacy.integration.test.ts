import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { advanceV03 } from '../../../src/v03/engine';
import { previewCampaignDirective } from '../../../src/v03/governance/orders';
import { createV03OrderServices } from '../../../src/v03/governance/services';
import {
  acceptV03Invitation,
  breakV03Alliance,
  getV03AllianceChance,
  getV03AllianceFactors,
  proposeV03Alliance,
} from '../../../src/v03/campaign/diplomacy';
import { validateV03State } from '../../../src/v03/platform/storage';

describe('v0.3 diplomacy and monthly victory integration', () => {
  it('forms six-month alliances, blocks attacks, and applies the broken-treaty penalty', () => {
    const state = createV03Game('cao', 1);
    const target = state.factions.find((faction) => faction.id === 'liu')!;
    const uncappedBefore = getV03AllianceFactors(state, target.id).reduce(
      (sum, factor) => sum + factor.points,
      0,
    );
    const proposed = proposeV03Alliance(state, target.id);
    expect(proposed.ok).toBe(true);
    expect(proposed.state.alliances).toEqual([{ a: 'cao', b: 'liu', expiresMonthIndex: 6 }]);
    expect(proposed.state.rng).not.toBe(state.rng);

    const enemyCity = proposed.state.cities.find((city) => city.factionId === target.id)!;
    const preview = previewCampaignDirective(
      proposed.state,
      {
        sourceCityId: proposed.state.playerCapitalCityId,
        targetCityId: enemyCity.id,
        intent: 'conquer',
        requestedTroops: 1000,
        requestedByDay: null,
      },
      createV03OrderServices(),
    );
    expect(preview.reasonCodes).toContain('order.target-allied');

    const broken = breakV03Alliance(proposed.state, target.id);
    expect(broken.ok).toBe(true);
    expect(broken.state.alliances).toHaveLength(0);
    expect(getV03AllianceChance(broken.state, target.id)).toBe(
      Math.max(5, Math.min(90, uncappedBefore - 30)),
    );
  });

  it('accepts an anti-Dong coalition invitation and forms treaties with active members', () => {
    const state = createV03Game('cao', 2);
    state.coalitionInvitations.push({
      id: 'invitation:test',
      eventId: 'anti-dong-coalition',
      targetFactionId: 'dong',
      memberFactionIds: ['liu', 'sun'],
      expiresMonthIndex: 3,
    });
    const accepted = acceptV03Invitation(state, 'invitation:test');
    expect(accepted.ok).toBe(true);
    expect(accepted.state.coalitionInvitations).toHaveLength(0);
    expect(accepted.state.alliances).toEqual([
      { a: 'cao', b: 'liu', expiresMonthIndex: 6 },
      { a: 'cao', b: 'sun', expiresMonthIndex: 6 },
    ]);
  });

  it('declares Hegemon at the twelfth monthly boundary and stores a valid finished campaign', () => {
    const state = createV03Game('cao', 23);
    const caoCapital = state.factions.find((faction) => faction.id === 'cao')!.capitalCityId;
    const held = new Set(state.cities.slice(0, 16).map((city) => city.id));
    held.add('luoyang');
    held.add(caoCapital);
    while (held.size > 16) {
      const removable = [...held].reverse().find((id) => id !== 'luoyang' && id !== caoCapital)!;
      held.delete(removable);
    }
    state.playerCapitalCityId = caoCapital;
    for (const city of state.cities) {
      if (held.has(city.id)) city.factionId = 'cao';
      city.governorId = null;
      city.pendingAppointment = null;
      city.governanceMode = city.id === caoCapital ? 'ruler' : 'steward';
    }
    for (const officer of state.officers) officer.governorOfCityId = null;
    state.hegemon = { factionId: 'cao', months: 11 };
    state.absoluteDay = 29;
    state.monthIndex = 0;

    const result = advanceV03(state, 1);
    expect(result.state.hegemon).toEqual({ factionId: 'cao', months: 12 });
    expect(result.state.phase).toBe('finished');
    expect(result.state.winnerFactionId).toBe('cao');
    expect(result.state.events.some((event) => event.title === 'Proclaimed Hegemon')).toBe(true);
    expect(validateV03State(result.state)).toBe(true);
  });
});
