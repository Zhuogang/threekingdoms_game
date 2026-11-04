import { SIEGE_TUNING as T } from '../../src/siege/rules/tuning';
import { describe, expect, it } from 'vitest';
import { deployUnit, siegeCommands, standBy, nextShuUnit } from '../../src/siege/ui/commands';
import { resolveSiegeDay } from '../../src/siege/ui/playback';
import {
  statePatches,
  engineSprite,
  unitVisual,
  climbableCells,
} from '../../src/siege/render/stateArt';
import { createSiegeState } from '../../src/siege/rules/state';
import { endDay } from '../../src/siege/rules/day';
import { runDefenderTurn } from '../../src/siege/ai/defender';
import { INNER_WALL_SEGMENTS } from '../../src/siege/content/chencang';
import { engine } from './rulesFixtures';

describe('playable siege adapters', () => {
  it('repositions and swaps in deployment without allowing blocked or outside cells', () => {
    const state = createSiegeState(228),
      first = state.units[1]!,
      other = state.units[2]!;
    const swapped = deployUnit(state, first.id, other);
    expect(swapped.units[1]!.x).toBe(other.x);
    expect(swapped.units[2]!.x).toBe(first.x);
    expect(deployUnit(state, first.id, { x: 10, y: 3, level: 'ground' })).toBe(state);
    expect(deployUnit(state, first.id, { x: 15, y: 23, level: 'ground' })).toBe(state);
    expect(state.units[1]!.x).toBe(first.x);
  });
  it('shows rule rejection reasons and spends stand by without modifying combat rules', () => {
    const state = createSiegeState(1),
      id = state.units[1]!.id;
    const commands = siegeCommands(state, id);
    expect(commands.find((c) => c.kind === 'move')?.reason).toBeNull();
    expect(commands.find((c) => c.kind === 'raiseLadder')?.reason).toMatch(/unraised ladder/);
    expect(commands.find((c) => c.kind === 'buildWall')?.reason).toMatch(/Wei unit/);
    const next = standBy(state, id);
    expect(next.units[1]).toMatchObject({ acted: true, moved: true });
    expect(siegeCommands(next, id).find((c) => c.kind === 'move')?.reason).toMatch(
      /cannot move today/,
    );
    expect(standBy(next, id)).toBe(next);
    expect(nextShuUnit(next, id)?.id).toBe('shu-jiangwei');
    expect(state.units[1]!.acted).toBe(false);
  });
  it('keeps playback final state identical to the daily resolver, including when frames are skipped', () => {
    const state = createSiegeState(48);
    state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
    const before = structuredClone(state),
      resolution = resolveSiegeDay(state);
    expect(resolution.frames.length).toBeGreaterThan(0);
    expect(resolution.final).toEqual(endDay(runDefenderTurn(state)));
    expect(state).toEqual(before);
  });
});
describe('state-driven artwork', () => {
  it('changes gates by durability, trench cells by exact thresholds, and walls per segment', () => {
    const state = createSiegeState(1);
    state.gates.south.durability = T.southGateDurability / 2 - 1;
    state.gates.north.durability = 0;
    state.trenchFill['20,18'] = 1;
    state.trenchFill['21,18'] = 1.5;
    state.trenchFill['22,18'] = 3;
    state.innerWall[0] = 1;
    state.innerWall[1] = 4;
    const patches = statePatches(state);
    expect(patches.find((p) => p.id === 'south')?.state).toBe('gate-south-damaged');
    expect(patches.find((p) => p.id === 'north')?.state).toBe('gate-north-broken');
    expect(patches.find((p) => p.id === 'trench-20,18')).toBeUndefined();
    expect(patches.find((p) => p.id === 'trench-21,18')).toMatchObject({
      state: 'trench-half',
      clip: [1344, 864, 1408, 936],
    });
    expect(patches.find((p) => p.id === 'trench-22,18')?.state).toBe('trench-filled');
    expect(patches.find((p) => p.id === 'inner-0')?.occluder).toBeUndefined();
    const built = patches.find((p) => p.id === 'inner-1')!;
    expect(built.occluder?.cells).toEqual([17, 14, 22, 14]);
    expect(built.clip?.[0]).toBe(17 * 64);
    expect(built.clip?.[2]).toBe(23 * 64);
    state.gates.south.durability = T.southGateDurability / 2;
    expect(statePatches(state).find((p) => p.id === 'south')).toBeUndefined();
    expect(INNER_WALL_SEGMENTS).toHaveLength(4);
  });
  it('uses engine kind, movement orientation, raised, burning and wreck art', () => {
    const ladder = engine('ladder', 20, 19);
    expect(engineSprite(ladder).sheet).toBe('s4-01-ladder-cart');
    expect(engineSprite(ladder, 'west').flip).toBe(true);
    expect(engineSprite({ ...ladder, raisedAt: { x: 20, y: 16 }, burning: true })).toMatchObject({
      sheet: 's4-02-ladder-on-wall',
      burning: true,
    });
    expect(engineSprite({ ...ladder, wrecked: true }).sheet).toBe('s4-01-ladder-cart');
    expect(engineSprite(engine('tower', 20, 20, { burning: true })).sheet).toBe(
      's4-05-siege-tower-wrecks',
    );
    expect(engineSprite(engine('tower', 20, 20, { wrecked: true })).burning).toBe(false);
  });
  it('maps factions, troop types, commanders, filling and climbing to the approved pose sets', () => {
    const state = createSiegeState(1);
    expect(unitVisual(state, state.units[0]!).set).toBe('s5-05');
    expect(unitVisual(state, state.units[10]!).set).toBe('s5-06');
    expect(unitVisual(state, state.units[1]!).set).toBe('s1-05');
    expect(unitVisual(state, state.units[8]!).set).toBe('s5-02');
    expect(unitVisual(state, state.units[12]!).set).toBe('s1-06');
    expect(unitVisual(state, state.units[11]!).set).toBe('s5-03');
    expect(unitVisual(state, state.units[1]!, 'north', 'fillTrench').action).toBe('carry');
    expect(
      unitVisual(state, { ...state.units[1]!, acted: true }, 'north', 'fillTrench').action,
    ).toBe('dump');
    state.engines = [engine('ladder', 20, 19, { raisedAt: { x: 20, y: 16 } })];
    state.trenchFill['21,17'] = 3;
    expect(climbableCells(state)).toContainEqual({ x: 20, y: 16, level: 'wall' });
    expect(climbableCells(state)).toContainEqual({ x: 21, y: 16, level: 'wall' });
    state.footholds['20,16'] = 1;
    expect(unitVisual(state, { ...state.units[1]!, x: 20, y: 19 }).action).toBe('climb-a');
  });
});
