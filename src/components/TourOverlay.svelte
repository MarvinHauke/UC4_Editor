<script lang="ts">
  // The first-run tour (plan 0012): the editor dims, the current area is lit with its number, and a card beside it holds the title,
  // the sentences, "n of 7" and Skip / Back / Next. The last step offers "Get your setups". Esc ends it, ← → page through,
  // Tab stays in the card, focus returns to where it was. The area texts come from the profile (uc4Tour.ts).
  import { tick } from 'svelte';
  import type { Tour } from '../app/tour.svelte.ts';
  import { matchKey } from '../app/keyTable.ts';
  import { placeCard, type Box } from '../app/tour.ts';

  let { tour, onget }: { tour: Tour; onget: () => void } = $props();
  const PAD = 4; // the lit box sits this far outside the area
  let card = $state<HTMLElement | null>(null);
  let cardW = $state(340);
  let cardH = $state(220);
  let view = $state({ width: 1024, height: 700 });
  let box = $state<Box | null>(null);
  let opener: HTMLElement | null = null;
  let wasOpen = false;

  function measure(): void {
    view = { width: window.innerWidth, height: window.innerHeight };
    const selector = tour.step.selector;
    const el = selector ? document.querySelector(selector) : null;
    if (!el) { box = null; return; }
    const r = el.getBoundingClientRect();
    box = { left: Math.max(0, r.left - PAD), top: Math.max(0, r.top - PAD), width: Math.min(window.innerWidth, r.right + PAD) - Math.max(0, r.left - PAD), height: Math.min(window.innerHeight, r.bottom + PAD) - Math.max(0, r.top - PAD) };
  }
  // Opening remembers the focus, every step measures its area and puts focus on the card's main button; closing hands focus back.
  $effect(() => {
    const open = tour.open;
    void tour.index;
    if (open) {
      if (!wasOpen) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      measure();
      void tick().then(() => { card?.querySelector<HTMLElement>('[data-main]')?.focus(); });
    }
    wasOpen = open;
  });
  // The area's size changes when the Connections column opens or closes: measure again.
  $effect(() => {
    const selector = tour.open ? tour.step.selector : null;
    const el = selector ? document.querySelector(selector) : null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { ro.disconnect(); };
  });
  const pos = $derived(placeCard(box, { width: cardW, height: cardH }, view));

  /** Ends the tour and gives focus back at once, so whatever starts next (the dump overlay) sees the right opener. */
  function finish(): void {
    tour.end();
    wasOpen = false;
    if (opener?.isConnected) opener.focus();
  }
  function get(): void { finish(); onget(); }
  function main(): void { if (tour.isLast) get(); else tour.next(); }

  function key(e: KeyboardEvent): void {
    if (!tour.open || e.defaultPrevented) return;
    const hit = matchKey(e, ['tourEnd', 'tourPage']);
    if (hit) {
      e.preventDefault(); e.stopPropagation();
      if (hit.id === 'tourEnd') finish();
      else if (hit.press.dir === 1) tour.next();
      else tour.back();
      return;
    }
    // Other keys stay with the card (Enter and Space press its buttons): nothing behind the dim reacts, such as Option-← stepping a group or Cmd-Z.
    if (e.key !== 'Tab') { e.stopPropagation(); return; }
    if (card) {
      const items = [...card.querySelectorAll<HTMLElement>('button:not(:disabled)')];
      const first = items[0], last = items.at(-1);
      if (!first || !last) return;
      if (!card.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
</script>

<svelte:window onkeydowncapture={key} onresize={measure} />

{#if tour.open}
  <div class="tour" class:dim={!box} data-tour>
    {#if box}
      <div class="lit" style:left="{box.left}px" style:top="{box.top}px" style:width="{box.width}px" style:height="{box.height}px" aria-hidden="true">
        <span class="n" class:below={box.top < 30}>{tour.index + 1}</span>
      </div>
    {/if}
    <div class="card" role="dialog" aria-modal="true" aria-labelledby="tour-title" bind:this={card} bind:offsetWidth={cardW} bind:offsetHeight={cardH}
      style:left="{pos.left}px" style:top="{pos.top}px">
      <p class="count" data-help="Step {tour.index + 1} of {tour.count}">{tour.index + 1} of {tour.count}</p>
      <h2 id="tour-title">{tour.step.title}</h2>
      {#each tour.step.sentences as s (s)}<p class="text">{s}</p>{/each}
      <div class="buttons">
        <button type="button" class="skip" data-help="{tour.isLast ? 'Close' : 'Skip'} the tour · Esc · Settings has a Tour button to see it again" onclick={finish}>{tour.isLast ? 'Close' : 'Skip'}</button>
        <button type="button" disabled={tour.index === 0} data-help="Back to the step before · ←" onclick={() => { tour.back(); }}>Back</button>
        <button type="button" class="go" data-main
          data-help={tour.isLast ? 'Get your setups: opens the guide for sending all setups from the UC4 · the editor sends nothing to the UC4' : 'Next step · →'}
          onclick={main}>{tour.isLast ? 'Get your setups' : 'Next'}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .tour { position: fixed; inset: 0; z-index: 20; }
  .tour.dim { background: rgb(0 0 0 / 60%); }
  /* The box lifts the dim over the area: its shadow is the dim everywhere else. */
  .lit { position: absolute; box-sizing: border-box; border: 2px solid var(--accent); border-radius: var(--radius); box-shadow: 0 0 0 100vmax rgb(0 0 0 / 60%); pointer-events: none; }
  .n { position: absolute; top: -26px; left: -2px; min-width: 22px; height: 22px; padding: 0 var(--space-1); box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; font-size: var(--text-md); font-weight: 700; color: var(--on-accent); background: var(--accent); border-radius: 11px; }
  .n.below { top: auto; bottom: -26px; }
  .card { position: absolute; box-sizing: border-box; width: 340px; max-width: calc(100vw - var(--space-4)); padding: var(--space-3) var(--space-4); color: var(--text); background: var(--surface-2); border: 2px solid var(--accent); border-radius: var(--radius); box-shadow: 0 8px 28px rgb(0 0 0 / 55%); }
  .count { margin: 0; font-size: var(--text-sm); color: var(--text-muted); }
  h2 { margin: 0 0 var(--space-2); font-size: var(--text-lg); }
  .text { margin: 0 0 var(--space-2); font-size: var(--text-md); line-height: 1.4; }
  .buttons { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-3); }
  .skip { margin-right: auto; }
  button { min-height: var(--target); padding: 3px var(--space-3); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover:not(:disabled) { background: var(--accent-soft); }
  button:disabled { color: var(--text-muted); cursor: not-allowed; }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .go { color: var(--on-accent); background: var(--accent); border-color: var(--accent); font-weight: 600; }
  .go:hover:not(:disabled) { background: var(--accent); filter: brightness(1.1); }
</style>
