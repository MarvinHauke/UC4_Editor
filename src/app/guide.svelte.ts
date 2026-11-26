// The guide on show as Svelte state: the Send and Restore dialogs set it, the drawn panel and the card read it. One at a time.
import { getContext } from 'svelte';
import type { GuideCard, GuideData, ListenCard } from './guide.ts';

export function createGuide() {
  let data = $state.raw<GuideData | null>(null);
  let card = $state.raw<GuideCard | ListenCard | null>(null);
  return {
    get data() { return data; },
    get card() { return card; },
    show(next: GuideData, nextCard: GuideCard | ListenCard): void { data = next; card = nextCard; },
    /** Clears the guide; with `owner` (the card its maker passed to `show`) only when that card is still the one on show, so one dialog never wipes another's guide. */
    clear(owner?: object): void { if (owner !== undefined && card !== owner) return; if (data || card) { data = null; card = null; } },
  };
}
export type Guide = ReturnType<typeof createGuide>;
export const GUIDE_CONTEXT = Symbol('uc4-guide');
export const useGuide = (): Guide => getContext<Guide>(GUIDE_CONTEXT);
