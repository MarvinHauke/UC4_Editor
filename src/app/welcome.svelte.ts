// The welcome card on first open (plan 0012 decision 8): it decides what the first run does. The tour no longer starts by itself.
// Showing marks "seen" (decision 7), so a reload does not show it again; Settings → Tour starts the tour without the card.
import type { Tour } from './tour.svelte.ts';

export function createWelcome(tour: Pick<Tour, 'markSeen' | 'start'>, onget: () => void) {
  let open = $state(false);
  return {
    get open() { return open; },
    show(): void { open = true; tour.markSeen(); },
    /** "Take the tour": the card closes and the tour starts at step 1. */
    takeTour(): void { open = false; tour.start(); },
    /** "Get my setups from the UC4": the card closes and the dump overlay opens on SndA. */
    getSetups(): void { open = false; onget(); },
    /** "Not now" and Esc. */
    dismiss(): void { open = false; },
  };
}
export type Welcome = ReturnType<typeof createWelcome>;
