export interface QueuedCard {
  id: string;
  type: 'hint' | 'counter';
}
export interface CardBlockers {
  report: boolean;
  replay: boolean;
  modal: boolean;
  walkthrough: boolean;
}

/** Stable FIFO: an arriving counter never interrupts a visible hint. Dismissed
 * cards leave the queue; blocked cards stay queued until their turn. */
export function enqueueCards(
  queue: readonly QueuedCard[],
  candidates: readonly QueuedCard[],
  dismissed: readonly string[],
) {
  return [...queue, ...candidates.filter((c) => !queue.some((q) => q.id === c.id))].filter(
    (c) => !dismissed.includes(c.id),
  );
}
export function visibleCard(queue: readonly QueuedCard[], b: CardBlockers) {
  if (b.report || b.replay || b.modal) return null;
  return queue.find((c) => c.type !== 'hint' || !b.walkthrough) ?? null;
}

export function noticeCorner(
  width: number,
  height: number,
  cardWidth: number,
  cardHeight: number,
  selection: readonly number[] | null,
) {
  const corners = [
    { left: 12, top: 12 },
    { left: width - cardWidth - 12, top: 12 },
    { left: width - cardWidth - 12, top: height - cardHeight - 12 },
    { left: 12, top: height - cardHeight - 12 },
  ];
  return (
    corners.find(
      (c) =>
        !selection ||
        c.left + cardWidth < selection[0]! ||
        c.left > selection[2]! ||
        c.top + cardHeight < selection[1]! ||
        c.top > selection[3]!,
    ) ?? corners[0]!
  );
}
