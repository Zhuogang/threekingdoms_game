import { describe, expect, it } from 'vitest';
import {
  CITY_GEOGRAPHY_BY_ID,
  ROUTE_BY_ID,
  findStrategicRoutePath,
  projectCampaignPoint,
  projectCampaignRoute,
  projectCityRoute,
  projectJourneyPosition,
} from '../../src/v03/geography';
import { estimateTravel } from '../../src/v03/calendar';

describe('v0.3 campaign route map geometry', () => {
  it('keeps route geometry explicitly schematic and road kilometres separate from baseline ETA', () => {
    const route = ROUTE_BY_ID.get('changan--hanzhong')!;
    const display = projectCampaignRoute(route);
    const ordinary = estimateTravel(route, 'reverse', 0, { troopTypes: ['infantry'] });
    const lightCavalry = estimateTravel(route, 'reverse', 0, { troopTypes: ['cavalry'] });

    expect(display.cityIds).toEqual(['changan', 'hanzhong']);
    expect(display.points).toEqual([
      projectCampaignPoint(CITY_GEOGRAPHY_BY_ID.get('changan')!.latitude, 108.94),
      projectCampaignPoint(CITY_GEOGRAPHY_BY_ID.get('hanzhong')!.latitude, 107.05),
    ]);
    expect(display.geometryBasis).toBe('schematic-city-anchor-network');
    expect(display.nominalRoadKm).toBe(425);
    expect(display.baselineDaysNominal).toBe(33);
    expect(ordinary.estimatedDays).toBe(display.baselineDaysNominal);
    expect(lightCavalry.estimatedDays).toBe(30);
    expect(display.nominalRoadKm).not.toBe(lightCavalry.estimatedDays);
    expect(display.sourceRefs.length).toBeGreaterThan(0);
    expect(display.researchNotes).toContain('褒斜道');
  });

  it('projects a multi-hop path through its actual network cities in travel order', () => {
    const path = findStrategicRoutePath('xuchang', 'chengdu', {
      allowedCityIds: new Set([
        'xuchang',
        'wancheng',
        'xiangyang',
        'jiangling',
        'jiangzhou',
        'zitong',
        'chengdu',
      ]),
    });
    expect(path).not.toBeNull();
    const projected = projectCityRoute(path!.cityIds);
    expect(projected).not.toBeNull();
    expect(projected!.cityIds).toEqual(path!.cityIds);
    expect(projected!.points).toHaveLength(path!.cityIds.length);
    expect(projected!.points[0]).toEqual(
      projectCampaignPoint(
        CITY_GEOGRAPHY_BY_ID.get('xuchang')!.latitude,
        CITY_GEOGRAPHY_BY_ID.get('xuchang')!.longitude,
      ),
    );
    expect(projected!.points.at(-1)).toEqual(
      projectCampaignPoint(
        CITY_GEOGRAPHY_BY_ID.get('chengdu')!.latitude,
        CITY_GEOGRAPHY_BY_ID.get('chengdu')!.longitude,
      ),
    );
    expect(projected!.geometryBasis).toBe('schematic-city-anchor-network');
    expect(projectCityRoute(['hanzhong', 'chengdu'])).toBeNull();
  });

  it('places journey markers by saved route-snapshot progress across network legs', () => {
    const path = findStrategicRoutePath('xuchang', 'chengdu', {
      allowedCityIds: new Set([
        'xuchang',
        'wancheng',
        'xiangyang',
        'jiangling',
        'jiangzhou',
        'zitong',
        'chengdu',
      ]),
    })!;
    const lengths = path.legs.map((leg) => leg.route.roadKmNominal);
    const firstLegMarker = projectJourneyPosition(path.cityIds, lengths, [
      lengths[0]!,
      ...lengths.slice(1).map(() => 0),
    ]);
    const halfLegProgress = projectJourneyPosition(
      path.cityIds,
      lengths,
      lengths.map((length) => length / 2),
    );
    const endpoint = projectJourneyPosition(path.cityIds, lengths, lengths);

    expect(firstLegMarker).toEqual(
      projectCampaignPoint(
        CITY_GEOGRAPHY_BY_ID.get(path.cityIds[1]!)!.latitude,
        CITY_GEOGRAPHY_BY_ID.get(path.cityIds[1]!)!.longitude,
      ),
    );
    expect(halfLegProgress).not.toEqual(firstLegMarker);
    expect(endpoint).toEqual(
      projectCampaignPoint(
        CITY_GEOGRAPHY_BY_ID.get('chengdu')!.latitude,
        CITY_GEOGRAPHY_BY_ID.get('chengdu')!.longitude,
      ),
    );
    expect(
      projectJourneyPosition(
        path.cityIds,
        lengths,
        lengths.map((length) => length * 2),
      ),
    ).toEqual(endpoint);
  });

  it('rejects malformed route snapshots instead of drawing a misleading marker', () => {
    expect(projectJourneyPosition(['hanzhong', 'changan'], [], [])).toBeNull();
    expect(projectJourneyPosition(['hanzhong', 'changan'], [100, 200], [50])).toBeNull();
    expect(projectJourneyPosition(['hanzhong', 'changan'], [100], [-1])).toBeNull();
  });
});
