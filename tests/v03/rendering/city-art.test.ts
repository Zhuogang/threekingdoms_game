import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createV03Game } from '../../../src/v03/initial-state';
import { campaignCityArtwork, cityArtworkKind } from '../../../src/v03/rendering/campaign-city-art';
import { V03_CITY_ILLUSTRATIONS } from '../../../src/v03/rendering/city-illustrations';
import { V03_ASSETS, V03_CITY_ICONS } from '../../../src/v03/rendering/assets';
import { V03_BATTLEFIELD_CANVASES } from '../../../src/v03/rendering/battlefield-canvases.generated';

const regions = {
  imperial: ['luoyang', 'changan'],
  plains: ['beihai', 'chenliu', 'pingyuan', 'puyang', 'wancheng', 'xuchang', 'ye'],
  frontier: ['beiping', 'jinyang'],
  loess: ['tianshui'],
  basin: ['chengdu', 'zitong'],
  mountain: ['hanzhong', 'jiangzhou'],
  river: ['jiangling', 'jiangxia', 'xiangyang', 'chaisang'],
  jiangnan: ['jianye', 'wu', 'shouchun', 'xiapi'],
};

describe('regional city artwork', () => {
  it.each(['divided-realm-190', 'guandu-200'])(
    'matches every %s city to the same region in the map and detail view',
    (scenario) => {
      const cities = createV03Game('cao', 14, scenario).cities;
      const expected = Object.entries(regions).flatMap(([region, ids]) =>
        ids.map((id) => [id, region] as const),
      );
      expect(cities.map((city) => city.id).sort()).toEqual(expected.map(([id]) => id).sort());
      for (const [id, region] of expected) {
        expect(cityArtworkKind(id), id).toBe(region);
        expect(campaignCityArtwork({ id, scale: 'major' }).kind, id).toBe(region);
      }
      expect(cityArtworkKind('future-city')).toBe('plains');
    },
  );

  it('falls back for unknown IDs including names inherited from Object.prototype', () => {
    for (const id of ['future-city', 'constructor', 'toString', '__proto__']) {
      expect(cityArtworkKind(id), id).toBe('plains');
      expect(campaignCityArtwork({ id, scale: 'major' }).asset).toBe(V03_CITY_ICONS.plains);
    }
  });

  it('ships all eight detail paintings with matching provenance and runtime hashes', () => {
    const manifest = JSON.parse(
      readFileSync('docs/v0.3/assets/cities-regional-ink-02.json', 'utf8'),
    );
    expect(manifest.active).toBe(true);
    expect(manifest.status).toBe('integrated');
    expect(Object.keys(V03_CITY_ILLUSTRATIONS).sort()).toEqual(Object.keys(regions).sort());
    expect(manifest.entries).toHaveLength(8);
    for (const [region, asset] of Object.entries(V03_CITY_ILLUSTRATIONS)) {
      const record = manifest.entries.find((entry: { key: string }) => entry.key === region);
      expect(record.path).toBe(`public/${asset.path}`);
      expect([record.width, record.height]).toEqual([asset.width, asset.height]);
      expect(asset.status).toBe('integrated');
      expect(asset.alpha).toBe(true);
      const bytes = readFileSync(record.path);
      expect(bytes.subarray(8, 12).toString()).toBe('WEBP');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      expect(asset.sha256).toBe(record.sha256);
      expect(readFileSync(record.source).length).toBeGreaterThan(0);
    }
  });

  it('keeps every registered runtime asset and active manifest reference on disk', () => {
    for (const asset of [
      ...Object.values(V03_ASSETS),
      ...Object.values(V03_CITY_ICONS),
      ...Object.values(V03_CITY_ILLUSTRATIONS),
      ...Object.values(V03_BATTLEFIELD_CANVASES),
    ])
      expect(existsSync(`public/${asset.path}`), asset.path).toBe(true);
    function checkPaths(value: unknown, field: string) {
      if (typeof value === 'string' && /^(public\/assets\/|docs\/)/.test(value)) {
        expect(existsSync(value), `${field}: ${value}`).toBe(true);
      } else if (value && typeof value === 'object') {
        for (const [key, entry] of Object.entries(value)) checkPaths(entry, `${field}.${key}`);
      }
    }
    for (const name of [
      'campaign-china-full-ink-01',
      'cities-front-ink-01',
      'cities-regional-ink-02',
      'unit-squads-runtime',
      'units-count-ink-04',
      'units-readable-ink-03',
      'battlefield-canvases',
    ])
      checkPaths(JSON.parse(readFileSync(`docs/v0.3/assets/${name}.json`, 'utf8')), name);
  });
});
