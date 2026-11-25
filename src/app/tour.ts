// The first-run tour's rules (plan 0012): when the welcome card shows, how "seen" is kept, how steps page, where the card sits.
// Plain functions, no Svelte; the overlay and the store call them.

export const TOUR_SEEN_KEY = 'uc4-editor-tour-seen';

export interface TourStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

/** Whether the tour was marked seen in this browser. Blocked storage reads as "not seen" (the store then shows it once per load). */
export function readSeen(storage: TourStorage | null): boolean {
  try { return storage?.getItem(TOUR_SEEN_KEY) === '1'; } catch { return false; }
}

/** Marks the tour seen; blocked or full storage is ignored. */
export function writeSeen(storage: TourStorage | null): void {
  try { storage?.setItem(TOUR_SEEN_KEY, '1'); } catch { /* shown again next load */ }
}

/** The first-run rule: the welcome card shows by itself when nothing was received or imported yet (no kept dump, library still factory) and it was not seen. */
export function shouldWelcome(o: { seen: boolean; keptDumps: number; differsFromFactory: boolean }): boolean {
  return !o.seen && o.keptDumps === 0 && !o.differsFromFactory;
}

/** Paging stays inside the steps. */
export const nextIndex = (i: number, count: number): number => Math.min(count - 1, i + 1);
export const prevIndex = (i: number): number => Math.max(0, i - 1);

/** A dimmed strip beside the lit box must be this wide to hold the card's edge. */
export const MIN_STRIP = 120;

export interface Box { left: number; top: number; width: number; height: number }

/** The card's top-left: beside the lit box (right, left, below, above); else over the wider dimmed strip at the window's edge (never over the lit area when a strip is at least MIN_STRIP wide); else inside the box at the bottom right. Always inside the window. No box: centred. */
export function placeCard(box: Box | null, card: { width: number; height: number }, view: { width: number; height: number }, gap = 16): { left: number; top: number } {
  const clamp = (v: number, size: number, max: number): number => Math.max(gap / 2, Math.min(v, max - size - gap / 2));
  if (!box) return { left: (view.width - card.width) / 2, top: Math.max(gap / 2, (view.height - card.height) / 2) };
  const midTop = clamp(box.top + box.height / 2 - card.height / 2, card.height, view.height);
  const midLeft = clamp(box.left + box.width / 2 - card.width / 2, card.width, view.width);
  const right = box.left + box.width + gap, below = box.top + box.height + gap;
  if (right + card.width + gap / 2 <= view.width) return { left: right, top: midTop };
  if (box.left - gap - card.width >= gap / 2) return { left: box.left - gap - card.width, top: midTop };
  if (below + card.height + gap / 2 <= view.height) return { left: midLeft, top: below };
  if (box.top - gap - card.height >= gap / 2) return { left: midLeft, top: box.top - gap - card.height };
  const leftStrip = box.left, rightStrip = view.width - (box.left + box.width);
  if (Math.max(leftStrip, rightStrip) >= MIN_STRIP) return { left: rightStrip > leftStrip ? view.width - card.width - gap / 2 : gap / 2, top: midTop };
  return { left: clamp(box.left + box.width - card.width - gap, card.width, view.width), top: clamp(box.top + box.height - card.height - gap, card.height, view.height) };
}

/** Where a step's number badge sits on its lit box: above the top-left corner; else (box at the window's top) inside the corner, never beside it, where it could land on another area. */
export function badgeSide(box: Box, size = 22, gap = 4): 'above' | 'inside' {
  return box.top >= size + gap ? 'above' : 'inside';
}
