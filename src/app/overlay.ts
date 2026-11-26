// What the cards that take the whole window share (the tour, the welcome card; the dump guide's card hands focus back the same way):
// remembering where focus was, giving it back, and keeping Tab inside a card. Plain functions, no Svelte.

/** Remembers the element that had focus when a card opened and hands focus back when it closes. */
export function createOpener() {
  let el: HTMLElement | null = null;
  return {
    remember(): void { el = document.activeElement instanceof HTMLElement ? document.activeElement : null; },
    /** Back to the remembered element, if it is still on the page. */
    restore(): void { if (el?.isConnected) el.focus(); el = null; },
  };
}
export type Opener = ReturnType<typeof createOpener>;

/** Tab and Shift-Tab wrap inside `card`; a focus outside it comes back in. Returns true when the key was handled. */
export function trapTab(card: HTMLElement, e: KeyboardEvent): boolean {
  if (e.key !== 'Tab') return false;
  const items = [...card.querySelectorAll<HTMLElement>('button:not(:disabled)')];
  const first = items[0], last = items.at(-1);
  if (!first || !last) return true;
  if (!card.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  return true;
}
