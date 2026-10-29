import type { V03GameState } from '../src/v03/types';

export function validateCampaignSaveCheckpoint(
  api: {
    encodeV03Save: (state: V03GameState) => string;
    decodeV03Save: (payload: string) => V03GameState;
  },
  state: V03GameState,
  reason: 'initial' | 'month-boundary' | 'final',
): {
  reason: 'initial' | 'month-boundary' | 'final';
  absoluteDay: number;
  phase: V03GameState['phase'];
  bytes: number;
  sha256: string;
};
