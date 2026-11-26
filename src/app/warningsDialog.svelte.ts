// The Warnings dialog's state (plan 0008 decision 25): open or not, which scope, whether ignored ones show, and the one control it is
// narrowed to when the property panel's line opened it. Opened from the status bar, the property panel, the Send dialog and the export line.
// The native modal dialog hands focus back to the element that opened it.
import { getContext } from 'svelte';
import type { Scope } from './warningList.ts';

export function createWarningsDialog() {
  let open = $state(false);
  let scope = $state<Scope>('this');
  let showIgnored = $state(false);
  let control = $state<string | null>(null);
  return {
    get open() { return open; },
    get scope() { return scope; },
    get showIgnored() { return showIgnored; },
    /** The control path the list is narrowed to, or null. */
    get control() { return control; },
    /** Opens it: "this setup" unless asked, narrowed to a control when given; ignored stay hidden unless asked. */
    show(options: { scope?: Scope; control?: string | null; showIgnored?: boolean } = {}): void {
      scope = options.scope ?? 'this';
      control = options.control ?? null;
      showIgnored = options.showIgnored ?? false;
      open = true;
    },
    setScope(next: Scope): void { scope = next; if (next === 'all') control = null; },
    setShowIgnored(on: boolean): void { showIgnored = on; },
    clearControl(): void { control = null; },
    close(): void { open = false; },
  };
}
export type WarningsDialog = ReturnType<typeof createWarningsDialog>;
export const WARNINGS_CONTEXT = Symbol('uc4-warnings-dialog');
export const useWarningsDialog = (): WarningsDialog => getContext<WarningsDialog>(WARNINGS_CONTEXT);
