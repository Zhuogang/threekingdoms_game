import { describe, expect, it } from 'vitest';
import { clusterVisibleCampaignParties } from '../../../src/v03/rendering/campaign-parties';

const viewport = { left: 0, top: 0, width: 1000, height: 600 };

describe('campaign party visibility and clustering', () => {
  it('never exposes journeys belonging to another faction', () => {
    const clusters = clusterVisibleCampaignParties(
      [
        { id: 'own', ownerFactionId: 'cao', position: { x: 100, y: 100 }, value: 'own party' },
        {
          id: 'enemy',
          ownerFactionId: 'yuan-shao',
          position: { x: 101, y: 100 },
          value: 'enemy party',
        },
      ],
      'cao',
      viewport,
      { width: 1000, height: 600 },
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.parties).toEqual(['own party']);
  });

  it('combines overlapping own-party markers but keeps distant markers separate', () => {
    const clusters = clusterVisibleCampaignParties(
      [
        { id: 'first', ownerFactionId: 'cao', position: { x: 200, y: 200 }, value: 'first' },
        { id: 'second', ownerFactionId: 'cao', position: { x: 220, y: 205 }, value: 'second' },
        { id: 'distant', ownerFactionId: 'cao', position: { x: 600, y: 400 }, value: 'distant' },
      ],
      'cao',
      viewport,
      { width: 1000, height: 600 },
      30,
    );
    expect(clusters).toHaveLength(2);
    const grouped = clusters.find((cluster) => cluster.parties.length > 1);
    const single = clusters.find((cluster) => cluster.parties.length === 1);
    expect(grouped?.parties).toEqual(['first', 'second']);
    expect(grouped?.position).toEqual({ x: 210, y: 202.5 });
    expect(single?.parties).toEqual(['distant']);
  });

  it('keeps individual markers when the frame has not measured yet', () => {
    const clusters = clusterVisibleCampaignParties(
      [
        { id: 'first', ownerFactionId: 'cao', position: { x: 1, y: 1 }, value: 1 },
        { id: 'second', ownerFactionId: 'cao', position: { x: 1, y: 1 }, value: 2 },
      ],
      'cao',
      viewport,
      { width: 0, height: 0 },
    );
    expect(clusters).toHaveLength(2);
  });
});
