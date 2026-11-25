// Which of the three areas (property panel, device view, setup list) the user is working in (plan 0006 decision 21).
// The last one clicked or focused is "active": the Setup LED on the drawn panel lights while the setup list is.
import { getContext } from 'svelte';

import type { GroupKind } from './carousel.ts';

export type AreaName = 'properties' | 'device' | 'setups';
const NAMES: readonly string[] = ['properties', 'device', 'setups'];

/** The area an event target sits in: the nearest element marked `data-area`, or null. Takes anything with `closest`. */
export function areaOf(target: unknown): AreaName | null {
  const t = target as { closest?: (selector: string) => { getAttribute: (name: string) => string | null } | null } | null;
  const name = t?.closest?.('[data-area]')?.getAttribute('data-area') ?? null;
  return name !== null && NAMES.includes(name) ? (name as AreaName) : null;
}

export function createActiveArea() {
  let current = $state<AreaName | null>(null);
  // The section the groups area shows: set where a control is picked or a group is stepped, never guessed from numbers.
  let section = $state<GroupKind>('encoder');
  // The property field that has the keyboard focus (a `data-property` element), for the display's edit-mode text.
  let property = $state<string | null>(null);
  return {
    get property() { return property; },
    /** Called on focus moves: the focused element's property, or none. */
    noteFocus(target: unknown): void {
      const t = target as { closest?: (s: string) => { getAttribute: (n: string) => string | null } | null } | null;
      property = t?.closest?.('[data-property]')?.getAttribute('data-property') ?? null;
    },
    get section() { return section; },
    setSection(kind: GroupKind): void { section = kind; },
    get current() { return current; },
    /** Clicking or focusing inside an area makes it active; elsewhere (the toolbar, the status bar) leaves it as it was. */
    note(target: unknown): void { const a = areaOf(target); if (a) current = a; },
  };
}
export type ActiveArea = ReturnType<typeof createActiveArea>;

export const ACTIVE_AREA_CONTEXT = Symbol('uc4-active-area');
export const useActiveArea = (): ActiveArea => getContext<ActiveArea>(ACTIVE_AREA_CONTEXT);
