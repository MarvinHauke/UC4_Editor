// The guide on show as Svelte state: the Send and Restore dialogs set it, the drawn panel and the card read it. One at a time.
import { getContext } from 'svelte';
import type { GuideCard, GuideData } from './guide.ts';

export function createGuide() {
  let data = $state.raw<GuideData | null>(null);
  let card = $state.raw<GuideCard | null>(null);
  return {
    get data() { return data; },
    get card() { return card; },
    show(next: GuideData, nextCard: GuideCard): void { data = next; card = nextCard; },
    clear(): void { if (data || card) { data = null; card = null; } },
  };
}
export type Guide = ReturnType<typeof createGuide>;
export const GUIDE_CONTEXT = Symbol('uc4-guide');
export const useGuide = (): Guide => getContext<Guide>(GUIDE_CONTEXT);
