// The tour on show: whether it is open and which step. Starting marks it seen, so a reload does not repeat it.
import { TOUR_STEPS, type TourStep } from './profile/uc4Tour.ts';
import { nextIndex, prevIndex, readSeen, writeSeen, type TourStorage } from './tour.ts';

function browserStorage(): TourStorage | null { try { return localStorage; } catch { return null; } }

export function createTour(storage: TourStorage | null = browserStorage(), steps: readonly TourStep[] = TOUR_STEPS) {
  let open = $state(false);
  let index = $state(0);
  // Seen in this browser, or already shown in this page load (blocked storage cannot remember).
  let seen = readSeen(storage);
  return {
    get open() { return open; },
    get index() { return index; },
    get step() { return steps[index]!; },
    get count() { return steps.length; },
    get isLast() { return index === steps.length - 1; },
    get seen() { return seen; },
    start(): void { index = 0; open = true; seen = true; writeSeen(storage); },
    next(): void { index = nextIndex(index, steps.length); },
    back(): void { index = prevIndex(index); },
    end(): void { open = false; },
  };
}
export type Tour = ReturnType<typeof createTour>;
