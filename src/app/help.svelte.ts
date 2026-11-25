// The help line's source: the `data-help` text of the element under the mouse, else of the focused one.
export function createHelp() {
  let hover = $state.raw<Element | null>(null);
  let focus = $state.raw<Element | null>(null);
  const find = (t: EventTarget | null): Element | null => (t instanceof Element ? t.closest('[data-help]') : null);
  return {
    /** Read inside a reactive context that also depends on the state, so edited texts refresh. */
    text(): string | null {
      return (hover?.isConnected ? hover : focus)?.getAttribute('data-help') ?? null;
    },
    /** Listens on the document; returns the cleanup. */
    attach(): () => void {
      // A gap between elements keeps the last text (UX checklist 11): only entering an element with help changes it.
      const over = (e: Event): void => { const next = find(e.target); if (next) hover = next; };
      const leave = (): void => { hover = null; };
      // Focus moving is newer than the mouse resting: the keyboard's element wins until the mouse enters another one.
      const focusIn = (e: Event): void => { focus = find(e.target); hover = null; };
      // Not written at once: removing a focused element (a closing panel, a notice that changes) fires focusout while Svelte is
      // tearing it down, and state must not be written there (`state_unsafe_mutation`). A microtask runs after the teardown and reads where focus really is: with `el.focus()` from script, focusout and focusin both ran first,
      // and writing null here would wipe the new element (so: read, don't clear). `body` has no help, so a real loss of focus still clears.
      const focusOut = (): void => { queueMicrotask(() => { focus = find(document.activeElement); }); };
      document.addEventListener('pointerover', over);
      document.documentElement.addEventListener('pointerleave', leave);
      document.addEventListener('focusin', focusIn);
      document.addEventListener('focusout', focusOut);
      return () => {
        document.removeEventListener('pointerover', over);
        document.documentElement.removeEventListener('pointerleave', leave);
        document.removeEventListener('focusin', focusIn);
        document.removeEventListener('focusout', focusOut);
      };
    },
  };
}
