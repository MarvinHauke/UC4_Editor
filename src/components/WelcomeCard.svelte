<script lang="ts">
  // The welcome card (plan 0012 decision 8): the editor dims and a centred card offers the tour, the dump overlay or nothing.
  // Same dim and card look as the tour. Esc = Not now; Tab stays in the card; focus goes back where it was.
  import { tick } from 'svelte';
  import type { Welcome } from '../app/welcome.svelte.ts';

  let { welcome }: { welcome: Welcome } = $props();
  let card = $state<HTMLElement | null>(null);
  let opener: HTMLElement | null = null;
  let wasOpen = false;

  $effect(() => {
    const open = welcome.open;
    if (open && !wasOpen) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      void tick().then(() => { card?.querySelector<HTMLElement>('[data-main]')?.focus(); });
    }
    wasOpen = open;
  });

  function notNow(): void {
    welcome.dismiss();
    if (opener?.isConnected) opener.focus();
  }
  function key(e: KeyboardEvent): void {
    if (!welcome.open || e.defaultPrevented) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); notNow(); return; }
    // Other keys stay with the card (Enter and Space press its buttons): nothing behind the dim reacts.
    if (e.key !== 'Tab') { e.stopPropagation(); return; }
    if (!card) return;
    const items = [...card.querySelectorAll<HTMLElement>('button:not(:disabled)')];
    const first = items[0], last = items.at(-1);
    if (!first || !last) return;
    if (!card.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
</script>

<svelte:window onkeydowncapture={key} />

{#if welcome.open}
  <div class="backdrop" data-welcome>
    <div class="card" role="dialog" aria-modal="true" aria-labelledby="welcome-title" bind:this={card}>
      <h2 id="welcome-title">Welcome to the UC4 Editor</h2>
      <p class="text">Edit, back up and send the setups of your Faderfox UC4, in the browser.</p>
      <p class="text">Unofficial: not made or supported by Faderfox.</p>
      <div class="buttons">
        <button type="button" class="go" data-main data-help="Take the tour: a short walk through the six areas of the editor" onclick={() => { welcome.takeTour(); }}>Take the tour</button>
        <button type="button" data-help="Get my setups from the UC4: opens the steps for sending all setups from the UC4 · the editor sends nothing to the UC4" onclick={() => { welcome.getSetups(); }}>Get my setups from the UC4</button>
        <button type="button" data-help="Not now · Esc" onclick={notNow}>Not now</button>
      </div>
      <p class="hint">The tour is in Settings → Tour any time; the guide is behind the book icon.</p>
    </div>
  </div>
{/if}

<style>
  .backdrop { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; background: rgb(0 0 0 / 60%); }
  .card { box-sizing: border-box; width: 500px; max-width: calc(100vw - var(--space-4)); padding: var(--space-4); color: var(--text); background: var(--surface-2); border: 2px solid var(--accent); border-radius: var(--radius); box-shadow: 0 8px 28px rgb(0 0 0 / 55%); }
  h2 { margin: 0 0 var(--space-2); font-size: var(--text-lg); }
  .text { margin: 0 0 var(--space-2); font-size: var(--text-md); line-height: 1.4; }
  .buttons { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
  .hint { margin: var(--space-3) 0 0; font-size: var(--text-sm); color: var(--text-muted); line-height: 1.4; }
  button { min-height: var(--target); padding: 3px var(--space-3); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  button:hover { background: var(--accent-soft); }
  button:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .go { color: var(--on-accent); background: var(--accent); border-color: var(--accent); font-weight: 600; }
  .go:hover { background: var(--accent); filter: brightness(1.1); }
</style>
