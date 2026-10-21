import { projectCampaignPoint } from './index';

export interface GeographyStroke {
  id: string;
  label: string;
  points: readonly { x: number; y: number }[];
}

function line(
  id: string,
  label: string,
  coordinates: readonly (readonly [latitude: number, longitude: number])[],
): GeographyStroke {
  return {
    id,
    label,
    points: coordinates.map(([latitude, longitude]) => projectCampaignPoint(latitude, longitude)),
  };
}

/**
 * Broad regional control lines for map readability only. These generalized
 * river and mountain strokes are never used by route, distance, or battle rules.
 */
export const CAMPAIGN_WATERWAYS: readonly GeographyStroke[] = [
  line('yellow-river', 'Yellow River · generalized course', [
    [34.4, 104.1],
    [34.9, 105.9],
    [34.7, 107.3],
    [34.8, 108.9],
    [34.7, 110.3],
    [34.9, 112.1],
    [35.3, 113.9],
    [36.4, 115.3],
    [37.1, 117.1],
    [37.5, 119.1],
  ]),
  line('yangtze-river', 'Yangtze River · generalized course', [
    [29.0, 103.7],
    [29.2, 105.2],
    [29.2, 107.0],
    [29.5, 108.6],
    [29.8, 110.2],
    [30.1, 111.9],
    [30.4, 113.8],
    [30.0, 115.7],
    [30.4, 117.4],
    [31.0, 119.3],
  ]),
];

export const CAMPAIGN_MOUNTAIN_RANGES: readonly GeographyStroke[] = [
  line('qinling', 'Qinling Mountains · generalized regional band', [
    [34.7, 104.8],
    [34.4, 106.1],
    [33.9, 107.2],
    [34.1, 108.4],
    [34.3, 109.7],
    [34.1, 111.1],
  ]),
  line('micang-daba', 'Micang–Daba ranges · generalized regional band', [
    [33.2, 104.4],
    [32.7, 105.6],
    [32.5, 107.0],
    [32.8, 108.3],
    [32.5, 109.5],
    [32.8, 110.6],
  ]),
  line('taihang', 'Taihang Mountains · generalized regional band', [
    [35.3, 112.7],
    [36.2, 113.0],
    [37.1, 113.4],
    [38.1, 113.7],
    [39.4, 114.1],
  ]),
];
