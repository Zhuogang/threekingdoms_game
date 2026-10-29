import { describe, expect, it } from 'vitest';
import { executeV03Command } from '../../src/v03/commands';
import { playtestFixture } from '../../src/v03/dev/fixtures';
import { runBattleAiTurn } from '../../src/v03/battle';
import { estimateRequisition } from '../../src/v03/governance/authority';
import { createV03Game } from '../../src/v03/initial-state';
import { deadlineFromDaysInput } from '../../src/v03/ui/shared/app-copy-3';

describe('play-feel phase 0', () => {
  it('lets the remaining player officers act through the shared tactical policy', () => {
    const state = playtestFixture('battle');
    const battle = state.battles[0]!;
    const side = battle.battleData.playerSide;
    const positions = (units: typeof battle.battleData.units) =>
      units.filter((unit) => unit.side === side).map((unit) => `${unit.id}:${unit.x},${unit.y}`);
    const before = positions(battle.battleData.units);
    const snapshot = JSON.stringify(state);

    const held = executeV03Command(state, { type: 'completeBattleDay', battleId: battle.id });
    const acted = executeV03Command(state, {
      type: 'completeBattleDay',
      battleId: battle.id,
      remainingAct: true,
    });

    expect(held.ok && acted.ok).toBe(true);
    expect(JSON.stringify(state)).toBe(snapshot);
    const heldBattle = held.state.battles.find((entry) => entry.id === battle.id)!;
    const actedBattle = acted.state.battles.find((entry) => entry.id === battle.id)!;
    // Holding leaves every player formation in place; delegated officers advance.
    expect(positions(heldBattle.battleData.units)).toEqual(before);
    expect(positions(actedBattle.battleData.units)).not.toEqual(before);
    expect(acted.state.absoluteDay).toBe(held.state.absoluteDay);
  });

  it('never withdraws the player army when officers act on delegation', () => {
    const battle = playtestFixture('battle').battles[0]!.battleData;
    const side = battle.playerSide;
    const weakened = structuredClone(battle);
    for (const unit of weakened.units) if (unit.side === side) unit.troops = 1;
    weakened.retreatAllowed = { attacker: true, defender: true };

    expect(runBattleAiTurn(weakened, side).outcome?.reason).toBe('retreat');
    expect(
      runBattleAiTurn(weakened, side, {}, { allowWithdrawal: false }).outcome?.reason,
    ).not.toBe('retreat');
  });

  it('stops "Next event" when the player party arrives', () => {
    const state = createV03Game('cao', 610301);
    const officer = state.officers.find(
      (entry) =>
        entry.factionId === 'cao' &&
        entry.location.kind === 'city' &&
        entry.location.cityId === 'chenliu' &&
        entry.id !== 'caocao' &&
        entry.troops === 0 &&
        !entry.governorOfCityId,
    )!;
    const transfer = executeV03Command(state, {
      type: 'transferOfficers',
      sourceCityId: 'chenliu',
      targetCityId: 'xuchang',
      officerIds: [officer.id],
    });
    expect(transfer.ok).toBe(true);
    const journey = transfer.state.journeys.find((entry) => entry.ownerFactionId === 'cao')!;
    const advanced = executeV03Command(transfer.state, { type: 'advance', days: 'nextEvent' });

    expect(advanced.ok).toBe(true);
    expect(advanced.state.absoluteDay).toBe(journey.expectedArrivalDay);
    expect(advanced.advance?.eventId).toBe(`arrival:${journey.id}`);
  });

  it('estimates requisition waits from the production settlement pays', () => {
    const state = createV03Game('cao', 610301);
    const source = state.cities.find((city) => city.id === 'puyang')!;
    const estimate = estimateRequisition(
      state,
      'puyang',
      'chenliu',
      { gold: 0, food: source.food + 2000, troops: 0 },
      5,
    );
    // Puyang produces well over 1,000 food a month, so a 2,000 shortfall is weeks away,
    // not the hundreds of days the old farming/4 estimate produced.
    expect(estimate.deficit.food).toBeGreaterThanOrEqual(2000);
    expect(estimate.earliestDepartureDay! - state.absoluteDay).toBeLessThan(60);
  });

  it('reads order deadlines as days from today', () => {
    expect(deadlineFromDaysInput(40, '')).toBeNull();
    expect(deadlineFromDaysInput(40, '10')).toBe(50);
    expect(deadlineFromDaysInput(40, '-3')).toBe(40);
  });
});
