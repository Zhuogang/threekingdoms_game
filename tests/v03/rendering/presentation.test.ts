import { describe, expect, it } from 'vitest';
import {
  loadAssetOrFallback,
  resolvePublicAsset,
  spriteOffsetFromAnchor,
  V03_ASSETS,
} from '../../../src/v03/rendering/assets';
import {
  formatModifier,
  troopGlyph,
  troopName,
  unitIsOnWater,
  waterCombatDisplay,
  type BattleUnitVisual,
} from '../../../src/v03/rendering/presentation';

describe('v0.3 asset loading and sprite contract', () => {
  it('registers the regional campaign atlas with the 16:10 projection contract', () => {
    expect(V03_ASSETS.campaignMapRegional).toMatchObject({
      category: 'map-background',
      path: 'assets/v03/maps/campaign-regional-map.svg',
      width: 1600,
      height: 1000,
      alpha: false,
      status: 'integrated',
    });
    expect(resolvePublicAsset(V03_ASSETS.campaignMapRegional.path, '/campaign/')).toBe(
      '/campaign/assets/v03/maps/campaign-regional-map.svg',
    );
  });

  it('resolves asset paths under the configured app base and rejects traversal', () => {
    expect(resolvePublicAsset(V03_ASSETS.groundInk01.path, '/campaign/')).toBe(
      '/campaign/assets/v03/terrain/material-ground-ink-01.webp',
    );
    expect(resolvePublicAsset('/assets/v03/units/infantry-ink-01.webp', '/')).toBe(
      '/assets/v03/units/infantry-ink-01.webp',
    );
    expect(() => resolvePublicAsset('../private.webp')).toThrow(RangeError);
  });

  it('returns a semantic fallback when texture loading fails', async () => {
    const error = new Error('offline');
    const loaded = await loadAssetOrFallback(
      'ground.webp',
      async () => {
        throw error;
      },
      () => 'paper-fallback',
    );
    expect(loaded).toEqual({ value: 'paper-fallback', usedFallback: true, error });
    await expect(
      loadAssetOrFallback(
        'unit.webp',
        async (path) => path,
        () => 'fallback',
      ),
    ).resolves.toEqual({ value: 'unit.webp', usedFallback: false });
  });

  it('keeps squad image dimensions, alpha policy and anchor offsets explicit', () => {
    expect(V03_ASSETS.groundInk01).toMatchObject({
      width: 512,
      height: 512,
      alpha: false,
      anchor: null,
    });
    expect(V03_ASSETS.infantrySquadInk02).toMatchObject({
      width: 256,
      height: 256,
      alpha: true,
      anchor: [0.5, 0.5],
    });
    expect(V03_ASSETS.transportSquadInk02).toMatchObject({
      width: 256,
      height: 256,
      alpha: true,
      anchor: [0.5, 0.5],
    });
    expect(spriteOffsetFromAnchor(100, 80, [0.5, 0.86])).toEqual({ x: -50, y: -68.8 });
  });
});

describe('v0.3 rule-state presentation', () => {
  const waterMap = {
    width: 3,
    height: 2,
    terrain: ['plain', 'water', 'plain', 'cliff', 'plain', 'water'],
  };

  it.each(['infantry', 'cavalry', 'archer'])(
    '%s uses the same position-driven water state',
    (troopType) => {
      const unit: BattleUnitVisual = {
        id: 'unit',
        troopType,
        position: { x: 1, y: 0 },
        faction: 'player',
      };
      expect(unitIsOnWater(unit, waterMap)).toBe(true);
      expect(
        waterCombatDisplay(unit, waterMap, {
          attackMultiplier: 0.75,
          incomingDamageMultiplier: 1.25,
        }),
      ).toEqual({
        isOnWater: true,
        attackMultiplier: 0.75,
        incomingDamageMultiplier: 1.25,
      });
      expect(unitIsOnWater({ ...unit, isOnWater: false }, waterMap)).toBe(false);
    },
  );

  it('renders bilingual troop identities and readable modifier text without encoding combat rules', () => {
    expect(troopName('infantry', 'zh')).toBe('步兵');
    expect(troopName('archer', 'en')).toBe('Archer');
    expect(troopGlyph('cavalry')).toBe('骑');
    expect(formatModifier(0.75, 'en')).toBe('75%');
    expect(formatModifier(1.25, 'zh')).toBe('125%');
  });
});
