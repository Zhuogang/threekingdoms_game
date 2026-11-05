import { fineSpanOf } from '../content/coarseGrid';
import type { Cell } from '../rules/types';

/** Temporary V1 bridge: representative fine cell at the centre of a board span.
 * Painting geometry remains in fine coordinates; V2 replaces this approximation. */
export function boardToFine(cell: Cell): Cell {
  const span = fineSpanOf(cell);
  return { x: (span.west + span.east) / 2, y: (span.north + span.south) / 2 };
}
