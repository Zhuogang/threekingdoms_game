import type { Point } from './geometry';
import type { CampaignViewBox } from './campaign-viewport';

export interface CampaignPartyCandidate<T> {
  id: string;
  ownerFactionId: string;
  position: Point;
  value: T;
}

export interface CampaignPartyCluster<T> {
  id: string;
  position: Point;
  parties: T[];
}

/**
 * Keep undiscovered opponents off the player map and combine markers that
 * would overlap at the current camera scale.
 */
export function clusterVisibleCampaignParties<T>(
  candidates: readonly CampaignPartyCandidate<T>[],
  playerFactionId: string,
  viewport: CampaignViewBox,
  frame: { width: number; height: number },
  overlapPixels = 30,
): CampaignPartyCluster<T>[] {
  const visible = candidates
    .filter((candidate) => candidate.ownerFactionId === playerFactionId)
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  if (frame.width <= 0 || frame.height <= 0) {
    return visible.map((candidate) => ({
      id: candidate.id,
      position: candidate.position,
      parties: [candidate.value],
    }));
  }

  const clusters: Array<{
    id: string;
    x: number;
    y: number;
    sumX: number;
    sumY: number;
    parties: T[];
  }> = [];
  for (const candidate of visible) {
    const screen = {
      x: ((candidate.position.x - viewport.left) / viewport.width) * frame.width,
      y: ((candidate.position.y - viewport.top) / viewport.height) * frame.height,
    };
    const cluster = clusters.find(
      (entry) => Math.hypot(entry.x - screen.x, entry.y - screen.y) < overlapPixels,
    );
    if (!cluster) {
      clusters.push({
        id: candidate.id,
        x: screen.x,
        y: screen.y,
        sumX: screen.x,
        sumY: screen.y,
        parties: [candidate.value],
      });
      continue;
    }
    cluster.parties.push(candidate.value);
    cluster.sumX += screen.x;
    cluster.sumY += screen.y;
    cluster.x = cluster.sumX / cluster.parties.length;
    cluster.y = cluster.sumY / cluster.parties.length;
  }

  return clusters.map((cluster) => ({
    id: cluster.id,
    position: {
      x: viewport.left + (cluster.x / frame.width) * viewport.width,
      y: viewport.top + (cluster.y / frame.height) * viewport.height,
    },
    parties: cluster.parties,
  }));
}
