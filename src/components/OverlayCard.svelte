<script lang="ts">
  // The window-wide card the tour and the welcome card share: the dim (or one lit box with its number), the card, focus on its main
  // button, Tab kept inside, and focus handed back where it was. The content is a snippet; the owner says which keys it takes.
  import { tick, type Snippet } from 'svelte';
  import { matchKey, type KeyId } from '../app/keyTable.ts';
  import { createOpener, trapTab } from '../app/overlay.ts';
  import { badgeSide, placeCard, BADGE, type Box } from '../app/tour.ts';

  interface Props {
    open: boolean;
    /** Changes when the content changes (a tour step): focus goes to the main button again. */
    step?: unknown;
    /** The area to light; null dims everything and centres the card. */
    box?: Box | null;
    /** The text in the lit box's number badge. */
    badge?: string;
    /** The badge needs this much room above the box counted from this y (the bottom of what lies above, e.g. the toolbar). */
    badgeFloor?: number;
    labelledby: string;
    wide?: boolean;
    /** The rows of the key table this card takes; `onkey` gets the one that matched. */
    keys?: readonly KeyId[];
    onkey?: (hit: NonNullable<ReturnType<typeof matchKey>>) => void;
    /** Marks the overlay for the browser checks (`data-overlay="tour"`, `data-overlay="welcome"`). */
    name: string;
    children: Snippet;
  }
  let { open, step, box = null, badge = '', badgeFloor = 0, labelledby, wide = false, keys = [], onkey, name, children }: Props = $props();

  let card = $state<HTMLElement | null>(null);
  let cardW = $state(340);
  let cardH = $state(220);
  let view = $state({ width: 1024, height: 700 });
  const opener = createOpener();
  let wasOpen = false;

  function measureView(): void { view = { width: window.innerWidth, height: window.innerHeight }; }
  $effect(() => {
    const isOpen = open;
    void step;
    if (isOpen) {
      if (!wasOpen) opener.remember();
      measureView();
      void tick().then(() => { card?.querySelector<HTMLElement>('[data-main]')?.focus(); });
    }
    wasOpen = isOpen;
  });
  const pos = $derived(box ? placeCard(box, { width: cardW, height: cardH }, view) : null);

  /** The owner closes the card and calls this at once, so whatever opens next sees the right opener. */
  export function release(): void { wasOpen = false; opener.restore(); }

  function key(e: KeyboardEvent): void {
    if (!open || e.defaultPrevented) return;
    const hit = keys.length > 0 ? matchKey(e, keys) : null;
    if (hit) { e.preventDefault(); e.stopPropagation(); onkey?.(hit); return; }
    // Other keys stay with the card (Enter and Space press its buttons): nothing behind the dim reacts, such as Option-← stepping a group or Cmd-Z.
    if (e.key !== 'Tab') { e.stopPropagation(); return; }
    if (card) trapTab(card, e);
  }
</script>

<svelte:window onkeydowncapture={key} onresize={measureView} />

{#if open}
  <div class="overlay" class:dim={!box} data-overlay={name}>
    {#if box}
      <div class="lit" style:left="{box.left}px" style:top="{box.top}px" style:width="{box.width}px" style:height="{box.height}px"
        style:--badge="{BADGE.size}px" style:--badge-inside="{BADGE.inside}px" style:--badge-gap="{BADGE.gap}px" aria-hidden="true">
        {#if badge}<span class="n {badgeSide(box, badgeFloor)}">{badge}</span>{/if}
      </div>
    {/if}
    <div class="ui-card card" class:wide class:centred={!box} role="dialog" aria-modal="true" aria-labelledby={labelledby} bind:this={card}
      bind:offsetWidth={cardW} bind:offsetHeight={cardH} style:left={pos ? `${pos.left}px` : undefined} style:top={pos ? `${pos.top}px` : undefined}>
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; z-index: 20; }
  .overlay.dim { background: rgb(0 0 0 / 60%); }
  /* The box lifts the dim over the area: its shadow is the dim everywhere else. */
  .lit { position: absolute; box-sizing: border-box; border: 2px solid var(--accent); border-radius: var(--radius); box-shadow: 0 0 0 100vmax rgb(0 0 0 / 60%); pointer-events: none; }
  .n { position: absolute; top: calc(-1 * (var(--badge) + var(--badge-gap))); left: -2px; min-width: var(--badge); height: var(--badge); padding: 0 var(--space-1); box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; font-size: var(--text-md); font-weight: 700; color: var(--on-accent); background: var(--accent); border-radius: calc(var(--badge) / 2); }
  /* A box at the window's top: the badge sits inside its corner, small enough to leave the title beside it readable. */
  .n.inside { top: var(--space-1); left: var(--space-1); min-width: var(--badge-inside); height: var(--badge-inside); padding: 0; font-size: var(--text-sm); border-radius: calc(var(--badge-inside) / 2); }
  .card { position: absolute; width: var(--card-w-step); max-width: calc(100vw - var(--space-4)); padding: var(--space-3) var(--space-4); }
  .card.wide { width: var(--card-w-wide); padding: var(--space-4); }
  .card.centred { left: 50%; top: 50%; transform: translate(-50%, -50%); }
</style>
