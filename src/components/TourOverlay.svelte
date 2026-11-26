<script lang="ts">
  // The first-run tour (plan 0012): the editor dims, the current area is lit with its number, and a card beside it holds the title,
  // the sentences, "n of 7" and Skip / Back / Next. The last step offers "Get your setups". Esc ends it, ← → page through.
  // The dim, card, focus trap and focus return are OverlayCard's. The area texts come from the profile (uc4Tour.ts).
  import type { Tour } from '../app/tour.svelte.ts';
  import type { DeviceProfile } from '../protocol/profile.ts';
  import { tourGetHelp } from '../app/profile/uc4Tour.ts';
  import { LIT_PAD, type Box } from '../app/tour.ts';
  import OverlayCard from './OverlayCard.svelte';

  let { tour, onget, profile }: { tour: Tour; onget: () => void; profile: Pick<DeviceProfile, 'deviceName'> } = $props();
  let overlay = $state<OverlayCard | null>(null);
  let box = $state<Box | null>(null);
  let toolbarBottom = $state(0);

  function measure(): void {
    const selector = tour.step.selector;
    const el = selector ? document.querySelector(selector) : null;
    if (!el) { box = null; return; }
    const r = el.getBoundingClientRect();
    toolbarBottom = document.querySelector('header.top')?.getBoundingClientRect().bottom ?? 0;
    const left = Math.max(0, r.left - LIT_PAD), top = Math.max(0, r.top - LIT_PAD);
    box = { left, top, width: Math.min(window.innerWidth, r.right + LIT_PAD) - left, height: Math.min(window.innerHeight, r.bottom + LIT_PAD) - top };
  }
  $effect(() => { if (tour.open) { void tour.index; measure(); } });
  // The area's size changes when the Connections column opens or closes: measure again.
  $effect(() => {
    const selector = tour.open ? tour.step.selector : null;
    const el = selector ? document.querySelector(selector) : null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { ro.disconnect(); };
  });

  /** Ends the tour and gives focus back at once, so whatever starts next (the dump overlay) sees the right opener. */
  function finish(): void { tour.end(); overlay?.release(); }
  function get(): void { finish(); onget(); }
  function main(): void { if (tour.isLast) get(); else tour.next(); }
</script>

<svelte:window onresize={measure} />

<OverlayCard bind:this={overlay} open={tour.open} step={tour.index} {box} badge={String(tour.index + 1)} badgeFloor={toolbarBottom} labelledby="tour-title" name="tour"
  keys={['tourEnd', 'tourPage']} onkey={(hit) => { if (hit.id === 'tourEnd') finish(); else if (hit.press.dir === 1) tour.next(); else tour.back(); }}>
  <p class="count" data-help="Step {tour.index + 1} of {tour.count}">{tour.index + 1} of {tour.count}</p>
  <h2 id="tour-title">{tour.step.title}</h2>
  {#each tour.step.sentences as s (s)}<p class="text">{s}</p>{/each}
  <div class="buttons">
    <button type="button" class="skip" data-help="{tour.isLast ? 'Close' : 'Skip'} the tour · Esc · Settings has a Tour button to see it again" onclick={finish}>{tour.isLast ? 'Close' : 'Skip'}</button>
    <button type="button" disabled={tour.index === 0} data-help="Back to the step before · ←" onclick={() => { tour.back(); }}>Back</button>
    <button type="button" class="go" data-main data-help={tour.isLast ? tourGetHelp(profile.deviceName) : 'Next step · →'} onclick={main}>{tour.isLast ? 'Get your setups' : 'Next'}</button>
  </div>
</OverlayCard>

<style>
  .count { margin: 0; font-size: var(--text-sm); color: var(--text-muted); }
  h2 { margin: 0 0 var(--space-2); font-size: var(--text-lg); }
  .text { margin: 0 0 var(--space-2); font-size: var(--text-md); line-height: 1.4; }
  .buttons { display: flex; justify-content: flex-end; gap: var(--space-2); margin-top: var(--space-3); }
  .skip { margin-right: auto; }
</style>
