// The Follow switch as Svelte state in a context (App creates it; the monitor heading shows it).
import { getContext } from 'svelte';
import { loadFollow, saveFollow } from './follow.ts';

export function createFollow() {
  let on = $state(loadFollow());
  return {
    get on() { return on; },
    set(next: boolean): void { on = next; saveFollow(next); },
  };
}
export type FollowState = ReturnType<typeof createFollow>;
export const FOLLOW_CONTEXT = Symbol('uc4-follow');
export const useFollow = (): FollowState => getContext<FollowState>(FOLLOW_CONTEXT);
