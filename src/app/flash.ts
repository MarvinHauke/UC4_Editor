// The visual answer to Copy and Paste (plan 0006 decision 36): a class set for one event, so the animation is plain CSS
// (tokens.css). The action restarts it when the same target flashes twice in a row; nothing changes the layout.

export interface Flash { kind: 'copy' | 'paste'; targets: readonly string[]; n: number }
export interface FlashParam { flash: Flash | null; target: string; svg?: boolean; ring?: boolean }

const CLASSES = ['flash-copy', 'flash-paste', 'flash-copy-svg', 'flash-paste-svg', 'flash-paste-ring'];

/** `use:flashOn={{ flash: copy.flash, target: 'setup:abc' }}`: flashes the node when the event names its target. */
export function flashOn(node: Element, param: FlashParam): { update: (p: FlashParam) => void; destroy: () => void } {
  let seen = param.flash?.n ?? 0; // a node created after the event doesn't flash
  const clear = (): void => { node.classList.remove(...CLASSES); };
  const end = (e: Event): void => { if (e.target === node) clear(); }; // a child's animation (the guide's fade) doesn't end ours
  node.addEventListener('animationend', end);
  return {
    update(p) {
      const f = p.flash;
      if (!f || f.n === seen) return;
      seen = f.n;
      if (!f.targets.includes(p.target)) return;
      clear();
      void node.getBoundingClientRect(); // restart the animation
      node.classList.add(p.svg ? `flash-${f.kind}-svg` : f.kind === 'paste' && p.ring ? 'flash-paste-ring' : `flash-${f.kind}`);
    },
    destroy() { node.removeEventListener('animationend', end); },
  };
}
