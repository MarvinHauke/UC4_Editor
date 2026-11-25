<script lang="ts">
  // The key help (plan 0006 decision 41): a modal over the page, sections by area in two columns, key chips on the
  // left and the action on the right. It reads the same key table as the handlers. Esc and × close it.
  import { onMount, tick } from 'svelte';
  import { GUIDE_URL } from '../app/links';
  import { helpSections } from '../app/keyTable.ts';

  let { open, vim, onclose }: { open: boolean; vim: boolean; onclose: () => void } = $props();
  let dialog = $state<HTMLDialogElement | null>(null);
  let close = $state<HTMLButtonElement | null>(null);
  const sections = $derived(helpSections(vim));

  $effect(() => {
    if (open && dialog && !dialog.open) { dialog.showModal(); void tick().then(() => { close?.focus(); }); }
    else if (!open && dialog?.open) dialog.close();
  });
  onMount(() => () => { if (dialog?.open) dialog.close(); });
</script>

<dialog bind:this={dialog} oncancel={(e) => { e.preventDefault(); onclose(); }} aria-labelledby="keys-title" data-help="Keys: the main keys of the editor, by area · Esc closes it">
  <header>
    <h2 id="keys-title">Keys</h2>
    <button type="button" class="close" aria-label="Close the keys" title="Close" onclick={onclose}>✕</button>
  </header>
  <div class="cols">
    {#each sections as s (s.section)}
      <section>
        <h3>{s.title}</h3>
        <dl>
          {#each s.rows as r (r.id)}
            <dt>{#each r.chips as chip, i (i)}{#if chip === 'click'}<span class="word">click</span>{:else}<kbd>{chip}</kbd>{/if}{/each}</dt>
            <dd>{r.action}</dd>
          {/each}
        </dl>
      </section>
    {/each}
  </div>
  <p class="note">{vim ? 'Vim keys are on (Settings → Keys).' : 'Settings → Keys → Vim adds y and p.'}</p>
  <p class="note"><a href={GUIDE_URL} target="_blank" rel="noopener" data-help="User guide: opens in a new tab">User guide ↗</a></p>
</dialog>

<style>
  dialog {
    width: min(760px, calc(100vw - 2 * var(--space-4))); max-height: calc(100vh - 2 * var(--space-4)); overflow-y: auto; padding: var(--space-4);
    color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    scrollbar-width: thin; scrollbar-color: var(--border) transparent;
  }
  dialog::backdrop { background: rgb(0 0 0 / 45%); }
  header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3); }
  h2 { margin: 0; font-size: var(--text-lg); }
  .close { width: var(--target); min-height: var(--target); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; }
  .close:hover { background: var(--accent-soft); }
  .close:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .cols { columns: 2; column-gap: var(--space-4); }
  section { break-inside: avoid; margin-bottom: var(--space-3); }
  h3 { margin: 0 0 var(--space-1); font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); }
  dl { display: grid; grid-template-columns: 8.5rem 1fr; gap: var(--space-1) var(--space-3); margin: 0; align-items: start; }
  dt { display: flex; flex-wrap: wrap; gap: var(--space-1); }
  dd { margin: 0; font-size: var(--text-md); padding-top: 2px; }
  kbd {
    min-width: 22px; padding: 1px var(--space-2); text-align: center; font: var(--text-sm) var(--mono); color: var(--text);
    background: var(--surface-2); border: 1px solid var(--border); border-bottom-width: 2px; border-radius: var(--radius);
  }
  .word { align-self: center; font-size: var(--text-sm); color: var(--text-muted); }
  .note a { display: inline-flex; align-items: center; min-height: var(--target); padding: 3px var(--space-3); color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius); text-decoration: none; }
  .note a:hover { background: var(--accent-soft); }
  .note a:focus-visible { outline: none; border-color: var(--accent); box-shadow: var(--focus-ring); }
  .note { margin: var(--space-2) 0 0; font-size: var(--text-sm); color: var(--text-muted); }
  @media (max-width: 700px) { .cols { columns: 1; } }
</style>
